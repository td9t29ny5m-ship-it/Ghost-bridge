#!/usr/bin/env node
// Unit tests for the game rules. Run: npm test
const assert = require('node:assert/strict');
const E = require('../www/js/engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + (e.stack || e.message).split('\n').slice(0, 3).join('\n    ')); process.exitCode = 1; }
}
const T0 = 1_700_000_000_000;
const rich = () => { const s = E.newState(T0); s.cash = 1e30; s.ing = 1e30; s.gems = 1e6; return s; };
const finishAll = (s, t) => { s.jobs.forEach(j => (j.end = 0)); return E.tick(s, 0.001, t || T0); };
function hallTo(s, lv) { const h = E.hallB(s); while (h.lv < lv) { s.jobs = []; assert.ok(E.startUpgrade(s, 0, h.u, T0), 'hall upgrade ' + h.lv); finishAll(s); } }
function freeSpot(s, t) { const p = s.parks[0]; for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (E.fits(p, t, x, y, -1)) return [x, y]; return null; }

test('new game: hall, a noodle cart and a table on two plots of land', () => {
  const s = E.newState(T0);
  const p = s.parks[0];
  assert.equal(p.parcels.filter(Boolean).length, 2);
  assert.deepEqual(p.b.map(b => E.DEFS[b.t].id), ['hall', 'cart', 'table']);
  assert.equal(E.hallLevel(s), 1);
  assert.equal(E.builderCount(s), 1);
  assert.ok(p.b[1].st > 0, 'the cart has coins waiting');
});

test('stalls fill up over time and stop at their storage cap', () => {
  const s = E.newState(T0);
  const cart = s.parks[0].b[1];
  cart.st = 0;
  const r = E.rate(s, 0, cart, T0);
  E.tick(s, 600, T0);
  assert.ok(Math.abs(cart.st - r / 6) < 1e-6, 'ten minutes of output');
  E.tick(s, 1e6, T0);
  assert.ok(Math.abs(cart.st - E.storeCap(s, 0, cart)) < 1e-6, 'capped');
});

test('collecting moves storage into cash (and ingredients for supply)', () => {
  const s = E.newState(T0);
  const before = s.cash, cart = s.parks[0].b[1];
  const r = E.collect(s, 0, cart.u);
  assert.equal(r.kind, 'cash');
  assert.equal(s.cash, before + r.amount);
  assert.ok(cart.st < 1);
  assert.equal(E.collect(s, 0, cart.u), null, 'nothing left');
  assert.equal(s.stats.collects, 1);
});

test('building takes time and a builder; decorations are instant', () => {
  const s = rich();
  const g = E.ID.garden, sp = freeSpot(s, g);
  const b = E.build(s, 0, g, sp[0], sp[1], T0);
  assert.equal(b.lv, 0);
  assert.equal(E.freeBuilders(s), 0);
  assert.match(E.canBuild(s, 0, E.ID.spice).why, /Market Hall level 3/, 'locked until hall 3');
  assert.match(E.canBuild(s, 0, E.ID.cart).why, /Market Hall/, 'one cart until the hall grows');
  assert.equal(E.rate(s, 0, b, T0), 0, 'not producing while under construction');
  const done = E.tick(s, 1, T0 + E.DEFS[g].time * 1000 + 1);
  assert.equal(done.length, 1);
  assert.equal(b.lv, 1);
  assert.equal(E.freeBuilders(s), 1);
  const ts = freeSpot(s, E.ID.table);
  const tb = E.build(s, 0, E.ID.table, ts[0], ts[1], T0);
  assert.equal(tb.lv, 1, 'decor appears at once');
});

test('cannot build on land you do not own or on top of something', () => {
  const s = rich();
  assert.equal(E.fits(s.parks[0], E.ID.table, 0, 0, -1), false, 'not owned');
  const h = E.hallB(s);
  assert.equal(E.fits(s.parks[0], E.ID.table, h.x, h.y, -1), false, 'occupied');
  assert.equal(E.build(s, 0, E.ID.table, 0, 0, T0), null);
});

