#!/usr/bin/env node
/*
 * Pacing simulator: a bot plays Yum Empire like an engaged player and reports when the
 * Market Hall reaches each level. Usage: node tools/simulate.js [hours=48] [checkEveryMinutes=2]
 * The bot collects and spends every few minutes during "active" hours and sleeps at night.
 */
const E = require('../www/js/engine.js');
const HOURS = parseFloat(process.argv[2] || '48');
const EVERY = parseFloat(process.argv[3] || '2') * 60;

let s = E.newState(0), t = 0;
const log = [];
const mark = (m) => log.push(`${E.formatTime(t).padStart(8)}  ${m}`);
const now = () => t * 1000;

function spot(park, tp) {
  // Prefer spots touching the most stalls (for decor) or near the centre.
  const d = E.DEFS[tp];
  let best = null, bs = -1e9;
  for (let y = 0; y < E.CELLS; y++) for (let x = 0; x < E.CELLS; x++) {
    if (!E.fits(park, tp, x, y, -1)) continue;
    let score = -Math.abs(x - 12) - Math.abs(y - 12);
    if (d.cat === 'decor') { const tmp = { u: -5, t: tp, x, y, lv: 1 }; park.b.push(tmp); score = park.b.reduce((a, b) => a + E.decorBonus(park, b), 0) * 100; park.b.pop(); }
    if (score > bs) { bs = score; best = [x, y]; }
  }
  return best;
}
function act() {
  E.collectAll(s, 0);
  E.questList(s).filter(q => q.done).forEach(q => E.claimQuest(s, q.kind));
  E.checkAchievements(s);
  for (let k = 0; k < 40; k++) {
    let did = false;
    const hall = E.hallB(s);
    // 1. Market Hall first
    if (E.canUpgrade(s, 0, hall.u).ok) { E.startUpgrade(s, 0, hall.u, now()); did = true; continue; }
    // 2. Build anything new that is allowed
    for (let tp = 1; tp < E.DEFS.length && !did; tp++) {
      if (!E.canBuild(s, 0, tp).ok) continue;
      const sp = spot(s.parks[0], tp);
      if (sp) { E.build(s, 0, tp, sp[0], sp[1], now()); did = true; }
      else {   // need land
        for (let pk = 0; pk < E.PN * E.PN; pk++) if (E.canBuyParcel(s, 0, pk).ok) { E.buyParcel(s, 0, pk); mark(`expand land (#${s.stats.landBought})`); did = true; break; }
      }
    }
    if (did) continue;
    // 3. Research
    for (const r of E.RESEARCH) if (E.canResearch(s, r.id).ok && r.cash < s.cash * 0.5) { E.research(s, r.id); did = true; break; }
    if (did) continue;
    // 4. Upgrade the building with the cheapest upgrade (keep a reserve for the hall)
    const hc = E.upgradeCost(E.HALL, hall.lv);
    let best = null;
    for (const b of s.parks[0].b) {
      if (b.t === E.HALL || !E.canUpgrade(s, 0, b.u).ok) continue;
      const c = E.upgradeCost(b.t, b.lv);
      if (s.cash - c.cash < hc.cash * 0.3 && hall.lv < E.maxLevel(s, E.HALL)) continue;
      if (!best || c.cash < best.c.cash) best = { b, c };
    }
    if (best) { E.startUpgrade(s, 0, best.b.u, now()); continue; }
    break;
  }
  // Speed up anything under a minute
  s.jobs.forEach(j => { if (E.speedUpCost(j, now()) === 0) j.end = now(); });
}

let lastHall = 1;
while (t < HOURS * 3600) {
  const hourOfDay = (t / 3600) % 24;
  const awake = hourOfDay < 16;          // plays 16 h, sleeps 8 h
  const step = awake ? EVERY : 8 * 3600;
  E.tick(s, step, now() + step * 1000);
  t += step;
  if (awake || true) act();
  if (E.hallLevel(s) !== lastHall) {
    lastHall = E.hallLevel(s);
    const tot = E.totals(s);
    mark(`MARKET HALL ${lastHall}  ${E.formatMoney(tot.cash)}/h  ${E.formatNumber(tot.ing)} ing/h  buildings ${s.parks[0].b.length}  land ${s.stats.landBought + 2}  Lv${s.level}  gems ${s.gems}`);
  }
}
console.log(log.join('\n'));
const tot = E.totals(s);
console.log(`end: hall ${E.hallLevel(s)}, ${E.formatMoney(tot.cash)}/h, cash ${E.formatMoney(s.cash)}, buildings ${s.parks[0].b.length}`);
