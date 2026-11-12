'use strict'
// Ghost Bridge (paid edition): every paying customer gets a license key, their own relay slot,
// their own Xbox host account and their own schematics. Payments run through Stripe Checkout;
// a key is issued automatically the moment the payment completes.
const express = require('express')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { Store } = require('./lib/store')
const { stripe } = require('./lib/stripe')
const { Bridge } = require('./lib/bridge')

const WEB_PORT = +process.env.PORT || 3000
const [PORT_LO, PORT_HI] = String(process.env.RELAY_PORTS || '19134-19143').split('-').map(Number)
const IDLE_MS = (+process.env.IDLE_MINUTES || 30) * 60000
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || ''
const DATA = path.join(__dirname, 'data')
fs.mkdirSync(path.join(DATA, 'users'), { recursive: true, mode: 0o700 })

let ADMIN = process.env.ADMIN_PASSWORD
if (!ADMIN) { ADMIN = crypto.randomBytes(5).toString('hex'); console.log(`\n  No ADMIN_PASSWORD set. Temporary admin password: ${ADMIN}\n`) }

// Payment link + billing portal ids written by `npm run setup-stripe`.
const stripeCfg = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'stripe.json'), 'utf8')) } catch { return {} } }
const BUY_URL = () => process.env.BUY_URL || stripeCfg().paymentLinkUrl || ''
const PRICE = process.env.PRICE_TEXT || stripeCfg().priceText || '$4.99 / month'

const store = new Store(path.join(DATA, 'licenses.json'))

// ---------- relay port pool: one UDP port per running customer ----------
const usedPorts = new Map()
const ports = {
  alloc (id) { for (let p = PORT_LO; p <= PORT_HI; p++) if (!usedPorts.has(p)) { usedPorts.set(p, id); return p } return null },
  free (p) { usedPorts.delete(p) }
}
const slotsTotal = PORT_HI - PORT_LO + 1

const bridges = new Map()
function bridgeFor (lic) {
  if (!bridges.has(lic.id)) bridges.set(lic.id, new Bridge({ id: lic.id, dir: path.join(DATA, 'users', lic.id), ports }))
  return bridges.get(lic.id)
}

// ---------- license checks ----------
const GOOD_SUB = new Set(['active', 'trialing', 'past_due'])
async function isActive (lic) {
  if (!lic || lic.revoked) return false
  if (lic.expiresAt && Date.now() > lic.expiresAt) return false
  const s = lic.stripe
  if (s && s.subscriptionId) {
    if (STRIPE_KEY && Date.now() - (s.checkedAt || 0) > 3 * 3600e3) {
      try {
        const sub = await stripe(STRIPE_KEY, 'GET', '/v1/subscriptions/' + s.subscriptionId)
        store.update(lic.id, { stripe: { ...s, status: sub.status, checkedAt: Date.now() } })
      } catch (e) { console.log('Subscription check failed (keeping last status):', e.message) }
    }
    return GOOD_SUB.has(lic.stripe.status)
  }
  return true
}
function whyInactive (lic) {
  if (lic.revoked) return 'This key has been disabled.'
  if (lic.expiresAt && Date.now() > lic.expiresAt) return 'This key has expired.'
  return 'Your subscription is not active. Renew to keep using Ghost Bridge.'
}

// ---------- web server ----------
const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 'loopback') // behind Caddy on the same machine
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }))

const sessions = new Map() // token -> { licId } | { admin: true }
const newToken = v => { const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, { ...v, at: Date.now() }); return t }
const attempts = new Map()
function limited (req, res) {
  const a = attempts.get(req.ip) || { n: 0, until: 0 }
  if (Date.now() < a.until) { res.status(429).json({ error: 'Too many tries. Wait a minute.' }); return true }
  return false
}
function failed (req) {
  const a = attempts.get(req.ip) || { n: 0, until: 0 }
  a.n++; if (a.n >= 6) { a.n = 0; a.until = Date.now() + 60000 }
  attempts.set(req.ip, a)
}
const tokenOf = req => (req.headers.authorization || '').replace(/^Bearer /, '')

