'use strict'
// Building blocks for printable pages. Every block flexes to fill the page so the same
// layout works on US Letter and A4.

const cb = '<i class="cb"></i>'
const circ = '<i class="ci"></i>'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON3 = MONTHS.map(m => m.slice(0, 3))
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY3 = DAYS.map(d => d.slice(0, 3))

function header (kicker, title, fields = []) {
  const f = fields.length ? `<div class="fields">${fields.map(x => `<div>${x}<span></span></div>`).join('')}</div>` : ''
  return `<header><div><div class="kicker">${kicker}</div><h1>${title}</h1></div>${f}</header>`
}

// cols: [label, weight, type] where type 'check' draws a box, 'circle' a circle, 'mini' tiny centered header.
// opts.cell(r, i) prefills a cell; opts.foot adds a final labelled row.
function table (cols, rows, opts = {}) {
  const total = cols.reduce((a, c) => a + (c[1] || 1), 0)
  const colg = cols.map(c => `<col style="width:${(100 * (c[1] || 1) / total).toFixed(3)}%">`).join('')
  const cls = c => c[2] === 'check' || c[2] === 'circle' || c[2] === 'mini' ? 'c' : ''
  const th = cols.map(c => `<th class="${cls(c)}">${c[0]}</th>`).join('')
  let body = ''
  for (let r = 0; r < rows; r++) {
    body += '<tr>' + cols.map((c, i) => {
      const pre = opts.cell ? opts.cell(r, i) : null
      const inner = pre != null ? pre : c[2] === 'check' ? cb : c[2] === 'circle' ? circ : ''
      return `<td class="${cls(c)}${pre != null && i === 0 ? ' lab' : ''}">${inner}</td>`
    }).join('') + '</tr>'
  }
  if (opts.foot) body += `<tr class="foot"><td>${opts.foot}</td>${cols.slice(1).map(() => '<td></td>').join('')}</tr>`
  const t = `<table class="${opts.cls || ''}"><colgroup>${colg}</colgroup><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
  return opts.grow === false ? t : `<div class="grow"${opts.flex ? ` style="flex:${opts.flex}"` : ''}>${t}</div>`
}

const box = (title, inner, style = '') => `<div class="box" style="${style}"><div class="bt">${title}</div><div class="bb">${inner}</div></div>`
const lines = n => `<div class="lines">${'<div></div>'.repeat(n)}</div>`
const checks = (items, blanks = 0) => `<div class="checks">${[...items, ...Array(blanks).fill('')].map(t => `<div>${cb}<span>${t}</span></div>`).join('')}</div>`
const labelled = labels => `<div class="checks lbl">${labels.map(t => `<div><b>${t}</b><span></span></div>`).join('')}</div>`
const row = (items, style = '') => `<div class="row" style="${style}">${items.join('')}</div>`
const grid = (items, cols, style = '') => `<div class="gridbox" style="grid-template-columns:repeat(${cols},1fr);${style}">${items.join('')}</div>`

function monthGrid (y, m, monStart, mini = false) {
  const names = monStart ? DAYS : [DAYS[6], ...DAYS.slice(0, 6)]
  const first = new Date(y, m, 1).getDay()
  const offset = monStart ? (first + 6) % 7 : first
  const n = new Date(y, m + 1, 0).getDate()
  const weeks = Math.ceil((offset + n) / 7)
  let body = ''
  for (let w = 0; w < weeks; w++) {
    body += '<tr>'
    for (let d = 0; d < 7; d++) {
      const day = w * 7 + d - offset + 1
      body += day >= 1 && day <= n ? `<td><span class="dn">${day}</span></td>` : '<td class="off"></td>'
    }
    body += '</tr>'
  }
  const th = names.map(d => `<th class="c">${mini ? d[0] : d.slice(0, 3)}</th>`).join('')
  return `<table class="${mini ? 'mini' : 'cal'}"><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
}

// Blank month grid (no dates) for undated planners.
function blankMonth (monStart = false) {
  const names = monStart ? DAY3 : [DAY3[6], ...DAY3.slice(0, 6)]
  return `<table class="cal"><thead><tr>${names.map(d => `<th class="c">${d}</th>`).join('')}</tr></thead><tbody>${('<tr>' + '<td></td>'.repeat(7) + '</tr>').repeat(5)}</tbody></table>`
}

function cover (kicker, title, sub) {
  return `<div class="cover"><div class="ck">${kicker}</div><div class="crule"></div><h1 class="ct">${title}</h1><div class="cs">${sub}</div>
  <div class="cname"><div>Name<span></span></div><div>Year<span></span></div></div></div>`
}

