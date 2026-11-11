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

test('new game starts with one noodle cart and no cash', () => {
  const s = E.newState(T0);
  assert.equal(s.biz[0].level, 1);
  assert.equal(s.cash, 0);
  assert.ok(s.biz.slice(1).every(b => b.level === 0));
});

test('tapping cooks one meal, then stops', () => {
  const s = E.newState(T0);
  assert.equal(E.tap(s, 0), true);
  assert.equal(E.tap(s, 0), false, 'cannot tap while cooking');
  E.tick(s, 1.01, T0);
  assert.equal(s.cash, E.BUSINESSES[0].baseRevenue);
  assert.equal(s.biz[0].running, false);
  E.tick(s, 5, T0);
  assert.equal(s.cash, E.BUSINESSES[0].baseRevenue, 'no income without tap or manager');
});

test('managers earn every cycle, including multiple cycles in one tick', () => {
  const s = E.newState(T0);
  s.cash = 1e6;
  assert.ok(E.hireManager(s, 0));
  const before = s.cash;
  E.tick(s, 10.5, T0);
  assert.equal(s.cash - before, 10 * E.BUSINESSES[0].baseRevenue);
  assert.ok(Math.abs(s.biz[0].progress - 0.5) < 1e-9);
});

test('cost formula matches summing individual levels', () => {
  for (let i = 0; i < E.BUSINESSES.length; i++) {
    let sum = 0;
    for (let k = 0; k < 37; k++) sum += E.costFor(i, 12 + k, 1);
    const bulk = E.costFor(i, 12, 37);
    assert.ok(Math.abs(sum - bulk) / bulk < 1e-9, E.BUSINESSES[i].name);
  }
});

test('maxAffordable is exact', () => {
  for (const cash of [3, 50, 1234.5, 9e9, 3.3e21]) {
    for (const lvl of [0, 7, 120]) {
      const n = E.maxAffordable(0, lvl, cash);
      assert.ok(E.costFor(0, lvl, n) <= cash);
      assert.ok(E.costFor(0, lvl, n + 1) > cash);
    }
  }
});

test('buy modes: x1, x10, x100, next milestone, max', () => {
  const s = E.newState(T0);
  s.cash = 1e12;
  assert.equal(E.buy(s, 0, 0), 1);   // -> 2
  assert.equal(E.buy(s, 0, 1), 10);  // -> 12
  assert.equal(E.buy(s, 0, 3), 13);  // -> 25 (next milestone)
  assert.equal(s.biz[0].level, 25);
  assert.equal(E.buy(s, 0, 2), 100); // -> 125
  const n = E.buy(s, 0, 4);
  assert.ok(n > 0 && E.costFor(0, s.biz[0].level, 1) > s.cash);
});

test('cannot buy what you cannot afford', () => {
  const s = E.newState(T0);
  assert.equal(E.buy(s, 1, 0), 0);
  assert.equal(s.biz[1].level, 0);
  assert.equal(s.cash, 0);
});

test('milestones double speed then multiply profit', () => {
  assert.equal(E.milestoneInfo(24).speed, 1);
  assert.equal(E.milestoneInfo(25).speed, 2);
  assert.equal(E.milestoneInfo(100).speed, 8);
  assert.equal(E.milestoneInfo(500).speed, 128);
  assert.equal(E.milestoneInfo(600).profit, 4);
  assert.equal(E.milestoneInfo(1000).next, null);
});

test('upgrades triple the right business', () => {
  const s = E.newState(T0);
  const u = E.UPGRADES.find(x => x.biz === 0);
  const before = E.revenuePerCycle(s, 0, T0);
  s.cash = u.cost;
  assert.ok(E.buyUpgrade(s, u.id));
  assert.equal(E.revenuePerCycle(s, 0, T0), before * 3);
  assert.equal(E.buyUpgrade(s, u.id), false, 'cannot buy twice');
});

test('offline earnings only count managed businesses and are capped', () => {
  const s = E.newState(T0);
  s.lastSeen = T0;
  assert.equal(E.computeOffline(s, T0 + 3600e3).amount, 0, 'no managers -> nothing');
  s.biz[0].manager = true;
  const ips = E.incomePerSec(s, T0, { managedOnly: true, noTimed: true });
  const off = E.computeOffline(s, T0 + 3600e3);
  assert.ok(Math.abs(off.amount - ips * 3600) < 1e-6);
  const capped = E.computeOffline(s, T0 + 100 * 3600e3);
  assert.equal(capped.seconds, E.OFFLINE_CAP_SEC);
});

