#!/usr/bin/env node
/*
 * Pacing simulator: a bot runs the business like an engaged player and reports when the
 * Market Hall reaches each level, plus profit per hour along the way.
 * Usage: node tools/simulate.js [hours=72] [checkEveryMinutes=5] [--verbose]
 * The bot checks in every few minutes during the day and sleeps 8 hours at night (offline time).
 */
const E = require('../www/js/engine.js');
const HOURS = parseFloat(process.argv[2] || '72');
const EVERY = parseFloat(process.argv[3] || '5') * 60;
const VERBOSE = process.argv.includes('--verbose');

const START = Date.UTC(2026, 5, 1, 8);   // a June morning (no snow)
let s = E.newState(START), t = 0;
const log = [];
const now = () => START + t * 1000;
const mark = (m) => log.push(`${E.formatTime(t).padStart(8)}  ${m}`);

function spot(park, tp) {
  const d = E.DEFS[tp];
  let best = null, bs = -1e9;
  for (let y = 0; y < E.CELLS; y++) for (let x = 0; x < E.CELLS; x++) {
    if (!E.fits(park, tp, x, y, -1)) continue;
    let score = -Math.abs(x + d.w / 2 - 12) - Math.abs(y + d.h / 2 - 12);
    if (d.cat === 'decor' && d.bonus) { const tmp = { u: -5, t: tp, x, y, lv: 1 }; park.b.push(tmp); score = park.b.reduce((a, b) => a + E.decorBonus(park, b), 0) * 100; park.b.pop(); }
    if (d.cat === 'farm' || d.cat === 'water') score = -score;   // farms go to the edges
    if (score > bs) { bs = score; best = [x, y]; }
  }
  return best;
}
function buyLand() {
  for (let k = 0; k < E.PN * E.PN; k++) if (E.canBuyParcel(s, 0, k).ok) { E.buyParcel(s, 0, k); mark(`buy land #${s.stats.landBought}`); return true; }
  return false;
}
function tryBuild(tp, reserve) {
  if (!E.canBuild(s, 0, tp).ok || s.cash - E.DEFS[tp].cost < reserve) return false;
  let sp = spot(s.parks[0], tp);
  if (!sp) { if (!buyLand()) return false; sp = spot(s.parks[0], tp); if (!sp) return false; }
  if (!E.canBuild(s, 0, tp).ok) return false;
  E.build(s, 0, tp, sp[0], sp[1], now());
  if (VERBOSE) mark(`build ${E.DEFS[tp].name}`);
  return true;
}
// Fill empty worker slots: hire the best affordable candidate with the right role.
function staff() {
  for (const b of s.parks[0].b) {
    const role = E.ROLE[E.DEFS[b.t].cat];
    if (!role || b.lv < 1) continue;
    while (E.workersAt(s, 0, b.u).length < E.slotsFor(b.t, b.lv)) {
      let w = s.workers.find(x => !x.at && x.role === role);
      if (!w) {
        if (s.workers.length >= E.maxWorkers(s)) return;
        const c = s.candidates.filter(x => x.role === role && E.hireCost(x) <= s.cash).sort((a, b) => E.workerPower(b) / b.wage - E.workerPower(a) / a.wage)[0];
        if (!c) { if (s.candidates.every(x => x.role !== role) && now() >= s.candAt) E.rerollCandidates(s, now(), false); return; }
        w = E.hire(s, c.id);
        if (!w) return;
      }
      if (!E.assign(s, w.id, 0, b.u)) return;
    }
  }
}
// Which ingredient is most short (need vs make per hour)?
function shortage() {
  const sm = E.summary(s, now());
  let worst = null, gap = 0;
  for (const [k, v] of Object.entries(sm.need)) { const g = v - (sm.makes[k] || 0); if (g > gap) { gap = g; worst = k; } }
  return { worst, gap, sm };
}
const FARM_FOR = { wheat: 'field', veg: 'garden', fruit: 'orchard', rice: 'paddy', spice: 'spicegdn', meat: 'barn', fish: 'pond' };
function act() {
  if (now() >= s.candAt) E.rerollCandidates(s, now(), false);
  while (E.claimMission(s)) mark(`mission done → #${s.mission + 1}`);
  E.questList(s).filter(q => q.done).forEach(q => E.claimQuest(s, q.kind));
  E.checkAchievements(s);
  const d = E.dailyStatus(s, now()); if (d.available) E.claimDaily(s, now());
  if (E.crateStatus(s, now()).free) E.openCrate(s, now());
  s.orders.forEach((o, i) => { if (E.canFill(s, o, now())) { E.fillOrder(s, i, now()); if (VERBOSE) mark('order filled'); } });
  for (const id of Object.keys(s.cards)) if (s.cards[id] && id !== 'reroll' && id !== 'instant') E.useCard(s, id, now());
  if (s.cards.instant && s.jobs.length) E.useCard(s, 'instant', now());
  staff();
  for (let k = 0; k < 30; k++) {
    const hall = E.hallB(s);
    const hc = hall ? E.upgradeCost(E.HALL, hall.lv) : { cash: 400 };
    const reserve = 60;
    // 1. ingredients: grow what is short, buy the rest at the market for the next 30 minutes
    const { worst, gap, sm } = shortage();
    if (worst && gap > 5 && tryBuild(E.ID[FARM_FOR[worst]], reserve)) { staff(); continue; }
    for (const [k, v] of Object.entries(sm.need)) {
      const want = (v - (sm.makes[k] || 0)) * 0.5 - s.inv[k];
      if (want > 0 && E.buyPrice(s, k) < E.DEFS.find(dd => dd.recipe && dd.recipe[k]).price) E.buyIng(s, k, Math.min(want, (s.cash - reserve) / E.buyPrice(s, k)), now());
    }
    // 2. Market Hall
    if (!hall) { if (tryBuild(E.HALL, 0)) { mark('build Market Hall'); continue; } }
    else if (E.canUpgrade(s, 0, hall.u).ok) { E.startUpgrade(s, 0, hall.u, now()); continue; }
    // 3. new stalls, then other buildings (keep half the hall cost in reserve)
    let did = false;
    for (const tp of E.DEFS.map((_, i) => i).filter(i => E.DEFS[i].cat === 'stall').reverse()) if (tryBuild(tp, hc.cash * 0.4)) { did = true; mark(`open ${E.DEFS[tp].name}`); break; }
    if (did) { staff(); continue; }
    if (tryBuild(E.ID.warehouse, hc.cash * 0.5) || tryBuild(E.ID.bin, hc.cash * 0.5) || tryBuild(E.ID.table, hc.cash * 0.5)) continue;
    for (const id of ['lamp', 'planter', 'tree', 'umbrella', 'fountain', 'stage']) if (tryBuild(E.ID[id], hc.cash * 0.6)) { did = true; break; }
    if (did) continue;
    // 4. research and skills
    for (const r of E.RESEARCH) if (E.canResearch(s, r.id).ok && r.cash < s.cash * 0.4) { E.doResearch(s, r.id); mark(`research ${r.name}`); did = true; break; }
    if (did) continue;
    // 5. upgrade stalls (best revenue first), then farms
    let best = null;
    for (const b of s.parks[0].b) {
      if (b.t === E.HALL || !E.canUpgrade(s, 0, b.u).ok) continue;
      const c = E.upgradeCost(b.t, b.lv);
      if (s.cash - c.cash < hc.cash * 0.5 && hall && hall.lv < E.HALL_MAX) continue;
      const score = (E.DEFS[b.t].cat === 'stall' ? 2 : 1) / c.cash;
      if (!best || score > best.score) best = { b, score };
    }
    if (best) { E.startUpgrade(s, 0, best.b.u, now()); staff(); continue; }
    break;
  }
}

