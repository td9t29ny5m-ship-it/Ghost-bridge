// Tiny property-list parser (XML and binary "bplist00"), no dependencies.

function parseXml (str) {
  const body = str.slice(str.indexOf('<plist'))
  const re = /<(\/?)([a-zA-Z]+)(\s[^>]*)?(\/?)>|([^<]+)/g
  const tokens = []
  let m
  while ((m = re.exec(body))) {
    if (m[5] !== undefined) { if (m[5].trim() || tokens.length) tokens.push({ text: m[5] }); continue }
    tokens.push({ close: !!m[1], tag: m[2], selfClose: !!m[4] })
  }
  let i = 0
  const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, '&')
  const textUntilClose = tag => {
    let s = ''
    while (i < tokens.length && !(tokens[i].close && tokens[i].tag === tag)) { if (tokens[i].text !== undefined) s += tokens[i].text; i++ }
    i++
    return decode(s)
  }
  const skipText = () => { while (i < tokens.length && tokens[i].text !== undefined) i++ }
  function value () {
    skipText()
    const t = tokens[i++]
    if (!t) return undefined
    if (t.selfClose) {
      if (t.tag === 'true') return true
      if (t.tag === 'false') return false
      if (t.tag === 'dict') return {}
      if (t.tag === 'array') return []
      if (t.tag === 'string') return ''
      return null
    }
    switch (t.tag) {
      case 'plist': { const v = value(); skipText(); i++; return v }
      case 'dict': {
        const o = {}
        for (;;) {
          skipText()
          const k = tokens[i]
          if (!k || (k.close && k.tag === 'dict')) { i++; return o }
          i++
          const key = k.selfClose ? '' : textUntilClose('key')
          o[key] = value()
        }
      }
      case 'array': {
        const a = []
        for (;;) {
          skipText()
          if (!tokens[i] || (tokens[i].close && tokens[i].tag === 'array')) { i++; return a }
          a.push(value())
        }
      }
      case 'string': return textUntilClose('string')
      case 'integer': return parseInt(textUntilClose('integer'), 10)
      case 'real': return parseFloat(textUntilClose('real'))
      case 'date': return new Date(textUntilClose('date').trim())
      case 'data': return Buffer.from(textUntilClose('data').replace(/\s+/g, ''), 'base64')
      case 'true': i++; return true
      case 'false': i++; return false
      default: textUntilClose(t.tag); return null
    }
  }
  return value()
}

function parseBinary (buf) {
  const t = buf.length - 32
  const offSize = buf[t + 6]; const refSize = buf[t + 7]
  const numObjects = Number(buf.readBigUInt64BE(t + 8))
  const top = Number(buf.readBigUInt64BE(t + 16))
  const tableOff = Number(buf.readBigUInt64BE(t + 24))
  const readUInt = (pos, n) => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + buf[pos + k]; return v }
  const offsets = []
  for (let k = 0; k < numObjects; k++) offsets.push(readUInt(tableOff + k * offSize, offSize))
  const depth = new Set()
  function obj (ref) {
    if (depth.has(ref)) throw new Error('Cyclic plist')
    depth.add(ref)
    try { return parseObj(offsets[ref]) } finally { depth.delete(ref) }
  }
  function lenAt (pos) {
    const info = buf[pos] & 0x0f
    if (info !== 0x0f) return [info, pos + 1]
    const n = 1 << (buf[pos + 1] & 0x0f)
    return [readUInt(pos + 2, n), pos + 2 + n]
  }
  function parseObj (pos) {
    const marker = buf[pos]; const type = marker >> 4; const info = marker & 0x0f
    switch (type) {
      case 0x0: return info === 0x08 ? false : info === 0x09 ? true : null
      case 0x1: { const n = 1 << info; return n === 8 ? Number(buf.readBigInt64BE(pos + 1)) : readUInt(pos + 1, n) }
      case 0x2: return info === 2 ? buf.readFloatBE(pos + 1) : buf.readDoubleBE(pos + 1)
      case 0x3: return new Date((978307200 + buf.readDoubleBE(pos + 1)) * 1000)
      case 0x4: { const [len, s] = lenAt(pos); return buf.subarray(s, s + len) }
      case 0x5: { const [len, s] = lenAt(pos); return buf.toString('latin1', s, s + len) }
      case 0x6: { const [len, s] = lenAt(pos); const b = Buffer.from(buf.subarray(s, s + len * 2)); b.swap16(); return b.toString('utf16le') }
      case 0x8: return readUInt(pos + 1, info + 1)
      case 0xA: { const [len, s] = lenAt(pos); const a = []; for (let k = 0; k < len; k++) a.push(obj(readUInt(s + k * refSize, refSize))); return a }
      case 0xD: {
        const [len, s] = lenAt(pos); const o = {}
        for (let k = 0; k < len; k++) o[obj(readUInt(s + k * refSize, refSize))] = obj(readUInt(s + (len + k) * refSize, refSize))
        return o
      }
      default: return null
    }
  }
  return obj(top)
}

function parse (buf) {
  if (buf.subarray(0, 8).toString('latin1') === 'bplist00') return parseBinary(buf)
  return parseXml(buf.toString('utf8'))
}

module.exports = { parse }
