#!/usr/bin/env node
// Unit tests for the game rules. Run: npm test
const assert = require('node:assert/strict');
const E = require('../www/js/engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; }
}
// Noon on a June day (game clock): a busy hour, sunny, no events.
const T0 = (() => { let t = Date.UTC(2026, 5, 1, 12); while (E.gameClock(t).hour !== 12) t += 120e3; return t; })();
const fresh = () => { const s = E.newState(T0); s.clockShift = 0; s.settings.autoBuy = false; s.tutorialDone = true; s.weather = { kind: 'cloud', until: T0 + 365 * 86400e3 }; s.nextEventAt = T0 + 365 * 86400e3; return s; };
const rich = () => { const s = fresh(); s.cash = 1e30; s.tokens = 1e9; s.gems = 1e6; for (const k in s.inv) s.inv[k] = 1e5; return s; };
const finishAll = (s, t) => { s.jobs.forEach(j => (j.end = 0)); return E.tick(s, 0.001, t || T0); };
function hallTo(s, lv) {
  if (!E.hallB(s)) { const sp = freeSpot(s, E.HALL); assert.ok(E.build(s, 0, E.HALL, sp[0], sp[1], T0)); finishAll(s); }
  const h = E.hallB(s);
  while (h.lv < lv) { s.jobs = []; assert.ok(E.startUpgrade(s, 0, h.u, T0), 'hall upgrade ' + h.lv); finishAll(s); }
}
function freeSpot(s, t) {
  const p = s.parks[0];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (E.fits(p, t, x, y, -1)) return [x, y];
  for (let k = 0; k < 36; k++) if (!p.parcels[k] && E.parcelAdjacent(p, k)) { p.parcels[k] = true; return freeSpot(s, t); }
  return null;
}
function place(s, id) { const t = E.ID[id], sp = freeSpot(s, t); s.jobs = []; const b = E.build(s, 0, t, sp[0], sp[1], T0); assert.ok(b, 'build ' + id); finishAll(s); return b; }
function staffWith(s, b, role, skill) {
  const w = { id: s.wseq++, name: 'Test', role, skill: skill || 1, trait: 'none', wage: 10, lvl: 1, face: 1, at: null };
  s.workers.push(w);
  assert.ok(E.assign(s, w.id, 0, b.u), 'assign');
  return w;
}
const cart = (s) => s.parks[0].b.find(b => b.t === E.ID.cart);

test('new game: one noodle cart and the Market Hall on two plots, some cash and ingredients', () => {
  const s = fresh();
  assert.deepEqual(s.parks[0].b.map(b => E.DEFS[b.t].id), ['cart', 'hall']);
  assert.equal(s.parks[0].parcels.filter(Boolean).length, 2);
  assert.equal(E.hallLevel(s), 1);
  assert.equal(s.cash, 400);
  assert.ok(s.inv.wheat > 0 && s.inv.veg > 0);
  assert.equal(s.workers.length, 0);
  assert.equal(s.candidates.length, 5);
  assert.ok(s.candidates.some(c => c.role === 'cook'));
  assert.equal(s.orders.length, 3);
});

test('nothing sells without a worker: no manual earning', () => {
  const s = fresh();
  E.tick(s, 600, T0 + 600e3);
  assert.equal(s.stats.dishes, 0);
  assert.ok(s.cash <= 400, 'only rent is paid');
});

test('hire a cook, assign them to the cart, and it sells on its own', () => {
  const s = fresh();
  const c = s.candidates.find(x => x.role === 'cook');
  const fee = E.hireCost(c);
  assert.ok(E.hire(s, c.id));
  assert.equal(s.cash, 400 - fee);
  assert.ok(E.assign(s, c.id, 0, cart(s).u));
  const h = E.summary(s, T0);
  assert.ok(h.revenue > 0 && h.dishes > 0);
  E.tick(s, 120, T0 + 120e3);
  assert.ok(s.stats.dishes > 0);
  assert.ok(s.inv.wheat < 120 && s.inv.veg < 120, 'ingredients were used');
});

