'use strict'
// One Bridge per customer: their own Xbox host account, relay port, schematics folder and Friends-list world.
const dns = require('dns')
const net = require('net')
const fs = require('fs')
const path = require('path')
const bedrock = require('bedrock-protocol')
const { Authflow, Titles } = require('prismarine-auth')
const { createGhost, defaultVersion } = require('../ghost')

// ---------- destination safety (don't let this become an open proxy into private networks) ----------
const PRIVATE = new net.BlockList()
for (const [a, p] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16], ['100.64.0.0', 10], ['0.0.0.0', 8]]) PRIVATE.addSubnet(a, p, 'ipv4')
PRIVATE.addSubnet('fc00::', 7, 'ipv6'); PRIVATE.addSubnet('fe80::', 10, 'ipv6'); PRIVATE.addAddress('::1', 'ipv6')
async function checkDest (host, port) {
  if (!/^[a-z0-9.-]{1,253}$/i.test(host)) throw new Error('That does not look like a valid server address.')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be between 1 and 65535.')
  const addrs = await dns.promises.lookup(host, { all: true }).catch(() => { throw new Error("Couldn't find that server address.") })
  if (!process.env.ALLOW_PRIVATE && addrs.some(a => PRIVATE.check(a.address, a.family === 6 ? 'ipv6' : 'ipv4'))) throw new Error('Private/local addresses are not allowed.')
}

let publicHostCache = null
async function publicHost () {
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST
  if (publicHostCache) return publicHostCache
  try {
    const r = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(4000) })
    const t = (await r.text()).trim()
    if (net.isIP(t)) publicHostCache = t
  } catch {}
  return publicHostCache || 'this-server'
}

const MAX_SCHEMATICS = 25
const MAX_SCHEM_BYTES = 100 * 1024 * 1024

class Bridge {
  constructor ({ id, dir, ports }) {
    this.id = id
    this.ports = ports // { alloc(id) -> port|null, free(port) }
    this.schemDir = path.join(dir, 'schematics')
    this.profiles = path.join(dir, 'profiles')
    this.hostAuth = path.join(dir, 'host-auth')
    for (const d of [this.schemDir, this.profiles, this.hostAuth]) fs.mkdirSync(d, { recursive: true, mode: 0o700 })
    this.H = { status: 'signed_out', code: null, uri: null, gamertag: null, error: null }
    this.B = { status: 'stopped', host: null, port: null, since: null, error: null, portal: 'off', portalError: null, publicHost: null, publicPort: null }
    this.logs = []; this.feed = []
    this.playerCode = null; this.ghost = null; this.relay = null; this.portal = null; this.relayPort = null
    this.authflow = null; this.loginRunning = false; this.lastSeen = Date.now()
    if (fs.readdirSync(this.hostAuth).length) this.hostLogin() // cached tokens: sign in silently
  }

  log (m) { this.logs.push({ t: Date.now(), m: String(m) }); if (this.logs.length > 200) this.logs.shift(); console.log(`[${this.id}]`, m) }
  say (m) { this.feed.push({ t: Date.now(), m }); if (this.feed.length > 80) this.feed.shift() }

  getAuthflow () {
    if (!this.authflow) {
      this.authflow = new Authflow('host', this.hostAuth,
        { flow: 'live', authTitle: Titles.MinecraftNintendoSwitch, deviceType: 'Nintendo' },
        code => { this.H.status = 'signing_in'; this.H.code = code.user_code; this.H.uri = code.verification_uri; this.log('Xbox host sign-in code: ' + code.user_code) })
    }
    return this.authflow
  }

  async hostLogin () {
    if (this.loginRunning) return
    this.loginRunning = true; this.H.status = 'signing_in'; this.H.error = null
    try {
      const x = await this.getAuthflow().getXboxToken()
      this.H.status = 'ready'; this.H.code = null; this.H.uri = null
      this.H.gamertag = await fetch('https://profile.xboxlive.com/users/me/profile/settings?settings=Gamertag', {
        headers: { Authorization: `XBL3.0 x=${x.userHash};${x.XSTSToken}`, 'x-xbl-contract-version': '3', Accept: 'application/json' }
      }).then(r => r.json()).then(j => j.profileUsers[0].settings[0].value).catch(() => null)
      this.log('Xbox host account signed in' + (this.H.gamertag ? ': ' + this.H.gamertag : ''))
    } catch (e) { this.H.status = 'error'; this.H.error = e.message; this.log('Host sign-in failed: ' + e.message) }
    this.loginRunning = false
  }

  async hostLogout () {
    await this.stop()
    fs.rmSync(this.hostAuth, { recursive: true, force: true }); fs.mkdirSync(this.hostAuth, { recursive: true, mode: 0o700 })
    this.authflow = null
    this.H = { status: 'signed_out', code: null, uri: null, gamertag: null, error: null }
    this.log('Xbox host account removed.')
  }

  async stop (reason) {
    try { if (this.portal) await this.portal.end() } catch {}
    try { if (this.relay) this.relay.close() } catch {}
    if (this.relayPort != null) this.ports.free(this.relayPort)
    this.portal = null; this.relay = null; this.ghost = null; this.playerCode = null; this.relayPort = null
    const wasRunning = this.B.status !== 'stopped'
    Object.assign(this.B, { status: 'stopped', host: null, port: null, since: null, error: null, portal: 'off', portalError: null, publicPort: null })
    if (wasRunning && reason) this.log('Stopped: ' + reason)
  }

