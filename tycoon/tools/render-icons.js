#!/usr/bin/env node
// Renders www/icons/icon.svg to the PNGs needed by the PWA and by `npx capacitor-assets generate`.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'www/icons/icon.svg'), 'utf8');
const svgUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

const jobs = [
  { out: 'www/icons/icon-192.png', w: 192, h: 192 },
  { out: 'www/icons/icon-512.png', w: 512, h: 512 },
  { out: 'assets/icon-only.png', w: 1024, h: 1024 },
  { out: 'assets/icon-foreground.png', w: 1024, h: 1024, fg: true },
  { out: 'assets/icon-background.png', w: 1024, h: 1024, bgOnly: true },
  { out: 'assets/splash.png', w: 2732, h: 2732, splash: true },
  { out: 'assets/splash-dark.png', w: 2732, h: 2732, splash: true },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const j of jobs) {
    await page.setViewportSize({ width: j.w, height: j.h });
    let html;
    const bg = 'radial-gradient(circle at 50% 30%, #5a33b8, #1b1236 80%)';
    if (j.bgOnly) html = `<div style="width:100%;height:100%;background:${bg}"></div>`;
    else if (j.fg) html = `<div style="width:100%;height:100%;display:grid;place-items:center"><img src="${svgUri}" style="width:62%;border-radius:22%"></div>`;
    else if (j.splash) html = `<div style="width:100%;height:100%;background:#1b1236;display:grid;place-items:center">
        <div style="text-align:center;font:900 140px -apple-system,Segoe UI,Roboto,sans-serif;color:#fff7ec">
        <img src="${svgUri}" style="width:620px;border-radius:120px;box-shadow:0 30px 80px rgba(0,0,0,.4)"><div style="margin-top:60px">Yum Empire</div></div></div>`;
    else html = `<img src="${svgUri}" style="width:100%;height:100%;display:block">`;
    await page.setContent(`<html><body style="margin:0;width:${j.w}px;height:${j.h}px;overflow:hidden;background:transparent">${html}</body></html>`);
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(root, j.out), omitBackground: !!j.fg });
    console.log('wrote', j.out);
  }
  await browser.close();
})();
