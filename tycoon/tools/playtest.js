#!/usr/bin/env node
/*
 * End-to-end playtest: plays the park builder in a phone-sized headless browser (software WebGL)
 * through every major feature, and fails on any JS error or broken rule.
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
  const check = (cond, msg) => { if (!cond) errors.push('assert: ' + msg); };
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/pt-${name}.png`, timeout: 120000 }); };
  const page = await ctx.newPage();
  watch(page);
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(YumEmpire.state)));
  const run = (fn, arg) => page.evaluate(fn, arg);
  const closeModals = async () => { while (await page.isVisible('#modal')) { await page.click('#modalActions button:last-child'); await page.waitForTimeout(250); } };
  const giveMoney = () => run(() => { const s = YumEmpire.state; s.cash = 1e9; s.ing = 1e9; YumEmpire.sync(); });

  await page.goto(URL);
  await page.waitForTimeout(1200);
  check(await page.isVisible('#modal'), 'welcome shown');
  await closeModals();
  check(await run(() => YumEmpire.use3d), '3D started');
  await page.waitForTimeout(4500);

  // 1. Collect from the noodle cart by tapping its coin bubble in the world
  let s = await S();
  const cart = s.parks[0].b.find(b => b.t === 1);
  const pos = await run((u) => World.buildingScreenPos(u), cart.u);
  check(pos && pos.on, 'cart on screen');
  if (pos) await page.mouse.click(pos.x, pos.y + 6);
  await page.waitForTimeout(400);
  s = await S();
  check(s.stats.collects === 1 && s.cash > 200, `tap collects coins (collects ${s.stats.collects}, cash ${s.cash})`);
  check((await run(() => YumEmpire.sel && YumEmpire.sel.u)) === cart.u, 'tapping selects the building');
  await shot(page, '01-collect');

  // 2. Build a Veggie Garden through the Build menu and place it
  await page.click('.nav [data-panel=build]');
  await page.click('[data-act=tab][data-tab=supply]');
  await shot(page, '02-build-menu');
  await page.click('[data-act=pickBuild][data-t="10"]');
  await page.waitForTimeout(600);
  check(!!(await run(() => YumEmpire.placing)), 'placement mode');
  await page.click('[data-act=confirmPlace]');
  await page.waitForTimeout(300);
  s = await S();
  const garden = s.parks[0].b.find(b => b.t === 10);
  check(garden && garden.lv === 0 && s.jobs.length === 1, 'garden under construction');
  await page.click('#cSpeed');   // under a minute: free
  await page.waitForFunction(() => YumEmpire.state.jobs.length === 0, null, { timeout: 20000 }).catch(() => {});
  check((await S()).parks[0].b.find(b => b.t === 10).lv === 1, 'finished for free');

  // 3. Upgrade the Market Hall from the Hall button
  await giveMoney();
  await page.click('#navHall');
  await page.waitForTimeout(400);
  await page.click('#cUp');
  await page.waitForTimeout(200);
  check((await S()).jobs.length === 1, 'hall upgrading');
  await page.click('#cSpeed');
  await page.waitForFunction(() => YumEmpire.state.jobs.length === 0, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  await closeModals();
  check((await run(() => Engine.hallLevel(YumEmpire.state))) === 2, 'hall level 2');

  // 4. Decor is instant; then move it
  await page.click('.nav [data-panel=build]');
  await page.click('[data-act=tab][data-tab=decor]');
  await page.click('[data-act=pickBuild][data-t="14"]');
  await page.waitForTimeout(400);
  await page.click('[data-act=confirmPlace]');
  s = await S();
  const tables = s.parks[0].b.filter(b => b.t === 14);
  check(tables.length === 2 && tables[1].lv === 1, 'second table placed instantly');
  await page.click('[data-act=move]');
  await page.waitForTimeout(300);
  const before = [tables[1].x, tables[1].y];
  await run(() => { const p = YumEmpire.placing; const st = YumEmpire.state; for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (Engine.fits(st.parks[0], p.t, x, y, p.moveU) && (x !== p.x || y !== p.y)) { World.updatePlacement(x, y, st); return; } });
  await page.click('[data-act=confirmPlace]');
  const after = (await S()).parks[0].b.find(b => b.u === tables[1].u);
  check(after.x !== before[0] || after.y !== before[1], 'table moved');

  // 5. Buy the land next door from its card
  const k = await run(() => { const p = YumEmpire.state.parks[0]; for (let i = 0; i < 36; i++) if (!p.parcels[i] && Engine.parcelAdjacent(p, i)) return i; });
  await run((kk) => YumEmpire.select({ kind: 'parcel', k: kk }, true), k);
  await page.waitForTimeout(300);
  await shot(page, '03-land');
  await page.click('[data-act=buyParcel]');
  check((await S()).parks[0].parcels[k], 'land bought');

  // 6. Chef: recruit for free and assign to the cart
  await run((u) => YumEmpire.select({ kind: 'b', u }), cart.u);
  await page.click('[data-act=chef]');
  await page.click('[data-act=recruit]');
  await closeModals();
  await page.click('[data-act=assign]');
  s = await S();
  check(s.staff.length === 1 && s.parks[0].b.find(b => b.u === cart.u).chef === s.staff[0].id, 'chef assigned');

  // 7. Quests, research, crate, builders
  await page.click('[data-panel=quests]');
  const g0 = (await S()).gems;
  await page.click('[data-act=claimQuest]');
  check((await S()).gems > g0, 'quest claimed');
  await page.click('#panelClose');
  await run(() => { const h = Engine.hallB(YumEmpire.state); h.lv = 4; YumEmpire.state.cash = 1e12; YumEmpire.state.ing = 1e12; YumEmpire.sync(); });
  await page.click('[data-panel=research]');
  await page.click('[data-act=research]');
  check(Object.keys((await S()).upgrades).length === 1, 'research done');
  await page.click('#panelClose');
  await page.click('#crateBtn');
  await page.waitForTimeout(300);
  check((await S()).stats.crates === 1, 'crate opened');
  await closeModals();
  await page.click('#builderBtn', { force: true });   // it bobs while a builder is free
  check((await run(() => YumEmpire.panel)) === 'builders', 'builders window');
  await page.click('#panelClose');

  // 8. Collect all
  await run(() => { YumEmpire.select(null); YumEmpire.state.parks[0].b.forEach(b => { if (Engine.DEFS[b.t].cat === 'stall') b.st = 500; }); YumEmpire.sync(); });
  await page.waitForTimeout(400);
  const c0 = (await S()).cash;
  await page.click('#collectAll', { force: true });
  check((await S()).cash > c0, 'collect all');

  // 9. Tip coin and VIP visitor in the world
  await run(() => { World.debug.cam.g.dist = 80; });
  await page.waitForTimeout(1500);
  const tip = await run(() => { const c = World.debug.cam; World.debug.dropTip(c.tx, c.tz); const t = World.debug.tips[0]; return World.screenPos(t.x, t.y, t.z); });
  await page.waitForTimeout(300);
  await page.mouse.click(tip.x, tip.y);
  check((await S()).stats.tips === 1, 'tip collected');
  check(await run(() => World.hasVip() || World.spawnVip()), 'VIP in town');
  await run(() => { const v = World.debug.vip; World.debug.cam.g.tx = v.x; World.debug.cam.g.tz = v.z; World.debug.cam.g.dist = 70; });
  await page.waitForTimeout(2500);
  const vp = await run(() => World.vipScreenPos());
  if (vp) await page.mouse.click(vp.x, vp.y);
  check((await S()).stats.golden === 1, 'VIP welcomed');
  await closeModals();

  // 10. A second location
  await run(() => { const h = Engine.hallB(YumEmpire.state); h.lv = 8; YumEmpire.state.cash = 1e12; YumEmpire.sync(); });
  await page.click('.nav [data-panel=world]');
  await page.click('[data-act=unlockPark][data-p="1"]');
  await page.waitForTimeout(300);
  await page.click('#modalActions button');
  await page.waitForTimeout(3000);
  check((await S()).park === 1 && (await run(() => World.park())) === 1, 'moved to Riverside Town');
  await shot(page, '04-town');
  await run(() => YumEmpire.goPark(0));
  await page.waitForTimeout(2000);

  // 11. Come back after two hours: storage filled, welcome-back shown
  await run(() => {
    YumEmpire.save();
    const raw = JSON.parse(localStorage.getItem('yum-empire-save-v1'));
    raw.lastSeen = Date.now() - 2 * 3600e3;
    localStorage.setItem('__keep', JSON.stringify(raw));
  });
  await page.close();
  const p2 = await ctx.newPage();
  watch(p2);
  await p2.goto(URL.replace(/index\.html$/, '') + 'privacy.html');
  await p2.evaluate(() => localStorage.setItem('yum-empire-save-v1', localStorage.getItem('__keep')));
  await p2.goto(URL);
  await p2.waitForTimeout(2000);
  check((await p2.textContent('#modalTitle')) === 'Welcome back!', 'welcome back shown');
  check((await p2.evaluate(() => YumEmpire.state.parks[0].b.find(b => b.t === 1).st)) > 100, 'storage filled while away');
  check((await p2.evaluate(() => YumEmpire.state.parks[1].unlocked)), 'save persisted');

  await browser.close();
  if (errors.length) { console.error('FAIL\n' + [...new Set(errors)].join('\n')); process.exit(1); }
  console.log('PASS — playtest completed with no errors');
})();
