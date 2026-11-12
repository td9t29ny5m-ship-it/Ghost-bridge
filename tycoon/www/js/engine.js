/*
 * Yum Empire — rules of the game (v3: build your own street-food park).
 * Pure logic, no DOM access, so it can be unit-tested and simulated in Node.
 *
 * The world
 *   Each park is a 24 × 24 grid of cells, split into 6 × 6 land parcels of 4 × 4 cells.
 *   You own a couple of parcels to start with; buying the parcel next to your land expands it.
 *   On your land you place buildings anywhere they fit: stalls and restaurants (earn cash),
 *   supply buildings (grow ingredients), and seating & decorations (boost the stalls around them).
 *
 * Progress
 *   The Market Hall is the heart of the park. Its level unlocks new buildings, raises how many
 *   of each you may own, caps every other building's level, and limits how far you can expand.
 *   Building and upgrading take real time and need a free builder; gems can speed them up.
 *   Upgrades cost cash and ingredients. Shops store what they earn until you collect it.
 */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Engine = E;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAVE_VERSION = 3;
  const CELLS = 24, PARCEL = 4, PN = CELLS / PARCEL;   // 24 × 24 cells, 6 × 6 parcels
  const HALL_MAX = 20;
  const STORE_HOURS = 2;                 // a building holds 2 hours of output (+15 min per hall level)
  const LEVEL_BONUS = 0.02;              // +2% income per player level
  const ACHIEVEMENT_BONUS = 0.02;        // +2% income per award
  const DECOR_CAP = 2;                   // decorations can add at most +200% to one stall
  const BOOST_DURATION_MS = 4 * 3600 * 1000;
  const FRENZY_DURATION_MS = 30 * 1000;
  const FRENZY_MULT = 5;
  const CRATE_COOLDOWN_MS = 4 * 3600 * 1000;
  const RECRUIT_COOLDOWN_MS = 8 * 3600 * 1000;
  const COST = { recruit: 30, crate: 20, boost: 25, warp: 20, builder: 250 };   // gem prices
  const FREE_FINISH_SEC = 60;            // jobs under a minute can be finished for free

  // ---------- Buildings ----------
  // cat: hall | stall (earns cash) | supply (grows ingredients) | decor (boosts nearby stalls)
  // hall: Market Hall level that unlocks it. n0/every/cap: how many you may own (see maxCount).
  // cost: cash to build; time: seconds to build; out: per hour at level 1.
  // bonus/radius: for decor, % added to every stall within `radius` cells.
  const DEFS = [
    { id: 'hall',     name: 'Market Hall',     icon: 'hall',     cat: 'hall',   w: 2, h: 2, hall: 1,  n0: 1, every: 99, cap: 1,  cost: 0,     time: 0,     out: 0 },
    { id: 'cart',     name: 'Noodle Cart',     icon: 'noodle',   cat: 'stall',  w: 1, h: 1, hall: 1,  n0: 1, every: 3, cap: 4,  cost: 60,    time: 10,    out: 1500 },
    { id: 'dumpling', name: 'Dumpling Stand',  icon: 'dumpling', cat: 'stall',  w: 1, h: 1, hall: 2,  n0: 1, every: 3, cap: 4,  cost: 600,   time: 60,    out: 7500 },
    { id: 'tea',      name: 'Bubble Tea Bar',  icon: 'tea',      cat: 'stall',  w: 1, h: 1, hall: 3,  n0: 1, every: 3, cap: 4,  cost: 6e3,   time: 240,   out: 40000 },
    { id: 'taco',     name: 'Taco Truck',      icon: 'taco',     cat: 'stall',  w: 1, h: 2, hall: 4,  n0: 1, every: 3, cap: 4,  cost: 5e4,   time: 600,   out: 200000 },
    { id: 'pizza',    name: 'Pizza Parlor',    icon: 'pizza',    cat: 'stall',  w: 2, h: 2, hall: 5,  n0: 1, every: 3, cap: 4,  cost: 4e5,   time: 1500,  out: 1.125e+06 },
    { id: 'sushi',    name: 'Sushi Bar',       icon: 'sushi',    cat: 'stall',  w: 2, h: 2, hall: 7,  n0: 1, every: 3, cap: 3,  cost: 3e6,   time: 3600,  out: 6e+06 },
    { id: 'burger',   name: 'Burger Joint',    icon: 'burger',   cat: 'stall',  w: 2, h: 2, hall: 9,  n0: 1, every: 3, cap: 3,  cost: 2.5e7, time: 7200,  out: 3.25e+07 },
    { id: 'court',    name: 'Food Court',      icon: 'court',    cat: 'stall',  w: 3, h: 3, hall: 12, n0: 1, every: 4, cap: 2,  cost: 2e8,   time: 14400, out: 1.75e+08 },
    { id: 'global',   name: 'Global Kitchen',  icon: 'globe',    cat: 'stall',  w: 3, h: 3, hall: 15, n0: 1, every: 4, cap: 2,  cost: 1.5e9, time: 28800, out: 1e+09 },
    { id: 'garden',   name: 'Veggie Garden',   icon: 'garden',   cat: 'supply', w: 2, h: 2, hall: 1,  n0: 1, every: 4, cap: 4,  cost: 100,   time: 20,    out: 1000 },
    { id: 'spice',    name: 'Spice Stall',     icon: 'spice',    cat: 'supply', w: 1, h: 1, hall: 3,  n0: 1, every: 4, cap: 3,  cost: 3e3,   time: 300,   out: 12000 },
    { id: 'fish',     name: 'Fish Market',     icon: 'fishmkt',  cat: 'supply', w: 2, h: 2, hall: 6,  n0: 1, every: 4, cap: 3,  cost: 1.2e5, time: 2400,  out: 240000 },
    { id: 'farm',     name: 'Greenhouse',      icon: 'farm',     cat: 'supply', w: 3, h: 2, hall: 10, n0: 1, every: 5, cap: 2,  cost: 2e7,   time: 10800, out: 1.2e+07 },
    { id: 'table',    name: 'Picnic Table',    icon: 'table',    cat: 'decor',  w: 1, h: 1, hall: 1,  n0: 2, every: 1, cap: 30, cost: 50,    time: 0,     bonus: 0.06, radius: 1 },
    { id: 'lamp',     name: 'Street Lamp',     icon: 'lamp',     cat: 'decor',  w: 1, h: 1, hall: 2,  n0: 2, every: 1, cap: 24, cost: 300,   time: 0,     bonus: 0.04, radius: 2 },
    { id: 'planter',  name: 'Flower Planter',  icon: 'planter',  cat: 'decor',  w: 1, h: 1, hall: 3,  n0: 2, every: 2, cap: 16, cost: 900,   time: 0,     bonus: 0.08, radius: 1 },
    { id: 'tree',     name: 'Shade Tree',      icon: 'tree',     cat: 'decor',  w: 1, h: 1, hall: 4,  n0: 2, every: 2, cap: 16, cost: 4e3,   time: 0,     bonus: 0.12, radius: 1 },
    { id: 'umbrella', name: 'Umbrella Table',  icon: 'umbrella', cat: 'decor',  w: 1, h: 1, hall: 5,  n0: 2, every: 2, cap: 16, cost: 2e4,   time: 0,     bonus: 0.18, radius: 1 },
    { id: 'fountain', name: 'Fountain',        icon: 'fountain', cat: 'decor',  w: 2, h: 2, hall: 7,  n0: 1, every: 4, cap: 3,  cost: 5e5,   time: 0,     bonus: 0.3,  radius: 2 },
    { id: 'stage',    name: 'Music Stage',     icon: 'stage',    cat: 'decor',  w: 3, h: 2, hall: 10, n0: 1, every: 5, cap: 2,  cost: 1.5e7, time: 0,     bonus: 0.5,  radius: 3 },
  ];
  const ID = Object.fromEntries(DEFS.map((d, i) => [d.id, i]));
  const HALL = ID.hall;

  // Parks: the Suburb is home. More parks open later, each its own map with a profit bonus.
  const PARKS = [
    { id: 'suburb', name: 'Maple Suburb',   icon: 'suburb', hall: 1,  cost: 0,    mult: 1,   start: [[2, 2], [3, 2]] },
    { id: 'town',   name: 'Riverside Town', icon: 'town',   hall: 8,  cost: 3e7,  mult: 1.6, start: [[2, 2], [3, 2]] },
    { id: 'city',   name: 'Downtown City',  icon: 'city',   hall: 13, cost: 3e10, mult: 2.6, start: [[2, 2], [3, 2]] },
    { id: 'metro',  name: 'Neon Metropolis', icon: 'metro', hall: 17, cost: 3e13, mult: 4,   start: [[2, 2], [3, 2]] },
  ];

  // ---------- Number formatting ----------
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  function formatNumber(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + formatNumber(-n);
    if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1).replace(/\.0$/, '') : Math.floor(n).toString();
    let tier = Math.floor(Math.log10(n) / 3);
    let scaled = n / Math.pow(10, tier * 3);
    let txt = scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2);
    if (parseFloat(txt) >= 1000) { tier++; txt = '1.00'; }
    return txt + (tier < SUFFIXES.length ? SUFFIXES[tier] : 'e' + tier * 3);
  }
  function formatMoney(n) { return '$' + formatNumber(n); }
  function formatTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  // ---------- Costs and output ----------
  // Upgrading a building from level lv to lv+1 (lv = 0 means constructing it).
  function upgradeCost(t, lv) {
    const d = DEFS[t];
    if (t === HALL) {
      return { cash: Math.round(150 * Math.pow(3.6, lv - 1)), ing: Math.round(60 * Math.pow(3.6, lv - 1)), time: Math.min(86400, Math.round(20 * Math.pow(2.15, lv - 1))) };
    }
    if (lv === 0) return { cash: d.cost, ing: 0, time: d.time };
    if (d.cat === 'decor') return null;
    const cash = d.cost * Math.pow(2.4, lv);
    return { cash: Math.round(cash), ing: Math.round(cash * 0.3), time: Math.min(86400, Math.round(Math.max(15, d.time) * Math.pow(1.9, lv))) };
  }
  function baseOutput(t, lv) { return lv < 1 ? 0 : DEFS[t].out * Math.pow(1.75, lv - 1); }   // per hour
  function maxLevel(state, t) { return t === HALL ? HALL_MAX : DEFS[t].cat === 'decor' ? 1 : Math.max(1, hallLevel(state)); }
  function maxCount(state, t) {
    const d = DEFS[t], hl = hallLevel(state);
    if (hl < d.hall) return 0;
    return Math.min(d.cap, d.n0 + Math.floor((hl - d.hall) / d.every));
  }
  function maxParcels(state) { return Math.min(PN * PN, 2 + hallLevel(state) * 2); }

  // ---------- State ----------
  function newPark(i) {
    const parcels = new Array(PN * PN).fill(false);
    for (const [px, py] of PARKS[i].start) parcels[py * PN + px] = true;
    return { unlocked: i === 0, parcels, b: [] };
  }
  function newState(now) {
    now = now || Date.now();
    const s = {
      v: SAVE_VERSION,
      cash: 200, ing: 100, gems: 50, xp: 0, level: 1, lifetime: 0, lifetimeIng: 0,
      park: 0, parks: PARKS.map((_, i) => newPark(i)), uid: 1, jobs: [], boughtBuilder: false,
      upgrades: {}, achievements: {}, quests: {},
      staff: [], staffSeq: 1,
      boostUntil: 0, frenzyUntil: 0, crateAt: 0, recruitAt: 0,
      premium: false, adsRemoved: false,
      lastSeen: now, createdAt: now,
      daily: { last: '', streak: 0 },
      stats: { collects: 0, built: 0, upgraded: 0, landBought: 0, golden: 0, tips: 0, recruited: 0, research: 0, crates: 0, playTime: 0, maxLevels: 0 },
      settings: { sound: true, haptics: true, lens: true },
      tutorial: 0,
    };
    // Your starting park: the Market Hall, a noodle cart and a picnic table, ready to go.
    const p = s.parks[0];
    p.b.push({ u: s.uid++, t: HALL, x: 9, y: 9, lv: 1, st: 0, chef: 0 });
    p.b.push({ u: s.uid++, t: ID.cart, x: 12, y: 9, lv: 1, st: 300, chef: 0 });
    p.b.push({ u: s.uid++, t: ID.table, x: 12, y: 10, lv: 1, st: 0, chef: 0 });
    return s;
  }

  function loadState(raw, now) {
    const s = newState(now);
    if (!raw || typeof raw !== 'object') return s;
    const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
    // Older versions (an idle game) can't be converted; keep gems, purchases, settings.
    s.gems = Math.max(s.gems, Math.floor(num(raw.gems, 0)));
    s.premium = !!raw.premium;
    s.adsRemoved = !!raw.adsRemoved;
    if (raw.settings) {
      s.settings.sound = raw.settings.sound !== false;
      s.settings.haptics = raw.settings.haptics !== false;
      s.settings.lens = raw.settings.lens !== false;
    }
    if (raw.v !== SAVE_VERSION) return s;

    ['cash', 'ing', 'gems', 'xp', 'lifetime', 'lifetimeIng', 'boostUntil', 'frenzyUntil', 'crateAt', 'recruitAt', 'tutorial', 'staffSeq', 'uid']
      .forEach(k => { s[k] = Math.max(0, num(raw[k], s[k])); });
    s.level = Math.max(1, Math.floor(num(raw.level, 1)));
    s.boughtBuilder = !!raw.boughtBuilder;
    s.lastSeen = num(raw.lastSeen, s.lastSeen);
    s.createdAt = num(raw.createdAt, s.createdAt);
    s.park = Math.min(PARKS.length - 1, Math.max(0, Math.floor(num(raw.park, 0))));
    if (Array.isArray(raw.parks)) {
      raw.parks.forEach((rp, i) => {
        if (!s.parks[i] || !rp || typeof rp !== 'object') return;
        const p = s.parks[i];
        if (i > 0) p.unlocked = !!rp.unlocked;
        if (Array.isArray(rp.parcels)) rp.parcels.forEach((o, k) => { if (k < p.parcels.length) p.parcels[k] = p.parcels[k] || !!o; });
        if (Array.isArray(rp.b)) {
          p.b = [];
          rp.b.forEach(b => {
            if (!b || typeof b !== 'object') return;
            const t = Math.floor(num(b.t, -1));
            if (!DEFS[t] || (t === HALL && i !== 0)) return;
            const nb = { u: Math.floor(num(b.u, 0)), t, x: Math.floor(num(b.x, -1)), y: Math.floor(num(b.y, -1)),
              lv: Math.max(0, Math.min(HALL_MAX, Math.floor(num(b.lv, 0)))), st: Math.max(0, num(b.st, 0)), chef: Math.max(0, Math.floor(num(b.chef, 0))) };
            if (nb.u < 1 || p.b.some(o => o.u === nb.u)) nb.u = s.uid++;
            if (fits(p, t, nb.x, nb.y, -1)) p.b.push(nb);
          });
        }
      });
      if (!s.parks[0].b.some(b => b.t === HALL)) s.parks[0].b.push({ u: s.uid++, t: HALL, x: 9, y: 9, lv: 1, st: 0, chef: 0 });
      if (!s.parks[s.park].unlocked) s.park = 0;
    }
    const maxU = Math.max(0, ...s.parks.flatMap(p => p.b.map(b => b.u)));
    s.uid = Math.max(s.uid, maxU + 1);
    if (Array.isArray(raw.jobs)) {
      s.jobs = raw.jobs.filter(j => j && findB(s, j.park, j.u)).slice(0, 3).map(j => ({ u: j.u, park: j.park, end: num(j.end, 0), dur: Math.max(1, num(j.dur, 1)) }));
    }
    if (Array.isArray(raw.staff)) {
      s.staff = raw.staff.filter(m => m && typeof m === 'object').slice(0, STAFF_MAX).map(m => ({
        id: Math.floor(num(m.id, 0)), name: String(m.name || 'Chef').slice(0, 16),
        rarity: Math.min(3, Math.max(0, Math.floor(num(m.rarity, 0)))), spec: Math.min(DEFS.length - 1, Math.max(1, Math.floor(num(m.spec, 1)))),
        level: Math.min(STAFF_MAX_LEVEL, Math.max(1, Math.floor(num(m.level, 1)))),
      })).filter(m => m.id > 0);
    }
    const seen = new Set();
    eachB(s, (b) => { if (b.chef && (!s.staff.some(m => m.id === b.chef) || seen.has(b.chef) || DEFS[b.t].cat !== 'stall')) b.chef = 0; else if (b.chef) seen.add(b.chef); });
    if (raw.upgrades) for (const k of Object.keys(raw.upgrades)) if (RESEARCH_BY_ID[k]) s.upgrades[k] = true;
    if (raw.achievements) for (const k of Object.keys(raw.achievements)) if (ACH_IDS.has(k)) s.achievements[k] = true;
    if (raw.quests) for (const k of Object.keys(raw.quests)) if (QUEST_BY_KIND[k]) s.quests[k] = Math.max(0, Math.floor(num(raw.quests[k], 0)));
    if (raw.daily) s.daily = { last: String(raw.daily.last || ''), streak: num(raw.daily.streak, 0) };
    if (raw.stats) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k], s.stats[k]);
    return s;
  }

  // ---------- Lookups ----------
  function eachB(state, fn) { state.parks.forEach((p, pi) => p.b.forEach(b => fn(b, pi))); }
  function findB(state, pi, u) { const p = state.parks[pi]; return p ? p.b.find(b => b.u === u) || null : null; }
  function hallB(state) { return state.parks[0].b.find(b => b.t === HALL); }
  function hallLevel(state) { const h = hallB(state); return h ? Math.max(1, h.lv) : 1; }
  function countType(state, t) { let n = 0; eachB(state, b => { if (b.t === t) n++; }); return n; }
  function countCat(state, cat) { let n = 0; eachB(state, b => { if (DEFS[b.t].cat === cat) n++; }); return n; }
  function totalLevels(state) { let n = 0; eachB(state, b => { if (DEFS[b.t].cat !== 'decor') n += b.lv; }); return n; }
  function parcelCount(state) { return state.parks.reduce((a, p) => a + (p.unlocked ? p.parcels.filter(Boolean).length : 0), 0); }
  function jobFor(state, pi, u) { return state.jobs.find(j => j.park === pi && j.u === u) || null; }
  // One builder to start, a second at Market Hall 4, a third for gems.
  function builderCount(state) { return 1 + (hallLevel(state) >= 4 ? 1 : 0) + (state.boughtBuilder ? 1 : 0); }
  function freeBuilders(state) { return builderCount(state) - state.jobs.length; }

  // ---------- Land ----------
  const parcelOf = (x, y) => Math.floor(y / PARCEL) * PN + Math.floor(x / PARCEL);
  function ownsCell(park, x, y) { return x >= 0 && y >= 0 && x < CELLS && y < CELLS && park.parcels[parcelOf(x, y)]; }
  function occupant(park, x, y, ignoreU) {
    for (const b of park.b) {
      if (b.u === ignoreU) continue;
      const d = DEFS[b.t];
      if (x >= b.x && x < b.x + d.w && y >= b.y && y < b.y + d.h) return b;
    }
    return null;
  }
  function fits(park, t, x, y, ignoreU) {
    const d = DEFS[t];
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) {
      if (!ownsCell(park, x + i, y + j) || occupant(park, x + i, y + j, ignoreU)) return false;
    }
    return true;
  }
  function parcelAdjacent(park, k) {
    const px = k % PN, py = Math.floor(k / PN);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const nx = px + dx, ny = py + dy;
      return nx >= 0 && ny >= 0 && nx < PN && ny < PN && park.parcels[ny * PN + nx];
    });
  }
  function landPrice(state) { return Math.round(500 * Math.pow(3, state.stats.landBought)); }
  function canBuyParcel(state, pi, k) {
    const park = state.parks[pi];
    if (!park || !park.unlocked || park.parcels[k] || !parcelAdjacent(park, k)) return { ok: false, why: 'Must be next to your land' };
    if (parcelCount(state) >= maxParcels(state)) return { ok: false, why: `Upgrade the Market Hall to expand further` };
    if (state.cash < landPrice(state)) return { ok: false, why: 'Not enough cash' };
    return { ok: true };
  }
  function buyParcel(state, pi, k) {
    if (!canBuyParcel(state, pi, k).ok) return false;
    state.cash -= landPrice(state);
    state.parks[pi].parcels[k] = true;
    state.stats.landBought++;
    addXp(state, 40);
    return true;
  }

  // ---------- Building ----------
  function canBuild(state, pi, t) {
    const d = DEFS[t];
    if (t === HALL) return { ok: false, why: 'Only one Market Hall' };
    if (hallLevel(state) < d.hall) return { ok: false, why: `Needs Market Hall level ${d.hall}` };
    if (countType(state, t) >= maxCount(state, t)) {
      return { ok: false, why: countType(state, t) >= d.cap ? 'You own the maximum' : `Upgrade the Market Hall to build more` };
    }
    if (d.time > 0 && freeBuilders(state) < 1) return { ok: false, why: 'All builders are busy' };
    if (state.cash < d.cost) return { ok: false, why: 'Not enough cash' };
    return { ok: true };
  }
  // Place a new building. Decorations appear instantly; everything else is built over time.
  function build(state, pi, t, x, y, now) {
    const park = state.parks[pi];
    if (!park || !park.unlocked || !canBuild(state, pi, t).ok || !fits(park, t, x, y, -1)) return null;
    const d = DEFS[t];
    state.cash -= d.cost;
    const b = { u: state.uid++, t, x, y, lv: d.time > 0 ? 0 : 1, st: 0, chef: 0 };
    park.b.push(b);
    if (d.time > 0) state.jobs.push({ u: b.u, park: pi, end: now + d.time * 1000, dur: d.time });
    state.stats.built++;
    addXp(state, 10 + Math.round(d.time / 20));
    return b;
  }
  function canUpgrade(state, pi, u) {
    const b = findB(state, pi, u);
    if (!b) return { ok: false, why: '' };
    if (DEFS[b.t].cat === 'decor') return { ok: false, why: 'Decorations have one level' };
    if (jobFor(state, pi, u)) return { ok: false, why: 'Already under construction' };
    if (b.lv >= maxLevel(state, b.t)) return { ok: false, why: b.t === HALL ? 'Maximum level' : 'Upgrade the Market Hall first' };
    const c = upgradeCost(b.t, b.lv);
    if (freeBuilders(state) < 1) return { ok: false, why: 'All builders are busy', cost: c };
    if (state.cash < c.cash) return { ok: false, why: 'Not enough cash', cost: c };
    if (state.ing < c.ing) return { ok: false, why: 'Not enough ingredients', cost: c };
    return { ok: true, cost: c };
  }
  function startUpgrade(state, pi, u, now) {
    const r = canUpgrade(state, pi, u);
    if (!r.ok) return false;
    state.cash -= r.cost.cash;
    state.ing -= r.cost.ing;
    state.jobs.push({ u, park: pi, end: now + r.cost.time * 1000, dur: r.cost.time });
    return true;
  }
  function speedUpCost(job, now) {
    const sec = Math.max(0, (job.end - now) / 1000);
    return sec <= FREE_FINISH_SEC ? 0 : Math.ceil(Math.sqrt(sec) * 0.9);
  }
  // Finish a job now (free under a minute, otherwise gems). The next tick completes it.
  function speedUp(state, pi, u, now) {
    const j = jobFor(state, pi, u);
    if (!j) return false;
    const g = speedUpCost(j, now);
    if (state.gems < g) return false;
    state.gems -= g;
    j.end = now;
    return true;
  }
  function move(state, pi, u, x, y) {
    const b = findB(state, pi, u);
    if (!b || !fits(state.parks[pi], b.t, x, y, u)) return false;
    b.x = x; b.y = y;
    return true;
  }
  function demolish(state, pi, u) {
    const park = state.parks[pi], b = findB(state, pi, u);
    if (!b || DEFS[b.t].cat !== 'decor') return false;   // only decorations can be removed
    park.b.splice(park.b.indexOf(b), 1);
    state.cash += Math.round(DEFS[b.t].cost * 0.5);
    return true;
  }
  function buyBuilder(state) {
    if (state.boughtBuilder || state.gems < COST.builder) return false;
    state.gems -= COST.builder;
    state.boughtBuilder = true;
    return true;
  }

  // ---------- Income ----------
  // Every decoration within its radius of a stall's footprint adds its bonus to that stall.
  function decorBonus(park, b) {
    const d = DEFS[b.t];
    if (d.cat !== 'stall') return 0;
    let sum = 0;
    for (const o of park.b) {
      const od = DEFS[o.t];
      if (od.cat !== 'decor') continue;
      const gx = Math.max(0, o.x - (b.x + d.w - 1), b.x - (o.x + od.w - 1));
      const gy = Math.max(0, o.y - (b.y + d.h - 1), b.y - (o.y + od.h - 1));
      if (Math.max(gx, gy) <= od.radius) sum += od.bonus;
    }
    return Math.min(DECOR_CAP, sum);
  }
  function achievementCount(state) { return Object.keys(state.achievements).length; }
  function globalMult(state, now) {
    let m = (1 + achievementCount(state) * ACHIEVEMENT_BONUS) * (1 + (state.level - 1) * LEVEL_BONUS);
    for (const r of RESEARCH) if (r.target === -1 && state.upgrades[r.id]) m *= r.mult;
    if (state.premium) m *= 2;
    if (now !== undefined) {
      if (state.boostUntil > now) m *= 2;
      if (state.frenzyUntil > now) m *= FRENZY_MULT;
    }
    return m;
  }
  function typeMult(state, t) {
    let m = 1;
    for (const r of RESEARCH) if ((r.target === t || (r.target === -2 && DEFS[t].cat === 'supply')) && state.upgrades[r.id]) m *= r.mult;
    return m;
  }
  // Output per hour of one building (cash for stalls, ingredients for supply buildings).
  function rate(state, pi, b, now, gm) {
    const d = DEFS[b.t];
    if ((d.cat !== 'stall' && d.cat !== 'supply') || b.lv < 1) return 0;
    let r = baseOutput(b.t, b.lv) * typeMult(state, b.t) * PARKS[pi].mult * (gm === undefined ? globalMult(state, now) : gm);
    if (d.cat === 'stall') r *= (1 + decorBonus(state.parks[pi], b)) * (1 + staffBonus(staffById(state, b.chef), b.t));
    return r;
  }
  function storeCap(state, pi, b) { return rate(state, pi, b) * (STORE_HOURS + 0.25 * hallLevel(state)); }
  function totals(state, now) {
    let cash = 0, ing = 0;
    const gm = globalMult(state, now);
    state.parks.forEach((p, pi) => { if (p.unlocked) p.b.forEach(b => { const r = rate(state, pi, b, now, gm); if (DEFS[b.t].cat === 'stall') cash += r; else ing += r; }); });
    return { cash, ing };   // per hour
  }
  function earn(state, cash, ing) {
    state.cash += cash || 0; state.lifetime += cash || 0;
    state.ing += ing || 0; state.lifetimeIng += ing || 0;
  }
  function collect(state, pi, u) {
    const b = findB(state, pi, u);
    if (!b || b.st < 1) return null;
    const amt = Math.floor(b.st), isCash = DEFS[b.t].cat === 'stall';
    b.st -= amt;
    if (isCash) earn(state, amt, 0); else earn(state, 0, amt);
    state.stats.collects++;
    addXp(state, 1);
    return { amount: amt, kind: isCash ? 'cash' : 'ing' };
  }
  function collectAll(state, pi) {
    let cash = 0, ing = 0, n = 0;
    for (const b of state.parks[pi].b) {
      const r = b.st >= 1 ? collect(state, pi, b.u) : null;
      if (r) { n++; if (r.kind === 'cash') cash += r.amount; else ing += r.amount; }
    }
    return { cash, ing, n };
  }

  // Advance time. Fills every producer's storage and finishes construction.
  // Returns the jobs that completed: [{ park, u, t, lv }]
  function tick(state, dt, now) {
    const done = [];
    if (!(dt > 0)) return done;
    const gm = globalMult(state, now);
    state.parks.forEach((p, pi) => {
      if (!p.unlocked) return;
      for (const b of p.b) {
        const r = rate(state, pi, b, now, gm);
        if (r > 0) b.st = Math.min(Math.max(b.st, rate(state, pi, b) * (STORE_HOURS + 0.25 * hallLevel(state))), b.st + r * dt / 3600);
      }
    });
    for (let i = state.jobs.length - 1; i >= 0; i--) {
      const j = state.jobs[i];
      if (j.end > now) continue;
      state.jobs.splice(i, 1);
      const b = findB(state, j.park, j.u);
      if (!b) continue;
      b.lv++;
      if (b.lv > 1) state.stats.upgraded++;
      addXp(state, 15 + Math.round(j.dur / 15));
      done.push({ park: j.park, u: b.u, t: b.t, lv: b.lv });
    }
    state.stats.playTime += dt;
    state.stats.maxLevels = Math.max(state.stats.maxLevels, totalLevels(state));
    return done;
  }

  // ---------- Parks ----------
  function canUnlockPark(state, i) {
    const pk = PARKS[i];
    if (!pk || state.parks[i].unlocked) return { ok: false, why: '' };
    if (hallLevel(state) < pk.hall) return { ok: false, why: `Needs Market Hall level ${pk.hall}` };
    if (state.cash < pk.cost) return { ok: false, why: 'Not enough cash' };
    return { ok: true };
  }
  function unlockPark(state, i) {
    if (!canUnlockPark(state, i).ok) return false;
    state.cash -= PARKS[i].cost;
    state.parks[i].unlocked = true;
    addXp(state, 200);
    return true;
  }

  // ---------- Research: instant, permanent multipliers ----------
  const RESEARCH = [];
  DEFS.forEach((d, t) => {
    if (d.cat !== 'stall') return;
    ['Secret Recipe', 'Pro Kitchen', 'Celebrity Chef'].forEach((n, k) => RESEARCH.push({
      id: `r${t}_${k}`, name: n, target: t, icon: d.icon, sub: d.name, mult: 1.5 + k * 0.25,
      cash: d.cost * 30 * Math.pow(40, k), ing: d.cost * 12 * Math.pow(40, k), hall: d.hall + 1 + k * 3,
    }));
  });
  ['Organic Seeds', 'Irrigation', 'Smart Farming'].forEach((n, k) => RESEARCH.push({
    id: `rs_${k}`, name: n, target: -2, icon: 'garden', sub: 'All supply buildings', mult: 1.6, cash: 2e3 * Math.pow(200, k), ing: 500 * Math.pow(200, k), hall: 2 + k * 4,
  }));
  ['Loyalty Cards', 'Delivery App', 'Social Media Buzz', 'TV Commercial', 'Food Festival', 'Award-Winning Menu', 'Night Market', 'Global Fame']
    .forEach((n, k) => RESEARCH.push({ id: `rg_${k}`, name: n, target: -1, icon: 'star', sub: 'Everything', mult: 1.3, cash: 5e3 * Math.pow(30, k), ing: 2e3 * Math.pow(30, k), hall: 3 + k * 2 }));
  RESEARCH.sort((a, b) => a.cash - b.cash);
  const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));
  function canResearch(state, id) {
    const r = RESEARCH_BY_ID[id];
    if (!r || state.upgrades[id]) return { ok: false, why: 'Done' };
    if (hallLevel(state) < r.hall) return { ok: false, why: `Needs Market Hall level ${r.hall}` };
    if (state.cash < r.cash) return { ok: false, why: 'Not enough cash' };
    if (state.ing < r.ing) return { ok: false, why: 'Not enough ingredients' };
    return { ok: true };
  }
  function research(state, id) {
    if (!canResearch(state, id).ok) return false;
    const r = RESEARCH_BY_ID[id];
    state.cash -= r.cash; state.ing -= r.ing;
    state.upgrades[id] = true;
    state.stats.research++;
    addXp(state, 30);
    return true;
  }

  // ---------- Chefs ----------
  const RARITIES = [
    { name: 'Common', color: '#9aa7b8', bonus: 0.2, weight: 60 },
    { name: 'Rare', color: '#4dabf7', bonus: 0.5, weight: 28 },
    { name: 'Epic', color: '#cc5de8', bonus: 1.2, weight: 10 },
    { name: 'Legendary', color: '#ffb000', bonus: 3, weight: 2 },
  ];
  const STAFF_NAMES = ['Mei', 'Diego', 'Priya', 'Tomás', 'Yuki', 'Amara', 'Lars', 'Fatima', 'Kenji', 'Olivia', 'Mateo', 'Aisha', 'Nico',
    'Sana', 'Bruno', 'Lin', 'Zara', 'Otto', 'Ines', 'Ravi', 'Hana', 'Felix', 'Nia', 'Caleb', 'Rosa', 'Arjun', 'Elsa', 'Kofi', 'Mila', 'Jude'];
  const STAFF_MAX = 30, STAFF_MAX_LEVEL = 10;
  const STALLS = DEFS.map((d, i) => (d.cat === 'stall' ? i : -1)).filter(i => i >= 0);
  function staffById(state, id) { return id ? state.staff.find(m => m.id === id) || null : null; }
  function staffBonus(m, t) { return m ? RARITIES[m.rarity].bonus * (1 + 0.2 * (m.level - 1)) * (m.spec === t ? 1.5 : 1) : 0; }
  function rollRarity(r) {
    let acc = 0;
    const total = RARITIES.reduce((a, x) => a + x.weight, 0);
    for (let i = 0; i < RARITIES.length; i++) { acc += RARITIES[i].weight / total; if (r < acc) return i; }
    return 0;
  }
  function makeStaff(state, r1, r2, r3) {
    const m = { id: state.staffSeq++, name: STAFF_NAMES[Math.floor(r2 * STAFF_NAMES.length) % STAFF_NAMES.length],
      rarity: rollRarity(r1), spec: STALLS[Math.floor(r3 * STALLS.length) % STALLS.length], level: 1 };
    state.staff.push(m);
    state.stats.recruited++;
    return m;
  }
  function recruitStatus(state, now) { return { free: now >= state.recruitAt, wait: Math.max(0, state.recruitAt - now) / 1000, full: state.staff.length >= STAFF_MAX }; }
  function recruit(state, now, rnd) {
    if (state.staff.length >= STAFF_MAX) return null;
    if (now >= state.recruitAt) state.recruitAt = now + RECRUIT_COOLDOWN_MS;
    else if (!spendGems(state, COST.recruit)) return null;
    const r = rnd || [Math.random(), Math.random(), Math.random()];
    addXp(state, 20);
    return makeStaff(state, r[0], r[1], r[2]);
  }
  function staffAt(state, id) { let f = null; eachB(state, (b, pi) => { if (b.chef === id) f = { park: pi, u: b.u }; }); return f; }
  function assignStaff(state, id, pi, u) {
    const b = findB(state, pi, u);
    if (!b || DEFS[b.t].cat !== 'stall' || !staffById(state, id)) return false;
    eachB(state, o => { if (o.chef === id) o.chef = 0; });
    b.chef = id;
    return true;
  }
  function unassignStaff(state, id) { eachB(state, o => { if (o.chef === id) o.chef = 0; }); }
  function staffUpgradeCost(m) { return 5 * (m.rarity + 1) * m.level; }
  function upgradeStaff(state, id) {
    const m = staffById(state, id);
    if (!m || m.level >= STAFF_MAX_LEVEL || !spendGems(state, staffUpgradeCost(m))) return false;
    m.level++;
    return true;
  }
  function dismissStaff(state, id) {
    const i = state.staff.findIndex(m => m.id === id);
    if (i < 0) return false;
    unassignStaff(state, id);
    state.staff.splice(i, 1);
    state.gems += 3;
    return true;
  }

  // ---------- Player level, gems ----------
  function xpForLevel(level) { return Math.round(60 * Math.pow(level, 1.8)); }
  function addXp(state, n) {
    state.xp += n;
    let ups = 0;
    while (state.xp >= xpForLevel(state.level)) { state.xp -= xpForLevel(state.level); state.level++; state.gems += 10; ups++; }
    state._levelUps = (state._levelUps || 0) + ups;
    return ups;
  }
  function takeLevelUps(state) { const n = state._levelUps || 0; delete state._levelUps; return n; }
  function spendGems(state, n) { if (state.gems < n) return false; state.gems -= n; return true; }

  // ---------- Boosts, crates, VIP, tips, daily ----------
  function addBoost(state, now, ms) { state.boostUntil = Math.min(Math.max(state.boostUntil, now) + (ms || BOOST_DURATION_MS), now + 24 * 3600 * 1000); }
  function buyBoost(state, now) { if (!spendGems(state, COST.boost)) return false; addBoost(state, now); return true; }
  // Two hours of everything your park makes, right now.
  function timeWarp(state, now) {
    const t = totals(state);
    if (t.cash + t.ing <= 0 || !spendGems(state, COST.warp)) return null;
    earn(state, t.cash * 2, t.ing * 2);
    return { cash: t.cash * 2, ing: t.ing * 2 };
  }
  function vipReward(state, now, rnd) {
    const r = rnd === undefined ? Math.random() : rnd;
    state.stats.golden++;
    const gems = r > 0.7 ? 2 + Math.floor((r - 0.7) * 10) : 0;
    state.gems += gems;
    if (r < 0.3) { state.frenzyUntil = now + FRENZY_DURATION_MS; return { type: 'frenzy', mult: FRENZY_MULT, seconds: FRENZY_DURATION_MS / 1000, gems }; }
    const amount = Math.max(200, totals(state).cash / 6);   // ten minutes of income
    earn(state, amount, 0);
    return { type: 'cash', amount, gems };
  }
  function tip(state) {
    const amount = Math.max(15, totals(state).cash / 120);   // thirty seconds of income
    earn(state, amount, 0);
    state.stats.tips++;
    return amount;
  }
  function crateStatus(state, now) { return { free: now >= state.crateAt, wait: Math.max(0, state.crateAt - now) / 1000 }; }
  function openCrate(state, now, rnd) {
    if (now >= state.crateAt) state.crateAt = now + CRATE_COOLDOWN_MS;
    else if (!spendGems(state, COST.crate)) return null;
    state.stats.crates++;
    const r = rnd || [Math.random(), Math.random(), Math.random(), Math.random()];
    const t = totals(state);
    if (r[0] < 0.35) { const amount = Math.max(300, t.cash * (0.5 + r[1])); earn(state, amount, 0); return { type: 'cash', amount, icon: 'cash', text: formatMoney(amount) }; }
    if (r[0] < 0.55) { const amount = Math.max(200, t.ing * (0.5 + r[1])); earn(state, 0, amount); return { type: 'ing', amount, icon: 'ingredients', text: formatNumber(amount) + ' ingredients' }; }
    if (r[0] < 0.75) { const gems = 5 + Math.floor(r[1] * 11); state.gems += gems; return { type: 'gems', gems, icon: 'gem', text: gems + ' gems' }; }
    if (r[0] < 0.88 || state.staff.length >= STAFF_MAX) { addBoost(state, now, 2 * 3600 * 1000); return { type: 'boost', icon: 'rocket', text: '2× income for 2 hours' }; }
    const m = makeStaff(state, r[1], r[2], r[3]);
    return { type: 'staff', staff: m, icon: 'chefhat', text: `${RARITIES[m.rarity].name} chef ${m.name}` };
  }
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dailyStatus(state, now) {
    const today = dayKey(new Date(now));
    if (state.daily.last === today) return { available: false };
    const streak = state.daily.last === dayKey(new Date(now - 86400000)) ? state.daily.streak + 1 : 1;
    const day = ((streak - 1) % 7) + 1, t = totals(state);
    return { available: true, streak, day, cash: Math.max(300 * day, t.cash * 0.5 * day), ing: Math.max(150 * day, t.ing * 0.5 * day), gems: day === 7 ? 30 : 3 + day * 2, today };
  }
  function claimDaily(state, now) {
    const d = dailyStatus(state, now);
    if (!d.available) return null;
    state.daily = { last: d.today, streak: d.streak };
    earn(state, d.cash, d.ing);
    state.gems += d.gems;
    if (d.day === 7) addBoost(state, now);
    return d;
  }

  // ---------- Quests (endless lines with rising goals) ----------
  const seq = (list, grow) => (tier) => (tier < list.length ? list[tier] : Math.round(list[list.length - 1] * Math.pow(grow, tier - list.length + 1)));
  const QUESTS = [
    { kind: 'hall', icon: 'hall', title: n => `Upgrade the Market Hall to level ${n}`, value: s => hallLevel(s), target: t => t + 2, max: HALL_MAX - 1, gems: t => 10 + t * 3 },
    { kind: 'collect', icon: 'coin', title: n => `Collect from your buildings ${n} times`, value: s => s.stats.collects, target: seq([3, 15, 40, 100, 250, 500, 1000], 1.6) },
    { kind: 'stalls', icon: 'shop', title: n => `Own ${n} food stalls`, value: s => countCat(s, 'stall'), target: seq([2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 30], 1), max: 11 },
    { kind: 'decor', icon: 'table', title: n => `Place ${n} decorations`, value: s => countCat(s, 'decor'), target: seq([3, 6, 10, 15, 20, 30, 40, 55, 70], 1), max: 9 },
    { kind: 'supply', icon: 'garden', title: n => `Own ${n} supply buildings`, value: s => countCat(s, 'supply'), target: seq([1, 2, 3, 4, 6, 8, 10], 1), max: 7 },
    { kind: 'levels', icon: 'up', title: n => `Reach ${n} total building levels`, value: s => s.stats.maxLevels, target: seq([10, 20, 35, 55, 80, 110, 150, 200, 260, 330, 420], 1.2) },
    { kind: 'land', icon: 'land', title: n => `Expand your land ${n} time${n > 1 ? 's' : ''}`, value: s => s.stats.landBought, target: seq([1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 40], 1), max: 11 },
    { kind: 'earn', icon: 'cash', title: n => `Earn ${formatMoney(n)} in total`, value: s => s.lifetime, target: t => 2e3 * Math.pow(12, t) },
    { kind: 'research', icon: 'flask', title: n => `Complete ${n} research${n > 1 ? 'es' : ''}`, value: s => s.stats.research, target: seq([1, 3, 6, 10, 15, 21, 28, 36], 1), max: 8 },
    { kind: 'staff', icon: 'chefhat', title: n => `Recruit ${n} chef${n > 1 ? 's' : ''}`, value: s => s.stats.recruited, target: seq([1, 3, 5, 8, 12, 16, 20, 25, 30], 1.2) },
    { kind: 'vip', icon: 'crown', title: n => `Welcome ${n} VIP visitor${n > 1 ? 's' : ''}`, value: s => s.stats.golden, target: seq([1, 3, 8, 15, 30, 60, 100], 1.5) },
  ];
  const QUEST_BY_KIND = Object.fromEntries(QUESTS.map(q => [q.kind, q]));
  function questList(state) {
    const list = [];
    for (const q of QUESTS) {
      const tier = state.quests[q.kind] || 0;
      if (q.max !== undefined && tier >= q.max) continue;
      const target = q.target(tier), v = q.value(state);
      list.push({ kind: q.kind, icon: q.icon, tier, title: q.title(target), value: Math.min(v, target), target, done: v >= target,
        gems: q.gems ? q.gems(tier) : Math.min(15, 3 + tier * 2), xp: 25 * (tier + 1) });
    }
    return list.sort((a, b) => (b.done - a.done) || (b.value / b.target - a.value / a.target));
  }
  function claimQuest(state, kind) {
    const q = questList(state).find(x => x.kind === kind);
    if (!q || !q.done) return null;
    state.quests[kind] = q.tier + 1;
    state.gems += q.gems;
    addXp(state, q.xp);
    return q;
  }

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [];
  const ach = (id, icon, name, desc, check) => ACHIEVEMENTS.push({ id, icon, name, desc, check });
  [3, 5, 8, 10, 13, 15, 18, 20].forEach(l => ach(`hall_${l}`, 'hall', `Market Hall ${l}`, `Upgrade the Market Hall to level ${l}`, s => hallLevel(s) >= l));
  DEFS.forEach((d, t) => { if (d.cat === 'stall' || d.cat === 'supply') [5, 10, 15].forEach(l => ach(`lv_${d.id}_${l}`, d.icon, `${d.name} ${l}`, `Upgrade a ${d.name} to level ${l}`, s => { let ok = false; eachB(s, b => { if (b.t === t && b.lv >= l) ok = true; }); return ok; })); });
  [[1e4, 'Ten Grand'], [1e6, 'Millionaire'], [1e9, 'Billionaire'], [1e12, 'Trillionaire'], [1e15, 'Food Titan']].forEach(([v, n]) => ach(`earn_${v}`, 'cash', n, `Earn ${formatMoney(v)} all-time`, s => s.lifetime >= v));
  [[3, 'Neighbour'], [8, 'Landowner'], [15, 'Land Baron'], [30, 'Tycoon Estate']].forEach(([v, n]) => ach(`land_${v}`, 'land', n, `Expand your land ${v} times`, s => s.stats.landBought >= v));
  [[10, 'Cosy Corner'], [30, 'Pretty Park'], [60, 'Garden of Delights']].forEach(([v, n]) => ach(`decor_${v}`, 'planter', n, `Place ${v} decorations`, s => countCat(s, 'decor') >= v));
  [[2, 'Second Location'], [3, 'Big City'], [4, 'Neon Lights']].forEach(([v, n]) => ach(`park_${v}`, 'map', n, `Open ${v} parks`, s => s.parks.filter(p => p.unlocked).length >= v));
  [[1, 'First Hire'], [5, 'Kitchen Crew'], [15, 'Dream Team']].forEach(([v, n]) => ach(`staff_${v}`, 'chefhat', n, `Have ${v} chef${v > 1 ? 's' : ''}`, s => s.staff.length >= v));
  [[1, 'VIP Treatment'], [10, 'Regular VIPs'], [50, 'VIP Magnet']].forEach(([v, n]) => ach(`vip_${v}`, 'crown', n, `Welcome ${v} VIP visitor${v > 1 ? 's' : ''}`, s => s.stats.golden >= v));
  [[50, 'Busy Collector'], [500, 'Coin Magnet'], [5000, 'Collector Supreme']].forEach(([v, n]) => ach(`col_${v}`, 'coin', n, `Collect ${v} times`, s => s.stats.collects >= v));
  [[5, 'Rising Star'], [10, 'Local Legend'], [20, 'Household Name'], [30, 'Living Legend']].forEach(([v, n]) => ach(`plv_${v}`, 'xp', n, `Reach player level ${v}`, s => s.level >= v));
  const ACH_IDS = new Set(ACHIEVEMENTS.map(a => a.id));
  function checkAchievements(state) {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) if (!state.achievements[a.id] && a.check(state)) { state.achievements[a.id] = true; state.gems += 5; unlocked.push(a); }
    return unlocked;
  }

  return {
    SAVE_VERSION, CELLS, PARCEL, PN, HALL, HALL_MAX, ID, DEFS, PARKS, RESEARCH, RARITIES, ACHIEVEMENTS, QUESTS,
    COST, FREE_FINISH_SEC, LEVEL_BONUS, ACHIEVEMENT_BONUS, FRENZY_MULT, BOOST_DURATION_MS, STAFF_MAX, STAFF_MAX_LEVEL, STORE_HOURS,
    formatNumber, formatMoney, formatTime,
    newState, loadState,
    eachB, findB, hallB, hallLevel, builderCount, countType, countCat, totalLevels, parcelCount, jobFor, freeBuilders,
    parcelOf, ownsCell, occupant, fits, parcelAdjacent, landPrice, canBuyParcel, buyParcel, maxParcels,
    upgradeCost, baseOutput, maxLevel, maxCount, canBuild, build, canUpgrade, startUpgrade, speedUpCost, speedUp, move, demolish, buyBuilder,
    decorBonus, globalMult, typeMult, rate, storeCap, totals, earn, collect, collectAll, tick,
    canUnlockPark, unlockPark, canResearch, research,
    staffById, staffBonus, recruitStatus, recruit, staffAt, assignStaff, unassignStaff, staffUpgradeCost, upgradeStaff, dismissStaff,
    xpForLevel, addXp, takeLevelUps, spendGems,
    addBoost, buyBoost, timeWarp, vipReward, tip, crateStatus, openCrate, dailyStatus, claimDaily,
    questList, claimQuest, checkAchievements, achievementCount,
  };
});
