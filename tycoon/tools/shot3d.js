#!/usr/bin/env node
/*
 * Quick look at the 3D city in headless Chromium (software WebGL).
 * Usage: npm run serve &  node tools/shot3d.js <outDir> [stage]   stage: new | mid | late | night
 */
const { chromium } = require('playwright');
const OUT = process.argv[2] || '.';
const STAGE = process.argv[3] || 'new';
const URL = process.argv[4] || 'http://localhost:8765/index.html';

const LEVELS = {
  new: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  mid: [120, 60, 30, 26, 5, 0, 0, 0, 0, 0],
  late: [520, 330, 310, 210, 150, 110, 100, 60, 30, 25],
  night: [520, 330, 310, 210, 150, 110, 100, 60, 30, 25],
};

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const levels = LEVELS[STAGE];
  const save = {
    cash: STAGE === 'new' ? 0 : 5e6, runEarnings: 1e6, lifetime: 1e6, lastSeen: Date.now(),
    biz: levels.map((level, i) => ({ level, progress: 0, running: level > 0 && STAGE !== 'new', manager: level > 0 && STAGE !== 'new' })),
    daily: { last: today, streak: 1 }, stats: { taps: STAGE === 'new' ? 0 : 50 }, settings: { sound: false, haptics: false, buyMode: 0 },
  };
  await page.addInitScript(s => { localStorage.setItem('yum-empire-save-v1', s); }, JSON.stringify(save));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  if (await page.isVisible('#modal')) await page.click('#modalActions button:last-child');
  await page.evaluate((stage) => {
    World.setQuality(0);
    World.setQuality = () => {};            // keep full quality even though software GL is slow
    if (stage === 'night') World.debug.setTime(0.75);
  }, STAGE);
  // Let customers arrive and the camera settle (software rendering is slow, so wait in real time)
  await page.waitForTimeout(STAGE === 'new' ? 9000 : 14000);
  await page.screenshot({ path: `${OUT}/3d-${STAGE}.png` });
  if (STAGE !== 'new') {
    await page.evaluate(() => { World.debug.cam.g.dist = 150; World.debug.cam.g.tx = 0; World.debug.cam.g.tz = 0; });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${OUT}/3d-${STAGE}-wide.png` });
  }
  console.log(JSON.stringify(await page.evaluate(() => ({ use3d: YumEmpire.use3d, stats: World.debug.stats }))));
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n') : 'no errors');
  await browser.close();
})();