test('only the right role can work a building, and slots are limited', () => {
  const s = rich();
  const f = s.candidates.find(x => x.role === 'farmer') || { id: -1 };
  const farmer = { id: s.wseq++, name: 'F', role: 'farmer', skill: 1, trait: 'none', wage: 9, lvl: 1, face: 1, at: null };
  s.workers.push(farmer);
  assert.equal(E.assign(s, farmer.id, 0, cart(s).u), false, 'a farmer cannot cook');
  staffWith(s, cart(s), 'cook');
  const extra = { id: s.wseq++, name: 'C', role: 'cook', skill: 1, trait: 'none', wage: 9, lvl: 1, face: 1, at: null };
  s.workers.push(extra);
  assert.equal(E.assign(s, extra.id, 0, cart(s).u), false, 'the level 1 cart has one slot');
  assert.ok(f);
});

test('sales are limited by ingredients and stop when they run out', () => {
  const s = fresh();
  staffWith(s, cart(s), 'cook');
  s.inv.wheat = 5; s.inv.veg = 100;
  E.tick(s, 3600, T0 + 3600e3);
  assert.ok(Math.abs(s.stats.dishes - 5) < 0.05, 'only 5 bowls: ' + s.stats.dishes);
  assert.ok(cart(s).starved);
  assert.ok(s.inv.wheat < 1e-9);
});

test('tax, supplies, wages and rent come out of revenue', () => {
  const s = fresh();
  const w = staffWith(s, cart(s), 'cook');
  w.wage = 20;
  const sm = E.summary(s, T0);
  assert.ok(Math.abs(sm.tax - sm.revenue * E.SALES_TAX) < 1e-9);
  assert.ok(Math.abs(sm.supplies - sm.revenue * E.SUPPLIES) < 1e-9);
  assert.equal(sm.wages, 20);
  assert.equal(sm.rent, 2 * E.RENT_PER_PLOT);
  assert.ok(Math.abs(sm.profit - (sm.revenue - sm.tax - sm.supplies - 20 - sm.rent)) < 1e-9);
  const before = s.cash;
  E.tick(s, 60, T0 + 60e3);   // 60 real seconds = half a game hour
  const L = s.ledger[s.ledger.length - 1];
  assert.ok(L.revenue > 0 && L.tax > 0 && L.wages > 0 && L.rent > 0 && L.supplies > 0);
  assert.ok(Math.abs(s.cash - (before + L.revenue - L.tax - L.supplies - L.wages - L.rent)) < 1e-6);
});

test('the game clock runs 30× faster than real time, with a lunch peak', () => {
  assert.equal(E.TIME_SCALE, 30);
  const a = E.gameClock(0), b = E.gameClock(120e3);
  assert.equal(b.hour - a.hour, 1, 'two real minutes = one game hour');
  const avg = E.DAY_CURVE.reduce((x, y) => x + y, 0) / 24;
  assert.ok(Math.abs(avg - 1) < 1e-9);
  assert.ok(E.DAY_CURVE[12] > E.DAY_CURVE[3] * 5);
});

test('cash never goes below zero; unpaid costs simply stop at $0', () => {
  const s = fresh();
  s.cash = 1; staffWith(s, cart(s), 'cook').wage = 500;
  s.inv.wheat = 0;
  E.tick(s, 600, T0 + 600e3);
  assert.equal(s.cash, 0);
});

test('farms need a farmer, then fill the inventory up to its cap', () => {
  const s = rich();
  for (const k in s.inv) s.inv[k] = 0;
  const f = place(s, 'field');
  E.tick(s, 120, T0 + 120e3);
  assert.equal(s.inv.wheat, 0);
  staffWith(s, f, 'farmer');
  E.tick(s, 120, T0 + 240e3);
  assert.equal(s.inv.wheat, 0, 'wheat is still growing after one game hour');
  assert.ok(f.g > 0.3 && f.g < 0.4);
  const r = E.tick(s, 240, T0 + 480e3);
  assert.ok(Math.abs(s.inv.wheat - 120) < 0.5, 'a 3-hour crop is harvested in one batch: ' + s.inv.wheat);
  assert.ok(r.harvests.length === 1 && r.harvests[0].k === 'wheat');
  E.tick(s, 3600 * 3, T0 + 4 * 3600e3);
  assert.ok(s.inv.wheat > E.invCap(s) - 3 && s.inv.wheat <= E.invCap(s));
});

