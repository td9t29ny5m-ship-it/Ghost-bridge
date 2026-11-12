#!/usr/bin/env node
/*
 * End-to-end playtest: plays the game in a phone-sized headless browser (software WebGL)
 * through every major feature, and fails on any JS error or broken rule.
 * Usage: serve www/ (npm run serve), then `node tools/playtest.js [url] [screenshotDir]`
 */
const { chromium, devices } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8765/index.html';
const SHOTS = process.argv[3] || '';

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 }); // 1× keeps software WebGL fast
  const errors = [];
  const watch = (p) => {
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  };
  const shot = async (p, name) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/pt-${name}.png`, timeout: 120000 }); };
  const check = (cond, msg) => { if (!cond) errors.push('assert: ' + msg); };
  const page = await ctx.newPage();
  watch(page);
  const S = () => page.evaluate(() => JSON.parse(JSON.stringify(YumEmpire.state)));
  const set = (fn) => page.evaluate(fn);
  const closeModals = async () => { while (await page.isVisible('#modal')) { await page.click('#modalActions button:last-child'); await page.waitForTimeout(250); } };
  const tapPlot = async (p) => {
    const pos = await page.evaluate((k) => World.plotScreenPos(k), p);
    check(!!pos, 'plot ' + p + ' is on screen');
    if (pos) await page.mouse.click(pos.x, pos.y + 30);
    await page.waitForTimeout(300);
  };

  await page.goto(URL);
  await page.waitForTimeout(800);
  check(await page.isVisible('#modal'), 'welcome shown');
  await closeModals();
  check(await page.evaluate(() => YumEmpire.use3d), '3D world started');
  await page.waitForTimeout(4500); // opening camera sweep

  // 1. Serve customers: tap the cart in the world, then the card icon
  for (let k = 0; k < 4; k++) {
    if (k < 2) await tapPlot(0); else await page.click('#cIcon');
    await page.waitForFunction(() => !YumEmpire.state.plots[0][0].running, null, { timeout: 30000 });
  }
  let s = await S();
  check(s.cash > 0 && s.stats.taps === 4, `serving earns cash (taps ${s.stats.taps}, cash ${s.cash})`);
  await shot(page, '01-start');

  // 2. Upgrade and hire a manager from the card
  await set(() => { YumEmpire.state.cash = 1000; YumEmpire.sync(); });
  await page.click('#cBuy');
  await page.click('#cHire');
  s = await S();
  check(s.plots[0][0].level === 2 && s.plots[0][0].manager, 'upgrade + manager from the card');

  // 3. Buy land and choose a shop to build
  await page.click('[data-act=next]');
  await page.waitForTimeout(1500);
  await set(() => { YumEmpire.state.cash = 1e6; YumEmpire.sync(); });
  await page.click('[data-act=buyLand]');
  await page.waitForTimeout(300);
  check((await page.evaluate(() => YumEmpire.panel)) === 'build', 'build menu opens after buying land');
  await shot(page, '02-build');
  await page.click('[data-act=buildType][data-t="1"]');
  s = await S();
  check(s.plots[0][1] && s.plots[0][1].t === 1 && s.plots[0][1].level === 1, 'new shop built at level 1');
  check(s.cash < 1e6, 'land and building cost money');

  // 4. A big shop is locked on small land
  await set(() => { YumEmpire.state.cash = 1e12; YumEmpire.sync(); });
  await set(() => YumEmpire.selectPlot(2, true));
  await page.click('[data-act=buyLand]');
  check(await page.isHidden('[data-act=buildType][data-t="3"]'), 'taco truck locked on small land');
  await page.click('#panelClose');

  // 5. Recruit a free chef and put them to work
  await set(() => YumEmpire.selectPlot(0, true));
  await page.click('[data-act=chef]');
  await page.click('[data-act=recruit]');
  await closeModals();
  await page.click('[data-act=assign]');
  s = await S();
  check(s.staff.length === 1 && s.plots[0][0].chef === s.staff[0].id, 'chef recruited and assigned');

  // 6. Quests: claim one
  await page.click('[data-panel=quests]');
  const gemsBefore = (await S()).gems;
  await page.click('[data-act=claimQuest]');
  check((await S()).gems > gemsBefore, 'quest reward claimed');
  await shot(page, '03-quests');
  await page.click('#panelClose');

  // 7. Research
  await set(() => { YumEmpire.state.cash = 1e15; YumEmpire.sync(); });
  await page.click('.nav [data-panel=research]');
  await page.click('[data-act=research]');
  check(Object.keys((await S()).upgrades).length >= 1, 'research bought');
  await page.click('#panelClose');

  // 8. Free crate from the side button
  await page.click('#crateBtn');
  await page.waitForTimeout(300);
  check((await S()).stats.crates === 1, 'crate opened');
  await closeModals();

  // 9. Expand to the next district and visit it
  await set(() => { YumEmpire.state.cash = 1e12; YumEmpire.sync(); });
  await page.click('.nav [data-panel=world]');
  await shot(page, '04-world');
  await page.click('[data-act=unlock][data-d="1"]');
  await page.waitForTimeout(300);
  await page.click('#modalActions button');
  await page.waitForTimeout(3000);
  s = await S();
  check(s.districts[1] && s.district === 1, 'unlocked and moved to Riverside Town');
  check((await page.evaluate(() => World.district())) === 1, 'the 3D map changed district');
  await shot(page, '05-town');

  // 10. The VIP walks through town: find and tap them
  await set(() => { World.debug.cam.g.dist = 180; World.debug.cam.g.tx = 0; World.debug.cam.g.tz = 0; });
  await page.waitForTimeout(2000);
  check(await page.evaluate(() => World.hasVip() || World.spawnVip(0)), 'VIP in town');
  await set(() => { const v = World.debug.vip; World.debug.cam.g.tx = v.x; World.debug.cam.g.tz = v.z; World.debug.cam.g.dist = 90; });
  await page.waitForTimeout(2500);
  const golden = (await S()).stats.golden;
  const vp = await page.evaluate(() => World.vipScreenPos());
  check(vp && vp.visible, 'VIP visible');
  if (vp) await page.mouse.click(vp.x, vp.y);
  check((await S()).stats.golden === golden + 1, 'VIP served');

  // 11. Franchise: back to one cart in the suburb, stars gained, chefs kept
  await set(() => { YumEmpire.state.lifetime = 1e17; YumEmpire.sync(); });
  await page.click('.nav [data-panel=franchise]');
  await page.click('[data-act=prestige]');
  await page.click('#modalActions button');
  await page.waitForTimeout(1500);
  s = await S();
  check(s.prestiges === 1 && s.stars > 0 && s.district === 0 && s.plots[0][1] === null && s.staff.length === 1, 'franchise resets land but keeps stars and chefs');
  await closeModals();

  // 12. Offline earnings after "2 hours away", and the save survives a reload
  await set(() => {
    const st = YumEmpire.state;
    st.plots[0][0].level = 50; st.plots[0][0].manager = true;
    YumEmpire.save();
    const k = 'yum-empire-save-v1', raw = JSON.parse(localStorage.getItem(k));
    raw.lastSeen = Date.now() - 2 * 3600e3;
    localStorage.setItem('__keep', JSON.stringify(raw));
  });
  await page.close();
  const p2 = await ctx.newPage();
  watch(p2);
  await p2.goto(URL.replace(/index\.html$/, '') + 'privacy.html');
  await p2.evaluate(() => localStorage.setItem('yum-empire-save-v1', localStorage.getItem('__keep')));
  await p2.goto(URL);
  await p2.waitForTimeout(1500);
  check((await p2.textContent('#modalTitle')) === 'Welcome back!', 'offline earnings offered');
  const cashBefore = await p2.evaluate(() => YumEmpire.state.cash);
  await p2.click('#modalActions button:last-child');
  check((await p2.evaluate(() => YumEmpire.state.cash)) > cashBefore, 'offline cash collected');
  check((await p2.evaluate(() => YumEmpire.state.prestiges)) === 1, 'save persisted');

  await browser.close();
  if (errors.length) { console.error('FAIL\n' + [...new Set(errors)].join('\n')); process.exit(1); }
  console.log('PASS — playtest completed with no errors');
})();
