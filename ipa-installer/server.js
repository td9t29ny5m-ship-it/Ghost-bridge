// IPA Installer: upload (or import by URL) .ipa files, then install them on an iPhone/iPad
// straight from Safari using Apple's over-the-air (itms-services) install flow.
// Zero npm dependencies. Node.js 20+.
const http = require('http')
const crypto = require('crypto')
const dns = require('dns')
const net = require('net')
const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream/promises')
const { Readable, Transform } = require('stream')
const { openZip } = require('./lib/zip')
const plist = require('./lib/plist')

const PORT = +process.env.PORT || 3080
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '')
const MAX_BYTES = (+process.env.MAX_MB || 4096) * 1024 * 1024
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data')
const APPS_DIR = path.join(DATA, 'apps')
const DB_FILE = path.join(DATA, 'apps.json')
fs.mkdirSync(APPS_DIR, { recursive: true })

let ADMIN = process.env.ADMIN_PASSWORD
if (!ADMIN) { ADMIN = crypto.randomBytes(5).toString('hex'); console.log(`\n  No ADMIN_PASSWORD set. Temporary password: ${ADMIN}\n`) }
const SECRET = crypto.createHash('sha256').update('ipa-installer:' + ADMIN).digest()

// ---------- storage ----------
let apps = []
try { apps = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) } catch {}
const save = () => { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(apps, null, 2)); fs.renameSync(DB_FILE + '.tmp', DB_FILE) }
const ipaPath = id => path.join(APPS_DIR, id + '.ipa')
const findApp = id => /^[a-f0-9]{32}$/.test(id) ? apps.find(a => a.id === id) : null

// ---------- auth (signed cookie) ----------
const sign = v => v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('base64url')
function authed (req) {
  const m = /(?:^|;\s*)ipa_session=([^;]+)/.exec(req.headers.cookie || '')
  if (!m) return false
  const [exp] = m[1].split('.')
  const good = sign(exp)
  return m[1].length === good.length && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(good)) && +exp > Date.now()
}
const loginFails = new Map()

// ---------- IPA inspection ----------
async function inspectIpa (file) {
  const zip = await openZip(file)
  try {
    const infoEntry = zip.entries.find(e => /^Payload\/[^/]+\.app\/Info\.plist$/.test(e.name))
    if (!infoEntry) throw new Error('This file has no Payload/*.app/Info.plist, so it is not a valid IPA.')
    const info = plist.parse(await zip.extract(infoEntry))
    if (!info || !info.CFBundleIdentifier) throw new Error('Info.plist is missing CFBundleIdentifier.')
    const meta = {
      name: info.CFBundleDisplayName || info.CFBundleName || info.CFBundleExecutable || 'App',
      bundleId: info.CFBundleIdentifier,
      version: String(info.CFBundleShortVersionString || info.CFBundleVersion || '1.0'),
      build: String(info.CFBundleVersion || ''),
      minOS: info.MinimumOSVersion || null,
      signing: { signed: false }
    }
    const appRoot = infoEntry.name.slice(0, infoEntry.name.length - 'Info.plist'.length)
    meta.signing.signed = zip.entries.some(e => e.name === appRoot + '_CodeSignature/CodeResources')
    const provEntry = zip.entries.find(e => e.name === appRoot + 'embedded.mobileprovision')
    if (provEntry) {
      const raw = (await zip.extract(provEntry)).toString('latin1')
      const s = raw.indexOf('<?xml'); const e = raw.indexOf('</plist>')
      if (s >= 0 && e > s) {
        const p = plist.parse(Buffer.from(raw.slice(s, e + 8), 'latin1'))
        const ent = p.Entitlements || {}
        meta.signing.profile = {
          name: p.Name || null,
          team: p.TeamName || null,
          expires: p.ExpirationDate ? new Date(p.ExpirationDate).toISOString() : null,
          type: p.ProvisionsAllDevices ? 'enterprise' : ent['get-task-allow'] ? 'development' : Array.isArray(p.ProvisionedDevices) ? 'ad-hoc' : 'app-store',
          devices: Array.isArray(p.ProvisionedDevices) ? p.ProvisionedDevices : []
        }
      }
    }
    // FairPlay-encrypted App Store dumps contain SC_Info; these cannot be installed this way.
    meta.signing.appStoreEncrypted = zip.entries.some(e => e.name.startsWith(appRoot + 'SC_Info/'))
    return meta
  } finally { await zip.close() }
}