test('a warehouse raises storage for every ingredient', () => {
  const s = rich();
  hallTo(s, 1);
  const before = E.invCap(s);
  place(s, 'warehouse');
  assert.equal(E.invCap(s), before + 600);
});

test('fish ponds need fishers and unlock at Market Hall 5', () => {
  const s = rich();
  hallTo(s, 4);
  assert.equal(E.canBuild(s, 0, E.ID.pond).ok, false);
  hallTo(s, 5);
  const p = place(s, 'pond');
  const farmer = { id: s.wseq++, name: 'F', role: 'farmer', skill: 1, trait: 'none', wage: 9, lvl: 1, face: 1, at: null };
  s.workers.push(farmer);
  assert.equal(E.assign(s, farmer.id, 0, p.u), false);
  staffWith(s, p, 'fisher');
  assert.ok(E.summary(s, T0).makes.fish > 0);
});

test('the market sells at a mark-up and buys back at a discount', () => {
  const s = fresh();
  s.cash = 100;
  const n = E.buyIng(s, 'meat', 10, T0);
  assert.equal(n, 10);
  assert.ok(Math.abs(s.cash - (100 - 10 * 3.5 * 1.3)) < 1e-9);
  const before = s.cash;
  E.sellIng(s, 'meat', 10);
  assert.ok(Math.abs(s.cash - (before + 10 * 3.5 * 0.6)) < 1e-9);
  assert.equal(E.buyIng(s, 'meat', 1e9, T0) <= E.invCap(s), true);
});

test('Market Hall level gates buildings, counts, levels and land', () => {
  const s = rich();
  assert.equal(E.canBuild(s, 0, E.ID.dumpling).ok, false);
  assert.equal(E.maxParcels(s), 5);
  hallTo(s, 2);
  assert.ok(E.canBuild(s, 0, E.ID.dumpling).ok);
  assert.equal(E.maxLevel(s, E.ID.cart), 2);
  assert.equal(E.maxParcels(s), 7);
  assert.equal(E.maxCount(s, E.ID.cart), 1);
  hallTo(s, 3);
  assert.equal(E.maxCount(s, E.ID.cart), 2);
});

test('building and upgrading take time and a free builder; times grow with level', () => {
  const s = rich();
  hallTo(s, 5);
  const c = cart(s);
  assert.ok(E.startUpgrade(s, 0, c.u, T0));
  assert.equal(E.canUpgrade(s, 0, c.u).why, 'Under construction');
  const other = place(s, 'field');
  s.jobs = [{ u: c.u, park: 0, end: T0 + 1e9, dur: 10 }];
  if (E.builderCount(s) === 2) s.jobs.push({ u: other.u, park: 0, end: T0 + 1e9, dur: 10 });
  assert.equal(E.canUpgrade(s, 0, E.hallB(s).u).why, 'All builders are busy');
  for (let lv = 1; lv < 10; lv++) assert.ok(E.upgradeCost(E.HALL, lv + 1).time >= E.upgradeCost(E.HALL, lv).time);
  assert.ok(E.upgradeCost(E.ID.cart, 5).time > E.upgradeCost(E.ID.cart, 1).time);
});

test('upgrading a stall raises customers, price and worker slots', () => {
  const s = rich();
  hallTo(s, 10);
  const c = cart(s);
  staffWith(s, c, 'cook');
  const a = E.hourly(s, 0, c, T0);
  for (let i = 0; i < 6; i++) { s.jobs = []; assert.ok(E.startUpgrade(s, 0, c.u, T0)); finishAll(s); }
  const b = E.hourly(s, 0, c, T0);
  assert.ok(b.demand > a.demand * 3);
  assert.ok(b.price > a.price);
  assert.ok(E.slotsFor(c.t, c.lv) > E.slotsFor(c.t, 1));
});