test('the Market Hall gates buildings, counts and levels', () => {
  const s = rich();
  assert.equal(E.canBuild(s, 0, E.ID.dumpling).ok, false);
  assert.equal(E.maxLevel(s, E.ID.cart), 1);
  const cart = s.parks[0].b[1];
  assert.match(E.canUpgrade(s, 0, cart.u).why, /Market Hall/);
  hallTo(s, 4);
  assert.equal(E.canBuild(s, 0, E.ID.dumpling).ok, true);
  assert.equal(E.maxLevel(s, E.ID.cart), 4);
  assert.equal(E.maxCount(s, E.ID.cart), 2, 'a second cart at hall 4');
  assert.equal(E.builderCount(s), 2, 'second builder at hall 4');
  assert.ok(E.maxParcels(s) > 2 + 2);
});

test('upgrades cost cash and ingredients, take time, and raise output', () => {
  const s = rich();
  hallTo(s, 3);
  const cart = s.parks[0].b[1];
  const before = E.rate(s, 0, cart, T0), c = E.upgradeCost(cart.t, cart.lv);
  const cash = s.cash, ing = s.ing;
  assert.ok(E.startUpgrade(s, 0, cart.u, T0));
  assert.equal(s.cash, cash - c.cash);
  assert.equal(s.ing, ing - c.ing);
  assert.equal(E.startUpgrade(s, 0, cart.u, T0), false, 'already upgrading');
  assert.equal(E.rate(s, 0, cart, T0), before, 'keeps working while upgrading');
  E.tick(s, 1, T0 + c.time * 1000);
  assert.equal(cart.lv, 2);
  assert.ok(E.rate(s, 0, cart, T0) > before * 1.7);
});

test('poor players are told what they lack', () => {
  const s = E.newState(T0);
  s.cash = 0;
  assert.equal(E.canBuild(s, 0, E.ID.garden).why, 'Not enough cash');
  const h = E.hallB(s);
  s.cash = 1e9; s.ing = 0;
  assert.equal(E.canUpgrade(s, 0, h.u).why, 'Not enough ingredients');
});

test('speed-ups: free under a minute, otherwise gems', () => {
  const s = rich();
  hallTo(s, 6);
  const sp = freeSpot(s, E.ID.pizza);
  const b = E.build(s, 0, E.ID.pizza, sp[0], sp[1], T0);
  const j = E.jobFor(s, 0, b.u);
  const g = E.speedUpCost(j, T0);
  assert.ok(g > 0);
  assert.equal(E.speedUpCost(j, j.end - 30e3), 0);
  const gems = s.gems;
  assert.ok(E.speedUp(s, 0, b.u, T0));
  assert.equal(s.gems, gems - g);
  E.tick(s, 0.01, T0);
  assert.equal(b.lv, 1);
});

test('land: only next to your land, price rises, limited by the hall', () => {
  const s = rich();
  const p = s.parks[0];
  const far = 0;   // corner parcel is not adjacent
  assert.equal(E.canBuyParcel(s, 0, far).ok, false);
  const adj = [...Array(36).keys()].find(k => !p.parcels[k] && E.parcelAdjacent(p, k));
  const price = E.landPrice(s);
  const cash = s.cash;
  assert.ok(E.buyParcel(s, 0, adj));
  assert.equal(s.cash, cash - price);
  assert.ok(E.landPrice(s) > price);
  while (E.parcelCount(s) < E.maxParcels(s)) {
    const k = [...Array(36).keys()].find(k2 => E.canBuyParcel(s, 0, k2).ok);
    assert.ok(E.buyParcel(s, 0, k));
  }
  const next = [...Array(36).keys()].find(k => !p.parcels[k] && E.parcelAdjacent(p, k));
  assert.match(E.canBuyParcel(s, 0, next).why, /Market Hall/);
});

test('decorations boost nearby stalls only, up to a cap', () => {
  const s = rich();
  const p = s.parks[0], cart = p.b[1];
  const base = E.decorBonus(p, cart);
  assert.ok(base > 0, 'the starting table is next to the cart');
  p.b = p.b.filter(b => b.t !== E.ID.table);
  assert.equal(E.decorBonus(p, cart), 0);
  p.b.push({ u: 900, t: E.ID.lamp, x: cart.x + 2, y: cart.y, lv: 1, st: 0, chef: 0 });   // radius 2: counts
  p.b.push({ u: 901, t: E.ID.table, x: cart.x + 3, y: cart.y, lv: 1, st: 0, chef: 0 });  // radius 1: too far
  assert.ok(Math.abs(E.decorBonus(p, cart) - E.DEFS[E.ID.lamp].bonus) < 1e-9);
  for (let k = 0; k < 60; k++) p.b.push({ u: 1000 + k, t: E.ID.fountain, x: cart.x, y: cart.y + 1, lv: 1, st: 0, chef: 0 });
  assert.equal(E.decorBonus(p, cart), 2, 'capped at +200%');
});

