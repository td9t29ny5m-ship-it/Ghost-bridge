// Minimal ZIP reader: lists entries and extracts single files without unpacking the whole archive.
// Enough for reading Info.plist / embedded.mobileprovision out of an .ipa (which is a ZIP file).
const fs = require('fs')
const zlib = require('zlib')

async function readAt (fh, pos, len) {
  const buf = Buffer.alloc(len)
  const { bytesRead } = await fh.read(buf, 0, len, pos)
  return buf.subarray(0, bytesRead)
}

async function listEntries (fh) {
  const { size } = await fh.stat()
  const tailLen = Math.min(size, 65557)
  const tail = await readAt(fh, size - tailLen, tailLen)
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  if (eocd < 0) throw new Error('Not a valid IPA/ZIP file.')
  let count = tail.readUInt16LE(eocd + 10)
  let cdSize = tail.readUInt32LE(eocd + 12)
  let cdOffset = tail.readUInt32LE(eocd + 16)
  // ZIP64
  const loc = eocd - 20
  if (loc >= 0 && tail.readUInt32LE(loc) === 0x07064b50) {
    const z64 = await readAt(fh, Number(tail.readBigUInt64LE(loc + 8)), 56)
    if (z64.readUInt32LE(0) === 0x06064b50) {
      count = Number(z64.readBigUInt64LE(32)); cdSize = Number(z64.readBigUInt64LE(40)); cdOffset = Number(z64.readBigUInt64LE(48))
    }
  }
  const cd = await readAt(fh, cdOffset, cdSize)
  const entries = []
  let p = 0
  for (let n = 0; n < count && p + 46 <= cd.length; n++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break
    const method = cd.readUInt16LE(p + 10)
    let compSize = cd.readUInt32LE(p + 20)
    let size = cd.readUInt32LE(p + 24)
    const nameLen = cd.readUInt16LE(p + 28); const extraLen = cd.readUInt16LE(p + 30); const commentLen = cd.readUInt16LE(p + 32)
    let offset = cd.readUInt32LE(p + 42)
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen)
    // ZIP64 extra field
    let e = p + 46 + nameLen; const eEnd = e + extraLen
    while (e + 4 <= eEnd) {
      const id = cd.readUInt16LE(e); const len = cd.readUInt16LE(e + 2); let q = e + 4
      if (id === 0x0001) {
        if (size === 0xFFFFFFFF) { size = Number(cd.readBigUInt64LE(q)); q += 8 }
        if (compSize === 0xFFFFFFFF) { compSize = Number(cd.readBigUInt64LE(q)); q += 8 }
        if (offset === 0xFFFFFFFF) { offset = Number(cd.readBigUInt64LE(q)) }
      }
      e += 4 + len
    }
    entries.push({ name, method, compSize, size, offset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function extract (fh, entry, maxBytes = 20 * 1024 * 1024) {
  if (entry.size > maxBytes) throw new Error('Entry too large: ' + entry.name)
  const lh = await readAt(fh, entry.offset, 30)
  if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('Corrupt ZIP entry: ' + entry.name)
  const start = entry.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28)
  const data = await readAt(fh, start, entry.compSize)
  if (entry.method === 0) return data
  if (entry.method === 8) return zlib.inflateRawSync(data)
  throw new Error('Unsupported compression method ' + entry.method)
}

async function openZip (file) {
  const fh = await fs.promises.open(file, 'r')
  try {
    const entries = await listEntries(fh)
    return { entries, extract: e => extract(fh, e), close: () => fh.close() }
  } catch (err) { await fh.close(); throw err }
}

module.exports = { openZip }