const user = async (req, res, next) => {
  const s = sessions.get(tokenOf(req))
  const lic = s && s.licId && store.get(s.licId)
  if (!lic) return res.status(401).json({ error: 'Not signed in.' })
  if (!(await isActive(lic))) {
    const b = bridges.get(lic.id); if (b) b.stop('license inactive')
    return res.status(402).json({ error: whyInactive(lic), renew: BUY_URL() })
  }
  req.lic = lic; req.bridge = bridgeFor(lic); next()
}
const admin = (req, res, next) => {
  const s = sessions.get(tokenOf(req))
  return s && s.admin ? next() : res.status(401).json({ error: 'Not signed in.' })
}

const wrap = fn => (req, res) => Promise.resolve(fn(req, res)).catch(e => res.status(400).json({ error: e.message }))

// --- public ---
app.get('/api/public', (req, res) => {
  res.json({ price: PRICE, buyUrl: BUY_URL(), slotsTotal, slotsFree: slotsTotal - usedPorts.size, contact: process.env.CONTACT || '' })
})

app.post('/api/login', express.json(), wrap(async (req, res) => {
  if (limited(req, res)) return
  const lic = store.byKey(req.body && req.body.key)
  if (!lic) { failed(req); return res.status(401).json({ error: 'That key was not found. Check for typos.' }) }
  if (!(await isActive(lic))) return res.status(402).json({ error: whyInactive(lic), renew: BUY_URL() })
  attempts.delete(req.ip)
  res.json({ token: newToken({ licId: lic.id }) })
}))

// Stripe redirects buyers to /claim?session_id=cs_... — we verify the payment with Stripe and hand out the key.
app.post('/api/claim', express.json(), wrap(async (req, res) => {
  if (limited(req, res)) return
  const sid = String((req.body && req.body.session_id) || '')
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(sid)) { failed(req); return res.status(400).json({ error: 'Invalid checkout link.' }) }
  const existing = store.bySession(sid)
  if (existing) return res.json({ key: existing.key, token: newToken({ licId: existing.id }) })
  const s = await stripe(STRIPE_KEY, 'GET', '/v1/checkout/sessions/' + sid)
  if (s.status !== 'complete' || !['paid', 'no_payment_required'].includes(s.payment_status)) {
    return res.status(402).json({ error: 'This payment has not completed yet. Refresh in a few seconds.' })
  }
  const email = (s.customer_details && s.customer_details.email) || null
  const lic = store.create({
    email,
    note: 'Stripe checkout',
    expiresAt: s.mode === 'payment' ? Date.now() + (+process.env.ONE_TIME_DAYS || 30) * 86400e3 : null,
    stripe: { sessionId: sid, customerId: s.customer || null, subscriptionId: s.subscription || null, status: s.subscription ? 'active' : 'paid', checkedAt: Date.now() }
  })
  console.log(`New sale! License ${lic.key} for ${email || 'unknown email'}`)
  res.json({ key: lic.key, token: newToken({ licId: lic.id }) })
}))