test('move and sell', () => {
  const s = rich();
  const p = s.parks[0], table = p.b[2];
  const sp = freeSpot(s, E.ID.table);
  assert.ok(E.move(s, 0, table.u, sp[0], sp[1]));
  assert.deepEqual([table.x, table.y], sp);
  const hall = E.hallB(s);
  assert.equal(E.move(s, 0, table.u, hall.x, hall.y), false);
  assert.equal(E.demolish(s, 0, hall.u), false, 'only decor can be sold');
  assert.ok(E.demolish(s, 0, table.u));
});

test('a third builder can be hired with gems once', () => {
  const s = rich();
  assert.ok(E.buyBuilder(s));
  assert.equal(E.builderCount(s), 2);
  assert.equal(E.buyBuilder(s), false);
});

test('research multiplies income and is gated by the hall', () => {
  const s = rich();
  const g = E.RESEARCH.find(r => r.target === -1);
  assert.match(E.canResearch(s, g.id).why, /Market Hall/);
  hallTo(s, g.hall);
  const cart = s.parks[0].b[1], before = E.rate(s, 0, cart, T0), lv = s.level;
  assert.ok(E.research(s, g.id));
  const lvFix = (1 + (s.level - 1) * E.LEVEL_BONUS) / (1 + (lv - 1) * E.LEVEL_BONUS);   // research also gives XP
  assert.ok(Math.abs(E.rate(s, 0, cart, T0) / before / lvFix - g.mult) < 1e-9);
  assert.equal(E.research(s, g.id), false);
});

test('chefs boost stalls; favourites more', () => {
  const s = rich();
  const cart = s.parks[0].b[1], base = E.rate(s, 0, cart, T0);
  const m = E.recruit(s, T0, [0, 0, 0]);
  assert.equal(m.spec, E.ID.cart);
  assert.ok(E.assignStaff(s, m.id, 0, cart.u));
  assert.ok(Math.abs(E.rate(s, 0, cart, T0) / base - 1.3) < 1e-9);
  assert.equal(E.assignStaff(s, m.id, 0, E.hallB(s).u), false, 'only food stalls');
  assert.ok(E.upgradeStaff(s, m.id));
  assert.ok(E.dismissStaff(s, m.id));
  assert.equal(cart.chef, 0);
});

test('other parks open with the hall and pay more', () => {
  const s = rich();
  assert.equal(E.unlockPark(s, 1), false);
  hallTo(s, E.PARKS[1].hall);
  assert.ok(E.unlockPark(s, 1));
  const sp = (() => { for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) if (E.fits(s.parks[1], E.ID.table, x, y, -1)) return [x, y]; })();
  s.jobs = [];
  const b = E.build(s, 1, E.ID.cart, sp[0], sp[1], T0);
  assert.ok(b, 'can build in the new park');
  finishAll(s);
  assert.ok(Math.abs(E.rate(s, 1, b, T0) / E.rate(s, 0, s.parks[0].b[1], T0) - E.PARKS[1].mult) < 0.6);
});

test('player level from XP pays gems', () => {
  const s = E.newState(T0);
  const gems = s.gems;
  assert.equal(E.addXp(s, E.xpForLevel(1)), 1);
  assert.equal(s.gems, gems + 10);
  assert.equal(E.takeLevelUps(s), 1);
});

test('quests progress and pay out once per tier', () => {
  const s = rich();
  const q = E.questList(s).find(x => x.kind === 'hall');
  assert.equal(q.done, false);
  hallTo(s, 2);
  const g = s.gems;
  const c = E.claimQuest(s, 'hall');
  assert.ok(c && s.gems === g + c.gems);
  assert.equal(E.claimQuest(s, 'hall'), null);
});

test('offline time fills storage and finishes construction', () => {
  const s = rich();
  const sp = freeSpot(s, E.ID.garden);
  const b = E.build(s, 0, E.ID.garden, sp[0], sp[1], T0);
  const done = E.tick(s, 8 * 3600, T0 + 8 * 3600e3);
  assert.equal(done.length, 1);
  assert.equal(b.lv, 1);
  assert.ok(s.parks[0].b[1].st >= E.storeCap(s, 0, s.parks[0].b[1]) - 1e-6);
});

