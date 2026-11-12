#!/usr/bin/env node
// Builds realistic v4 saves for screenshots with the real engine: buildings, land, staff and stock.
const E = require('../www/js/engine.js');

const PLAN = {
  early: { hall: 3, land: 4, build: ['field', 'garden', 'barn', 'dumpling', 'warehouse', 'table', 'table', 'bin', 'lamp', 'planter'] },
  mid: { hall: 7, land: 9, build: ['field', 'garden', 'barn', 'dumpling', 'tea', 'orchard', 'taco', 'spicegdn', 'pizza', 'pond', 'paddy', 'sushi', 'warehouse', 'field', 'garden',
    'table', 'table', 'table', 'bin', 'bin', 'lamp', 'lamp', 'planter', 'tree', 'tree', 'umbrella', 'fountain'] },
  late: { hall: 13, land: 20, build: ['field', 'garden', 'barn', 'dumpling', 'tea', 'orchard', 'taco', 'spicegdn', 'pizza', 'pond', 'paddy', 'sushi', 'burger', 'greenhouse', 'court',
    'warehouse', 'warehouse', 'field', 'garden', 'barn', 'pond', 'paddy', 'cart', 'tea', 'taco', 'table', 'table', 'table', 'table', 'bin', 'bin', 'bin', 'lamp', 'lamp', 'lamp',
    'planter', 'planter', 'tree', 'tree', 'tree', 'umbrella', 'umbrella', 'fountain', 'stage'] },
};
PLAN.night = PLAN.mid;

function makeSave(STAGE) {
  const T0 = Date.now();
  const s = E.newState(T0 - 3 * 86400e3);
  const d = new Date();
  s.daily = { last: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, streak: 3 };
  s.settings.sound = false; s.settings.haptics = false; s.settings.music = false;
  s.crateAt = T0 + 3 * 3600e3;
  s.lastSeen = T0;
  s.weather = { kind: 'sun', until: T0 + 3600e3 };
  s.nextEventAt = T0 + 3600e3;
  if (STAGE === 'new') { s.createdAt = T0; return s; }
  const plan = PLAN[STAGE];
  s.cash = 1e15; s.tokens = 1e6; s.gems = 400; s.rep = 3e4;
  const park = s.parks[0];
  const finish = () => { s.jobs.forEach(j => (j.end = 0)); E.tick(s, 0.001, T0); };
  const spot = (t) => {
    const dd = E.DEFS[t], far = dd.cat === 'farm' || dd.cat === 'water';
    let best = null, bd = 1e9;
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      if (!E.fits(park, t, x, y, -1)) continue;
      let dist = Math.abs(x + dd.w / 2 - 12) + Math.abs(y + dd.h / 2 - 11);
      if (far) dist = 100 - dist;
      if (dist < bd) { bd = dist; best = [x, y]; }
    }
    return best;
  };
  const place = (id) => {
    const t = E.ID[id];
    let sp = spot(t);
    for (let k = 0; !sp && k < 36; k++) {
      for (let q = 0; q < 36; q++) if (!park.parcels[q] && E.parcelAdjacent(park, q)) { park.parcels[q] = true; s.stats.landBought++; break; }
      sp = spot(t);
    }
    if (!sp) return null;
    s.jobs = [];
    const b = E.build(s, 0, t, sp[0], sp[1], T0);
    finish();
    return b;
  };
  place('hall');
  const hall = E.hallB(s);
  while (hall.lv < plan.hall) { s.jobs = []; E.startUpgrade(s, 0, hall.u, T0); finish(); }
  for (let k = 0; k < plan.land; k++) for (let q = 0; q < 36; q++) if (!park.parcels[q] && E.parcelAdjacent(park, q)) { park.parcels[q] = true; s.stats.landBought++; break; }
  for (const id of plan.build) place(id);
  // level things up a little and staff everything
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const b of park.b) {
    const dd = E.DEFS[b.t];
    if (dd.cat !== 'decor' && b.t !== E.HALL) {
      const target = Math.max(1, Math.min(E.maxLevel(s, b.t), Math.round(plan.hall * (0.4 + r() * 0.5))));
      while (b.lv < target) { s.jobs = []; if (!E.startUpgrade(s, 0, b.u, T0)) break; finish(); }
    }
    const role = E.ROLE[dd.cat];
    if (!role) continue;
    const n = Math.max(1, E.slotsFor(b.t, b.lv) - (r() < 0.3 ? 1 : 0));
    for (let k = 0; k < n && s.workers.length < E.maxWorkers(s); k++) {
      const w = { id: s.wseq++, name: ['Mei', 'Diego', 'Priya', 'Tomás', 'Yuki', 'Amara', 'Lars', 'Fatima', 'Kenji', 'Olivia'][s.wseq % 10], role, skill: 1 + Math.floor(r() * 4), trait: 'none', wage: 18, lvl: 1 + Math.floor(r() * 4), face: Math.floor(r() * 9999) + 1, at: null };
      s.workers.push(w);
      E.assign(s, w.id, 0, b.u);
    }
  }
  s.cash = { early: 4200, mid: 186000, late: 9.4e7, night: 186000 }[STAGE];
  s.tokens = { early: 6, mid: 48, late: 420, night: 48 }[STAGE];
  s.rep = { early: 500, mid: 6000, late: 9e4, night: 6000 }[STAGE];
  const cap = E.invCap(s);
  for (const k of Object.keys(s.inv)) s.inv[k] = Math.round(cap * (0.4 + r() * 0.5));
  s.mission = { early: 9, mid: 15, late: 18, night: 15 }[STAGE];
  s.tutorialDone = true;
  s.level = { early: 6, mid: 14, late: 27, night: 14 }[STAGE];
  s.xp = 0;
  // a few days of books for the report
  E.tick(s, 600, T0);
  s.ledger = [];
  const sm = E.summary(s, T0);
  for (let k = 6; k >= 0; k--) {
    const f = 0.7 + r() * 0.5;
    s.ledger.push({ day: 'Day ' + (40 - k), revenue: sm.revenue * 24 * 0.85 * f, tax: sm.tax * 24 * 0.85 * f, supplies: sm.supplies * 24 * 0.85 * f, wages: sm.wages * 24, rent: sm.rent * 24, market: sm.revenue * 0.6 * r(), dishes: sm.dishes * 24 * f, harvest: 0 });
  }
  s.lastSeen = T0;
  return s;
}
module.exports = { makeSave };
if (require.main === module) process.stdout.write(JSON.stringify(makeSave(process.argv[2] || 'mid')));
