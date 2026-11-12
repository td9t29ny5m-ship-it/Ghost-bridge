#!/usr/bin/env node
/*
 * Quick look at the game in headless Chromium (software WebGL).
 * Usage: npm run serve &  node tools/shot3d.js <outDir> <stage> [panel] [wide]
 *   stage: new | suburb | town | city | metro | night
 *   panel: optional menu to open (quests, shops, staff, research, world, franchise, store, build, profile, awards)
 *   wide:  any value → zoom out to show the whole district
 */
const { chromium } = require('playwright');
const E = require('../www/js/engine.js');
const [OUT = '.', STAGE = 'new', PANEL = '', WIDE = ''] = process.argv.slice(2);
const URL = 'http://localhost:8765/index.html';

// Build a save for each stage with the real engine, so it is always valid.
function makeSave() {
  const s = E.newState(Date.now());
  const d = new Date();
  s.daily = { last: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, streak: 3 };
  s.settings.sound = false; s.settings.haptics = false;
  s.crateAt = Date.now() + 3 * 3600e3;
  if (STAGE === 'new') return s;
  const upto = { suburb: 0, town: 1, city: 2, metro: 3, night: 2 }[STAGE];
  s.cash = 1e60;
  const levels = [520, 330, 310, 210, 150, 120, 60, 30, 26, 12, 5, 1];
  for (let dd = 0; dd <= upto; dd++) {
    if (dd) E.unlockDistrict(s, dd);
    const n = E.DISTRICTS[dd].plots.length;
    for (let p = 0; p < n; p++) {
      if (dd === upto && p >= n - 2) { if (p === n - 2) E.buyLand(s, dd, p); continue; }   // leave one empty and one for sale
      E.buyLand(s, dd, p);
      for (let t = E.TYPES.length - 1; t >= 0; t--) if (E.canBuildOn(dd, p, t) && (t + p) % 3 !== 1 && E.build(s, dd, p, t)) break;
      const sh = E.shopAt(s, dd, p);
      if (sh) { sh.level = levels[p % levels.length]; sh.manager = true; sh.running = true; }
    }
  }
  for (let k = 0; k < 6; k++) { const m = E.recruit(s, Date.now() + k * 9 * 3600e3, [[0.1, 0.7, 0.93, 0.995, 0.3, 0.8][k], k * 0.17, k * 0.23]); if (k < 3) E.assignStaff(s, m.id, upto, k); }
  s.recruitAt = Date.now() + 5 * 3600e3;
  s.district = upto;
  s.cash = 8.42e6 * Math.pow(1e5, upto); s.gems = 185; s.stars = 48; s.level = 14; s.xp = 2100; s.lifetime = 6e13; s.runEarnings = 2e13;
  s.stats.taps = 300; s.stats.golden = 12;
  E.takeLevelUps(s); E.checkAchievements(s);
  return s;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  if (STAGE !== 'new') await page.addInitScript(s => { localStorage.setItem('yum-empire-save-v1', s); }, JSON.stringify(makeSave()));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  while (await page.isVisible('#modal')) { await page.click('#modalActions button:last-child'); await page.waitForTimeout(300); }
  await page.evaluate(([stage, wide]) => {
    if (!window.YumEmpire.use3d) return;
    World.setQuality(0);
    World.setQuality = () => {};            // keep full quality even though software GL is slow
    if (stage === 'night') World.debug.setTime(0.75);
    if (wide) { const c = World.debug.cam; c.g.dist = 170; c.g.tx = 0; c.g.tz = 4; }
  }, [STAGE, WIDE]);
  await page.waitForTimeout(STAGE === 'new' ? 8000 : 13000);   // let customers arrive (software rendering is slow)
  if (PANEL) { await page.evaluate((p) => window.YumEmpire.openPanel(p), PANEL); await page.waitForTimeout(600); }
  const name = `${OUT}/v2-${STAGE}${PANEL ? '-' + PANEL : ''}${WIDE ? '-wide' : ''}.png`;
  await page.screenshot({ path: name, timeout: 180000 });
  console.log(name, JSON.stringify(await page.evaluate(() => ({ use3d: YumEmpire.use3d, stats: YumEmpire.use3d ? World.debug.stats : null }))));
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 12).join('\n') : 'no errors');
  await browser.close();
})();