function numbered (n, cols, shape = 'circle') {
  let s = ''
  for (let i = 1; i <= n; i++) s += `<div class="num ${shape}"><span>${i}</span></div>`
  return `<div class="nums" style="grid-template-columns:repeat(${cols},1fr)">${s}</div>`
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#fff}
body{font-family:'Montserrat',sans-serif;color:#2b2b2b;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:var(--w);height:var(--h);padding:13mm 12mm 11mm;display:flex;flex-direction:column;gap:4.5mm;break-after:page;overflow:hidden;background:#fff;position:relative}
.page:last-child{break-after:auto}
header{display:flex;align-items:flex-end;justify-content:space-between;gap:6mm;border-bottom:1.3pt solid var(--accent);padding-bottom:3mm;flex:none}
.kicker{font-size:7.2pt;letter-spacing:.32em;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:1mm}
h1{font-family:var(--head);font-weight:var(--headw);font-size:27pt;line-height:1.05;color:#262626}
.fields{display:flex;gap:5mm;font-size:6.8pt;letter-spacing:.16em;text-transform:uppercase;color:#7c7c7c;font-weight:600;padding-bottom:1mm;flex-wrap:wrap;justify-content:flex-end}
.fields span{display:inline-block;border-bottom:.6pt solid #b5b5b5;width:26mm;margin-left:2mm}
.grow{flex:1 1 0;min-height:0;display:flex;flex-direction:column}
table{width:100%;height:100%;border-collapse:collapse;table-layout:fixed}
th{background:var(--tint);font-size:6.6pt;letter-spacing:.13em;text-transform:uppercase;font-weight:600;padding:2mm 1.8mm;text-align:left;border:.6pt solid #c9c9c9;height:7mm;color:#333;white-space:nowrap;overflow:hidden}
td{border:.6pt solid #c9c9c9;font-size:8pt;padding:0 1.8mm;color:#444}
td.lab{font-size:7.4pt;font-weight:600;letter-spacing:.06em;color:#333}
.c{text-align:center;padding-left:0;padding-right:0}
tr.foot td{background:var(--tint);font-weight:600;font-size:7pt;letter-spacing:.13em;text-transform:uppercase;color:#333}
table.dense th{font-size:5.6pt;letter-spacing:0;padding:1mm 0}
table.dense td{padding:0}
.cb{display:inline-block;width:3mm;height:3mm;border:.7pt solid #8f8f8f;border-radius:.6mm;vertical-align:middle;flex:none}
.ci{display:inline-block;width:3.6mm;height:3.6mm;border:.7pt solid #8f8f8f;border-radius:50%;vertical-align:middle}
.box{border:.6pt solid #c9c9c9;border-radius:2.2mm;display:flex;flex-direction:column;overflow:hidden;min-height:0;min-width:0;flex:1 1 0}
.box>.bt{background:var(--tint);font-size:6.8pt;letter-spacing:.15em;text-transform:uppercase;font-weight:600;padding:1.9mm 3mm;flex:none;color:#333}
.box>.bb{flex:1;padding:.5mm 3mm 1.5mm;display:flex;flex-direction:column;min-height:0}
.box>.bb>.grow{margin:1.5mm -3mm -1.5mm}
.box table th,.box table td{border-left:none;border-right:none}
.box table tr:last-child td{border-bottom:none}
.lines{flex:1;display:flex;flex-direction:column;min-height:0}
.lines>div{flex:1;border-bottom:.6pt solid #d0d0d0;min-height:5mm}
.checks{flex:1;display:flex;flex-direction:column;min-height:0}
.checks>div{flex:1;display:flex;align-items:center;gap:2.5mm;border-bottom:.6pt solid #d0d0d0;font-size:8pt;min-height:5.4mm;color:#3a3a3a}
.checks>div:last-child{border-bottom:none}
.checks.lbl>div{gap:2mm}
.checks.lbl b{font-size:6.6pt;letter-spacing:.13em;text-transform:uppercase;font-weight:600;color:#666;white-space:nowrap}
.row{display:flex;gap:4.5mm;flex:1 1 0;min-height:0}
.gridbox{display:grid;gap:4.5mm;flex:1 1 0;min-height:0;grid-auto-rows:1fr}
table.cal th{text-align:center;height:8mm}
table.cal td{vertical-align:top;padding:1.4mm 1.8mm}
table.cal td.off{background:#f6f6f6}
.dn{font-size:9pt;font-weight:600;color:#333}
table.mini{height:auto}
table.mini th{font-size:7pt;padding:1.2mm 0;height:auto;letter-spacing:0;text-align:center;background:none;border:none;color:var(--accent)}
table.mini td{border:none;font-size:8.4pt;text-align:center;padding:1mm 0;color:#444}
table.mini td.off{background:none}
table.mini .dn{font-size:8.4pt;font-weight:500}
.nums{display:grid;gap:3mm;flex:1 1 0;min-height:0;grid-auto-rows:1fr}
.num{display:flex;align-items:center;justify-content:center;border:.8pt solid #9a9a9a;font-size:8pt;color:#777;font-weight:600;aspect-ratio:1;margin:auto;height:100%;max-height:100%}
.num.circle{border-radius:50%}
.num.square{border-radius:2mm}
.cover{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1pt solid var(--accent);border-radius:3mm;margin:6mm;outline:.6pt solid var(--accent);outline-offset:2.5mm}
.ck{font-size:8pt;letter-spacing:.45em;text-transform:uppercase;color:var(--accent);font-weight:600}
.crule{width:22mm;height:1.2pt;background:var(--accent);margin:6mm 0}
.ct{font-size:52pt;line-height:1;max-width:80%}
.cs{font-size:9pt;letter-spacing:.2em;text-transform:uppercase;color:#777;margin-top:7mm}
.cname{margin-top:28mm;display:flex;flex-direction:column;gap:8mm;font-size:7.5pt;letter-spacing:.2em;text-transform:uppercase;color:#777;font-weight:600}
.cname span{display:inline-block;border-bottom:.6pt solid #aaa;width:60mm;margin-left:3mm}
.note{font-size:7.4pt;color:#777;line-height:1.5;flex:none}
.big{font-family:var(--head);font-size:110pt;line-height:.9;color:var(--accent);font-weight:var(--headw)}
`

module.exports = { cb, circ, MONTHS, MON3, DAYS, DAY3, header, table, box, lines, checks, labelled, row, grid, monthGrid, blankMonth, cover, numbered, CSS }
