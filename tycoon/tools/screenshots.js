#!/usr/bin/env node
/*
 * Store screenshots at App Store / Google Play sizes, from the running web build.
 * Usage: npm run serve (another terminal), then: node tools/screenshots.js [url] [onlyFolder]
 * Slow: the 3D park is rendered in software. Run one folder per process to go in parallel.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { makeSave } = require('./demo-save.js');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const ONLY = process.argv[3] || '';
const OUT = path.join(__dirname, '..', 'store', 'screenshots');
const TARGETS = [
  { dir: 'ios-6.9', width: 440, height: 956, scale: 3 },        // 1320×2868
  { dir: 'ios-ipad-13', width: 1032, height: 1376, scale: 2 },  // 2064×2752
  { dir: 'android-phone', width: 360, height: 640, scale: 3 },  // 1080×1920
];
// stage, camera [x, z, distance] or a view, time of day, window
const SCENES = [
  { name: '1-park', stage: 'late', cam: [0, 0, 150], time: 0.25 },
  { name: '2-street-food', stage: 'mid', cam: [0, 4, 80], time: 0.3 },
  { name: '3-night', stage: 'late', cam: [0, 0, 130], time: 0.75 },
  { name: '4-farms', stage: 'mid', cam: [0, -30, 90], time: 0.3 },
  { name: '5-staff', stage: 'mid', cam: [0, 4, 100], time: 0.3, panel: 'staff' },
  { name: '6-report', stage: 'mid', cam: [0, 4, 100], time: 0.3, panel: 'report' },
];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const t of TARGETS) {
    if (ONLY && t.dir !== ONLY) continue;
    fs.mkdirSync(path.join(OUT, t.dir), { recursive: true });
    for (const sc of SCENES) {
      const ctx = await browser.newContext({ viewport: { width: t.width, height: t.height }, deviceScaleFactor: t.scale, hasTouch: true, isMobile: t.dir !== 'ios-ipad-13' });
      const page = await ctx.newPage();
      await page.addInitScript(s => { localStorage.setItem('yum-empire-save-v1', s); }, JSON.stringify(makeSave(sc.stage)));
      await page.goto(URL);
      await page.waitForTimeout(2000);
      while (await page.isVisible('#modal')) { await page.click('#modalActions button:last-child'); await page.waitForTimeout(300); }
      await page.evaluate((s) => {
        World.setQuality(0); World.setQuality = () => {};
        World.debug.setTime(s.time);
        const c = World.debug.cam;
        c.g.tx = c.tx = s.cam[0]; c.g.tz = c.tz = s.cam[1]; c.g.dist = c.dist = s.cam[2];
      }, sc);
      await page.waitForTimeout(16000);
      if (sc.panel) { await page.evaluate((p) => YumEmpire.openPanel(p), sc.panel); await page.waitForTimeout(800); }
      await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
      await page.screenshot({ path: path.join(OUT, t.dir, sc.name + '.png'), timeout: 180000 });
      await ctx.close();
    }
    console.log('wrote', t.dir);
  }
  await browser.close();
})();
