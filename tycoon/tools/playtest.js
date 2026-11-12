#!/usr/bin/env node
/*
 * End-to-end playtest: plays the business in a phone-sized headless browser (software WebGL)
 * through the tutorial and every major screen, and fails on any JS error or broken rule.
 * Usage: npm run serve (in another terminal), then `node tools/playtest.js [url] [screenshotDir]`
 */
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
const SHOTS = process.argv[3] || '';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  };
  const check = (cond, msg) => { if (!cond) errors.push('assert: ' + msg); else console.log('  ✓ ' + msg); };
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/pt-${name}.png`, timeout: 120000 }); };
  const page = await ctx.newPage();
  watch(page);
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(YumEmpire.state)));
  const run = (fn, arg) => page.evaluate(fn, arg);
  const closeModals = async () => { for (let k = 0; k < 8 && await page.isVisible('#modal'); k++) { await page.click('#modalActions button:last-child', { force: true }); await page.waitForTimeout(250); } };
  const click = (sel) => page.click(sel, { force: true });

  await page.goto(URL);
  await page.waitForFunction(() => window.YumEmpire && YumEmpire.state, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  check(await page.isVisible('#modal'), 'welcome shown');
  await closeModals();
  check(await run(() => YumEmpire.use3d), '3D started');
  await page.waitForTimeout(2500);

  // 1. Nothing sells until someone is hired
  let s = await S();
  check(s.workers.length === 0 && s.stats.dishes === 0, 'new game: no staff, no sales');
  check(await page.isVisible('#missionBar'), 'mission bar shown');
  check(await page.isVisible('#pointer'), 'tutorial arrow shown');
  await shot(page, '01-start');

  // 2. Tap the cart, tap its empty staff slot, hire a cook straight into it
  const cart = s.parks[0].b[0];
  const pos = await run((u) => World.buildingScreenPos(u), cart.u);
  check(pos && pos.on, 'cart on screen');
  if (pos) await page.mouse.click(pos.x, pos.y + 10);
  await page.waitForTimeout(400);
  if (!(await run(() => YumEmpire.sel))) await run((u) => YumEmpire.select({ kind: 'b', u }), cart.u);
  check(await page.isVisible('.slot.empty'), 'cart card shows an empty staff slot');
  await shot(page, '02-cart');
  await click('.slot.empty');
  await page.waitForTimeout(300);
  check((await run(() => YumEmpire.panel)) === 'staff', 'staff panel opens for the cart');
  await shot(page, '03-hire');
  await click('[data-act=hire]');
  await page.waitForTimeout(500);
  s = await S();
  check(s.workers.length === 1 && s.workers[0].at && s.workers[0].at.u === cart.u, 'cook hired and working at the cart');
  await page.waitForTimeout(4000);
  s = await S();
  check(s.stats.dishes > 0, `the cart sells by itself (${s.stats.dishes.toFixed(1)} dishes)`);

  // 3. Claim the first mission from the bar
  await click('#missionBar');
  await page.waitForTimeout(300);
  s = await S();
  check(s.mission === 1, 'mission 1 claimed');

  // 4. Build a wheat field through the Build menu, finish it, staff it
  await run(() => { YumEmpire.state.cash += 2000; YumEmpire.sync(); });
  await click('.nav [data-panel=build]');
  await click('[data-act=tab][data-tab=farm]');
  await shot(page, '04-build-farms');
  await click(`[data-act=pickBuild][data-t="${await run(() => Engine.ID.field)}"]`);
  await page.waitForTimeout(600);
  check(!!(await run(() => YumEmpire.placing)), 'placement mode');
  await click('[data-act=confirmPlace]');
  await page.waitForTimeout(300);
  s = await S();
  const field = s.parks[0].b.find(b => b.t === 10);
  check(field && field.lv === 0 && s.jobs.length === 1, 'field under construction');
  await click('#cSpeed');
  await page.waitForFunction(() => YumEmpire.state.jobs.length === 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  await run((u) => YumEmpire.select({ kind: 'b', u }), field.u);
  await page.waitForTimeout(300);
  await click('.slot.empty');
  await page.waitForTimeout(300);
  const farmerBtn = await page.$('[data-act=hire]');
  if (farmerBtn) await farmerBtn.click({ force: true });
  else { await click('[data-act=reroll]'); await page.waitForTimeout(300); const b2 = await page.$('[data-act=hire]'); if (b2) await b2.click({ force: true }); }
  await page.waitForTimeout(500);
  s = await S();
  check(s.workers.some(w => w.role === 'farmer' && w.at && w.at.u === field.u), 'farmer works the field');
  await page.waitForTimeout(3000);
  await shot(page, '05-field');

  // 5. Market: buy vegetables
  await run(() => YumEmpire.closePanel());
  await click('[data-panel=market]');
  await page.waitForTimeout(300);
  const veg0 = (await S()).inv.veg;
  await click('[data-act=buyIng][data-k=veg][data-n="10"]');
  check((await S()).inv.veg >= veg0 + 9.9, 'bought vegetables at the market');
  await shot(page, '06-market');

  // 6. Orders: deliver one
  await run(() => { const s = YumEmpire.state; for (const k in s.inv) s.inv[k] = 150; s.orders[0].readyAt = 0; YumEmpire.sync(); });
  await run(() => YumEmpire.closePanel());
  await click('.side [data-panel=orders]');
  await page.waitForTimeout(300);
  const done0 = (await S()).ordersDone;
  await click('[data-act=fillOrder][data-i="0"]');
  check((await S()).ordersDone === done0 + 1, 'order delivered');

  // 7. Build the Market Hall from the Hall button
  await run(() => YumEmpire.closePanel());
  await click('#navHall');
  await page.waitForTimeout(300);
  await click('[data-act=buildHall]');
  await page.waitForTimeout(600);
  await click('[data-act=confirmPlace]');
  await page.waitForTimeout(300);
  await click('#cSpeed');
  await page.waitForFunction(() => Engine.hallLevel(YumEmpire.state) >= 1, null, { timeout: 20000 }).catch(() => {});
  await closeModals();
  check((await run(() => Engine.hallLevel(YumEmpire.state))) === 1, 'Market Hall built');

  // 8. Every window opens without errors
  for (const p of ['build', 'staff', 'hall', 'buildings', 'world', 'quests', 'orders', 'market', 'report', 'research', 'cards', 'ranks', 'store', 'builders', 'profile']) {
    await run((n) => YumEmpire.openPanel(n), p);
    await page.waitForTimeout(120);
    await closeModals();
  }
  await run(() => YumEmpire.openPanel('report'));
  await page.waitForTimeout(400);
  check(await page.isVisible('.ledger'), 'daily report shows the books');
  await shot(page, '07-report');
  await run(() => YumEmpire.openPanel('hall'));
  await page.waitForTimeout(300);
  check(await page.isVisible('.tree'), 'hall unlock tree shown');
  await run(() => YumEmpire.openPanel('ranks'));
  check(await page.isVisible('.rank.me'), 'leaderboard shows you');
  await run(() => YumEmpire.closePanel());

  // 9. Weather and events reach the world
  await run(() => { const s = YumEmpire.state; s.weather.until = 0; s.nextEventAt = 0; });
  await page.waitForTimeout(800);
  s = await S();
  check(!!s.event, 'an event started');

  // 10. Save, reload, and the business is still there (with offline progress)
  await run(() => YumEmpire.save());
  const before = await S();
  await page.reload();
  await page.waitForFunction(() => window.YumEmpire && YumEmpire.state, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await closeModals();
  s = await S();
  check(s.workers.length === before.workers.length && s.parks[0].b.length === before.parks[0].b.length, 'save survives a reload');
  await shot(page, '08-reload');

  console.log(errors.length ? 'FAIL\n' + errors.join('\n') : 'PASS');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