// --- customer dashboard ---
app.get('/api/state', user, (req, res) => {
  const lic = req.lic
  res.json({ ...req.bridge.state(), account: { key: lic.key, email: lic.email, expiresAt: lic.expiresAt, billing: !!(lic.stripe && lic.stripe.customerId) }, slotsFree: slotsTotal - usedPorts.size })
})
app.post('/api/billing', user, wrap(async (req, res) => {
  const s = req.lic.stripe
  if (!s || !s.customerId) throw new Error('This key was not bought through Stripe.')
  const cfg = stripeCfg()
  const portal = await stripe(STRIPE_KEY, 'POST', '/v1/billing_portal/sessions', {
    customer: s.customerId, return_url: (process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`) + '/app', configuration: cfg.portalConfigId
  })
  res.json({ url: portal.url })
}))
app.post('/api/host/login', user, (req, res) => { req.bridge.hostLogin(); res.json({ ok: true }) })
app.post('/api/host/logout', user, wrap(async (req, res) => { await req.bridge.hostLogout(); res.json({ ok: true }) }))
app.post('/api/connect', user, express.json(), wrap(async (req, res) => {
  const host = String((req.body && req.body.host) || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const port = parseInt((req.body && req.body.port) || 19132, 10)
  await req.bridge.start(host, port)
  res.json({ ok: true })
}))
app.post('/api/disconnect', user, wrap(async (req, res) => { await req.bridge.stop(); res.json({ ok: true }) }))
app.post('/api/command', user, express.json(), wrap(async (req, res) => {
  await req.bridge.command(String((req.body && req.body.text) || '').slice(0, 200)); res.json({ ok: true })
}))
const FILE_RE = /^[\w .()-]{1,80}\.(litematic|schem|schematic)$/i
app.put('/api/schematics/:name', user, express.raw({ type: () => true, limit: '20mb' }), wrap(async (req, res) => {
  const name = path.basename(req.params.name)
  if (!FILE_RE.test(name)) throw new Error('Use a .litematic, .schem or .schematic file (simple file name).')
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw new Error('Empty upload.')
  req.bridge.saveSchematic(name, req.body); res.json({ files: req.bridge.files() })
}))
app.delete('/api/schematics/:name', user, (req, res) => {
  const name = path.basename(req.params.name)
  if (FILE_RE.test(name)) req.bridge.deleteSchematic(name)
  res.json({ files: req.bridge.files() })
})

// --- admin ---
app.post('/api/admin/login', express.json(), (req, res) => {
  if (limited(req, res)) return
  const given = Buffer.from(String((req.body && req.body.password) || '')); const real = Buffer.from(ADMIN)
  if (!(given.length === real.length && crypto.timingSafeEqual(given, real))) { failed(req); return res.status(401).json({ error: 'Wrong password.' }) }
  attempts.delete(req.ip)
  res.json({ token: newToken({ admin: true }) })
})
app.get('/api/admin/overview', admin, (req, res) => {
  const lics = store.list()
  const active = lics.filter(l => !l.revoked && (!l.expiresAt || l.expiresAt > Date.now()) && (!l.stripe || !l.stripe.subscriptionId || GOOD_SUB.has(l.stripe.status)))
  const paying = active.filter(l => l.stripe && l.stripe.subscriptionId)
  res.json({
    stripeReady: !!STRIPE_KEY && !!BUY_URL(), buyUrl: BUY_URL(), price: PRICE, slotsTotal, slotsUsed: usedPorts.size,
    counts: { total: lics.length, active: active.length, paying: paying.length },
    licenses: lics.map(l => {
      const b = bridges.get(l.id)
      return { ...l, running: b ? b.B.status : 'stopped', server: b && b.B.host ? `${b.B.host}:${b.B.port}` : null }
    })
  })
})
app.post('/api/admin/licenses', admin, express.json(), (req, res) => {
  const days = +(req.body && req.body.days) || 0
  const lic = store.create({ note: String((req.body && req.body.note) || '').slice(0, 200), email: (req.body && req.body.email) || null, expiresAt: days > 0 ? Date.now() + days * 86400e3 : null })
  res.json(lic)
})
app.post('/api/admin/licenses/:id/:action', admin, wrap(async (req, res) => {
  const lic = store.get(req.params.id); if (!lic) throw new Error('Not found.')
  const a = req.params.action
  if (a === 'revoke') { store.update(lic.id, { revoked: true }); const b = bridges.get(lic.id); if (b) await b.stop('revoked by admin') }
  else if (a === 'restore') store.update(lic.id, { revoked: false })
  else if (a === 'extend') store.update(lic.id, { expiresAt: Math.max(lic.expiresAt || Date.now(), Date.now()) + 30 * 86400e3 })
  else if (a === 'refresh' && lic.stripe) store.update(lic.id, { stripe: { ...lic.stripe, checkedAt: 0 } })
  else throw new Error('Unknown action.')
  res.json(store.get(lic.id))
}))

// ---------- housekeeping: free idle slots, stop expired customers, drop old sessions ----------
setInterval(async () => {
  for (const [id, b] of bridges) {
    const lic = store.get(id)
    if (!(await isActive(lic))) await b.stop('license inactive')
    else if (b.idleFor(IDLE_MS)) await b.stop(`nobody connected for ${IDLE_MS / 60000} minutes (frees the slot for others)`)
  }
  for (const [t, s] of sessions) if (Date.now() - s.at > 14 * 86400e3) sessions.delete(t)
}, 60000).unref()

app.listen(WEB_PORT, () => console.log(`Ghost Bridge on http://0.0.0.0:${WEB_PORT}  (relay UDP ${PORT_LO}-${PORT_HI}, ${slotsTotal} slots, Stripe ${STRIPE_KEY ? 'on' : 'OFF'})`))
process.on('SIGINT', async () => { for (const b of bridges.values()) await b.stop(); process.exit(0) })
process.on('SIGTERM', async () => { for (const b of bridges.values()) await b.stop(); process.exit(0) })
