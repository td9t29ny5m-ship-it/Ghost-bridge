#!/usr/bin/env node
/*
 * Look at the game in headless Chromium (software WebGL).
 * Usage: npm run serve &  node tools/shot3d.js <outDir> <stage> [panel] [view]
 *   stage: new | early | mid | late | night
 *   panel: optional window to open (build, hall, buildings, quests, research, staff, world, store, builders, profile, awards)
 *   view:  wide (whole park) | close (zoom on the hall) | place (placement mode)
 */
const { chromium } = require('playwright');
const [OUT = '.', STAGE = 'new', PANEL = '', VIEW = ''] = process.argv.slice(2);
const URL = 'http://localhost:8765/index.html';

const { makeSave } = require('./demo-save.js');

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  if (STAGE !== 'new') await page.addInitScript(s => { localStorage.setItem('yum-empire-save-v1', s); }, JSON.stringify(makeSave(STAGE)));
  await page.goto(URL);
  await page.waitForTimeout(2000);
  while (await page.isVisible('#modal')) { await page.click('#modalActions button:last-child'); await page.waitForTimeout(300); }
  await page.evaluate(([stage, view]) => {
    if (!window.YumEmpire.use3d) return;
    World.setQuality(0);
    World.setQuality = () => {};
    if (stage === 'night') World.debug.setTime(0.75);
    const c = World.debug.cam;
    if (view === 'wide') { c.g.dist = 200; c.g.tx = 0; c.g.tz = 4; }
    if (view === 'close') { const h = YumEmpire.state.parks[0].b[0]; YumEmpire.select({ kind: 'b', u: h.u }, true); }
    if (view === 'place') YumEmpire.startPlacing(14);
  }, [STAGE, VIEW]);
  await page.waitForTimeout(STAGE === 'new' ? 9000 : 14000);
  if (PANEL) { await page.evaluate((p) => window.YumEmpire.openPanel(p), PANEL); await page.waitForTimeout(700); }
  const name = `${OUT}/v3-${STAGE}${PANEL ? '-' + PANEL : ''}${VIEW ? '-' + VIEW : ''}.png`;
  await page.screenshot({ path: name, timeout: 180000 });
  console.log(name, JSON.stringify(await page.evaluate(() => ({ use3d: YumEmpire.use3d, stats: YumEmpire.use3d ? World.debug.stats : null }))));
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n') : 'no errors');
  await browser.close();
})();
