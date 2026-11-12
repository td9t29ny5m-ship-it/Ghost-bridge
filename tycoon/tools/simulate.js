#!/usr/bin/env node
/*
 * Balance simulator: a greedy bot plays Yum Empire and prints pacing milestones.
 * Usage: node tools/simulate.js [hoursPerRun=2] [runs=3]
 */
const E = require('../www/js/engine.js');

const HOURS = parseFloat(process.argv[2] || '2');
const RUNS = parseInt(process.argv[3] || '3', 10);

function income(s, now) {
  // The bot taps every unmanaged shop, so count all shops.
  return E.incomePerSec(s, now, { noTimed: true }) + 1e-9;
}

function bestAction(s, now) {
  const base = income(s, now);
  let best = null;
  const consider = (cost, gain, act, label) => {
    if (!(cost > 0) || !(gain > 0)) return;
    const score = cost / gain + Math.max(0, cost - s.cash) / base;
    if (!best || score < best.score) best = { score, cost, act, label };
  };
  // Build on empty land first: the best type the land allows that we can pay for
  for (let d = 0; d < s.plots.length; d++) for (let p = 0; p < s.plots[d].length; p++) {
    const x = s.plots[d][p];
    if (!x || x.t !== -1) continue;
    for (let t = E.TYPES.length - 1; t >= 0; t--) {
      if (!E.canBuildOn(d, p, t)) continue;
      const cost = E.buildCost(s, t);
      if (cost > s.cash) continue;
      return { cost, label: `Build ${E.TYPES[t].name} in ${E.DISTRICTS[d].name}`, act: st => E.build(st, d, p, t) };
    }
  }
  E.eachShop(s, (sh, d, p) => {
    const nx = E.milestoneInfo(sh.level).next;
    const n = nx ? Math.min(nx - sh.level, 25) : 1;
    const cost = E.costFor(sh.t, sh.level, n);
    const before = E.revenuePerCycle(s, d, p, now, { noTimed: true }) / E.cycleTime(s, d, p);
    sh.level += n;
    const after = E.revenuePerCycle(s, d, p, now, { noTimed: true }) / E.cycleTime(s, d, p);
    sh.level -= n;
    consider(cost, after - before, st => { const x = st.plots[d][p]; st.cash -= E.costFor(x.t, x.level, n); x.level += n; E.addXp(st, n); }, `Level ${E.TYPES[sh.t].name}`);
    if (!sh.manager) consider(E.TYPES[sh.t].managerCost, base, st => E.hireManager(st, d, p), `Manager for ${E.TYPES[sh.t].name}`);
  });
  for (const u of E.availableUpgrades(s).slice(0, 6)) {
    s.upgrades[u.id] = true;
    const gain = income(s, now) - base;
    delete s.upgrades[u.id];
    consider(u.cost, gain, st => E.buyUpgrade(st, u.id), `Research ${u.name}`);
  }
  // Land and districts: valued as a share of current income (a new shop grows into it)
  for (let d = 0; d < s.plots.length; d++) {
    if (!s.districts[d]) {
      if (s.districts[d - 1]) consider(E.DISTRICTS[d].cost, base * 0.6, st => E.unlockDistrict(st, d), `UNLOCK ${E.DISTRICTS[d].name}`);
      continue;
    }
    for (let p = 0; p < s.plots[d].length; p++) {
      if (s.plots[d][p]) continue;
      consider(Math.max(1, E.landPrice(d, p)), base * 0.3, st => E.buyLand(st, d, p), `Land ${E.SIZES[E.DISTRICTS[d].plots[p].size].id} in ${E.DISTRICTS[d].name}`);
      break; // cheapest plot of the district only
    }
  }
  return best;
}

let s = E.newState(0);
let t = 0;
const log = [];
const mark = (msg) => log.push(`${E.formatTime(t).padStart(8)}  ${msg}`);

for (let run = 0; run < RUNS; run++) {
  const end = t + HOURS * 3600;
  const seen = new Set();
  while (t < end) {
    E.eachShop(s, (sh, d, p) => { if (!sh.manager) E.tap(s, d, p); });
    E.tick(s, 1, t * 1000);
    t += 1;
    for (let k = 0; k < 20; k++) {
      const a = bestAction(s, t * 1000);
      if (!a || a.cost > s.cash) break;
      a.act(s);
      if (/Build|UNLOCK|Land/.test(a.label) && !seen.has(a.label + E.shopCount(s))) { seen.add(a.label + E.shopCount(s)); if (run === 0 || /UNLOCK/.test(a.label)) mark(`Run ${run + 1}: ${a.label}`); }
    }
    E.checkAchievements(s);
    if (t % 1800 === 0) {
      mark(`Run ${run + 1}: cash ${E.formatMoney(s.cash)}  ${E.formatMoney(income(s, t * 1000))}/s  shops ${E.shopCount(s)}  ⭐+${E.claimableStars(s)}  Lv${s.level}  💎${s.gems}  levels ${E.totalLevels(s)}`);
    }
  }
  const gain = E.prestige(s);
  mark(`=== Franchise #${run + 1}: +${gain} stars (total ${s.stars}) ===`);
}
console.log(log.join('\n'));
