#!/usr/bin/env node
/*
 * Balance simulator: a greedy bot plays Yum Empire and prints pacing milestones.
 * Usage: node tools/simulate.js [hours=3] [runs=2]
 */
const E = require('../www/js/engine.js');

const HOURS = parseFloat(process.argv[2] || '3');
const RUNS = parseInt(process.argv[3] || '2', 10);

function bestAction(s, now) {
  const base = E.incomePerSec(s, now, { noTimed: true }) + 1e-9;
  let best = null;
  const consider = (cost, gain, act, label) => {
    if (cost <= 0 || gain <= 0) return;
    // Payback time, plus time spent waiting for the cash
    const wait = Math.max(0, cost - s.cash) / base;
    const score = cost / gain + wait;
    if (!best || score < best.score) best = { score, cost, act, label };
  };
  E.BUSINESSES.forEach((b, i) => {
    if (!E.isUnlocked(s, i) && s.biz[i].level === 0) return;
    const lvl = s.biz[i].level;
    const nx = E.milestoneInfo(lvl).next;
    const n = nx ? Math.min(nx - lvl, 25) : 1;
    const cost = E.costFor(i, lvl, n);
    const clone = JSON.parse(JSON.stringify(s));
    clone.biz[i].level += n;
    clone.biz[i].manager = true;
    const gain = E.incomePerSec(clone, now, { noTimed: true }) - base;
    consider(cost, gain, st => { st.cash -= E.costFor(i, st.biz[i].level, n); st.biz[i].level += n; }, `${b.name} +${n}`);
    if (!s.biz[i].manager && lvl > 0) {
      // A manager is effectively mandatory; give it a strong preference.
      consider(b.managerCost, base, st => E.hireManager(st, i), `Manager ${b.managerName}`);
    }
  });
  for (const u of E.availableUpgrades(s).slice(0, 6)) {
    const clone = JSON.parse(JSON.stringify(s));
    clone.upgrades[u.id] = true;
    clone.biz.forEach(b => (b.manager = true));
    const gain = E.incomePerSec(clone, now, { noTimed: true }) - base;
    consider(u.cost, gain, st => E.buyUpgrade(st, u.id), `Upgrade ${u.name}`);
  }
  return best;
}

let s = E.newState(0);
let t = 0;
const dt = 1;
const log = [];
const mark = (msg) => log.push(`${E.formatTime(t).padStart(8)}  ${msg}`);
const seen = new Set();

for (let run = 0; run < RUNS; run++) {
  const end = t + HOURS * 3600;
  let lastStarsReport = 0;
  while (t < end) {
    // Bot taps every unmanaged business
    s.biz.forEach((b, i) => { if (!b.manager) E.tap(s, i); });
    E.tick(s, dt, t * 1000);
    t += dt;
    for (let k = 0; k < 20; k++) {
      const a = bestAction(s, t * 1000);
      if (!a || a.cost > s.cash) break;
      a.act(s);
      if (!seen.has(a.label) && /Manager|Upgrade/.test(a.label)) { seen.add(a.label); if (seen.size < 25) mark(a.label); }
    }
    E.BUSINESSES.forEach((b, i) => {
      const key = `own${run}_${i}`;
      if (s.biz[i].level > 0 && !seen.has(key)) { seen.add(key); mark(`Run ${run + 1}: bought first ${b.name}`); }
    });
    E.checkAchievements(s);
    const stars = E.claimableStars(s);
    if (t % 900 === 0) {
      mark(`Run ${run + 1}: cash ${E.formatMoney(s.cash)}  ips ${E.formatMoney(E.incomePerSec(s, t * 1000))}/s  claimable⭐ ${stars}  levels ${s.biz.map(b => b.level).join(',')}`);
      lastStarsReport = stars;
    }
  }
  const gain = E.prestige(s);
  mark(`=== Franchise #${run + 1}: +${gain} stars (total ${s.stars}) ===`);
  seen.clear();
}
console.log(log.join('\n'));
