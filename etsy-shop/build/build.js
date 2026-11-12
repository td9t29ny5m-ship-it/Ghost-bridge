'use strict'
// Renders every product to print-ready PDFs (US Letter + A4), Etsy listing images and listing copy.
// Usage: node build.js [slug-filter]
const { chromium } = require('playwright')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const K = require('./kit')
const products = require('./products')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'products')
const CACHE = path.join(ROOT, '.cache')
const SIZES = [{ id: 'US-Letter', fmt: 'Letter', w: 215.9, h: 279.4 }, { id: 'A4', fmt: 'A4', w: 210, h: 297 }]
const FONTS = '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&family=Montserrat:wght@400;500;600;700&family=Fredoka:wght@500;600&display=block" rel="stylesheet">'
const fileBase = p => p.name.replace(/[^A-Za-z0-9]+/g, '-')

function doc (p, pages, size) {
  return `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${K.CSS}
  @page{size:${size.w}mm ${size.h}mm;margin:0}
  :root{--w:${size.w}mm;--h:${size.h}mm;--accent:${p.accent};--tint:${p.tint};--head:'${p.head}',serif;--headw:${p.headw}}
  </style></head><body>${pages.map(x => x.html).join('')}</body></html>`
}

async function ready (page, fonts = ['Playfair Display', 'Montserrat']) {
  await page.evaluate(fs => Promise.all(fs.map(f => document.fonts.load(`600 12px "${f}"`))), fonts)
  await page.evaluate(() => document.fonts.ready)
  const missing = await page.evaluate(fs => fs.filter(f => !document.fonts.check(`600 12px "${f}"`)), fonts)
  if (missing.length) throw new Error('Fonts failed to load: ' + missing.join(', '))
}

// ---------- listing images (2400 x 1800, Etsy's recommended 4:3) ----------
const IMG_CSS = p => `*{margin:0;padding:0;box-sizing:border-box}
body{width:1200px;height:900px;overflow:hidden;font-family:Montserrat,sans-serif;color:#262626;background:linear-gradient(140deg,${p.tint} 0%,#fbfaf8 70%);position:relative}
.k{font-size:15px;letter-spacing:.35em;text-transform:uppercase;color:${p.accent};font-weight:600}
.t{font-family:'Playfair Display',serif;font-weight:600;font-size:66px;line-height:1.02;margin:18px 0 22px}
.s{font-size:19px;color:#555;line-height:1.6}
.pill{display:inline-block;background:${p.accent};color:#fff;font-weight:600;font-size:15px;letter-spacing:.14em;text-transform:uppercase;padding:11px 20px;border-radius:99px;margin:8px 8px 0 0}
.pill.o{background:#fff;color:${p.accent};border:2px solid ${p.accent}}
.pg{position:absolute;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.18),0 2px 6px rgba(0,0,0,.08);border-radius:4px}
.feat{list-style:none;font-size:22px;line-height:1.5}
.feat li{padding:14px 0 14px 46px;position:relative;border-bottom:1px solid rgba(0,0,0,.08)}
.feat li:before{content:'\\2713';position:absolute;left:0;top:12px;width:30px;height:30px;border-radius:50%;background:${p.accent};color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center}
.cap{font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:#555;text-align:center;margin-top:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`

function heroHtml (p, imgs, info) {
  const [a, b, c] = p.hero.map(i => imgs[Math.min(i, imgs.length - 1)])
  const W = 340; const Hh = Math.round(W * 279.4 / 215.9)
  return `<div style="position:absolute;left:70px;top:0;bottom:0;width:440px;display:flex;flex-direction:column;justify-content:center">
    <div class="k">Printable Planner</div><div class="t">${p.name}</div>
    <div class="s">${info.pages} pages${info.variantsText ? ' · ' + info.variantsText : ''}</div>
    <div style="margin-top:26px"><span class="pill">Instant Download</span><span class="pill o">Letter + A4</span></div></div>
    <img class="pg" src="${b}" style="width:${W}px;height:${Hh}px;left:560px;top:120px;transform:rotate(-7deg)">
    <img class="pg" src="${c}" style="width:${W}px;height:${Hh}px;left:820px;top:130px;transform:rotate(6deg)">
    <img class="pg" src="${a}" style="width:${W + 30}px;height:${Math.round((W + 30) * 279.4 / 215.9)}px;left:675px;top:${(900 - (W + 30) * 279.4 / 215.9) / 2}px">`
}