test('reward crate: free every 4 hours, otherwise gems', () => {
  const s = E.newState(T0);
  assert.ok(E.openCrate(s, T0, [0.1, 0.5, 0, 0]));
  const g = s.gems;
  assert.ok(E.openCrate(s, T0 + 1, [0.4, 0.5, 0, 0]), 'paid with gems');
  assert.equal(s.gems, g - E.COST.crate);
  s.gems = 0;
  assert.equal(E.openCrate(s, T0 + 2, [0.1, 0, 0, 0]), null);
  assert.ok(E.crateStatus(s, T0 + 5 * 3600e3).free);
});

test('daily reward once a day', () => {
  const s = E.newState(T0);
  const d1 = E.claimDaily(s, T0);
  assert.ok(d1 && d1.streak === 1);
  assert.equal(E.claimDaily(s, T0 + 1000), null);
  assert.equal(E.claimDaily(s, T0 + 86400e3).streak, 2);
});

test('VIP, tips and boost', () => {
  const s = E.newState(T0);
  assert.equal(E.vipReward(s, T0, 0.1).type, 'frenzy');
  assert.ok(E.globalMult(s, T0 + 1000) >= E.FRENZY_MULT);
  const c = s.cash;
  assert.ok(E.tip(s) > 0 && s.cash > c);
  s.gems = E.COST.boost;
  assert.ok(E.buyBoost(s, T0));
});

test('save round-trips; junk and old saves load safely', () => {
  const s = rich();
  hallTo(s, 3);
  const sp = freeSpot(s, E.ID.garden);
  E.build(s, 0, E.ID.garden, sp[0], sp[1], T0);
  E.recruit(s, T0, [0.5, 0.5, 0.5]);
  E.takeLevelUps(s);
  const again = E.loadState(JSON.parse(JSON.stringify(s)), T0);
  assert.deepEqual(again, s);
  const junk = E.loadState({ v: 3, cash: 'x', parks: [{ parcels: [], b: [{ t: 99 }, { t: 1, x: 0, y: 0 }, null] }], jobs: [{ u: 5 }], staff: [null] }, T0);
  assert.ok(E.hallB(junk), 'always has a hall');
  assert.equal(junk.parks[0].b.filter(b => b.t === 1 && b.x === 0).length, 0, 'buildings outside your land are dropped');
  assert.equal(junk.jobs.length, 0);
  const old = E.loadState({ v: 2, gems: 120, cash: 9e9, premium: true }, T0);
  assert.equal(old.gems, 120);
  assert.equal(old.premium, true);
  assert.equal(old.cash, 200, 'old idle saves start a fresh park');
});

test('number formatting', () => {
  assert.equal(E.formatMoney(0), '$0');
  assert.equal(E.formatMoney(1234), '$1.23K');
  assert.equal(E.formatMoney(999999), '$1.00M');
  assert.equal(E.formatTime(61), '1m 01s');
  assert.equal(E.formatTime(90000), '1d 1h');
});

test('a fully built park never produces NaN or Infinity', () => {
  const s = rich();
  hallTo(s, E.HALL_MAX);
  while (true) { const k = [...Array(36).keys()].find(k2 => E.canBuyParcel(s, 0, k2).ok); if (k === undefined) break; E.buyParcel(s, 0, k); }
  E.DEFS.forEach((d, t) => { while (E.canBuild(s, 0, t).ok) { s.jobs = []; const sp = freeSpot(s, t); if (!sp) break; E.build(s, 0, t, sp[0], sp[1], T0); finishAll(s); } });
  s.parks[0].b.forEach(b => { while (E.canUpgrade(s, 0, b.u).ok) { s.jobs = []; E.startUpgrade(s, 0, b.u, T0); finishAll(s); } });
  E.RESEARCH.forEach(r => E.research(s, r.id));
  E.tick(s, 1e6, T0);
  const tot = E.totals(s, T0);
  assert.ok(Number.isFinite(tot.cash) && tot.cash > 0 && Number.isFinite(s.cash));
  assert.ok(s.parks[0].b.length > 60, 'lots of buildings fit: ' + s.parks[0].b.length);
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
