/*
 * Yum Empire — rules of the game (v4: a realistic street-food business).
 * Pure logic, no DOM access, so it can be unit-tested and simulated in Node.
 *
 * How money works
 *   Food stalls sell dishes at real prices. Each dish uses ingredients from your inventory.
 *   A stall only runs when a hired cook works there. Sales per hour are the lowest of:
 *   how many customers want to eat there (demand), how fast the staff can cook (capacity),
 *   and how many dishes your ingredients allow. Money goes straight into your cash.
 *   Workers are paid an hourly wage, the city takes sales tax, and every plot of land you own
 *   costs a little rent. Profit is what is left.
 *
 *   Ingredients come from farms, gardens, fish ponds and a livestock barn, each run by hired
 *   farmers or fishers. Anything you don't grow can be bought at the market (at a mark-up).
 *
 * The park
 *   A 24 × 24 grid split into 4 × 4 plots. Buy the plot next to yours to expand.
 *   The Market Hall's level unlocks buildings, how many you may own, how high they can be
 *   upgraded and how much land you can hold. Building and upgrading take real time and a builder.
 */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Engine = E;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAVE_VERSION = 4;
  const CELLS = 24, PARCEL = 4, PN = CELLS / PARCEL;
  const HALL_MAX = 20;
  const SALES_TAX = 0.1;            // 10% of every sale
  const RENT_PER_PLOT = 5;          // $ per hour for each plot of land
  const SUPPLIES = 0.08;            // packaging, gas and napkins: 8% of sales
  const OFFLINE_CAP_SEC = 12 * 3600;
  const FREE_FINISH_SEC = 60;
  // The business runs on a game clock: one real minute is half an hour in the park,
  // so a full day of trade (breakfast, lunch rush, dinner, quiet night) takes 48 minutes.
  // Prices, wages and rent are per game hour. Building timers are real time.
  const TIME_SCALE = 30;
  // How busy the street is at each hour of the game day (lunch and dinner peaks).
  const DAY_CURVE = (() => {
    const c = [0.25, 0.15, 0.1, 0.1, 0.1, 0.2, 0.45, 0.75, 0.9, 0.8, 0.9, 1.4, 1.9, 1.7, 1.1, 0.9, 1.0, 1.3, 1.8, 1.9, 1.5, 1.1, 0.7, 0.45];
    const mean = c.reduce((a, v) => a + v, 0) / c.length;
    return c.map(v => v / mean);
  })();
  const gameHours = (now) => (now / 1000) * TIME_SCALE / 3600;
  function gameDay(state, now) { return Math.max(1, gameClock(now).day - gameClock(state.createdAt).day + 1); }
  function gameClock(now) { const h = gameHours(now); return { day: Math.floor(h / 24), hour: Math.floor(h % 24), minute: Math.floor((h % 1) * 60), frac: (h % 24) / 24 }; }
  const COST = { builder: 250, reroll: 10, orderSkip: 5, boost: 25, crate: 20 };   // gem prices

  // ---------- Ingredients ----------
  const INGS = [
    { id: 'wheat', name: 'Wheat',      icon: 'wheat', price: 1.2 },
    { id: 'veg',   name: 'Vegetables', icon: 'veg',   price: 1.0 },
    { id: 'rice',  name: 'Rice',       icon: 'rice',  price: 1.4 },
    { id: 'fruit', name: 'Fruit',      icon: 'fruit', price: 1.6 },
    { id: 'spice', name: 'Spices',     icon: 'spice', price: 2.5 },
    { id: 'fish',  name: 'Fish',       icon: 'fish',  price: 3.0 },
    { id: 'meat',  name: 'Meat',       icon: 'meat',  price: 3.5 },
  ];
  const ING = Object.fromEntries(INGS.map(i => [i.id, i]));
  const MARKUP = 1.6;               // buying at the market costs 60% more than an ingredient's value
  const SELL_RATE = 0.6;            // selling to the market gets 60% of its value

  // ---------- Buildings ----------
  // cat: hall | stall | farm (needs farmers) | water (needs fishers) | storage | decor
  // stalls: price ($ per dish), recipe (ingredients per dish), demand (customers/h at L1), rate (dishes/h per cook)
  // farms: makes {ingredient: units per hour per worker}
  // slots: workers that fit at level 1 (one more every 3 levels, up to maxSlots)
  const DEFS = [
    { id: 'hall',      name: 'Market Hall',     icon: 'hall',     cat: 'hall',    w: 2, h: 2, hall: 0,  n0: 1, every: 99, cap: 1,  cost: 400,   time: 60 },
    { id: 'cart',      name: 'Noodle Cart',     icon: 'noodle',   cat: 'stall',   w: 1, h: 1, hall: 0,  n0: 1, every: 3, cap: 4,  cost: 250,   time: 30,    price: 4,   recipe: { wheat: 1, veg: 1 }, demand: 90, rate: 60, slots: 1, maxSlots: 3 },
    { id: 'dumpling',  name: 'Dumpling Stand',  icon: 'dumpling', cat: 'stall',   w: 1, h: 1, hall: 2,  n0: 1, every: 3, cap: 4,  cost: 1200,  time: 300,   price: 5,   recipe: { wheat: 1, meat: 1 }, demand: 100, rate: 65, slots: 1, maxSlots: 3 },
    { id: 'tea',       name: 'Bubble Tea Bar',  icon: 'tea',      cat: 'stall',   w: 1, h: 1, hall: 3,  n0: 1, every: 3, cap: 4,  cost: 3000,  time: 600,   price: 4.5, recipe: { fruit: 1 }, demand: 130, rate: 90, slots: 1, maxSlots: 3 },
    { id: 'taco',      name: 'Taco Truck',      icon: 'taco',     cat: 'stall',   w: 1, h: 2, hall: 4,  n0: 1, every: 3, cap: 4,  cost: 8000,  time: 1200,  price: 6,   recipe: { meat: 1, veg: 1, spice: 1 }, demand: 120, rate: 60, slots: 2, maxSlots: 4 },
    { id: 'pizza',     name: 'Pizza Parlor',    icon: 'pizza',    cat: 'stall',   w: 2, h: 2, hall: 5,  n0: 1, every: 3, cap: 3,  cost: 12000, time: 2400,  price: 12,  recipe: { wheat: 2, veg: 1, meat: 1 }, demand: 150, rate: 45, slots: 2, maxSlots: 6 },
    { id: 'sushi',     name: 'Sushi Bar',       icon: 'sushi',    cat: 'stall',   w: 2, h: 2, hall: 7,  n0: 1, every: 3, cap: 3,  cost: 80000, time: 4800,  price: 15,  recipe: { rice: 2, fish: 1 }, demand: 160, rate: 50, slots: 2, maxSlots: 6 },
    { id: 'burger',    name: 'Burger Joint',    icon: 'burger',   cat: 'stall',   w: 2, h: 2, hall: 9,  n0: 1, every: 3, cap: 3,  cost: 2.5e5, time: 7200,  price: 11,  recipe: { meat: 1, wheat: 1, veg: 1 }, demand: 260, rate: 70, slots: 3, maxSlots: 8 },
    { id: 'court',     name: 'Food Court',      icon: 'court',    cat: 'stall',   w: 3, h: 3, hall: 12, n0: 1, every: 4, cap: 2,  cost: 1.2e6, time: 14400, price: 16,  recipe: { rice: 1, meat: 1, veg: 1, spice: 1 }, demand: 450, rate: 80, slots: 4, maxSlots: 12, rep: 8 },
    { id: 'global',    name: 'Global Kitchen',  icon: 'globe',    cat: 'stall',   w: 3, h: 3, hall: 15, n0: 1, every: 4, cap: 2,  cost: 6e6,   time: 28800, price: 32,  recipe: { fish: 1, meat: 1, spice: 1, fruit: 1 }, demand: 500, rate: 70, slots: 4, maxSlots: 12, rep: 14 },
    { id: 'field',     name: 'Wheat Field',     icon: 'wheat',    cat: 'farm',    w: 2, h: 2, hall: 0,  n0: 1, every: 3, cap: 5,  cost: 300,   time: 45,    makes: { wheat: 40 }, slots: 1, maxSlots: 3 },
    { id: 'garden',    name: 'Veggie Garden',   icon: 'garden',   cat: 'farm',    w: 2, h: 2, hall: 0,  n0: 1, every: 3, cap: 5,  cost: 300,   time: 45,    makes: { veg: 40 }, slots: 1, maxSlots: 3 },
    { id: 'orchard',   name: 'Fruit Orchard',   icon: 'fruit',    cat: 'farm',    w: 2, h: 2, hall: 3,  n0: 1, every: 3, cap: 4,  cost: 2000,  time: 480,   makes: { fruit: 40 }, slots: 1, maxSlots: 3 },
    { id: 'paddy',     name: 'Rice Paddy',      icon: 'rice',     cat: 'farm',    w: 2, h: 2, hall: 6,  n0: 1, every: 3, cap: 4,  cost: 20000, time: 2400,  makes: { rice: 50 }, slots: 1, maxSlots: 3 },
    { id: 'spicegdn',  name: 'Spice Garden',    icon: 'spice',    cat: 'farm',    w: 1, h: 1, hall: 4,  n0: 1, every: 3, cap: 4,  cost: 5000,  time: 900,   makes: { spice: 30 }, slots: 1, maxSlots: 2 },
    { id: 'barn',      name: 'Livestock Barn',  icon: 'meat',     cat: 'farm',    w: 2, h: 3, hall: 2,  n0: 1, every: 3, cap: 4,  cost: 1500,  time: 360,   makes: { meat: 30 }, slots: 1, maxSlots: 3 },
    { id: 'pond',      name: 'Fish Pond',       icon: 'fishmkt',  cat: 'water',   w: 2, h: 2, hall: 5,  n0: 1, every: 3, cap: 4,  cost: 12000, time: 1800,  makes: { fish: 30 }, slots: 1, maxSlots: 3 },
    { id: 'greenhouse', name: 'Greenhouse',     icon: 'farm',     cat: 'farm',    w: 3, h: 2, hall: 10, n0: 1, every: 4, cap: 2,  cost: 5e5,   time: 10800, makes: { veg: 120, fruit: 120 }, slots: 2, maxSlots: 4 },
    { id: 'warehouse', name: 'Warehouse',       icon: 'crate',    cat: 'storage', w: 2, h: 2, hall: 1,  n0: 1, every: 5, cap: 3,  cost: 800,   time: 180,   store: 600 },
    { id: 'table',     name: 'Picnic Table',    icon: 'table',    cat: 'decor',   w: 1, h: 1, hall: 0,  n0: 3, every: 1, cap: 30, cost: 60,    time: 0, bonus: 0.06, radius: 1, seats: 4 },
    { id: 'bin',       name: 'Trash Bin',       icon: 'bin',      cat: 'decor',   w: 1, h: 1, hall: 0,  n0: 2, every: 1, cap: 24, cost: 80,    time: 0, bonus: 0,    radius: 0, clean: 120 },
    { id: 'lamp',      name: 'Street Lamp',     icon: 'lamp',     cat: 'decor',   w: 1, h: 1, hall: 2,  n0: 2, every: 1, cap: 24, cost: 300,   time: 0, bonus: 0.04, radius: 2 },
    { id: 'planter',   name: 'Flower Planter',  icon: 'planter',  cat: 'decor',   w: 1, h: 1, hall: 3,  n0: 2, every: 2, cap: 16, cost: 700,   time: 0, bonus: 0.08, radius: 1 },
    { id: 'tree',      name: 'Shade Tree',      icon: 'tree',     cat: 'decor',   w: 1, h: 1, hall: 4,  n0: 2, every: 2, cap: 16, cost: 2500,  time: 0, bonus: 0.12, radius: 1 },
    { id: 'umbrella',  name: 'Umbrella Table',  icon: 'umbrella', cat: 'decor',   w: 1, h: 1, hall: 5,  n0: 2, every: 2, cap: 16, cost: 8000,  time: 0, bonus: 0.16, radius: 1, seats: 4 },
    { id: 'fountain',  name: 'Fountain',        icon: 'fountain', cat: 'decor',   w: 2, h: 2, hall: 7,  n0: 1, every: 4, cap: 3,  cost: 1e5,   time: 0, bonus: 0.3,  radius: 2 },
    { id: 'stage',     name: 'Music Stage',     icon: 'stage',    cat: 'decor',   w: 3, h: 2, hall: 10, n0: 1, every: 5, cap: 2,  cost: 1.5e6, time: 0, bonus: 0.5,  radius: 3 },
  ];
  const ID = Object.fromEntries(DEFS.map((d, i) => [d.id, i]));
  const HALL = ID.hall;
  const ROLE = { stall: 'cook', farm: 'farmer', water: 'fisher' };

  const PARKS = [
    { id: 'suburb', name: 'Maple Suburb',    icon: 'suburb', hall: 0,  cost: 0,    mult: 1,   start: [[2, 2], [3, 2]] },
    { id: 'town',   name: 'Riverside Town',  icon: 'town',   hall: 8,  cost: 5e6,  mult: 1.5, start: [[2, 2], [3, 2]] },
    { id: 'city',   name: 'Downtown City',   icon: 'city',   hall: 13, cost: 2e8,  mult: 2.2, start: [[2, 2], [3, 2]] },
    { id: 'metro',  name: 'Neon Metropolis', icon: 'metro',  hall: 17, cost: 5e9,  mult: 3.2, start: [[2, 2], [3, 2]] },
  ];

  // ---------- Formatting ----------
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
  function formatNumber(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + formatNumber(-n);
    if (n < 1000) return n < 10 && n % 1 !== 0 ? n.toFixed(1).replace(/\.0$/, '') : Math.floor(n).toString();
    let tier = Math.floor(Math.log10(n) / 3);
    const scaled = n / Math.pow(10, tier * 3);
    let txt = scaled.toFixed(scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2);
    if (parseFloat(txt) >= 1000) { tier++; txt = '1.00'; }
    return txt + (tier < SUFFIXES.length ? SUFFIXES[tier] : 'e' + tier * 3);
  }
  function formatMoney(n) {
    if (Math.abs(n) < 100 && n % 1 !== 0) return (n < 0 ? '-$' : '$') + Math.abs(n).toFixed(2);
    return (n < 0 ? '-$' : '$') + formatNumber(Math.abs(n));
  }
  function formatTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }
  // Deterministic random numbers from a seed (so candidates, orders and rivals are stable)
  function rng(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

  // ---------- Costs and levels ----------
  function upgradeCost(t, lv) {
    const d = DEFS[t];
    if (t === HALL) {
      if (lv === 0) return { cash: d.cost, tokens: 0, time: d.time };
      return { cash: Math.round(500 * Math.pow(2.35, lv - 1)), tokens: lv >= 5 ? Math.round(2 * Math.pow(1.5, lv - 5)) : 0, time: Math.min(86400, Math.round(90 * Math.pow(2.05, lv - 1))) };
    }
    if (lv === 0) return { cash: d.cost, tokens: 0, time: d.time };
    if (d.cat === 'decor') return null;
    return { cash: Math.round(d.cost * 0.8 * Math.pow(2.0, lv)), tokens: lv >= 6 ? Math.round(Math.pow(1.4, lv - 5)) : 0, time: Math.min(86400, Math.round(Math.max(30, d.time) * Math.pow(1.75, lv))) };
  }
  function maxLevel(state, t) {
    if (t === HALL) return HALL_MAX;
    if (DEFS[t].cat === 'decor') return 1;
    return Math.max(2, hallLevel(state));
  }
  function maxCount(state, t) {
    const d = DEFS[t], hl = hallLevel(state);
    if (hl < d.hall) return 0;
    if (t === HALL) return 1;
    return Math.min(d.cap, d.n0 + Math.floor((hl - d.hall) / d.every));
  }
  function maxParcels(state) { return Math.min(PN * PN, 3 + hallLevel(state) * 2); }
  function slotsFor(t, lv) { const d = DEFS[t]; return d.slots ? Math.min(d.maxSlots, d.slots + Math.floor(Math.max(0, lv - 1) / 3)) : 0; }

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
      cash: 400, gems: 30, tokens: 0, rep: 0, xp: 0, level: 1,
      inv: { wheat: 40, veg: 40, rice: 0, fruit: 0, spice: 0, fish: 0, meat: 0 },
      cards: { rush: 0, instant: 1, harvest: 0, reroll: 1 },
      park: 0, parks: PARKS.map((_, i) => newPark(i)), uid: 1, jobs: [], boughtBuilder: false,
      workers: [], wseq: 1, candidates: [], candAt: 0, cseed: (now % 100000) + 7,
      skills: {}, research: {}, achievements: {}, quests: {}, mission: 0,
      orders: [], orderSeed: (now % 99991) + 3, ordersDone: 0,
      event: null, nextEventAt: now + 20 * 60e3, weather: { kind: 'sun', until: now + 15 * 60e3 }, wseed: (now % 7919) + 11,
      boostUntil: 0, rushUntil: 0, crateAt: 0,
      premium: false, adsRemoved: false,
      lastSeen: now, createdAt: now,
      daily: { last: '', streak: 0 },
      ledger: [],                         // one entry per day: revenue, tax, wages, rent, market, dishes
      stats: { dishes: 0, earned: 0, landBought: 0, built: 0, upgraded: 0, hired: 0, crates: 0, golden: 0, tips: 0, playTime: 0, maxLevels: 0, bought: 0 },
      settings: { sound: true, music: true, haptics: true, lens: true, weather: true },
      tutorialDone: false,
    };
    // You start with one stand on your little plot.
    s.parks[0].b.push({ u: s.uid++, t: ID.cart, x: 11, y: 10, lv: 1 });
    s.candidates = makeCandidates(s, now);
    s.orders = [makeOrder(s, now), makeOrder(s, now), makeOrder(s, now)];
    return s;
  }

  function loadState(raw, now) {
    const s = newState(now);
    if (!raw || typeof raw !== 'object') return s;
    const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
    s.gems = Math.max(s.gems, Math.floor(num(raw.gems, 0)));
    s.premium = !!raw.premium; s.adsRemoved = !!raw.adsRemoved;
    if (raw.settings) for (const k of Object.keys(s.settings)) if (typeof raw.settings[k] === 'boolean') s.settings[k] = raw.settings[k];
    if (raw.v !== SAVE_VERSION) return s;   // older versions were different games: start fresh, keep gems and purchases
    ['cash', 'tokens', 'rep', 'xp', 'boostUntil', 'rushUntil', 'crateAt', 'uid', 'wseq', 'candAt', 'cseed', 'orderSeed', 'ordersDone', 'nextEventAt', 'wseed', 'mission']
      .forEach(k => { s[k] = Math.max(0, num(raw[k], s[k])); });
    s.level = Math.max(1, Math.floor(num(raw.level, 1)));
    s.boughtBuilder = !!raw.boughtBuilder; s.tutorialDone = !!raw.tutorialDone;
    s.lastSeen = num(raw.lastSeen, s.lastSeen); s.createdAt = num(raw.createdAt, s.createdAt);
    s.park = Math.min(PARKS.length - 1, Math.max(0, Math.floor(num(raw.park, 0))));
    if (raw.inv) for (const k of Object.keys(s.inv)) s.inv[k] = Math.max(0, num(raw.inv[k], 0));
    if (raw.cards) for (const k of Object.keys(s.cards)) s.cards[k] = Math.max(0, Math.floor(num(raw.cards[k], 0)));
    if (Array.isArray(raw.parks)) {
      raw.parks.forEach((rp, i) => {
        if (!s.parks[i] || !rp) return;
        const p = s.parks[i];
        if (i > 0) p.unlocked = !!rp.unlocked;
        if (Array.isArray(rp.parcels)) rp.parcels.forEach((o, k) => { if (k < p.parcels.length) p.parcels[k] = p.parcels[k] || !!o; });
        if (Array.isArray(rp.b)) {
          p.b = [];
          rp.b.forEach(b => {
            if (!b || typeof b !== 'object') return;
            const t = Math.floor(num(b.t, -1));
            if (!DEFS[t] || (t === HALL && (i !== 0 || p.b.some(o => o.t === HALL)))) return;
            const nb = { u: Math.floor(num(b.u, 0)), t, x: Math.floor(num(b.x, -1)), y: Math.floor(num(b.y, -1)), lv: Math.max(0, Math.min(HALL_MAX, Math.floor(num(b.lv, 0)))) };
            if (nb.u < 1 || s.parks.some(pp => pp.b.some(o => o.u === nb.u))) nb.u = s.uid++;
            if (fits(p, t, nb.x, nb.y, -1)) p.b.push(nb);
          });
        }
      });
      if (!s.parks[s.park].unlocked) s.park = 0;
    }
    s.uid = Math.max(s.uid, 1 + Math.max(0, ...s.parks.flatMap(p => p.b.map(b => b.u))));
    if (Array.isArray(raw.jobs)) s.jobs = raw.jobs.filter(j => j && findB(s, j.park, j.u)).slice(0, 3).map(j => ({ u: j.u, park: j.park, end: num(j.end, 0), dur: Math.max(1, num(j.dur, 1)) }));
    const okWorker = (w) => w && typeof w === 'object' && ['cook', 'farmer', 'fisher'].includes(w.role);
    const cleanWorker = (w) => ({ id: Math.floor(num(w.id, 0)), name: String(w.name || 'Worker').slice(0, 16), role: w.role, skill: Math.min(5, Math.max(1, Math.floor(num(w.skill, 1)))),
      trait: TRAITS[w.trait] ? w.trait : 'none', wage: Math.max(1, num(w.wage, 10)), lvl: Math.min(10, Math.max(1, Math.floor(num(w.lvl, 1)))), face: Math.floor(num(w.face, 1)),
      at: w.at && typeof w.at === 'object' ? { park: Math.floor(num(w.at.park, 0)), u: Math.floor(num(w.at.u, 0)) } : null });
    if (Array.isArray(raw.workers)) s.workers = raw.workers.filter(okWorker).slice(0, 80).map(cleanWorker).filter(w => w.id > 0);
    s.workers.forEach(w => { if (w.at && !findB(s, w.at.park, w.at.u)) w.at = null; });
    if (Array.isArray(raw.candidates)) s.candidates = raw.candidates.filter(okWorker).slice(0, 6).map(cleanWorker);
    if (Array.isArray(raw.orders)) s.orders = raw.orders.filter(o => o && o.need && typeof o.need === 'object').slice(0, 3).map(o => ({
      id: Math.floor(num(o.id, 0)), who: String(o.who || 'Customer').slice(0, 24), need: Object.fromEntries(Object.entries(o.need).filter(([k]) => ING[k]).map(([k, v]) => [k, Math.max(1, Math.floor(num(v, 1)))])),
      cash: num(o.cash, 0), tokens: Math.floor(num(o.tokens, 0)), rep: Math.floor(num(o.rep, 0)), readyAt: num(o.readyAt, 0) }));
    while (s.orders.length < 3) s.orders.push(makeOrder(s, now));
    if (raw.event && EVENTS[raw.event.id]) s.event = { id: raw.event.id, until: num(raw.event.until, 0) };
    if (raw.weather && WEATHER[raw.weather.kind]) s.weather = { kind: raw.weather.kind, until: num(raw.weather.until, 0) };
    for (const k of ['skills', 'research']) if (raw[k]) for (const id of Object.keys(raw[k])) s[k][id] = Math.max(0, Math.min(3, Math.floor(num(raw[k][id], 0))));
    if (raw.achievements) for (const id of Object.keys(raw.achievements)) if (ACH_IDS.has(id)) s.achievements[id] = true;
    if (raw.quests) for (const id of Object.keys(raw.quests)) if (QUEST_BY_KIND[id]) s.quests[id] = Math.max(0, Math.floor(num(raw.quests[id], 0)));
    if (raw.daily) s.daily = { last: String(raw.daily.last || ''), streak: num(raw.daily.streak, 0) };
    if (Array.isArray(raw.ledger)) s.ledger = raw.ledger.slice(-14).filter(e => e && typeof e.day === 'string').map(e => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, k === 'day' ? v : num(v, 0)])));
    if (raw.stats) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k], s.stats[k]);
    return s;
  }

  // ---------- Lookups ----------
  function eachB(state, fn) { state.parks.forEach((p, pi) => p.b.forEach(b => fn(b, pi))); }
  function findB(state, pi, u) { const p = state.parks[pi]; return p ? p.b.find(b => b.u === u) || null : null; }
  function hallB(state) { return state.parks[0].b.find(b => b.t === HALL) || null; }
  function hallLevel(state) { const h = hallB(state); return h ? h.lv : 0; }
  function countType(state, t) { let n = 0; eachB(state, b => { if (b.t === t) n++; }); return n; }
  function countCat(state, cat) { let n = 0; eachB(state, b => { if (DEFS[b.t].cat === cat) n++; }); return n; }
  function totalLevels(state) { let n = 0; eachB(state, b => { if (DEFS[b.t].cat !== 'decor') n += b.lv; }); return n; }
  function parcelCount(state) { return state.parks.reduce((a, p) => a + (p.unlocked ? p.parcels.filter(Boolean).length : 0), 0); }
  function jobFor(state, pi, u) { return state.jobs.find(j => j.park === pi && j.u === u) || null; }
  function builderCount(state) { return 1 + (hallLevel(state) >= 4 ? 1 : 0) + (state.boughtBuilder ? 1 : 0); }
  function freeBuilders(state) { return builderCount(state) - state.jobs.length; }
  function workersAt(state, pi, u) { return state.workers.filter(w => w.at && w.at.park === pi && w.at.u === u); }

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
    for (let i = 0; i < d.w; i++) for (let j = 0; j < d.h; j++) if (!ownsCell(park, x + i, y + j) || occupant(park, x + i, y + j, ignoreU)) return false;
    return true;
  }
  function parcelAdjacent(park, k) {
    const px = k % PN, py = Math.floor(k / PN);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = px + dx, ny = py + dy; return nx >= 0 && ny >= 0 && nx < PN && ny < PN && park.parcels[ny * PN + nx]; });
  }
  function landPrice(state) { return Math.round(1500 * Math.pow(2.4, state.stats.landBought)); }
  function canBuyParcel(state, pi, k) {
    const park = state.parks[pi];
    if (!park || !park.unlocked || park.parcels[k] || !parcelAdjacent(park, k)) return { ok: false, why: 'Must be next to your land' };
    if (parcelCount(state) >= maxParcels(state)) return { ok: false, why: hallLevel(state) ? 'Upgrade the Market Hall to own more land' : 'Build a Market Hall first' };
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
    if (t === HALL && (pi !== 0 || hallB(state))) return { ok: false, why: 'Only one Market Hall' };
    if (hallLevel(state) < d.hall) return { ok: false, why: d.hall === 1 ? 'Needs a Market Hall' : `Needs Market Hall level ${d.hall}` };
    if (d.rep && repLevel(state) < d.rep) return { ok: false, why: `Needs reputation level ${d.rep}` };
    if (countType(state, t) >= maxCount(state, t)) return { ok: false, why: countType(state, t) >= d.cap ? 'You own the maximum' : 'Upgrade the Market Hall to build more' };
    if (d.time > 0 && freeBuilders(state) < 1) return { ok: false, why: 'All builders are busy' };
    if (state.cash < d.cost) return { ok: false, why: 'Not enough cash' };
    return { ok: true };
  }
  function build(state, pi, t, x, y, now) {
    const park = state.parks[pi];
    if (!park || !park.unlocked || !canBuild(state, pi, t).ok || !fits(park, t, x, y, -1)) return null;
    const d = DEFS[t];
    state.cash -= d.cost;
    const b = { u: state.uid++, t, x, y, lv: d.time > 0 ? 0 : 1 };
    park.b.push(b);
    if (d.time > 0) state.jobs.push({ u: b.u, park: pi, end: now + d.time * 1000, dur: d.time });
    state.stats.built++;
    addXp(state, 10 + Math.round(d.time / 30));
    return b;
  }
  function canUpgrade(state, pi, u) {
    const b = findB(state, pi, u);
    if (!b) return { ok: false, why: '' };
    if (DEFS[b.t].cat === 'decor') return { ok: false, why: 'Decorations have one level' };
    if (jobFor(state, pi, u)) return { ok: false, why: 'Under construction' };
    if (b.lv >= maxLevel(state, b.t)) return { ok: false, why: b.t === HALL ? 'Maximum level' : hallLevel(state) ? 'Upgrade the Market Hall first' : 'Build a Market Hall first' };
    const c = upgradeCost(b.t, b.lv);
    if (freeBuilders(state) < 1) return { ok: false, why: 'All builders are busy', cost: c };
    if (state.cash < c.cash) return { ok: false, why: 'Not enough cash', cost: c };
    if (state.tokens < c.tokens) return { ok: false, why: 'Not enough Food Tokens', cost: c };
    return { ok: true, cost: c };
  }
  function startUpgrade(state, pi, u, now) {
    const r = canUpgrade(state, pi, u);
    if (!r.ok) return false;
    state.cash -= r.cost.cash;
    state.tokens -= r.cost.tokens;
    state.jobs.push({ u, park: pi, end: now + r.cost.time * 1000, dur: r.cost.time });
    return true;
  }
  function speedUpCost(job, now) { const sec = Math.max(0, (job.end - now) / 1000); return sec <= FREE_FINISH_SEC ? 0 : Math.ceil(Math.sqrt(sec) * 0.9); }
  function speedUp(state, pi, u, now) {
    const j = jobFor(state, pi, u);
    if (!j) return false;
    const g = speedUpCost(j, now);
    if (state.gems < g) return false;
    state.gems -= g; j.end = now;
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
    if (!b || DEFS[b.t].cat !== 'decor') return false;
    park.b.splice(park.b.indexOf(b), 1);
    state.cash += Math.round(DEFS[b.t].cost * 0.5);
    return true;
  }
  function buyBuilder(state) { if (state.boughtBuilder || state.gems < COST.builder) return false; state.gems -= COST.builder; state.boughtBuilder = true; return true; }

  // ---------- Workers ----------
  const TRAITS = {
    none:     { name: '',            desc: '' },
    fast:     { name: 'Fast hands',  desc: '+25% output' },
    thrifty:  { name: 'Thrifty',     desc: '−30% wage' },
    charming: { name: 'Charming',    desc: '+15% customers (cooks)' },
    green:    { name: 'Green thumb', desc: '+40% harvest (farmers)' },
    steady:   { name: 'Steady',      desc: '+10% output, +10% wage' },
  };
  const FIRST = ['Mei', 'Diego', 'Priya', 'Tomás', 'Yuki', 'Amara', 'Lars', 'Fatima', 'Kenji', 'Olivia', 'Mateo', 'Aisha', 'Nico', 'Sana', 'Bruno',
    'Lin', 'Zara', 'Otto', 'Ines', 'Ravi', 'Hana', 'Felix', 'Nia', 'Caleb', 'Rosa', 'Arjun', 'Elsa', 'Kofi', 'Mila', 'Jude', 'Omar', 'Lea'];
  const BASE_WAGE = { cook: 16, farmer: 12, fisher: 14 };
  function maxWorkers(state) { return 2 + hallLevel(state) * 3; }
  function workerPower(w) {   // output multiplier
    const t = w.trait === 'fast' ? 1.25 : w.trait === 'steady' ? 1.1 : 1;
    return (1 + 0.35 * (w.skill - 1)) * (1 + 0.08 * (w.lvl - 1)) * t;
  }
  function makeWorker(state, r, role) {
    const roll = Math.min(0.999, r() + Math.min(0.3, hallLevel(state) * 0.015));   // a famous business attracts better staff
    const skill = roll < 0.5 ? 1 : roll < 0.78 ? 2 : roll < 0.93 ? 3 : roll < 0.985 ? 4 : 5;
    const traits = Object.keys(TRAITS);
    const trait = r() < 0.55 ? 'none' : traits[1 + Math.floor(r() * (traits.length - 1))];
    let wage = BASE_WAGE[role] * (1 + 0.45 * (skill - 1)) * (0.9 + r() * 0.2);
    if (trait === 'thrifty') wage *= 0.7;
    if (trait === 'steady') wage *= 1.1;
    return { id: state.wseq++, name: FIRST[Math.floor(r() * FIRST.length)], role, skill, trait, wage: Math.round(wage * 10) / 10, lvl: 1, face: Math.floor(r() * 9999) + 1, at: null };
  }
  function makeCandidates(state, now) {
    const r = rng(state.cseed + Math.floor(now / 1000));
    const roles = ['cook', 'farmer', 'cook', 'farmer', hallLevel(state) >= 5 ? 'fisher' : 'cook'];
    state.candAt = now + 4 * 3600e3;
    return roles.map(role => makeWorker(state, r, role));
  }
  function hireCost(w) { return Math.round(w.wage * 8); }   // signing fee
  function hire(state, id) {
    const i = state.candidates.findIndex(c => c.id === id);
    if (i < 0 || state.workers.length >= maxWorkers(state)) return null;
    const w = state.candidates[i];
    if (state.cash < hireCost(w)) return null;
    state.cash -= hireCost(w);
    state.candidates.splice(i, 1);
    state.workers.push(w);
    state.stats.hired++;
    addXp(state, 10);
    return w;
  }
  function rerollCandidates(state, now, useGems) {
    if (useGems) { if (state.cards.reroll > 0) state.cards.reroll--; else if (!spendGems(state, COST.reroll)) return false; }
    state.cseed++;
    state.candidates = makeCandidates(state, now);
    return true;
  }
  function fire(state, id) { const i = state.workers.findIndex(w => w.id === id); if (i < 0) return false; state.workers.splice(i, 1); return true; }
  function canAssign(state, w, pi, u) {
    const b = findB(state, pi, u);
    if (!b || !w) return false;
    if (ROLE[DEFS[b.t].cat] !== w.role) return false;
    return workersAt(state, pi, u).filter(o => o.id !== w.id).length < slotsFor(b.t, Math.max(1, b.lv));
  }
  function assign(state, id, pi, u) {
    const w = state.workers.find(x => x.id === id);
    if (!canAssign(state, w, pi, u)) return false;
    w.at = { park: pi, u };
    return true;
  }
  function unassign(state, id) { const w = state.workers.find(x => x.id === id); if (!w) return false; w.at = null; return true; }
  function trainCost(w) { return { cash: Math.round(w.wage * 30 * w.lvl), tokens: w.lvl >= 3 ? w.lvl - 2 : 0 }; }
  function train(state, id) {
    const w = state.workers.find(x => x.id === id);
    if (!w || w.lvl >= 10) return false;
    const c = trainCost(w);
    if (state.cash < c.cash || state.tokens < c.tokens) return false;
    state.cash -= c.cash; state.tokens -= c.tokens;
    w.lvl++;
    w.wage = Math.round(w.wage * 1.06 * 10) / 10;
    return true;
  }

  // ---------- Reputation, cleanliness, decor ----------
  function repProgress(state) { let l = 1, need = 100, r = state.rep; while (r >= need && l < 50) { r -= need; l++; need = Math.round(need * 1.6); } return { level: l, have: r, need }; }
  function repLevel(state) { return repProgress(state).level; }
  function decorBonus(park, b) {
    const d = DEFS[b.t];
    if (d.cat !== 'stall') return 0;
    let sum = 0;
    for (const o of park.b) {
      const od = DEFS[o.t];
      if (od.cat !== 'decor' || !od.bonus) continue;
      const gx = Math.max(0, o.x - (b.x + d.w - 1), b.x - (o.x + od.w - 1));
      const gy = Math.max(0, o.y - (b.y + d.h - 1), b.y - (o.y + od.h - 1));
      if (Math.max(gx, gy) <= od.radius) sum += od.bonus;
    }
    return Math.min(2, sum);
  }
  // Cleanliness 0.5 … 1: the street copes with 150 customers an hour, each bin with 120 more.
  function cleanliness(state, pi, customers) {
    let cap = 150;
    for (const b of state.parks[pi].b) if (DEFS[b.t].clean) cap += DEFS[b.t].clean;
    return Math.max(0.5, Math.min(1, 0.5 + 0.5 * cap / Math.max(1, customers)));
  }
  function seats(state, pi) { let n = 0; for (const b of state.parks[pi].b) n += DEFS[b.t].seats || 0; return n; }

  // ---------- Events and weather ----------
  const EVENTS = {
    rush:     { name: 'Lunch Rush',    icon: 'clock', desc: 'Twice as many customers!', demand: 2, mins: 15 },
    festival: { name: 'Food Festival', icon: 'stage', desc: '+50% customers and 1 Food Token per 100 dishes', demand: 1.5, mins: 120, tokens: true },
    critic:   { name: 'Food Critic',   icon: 'medal', desc: 'Reputation earned is tripled', demand: 1, mins: 30, rep: 3 },
    tourists: { name: 'Tour Bus',      icon: 'city',  desc: '+80% customers', demand: 1.8, mins: 20 },
  };
  const WEATHER = {
    sun:   { name: 'Sunny',  icon: 'sun',   demand: 1.05 },
    cloud: { name: 'Cloudy', icon: 'cloud', demand: 1 },
    rain:  { name: 'Rain',   icon: 'rain',  demand: 0.85 },
    snow:  { name: 'Snow',   icon: 'snow',  demand: 0.8 },
  };
  function updateWorldClock(state, now) {
    const changes = [];
    if (state.event && state.event.until <= now) { changes.push({ type: 'eventEnd', id: state.event.id }); state.event = null; }
    if (!state.event && now >= state.nextEventAt && hallLevel(state) >= 1) {
      const r = rng(state.wseed++ + Math.floor(now / 60000));
      const ids = Object.keys(EVENTS), id = ids[Math.floor(r() * ids.length)];
      state.event = { id, until: now + EVENTS[id].mins * 60e3 };
      state.nextEventAt = now + (90 + r() * 120) * 60e3;
      changes.push({ type: 'event', id });
    }
    if (now >= state.weather.until) {
      const r = rng(state.wseed++ + 77);
      const month = new Date(now).getMonth(), winter = month === 11 || month <= 1;
      const pool = winter ? ['sun', 'cloud', 'cloud', 'snow', 'snow', 'rain'] : ['sun', 'sun', 'sun', 'cloud', 'cloud', 'rain'];
      const kind = pool[Math.floor(r() * pool.length)];
      state.weather = { kind, until: now + (10 + r() * 20) * 60e3 };
      changes.push({ type: 'weather', kind });
    }
    return changes;
  }

  // ---------- Skill trees (per kind of shop) and research ----------
  const SKILL_BRANCHES = [
    { id: 'menu',  name: 'Bigger Menu',    icon: 'quests', desc: '+10% price per tier' },
    { id: 'grill', name: 'Faster Kitchen', icon: 'clock',  desc: '+20% cooking speed per tier' },
    { id: 'sign',  name: 'Neon Sign',      icon: 'lamp',   desc: '+15% customers per tier' },
  ];
  function skillKey(t, br) { return DEFS[t].id + '.' + br; }
  function skillTier(state, t, br) { return state.skills[skillKey(t, br)] || 0; }
  function skillCost(t, tier) { return { cash: Math.round(DEFS[t].cost * 2 * Math.pow(4, tier)), tokens: 2 * Math.pow(3, tier) }; }
  function buySkill(state, t, br) {
    const tier = skillTier(state, t, br);
    if (tier >= 3 || countType(state, t) === 0) return false;
    const c = skillCost(t, tier);
    if (state.cash < c.cash || state.tokens < c.tokens) return false;
    state.cash -= c.cash; state.tokens -= c.tokens;
    state.skills[skillKey(t, br)] = tier + 1;
    addXp(state, 25);
    return true;
  }
  const RESEARCH = [
    { id: 'app',     name: 'Delivery App',     icon: 'map',     desc: '+15% customers everywhere', hall: 3,  cash: 5e3, tokens: 3 },
    { id: 'compost', name: 'Compost',          icon: 'garden',  desc: '+25% farm output',          hall: 3,  cash: 4e3, tokens: 3 },
    { id: 'bulk',    name: 'Bulk Buying',      icon: 'bag',     desc: 'Market prices −25%',        hall: 4,  cash: 8e3, tokens: 4 },
    { id: 'loyalty', name: 'Loyalty Cards',    icon: 'star',    desc: '+20% customers everywhere', hall: 6,  cash: 6e4, tokens: 8 },
    { id: 'payroll', name: 'Payroll Software', icon: 'cash',    desc: 'Wages −15%',                hall: 7,  cash: 1e5, tokens: 10 },
    { id: 'tractor', name: 'Tractors',         icon: 'wheat',   desc: '+40% farm output',          hall: 8,  cash: 3e5, tokens: 14 },
    { id: 'tv',      name: 'TV Advert',        icon: 'stage',   desc: '+30% customers everywhere', hall: 10, cash: 2e6, tokens: 25 },
    { id: 'cold',    name: 'Cold Chain',       icon: 'fishmkt', desc: '+40% fish and meat output', hall: 11, cash: 4e6, tokens: 30 },
    { id: 'tax',     name: 'Tax Accountant',   icon: 'quests',  desc: 'Sales tax 10% → 6%',        hall: 12, cash: 1e7, tokens: 40 },
    { id: 'brand',   name: 'Global Brand',     icon: 'globe',   desc: '+50% customers everywhere', hall: 15, cash: 1e8, tokens: 80 },
  ];
  const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map(r => [r.id, r]));
  const has = (state, id) => !!state.research[id];
  function canResearch(state, id) {
    const r = RESEARCH_BY_ID[id];
    if (!r || has(state, id)) return { ok: false, why: 'Done' };
    if (hallLevel(state) < r.hall) return { ok: false, why: `Needs Market Hall level ${r.hall}` };
    if (state.cash < r.cash) return { ok: false, why: 'Not enough cash' };
    if (state.tokens < r.tokens) return { ok: false, why: 'Not enough Food Tokens' };
    return { ok: true };
  }
  function doResearch(state, id) {
    if (!canResearch(state, id).ok) return false;
    const r = RESEARCH_BY_ID[id];
    state.cash -= r.cash; state.tokens -= r.tokens;
    state.research[id] = 1;
    addXp(state, 40);
    return true;
  }
  const taxRate = (state) => (has(state, 'tax') ? 0.06 : SALES_TAX);
  const wageMult = (state) => (has(state, 'payroll') ? 0.85 : 1);
  const marketMult = (state) => (has(state, 'bulk') ? 0.75 : 1);
  function demandMult(state, now) {
    let m = (1 + 0.04 * (repLevel(state) - 1)) * (1 + 0.015 * (state.level - 1));
    if (has(state, 'app')) m *= 1.15;
    if (has(state, 'loyalty')) m *= 1.2;
    if (has(state, 'tv')) m *= 1.3;
    if (has(state, 'brand')) m *= 1.5;
    if (now !== undefined) {
      if (state.event && state.event.until > now) m *= EVENTS[state.event.id].demand;
      if (state.rushUntil > now) m *= 2;
      if (state.boostUntil > now) m *= 2;
      m *= WEATHER[state.weather.kind].demand * DAY_CURVE[gameClock(now).hour];
    }
    if (state.premium) m *= 1.5;
    return m;
  }

  // ---------- The economy: what one building does per hour ----------
  function hourly(state, pi, b, now, dm) {
    const d = DEFS[b.t], out = { staff: 0, demand: 0, capacity: 0, sold: 0, revenue: 0, wages: 0, price: 0, makes: {}, need: {} };
    if (b.lv < 1) return out;
    const ws = workersAt(state, pi, b.u);
    out.staff = ws.length;
    for (const w of ws) out.wages += w.wage * wageMult(state);
    if (!ws.length) return out;
    const lvl = b.lv, power = ws.reduce((a, w) => a + workerPower(w), 0);
    if (d.cat === 'stall') {
      const charm = ws.some(w => w.trait === 'charming') ? 1.15 : 1;
      out.demand = d.demand * Math.pow(1.3, lvl - 1) * (1 + decorBonus(state.parks[pi], b)) * (1 + 0.15 * skillTier(state, b.t, 'sign')) * charm *
        PARKS[pi].mult * (dm === undefined ? demandMult(state, now) : dm);
      out.capacity = d.rate * power * Math.pow(1.07, lvl - 1) * (1 + 0.2 * skillTier(state, b.t, 'grill'));
      out.sold = Math.min(out.demand, out.capacity);
      out.price = d.price * Math.pow(1.04, lvl - 1) * (1 + 0.1 * skillTier(state, b.t, 'menu')) * (1 + (PARKS[pi].mult - 1) * 0.3);
      out.revenue = out.sold * out.price;
      for (const [k, q] of Object.entries(d.recipe)) out.need[k] = q * out.sold;
    } else if (d.makes) {
      for (const [k, q] of Object.entries(d.makes)) {
        let m = q * Math.pow(1.3, lvl - 1) * ws.reduce((a, w) => a + workerPower(w) * (w.trait === 'green' ? 1.4 : 1), 0);
        if (has(state, 'compost') && d.cat === 'farm') m *= 1.25;
        if (has(state, 'tractor') && d.cat === 'farm') m *= 1.4;
        if (has(state, 'cold') && (k === 'fish' || k === 'meat')) m *= 1.4;
        out.makes[k] = m;
      }
    }
    return out;
  }
  // Storage is per ingredient: every ingredient has its own shelf space.
  function invCap(state) { let c = 200; eachB(state, b => { if (DEFS[b.t].store && b.lv > 0) c += DEFS[b.t].store * Math.pow(1.7, b.lv - 1); }); return Math.round(c); }
  function invUsed(state) { return Object.values(state.inv).reduce((a, v) => a + v, 0); }
  function rent(state) { return parcelCount(state) * RENT_PER_PLOT; }
  function summary(state, now) {
    const dm = demandMult(state, now);
    const s = { revenue: 0, tax: 0, wages: 0, rent: rent(state), dishes: 0, customers: 0, makes: {}, need: {}, idleWorkers: 0 };
    state.parks.forEach((p, pi) => {
      if (!p.unlocked) return;
      for (const b of p.b) {
        const h = hourly(state, pi, b, now, dm);
        s.revenue += h.revenue; s.wages += h.wages; s.dishes += h.sold; s.customers += h.demand;
        for (const [k, v] of Object.entries(h.makes)) s.makes[k] = (s.makes[k] || 0) + v;
        for (const [k, v] of Object.entries(h.need)) s.need[k] = (s.need[k] || 0) + v;
      }
    });
    s.idleWorkers = state.workers.filter(w => !w.at).length;
    s.tax = s.revenue * taxRate(state);
    s.supplies = s.revenue * SUPPLIES;
    s.profit = s.revenue - s.tax - s.supplies - s.wages - s.rent;
    return s;
  }

  // ---------- Advancing time ----------
  function dayKey(t) { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ledgerToday(state, now) {
    const key = 'Day ' + gameDay(state, now);
    let e = state.ledger[state.ledger.length - 1];
    if (!e || e.day !== key) { e = { day: key, revenue: 0, tax: 0, supplies: 0, wages: 0, rent: 0, market: 0, dishes: 0, harvest: 0 }; state.ledger.push(e); if (state.ledger.length > 14) state.ledger.shift(); }
    return e;
  }
  // Simulates dt seconds (long gaps in 2-minute steps). Returns { done: finished jobs, events }.
  function tick(state, dt, now) {
    const out = { done: [], events: [] };
    if (!(dt > 0)) return out;
    dt = Math.min(dt, OFFLINE_CAP_SEC + 60);
    const steps = Math.max(1, Math.ceil(dt / 120)), sdt = dt / steps;
    for (let k = 0; k < steps; k++) {
      const t = now - (steps - 1 - k) * sdt * 1000;
      out.events.push(...updateWorldClock(state, t));
      step(state, sdt, t);
      for (let i = state.jobs.length - 1; i >= 0; i--) {
        const j = state.jobs[i];
        if (j.end > t) continue;
        state.jobs.splice(i, 1);
        const b = findB(state, j.park, j.u);
        if (!b) continue;
        b.lv++;
        if (b.lv > 1) state.stats.upgraded++;
        addXp(state, 15 + Math.round(j.dur / 20));
        out.done.push({ park: j.park, u: b.u, t: b.t, lv: b.lv });
      }
    }
    state.stats.playTime += dt;
    state.stats.maxLevels = Math.max(state.stats.maxLevels, totalLevels(state));
    return out;
  }
  function step(state, dt, now) {
    const hrs = dt * TIME_SCALE / 3600, dm = demandMult(state, now);
    const L = ledgerToday(state, now);
    const cap = invCap(state);
    const all = [];
    state.parks.forEach((p, pi) => { if (p.unlocked) p.b.forEach(b => all.push([pi, b, hourly(state, pi, b, now, dm)])); });
    // 1. farms fill the inventory (up to capacity)
    for (const [, , h] of all) for (const [k, v] of Object.entries(h.makes)) {
      const add = Math.min(v * hrs, Math.max(0, cap - state.inv[k]));
      state.inv[k] += add;
      L.harvest += add;
    }
    // 2. stalls sell what the ingredients allow; scarce ingredients are shared fairly
    const need = {};
    for (const [, , h] of all) for (const [k, v] of Object.entries(h.need)) need[k] = (need[k] || 0) + v * hrs;
    const share = {};
    for (const k of Object.keys(need)) share[k] = need[k] > 0 ? Math.min(1, state.inv[k] / need[k]) : 1;
    let revenue = 0, dishes = 0, wages = 0;
    for (const [, b, h] of all) {
      wages += h.wages * hrs;
      b.starved = false;
      if (!h.sold) continue;
      const f = Math.min(...Object.keys(DEFS[b.t].recipe).map(k => share[k]));
      b.starved = f < 0.95;
      const sold = h.sold * hrs * f;
      for (const [k, q] of Object.entries(DEFS[b.t].recipe)) state.inv[k] = Math.max(0, state.inv[k] - q * sold);
      revenue += sold * h.price;
      dishes += sold;
    }
    const tax = revenue * taxRate(state), supplies = revenue * SUPPLIES, rentDue = rent(state) * hrs;
    state.cash = Math.max(0, state.cash + revenue - tax - supplies - wages - rentDue);
    state.stats.dishes += dishes;
    state.stats.earned += revenue;
    const clean = cleanliness(state, 0, dishes / Math.max(hrs, 1e-9));
    const repMult = state.event && state.event.until > now && EVENTS[state.event.id].rep ? EVENTS[state.event.id].rep : 1;
    state.rep += dishes * 0.06 * clean * repMult;
    if (state.event && state.event.until > now && EVENTS[state.event.id].tokens) state.tokens += dishes / 100;
    L.revenue += revenue; L.tax += tax; L.supplies += supplies; L.wages += wages; L.rent += rentDue; L.dishes += dishes;
  }

  // ---------- Market ----------
  function buyPrice(state, k) { return ING[k].price * MARKUP * marketMult(state); }
  function sellPrice(k) { return ING[k].price * SELL_RATE; }
  function buyIng(state, k, n, now) {
    n = Math.floor(Math.min(n, invCap(state) - state.inv[k], state.cash / buyPrice(state, k)));
    if (n <= 0) return 0;
    const cost = n * buyPrice(state, k);
    state.cash -= cost; state.inv[k] += n;
    ledgerToday(state, now || Date.now()).market += cost;
    state.stats.bought += n;
    return n;
  }
  function sellIng(state, k, n) {
    n = Math.floor(Math.min(n, state.inv[k]));
    if (n <= 0) return 0;
    state.inv[k] -= n; state.cash += n * sellPrice(k);
    return n;
  }

  // ---------- Orders: deliver ingredients for rewards ----------
  const CLIENTS = ['Corner Café', 'School Canteen', 'Wedding Party', 'Night Market', 'Hotel Kitchen', 'Football Club', 'Film Crew', 'Hospital Canteen', 'Food Blogger', 'City Hall'];
  function makeOrder(state, now) {
    const r = rng(state.orderSeed++ * 31 + 5);
    const hl = Math.max(1, hallLevel(state));
    const avail = INGS.filter(i => i.id === 'wheat' || i.id === 'veg' || (i.id === 'meat' && hl >= 2) || (i.id === 'fruit' && hl >= 3) || (i.id === 'spice' && hl >= 4) || (i.id === 'fish' && hl >= 5) || (i.id === 'rice' && hl >= 6));
    const kinds = 1 + (r() < 0.45 ? 1 : 0);
    const need = {};
    let value = 0;
    for (let k = 0; k < kinds; k++) {
      const ing = avail[Math.floor(r() * avail.length)];
      const q = Math.round((25 + r() * 35) * Math.pow(1.45, hl - 1));
      need[ing.id] = (need[ing.id] || 0) + q;
      value += q * ing.price;
    }
    return { id: Math.floor(r() * 1e9), who: CLIENTS[Math.floor(r() * CLIENTS.length)], need, cash: Math.round(value * 5), tokens: 1 + Math.floor(r() * 2 + hl / 4), rep: Math.round(10 * hl), readyAt: 0 };
  }
  function canFill(state, o, now) { return o.readyAt <= now && Object.entries(o.need).every(([k, q]) => state.inv[k] >= q); }
  function fillOrder(state, i, now) {
    const o = state.orders[i];
    if (!o || !canFill(state, o, now)) return null;
    for (const [k, q] of Object.entries(o.need)) state.inv[k] -= q;
    state.cash += o.cash; state.tokens += o.tokens; state.rep += o.rep;
    state.ordersDone++;
    addXp(state, 30);
    const next = makeOrder(state, now);
    next.readyAt = now + 10 * 60e3;
    state.orders[i] = next;
    return o;
  }
  function skipOrder(state, i, now) {
    if (!state.orders[i] || !spendGems(state, COST.orderSkip)) return false;
    state.orders[i] = makeOrder(state, now);
    return true;
  }

  // ---------- Cards ----------
  const CARDS = {
    rush:    { name: 'Rush Hour',      icon: 'clock',  desc: '2× customers for 1 hour' },
    instant: { name: 'Instant Build',  icon: 'hammer', desc: 'Finish one construction now' },
    harvest: { name: 'Bumper Harvest', icon: 'wheat',  desc: '12 hours of farm output now' },
    reroll:  { name: 'Job Fair',       icon: 'person', desc: 'New candidates on the hiring board' },
  };
  function useCard(state, id, now, arg) {
    if (!state.cards[id]) return false;
    if (id === 'rush') state.rushUntil = Math.max(state.rushUntil, now) + 3600e3;
    else if (id === 'instant') { const j = arg ? state.jobs.find(x => x.u === arg.u && x.park === arg.park) : state.jobs[0]; if (!j) return false; j.end = now; }
    else if (id === 'harvest') {
      const s = summary(state, now), cap = invCap(state);
      if (!Object.keys(s.makes).length) return false;
      for (const [k, v] of Object.entries(s.makes)) state.inv[k] += Math.min(v * 12, Math.max(0, cap - state.inv[k]));
    } else if (id === 'reroll') { state.cseed++; state.candidates = makeCandidates(state, now); }
    state.cards[id]--;
    return true;
  }

  // ---------- Missions: the guided story ----------
  const has1 = (s, id) => s.parks.some(p => p.b.some(b => b.t === ID[id] && b.lv > 0));
  const staffed = (s, id) => s.parks.some((p, pi) => p.b.some(b => b.t === ID[id] && workersAt(s, pi, b.u).length > 0));
  const MISSIONS = [
    { title: 'Hire a cook for your Noodle Cart', hint: 'Tap Staff, hire a cook, then put them to work at the cart', check: s => staffed(s, 'cart'), cash: 100, gems: 5 },
    { title: 'Sell 25 bowls of noodles', hint: 'Your cook sells on their own. Noodles use wheat and vegetables', check: s => s.stats.dishes >= 25, cash: 150, gems: 5 },
    { title: 'Build a Wheat Field', hint: 'Build → Farms. Grow your own wheat instead of buying it', check: s => has1(s, 'field'), cash: 150, gems: 5 },
    { title: 'Hire a farmer for the field', hint: 'Farms only grow with a farmer', check: s => staffed(s, 'field'), cash: 150, gems: 5 },
    { title: 'Build a Veggie Garden and staff it', hint: 'Noodles need vegetables too', check: s => staffed(s, 'garden'), cash: 200, gems: 5 },
    { title: 'Place 2 picnic tables by your cart', hint: 'Tables bring more customers to the stalls next to them', check: s => countType(s, ID.table) >= 2, cash: 100, gems: 5 },
    { title: 'Build the Market Hall', hint: 'The hall unlocks buildings, land and upgrades', check: s => hallLevel(s) >= 1, cash: 300, gems: 10 },
    { title: 'Buy the land next door', hint: 'Tap a FOR SALE sign', check: s => s.stats.landBought >= 1, cash: 300, gems: 10 },
    { title: 'Upgrade the Market Hall to level 2', hint: 'Tap the Hall button', check: s => hallLevel(s) >= 2, cash: 500, gems: 10, tokens: 2 },
    { title: 'Build a Livestock Barn', hint: 'Dumplings and tacos need meat', check: s => has1(s, 'barn'), cash: 400, gems: 10 },
    { title: 'Open a Dumpling Stand with a cook', hint: 'More stalls, more money', check: s => staffed(s, 'dumpling'), cash: 600, gems: 10 },
    { title: 'Fill an order', hint: 'Orders: deliver ingredients for big rewards', check: s => s.ordersDone >= 1, cash: 500, gems: 10, tokens: 2 },
    { title: 'Build a Warehouse', hint: 'More room for ingredients', check: s => has1(s, 'warehouse'), cash: 600, gems: 10 },
    { title: 'Reach reputation level 3', hint: 'Every dish earns reputation. Bins keep the park clean', check: s => repLevel(s) >= 3, cash: 1000, gems: 15, tokens: 3 },
    { title: 'Upgrade the Market Hall to level 4', hint: 'A second builder joins at level 4', check: s => hallLevel(s) >= 4, cash: 3000, gems: 20, tokens: 3 },
    { title: 'Dig a Fish Pond', hint: 'Market Hall 5. Fish feeds the sushi bar', check: s => has1(s, 'pond'), cash: 8000, gems: 20, tokens: 4 },
    { title: 'Open a Pizza Parlor with two cooks', hint: 'Big kitchens need big teams', check: s => s.parks.some((p, pi) => p.b.some(b => b.t === ID.pizza && workersAt(s, pi, b.u).length >= 2)), cash: 15000, gems: 25, tokens: 5 },
    { title: 'Upgrade the Market Hall to level 8', hint: 'Unlocks a second location: Riverside Town', check: s => hallLevel(s) >= 8, cash: 1e5, gems: 40, tokens: 10 },
  ];
  function mission(state) { return state.mission < MISSIONS.length ? MISSIONS[state.mission] : null; }
  function claimMission(state) {
    const m = mission(state);
    if (!m || !m.check(state)) return null;
    state.cash += m.cash || 0; state.gems += m.gems || 0; state.tokens += m.tokens || 0;
    state.mission++;
    state.tutorialDone = state.mission >= 9;
    addXp(state, 40);
    return m;
  }

  // ---------- Rival tycoons (offline leaderboard) ----------
  const RIVALS = [['Chef Bao', 0.6], ['Mama Rosa', 0.8], ['Taco King', 1.0], ['Noodle Queen', 1.25], ['Burger Baron', 1.6], ['Sushi Sato', 2.1], ['Spice Sultan', 2.8], ['Global Gourmet', 3.6]];
  function netWorth(state) {
    let v = state.cash;
    eachB(state, b => { const d = DEFS[b.t]; v += d.cost * Math.pow(1.8, Math.max(0, b.lv - 1)); });
    return v + state.workers.length * 150 + parcelCount(state) * 1000;
  }
  function leaderboard(state, now) {
    const days = Math.max(0, (now - state.createdAt) / 86400e3);
    const list = RIVALS.map(([name, k]) => ({ name, worth: Math.round(1500 * k * Math.pow(1 + days * 2, 2.6)), you: false }));
    list.push({ name: 'You', worth: Math.round(netWorth(state)), you: true });
    return list.sort((a, b) => b.worth - a.worth);
  }

  // ---------- Player level, gems, misc ----------
  function xpForLevel(level) { return Math.round(80 * Math.pow(level, 1.7)); }
  function addXp(state, n) {
    state.xp += n;
    let ups = 0;
    while (state.xp >= xpForLevel(state.level)) { state.xp -= xpForLevel(state.level); state.level++; state.gems += 10; ups++; }
    state._levelUps = (state._levelUps || 0) + ups;
    return ups;
  }
  function takeLevelUps(state) { const n = state._levelUps || 0; delete state._levelUps; return n; }
  function spendGems(state, n) { if (state.gems < n) return false; state.gems -= n; return true; }
  function addBoost(state, now, ms) { state.boostUntil = Math.min(Math.max(state.boostUntil, now) + (ms || 4 * 3600e3), now + 24 * 3600e3); }
  function buyBoost(state, now) { if (!spendGems(state, COST.boost)) return false; addBoost(state, now); return true; }
  function vipReward(state, now) {
    const s = summary(state, now);
    const cash = Math.max(50, s.revenue);
    state.cash += cash; state.rep += 25; state.stats.golden++;
    const gems = Math.random() < 0.3 ? 3 : 0;
    state.gems += gems;
    return { cash, rep: 25, gems };
  }
  function tip(state, now) { const s = summary(state, now); const amount = Math.max(2, s.revenue / 40); state.cash += amount; state.stats.tips++; return amount; }
  function crateStatus(state, now) { return { free: now >= state.crateAt, wait: Math.max(0, state.crateAt - now) / 1000 }; }
  function openCrate(state, now, rnd) {
    if (now >= state.crateAt) state.crateAt = now + 4 * 3600e3;
    else if (!spendGems(state, COST.crate)) return null;
    state.stats.crates++;
    const r = rnd || [Math.random(), Math.random()];
    const s = summary(state, now);
    if (r[0] < 0.25) { const c = Math.max(200, s.revenue * 2 * (1 + r[1])); state.cash += c; return { type: 'cash', icon: 'cash', text: formatMoney(c) }; }
    if (r[0] < 0.45) { const g = 5 + Math.floor(r[1] * 10); state.gems += g; return { type: 'gems', icon: 'gem', text: g + ' gems' }; }
    if (r[0] < 0.6) { const t = 1 + Math.floor(r[1] * 4); state.tokens += t; return { type: 'tokens', icon: 'token', text: t + ' Food Tokens' }; }
    const ids = Object.keys(CARDS), id = ids[Math.floor(r[1] * ids.length)];
    state.cards[id]++;
    return { type: 'card', icon: CARDS[id].icon, text: CARDS[id].name + ' card' };
  }
  function dailyStatus(state, now) {
    const today = dayKey(now);
    if (state.daily.last === today) return { available: false };
    const streak = state.daily.last === dayKey(now - 86400000) ? state.daily.streak + 1 : 1;
    const day = ((streak - 1) % 7) + 1;
    return { available: true, streak, day, cash: 150 * day * Math.max(1, hallLevel(state)), gems: day === 7 ? 30 : 3 + day * 2, tokens: day >= 5 ? 2 : 0, card: day === 3 ? 'rush' : day === 6 ? 'harvest' : null, today };
  }
  function claimDaily(state, now) {
    const d = dailyStatus(state, now);
    if (!d.available) return null;
    state.daily = { last: d.today, streak: d.streak };
    state.cash += d.cash; state.gems += d.gems; state.tokens += d.tokens;
    if (d.card) state.cards[d.card]++;
    if (d.day === 7) addBoost(state, now);
    return d;
  }
  function unlockPark(state, i) {
    const pk = PARKS[i];
    if (!pk || state.parks[i].unlocked || hallLevel(state) < pk.hall || state.cash < pk.cost) return false;
    state.cash -= pk.cost;
    state.parks[i].unlocked = true;
    addXp(state, 200);
    return true;
  }

  // ---------- Hall unlock tree ----------
  function hallTree() {
    const levels = [];
    for (let lv = 1; lv <= HALL_MAX; lv++) {
      const items = [];
      DEFS.forEach((d, t) => { if (d.hall === lv && t !== HALL) items.push({ icon: d.icon, text: d.name, kind: 'new' }); });
      PARKS.forEach(p => { if (p.hall === lv) items.push({ icon: p.icon, text: p.name, kind: 'park' }); });
      RESEARCH.forEach(r => { if (r.hall === lv) items.push({ icon: r.icon, text: r.name, kind: 'research' }); });
      if (lv === 4) items.push({ icon: 'builder', text: 'Second builder', kind: 'perk' });
      items.push({ icon: 'person', text: `Up to ${2 + lv * 3} workers`, kind: 'perk' });
      items.push({ icon: 'land', text: `${Math.min(PN * PN, 3 + lv * 2)} land plots`, kind: 'perk' });
      items.push({ icon: 'up', text: `Buildings up to level ${Math.max(2, lv)}`, kind: 'perk' });
      levels.push({ lv, items, cost: upgradeCost(HALL, lv - 1) });
    }
    return levels;
  }

  // ---------- Quests and awards ----------
  const seq = (list, grow) => (tier) => (tier < list.length ? list[tier] : Math.round(list[list.length - 1] * Math.pow(grow, tier - list.length + 1)));
  const QUESTS = [
    { kind: 'dishes', icon: 'noodle', title: n => `Sell ${formatNumber(n)} dishes`, value: s => s.stats.dishes, target: seq([100, 500, 2000, 8000, 30000, 1e5], 3) },
    { kind: 'hall', icon: 'hall', title: n => `Market Hall level ${n}`, value: s => hallLevel(s), target: t => t + 2, max: HALL_MAX - 1 },
    { kind: 'staff', icon: 'person', title: n => `Employ ${n} workers`, value: s => s.workers.length, target: seq([2, 4, 6, 10, 15, 20, 30, 40], 1.2) },
    { kind: 'land', icon: 'land', title: n => `Expand your land ${n} times`, value: s => s.stats.landBought, target: seq([1, 3, 6, 10, 15, 20, 26, 33], 1), max: 8 },
    { kind: 'orders', icon: 'quests', title: n => `Fill ${n} orders`, value: s => s.ordersDone, target: seq([1, 5, 15, 30, 60, 100], 1.5) },
    { kind: 'rep', icon: 'medal', title: n => `Reach reputation level ${n}`, value: s => repLevel(s), target: t => t + 3, max: 40 },
    { kind: 'earn', icon: 'cash', title: n => `Earn ${formatMoney(n)} in sales`, value: s => s.stats.earned, target: t => 2000 * Math.pow(8, t) },
    { kind: 'levels', icon: 'up', title: n => `Reach ${n} total building levels`, value: s => s.stats.maxLevels, target: seq([10, 25, 50, 80, 120, 170, 230, 300], 1.2) },
  ];
  const QUEST_BY_KIND = Object.fromEntries(QUESTS.map(q => [q.kind, q]));
  function questList(state) {
    return QUESTS.filter(q => q.max === undefined || (state.quests[q.kind] || 0) < q.max).map(q => {
      const tier = state.quests[q.kind] || 0, target = q.target(tier), v = q.value(state);
      return { kind: q.kind, icon: q.icon, tier, title: q.title(target), value: Math.min(v, target), target, done: v >= target, gems: Math.min(20, 4 + tier * 2), tokens: 1 + Math.floor(tier / 2), xp: 30 * (tier + 1) };
    }).sort((a, b) => (b.done - a.done) || (b.value / b.target - a.value / a.target));
  }
  function claimQuest(state, kind) {
    const q = questList(state).find(x => x.kind === kind);
    if (!q || !q.done) return null;
    state.quests[kind] = q.tier + 1;
    state.gems += q.gems; state.tokens += q.tokens;
    addXp(state, q.xp);
    return q;
  }
  const ACHIEVEMENTS = [];
  const ach = (id, icon, name, desc, check) => ACHIEVEMENTS.push({ id, icon, name, desc, check });
  [1, 3, 5, 8, 10, 13, 15, 18, 20].forEach(l => ach(`hall_${l}`, 'hall', `Market Hall ${l}`, `Market Hall level ${l}`, s => hallLevel(s) >= l));
  [[100, 'First Customers'], [1000, 'Busy Kitchen'], [10000, 'Crowd Pleaser'], [1e5, 'Food Factory'], [1e6, 'Feeding the City']].forEach(([v, n]) => ach(`dish_${v}`, 'noodle', n, `Sell ${formatNumber(v)} dishes`, s => s.stats.dishes >= v));
  [[1e4, 'Ten Grand'], [1e6, 'Millionaire'], [1e8, 'Hundred Million'], [1e10, 'Billionaire']].forEach(([v, n]) => ach(`earn_${v}`, 'cash', n, `Earn ${formatMoney(v)} in sales`, s => s.stats.earned >= v));
  [[1, 'First Hire'], [10, 'Team'], [30, 'Company'], [60, 'Corporation']].forEach(([v, n]) => ach(`staff_${v}`, 'person', n, `Employ ${v} workers`, s => s.workers.length >= v));
  [[3, 'Neighbour'], [10, 'Landowner'], [25, 'Land Baron']].forEach(([v, n]) => ach(`land_${v}`, 'land', n, `Expand your land ${v} times`, s => s.stats.landBought >= v));
  [[5, 'Well Liked'], [10, 'Famous'], [20, 'Legendary']].forEach(([v, n]) => ach(`rep_${v}`, 'medal', n, `Reputation level ${v}`, s => repLevel(s) >= v));
  [[1, 'Delivered'], [25, 'Supplier'], [100, 'Wholesaler']].forEach(([v, n]) => ach(`ord_${v}`, 'quests', n, `Fill ${v} orders`, s => s.ordersDone >= v));
  ach('pond', 'fishmkt', 'Gone Fishing', 'Dig a Fish Pond', s => countType(s, ID.pond) > 0);
  ach('farmer', 'wheat', 'Farm to Table', 'Run 5 staffed farms', s => s.parks.reduce((a, p, pi) => a + p.b.filter(b => ['farm', 'water'].includes(DEFS[b.t].cat) && workersAt(s, pi, b.u).length).length, 0) >= 5);
  [[2, 'Second Location'], [3, 'Big City'], [4, 'Neon Lights']].forEach(([v, n]) => ach(`park_${v}`, 'map', n, `Open ${v} parks`, s => s.parks.filter(p => p.unlocked).length >= v));
  ach('top', 'trophy', 'Top Tycoon', 'Be number 1 on the leaderboard', s => leaderboard(s, Date.now())[0].you);
  const ACH_IDS = new Set(ACHIEVEMENTS.map(a => a.id));
  function checkAchievements(state) {
    const out = [];
    for (const a of ACHIEVEMENTS) if (!state.achievements[a.id] && a.check(state)) { state.achievements[a.id] = true; state.gems += 5; out.push(a); }
    return out;
  }

  return {
    SAVE_VERSION, CELLS, PARCEL, PN, HALL, HALL_MAX, ID, DEFS, PARKS, INGS, ING, TRAITS, ROLE, EVENTS, WEATHER, CARDS, RESEARCH, SKILL_BRANCHES,
    MISSIONS, ACHIEVEMENTS, QUESTS, COST, FREE_FINISH_SEC, SALES_TAX, SUPPLIES, RENT_PER_PLOT, OFFLINE_CAP_SEC,
    TIME_SCALE, DAY_CURVE, gameClock, gameDay, formatNumber, formatMoney, formatTime, dayKey,
    newState, loadState,
    eachB, findB, hallB, hallLevel, countType, countCat, totalLevels, parcelCount, jobFor, builderCount, freeBuilders, workersAt,
    parcelOf, ownsCell, occupant, fits, parcelAdjacent, landPrice, canBuyParcel, buyParcel, maxParcels,
    upgradeCost, maxLevel, maxCount, slotsFor, canBuild, build, canUpgrade, startUpgrade, speedUpCost, speedUp, move, demolish, buyBuilder,
    maxWorkers, workerPower, hireCost, hire, rerollCandidates, fire, canAssign, assign, unassign, trainCost, train,
    repLevel, repProgress, decorBonus, cleanliness, seats, demandMult, hourly, summary, invCap, invUsed, rent, taxRate, tick,
    buyPrice, sellPrice, buyIng, sellIng, canFill, fillOrder, skipOrder, makeOrder,
    useCard, mission, claimMission, netWorth, leaderboard,
    skillTier, skillCost, buySkill, canResearch, doResearch, hasResearch: has,
    xpForLevel, addXp, takeLevelUps, spendGems, addBoost, buyBoost, vipReward, tip, crateStatus, openCrate, dailyStatus, claimDaily, unlockPark,
    hallTree, questList, claimQuest, checkAchievements, updateWorldClock,
  };
});