function insideHtml (p, imgs, titles) {
  let shown = imgs.map((src, i) => ({ src, t: titles[i] }))
  let extra = ''
  if (shown.length > 10) { extra = `+ ${shown.length - 9} more pages`; shown = shown.slice(0, 9) }
  const n = shown.length + (extra ? 1 : 0)
  const cols = n <= 4 ? n : n <= 6 ? 3 : n <= 8 ? 4 : 5
  const rows = Math.ceil(n / cols)
  const cellH = (900 - 190 - (rows - 1) * 26) / rows - 26
  const w = Math.min(cellH * 215.9 / 279.4, (1200 - 140 - (cols - 1) * 26) / cols)
  const h = w * 279.4 / 215.9
  const cells = shown.map(s => `<div style="width:${w}px"><img class="pg" src="${s.src}" style="position:static;width:${w}px;height:${h}px;display:block"><div class="cap">${s.t}</div></div>`)
  if (extra) cells.push(`<div style="width:${w}px;height:${h}px;display:flex;align-items:center;justify-content:center;border:2px dashed ${p.accent};border-radius:6px;color:${p.accent};font-weight:700;font-size:17px;text-align:center;padding:10px">${extra}</div>`)
  return `<div style="text-align:center;padding-top:44px"><div class="k">What’s Included</div><div class="t" style="font-size:44px;margin:10px 0 0">${imgs.length} Printable Pages</div></div>
   <div style="display:flex;flex-wrap:wrap;gap:26px;justify-content:center;padding:28px 70px 0">${cells.join('')}</div>`
}

function featuresHtml (p, imgs, info) {
  const src = imgs[p.hero[1]] || imgs[0]
  const W = 470; const Hh = W * 279.4 / 215.9
  return `<img class="pg" src="${src}" style="width:${W}px;height:${Hh}px;left:80px;top:${(900 - Hh) / 2}px">
  <div style="position:absolute;left:640px;right:70px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center">
   <div class="k">How It Works</div><div class="t" style="font-size:46px">Print &amp; Use Today</div>
   <ul class="feat"><li>Instant digital download</li><li>US Letter &amp; A4 sizes included</li>${info.variantsText ? `<li>${info.variantsText}</li>` : ''}<li>Print at home or at a print shop</li><li>Works in GoodNotes &amp; Notability</li><li>Print as many copies as you need</li></ul></div>`
}

function detailHtml (p, imgs) {
  const src = imgs[p.hero[0]] || imgs[0]
  const W = 1060
  return `<img class="pg" src="${src}" style="width:${W}px;height:${W * 279.4 / 215.9}px;left:70px;top:60px;border-radius:8px">
  <div style="position:absolute;left:0;right:0;bottom:0;height:260px;background:linear-gradient(to bottom,rgba(251,250,248,0),${p.tint} 75%)"></div>
  <div style="position:absolute;left:0;right:0;bottom:46px;text-align:center"><span class="pill">Clean, Minimal &amp; Ink-Friendly</span></div>`
}

async function shot (page, p, body, file) {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>${IMG_CSS(p)}</style></head><body>${body}</body></html>`, { waitUntil: 'networkidle' })
  await ready(page)
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 })
}

// ---------- listing copy ----------
function describe (p, titles, info) {
  const L = p.listing
  const uniq = [...new Set(titles.map(t => t.replace(/^Letter [A-Z]$/, 'A–Z Password Pages')))]
  return `${L.what}

★ INSTANT DOWNLOAD — this is a digital file, no physical item will be shipped.

WHAT’S INCLUDED (${info.pages} pages):
${uniq.map(t => '• ' + t).join('\n')}

FORMATS:
• US Letter (8.5 x 11 in) PDF
• A4 (210 x 297 mm) PDF${info.variantsText ? '\n• ' + info.variantsText : ''}

HOW IT WORKS:
1. Purchase and download your files from your Etsy account (Purchases & Reviews).
2. Print at home or at any print shop — or import into GoodNotes / Notability to use on a tablet.
3. Print as many copies as you need for personal use.
${L.gift ? '\n🎁 Makes a thoughtful last-minute gift — print it, slip it into a binder and it’s ready to give.\n' : ''}
PLEASE NOTE:
• Digital product — no physical item will be shipped.
• Colors may vary slightly between screens and printers.
• For personal use only. Please don’t resell or share the files.
• Because this is a digital download, returns aren’t accepted — but if anything is wrong with your files, message me and I’ll fix it right away.`
}

function checkListing (p) {
  const L = p.listing
  if (L.title.length > 140) throw new Error(`${p.slug}: title is ${L.title.length} chars (max 140)`)
  if (L.tags.length !== 13) throw new Error(`${p.slug}: needs 13 tags, has ${L.tags.length}`)
  for (const t of L.tags) if (t.length > 20) throw new Error(`${p.slug}: tag "${t}" is over 20 chars`)
  if (new Set(L.tags).size !== 13) throw new Error(`${p.slug}: duplicate tags`)
}

function listingMd (p, info, files, images, desc) {
  const L = p.listing
  return `## ${p.name}\n\n**Price:** $${L.price}\n\n**Title** (copy exactly):\n\`\`\`\n${L.title}\n\`\`\`\n\n**Tags** (13, paste one by one):\n\`\`\`\n${L.tags.join(', ')}\n\`\`\`\n\n**Photos** (upload in this order): ${images.map(f => '`' + f + '`').join(', ')}\n\n**Digital files** (upload all): ${files.map(f => '`' + f + '`').join(', ')}\n\n**Description** (copy exactly):\n\`\`\`\n${desc}\n\`\`\`\n`
}

