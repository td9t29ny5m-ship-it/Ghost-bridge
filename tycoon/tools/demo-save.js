#!/usr/bin/env node
// Builds realistic saves for screenshots by playing quickly with the real engine.
const E = require('../www/js/engine.js');
// Build saves with the real engine by "playing" quickly: build, upgrade, expand.
function makeSave(STAGE) {
  const T0 = Date.now();
  const s = E.newState(T0);
  const d = new Date();
  s.daily = { last: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, streak: 3 };
  s.settings.sound = false; s.settings.haptics = false;
  s.crateAt = T0 + 3 * 3600e3;
  if (STAGE === 'new') return s;
  const hallTarget = { early: 3, mid: 7, late: 13, night: 13 }[STAGE];
  s.cash = 1e15; s.ing = 1e15; s.gems = 400;
  const hall = E.hallB(s);
  const finish = () => { s.jobs.forEach(j => (j.end = 0)); E.tick(s, 1, T0); };
  for (let lv = 1; lv < hallTarget; lv++) { s.jobs = []; E.startUpgrade(s, 0, hall.u, T0); finish(); }
  const park = s.parks[0];
  const spot = (t) => {
    for (let r = 0; r < 24; r++) for (let y = 12 - r; y <= 12 + r; y++) for (let x = 12 - r; x <= 12 + r; x++) if (E.fits(park, t, x, y, -1)) return [x, y];
    return null;
  };
  // expand land
  for (let k = 0; k < E.maxParcels(s) - 2 - 1; k++) {
    for (let pk = 0; pk < 36; pk++) if (E.canBuyParcel(s, 0, pk).ok) { E.buyParcel(s, 0, pk); break; }
  }
  // build everything allowed: food & supply first, then decor around stalls
  for (const cat of ['stall', 'supply', 'decor']) {
    E.DEFS.forEach((dd, t) => {
      if (dd.cat !== cat) return;
      while (E.countType(s, t) < E.maxCount(s, t) && (cat !== 'decor' || E.countCat(s, 'decor') < 6 + hallTarget * 3)) {
        s.jobs = [];
        const p = spot(t);
        if (!p || !E.build(s, 0, t, p[0], p[1], T0)) break;
        finish();
      }
    });
  }
  // upgrade buildings to a spread of levels
  park.b.forEach((b, i) => {
    const target = Math.max(1, hallTarget - (i % 4));
    while (b.lv < target && E.DEFS[b.t].cat !== 'decor' && b.t !== E.HALL) { s.jobs = []; if (!E.startUpgrade(s, 0, b.u, T0)) break; finish(); }
  });
  // one job running, some coins waiting
  s.jobs = [];
  const st = park.b.find(b => E.DEFS[b.t].cat === 'stall' && b.lv > 1);
  if (st) E.startUpgrade(s, 0, st.u, T0);
  park.b.forEach((b, i) => { if (i % 2) b.st = E.storeCap(s, 0, b) * 0.6; });
  for (let k = 0; k < 4; k++) { const m = E.recruit(s, T0 + k * 9 * 3600e3, [[0.1, 0.7, 0.93, 0.995][k], k * 0.17, k * 0.23]); const tgt = park.b.filter(b => E.DEFS[b.t].cat === 'stall')[k]; if (tgt) E.assignStaff(s, m.id, 0, tgt.u); }
  s.recruitAt = T0 + 5 * 3600e3;
  s.cash = 4.2e3 * Math.pow(9, hallTarget); s.ing = 2.1e3 * Math.pow(9, hallTarget);
  s.stats.collects = 40; s.lifetime = s.cash * 5; s.lastSeen = T0;
  E.takeLevelUps(s); E.checkAchievements(s);
  return s;
}

module.exports = { makeSave };