// ---------- helpers ----------
function baseUrl (req) {
  if (PUBLIC_URL) return PUBLIC_URL
  const proto = String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').split(',')[0].trim()
  return proto + '://' + host
}
const xmlEsc = s => String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]))
const htmlEsc = xmlEsc
function send (res, code, body, type = 'application/json') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  res.end(buf)
}
async function readJson (req, limit = 64 * 1024) {
  let s = ''
  for await (const c of req) { s += c; if (s.length > limit) throw new Error('Request too large') }
  return s ? JSON.parse(s) : {}
}
function publicApp (a, base) {
  return {
    ...a,
    installUrl: 'itms-services://?action=download-manifest&url=' + encodeURIComponent(`${base}/d/${a.id}/manifest.plist`),
    downloadUrl: `${base}/d/${a.id}/${encodeURIComponent(a.fileName || 'app.ipa')}`,
    shareUrl: `${base}/i/${a.id}`
  }
}
const sizeGuard = () => {
  let n = 0
  return new Transform({ transform (chunk, _e, cb) { n += chunk.length; if (n > MAX_BYTES) cb(new Error(`File is larger than the ${MAX_BYTES / 1048576} MB limit.`)); else cb(null, chunk) } })
}

async function addFromStream (stream, fileName) {
  const id = crypto.randomBytes(16).toString('hex')
  const tmp = ipaPath(id) + '.part'
  try {
    await pipeline(stream, sizeGuard(), fs.createWriteStream(tmp))
    const meta = await inspectIpa(tmp)
    fs.renameSync(tmp, ipaPath(id))
    const app = { id, fileName: safeName(fileName), size: fs.statSync(ipaPath(id)).size, added: new Date().toISOString(), ...meta }
    apps.unshift(app); save()
    return app
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e }
}
const safeName = n => (String(n || 'app.ipa').split(/[\\/]/).pop().replace(/[^\w.\- ()]+/g, '_').slice(0, 120) || 'app.ipa').replace(/(\.ipa)?$/i, '.ipa')

// Block private-network URLs for "import from link" so the server can't be used to probe your LAN.
const PRIVATE = new net.BlockList()
for (const [a, p] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16], ['100.64.0.0', 10], ['0.0.0.0', 8]]) PRIVATE.addSubnet(a, p, 'ipv4')
PRIVATE.addSubnet('fc00::', 7, 'ipv6'); PRIVATE.addSubnet('fe80::', 10, 'ipv6'); PRIVATE.addAddress('::1', 'ipv6')
async function checkUrl (u) {
  let url
  try { url = new URL(u) } catch { throw new Error('That is not a valid link.') }
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) links are supported.')
  const addrs = await dns.promises.lookup(url.hostname, { all: true }).catch(() => { throw new Error("Couldn't resolve that host.") })
  if (!process.env.ALLOW_PRIVATE && addrs.some(a => PRIVATE.check(a.address, a.family === 6 ? 'ipv6' : 'ipv4'))) throw new Error('Links to private/local addresses are blocked.')
  return url
}
async function importUrl (u) {
  let url = await checkUrl(u)
  let res
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'IPA-Installer/1.0' } })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = await checkUrl(new URL(res.headers.get('location'), url).href); continue }
    break
  }
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`)
  if (+res.headers.get('content-length') > MAX_BYTES) throw new Error('File is larger than the size limit.')
  const cd = /filename\*?=(?:UTF-8'')?"?([^";]+)/i.exec(res.headers.get('content-disposition') || '')
  const name = cd ? decodeURIComponent(cd[1]) : decodeURIComponent(url.pathname.split('/').pop() || 'app.ipa')
  return addFromStream(Readable.fromWeb(res.body), name)
}

// Serve the IPA with Range support (iOS resumes downloads with Range requests).
function serveIpa (req, res, app) {
  const file = ipaPath(app.id)
  const size = fs.statSync(file).size
  const headers = { 'Content-Type': 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Content-Disposition': `attachment; filename="${app.fileName}"` }
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : size - +m[2]; let end = m[1] && m[2] ? +m[2] : size - 1
    if (start < 0) start = 0
    if (start >= size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end() }
    end = Math.min(end, size - 1)
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    if (req.method === 'HEAD') return res.end()
    return fs.createReadStream(file, { start, end }).pipe(res)
  }
  res.writeHead(200, { ...headers, 'Content-Length': size })
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(file).pipe(res)
}

function manifest (app, base) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key><string>software-package</string>
          <key>url</key><string>${xmlEsc(`${base}/d/${app.id}/${encodeURIComponent(app.fileName)}`)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${xmlEsc(app.bundleId)}</string>
        <key>bundle-version</key><string>${xmlEsc(app.version)}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>${xmlEsc(app.name)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`
}