async function main () {
  const filter = process.argv[2]
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(CACHE, { recursive: true })
  const browser = await chromium.launch()
  const pdfPage = await (await browser.newContext()).newPage()
  const shotCtx = await browser.newContext({ deviceScaleFactor: 2 })
  const shotPage = await shotCtx.newPage()
  const md = []
  const bundle = { covers: [], files: { 'US-Letter': [], A4: [] }, pages: 0 }

  for (const p of products) {
    if (filter && !p.slug.includes(filter)) continue
    checkListing(p)
    const dir = path.join(OUT, p.slug)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true }); fs.mkdirSync(path.join(dir, 'images'), { recursive: true })
    const variants = p.variants || [{ id: '', label: '', pages: p.pages }]
    const files = []
    for (const v of variants) {
      const pages = v.pages()
      for (const size of SIZES) {
        const name = `${fileBase(p)}${v.id ? '-' + v.label.replace(/\s+/g, '-') : ''}-${size.id}.pdf`
        await pdfPage.setContent(doc(p, pages, size), { waitUntil: 'networkidle' })
        await ready(pdfPage, [p.head, 'Montserrat'])
        await pdfPage.pdf({ path: path.join(dir, 'files', name), width: size.w + 'mm', height: size.h + 'mm', printBackground: true, preferCSSPageSize: true })
        files.push(name); bundle.files[size.id].push(path.join(dir, 'files', name))
      }
    }
    // Page thumbnails (US Letter, first variant) for the listing images.
    const pages = variants[0].pages()
    const titles = pages.map(x => x.title)
    await shotPage.setViewportSize({ width: 816, height: 1056 })
    await shotPage.setContent(doc(p, pages, SIZES[0]), { waitUntil: 'networkidle' })
    await ready(shotPage, [p.head, 'Montserrat'])
    const imgs = []
    const loc = shotPage.locator('section.page')
    for (let i = 0; i < pages.length; i++) {
      const buf = await loc.nth(i).screenshot({ type: 'jpeg', quality: 92 })
      imgs.push('data:image/jpeg;base64,' + buf.toString('base64'))
    }
    bundle.covers.push(imgs[p.hero[0]]); bundle.pages += pages.length

    const info = { pages: pages.length, variantsText: variants.length > 1 ? variants.map(v => v.label).join(' & ') + ' versions' : '' }
    const images = ['1-cover.jpg', '2-whats-included.jpg', '3-how-it-works.jpg', '4-detail.jpg']
    await shot(shotPage, p, heroHtml(p, imgs, info), path.join(dir, 'images', images[0]))
    await shot(shotPage, p, insideHtml(p, imgs, titles), path.join(dir, 'images', images[1]))
    await shot(shotPage, p, featuresHtml(p, imgs, info), path.join(dir, 'images', images[2]))
    await shot(shotPage, p, detailHtml(p, imgs), path.join(dir, 'images', images[3]))
    const desc = describe(p, titles, info)
    fs.writeFileSync(path.join(dir, 'listing.txt'), `TITLE:\n${p.listing.title}\n\nPRICE: $${p.listing.price}\n\nTAGS:\n${p.listing.tags.join(', ')}\n\nDESCRIPTION:\n${desc}\n`)
    md.push(listingMd(p, info, files, images, desc))
    console.log(`✓ ${p.name}: ${pages.length} pages, ${files.length} PDFs, ${images.length} images`)
  }

  if (!filter) {
    // ---------- 11th listing: everything bundle ----------
    const b = { slug: '11-everything-bundle', name: 'Everything Bundle', accent: '#4a4a4a', tint: '#efece6' }
    const dir = path.join(OUT, b.slug)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(path.join(dir, 'files'), { recursive: true }); fs.mkdirSync(path.join(dir, 'images'), { recursive: true })
    const zips = []
    for (const size of SIZES) {
      const z = `Printable-Planner-Bundle-${size.id}.zip`
      execFileSync('zip', ['-j', '-q', path.join(dir, 'files', z), ...bundle.files[size.id]])
      zips.push(z)
    }
    const total = products.reduce((a, p) => a + +p.listing.price, 0)
    const save = Math.floor(100 * (1 - 14.99 / total))
    const covers = bundle.covers.map((src, i) => `<img class="pg" src="${src}" style="position:static;width:170px;height:${170 * 279.4 / 215.9}px;display:block;transform:rotate(${[-3, 2, -1, 3, -2, 1, -3, 2, -1, 3][i]}deg)">`)
    await shot(shotPage, b, `<div style="text-align:center;padding-top:46px"><div class="k">10 Planners · ${bundle.pages}+ Pages</div><div class="t" style="font-size:54px;margin:12px 0 0">The Everything Bundle</div><div class="s">Save ${save}% vs buying separately · Letter + A4</div></div>
      <div style="display:flex;flex-wrap:wrap;gap:30px 34px;justify-content:center;padding:34px 80px 0">${covers.join('')}</div>`, path.join(dir, 'images', '1-cover.jpg'))
    const names = products.map(p => p.name)
    await shot(shotPage, b, `<div style="position:absolute;left:90px;right:90px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center"><div class="k">What’s Included</div><div class="t" style="font-size:48px">10 Printable Planners</div>
      <ul class="feat" style="columns:2;column-gap:60px">${names.map(n => `<li style="break-inside:avoid">${n}</li>`).join('')}</ul></div>`, path.join(dir, 'images', '2-whats-included.jpg'))
    const L = {
      title: 'Printable Planner Bundle, Budget Planner, Christmas Planner, 2027 Calendar, Meal Planner, Habit Tracker, Cleaning Schedule, Life Planner PDF',
      price: '14.99',
      tags: ['planner bundle', 'printable planner', 'life planner', 'home binder', 'budget planner', 'christmas planner', '2027 calendar', 'meal planner', 'habit tracker', 'cleaning schedule', 'family planner', 'household binder', 'planner printable']
    }
    checkListing({ slug: b.slug, listing: L })
    const desc = `Get all 10 of my printable planners in one bundle and save ${save}% (worth $${total.toFixed(2)} if bought separately).

★ INSTANT DOWNLOAD — this is a digital file, no physical item will be shipped.

WHAT’S INCLUDED (${bundle.pages}+ pages):
${names.map(n => '• ' + n).join('\n')}

FORMATS:
• Every planner in US Letter (8.5 x 11 in) AND A4 (210 x 297 mm)
• Delivered as two ZIP files (one per paper size) containing PDF files
• 2027 Calendar in Sunday-start and Monday-start versions

HOW IT WORKS:
1. Purchase and download your files from your Etsy account (Purchases & Reviews).
2. Unzip, then print at home or at any print shop — or import into GoodNotes / Notability.
3. Print as many copies as you need for personal use.

🎁 Perfect for building a complete home binder — or as a gift for someone starting fresh in the new year.

PLEASE NOTE:
• Digital product — no physical item will be shipped.
• Colors may vary slightly between screens and printers.
• For personal use only. Please don’t resell or share the files.
• Because this is a digital download, returns aren’t accepted — but if anything is wrong with your files, message me and I’ll fix it right away.`
    fs.writeFileSync(path.join(dir, 'listing.txt'), `TITLE:\n${L.title}\n\nPRICE: $${L.price}\n\nTAGS:\n${L.tags.join(', ')}\n\nDESCRIPTION:\n${desc}\n`)
    md.push(listingMd({ name: 'Everything Bundle (all 10)', listing: L }, {}, zips, ['1-cover.jpg', '2-whats-included.jpg'], desc))
    console.log('✓ Everything Bundle')
    fs.writeFileSync(path.join(ROOT, 'LISTINGS.md'), `# Etsy Listings — copy & paste\n\nEach section below is one Etsy listing. Files are in \`products/<folder>/files\`, photos in \`products/<folder>/images\`.\n\n${md.join('\n---\n\n')}`)
  }
  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
