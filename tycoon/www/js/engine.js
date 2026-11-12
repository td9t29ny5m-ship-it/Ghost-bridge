/*
 * Yum Empire — core game engine (v2: land, districts, staff, quests, gems).
 * Pure logic, no DOM access, so it can be unit-tested and balance-simulated in Node.
 *
 * World model
 *   Districts  → each has a list of land plots (Small / Medium / Large / Huge).
 *   Plots      → not owned (null) → owned & empty ({t:-1}) → a shop ({t:type, level, ...}).
 *   Shop types → ten kinds of food business; bigger ones need bigger land.
 *   Every new shop starts at level 1 as a street stall and grows as you level it up.
 */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Engine = E;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAVE_VERSION = 2;
  const STAR_BONUS = 0.04;          // +4% profit per Golden Star
  const ACHIEVEMENT_BONUS = 0.02;   // +2% profit per achievement
  const LEVEL_BONUS = 0.02;         // +2% profit per player level
  const OFFLINE_CAP_SEC = 8 * 3600;
  const BOOST_DURATION_MS = 4 * 3600 * 1000;
  const FRENZY_DURATION_MS = 30 * 1000;
  const FRENZY_MULT = 7;
  const CRATE_COOLDOWN_MS = 4 * 3600 * 1000;
  const RECRUIT_COOLDOWN_MS = 8 * 3600 * 1000;
  const COST = { recruit: 30, crate: 20, boost: 25, warp: 15 };   // gem prices

  // ---------- Land ----------
  // maxTier = how grand a building this land can hold (1 small shop … 4 flagship tower)
  const SIZES = [
    { id: 'S', name: 'Small', mult: 1, maxTier: 1 },
    { id: 'M', name: 'Medium', mult: 1.5, maxTier: 2 },
    { id: 'L', name: 'Large', mult: 2.2, maxTier: 3 },
    { id: 'XL', name: 'Huge', mult: 3.2, maxTier: 4 },
  ];

  // ---------- Shop types ----------
  const TYPES = [
    { id: 'cart',     name: 'Noodle Cart',     emoji: '🍜', baseCost: 5,      growth: 1.07, baseRevenue: 3,     time: 2,   minSize: 0, minDistrict: 0 },
    { id: 'dumpling', name: 'Dumpling Stand',  emoji: '🥟', baseCost: 75,     growth: 1.15, baseRevenue: 40,    time: 3,   minSize: 0, minDistrict: 0 },
    { id: 'tea',      name: 'Bubble Tea Bar',  emoji: '🧋', baseCost: 900,    growth: 1.14, baseRevenue: 400,   time: 6,   minSize: 0, minDistrict: 0 },
    { id: 'taco',     name: 'Taco Truck',      emoji: '🌮', baseCost: 11000,  growth: 1.13, baseRevenue: 3600,  time: 12,  minSize: 1, minDistrict: 0 },
    { id: 'pizza',    name: 'Pizza Parlor',    emoji: '🍕', baseCost: 1.4e5,  growth: 1.12, baseRevenue: 3.2e4, time: 24,  minSize: 1, minDistrict: 0 },
    { id: 'sushi',    name: 'Sushi Lounge',    emoji: '🍣', baseCost: 1.8e6,  growth: 1.11, baseRevenue: 3e5,   time: 48,  minSize: 2, minDistrict: 0 },
    { id: 'burger',   name: 'Burger Chain',    emoji: '🍔', baseCost: 2.4e7,  growth: 1.10, baseRevenue: 2.8e6, time: 96,  minSize: 1, minDistrict: 1 },
    { id: 'court',    name: 'Food Court',      emoji: '🏬', baseCost: 3.2e8,  growth: 1.09, baseRevenue: 2.6e7, time: 192, minSize: 2, minDistrict: 1 },
    { id: 'factory',  name: 'Snack Factory',   emoji: '🏭', baseCost: 4.5e9,  growth: 1.08, baseRevenue: 2.5e8, time: 384, minSize: 2, minDistrict: 2 },
    { id: 'global',   name: 'Global Cuisine',  emoji: '🌍', baseCost: 6.5e10, growth: 1.07, baseRevenue: 3e9,   time: 768, minSize: 3, minDistrict: 3 },
  ];
  TYPES.forEach(t => { t.managerCost = Math.max(100, t.baseCost * 60); });
  const BUSINESSES = TYPES; // old name, kept for the 3D layer

  // ---------- Districts ----------
  // sizes: land size of each plot (index into SIZES); prices: what each plot costs.
  // mult: profit bonus for every shop in the district. cost: price to unlock the district.
  const geo = (first, ratio, n) => Array.from({ length: n }, (_, i) => first * Math.pow(ratio, i));
  const DISTRICTS = [
    { id: 'suburb', name: 'Maple Suburb',    emoji: '🏡', cost: 0,    mult: 1,   sizes: [0, 0, 0, 1, 1, 2], prices: [0, 100, 5e3, 2e5, 1e7, 8e8] },
    { id: 'town',   name: 'Riverside Town',  emoji: '🏘️', cost: 2e10, mult: 1.5, sizes: [0, 1, 1, 1, 2, 2, 2, 3], prices: geo(5e9, 12, 8) },
    { id: 'city',   name: 'Downtown City',   emoji: '🏙️', cost: 2e16, mult: 2.5, sizes: [1, 1, 1, 2, 2, 2, 2, 3, 3, 3], prices: geo(5e15, 10, 10) },
    { id: 'metro',  name: 'Neon Metropolis', emoji: '🌃', cost: 3e21, mult: 4,   sizes: [1, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3], prices: geo(5e20, 10, 12) },
  ];
  DISTRICTS.forEach(d => { d.plots = d.sizes.map((size, i) => ({ size, price: d.prices[i] })); });

  // Per-shop level milestones. The first ones double speed, later ones quadruple profit.
  const MILESTONES = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  const SPEED_MILESTONE_MAX = 500;
  // Empire milestones: total levels across all your shops. Each one doubles all profit.
  const EMPIRE_MILESTONES = [100, 300, 700, 1500, 2500, 4000, 6000, 8500, 11500, 15000];

  // ---------- Research (upgrades) ----------
  const TYPE_UPGRADE_NAMES = ['Fresh Ingredients', 'Pro Kitchen Gear', 'Viral Marketing', 'Celebrity Chef', 'Secret Recipe'];
  const GLOBAL_UPGRADE_NAMES = [
    'Loyalty Cards', 'Delivery App', 'Social Media Buzz', 'TV Commercial', 'Food Festival',
    'Award-Winning Menu', 'Theme Song', 'Mascot Parade', 'Cooking Show', 'Space Snacks',
    'Moon Franchise', 'Galactic Brand',
  ];
  const UPGRADES = [];
  TYPES.forEach((b, i) => {
    TYPE_UPGRADE_NAMES.forEach((n, t) => {
      UPGRADES.push({ id: `b${i}u${t}`, biz: i, mult: 3, name: n, target: 'Every ' + b.name, emoji: b.emoji, cost: b.baseCost * 4000 * Math.pow(2e4, t) });
    });
  });
  GLOBAL_UPGRADE_NAMES.forEach((n, t) => {
    UPGRADES.push({ id: `g${t}`, biz: -1, mult: 3, name: n, target: 'All shops', emoji: '⭐', cost: 2.5e6 * Math.pow(4e5, t) });
  });
  UPGRADES.sort((a, b) => a.cost - b.cost);
  const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  // ---------- Staff (chefs) ----------
  const RARITIES = [
    { name: 'Common', color: '#9aa7b8', bonus: 0.2, weight: 60 },
    { name: 'Rare', color: '#4dabf7', bonus: 0.5, weight: 28 },
    { name: 'Epic', color: '#cc5de8', bonus: 1.2, weight: 10 },
    { name: 'Legendary', color: '#ffb000', bonus: 3, weight: 2 },
  ];
  const STAFF_NAMES = ['Mei', 'Diego', 'Priya', 'Tomás', 'Yuki', 'Amara', 'Lars', 'Fatima', 'Kenji', 'Olivia', 'Mateo', 'Aisha', 'Nico',
    'Sana', 'Bruno', 'Lin', 'Zara', 'Otto', 'Ines', 'Ravi', 'Hana', 'Felix', 'Nia', 'Caleb', 'Rosa', 'Arjun', 'Elsa', 'Kofi', 'Mila', 'Jude'];
  const STAFF_FACES = ['👩‍🍳', '👨‍🍳', '🧑‍🍳'];
  const STAFF_MAX = 30, STAFF_MAX_LEVEL = 10;

  // ---------- Number formatting ----------
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];
  function formatNumber(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + formatNumber(-n);
    if (n < 1000) {
      if (n < 10 && n % 1 !== 0) return n.toFixed(2).replace(/\.?0+$/, '');
      return Math.floor(n).toString();
    }
    let tier = Math.floor(Math.log10(n) / 3);
    let scaled = n / Math.pow(10, tier * 3);
    let txt = scaled.toFixed(scaled >= 100 ? 1 : 2);
    if (parseFloat(txt) >= 1000) { tier++; scaled = 1; txt = '1.00'; }   // 999,999 → "1.00M"
    return txt + tierSuffix(tier);
  }
  function tierSuffix(tier) {
    if (tier < SUFFIXES.length) return SUFFIXES[tier];
    const k = tier - SUFFIXES.length;
    return String.fromCharCode(97 + Math.floor(k / 26) % 26) + String.fromCharCode(97 + (k % 26));
  }
  function formatMoney(n) { return '$' + formatNumber(n); }
  function formatTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  // ---------- Shops helpers ----------
  const isShop = (x) => !!x && x.t >= 0;
  function plotAt(state, d, p) { return state.plots[d] ? state.plots[d][p] : undefined; }
  function shopAt(state, d, p) { const x = plotAt(state, d, p); return isShop(x) ? x : null; }
  function eachShop(state, fn) {
    for (let d = 0; d < state.plots.length; d++) {
      const row = state.plots[d];
      for (let p = 0; p < row.length; p++) if (isShop(row[p])) fn(row[p], d, p);
    }
  }
  function shopCount(state) { let n = 0; eachShop(state, () => n++); return n; }
  function totalLevels(state) { let n = 0; eachShop(state, s => (n += s.level)); return n; }
  function countType(state, t) { let n = 0; eachShop(state, s => { if (s.t === t) n++; }); return n; }
  function bestLevel(state, t) { let n = 0; eachShop(state, s => { if ((t === undefined || s.t === t) && s.level > n) n = s.level; }); return n; }
  function managerCount(state) { let n = 0; eachShop(state, s => { if (s.manager) n++; }); return n; }
  function districtCount(state) { return state.districts.filter(Boolean).length; }
  function newShop(t) { return { t, level: 1, progress: 0, running: false, manager: false, chef: 0 }; }

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [];
  const ach = (id, emoji, name, desc, check) => ACHIEVEMENTS.push({ id, emoji, name, desc, check });
  TYPES.forEach((b, i) => [25, 100, 250, 500].forEach(l => ach(`lvl_${b.id}_${l}`, b.emoji, `${b.name} ${l}`, `Reach level ${l} with a ${b.name}`, s => bestLevel(s, i) >= l)));
  [[1e3, 'First Thousand'], [1e6, 'Millionaire'], [1e9, 'Billionaire'], [1e12, 'Trillionaire'], [1e15, 'Snack Overlord'],
   [1e18, 'Food Titan'], [1e21, 'Flavor Emperor'], [1e24, 'Galactic Gourmet'], [1e30, 'Universal Chef']]
    .forEach(([v, n]) => ach(`earn_${v}`, '💰', n, `Earn ${formatMoney(v)} all-time`, s => s.lifetime >= v));
  [[1, 'Franchiser'], [5, 'Serial Franchiser'], [10, 'Empire Builder']].forEach(([v, n]) => ach(`prestige_${v}`, '⭐', n, `Franchise ${v} time${v > 1 ? 's' : ''}`, s => s.prestiges >= v));
  [[1, 'VIP Treatment'], [10, 'Regular VIPs'], [50, 'VIP Magnet']].forEach(([v, n]) => ach(`vip_${v}`, '🤩', n, `Serve ${v} VIP visitor${v > 1 ? 's' : ''}`, s => s.stats.golden >= v));
  [[100, 'Busy Hands'], [1000, 'Tap Master']].forEach(([v, n]) => ach(`tap_${v}`, '👆', n, `Serve ${v} customers by hand`, s => s.stats.taps >= v));
  [[1, 'Delegator'], [10, 'Full Staff']].forEach(([v, n]) => ach(`mgr_${v}`, '🧑‍💼', n, `Have ${v} manager${v > 1 ? 's' : ''} at once`, s => managerCount(s) >= v));
  [[3, 'Shopkeeper'], [6, 'Chain Owner'], [12, 'Tycoon'], [20, 'Mogul'], [30, 'Food Baron']].forEach(([v, n]) => ach(`shops_${v}`, '🏪', n, `Own ${v} shops at once`, s => shopCount(s) >= v));
  [[2, 'Moving Up'], [3, 'Big City Dreams'], [4, 'Neon Lights']].forEach(([v, n]) => ach(`dist_${v}`, '🗺️', n, `Unlock ${v} districts`, s => districtCount(s) >= v));
  [[1, 'First Hire'], [5, 'Kitchen Crew'], [15, 'Dream Team']].forEach(([v, n]) => ach(`staff_${v}`, '👩‍🍳', n, `Have ${v} chef${v > 1 ? 's' : ''}`, s => s.staff.length >= v));
  [[5, 'Rising Star'], [10, 'Local Legend'], [20, 'Household Name'], [30, 'Living Legend']].forEach(([v, n]) => ach(`plv_${v}`, '🎖️', n, `Reach player level ${v}`, s => s.level >= v));
  const ACH_IDS = new Set(ACHIEVEMENTS.map(a => a.id));

  // ---------- Quests (endless: each kind has rising tiers) ----------
  const seq = (list, grow) => (tier) => (tier < list.length ? list[tier] : Math.round(list[list.length - 1] * Math.pow(grow, tier - list.length + 1)));
  const QUESTS = [
    { kind: 'taps', emoji: '👆', title: n => `Serve ${formatNumber(n)} customers by hand`, value: s => s.stats.taps, target: seq([5, 25, 75, 200, 500, 1000], 2) },
    { kind: 'earn', emoji: '💰', title: n => `Earn ${formatMoney(n)} in total`, value: s => s.lifetime, target: t => 200 * Math.pow(60, t) },
    { kind: 'level', emoji: '⬆️', title: n => `Get a shop to level ${n}`, value: s => s.stats.bestLevel, target: seq([5, 10, 25, 50, 100, 150, 200, 300, 400, 500, 600, 800, 1000], 1), max: 13 },
    { kind: 'shops', emoji: '🏪', title: n => `Own ${n} shops`, value: s => s.stats.maxShops, target: seq([2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 30, 36], 1), max: 12 },
    { kind: 'managers', emoji: '🧑‍💼', title: n => `Hire ${n} manager${n > 1 ? 's' : ''}`, value: s => s.stats.managersHired, target: seq([1, 2, 4, 6, 9, 12, 16, 20, 25, 30], 1.3) },
    { kind: 'research', emoji: '🔬', title: n => `Complete ${n} research upgrade${n > 1 ? 's' : ''}`, value: s => s.stats.upgradesBought, target: seq([1, 3, 6, 10, 15, 21, 28, 36, 45, 55], 1.25) },
    { kind: 'staff', emoji: '👩‍🍳', title: n => `Recruit ${n} chef${n > 1 ? 's' : ''}`, value: s => s.stats.recruited, target: seq([1, 3, 5, 8, 12, 16, 20, 25, 30], 1.3) },
    { kind: 'vip', emoji: '🤩', title: n => `Serve ${n} VIP visitor${n > 1 ? 's' : ''}`, value: s => s.stats.golden, target: seq([1, 3, 8, 15, 30, 60, 100], 1.6) },
    { kind: 'land', emoji: '📜', title: n => `Buy ${n} plot${n > 1 ? 's' : ''} of land`, value: s => s.stats.landBought, target: seq([1, 2, 4, 6, 9, 12, 16, 20, 25, 30], 1.3) },
    { kind: 'district', emoji: '🗺️', title: n => `Unlock ${n} districts`, value: s => s.stats.maxDistricts, target: seq([2, 3, 4], 1), max: 3 },
    { kind: 'empire', emoji: '🏆', title: n => `Reach ${formatNumber(n)} total shop levels`, value: s => s.stats.maxLevels, target: seq([20, 60, 150, 400, 1000, 2000, 3500, 5500, 8000, 11000, 15000], 1), max: 11 },
  ];
  const QUEST_BY_KIND = Object.fromEntries(QUESTS.map(q => [q.kind, q]));

  // ---------- State ----------
  function newState(now) {
    now = now || Date.now();
    const s = {
      v: SAVE_VERSION,
      cash: 0, gems: 20, xp: 0, level: 1,
      runEarnings: 0, lifetime: 0, stars: 0, prestiges: 0,
      district: 0,
      districts: DISTRICTS.map((_, i) => i === 0),
      plots: DISTRICTS.map(d => d.plots.map(() => null)),
      upgrades: {}, achievements: {}, quests: {},
      staff: [], staffSeq: 1,
      boostUntil: 0, frenzyUntil: 0, crateAt: 0, recruitAt: 0,
      premium: false, adsRemoved: false,
      lastSeen: now, createdAt: now,
      daily: { last: '', streak: 0 },
      stats: { taps: 0, golden: 0, playTime: 0, bestRun: 0, bestLevel: 1, maxShops: 1, maxDistricts: 1, maxLevels: 1,
        managersHired: 0, upgradesBought: 0, recruited: 0, landBought: 0, shopsBuilt: 0, crates: 0 },
      settings: { sound: true, haptics: true, buyMode: 0, lens: true },
      tutorial: 0,
    };
    s.plots[0][0] = newShop(0);   // your first noodle cart, on the free starter plot
    return s;
  }

  function loadState(raw, now) {
    const s = newState(now);
    if (!raw || typeof raw !== 'object') return s;
    const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
    ['cash', 'gems', 'xp', 'runEarnings', 'lifetime', 'stars', 'prestiges', 'boostUntil', 'frenzyUntil', 'crateAt', 'recruitAt', 'tutorial', 'staffSeq']
      .forEach(k => { s[k] = Math.max(0, num(raw[k], s[k])); });
    s.level = Math.max(1, Math.floor(num(raw.level, 1)));
    s.lastSeen = num(raw.lastSeen, s.lastSeen);
    s.createdAt = num(raw.createdAt, s.createdAt);
    s.premium = !!raw.premium;
    s.adsRemoved = !!raw.adsRemoved;
    if (raw.v === SAVE_VERSION && Array.isArray(raw.plots)) {
      if (Array.isArray(raw.districts)) raw.districts.forEach((u, i) => { if (i > 0 && i < s.districts.length) s.districts[i] = !!u; });
      s.district = Math.min(DISTRICTS.length - 1, Math.max(0, Math.floor(num(raw.district, 0))));
      if (!s.districts[s.district]) s.district = 0;
      raw.plots.forEach((row, d) => {
        if (!Array.isArray(row) || !s.plots[d]) return;
        row.forEach((x, p) => {
          if (p >= s.plots[d].length) return;
          if (!x || typeof x !== 'object') { s.plots[d][p] = null; return; }
          const t = Math.floor(num(x.t, -1));
          if (t < 0 || t >= TYPES.length) { s.plots[d][p] = { t: -1 }; return; }
          s.plots[d][p] = {
            t, level: Math.max(1, Math.floor(num(x.level, 1))), progress: Math.min(1, Math.max(0, num(x.progress, 0))),
            running: !!x.running, manager: !!x.manager, chef: Math.max(0, Math.floor(num(x.chef, 0))),
          };
        });
      });
      if (!isShop(s.plots[0][0]) && shopCount(s) === 0) s.plots[0][0] = newShop(0);
      if (Array.isArray(raw.staff)) {
        s.staff = raw.staff.filter(m => m && typeof m === 'object').slice(0, STAFF_MAX).map(m => ({
          id: Math.floor(num(m.id, 0)), name: String(m.name || 'Chef').slice(0, 16), face: STAFF_FACES.includes(m.face) ? m.face : STAFF_FACES[0],
          rarity: Math.min(3, Math.max(0, Math.floor(num(m.rarity, 0)))), spec: Math.min(TYPES.length - 1, Math.max(0, Math.floor(num(m.spec, 0)))),
          level: Math.min(STAFF_MAX_LEVEL, Math.max(1, Math.floor(num(m.level, 1)))),
        })).filter(m => m.id > 0);
      }
      // Drop chef assignments that point at missing staff or are duplicated
      const seen = new Set();
      eachShop(s, sh => { if (sh.chef && (!s.staff.some(m => m.id === sh.chef) || seen.has(sh.chef))) sh.chef = 0; else if (sh.chef) seen.add(sh.chef); });
      if (raw.quests && typeof raw.quests === 'object') for (const k of Object.keys(raw.quests)) if (QUEST_BY_KIND[k]) s.quests[k] = Math.max(0, Math.floor(num(raw.quests[k], 0)));
    }
    // (Saves from version 1 keep money, stars and achievements but start with fresh land.)
    if (raw.upgrades && typeof raw.upgrades === 'object' && raw.v === SAVE_VERSION) for (const k of Object.keys(raw.upgrades)) if (UPGRADE_BY_ID[k]) s.upgrades[k] = true;
    if (raw.achievements && typeof raw.achievements === 'object') for (const k of Object.keys(raw.achievements)) if (ACH_IDS.has(k)) s.achievements[k] = true;
    if (raw.daily) s.daily = { last: String(raw.daily.last || ''), streak: num(raw.daily.streak, 0) };
    if (raw.stats) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k], s.stats[k]);
    if (raw.settings) {
      s.settings.sound = raw.settings.sound !== false;
      s.settings.haptics = raw.settings.haptics !== false;
      s.settings.lens = raw.settings.lens !== false;
      s.settings.buyMode = Math.min(4, Math.max(0, Math.floor(num(raw.settings.buyMode, 0))));
    }
    return s;
  }

  // ---------- Economy ----------
  function milestoneInfo(level) {
    let speed = 1, profit = 1, reached = 0;
    for (const m of MILESTONES) if (level >= m) { reached++; if (m <= SPEED_MILESTONE_MAX) speed *= 2; else profit *= 4; }
    const next = MILESTONES.find(m => m > level) || null;
    const prev = MILESTONES.filter(m => m <= level).pop() || 0;
    return { speed, profit, reached, next, prev, nextReward: next == null ? null : (next <= SPEED_MILESTONE_MAX ? '2× speed' : '4× profit') };
  }
  function empireInfo(state) {
    const total = totalLevels(state);
    let mult = 1, reached = 0;
    for (const m of EMPIRE_MILESTONES) if (total >= m) { mult *= 2; reached++; }
    const next = EMPIRE_MILESTONES.find(m => m > total) || null;
    const prev = EMPIRE_MILESTONES.filter(m => m <= total).pop() || 0;
    return { total, mult, reached, next, prev };
  }
  function achievementCount(state) { return Object.keys(state.achievements).length; }
  function staffById(state, id) { return state.staff.find(m => m.id === id) || null; }
  function staffBonus(member, type) {
    if (!member) return 0;
    return RARITIES[member.rarity].bonus * (1 + 0.2 * (member.level - 1)) * (member.spec === type ? 1.5 : 1);
  }

  function permanentMult(state) {
    let m = (1 + state.stars * STAR_BONUS) * (1 + achievementCount(state) * ACHIEVEMENT_BONUS) * (1 + (state.level - 1) * LEVEL_BONUS);
    for (const u of UPGRADES) if (u.biz === -1 && state.upgrades[u.id]) m *= u.mult;
    m *= empireInfo(state).mult;
    if (state.premium) m *= 2;
    return m;
  }
  function timedMult(state, now) {
    let m = 1;
    if (state.boostUntil > now) m *= 2;
    if (state.frenzyUntil > now) m *= FRENZY_MULT;
    return m;
  }
  function typeMult(state, t) {
    let m = 1;
    for (const u of UPGRADES) if (u.biz === t && state.upgrades[u.id]) m *= u.mult;
    return m;
  }
  // Everything that depends on where the shop stands and who works there
  function shopMult(state, d, p) {
    const s = state.plots[d][p];
    return milestoneInfo(s.level).profit * typeMult(state, s.t) * SIZES[DISTRICTS[d].plots[p].size].mult * DISTRICTS[d].mult *
      (1 + staffBonus(staffById(state, s.chef), s.t));
  }
  function cycleTime(state, d, p) {
    const s = state.plots[d][p];
    return TYPES[s.t].time / milestoneInfo(s.level).speed;
  }
  function revenuePerCycle(state, d, p, now, opts, pm) {
    const s = shopAt(state, d, p);
    if (!s) return 0;
    const timed = opts && opts.noTimed ? 1 : timedMult(state, now);
    return TYPES[s.t].baseRevenue * s.level * shopMult(state, d, p) * (pm === undefined ? permanentMult(state) : pm) * timed;
  }
  function incomePerSec(state, now, opts) {
    const managedOnly = opts && opts.managedOnly;
    const pm = permanentMult(state);
    let total = 0;
    eachShop(state, (s, d, p) => {
      if (managedOnly && !s.manager) return;
      total += revenuePerCycle(state, d, p, now, opts, pm) / cycleTime(state, d, p);
    });
    return total;
  }

  function costFor(t, level, n) {
    const b = TYPES[t];
    if (n <= 0) return 0;
    return b.baseCost * Math.pow(b.growth, level) * (Math.pow(b.growth, n) - 1) / (b.growth - 1);
  }
  function maxAffordable(t, level, cash) {
    const b = TYPES[t];
    const first = b.baseCost * Math.pow(b.growth, level);
    if (cash < first) return 0;
    let n = Math.floor(Math.log(cash * (b.growth - 1) / first + 1) / Math.log(b.growth));
    while (n > 0 && costFor(t, level, n) > cash) n--;
    while (costFor(t, level, n + 1) <= cash) n++;
    return n;
  }
  const BUY_MODES = ['×1', '×10', '×100', 'Next', 'Max'];
  function buyAmount(state, d, p, mode) {
    const s = shopAt(state, d, p);
    if (!s) return 1;
    switch (mode) {
      case 1: return 10;
      case 2: return 100;
      case 3: { const nx = milestoneInfo(s.level).next; return nx ? nx - s.level : 1; }
      case 4: return Math.max(1, maxAffordable(s.t, s.level, state.cash));
      default: return 1;
    }
  }
  // Level up a shop. Returns how many levels were bought (0 if you can't afford it).
  function buy(state, d, p, mode) {
    const s = shopAt(state, d, p);
    if (!s) return 0;
    const n = buyAmount(state, d, p, mode);
    const cost = costFor(s.t, s.level, n);
    if (cost > state.cash) return 0;
    state.cash -= cost;
    s.level += n;
    addXp(state, n);
    return n;
  }

  // ---------- Land & building ----------
  function landPrice(d, p) { return DISTRICTS[d].plots[p].price; }
  function buyLand(state, d, p) {
    if (!state.districts[d] || !DISTRICTS[d].plots[p] || state.plots[d][p]) return false;
    const price = landPrice(d, p);
    if (state.cash < price) return false;
    state.cash -= price;
    state.plots[d][p] = { t: -1 };
    state.stats.landBought++;
    addXp(state, 40);
    return true;
  }
  // The same kind of shop costs more each time you build another one.
  function buildCost(state, t) { return TYPES[t].baseCost * Math.pow(5, countType(state, t)); }
  function canBuildOn(d, p, t) { return DISTRICTS[d].plots[p].size >= TYPES[t].minSize && d >= TYPES[t].minDistrict; }
  function build(state, d, p, t) {
    const x = plotAt(state, d, p);
    if (!x || x.t !== -1 || !TYPES[t] || !canBuildOn(d, p, t)) return false;
    const cost = buildCost(state, t);
    if (state.cash < cost) return false;
    state.cash -= cost;
    state.plots[d][p] = newShop(t);
    state.stats.shopsBuilt++;
    addXp(state, 25);
    return true;
  }
  function demolish(state, d, p) {
    if (!shopAt(state, d, p) || shopCount(state) <= 1) return false;   // never leave the player with nothing
    state.plots[d][p] = { t: -1 };
    return true;
  }
  function unlockDistrict(state, d) {
    if (!DISTRICTS[d] || state.districts[d] || !state.districts[d - 1]) return false;
    if (state.cash < DISTRICTS[d].cost) return false;
    state.cash -= DISTRICTS[d].cost;
    state.districts[d] = true;
    addXp(state, 150);
    return true;
  }

  function hireManager(state, d, p) {
    const s = shopAt(state, d, p);
    if (!s || s.manager) return false;
    const cost = TYPES[s.t].managerCost;
    if (state.cash < cost) return false;
    state.cash -= cost;
    s.manager = true;
    s.running = true;
    state.stats.managersHired++;
    addXp(state, 15);
    return true;
  }

  function buyUpgrade(state, id) {
    const u = UPGRADE_BY_ID[id];
    if (!u || state.upgrades[id] || state.cash < u.cost) return false;
    state.cash -= u.cost;
    state.upgrades[id] = true;
    state.stats.upgradesBought++;
    addXp(state, 30);
    return true;
  }
  function availableUpgrades(state) { return UPGRADES.filter(u => !state.upgrades[u.id]); }

  function earn(state, amount) {
    state.cash += amount;
    state.runEarnings += amount;
    state.lifetime += amount;
  }

  // ---------- Player level ----------
  function xpForLevel(level) { return Math.round(50 * Math.pow(level, 1.7)); }
  // Returns the number of levels gained. Each level pays gems.
  function addXp(state, n) {
    state.xp += n;
    let ups = 0;
    while (state.xp >= xpForLevel(state.level)) {
      state.xp -= xpForLevel(state.level);
      state.level++;
      state.gems += 5;
      ups++;
    }
    state._levelUps = (state._levelUps || 0) + ups;
    return ups;
  }
  // The UI calls this to learn about level-ups that happened inside other actions.
  function takeLevelUps(state) { const n = state._levelUps || 0; delete state._levelUps; return n; }

  // ---------- Serving ----------
  function tap(state, d, p) {
    const s = shopAt(state, d, p);
    if (!s || s.running || s.manager) return false;
    s.running = true;
    s.progress = 0;
    state.stats.taps++;
    return true;
  }

  // Advance by dt seconds. Returns a list of { d, p, amount } for shops that finished an order.
  function tick(state, dt, now) {
    const out = [];
    if (!(dt > 0)) return out;
    const pm = permanentMult(state);
    eachShop(state, (s, d, p) => {
      if (s.manager) s.running = true;
      if (!s.running) return;
      s.progress += dt / cycleTime(state, d, p);
      if (s.progress >= 1) {
        const cycles = s.manager ? Math.floor(s.progress) : 1;
        const amount = revenuePerCycle(state, d, p, now, null, pm) * cycles;
        earn(state, amount);
        out.push({ d, p, amount });
        if (s.manager) s.progress -= cycles;
        else { s.progress = 0; s.running = false; }
      }
    });
    state.stats.playTime += dt;
    if (state.runEarnings > state.stats.bestRun) state.stats.bestRun = state.runEarnings;
    return out;
  }

  // ---------- Offline earnings ----------
  function computeOffline(state, now) {
    const elapsed = Math.min(Math.max(0, (now - state.lastSeen) / 1000), OFFLINE_CAP_SEC);
    if (elapsed < 30) return { seconds: elapsed, amount: 0 };
    const rate = incomePerSec(state, now, { managedOnly: true, noTimed: true });
    const boostSec = Math.max(0, Math.min(state.boostUntil, now) - state.lastSeen) / 1000;
    return { seconds: elapsed, amount: rate * (elapsed + Math.min(boostSec, elapsed)) };
  }

  // ---------- Franchise (prestige) ----------
  function totalStarsFor(lifetime) { return Math.floor(10 * Math.cbrt(Math.max(0, lifetime) / 1e12)); }
  function claimableStars(state) { return Math.max(0, totalStarsFor(state.lifetime) - state.stars); }
  function nextStarAt(state) { return Math.pow((totalStarsFor(state.lifetime) + 1) / 10, 3) * 1e12; }
  // You keep: stars, gems, chefs, player level, achievements, quests. You restart: cash, land, shops, research, districts.
  function prestige(state) {
    const gain = claimableStars(state);
    if (gain < 1) return 0;
    state.stars += gain;
    state.prestiges++;
    state.cash = 0;
    state.runEarnings = 0;
    state.district = 0;
    state.districts = DISTRICTS.map((_, i) => i === 0);
    state.plots = DISTRICTS.map(d => d.plots.map(() => null));
    state.plots[0][0] = newShop(0);
    state.upgrades = {};
    state.frenzyUntil = 0;
    return gain;
  }

  // ---------- VIP visitor ----------
  function vipReward(state, now, rnd) {
    const r = rnd === undefined ? Math.random() : rnd;
    state.stats.golden++;
    const gems = r > 0.7 ? 1 + Math.floor((r - 0.7) * 10) : 0;   // 30% chance of 1–3 gems on top
    state.gems += gems;
    if (r < 0.3) {
      state.frenzyUntil = now + FRENZY_DURATION_MS;
      return { type: 'frenzy', mult: FRENZY_MULT, seconds: FRENZY_DURATION_MS / 1000, gems };
    }
    const ips = incomePerSec(state, now, { noTimed: true });
    const amount = Math.max(ips * 120, 25 + state.cash * 0.05);
    earn(state, amount);
    return { type: 'cash', amount, gems };
  }

  // ---------- Boost / time warp ----------
  function addBoost(state, now, ms) {
    state.boostUntil = Math.max(state.boostUntil, now) + (ms || BOOST_DURATION_MS);
    state.boostUntil = Math.min(state.boostUntil, now + 24 * 3600 * 1000);
  }
  function spendGems(state, n) { if (state.gems < n) return false; state.gems -= n; return true; }
  function buyBoost(state, now) { if (!spendGems(state, COST.boost)) return false; addBoost(state, now); return true; }
  // Instantly collect two hours of managed income.
  function timeWarp(state, now) {
    const amount = incomePerSec(state, now, { managedOnly: true, noTimed: true }) * 7200;
    if (amount <= 0 || !spendGems(state, COST.warp)) return 0;
    earn(state, amount);
    return amount;
  }

  // ---------- Staff ----------
  function rollRarity(r) {
    let acc = 0;
    const total = RARITIES.reduce((a, x) => a + x.weight, 0);
    for (let i = 0; i < RARITIES.length; i++) { acc += RARITIES[i].weight / total; if (r < acc) return i; }
    return 0;
  }
  function makeStaff(state, r1, r2, r3) {
    const m = {
      id: state.staffSeq++, name: STAFF_NAMES[Math.floor(r2 * STAFF_NAMES.length) % STAFF_NAMES.length],
      face: STAFF_FACES[Math.floor(r3 * 97) % STAFF_FACES.length],
      rarity: rollRarity(r1), spec: Math.floor(r3 * TYPES.length) % TYPES.length, level: 1,
    };
    state.staff.push(m);
    state.stats.recruited++;
    return m;
  }
  function recruitStatus(state, now) {
    return { free: now >= state.recruitAt, wait: Math.max(0, state.recruitAt - now) / 1000, full: state.staff.length >= STAFF_MAX };
  }
  // Free every 8 hours, otherwise costs gems. Returns the new chef or null.
  function recruit(state, now, rnd) {
    if (state.staff.length >= STAFF_MAX) return null;
    const free = now >= state.recruitAt;
    if (free) state.recruitAt = now + RECRUIT_COOLDOWN_MS;
    else if (!spendGems(state, COST.recruit)) return null;
    const r = rnd || [Math.random(), Math.random(), Math.random()];
    addXp(state, 20);
    return makeStaff(state, r[0], r[1], r[2]);
  }
  function staffShop(state, id) {
    let found = null;
    eachShop(state, (s, d, p) => { if (s.chef === id) found = { d, p }; });
    return found;
  }
  function assignStaff(state, id, d, p) {
    const s = shopAt(state, d, p);
    if (!s || !staffById(state, id)) return false;
    eachShop(state, o => { if (o.chef === id) o.chef = 0; });
    s.chef = id;
    return true;
  }
  function unassignStaff(state, id) { eachShop(state, o => { if (o.chef === id) o.chef = 0; }); }
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
    state.gems += 3;   // small refund
    return true;
  }

  // ---------- Reward crate ----------
  function crateStatus(state, now) { return { free: now >= state.crateAt, wait: Math.max(0, state.crateAt - now) / 1000 }; }
  function openCrate(state, now, rnd) {
    const free = now >= state.crateAt;
    if (free) state.crateAt = now + CRATE_COOLDOWN_MS;
    else if (!spendGems(state, COST.crate)) return null;
    state.stats.crates++;
    const r = rnd || [Math.random(), Math.random(), Math.random(), Math.random()];
    if (r[0] < 0.45) {
      const amount = Math.max(60, incomePerSec(state, now, { noTimed: true }) * (300 + r[1] * 600));
      earn(state, amount);
      return { type: 'cash', amount, emoji: '💰', text: formatMoney(amount) };
    }
    if (r[0] < 0.72) {
      const gems = 4 + Math.floor(r[1] * 9);
      state.gems += gems;
      return { type: 'gems', gems, emoji: '💎', text: gems + ' gems' };
    }
    if (r[0] < 0.87 || state.staff.length >= STAFF_MAX) {
      addBoost(state, now, 2 * 3600 * 1000);
      return { type: 'boost', emoji: '🚀', text: '2× profit for 2 hours' };
    }
    const m = makeStaff(state, r[1], r[2], r[3]);
    return { type: 'staff', staff: m, emoji: m.face, text: `${RARITIES[m.rarity].name} chef ${m.name}` };
  }

  // ---------- Daily reward ----------
  function dayKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dailyStatus(state, now) {
    const today = dayKey(new Date(now));
    if (state.daily.last === today) return { available: false };
    const streak = state.daily.last === dayKey(new Date(now - 86400000)) ? state.daily.streak + 1 : 1;
    const day = ((streak - 1) % 7) + 1;
    const ips = incomePerSec(state, now, { noTimed: true });
    return { available: true, streak, day, amount: Math.max(100 * day, ips * 300 * day), gems: day === 7 ? 15 : 2 + day, today };
  }
  function claimDaily(state, now) {
    const d = dailyStatus(state, now);
    if (!d.available) return null;
    state.daily = { last: d.today, streak: d.streak };
    earn(state, d.amount);
    state.gems += d.gems;
    if (d.day === 7) addBoost(state, now);
    return d;
  }

  // ---------- Quests ----------
  function trackStats(state) {
    const st = state.stats;
    st.bestLevel = Math.max(st.bestLevel, bestLevel(state));
    st.maxShops = Math.max(st.maxShops, shopCount(state));
    st.maxDistricts = Math.max(st.maxDistricts, districtCount(state));
    st.maxLevels = Math.max(st.maxLevels, totalLevels(state));
  }
  function questList(state) {
    trackStats(state);
    const list = [];
    for (const q of QUESTS) {
      const tier = state.quests[q.kind] || 0;
      if (q.max !== undefined && tier >= q.max) continue;
      const target = q.target(tier), value = Math.min(q.value(state), target);
      list.push({ kind: q.kind, emoji: q.emoji, tier, title: q.title(target), value, target, done: q.value(state) >= target,
        gems: Math.min(12, 2 + tier), xp: 20 * (tier + 1) });
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

  function checkAchievements(state) {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (!state.achievements[a.id] && a.check(state)) {
        state.achievements[a.id] = true;
        state.gems += 5;
        unlocked.push(a);
      }
    }
    return unlocked;
  }

  return {
    SAVE_VERSION, STAR_BONUS, ACHIEVEMENT_BONUS, LEVEL_BONUS, OFFLINE_CAP_SEC, BOOST_DURATION_MS, FRENZY_MULT, COST,
    SIZES, TYPES, BUSINESSES, DISTRICTS, MILESTONES, EMPIRE_MILESTONES, UPGRADES, ACHIEVEMENTS, QUESTS, RARITIES, BUY_MODES,
    STAFF_MAX, STAFF_MAX_LEVEL,
    formatNumber, formatMoney, formatTime,
    newState, loadState,
    isShop, plotAt, shopAt, eachShop, shopCount, totalLevels, countType, bestLevel, managerCount, districtCount,
    milestoneInfo, empireInfo, permanentMult, timedMult, typeMult, shopMult, cycleTime, revenuePerCycle, incomePerSec,
    costFor, maxAffordable, buyAmount, buy,
    landPrice, buyLand, buildCost, canBuildOn, build, demolish, unlockDistrict,
    hireManager, buyUpgrade, availableUpgrades, tap, tick, earn,
    xpForLevel, addXp, takeLevelUps,
    computeOffline, totalStarsFor, claimableStars, nextStarAt, prestige,
    vipReward, addBoost, buyBoost, timeWarp,
    staffById, staffBonus, staffShop, recruitStatus, recruit, assignStaff, unassignStaff, staffUpgradeCost, upgradeStaff, dismissStaff,
    crateStatus, openCrate, dailyStatus, claimDaily,
    questList, claimQuest, trackStats, checkAchievements, achievementCount,
  };
});