let last = 0, sumProfit = 0, nProfit = 0;
const hourly = [];
while (t < HOURS * 3600) {
  const hourOfDay = (t / 3600 + 8) % 24;
  const asleep = hourOfDay >= 23 || hourOfDay < 7;
  const dt = asleep ? 8 * 3600 : EVERY;
  t += dt;
  const r = E.tick(s, dt, now());
  for (const j of r.done) if (j.t === E.HALL) mark(`Market Hall → level ${j.lv}   cash ${E.formatMoney(s.cash)}, staff ${s.workers.length}, profit ${E.formatMoney(E.summary(s, now()).profit)}/h, rep ${E.repLevel(s)}`);
  act();
  if (t - last >= 6 * 3600) {
    last = t;
    const sm = E.summary(s, now());
    hourly.push(`${E.formatTime(t).padStart(8)}  revenue ${E.formatMoney(sm.revenue)}/h  supplies ${E.formatMoney(sm.supplies)}  wages ${E.formatMoney(sm.wages)}  tax ${E.formatMoney(sm.tax)}  rent ${E.formatMoney(sm.rent)}  profit ${E.formatMoney(sm.profit)}/h  cash ${E.formatMoney(s.cash)}  dishes/h ${Math.round(sm.dishes)}`);
  }
}
console.log(log.join('\n'));
console.log('\n--- every 6 hours ---\n' + hourly.join('\n'));
console.log(`\nAfter ${HOURS}h: Market Hall ${E.hallLevel(s)}, level ${s.level}, ${s.workers.length} workers, ${s.parks[0].b.length} buildings, ${s.stats.landBought} land bought, rep ${E.repLevel(s)}, mission ${s.mission}/${E.MISSIONS.length}, orders ${s.ordersDone}, earned ${E.formatMoney(s.stats.earned)}`);
console.log('Inventory:', Object.fromEntries(Object.entries(s.inv).map(([k, v]) => [k, Math.round(v)])), 'cap', E.invCap(s));
console.log('Leaderboard:', E.leaderboard(s, now()).map(x => `${x.name} ${E.formatMoney(x.worth)}`).join(' | '));
