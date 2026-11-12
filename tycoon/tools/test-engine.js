#!/usr/bin/env node
// Unit tests for the game engine. Run: npm test
const assert = require('node:assert/strict');
const E = require('../www/js/engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}
const T0 = 1_700_000_000_000;
const rich = () => { const s = E.newState(T0); s.cash = 1e40; return s; };

test('new game: one noodle cart on the free starter plot, nothing else', () => {
  const s = E.newState(T0);
  assert.equal(E.shopCount(s), 1);
  assert.equal(s.plots[0][0].t, 0);
  assert.equal(s.plots[0][0].level, 1);
  assert.equal(s.cash, 0);
  assert.deepEqual(s.districts, [true, false, false, false]);
});

test('tapping serves one customer, then stops', () => {
  const s = E.newState(T0);
  assert.equal(E.tap(s, 0, 0), true);
  assert.equal(E.tap(s, 0, 0), false, 'cannot tap while cooking');
  const out = E.tick(s, E.TYPES[0].time + 0.01, T0);
  assert.equal(out.length, 1);
  assert.equal(s.cash, E.TYPES[0].baseRevenue);
  E.tick(s, 10, T0);
  assert.equal(s.cash, E.TYPES[0].baseRevenue, 'no income without a tap or a manager');
});

test('managers earn every cycle, including several cycles in one tick', () => {
  const s = E.newState(T0);
  s.cash = 1e6;
  assert.ok(E.hireManager(s, 0, 0));
  const before = s.cash;
  E.tick(s, 10.5 * E.TYPES[0].time, T0);
  assert.equal(s.cash - before, 10 * E.TYPES[0].baseRevenue);
});

test('level cost: bulk formula equals the sum, and maxAffordable is exact', () => {
  for (let t = 0; t < E.TYPES.length; t++) {
    let sum = 0;
    for (let k = 0; k < 30; k++) sum += E.costFor(t, 12 + k, 1);
    assert.ok(Math.abs(sum - E.costFor(t, 12, 30)) / sum < 1e-9);
  }
  for (const cash of [3, 1234.5, 9e9]) {
    const n = E.maxAffordable(0, 7, cash);
    assert.ok(E.costFor(0, 7, n) <= cash && E.costFor(0, 7, n + 1) > cash);
  }
});

test('buy modes level a shop up and grant XP', () => {
  const s = rich();
  assert.equal(E.buy(s, 0, 0, 0), 1);
  assert.equal(E.buy(s, 0, 0, 1), 10);
  assert.equal(E.buy(s, 0, 0, 3), 13, 'next milestone');
  assert.equal(s.plots[0][0].level, 25);
  assert.ok(s.xp > 0 || s.level > 1);
  const poor = E.newState(T0);
  assert.equal(E.buy(poor, 0, 0, 0), 0);
});

test('land: buy a plot, then choose what to build; new shops start at level 1', () => {
  const s = E.newState(T0);
  assert.equal(E.buyLand(s, 0, 1), false, 'cannot afford');
  s.cash = E.landPrice(0, 1);
  assert.ok(E.buyLand(s, 0, 1));
  assert.equal(s.plots[0][1].t, -1);
  assert.equal(E.buyLand(s, 0, 1), false, 'already owned');
  assert.equal(E.build(s, 0, 1, 1), false, 'cannot afford the dumpling stand');
  s.cash = 1e6;
  assert.ok(E.build(s, 0, 1, 1));
  assert.equal(s.plots[0][1].level, 1);
  assert.equal(E.build(s, 0, 1, 2), false, 'plot is taken');
});

test('bigger shops need bigger land and later districts', () => {
  assert.equal(E.canBuildOn(0, 0, 0), true);
  assert.equal(E.canBuildOn(0, 0, 3), false, 'taco truck needs Medium land');
  assert.equal(E.canBuildOn(0, 3, 3), true);
  assert.equal(E.canBuildOn(0, 5, 6), false, 'burger chain needs the town');
  assert.equal(E.canBuildOn(1, 1, 6), true);
  assert.equal(E.canBuildOn(1, 7, 9), false, 'global cuisine needs the metropolis');
  assert.equal(E.canBuildOn(3, 11, 9), true);
});

test('a second shop of the same kind costs more; bigger land earns more', () => {
  const s = rich();
  const c1 = E.buildCost(s, 1);
  E.buyLand(s, 0, 1); E.build(s, 0, 1, 1);
  assert.equal(E.buildCost(s, 1), c1 * 5);
  E.buyLand(s, 0, 3); E.build(s, 0, 3, 1);
  const small = E.revenuePerCycle(s, 0, 1, T0), medium = E.revenuePerCycle(s, 0, 3, T0);
  assert.ok(Math.abs(medium / small - E.SIZES[1].mult) < 1e-9);
});

test('districts unlock in order and boost profit', () => {
  const s = E.newState(T0);
  assert.equal(E.unlockDistrict(s, 1), false, 'too expensive');
  s.cash = 1e40;
  assert.equal(E.unlockDistrict(s, 2), false, 'must unlock the town first');
  assert.ok(E.unlockDistrict(s, 1));
  assert.equal(E.buyLand(s, 2, 0), false, 'city still locked');
  E.buyLand(s, 0, 1); E.build(s, 0, 1, 0);
  E.buyLand(s, 1, 0); E.build(s, 1, 0, 0);
  assert.ok(Math.abs(E.revenuePerCycle(s, 1, 0, T0) / E.revenuePerCycle(s, 0, 1, T0) - E.DISTRICTS[1].mult) < 1e-9);
});

test('demolish frees the land but never your last shop', () => {
  const s = rich();
  assert.equal(E.demolish(s, 0, 0), false);
  E.buyLand(s, 0, 1); E.build(s, 0, 1, 0);
  assert.ok(E.demolish(s, 0, 1));
  assert.equal(s.plots[0][1].t, -1);
});

test('milestones double speed then multiply profit; empire milestones double everything', () => {
  assert.equal(E.milestoneInfo(25).speed, 2);
  assert.equal(E.milestoneInfo(500).speed, 128);
  assert.equal(E.milestoneInfo(600).profit, 4);
  const s = E.newState(T0);
  assert.equal(E.empireInfo(s).mult, 1);
  s.plots[0][0].level = E.EMPIRE_MILESTONES[1];
  assert.equal(E.empireInfo(s).mult, 4);
});

test('research triples every shop of that kind', () => {
  const s = E.newState(T0);
  const u = E.UPGRADES.find(x => x.biz === 0);
  const before = E.revenuePerCycle(s, 0, 0, T0);
  s.cash = u.cost;
  assert.ok(E.buyUpgrade(s, u.id));
  assert.equal(E.revenuePerCycle(s, 0, 0, T0), before * 3);
  assert.equal(E.buyUpgrade(s, u.id), false);
});

test('chefs: recruit (free, then gems), assign, specialty bonus, level up, dismiss', () => {
  const s = E.newState(T0);
  const base = E.revenuePerCycle(s, 0, 0, T0);
  const m = E.recruit(s, T0, [0, 0.1, 0]);           // common, specialty: noodle cart
  assert.ok(m && m.rarity === 0 && m.spec === 0);
  assert.equal(s.gems, 20, 'first recruit is free');
  assert.ok(E.assignStaff(s, m.id, 0, 0));
  assert.ok(Math.abs(E.revenuePerCycle(s, 0, 0, T0) / base - (1 + 0.2 * 1.5)) < 1e-9);
  const g = s.gems;
  assert.ok(E.upgradeStaff(s, m.id));
  assert.equal(s.gems, g - E.staffUpgradeCost({ rarity: 0, level: 1 }));
  s.gems = 0;
  assert.equal(E.recruit(s, T0 + 1000, [0.99, 0, 0]), null, 'no gems, cooldown running');
  s.gems = E.COST.recruit;
  const legend = E.recruit(s, T0 + 1000, [0.999, 0.5, 0.5]);
  assert.equal(legend.rarity, 3);
  E.assignStaff(s, legend.id, 0, 0);
  assert.equal(s.plots[0][0].chef, legend.id, 'one chef per shop');
  assert.ok(E.dismissStaff(s, legend.id));
  assert.equal(s.plots[0][0].chef, 0);
});

test('player level: XP levels you up, pays gems and boosts profit', () => {
  const s = E.newState(T0);
  const base = E.revenuePerCycle(s, 0, 0, T0), gems = s.gems;
  assert.equal(E.addXp(s, E.xpForLevel(1)), 1);
  assert.equal(s.level, 2);
  assert.equal(s.gems, gems + 5);
  assert.equal(E.takeLevelUps(s), 1);
  assert.equal(E.takeLevelUps(s), 0);
  assert.ok(Math.abs(E.revenuePerCycle(s, 0, 0, T0) / base - (1 + E.LEVEL_BONUS)) < 1e-9);
});

test('quests: progress, claim once, then the next tier', () => {
  const s = E.newState(T0);
  let q = E.questList(s).find(x => x.kind === 'taps');
  assert.equal(q.done, false);
  assert.equal(E.claimQuest(s, 'taps'), null);
  s.stats.taps = q.target;
  const gems = s.gems;
  const done = E.claimQuest(s, 'taps');
  assert.ok(done && s.gems === gems + done.gems);
  q = E.questList(s).find(x => x.kind === 'taps');
  assert.ok(q.target > done.target && !q.done);
});

test('reward crate: free every 4 hours, otherwise gems; all four prizes work', () => {
  const s = E.newState(T0);
  s.plots[0][0].manager = true;
  assert.equal(E.openCrate(s, T0, [0.1, 0.5, 0, 0]).type, 'cash');
  assert.equal(E.crateStatus(s, T0 + 1000).free, false);
  s.gems = E.COST.crate * 3;
  assert.equal(E.openCrate(s, T0 + 1000, [0.5, 0.5, 0, 0]).type, 'gems');
  assert.equal(E.openCrate(s, T0 + 1000, [0.8, 0.5, 0, 0]).type, 'boost');
  assert.equal(E.openCrate(s, T0 + 1000, [0.95, 0.5, 0.5, 0.5]).type, 'staff');
  s.gems = 0;
  assert.equal(E.openCrate(s, T0 + 1000, [0.1, 0, 0, 0]), null);
  assert.ok(E.crateStatus(s, T0 + 5 * 3600e3).free);
});

test('gems buy a boost and a time warp', () => {
  const s = E.newState(T0);
  s.plots[0][0].manager = true;
  s.gems = E.COST.boost + E.COST.warp;
  assert.ok(E.buyBoost(s, T0));
  assert.equal(E.timedMult(s, T0 + 1000), 2);
  assert.ok(E.timeWarp(s, T0) > 0);
  assert.equal(s.gems, 0);
  assert.equal(E.timeWarp(s, T0), 0);
});

test('offline earnings count managed shops only and are capped', () => {
  const s = E.newState(T0);
  s.lastSeen = T0;
  assert.equal(E.computeOffline(s, T0 + 3600e3).amount, 0);
  s.plots[0][0].manager = true;
  const ips = E.incomePerSec(s, T0, { managedOnly: true, noTimed: true });
  assert.ok(Math.abs(E.computeOffline(s, T0 + 3600e3).amount - ips * 3600) < 1e-6);
  assert.equal(E.computeOffline(s, T0 + 100 * 3600e3).seconds, E.OFFLINE_CAP_SEC);
});

test('franchise: stars for a fresh start; gems, chefs, level and achievements stay', () => {
  const s = rich();
  s.lifetime = 1e16; s.gems = 77; s.level = 9;
  E.recruit(s, T0, [0, 0, 0]);
  E.unlockDistrict(s, 1); E.buyLand(s, 1, 0); E.build(s, 1, 0, 2);
  s.upgrades.g0 = true; s.achievements.earn_1000 = true;
  const expected = E.claimableStars(s);
  assert.ok(expected >= 1);
  assert.equal(E.prestige(s), expected);
  assert.equal(s.cash, 0);
  assert.equal(E.shopCount(s), 1);
  assert.deepEqual(s.districts, [true, false, false, false]);
  assert.deepEqual(s.upgrades, {});
  assert.equal(s.gems, 77);
  assert.equal(s.level, 9);
  assert.equal(s.staff.length, 1);
  assert.ok(s.achievements.earn_1000);
  assert.equal(E.prestige(s), 0, 'no double claim');
});

test('daily reward: once a day with gems; streak grows and resets', () => {
  const s = E.newState(T0);
  const day = 86400e3, gems = s.gems;
  const d1 = E.claimDaily(s, T0);
  assert.equal(d1.streak, 1);
  assert.equal(s.gems, gems + d1.gems);
  assert.equal(E.claimDaily(s, T0 + 1000), null);
  assert.equal(E.claimDaily(s, T0 + day).streak, 2);
  assert.equal(E.claimDaily(s, T0 + 4 * day).streak, 1);
});

test('VIP pays cash or a frenzy, sometimes gems', () => {
  const s = E.newState(T0);
  assert.equal(E.vipReward(s, T0, 0.5).type, 'cash');
  assert.equal(E.vipReward(s, T0, 0.1).type, 'frenzy');
  const gems = s.gems;
  assert.ok(E.vipReward(s, T0, 0.95).gems > 0 && s.gems > gems);
});

test('achievements unlock once and pay gems', () => {
  const s = E.newState(T0);
  s.lifetime = 2e6;
  const gems = s.gems;
  const first = E.checkAchievements(s).map(a => a.id);
  assert.ok(first.includes('earn_1000') && first.includes('earn_1000000'));
  assert.equal(s.gems, gems + 5 * first.length);
  assert.equal(E.checkAchievements(s).length, 0);
});

test('save round-trips; junk and old saves load safely', () => {
  const s = rich();
  E.buyLand(s, 0, 1); E.build(s, 0, 1, 2);
  const m = E.recruit(s, T0, [0.7, 0.3, 0.3]);
  E.assignStaff(s, m.id, 0, 1);
  s.upgrades.g0 = true; s.quests.taps = 2; s.cash = 123;
  E.takeLevelUps(s);
  assert.deepEqual(E.loadState(JSON.parse(JSON.stringify(s)), T0), s);
  const junk = E.loadState({ v: 2, cash: 'lots', plots: [[{ t: 99 }, 'x', { t: 1, level: -4, chef: 55 }]], staff: [null, { id: 'a' }], upgrades: { hacked: 1 } }, T0);
  assert.equal(junk.cash, 0);
  assert.equal(junk.plots[0][0].t, -1);
  assert.equal(junk.plots[0][2].level, 1);
  assert.equal(junk.plots[0][2].chef, 0);
  assert.equal(junk.staff.length, 0);
  assert.deepEqual(junk.upgrades, {});
  assert.ok(E.shopCount(junk) >= 1);
  const old = E.loadState({ cash: 500, stars: 7, lifetime: 1e9, biz: [{ level: 40 }], achievements: { earn_1000: true } }, T0);
  assert.equal(old.cash, 500);
  assert.equal(old.stars, 7);
  assert.equal(E.shopCount(old), 1);
  assert.ok(old.achievements.earn_1000);
});

test('number formatting', () => {
  assert.equal(E.formatMoney(0), '$0');
  assert.equal(E.formatMoney(999), '$999');
  assert.equal(E.formatMoney(1234), '$1.23K');
  assert.equal(E.formatMoney(999999), '$1.00M');
  assert.equal(E.formatMoney(2.5e9), '$2.50B');
  assert.equal(E.formatTime(61), '1m 01s');
  assert.equal(E.formatTime(3725), '1h 02m');
});

test('a maxed-out empire never produces NaN or Infinity', () => {
  const s = rich();
  for (let d = 0; d < E.DISTRICTS.length; d++) {
    if (d) E.unlockDistrict(s, d);
    for (let p = 0; p < E.DISTRICTS[d].plots.length; p++) {
      E.buyLand(s, d, p);
      for (let t = E.TYPES.length - 1; t >= 0; t--) if (E.build(s, d, p, t)) break;
      if (E.shopAt(s, d, p)) { s.plots[d][p].level = 1000; s.plots[d][p].manager = true; }
    }
  }
  assert.equal(E.shopCount(s), 36);
  E.UPGRADES.forEach(u => E.buyUpgrade(s, u.id));
  s.stars = 1e6;
  for (let k = 0; k < 500; k++) E.tick(s, 0.25, T0);
  assert.ok(Number.isFinite(s.cash) && Number.isFinite(s.lifetime) && Number.isFinite(E.incomePerSec(s, T0)));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
