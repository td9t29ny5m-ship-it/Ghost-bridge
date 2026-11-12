'use strict'
// Minimal Stripe REST client (no SDK needed). Params use Stripe's bracket syntax, e.g. { 'line_items[0][price]': 'price_123' }.
async function stripe (secret, method, endpoint, params) {
  if (!secret) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).')
  const opts = { method, headers: { Authorization: 'Bearer ' + secret }, signal: AbortSignal.timeout(15000) }
  let url = 'https://api.stripe.com' + endpoint
  if (params) {
    const body = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.append(k, String(v))
    if (method === 'GET') url += '?' + body
    else { opts.body = body; opts.headers['Content-Type'] = 'application/x-www-form-urlencoded' }
  }
  const r = await fetch(url, opts)
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j.error && j.error.message) || `Stripe error ${r.status}`)
  return j
}

module.exports = { stripe }
