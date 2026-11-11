#!/usr/bin/env node
/*
 * End-to-end smoke test: plays the game in a phone-sized headless browser and fails on any JS error.
 * Usage: serve www/ (e.g. `npm run serve`), then `node tools/playtest.js [url] [screenshotDir]`
 */
const { chromium, devices } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8765/index.html';
const SHOTS = process.argv[3] || '';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  };
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const page = await ctx.newPage();
  watch(page);
  const check = (cond, msg) => { if (!cond) errors.push('assert: ' + msg); };

  await page.goto(URL);
  await page.waitForTimeout(500);
  check(await page.isVisible('#modal'), 'welcome modal shown');
  await shot(page, '01-welcome');
  await page.click('#modalActions button');

  // Cook by hand
  for (let k = 0; k < 4; k++) { await page.click('.biz-icon'); await page.waitForTimeout(1100); }
  const afterTaps = await page.evaluate(() => YumEmpire.state);
  check(afterTaps.cash > 0, 'tapping earns cash');
  check(afterTaps.stats.taps === 4, 'taps counted');
  await shot(page, '02-tapped');

  // Buy businesses
  await page.evaluate(() => { YumEmpire.state.cash = 5e6; });
  for (let k = 0; k < 3; k++) await page.click('#buyMode'); // "Next" milestone mode
  for (let k = 0; k < 3; k++) await page.click('.biz:nth-child(1) .buy');
  await page.click('.biz:nth-child(2) .buy');
  await page.click('.biz:nth-child(2) .buy');
  await page.click('.biz:nth-child(3) .buy');
  const lv = await page.evaluate(() => YumEmpire.state.biz.map(b => b.level));
  check(lv[0] === 100 && lv[1] === 50 && lv[2] === 25, 'buy modes work: ' + lv.join(','));

  // Managers
  await page.click('[data-tab=managers]');
  await page.waitForTimeout(300);
  await shot(page, '03-managers');
  for (let k = 0; k < 3; k++) {
    const b = await page.$('#mgrList button:not([disabled])'); // list re-renders after each hire
    if (b) await b.click();
  }
  check((await page.evaluate(() => YumEmpire.state.biz.filter(b => b.manager).length)) >= 2, 'managers hired');

  // Upgrades
  await page.click('[data-tab=upgrades]');
  await page.waitForTimeout(300);
  await shot(page, '04-upgrades');
  const ub = await page.$('#upgList button:not([disabled])');
  if (ub) await ub.click();
  check((await page.evaluate(() => Object.keys(YumEmpire.state.upgrades).length)) >= 1, 'upgrade bought');

  await page.click('[data-tab=biz]');
  await page.waitForTimeout(2500);
  await shot(page, '05-biz');

  // VIP customer
  const before = await page.evaluate(() => YumEmpire.state.stats.golden);
  await page.evaluate(() => { const v = document.getElementById('vip'); v.hidden = false; v.style.left = '120px'; v.style.top = '300px'; });
  await page.click('#vip', { force: true }); // it bobs constantly, so never "stable"
  check((await page.evaluate(() => YumEmpire.state.stats.golden)) === before + 1, 'VIP served');

  // Franchise
  await page.evaluate(() => { YumEmpire.state.lifetime = 5e12; });
  await page.click('[data-tab=franchise]');
  await page.waitForTimeout(500);
  await shot(page, '06-franchise');
  await page.click('#prestigeBtn');
  await page.waitForTimeout(300);
  await shot(page, '07-prestige-modal');
  await page.click('#modalActions button');
  await page.waitForTimeout(300);
  const ps = await page.evaluate(() => YumEmpire.state);
  check(ps.prestiges === 1 && ps.stars > 0 && ps.biz[1].level === 0, 'franchise resets & grants stars');

  // Boost via (demo) rewarded ad
  await page.click('#boostBtn');
  await page.waitForTimeout(3600);
  check(await page.evaluate(() => YumEmpire.state.boostUntil > Date.now()), 'boost applied');

  // More tab + daily reward
  await page.click('[data-tab=more]');
  await page.waitForTimeout(500);
  await shot(page, '08-daily');
  if (await page.isVisible('#modal')) { await page.click('#modalActions button'); await page.waitForTimeout(300); }
  check(await page.evaluate(() => YumEmpire.state.daily.streak === 1), 'daily claimed');
  await shot(page, '09-more');

  // Offline earnings after "2 hours away"
  await page.evaluate(() => {
    YumEmpire.state.biz[0].level = 50; YumEmpire.state.biz[0].manager = true;
    YumEmpire.save();
    const k = 'yum-empire-save-v1';
    const s = JSON.parse(localStorage.getItem(k));
    s.lastSeen = Date.now() - 2 * 3600e3;
    localStorage.setItem(k, JSON.stringify(s));
  });
  const p2 = await ctx.newPage();
  watch(p2);
  // Close the first page without letting its pagehide save overwrite our edited lastSeen
  await page.evaluate(() => { localStorage.setItem('__keep', localStorage.getItem('yum-empire-save-v1')); });
  await page.close();
  await p2.goto(URL.replace(/index\.html$/, '') + 'privacy.html');
  await p2.evaluate(() => localStorage.setItem('yum-empire-save-v1', localStorage.getItem('__keep')));
  await p2.goto(URL);
  await p2.waitForTimeout(800);
  await shot(p2, '10-offline');
  check((await p2.textContent('#modalTitle')) === 'Welcome back!', 'offline modal shown');
  const cashBefore = await p2.evaluate(() => YumEmpire.state.cash);
  await p2.click('#modalActions button:nth-child(2)');
  check((await p2.evaluate(() => YumEmpire.state.cash)) > cashBefore, 'offline cash collected');
  check((await p2.evaluate(() => YumEmpire.state.prestiges)) === 1, 'save persisted');

  await browser.close();
  if (errors.length) { console.error('FAIL\n' + errors.join('\n')); process.exit(1); }
  console.log('PASS — playtest completed with no errors');
})();