function sharePage (app, base) {
  const a = publicApp(app, base)
  const tpl = fs.readFileSync(path.join(__dirname, 'public', 'share.html'), 'utf8')
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => htmlEsc({
    name: a.name, version: a.version, bundleId: a.bundleId, size: (a.size / 1048576).toFixed(1) + ' MB',
    installUrl: a.installUrl, downloadUrl: a.downloadUrl, initial: (a.name[0] || '?').toUpperCase(),
    https: base.startsWith('https://') ? '' : 'show'
  }[k] ?? ''))
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const p = url.pathname
  const base = baseUrl(req)
  try {
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
      return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html')), 'text/html')
    }

    // Public install endpoints (unguessable 128-bit ids; iOS fetches these without cookies)
    let m
    if ((m = /^\/d\/([a-f0-9]{32})\/manifest\.plist$/.exec(p))) {
      const app = findApp(m[1]); if (!app) return send(res, 404, 'Not found', 'text/plain')
      return send(res, 200, manifest(app, base), 'application/xml')
    }
    if ((m = /^\/d\/([a-f0-9]{32})\/[^/]+$/.exec(p)) && (req.method === 'GET' || req.method === 'HEAD')) {
      const app = findApp(m[1]); if (!app) return send(res, 404, 'Not found', 'text/plain')
      return serveIpa(req, res, app)
    }
    if ((m = /^\/i\/([a-f0-9]{32})$/.exec(p))) {
      const app = findApp(m[1]); if (!app) return send(res, 404, 'Not found', 'text/plain')
      return send(res, 200, sharePage(app, base), 'text/html')
    }

    // Auth
    if (p === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress
      const f = loginFails.get(ip) || { n: 0, until: 0 }
      if (f.until > Date.now()) return send(res, 429, { error: 'Too many attempts. Try again in a minute.' })
      const { password } = await readJson(req)
      const a = crypto.createHash('sha256').update(String(password || '')).digest()
      const b = crypto.createHash('sha256').update(ADMIN).digest()
      if (!crypto.timingSafeEqual(a, b)) {
        f.n++; if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60000 }
        loginFails.set(ip, f)
        return send(res, 401, { error: 'Wrong password.' })
      }
      loginFails.delete(ip)
      const secure = base.startsWith('https://') ? '; Secure' : ''
      res.setHeader('Set-Cookie', `ipa_session=${sign(String(Date.now() + 30 * 864e5))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${secure}`)
      return send(res, 200, { ok: true })
    }
    if (p === '/api/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', 'ipa_session=; Path=/; Max-Age=0')
      return send(res, 200, { ok: true })
    }
    if (p === '/api/session') return send(res, 200, { authed: authed(req), https: base.startsWith('https://'), base, maxMB: MAX_BYTES / 1048576 })

    if (p.startsWith('/api/')) {
      if (!authed(req)) return send(res, 401, { error: 'Please sign in.' })
      if (p === '/api/apps' && req.method === 'GET') return send(res, 200, apps.map(a => publicApp(a, base)))
      if (p === '/api/upload' && req.method === 'PUT') {
        const app = await addFromStream(req, url.searchParams.get('name'))
        return send(res, 200, publicApp(app, base))
      }
      if (p === '/api/import' && req.method === 'POST') {
        const { url: link } = await readJson(req)
        const app = await importUrl(String(link || '').trim())
        return send(res, 200, publicApp(app, base))
      }
      if ((m = /^\/api\/apps\/([a-f0-9]{32})$/.exec(p)) && req.method === 'DELETE') {
        const app = findApp(m[1]); if (!app) return send(res, 404, { error: 'Not found' })
        apps = apps.filter(a => a !== app); save()
        fs.rmSync(ipaPath(app.id), { force: true })
        return send(res, 200, { ok: true })
      }
    }
    send(res, 404, 'Not found', 'text/plain')
  } catch (e) {
    console.error('[ipa]', e.message)
    if (!res.headersSent) send(res, 400, { error: e.message })
    else res.destroy()
  }
})
server.requestTimeout = 0 // allow long uploads
server.listen(PORT, () => {
  console.log(`IPA Installer running on http://localhost:${PORT}`)
  if (!PUBLIC_URL) console.log('Tip: iOS only installs over HTTPS. Put this behind an HTTPS tunnel/proxy (see README).')
})