test('land: adjacent plots only, price rises, Market Hall limits how much', () => {
  const s = rich();
  assert.equal(E.canBuyParcel(s, 0, 0).ok, false, 'not adjacent');
  assert.ok(E.buyParcel(s, 0, 2 * 6 + 1));
  assert.ok(E.buyParcel(s, 0, 2 * 6 + 4));
  assert.ok(E.buyParcel(s, 0, 1 * 6 + 2));
  assert.equal(E.canBuyParcel(s, 0, 1 * 6 + 3).ok, false, 'Market Hall 1 allows 5 plots');
  hallTo(s, 2);
  const p1 = E.landPrice(s);
  assert.ok(E.buyParcel(s, 0, 1 * 6 + 3));
  assert.ok(E.landPrice(s) > p1);
});

test('workers: skill and traits change output; training raises level and wage', () => {
  const base = { skill: 1, trait: 'none', lvl: 1 };
  assert.ok(E.workerPower({ ...base, skill: 3 }) > E.workerPower(base));
  assert.ok(E.workerPower({ ...base, trait: 'fast' }) > E.workerPower(base));
  const s = rich();
  const w = staffWith(s, cart(s), 'cook');
  const wage = w.wage;
  assert.ok(E.train(s, w.id));
  assert.equal(w.lvl, 2);
  assert.ok(w.wage > wage);
  assert.ok(E.fire(s, w.id));
  assert.equal(E.workersAt(s, 0, cart(s).u).length, 0);
});

test('hiring is capped by the Market Hall and candidates can be refreshed', () => {
  const s = rich();
  assert.equal(E.maxWorkers(s), 5);
  for (let k = 0; k < 5; k++) E.hire(s, s.candidates[0].id);
  assert.equal(s.workers.length, 5);
  E.rerollCandidates(s, T0, true);
  assert.equal(E.hire(s, s.candidates[0].id), null);
  const ids = s.candidates.map(c => c.id).join();
  assert.ok(E.rerollCandidates(s, T0, true));
  assert.notEqual(s.candidates.map(c => c.id).join(), ids);
});

test('decorations near a stall bring more customers; bins keep it clean', () => {
  const s = rich();
  const c = cart(s);
  staffWith(s, c, 'cook');
  const before = E.hourly(s, 0, c, T0).demand;
  const p = s.parks[0];
  E.build(s, 0, E.ID.table, c.x + 1, c.y, T0);
  assert.ok(E.decorBonus(p, c) > 0);
  assert.ok(E.hourly(s, 0, c, T0).demand > before);
  const dirty = E.cleanliness(s, 0, 1000);
  E.build(s, 0, E.ID.bin, c.x - 1, c.y, T0);
  assert.ok(E.cleanliness(s, 0, 1000) > dirty);
});

test('reputation grows with dishes and unlocks the Food Court', () => {
  const s = rich();
  staffWith(s, cart(s), 'cook');
  E.tick(s, 1200, T0 + 1200e3);
  assert.ok(s.rep > 0);
  hallTo(s, 12);
  assert.match(E.canBuild(s, 0, E.ID.court).why, /reputation/);
  s.rep = 1e7;
  assert.ok(E.canBuild(s, 0, E.ID.court).ok);
});

test('orders: deliver ingredients for cash, tokens and reputation', () => {
  const s = fresh();
  const o = s.orders[0];
  for (const k in s.inv) s.inv[k] = 0;
  assert.equal(E.fillOrder(s, 0, T0), null);
  for (const [k, q] of Object.entries(o.need)) s.inv[k] = q;
  const cash = s.cash;
  assert.ok(E.fillOrder(s, 0, T0));
  assert.equal(s.cash, cash + o.cash);
  assert.ok(s.tokens >= 1);
  assert.ok(s.orders[0].readyAt > T0, 'the next order arrives later');
});