test('franchise grants stars, resets progress, keeps achievements', () => {
  const s = E.newState(T0);
  s.lifetime = 1e13; s.cash = 5e9; s.biz[3].level = 40; s.upgrades.g0 = true;
  s.achievements.earn_1000 = true;
  const expected = E.claimableStars(s);
  assert.ok(expected >= 1);
  assert.equal(E.prestige(s), expected);
  assert.equal(s.stars, expected);
  assert.equal(s.cash, 0);
  assert.equal(s.biz[3].level, 0);
  assert.equal(s.biz[0].level, 1);
  assert.deepEqual(s.upgrades, {});
  assert.ok(s.achievements.earn_1000);
  assert.equal(E.claimableStars(s), 0, 'no double-claim');
  assert.equal(E.prestige(s), 0);
});

test('stars boost profit', () => {
  const s = E.newState(T0);
  const base = E.revenuePerCycle(s, 0, T0);
  s.stars = 50;
  assert.ok(Math.abs(E.revenuePerCycle(s, 0, T0) - base * (1 + 50 * E.STAR_BONUS)) < 1e-9);
});

test('boost doubles profit and is capped at 24h', () => {
  const s = E.newState(T0);
  const base = E.revenuePerCycle(s, 0, T0);
  E.addBoost(s, T0);
  assert.equal(E.revenuePerCycle(s, 0, T0 + 1000), base * 2);
  assert.equal(E.revenuePerCycle(s, 0, T0 + E.BOOST_DURATION_MS + 1), base);
  for (let k = 0; k < 10; k++) E.addBoost(s, T0);
  assert.equal(s.boostUntil, T0 + 24 * 3600e3);
});

test('daily reward: once per day, streak grows and resets', () => {
  const s = E.newState(T0);
  const day = 86400e3;
  assert.equal(E.claimDaily(s, T0).streak, 1);
  assert.equal(E.claimDaily(s, T0 + 1000), null, 'only once per day');
  assert.equal(E.claimDaily(s, T0 + day).streak, 2);
  assert.equal(E.claimDaily(s, T0 + 4 * day).streak, 1, 'missed days reset the streak');
});

test('VIP rewards cash or frenzy', () => {
  const s = E.newState(T0);
  const cash = E.vipReward(s, T0, 0.9);
  assert.equal(cash.type, 'cash');
  assert.ok(s.cash > 0);
  const fr = E.vipReward(s, T0, 0.1);
  assert.equal(fr.type, 'frenzy');
  assert.equal(E.timedMult(s, T0 + 1000), E.FRENZY_MULT);
  assert.equal(s.stats.golden, 2);
});

test('achievements unlock once', () => {
  const s = E.newState(T0);
  s.lifetime = 2e6;
  const first = E.checkAchievements(s).map(a => a.id);
  assert.ok(first.includes('earn_1000') && first.includes('earn_1000000'));
  assert.equal(E.checkAchievements(s).length, 0);
});

test('save round-trips and tolerates junk', () => {
  const s = E.newState(T0);
  s.cash = 123; s.biz[2].level = 7; s.biz[2].manager = true; s.upgrades.g0 = true; s.stars = 9;
  const loaded = E.loadState(JSON.parse(JSON.stringify(s)), T0);
  assert.deepEqual(loaded, s);
  const junk = E.loadState({ cash: 'lots', biz: [null, { level: -5 }], upgrades: { hacked: true }, stats: { taps: NaN } }, T0);
  assert.equal(junk.cash, 0);
  assert.equal(junk.biz[1].level, 0);
  assert.deepEqual(junk.upgrades, {});
  assert.equal(junk.stats.taps, 0);
  assert.equal(E.loadState(null, T0).biz[0].level, 1);
});

test('number formatting', () => {
  assert.equal(E.formatMoney(0), '$0');
  assert.equal(E.formatMoney(1.5), '$1.5');
  assert.equal(E.formatMoney(999), '$999');
  assert.equal(E.formatMoney(1234), '$1.23K');
  assert.equal(E.formatMoney(999999), '$1.00M');
  assert.equal(E.formatMoney(999499), '$999.5K');
  assert.equal(E.formatMoney(2.5e9), '$2.50B');
  assert.equal(E.formatMoney(1e36), '$1.00UDc');
  assert.ok(/^\$\d/.test(E.formatMoney(1e200)));
  assert.equal(E.formatTime(59), '59s');
  assert.equal(E.formatTime(61), '1m 01s');
  assert.equal(E.formatTime(3725), '1h 02m');
});

test('long session never produces NaN or Infinity', () => {
  const s = E.newState(T0);
  s.cash = 1e300;
  for (let i = 0; i < E.BUSINESSES.length; i++) { E.buy(s, i, 4); s.biz[i].manager = true; }
  E.UPGRADES.forEach(u => E.buyUpgrade(s, u.id));
  for (let k = 0; k < 1000; k++) E.tick(s, 0.25, T0);
  assert.ok(Number.isFinite(s.cash) && Number.isFinite(s.lifetime));
});

console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