  // Validates and grabs a relay slot synchronously (so errors reach the user), then connects in the background.
  async start (host, port) {
    await checkDest(host, port)
    await this.stop()
    const rp = this.ports.alloc(this.id)
    if (rp == null) throw new Error('All relay slots are busy right now. Try again in a few minutes.')
    this.relayPort = rp; this.lastSeen = Date.now()
    Object.assign(this.B, { status: 'starting', host, port, error: null, publicPort: rp })
    this._run(host, port, rp).catch(e => this.log('Start failed: ' + e.message))
  }

  async _run (host, port, rp) {
    try {
      this.ghost = createGhost({ schemDir: this.schemDir, onSay: m => this.say(m), log: m => this.log(m) })
      this.relay = new bedrock.Relay({
        version: this.ghost.version, host: '0.0.0.0', port: rp, destination: { host, port },
        profilesFolder: this.profiles, motd: { motd: 'Ghost Proxy', levelName: host },
        onMsaCode: (code, ds) => { // first join: the player signs in once so the server sees their own account
          this.playerCode = { code: code.user_code, uri: code.verification_uri, at: Date.now() }
          this.log(`Player sign-in needed: ${code.user_code}`)
          ds.disconnect('First time here! Sign in at microsoft.com/link with code ' + code.user_code + ', then rejoin.')
        }
      })
      this.ghost.attach(this.relay)
      this.relay.on('join', ds => { this.playerCode = null; this.lastSeen = Date.now(); this.log(`${(ds.profile && ds.profile.name) || 'A player'} joined ${host}:${port}`) })
      this.relay.on('error', e => this.log('Relay error: ' + (e && e.message)))
      await Promise.resolve(this.relay.listen())
      this.B.status = 'running'; this.B.since = Date.now()
      this.log(`Relay up on UDP ${rp} -> ${host}:${port} (Minecraft ${this.ghost.version})`)
    } catch (e) {
      if (this.relayPort === rp) { this.ports.free(rp); this.relayPort = null }
      this.B.status = 'error'; this.B.error = e.message; this.log('Relay failed: ' + e.message); return
    }

    this.B.publicHost = await publicHost()
    if (this.H.status !== 'ready') { this.B.portal = 'off'; this.log('Friends-list world not started (host account not signed in). Add Server still works.'); return }
    this.B.portal = 'starting'; this.B.portalError = null
    try {
      const { BedrockPortal, Joinability, Modules } = require('bedrock-portal')
      this.portal = new BedrockPortal({
        ip: this.B.publicHost, port: rp, joinability: Joinability.FriendsOfFriends, host: this.getAuthflow(),
        world: { hostName: 'Ghost Proxy', name: host, version: this.ghost.version, memberCount: 0, maxMemberCount: 10 }
      })
      this.portal.use(Modules.AutoFriendAdd, { inviteOnAdd: true })
      await this.portal.start()
      this.B.portal = 'on'; this.log(`Friends-list world "Ghost Proxy" is live (points at ${this.B.publicHost}:${rp})`)
    } catch (e) { this.B.portal = 'error'; this.B.portalError = e.message; this.log('Friends-list session failed: ' + e.message) }
  }

  // True when the relay has had nobody connected for `ms`.
  idleFor (ms) {
    if (this.B.status === 'stopped') return false
    if (this.ghost && this.ghost.current()) { this.lastSeen = Date.now(); return false }
    return Date.now() - this.lastSeen > ms
  }

  files () {
    const re = /^[\w .()-]{1,80}\.(litematic|schem|schematic)$/i
    return fs.readdirSync(this.schemDir).filter(f => re.test(f)).map(f => ({ name: f, size: fs.statSync(path.join(this.schemDir, f)).size }))
  }

  saveSchematic (name, buf) {
    const files = this.files()
    const existing = files.find(f => f.name === name)
    if (!existing && files.length >= MAX_SCHEMATICS) throw new Error(`You can keep up to ${MAX_SCHEMATICS} schematics. Delete one first.`)
    const used = files.reduce((n, f) => n + (f.name === name ? 0 : f.size), 0)
    if (used + buf.length > MAX_SCHEM_BYTES) throw new Error('Storage full (100 MB). Delete some schematics first.')
    fs.writeFileSync(path.join(this.schemDir, name), buf)
  }

  async command (text) {
    if (!this.ghost || !this.ghost.current()) throw new Error('No player connected yet. Join the world from your console first.')
    await this.ghost.run(text)
  }

  deleteSchematic (name) { fs.rmSync(path.join(this.schemDir, name), { force: true }) }

  state () {
    const cur = this.ghost && this.ghost.current()
    return {
      host: this.H, bridge: this.B, relayPort: this.relayPort, version: this.ghost ? this.ghost.version : defaultVersion(),
      playerCode: this.playerCode, player: cur || null, files: this.files(), feed: this.feed.slice(-30), logs: this.logs.slice(-40)
    }
  }
}

module.exports = { Bridge, checkDest, publicHost }