test('events and weather change how many customers come', () => {
  const s = fresh();
  staffWith(s, cart(s), 'cook');
  const base = E.demandMult(s, T0);
  s.event = { id: 'rush', until: T0 + 1e6 };
  assert.ok(Math.abs(E.demandMult(s, T0) - base * 2) < 1e-9);
  s.event = null; s.weather = { kind: 'rain', until: T0 + 1e6 };
  assert.ok(E.demandMult(s, T0) < base);
  const s2 = rich(); hallTo(s2, 1);
  s2.event = null; s2.nextEventAt = T0; s2.weather.until = T0;
  const ch = E.updateWorldClock(s2, T0 + 1);
  assert.ok(ch.some(c => c.type === 'event') && ch.some(c => c.type === 'weather'));
});

test('skill trees and research boost the business', () => {
  const s = rich();
  hallTo(s, 3);
  const c = cart(s);
  staffWith(s, c, 'cook');
  const a = E.hourly(s, 0, c, T0);
  assert.ok(E.buySkill(s, c.t, 'menu'));
  assert.ok(E.buySkill(s, c.t, 'sign'));
  const b = E.hourly(s, 0, c, T0);
  assert.ok(b.price > a.price && b.demand > a.demand);
  assert.ok(E.doResearch(s, 'app'));
  assert.equal(E.doResearch(s, 'app'), false);
  assert.equal(E.canResearch(s, 'brand').ok, false);
});

test('cards: rush doubles customers, instant finishes a build, harvest fills stock', () => {
  const s = rich();
  hallTo(s, 2);
  s.cards = { rush: 1, instant: 1, harvest: 1, reroll: 0 };
  const base = E.demandMult(s, T0);
  assert.ok(E.useCard(s, 'rush', T0));
  assert.ok(Math.abs(E.demandMult(s, T0) - base * 2) < 1e-9);
  s.jobs = [];
  const b = E.build(s, 0, E.ID.barn, ...freeSpot(s, E.ID.barn), T0);
  assert.ok(E.useCard(s, 'instant', T0));
  E.tick(s, 0.001, T0);
  assert.equal(b.lv, 1);
  staffWith(s, b, 'farmer');
  s.inv.meat = 0;
  assert.ok(E.useCard(s, 'harvest', T0));
  assert.ok(s.inv.meat > 0);
});

test('missions guide the tutorial: the first one is hiring a cook', () => {
  const s = fresh();
  assert.match(E.mission(s).title, /Hire a cook/);
  assert.equal(E.claimMission(s), null);
  const c = s.candidates.find(x => x.role === 'cook');
  E.hire(s, c.id); E.assign(s, c.id, 0, cart(s).u);
  const gems = s.gems;
  assert.ok(E.claimMission(s));
  assert.ok(s.gems > gems);
  assert.equal(s.mission, 1);
});

test('leaderboard ranks you among rival tycoons', () => {
  const s = fresh();
  const lb = E.leaderboard(s, T0);
  assert.equal(lb.length, E.leaderboard(s, T0).length);
  assert.ok(lb.some(x => x.you));
  for (let i = 1; i < lb.length; i++) assert.ok(lb[i - 1].worth >= lb[i].worth);
  s.cash = 1e12;
  assert.ok(E.leaderboard(s, T0)[0].you);
});

test('save and load keeps workers, inventory, ledger and buildings', () => {
  const s = rich();
  hallTo(s, 3);
  staffWith(s, cart(s), 'cook', 3);
  E.tick(s, 600, T0 + 600e3);
  const raw = JSON.parse(JSON.stringify(s));
  const l = E.loadState(raw, T0 + 600e3);
  assert.equal(l.workers.length, 1);
  assert.equal(l.workers[0].skill, 3);
  assert.deepEqual(l.workers[0].at, { park: 0, u: cart(s).u });
  assert.equal(l.inv.wheat, s.inv.wheat);
  assert.equal(l.ledger.length, s.ledger.length);
  assert.equal(E.hallLevel(l), 3);
  assert.equal(l.parks[0].b.length, s.parks[0].b.length);
});

