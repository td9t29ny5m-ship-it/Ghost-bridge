'use strict'
// Tiny JSON-file database for license keys. One file, written atomically, readable only by the app user.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I to avoid typos
function newKey () {
  const bytes = crypto.randomBytes(12)
  let s = ''
  for (let i = 0; i < 12; i++) s += ALPHABET[bytes[i] % ALPHABET.length]
  return `GB-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`
}
const normKey = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

class Store {
  constructor (file) {
    this.file = file
    this.db = { licenses: {} }
    try { this.db = JSON.parse(fs.readFileSync(file, 'utf8')) } catch {}
    if (!this.db.licenses) this.db.licenses = {}
  }

  save () {
    const tmp = this.file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(this.db, null, 1), { mode: 0o600 })
    fs.renameSync(tmp, this.file)
  }

  list () { return Object.values(this.db.licenses).sort((a, b) => b.createdAt - a.createdAt) }
  get (id) { return this.db.licenses[id] || null }
  byKey (key) { const k = normKey(key); return k ? this.list().find(l => normKey(l.key) === k) || null : null }
  bySession (sid) { return this.list().find(l => l.stripe && l.stripe.sessionId === sid) || null }

  create (fields = {}) {
    const id = crypto.randomBytes(6).toString('hex')
    const lic = { id, key: newKey(), email: null, note: '', createdAt: Date.now(), expiresAt: null, revoked: false, stripe: null, ...fields }
    this.db.licenses[id] = lic
    this.save()
    return lic
  }

  update (id, patch) {
    const lic = this.db.licenses[id]
    if (!lic) return null
    Object.assign(lic, patch)
    this.save()
    return lic
  }
}

module.exports = { Store }
