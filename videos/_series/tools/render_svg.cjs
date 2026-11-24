const { chromium } = require('playwright'); const fs = require('fs');
const [src, out] = [process.argv[2], process.argv[3]];
const map = JSON.parse(process.argv[4]);
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 640, height: 640 } });
  for (const [name, code] of Object.entries(map)) {
    const svg = fs.readFileSync(`${src}/${code}.svg`, 'utf8');
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:640px;height:640px;display:flex;align-items:center;justify-content:center">${svg.replace('<svg', '<svg width="600" height="600"')}</div></body></html>`);
    await p.screenshot({ path: `${out}/${name}.png`, omitBackground: true }); }
  await b.close(); })();