test('older saves start the new game but keep gems and purchases', () => {
  const l = E.loadState({ v: 3, gems: 500, premium: true, cash: 1e9, settings: { sound: false } }, T0);
  assert.equal(l.gems, 500);
  assert.equal(l.premium, true);
  assert.equal(l.cash, 400);
  assert.equal(l.settings.sound, false);
  assert.equal(E.loadState(null, T0).cash, 400);
  assert.equal(E.loadState({ v: 4, cash: 'lots', workers: [{ role: 'pilot' }], inv: { wheat: -5 } }, T0).cash, 400);
});

test('hall tree lists unlocks for every level', () => {
  const tree = E.hallTree();
  assert.equal(tree.length, E.HALL_MAX);
  assert.ok(tree[1].items.some(i => i.text === 'Dumpling Stand'));
  assert.ok(tree[4].items.some(i => i.text === 'Fish Pond'));
});

test('daily rewards, crates and quests pay out', () => {
  const s = fresh();
  const d = E.claimDaily(s, T0);
  assert.ok(d && d.cash > 0);
  assert.equal(E.claimDaily(s, T0), null);
  const c = E.openCrate(s, T0, [0.5, 0.5]);
  assert.ok(c);
  assert.equal(E.crateStatus(s, T0).free, false);
  assert.ok(E.questList(s).length >= 6);
});

test('formatting money and time', () => {
  assert.equal(E.formatMoney(4.5), '$4.50');
  assert.equal(E.formatMoney(1500), '$1.50K');
  assert.equal(E.formatMoney(999999), '$1.00M');
  assert.equal(E.formatTime(3700), '1h 01m');
});

test('long offline gaps are simulated in steps and capped', () => {
  const s = fresh();
  staffWith(s, cart(s), 'cook');
  s.inv.wheat = 150; s.inv.veg = 150;
  E.tick(s, 48 * 3600, T0 + 48 * 3600e3);
  assert.ok(s.stats.dishes > 100 && s.stats.dishes <= 150 + 1e-6);
  assert.ok(s.stats.playTime <= E.OFFLINE_CAP_SEC + 60);
});


test('a save without a Market Hall gets one placed automatically', () => {
  const s = fresh();
  s.parks[0].b = s.parks[0].b.filter(b => b.t !== E.HALL);
  s.parks[0].b.push({ u: 50, t: E.ID.field, x: 8, y: 8, lv: 1 }, { u: 51, t: E.ID.garden, x: 13, y: 8, lv: 1 });
  const l = E.loadState(JSON.parse(JSON.stringify(s)), T0);
  assert.equal(E.hallLevel(l), 1);
  assert.equal(l.parks[0].b.length, 4);
});
test('the manager restocks from the market so a staffed stall keeps selling', () => {
  const s = fresh();
  s.settings.autoBuy = true;
  staffWith(s, cart(s), 'cook');
  s.inv.wheat = 0; s.inv.veg = 0;
  const cash = s.cash;
  E.tick(s, 600, T0 + 600e3);
  assert.ok(s.stats.dishes > 20, 'still selling: ' + s.stats.dishes);
  assert.ok(s.cash > cash, 'and making money even when buying every ingredient');
  assert.ok(s.ledger[s.ledger.length - 1].market > 0);
});

test('every dish still makes money when its ingredients come from the market', () => {
  const s = fresh();
  for (const d of E.DEFS) {
    if (!d.recipe) continue;
    const cost = Object.entries(d.recipe).reduce((a, [k, q]) => a + q * E.buyPrice(s, k), 0);
    assert.ok(d.price * (1 - E.SALES_TAX - E.SUPPLIES) > cost * 1.15, d.name + ' margin');
  }
});

test('shops close at night: no customers and no wages', () => {
  const s = fresh();
  staffWith(s, cart(s), 'cook');
  const night = T0 + 14 * 120e3;   // 2:00 at night
  assert.equal(E.isOpen(night), false);
  const sm = E.summary(s, night);
  assert.equal(sm.revenue, 0);
  assert.equal(sm.wages, 0);
  s.tutorialDone = false;
  assert.ok(E.summary(s, night).revenue > 0, 'but new businesses stay open during the tutorial');
});

test('the first hiring board has an affordable beginner cook and farmer', () => {
  const s = E.newState(T0);
  assert.equal(s.candidates[0].role, 'cook');
  assert.equal(s.candidates[1].role, 'farmer');
  assert.ok(E.hireCost(s.candidates[0]) <= 150);
});

test('a broke business gets a small-business grant', () => {
  const s = fresh();
  s.cash = 5; s.inv.wheat = 0;
  const g = E.claimGrant(s, T0);
  assert.ok(g && s.cash >= 500);
  assert.equal(E.claimGrant(s, T0), null, 'only every 2 hours');
});

test('menu prices: cheaper brings more customers, dearer fewer; long queues lose customers and reputation', () => {
  const s = fresh();
  const c = cart(s);
  staffWith(s, c, 'cook');
  const base = E.hourly(s, 0, c, T0);
  E.setPrice(s, 0, c.u, 0.8);
  const cheap = E.hourly(s, 0, c, T0);
  E.setPrice(s, 0, c.u, 1.4);
  const dear = E.hourly(s, 0, c, T0);
  assert.ok(cheap.demand > base.demand && dear.demand < base.demand);
  assert.ok(dear.price > base.price && cheap.price < base.price);
  E.setPrice(s, 0, c.u, 9);
  assert.equal(c.pm, E.PRICE_MAX);
  E.setPrice(s, 0, c.u, 1);
  assert.ok(base.lost > 0, 'one cook cannot serve the lunch rush');
  // a queue that is served earns more reputation than one where people give up
  const grow = (pm, cooks) => { const t = fresh(); const cc = cart(t); for (let k = 0; k < cooks; k++) staffWith(t, cc, 'cook'); t.inv.wheat = t.inv.veg = 1e4; E.setPrice(t, 0, cc.u, pm); E.tick(t, 120, T0 + 120e3); return t.rep; };
  assert.ok(grow(1.3, 1) > grow(0.7, 1) * 0.5, 'cheap prices with a long queue are not a free win');
});

test('a new business opens at 8:00 in the morning, whatever the real time', () => {
  for (const h of [0, 5, 13, 22]) {
    const t = Date.UTC(2026, 0, 3, h, 17);
    const s = E.newState(t);
    assert.equal(E.gameClock(t, s).hour, 8);
    assert.equal(E.gameDay(s, t), 1);
  }
});

test('customers rate the business: good cooks, fair prices and short queues earn stars and reviews', () => {
  const run = (skill, pm, cooks) => {
    const s = fresh(); const c = cart(s);
    for (let k = 0; k < cooks; k++) staffWith(s, c, 'cook', skill);
    s.inv.wheat = s.inv.veg = 1e5; E.setPrice(s, 0, c.u, pm);
    for (let k = 0; k < 20; k++) E.tick(s, 120, T0 + k * 120e3);
    return s;
  };
  const good = run(5, 0.9, 1), bad = run(1, 1.6, 1);
  assert.ok(good.rating > bad.rating + 0.5, `good ${good.rating.toFixed(2)} vs bad ${bad.rating.toFixed(2)}`);
  assert.ok(good.reviews.length > 0 && good.reviews[0].text.length > 5);
  assert.ok(E.demandMult(good, T0) > E.demandMult(bad, T0), 'better ratings bring more customers');
});

test('fresh food spoils; dry goods keep', () => {
  const s = fresh();
  s.inv.fish = 100; s.inv.rice = 100;
  E.tick(s, 1200, T0 + 1200e3);
  assert.ok(s.inv.fish < 85 && s.inv.rice > 98, `fish ${s.inv.fish.toFixed(1)} rice ${s.inv.rice.toFixed(1)}`);
  assert.ok(s.ledger[s.ledger.length - 1].spoiled > 0);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
