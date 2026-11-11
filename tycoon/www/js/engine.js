/*
 * Yum Empire — core game engine.
 * Pure logic, no DOM access, so it can be unit-tested and balance-simulated in Node.
 */
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Engine = E;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAVE_VERSION = 1;
  const STAR_BONUS = 0.04;          // +4% profit per Golden Star
  const ACHIEVEMENT_BONUS = 0.02;   // +2% profit per achievement
  const OFFLINE_CAP_SEC = 8 * 3600; // max offline earnings window
  const BOOST_DURATION_MS = 4 * 3600 * 1000;
  const FRENZY_DURATION_MS = 30 * 1000;
  const FRENZY_MULT = 7;

  const BUSINESSES = [
    { id: 'cart',     name: 'Noodle Cart',     emoji: '🍜', baseCost: 5,      growth: 1.07, baseRevenue: 3,    time: 2 },
    { id: 'dumpling', name: 'Dumpling Stand',  emoji: '🥟', baseCost: 75,     growth: 1.15, baseRevenue: 40,   time: 3 },
    { id: 'tea',      name: 'Bubble Tea Bar',  emoji: '🧋', baseCost: 900,    growth: 1.14, baseRevenue: 400,  time: 6 },
    { id: 'taco',     name: 'Taco Truck',      emoji: '🌮', baseCost: 11000,  growth: 1.13, baseRevenue: 3600, time: 12 },
    { id: 'pizza',    name: 'Pizza Parlor',    emoji: '🍕', baseCost: 1.4e5,  growth: 1.12, baseRevenue: 3.2e4, time: 24 },
    { id: 'sushi',    name: 'Sushi Lounge',    emoji: '🍣', baseCost: 1.8e6,  growth: 1.11, baseRevenue: 3e5,  time: 48 },
    { id: 'burger',   name: 'Burger Chain',    emoji: '🍔', baseCost: 2.4e7,  growth: 1.10, baseRevenue: 2.8e6, time: 96 },
    { id: 'court',    name: 'Food Court',      emoji: '🏬', baseCost: 3.2e8,  growth: 1.09, baseRevenue: 2.6e7, time: 192 },
    { id: 'factory',  name: 'Snack Factory',   emoji: '🏭', baseCost: 4.5e9,  growth: 1.08, baseRevenue: 2.5e8, time: 384 },
    { id: 'global',   name: 'Global Cuisine',  emoji: '🌍', baseCost: 6.5e10, growth: 1.07, baseRevenue: 3e9,  time: 768 },
  ];
  const MANAGERS = ['Mei', 'Diego', 'Priya', 'Tomás', 'Yuki', 'Amara', 'Lars', 'Fatima', 'Kenji', 'Olivia'];
  BUSINESSES.forEach((b, i) => {
    b.managerCost = Math.max(100, b.baseCost * 60);
    b.managerName = MANAGERS[i];
  });

  // Per-business level milestones. The first ones double speed, later ones quadruple profit.
  const MILESTONES = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
  const SPEED_MILESTONE_MAX = 500;
  // When EVERY business reaches these levels, all profits ×2.
  const GLOBAL_MILESTONES = [25, 50, 100, 200, 300, 400, 500];

  // ---------- Upgrades ----------
  const BIZ_UPGRADE_NAMES = ['Fresh Ingredients', 'Pro Kitchen Gear', 'Viral Marketing', 'Celebrity Chef', 'Secret Recipe'];
  const GLOBAL_UPGRADE_NAMES = [
    'Loyalty Cards', 'Delivery App', 'Social Media Buzz', 'TV Commercial', 'Food Festival',
    'Award-Winning Menu', 'Theme Song', 'Mascot Parade', 'Cooking Show', 'Space Snacks',
    'Moon Franchise', 'Galactic Brand',
  ];
  const UPGRADES = [];
  BUSINESSES.forEach((b, i) => {
    BIZ_UPGRADE_NAMES.forEach((n, t) => {
      UPGRADES.push({
        id: `b${i}u${t}`, biz: i, mult: 3,
        name: `${n}`, target: b.name, emoji: b.emoji,
        cost: b.baseCost * 4000 * Math.pow(2e4, t),
      });
    });
  });
  GLOBAL_UPGRADE_NAMES.forEach((n, t) => {
    UPGRADES.push({
      id: `g${t}`, biz: -1, mult: 3,
      name: n, target: 'All businesses', emoji: '⭐',
      cost: 2.5e6 * Math.pow(4e5, t),
    });
  });
  UPGRADES.sort((a, b) => a.cost - b.cost);
  const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

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
    // 999,999 would round to "1000.0K" — roll over to "1.00M" instead.
    if (parseFloat(txt) >= 1000) { tier++; scaled = 1; txt = '1.00'; }
    return txt + tierSuffix(tier);
  }
  function tierSuffix(tier) {
    if (tier < SUFFIXES.length) return SUFFIXES[tier];
    // aa, ab, ac... for absurdly large numbers
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

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [];
  BUSINESSES.forEach((b, i) => {
    [25, 100, 250, 500].forEach(l => ACHIEVEMENTS.push({
      id: `lvl_${b.id}_${l}`, emoji: b.emoji, name: `${b.name} ${l}`, desc: `Own ${l} ${b.name} levels`,
      check: s => s.biz[i].level >= l,
    }));
  });
  [[1e3, 'First Thousand'], [1e6, 'Millionaire'], [1e9, 'Billionaire'], [1e12, 'Trillionaire'],
   [1e15, 'Snack Overlord'], [1e18, 'Food Titan'], [1e21, 'Flavor Emperor'], [1e24, 'Galactic Gourmet'],
   [1e30, 'Universal Chef']].forEach(([v, n]) => ACHIEVEMENTS.push({
    id: `earn_${v}`, emoji: '💰', name: n, desc: `Earn ${formatMoney(v)} all-time`, check: s => s.lifetime >= v,
  }));
  [[1, 'Franchiser'], [5, 'Serial Franchiser'], [10, 'Empire Builder']].forEach(([v, n]) => ACHIEVEMENTS.push({
    id: `prestige_${v}`, emoji: '⭐', name: n, desc: `Franchise ${v} time${v > 1 ? 's' : ''}`, check: s => s.prestiges >= v,
  }));
  [[1, 'VIP Treatment'], [10, 'Regular VIPs'], [50, 'VIP Magnet']].forEach(([v, n]) => ACHIEVEMENTS.push({
    id: `vip_${v}`, emoji: '🤩', name: n, desc: `Serve ${v} VIP customer${v > 1 ? 's' : ''}`, check: s => s.stats.golden >= v,
  }));
  [[100, 'Busy Hands'], [1000, 'Tap Master']].forEach(([v, n]) => ACHIEVEMENTS.push({
    id: `tap_${v}`, emoji: '👆', name: n, desc: `Cook by hand ${v} times`, check: s => s.stats.taps >= v,
  }));
  [[1, 'Delegator'], [10, 'Full Staff']].forEach(([v, n]) => ACHIEVEMENTS.push({
    id: `mgr_${v}`, emoji: '🧑‍🍳', name: n, desc: `Hire ${v} manager${v > 1 ? 's' : ''}`,
    check: s => s.biz.filter(b => b.manager).length >= v,
  }));

  // ---------- State ----------
  function newBizState(i) {
    return { level: i === 0 ? 1 : 0, progress: 0, running: false, manager: false };
  }
  function newState(now) {
    now = now || Date.now();
    return {
      v: SAVE_VERSION,
      cash: 0,
      runEarnings: 0,
      lifetime: 0,
      stars: 0,
      prestiges: 0,
      biz: BUSINESSES.map((_, i) => newBizState(i)),
      upgrades: {},
      achievements: {},
      boostUntil: 0,
      frenzyUntil: 0,
      premium: false,          // permanent ×2 (in-app purchase)
      adsRemoved: false,
      lastSeen: now,
      createdAt: now,
      daily: { last: '', streak: 0 },
      stats: { taps: 0, golden: 0, playTime: 0, bestRun: 0 },
      settings: { sound: true, haptics: true, buyMode: 0, lens: true },
      tutorial: 0,
    };
  }

  function loadState(raw, now) {
    const s = newState(now);
    if (!raw || typeof raw !== 'object') return s;
    const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
    s.cash = num(raw.cash, 0);
    s.runEarnings = num(raw.runEarnings, 0);
    s.lifetime = num(raw.lifetime, 0);
    s.stars = num(raw.stars, 0);
    s.prestiges = num(raw.prestiges, 0);
    if (Array.isArray(raw.biz)) {
      raw.biz.forEach((b, i) => {
        if (!s.biz[i] || !b) return;
        s.biz[i].level = Math.max(0, Math.floor(num(b.level, s.biz[i].level)));
        s.biz[i].progress = Math.min(Math.max(num(b.progress, 0), 0), 1);
        s.biz[i].running = !!b.running;
        s.biz[i].manager = !!b.manager;
      });
    }
    if (raw.upgrades && typeof raw.upgrades === 'object') {
      for (const k of Object.keys(raw.upgrades)) if (UPGRADE_BY_ID[k]) s.upgrades[k] = true;
    }
    if (raw.achievements && typeof raw.achievements === 'object') {
      const ids = new Set(ACHIEVEMENTS.map(a => a.id));
      for (const k of Object.keys(raw.achievements)) if (ids.has(k)) s.achievements[k] = true;
    }
    s.boostUntil = num(raw.boostUntil, 0);
    s.frenzyUntil = num(raw.frenzyUntil, 0);
    s.premium = !!raw.premium;
    s.adsRemoved = !!raw.adsRemoved;
    s.lastSeen = num(raw.lastSeen, s.lastSeen);
    s.createdAt = num(raw.createdAt, s.createdAt);
    if (raw.daily) s.daily = { last: String(raw.daily.last || ''), streak: num(raw.daily.streak, 0) };
    if (raw.stats) for (const k of Object.keys(s.stats)) s.stats[k] = num(raw.stats[k], s.stats[k]);
    if (raw.settings) {
      s.settings.sound = raw.settings.sound !== false;
      s.settings.haptics = raw.settings.haptics !== false;
      s.settings.buyMode = num(raw.settings.buyMode, 0);
      s.settings.lens = raw.settings.lens !== false;
    }
    s.tutorial = num(raw.tutorial, 0);
    return s;
  }

  // ---------- Economy ----------
  function milestoneInfo(level) {
    let speed = 1, profit = 1, reached = 0;
    for (const m of MILESTONES) {
      if (level >= m) {
        reached++;
        if (m <= SPEED_MILESTONE_MAX) speed *= 2; else profit *= 4;
      }
    }
    const next = MILESTONES.find(m => m > level) || null;
    const prev = MILESTONES.filter(m => m <= level).pop() || 0;
    const nextReward = next == null ? null : (next <= SPEED_MILESTONE_MAX ? '2× speed' : '4× profit');
    return { speed, profit, reached, next, prev, nextReward };
  }

  function globalMilestoneInfo(state) {
    const minLevel = Math.min(...state.biz.map(b => b.level));
    let mult = 1;
    for (const m of GLOBAL_MILESTONES) if (minLevel >= m) mult *= 2;
    const next = GLOBAL_MILESTONES.find(m => m > minLevel) || null;
    return { mult, minLevel, next };
  }

  function achievementCount(state) { return Object.keys(state.achievements).length; }

  // Multipliers that never expire (used for offline earnings)
  function permanentMult(state) {
    let m = (1 + state.stars * STAR_BONUS) * (1 + achievementCount(state) * ACHIEVEMENT_BONUS);
    for (const u of UPGRADES) if (u.biz === -1 && state.upgrades[u.id]) m *= u.mult;
    m *= globalMilestoneInfo(state).mult;
    if (state.premium) m *= 2;
    return m;
  }
  function timedMult(state, now) {
    let m = 1;
    if (state.boostUntil > now) m *= 2;
    if (state.frenzyUntil > now) m *= FRENZY_MULT;
    return m;
  }
  function bizMult(state, i) {
    let m = milestoneInfo(state.biz[i].level).profit;
    for (const u of UPGRADES) if (u.biz === i && state.upgrades[u.id]) m *= u.mult;
    return m;
  }
  function cycleTime(state, i) {
    return BUSINESSES[i].time / milestoneInfo(state.biz[i].level).speed;
  }
  function revenuePerCycle(state, i, now, opts) {
    const b = state.biz[i];
    if (b.level <= 0) return 0;
    const timed = opts && opts.noTimed ? 1 : timedMult(state, now);
    return BUSINESSES[i].baseRevenue * b.level * bizMult(state, i) * permanentMult(state) * timed;
  }
  function incomePerSec(state, now, opts) {
    const managedOnly = opts && opts.managedOnly;
    let total = 0;
    for (let i = 0; i < BUSINESSES.length; i++) {
      const b = state.biz[i];
      if (b.level <= 0) continue;
      if (managedOnly && !b.manager) continue;
      total += revenuePerCycle(state, i, now, opts) / cycleTime(state, i);
    }
    return total;
  }

  function costFor(i, level, n) {
    const b = BUSINESSES[i];
    if (n <= 0) return 0;
    return b.baseCost * Math.pow(b.growth, level) * (Math.pow(b.growth, n) - 1) / (b.growth - 1);
  }
  function maxAffordable(i, level, cash) {
    const b = BUSINESSES[i];
    const first = b.baseCost * Math.pow(b.growth, level);
    if (cash < first) return 0;
    let n = Math.floor(Math.log(cash * (b.growth - 1) / first + 1) / Math.log(b.growth));
    // Correct floating point drift
    while (n > 0 && costFor(i, level, n) > cash) n--;
    while (costFor(i, level, n + 1) <= cash) n++;
    return n;
  }

  const BUY_MODES = ['×1', '×10', '×100', 'Next', 'Max'];
  // Returns how many levels the current buy mode would purchase (>=1 so a cost can be shown).
  function buyAmount(state, i, mode) {
    const lvl = state.biz[i].level;
    switch (mode) {
      case 0: return 1;
      case 1: return 10;
      case 2: return 100;
      case 3: { const nx = milestoneInfo(lvl).next; return nx ? nx - lvl : 1; }
      case 4: return Math.max(1, maxAffordable(i, lvl, state.cash));
      default: return 1;
    }
  }
  function buy(state, i, mode) {
    const n = buyAmount(state, i, mode);
    const cost = costFor(i, state.biz[i].level, n);
    if (cost > state.cash) return 0;
    state.cash -= cost;
    state.biz[i].level += n;
    return n;
  }
  function isUnlocked(state, i) {
    // A business is visible once the previous one is owned (or you can almost afford it).
    return i === 0 || state.biz[i - 1].level > 0 || state.biz[i].level > 0;
  }

  function hireManager(state, i) {
    const b = state.biz[i];
    if (b.manager || b.level <= 0) return false;
    const cost = BUSINESSES[i].managerCost;
    if (state.cash < cost) return false;
    state.cash -= cost;
    b.manager = true;
    b.running = true;
    return true;
  }

  function buyUpgrade(state, id) {
    const u = UPGRADE_BY_ID[id];
    if (!u || state.upgrades[id] || state.cash < u.cost) return false;
    state.cash -= u.cost;
    state.upgrades[id] = true;
    return true;
  }
  function availableUpgrades(state) {
    return UPGRADES.filter(u => !state.upgrades[u.id]);
  }

  function earn(state, amount) {
    state.cash += amount;
    state.runEarnings += amount;
    state.lifetime += amount;
  }

  // Start cooking by hand.
  function tap(state, i) {
    const b = state.biz[i];
    if (b.level <= 0 || b.running || b.manager) return false;
    b.running = true;
    b.progress = 0;
    state.stats.taps++;
    return true;
  }

  // Advance simulation by dt seconds. Returns array of earnings per business this tick.
  function tick(state, dt, now) {
    const earned = new Array(BUSINESSES.length).fill(0);
    if (!(dt > 0)) return earned;
    for (let i = 0; i < BUSINESSES.length; i++) {
      const b = state.biz[i];
      if (b.level <= 0) continue;
      if (b.manager) b.running = true;
      if (!b.running) continue;
      b.progress += dt / cycleTime(state, i);
      if (b.progress >= 1) {
        const cycles = b.manager ? Math.floor(b.progress) : 1;
        const amt = revenuePerCycle(state, i, now) * cycles;
        earn(state, amt);
        earned[i] = amt;
        if (b.manager) b.progress -= cycles;
        else { b.progress = 0; b.running = false; }
      }
    }
    state.stats.playTime += dt;
    if (state.runEarnings > state.stats.bestRun) state.stats.bestRun = state.runEarnings;
    return earned;
  }

  // ---------- Offline earnings ----------
  function computeOffline(state, now) {
    const elapsed = Math.min(Math.max(0, (now - state.lastSeen) / 1000), OFFLINE_CAP_SEC);
    if (elapsed < 30) return { seconds: elapsed, amount: 0 };
    const rate = incomePerSec(state, now, { managedOnly: true, noTimed: true });
    // Boost time that was still active while offline also counts.
    const boostSec = Math.max(0, Math.min(state.boostUntil, now) - state.lastSeen) / 1000;
    const boosted = Math.min(boostSec, elapsed);
    return { seconds: elapsed, amount: rate * (elapsed + boosted) };
  }

  // ---------- Prestige (Franchise) ----------
  function totalStarsFor(lifetime) {
    return Math.floor(10 * Math.cbrt(Math.max(0, lifetime) / 1e10));
  }
  function claimableStars(state) {
    return Math.max(0, totalStarsFor(state.lifetime) - state.stars);
  }
  // Lifetime earnings needed for the next star to become available.
  function nextStarAt(state) {
    const target = totalStarsFor(state.lifetime) + 1;
    return Math.pow(target / 10, 3) * 1e10;
  }
  function prestige(state) {
    const gain = claimableStars(state);
    if (gain < 1) return 0;
    state.stars += gain;
    state.prestiges++;
    state.cash = 0;
    state.runEarnings = 0;
    state.biz = BUSINESSES.map((_, i) => newBizState(i));
    state.upgrades = {};
    state.frenzyUntil = 0;
    return gain;
  }

  // ---------- VIP customers (random golden event) ----------
  function vipReward(state, now, rnd) {
    const r = rnd === undefined ? Math.random() : rnd;
    state.stats.golden++;
    if (r < 0.3) {
      state.frenzyUntil = now + FRENZY_DURATION_MS;
      return { type: 'frenzy', mult: FRENZY_MULT, seconds: FRENZY_DURATION_MS / 1000 };
    }
    const ips = incomePerSec(state, now, { noTimed: true });
    const amount = Math.max(ips * 120, 25 + state.cash * 0.05);
    earn(state, amount);
    return { type: 'cash', amount };
  }

  // ---------- Rewarded boost ----------
  function addBoost(state, now) {
    state.boostUntil = Math.max(state.boostUntil, now) + BOOST_DURATION_MS;
    // Cap total stored boost at 24h so players can stack a few.
    state.boostUntil = Math.min(state.boostUntil, now + 24 * 3600 * 1000);
  }

  // ---------- Daily reward ----------
  function dayKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function dailyStatus(state, now) {
    const today = dayKey(new Date(now));
    const yesterday = dayKey(new Date(now - 86400000));
    if (state.daily.last === today) return { available: false };
    const streak = state.daily.last === yesterday ? state.daily.streak + 1 : 1;
    const ips = incomePerSec(state, now, { noTimed: true });
    const day = ((streak - 1) % 7) + 1;
    const amount = Math.max(100 * day, ips * 300 * day);
    return { available: true, streak, day, amount, today };
  }
  function claimDaily(state, now) {
    const d = dailyStatus(state, now);
    if (!d.available) return null;
    state.daily = { last: d.today, streak: d.streak };
    earn(state, d.amount);
    if (d.day === 7) addBoost(state, now); // weekly bonus: free 2× boost
    return d;
  }

  function checkAchievements(state) {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (!state.achievements[a.id] && a.check(state)) {
        state.achievements[a.id] = true;
        unlocked.push(a);
      }
    }
    return unlocked;
  }

  return {
    SAVE_VERSION, STAR_BONUS, ACHIEVEMENT_BONUS, OFFLINE_CAP_SEC, BOOST_DURATION_MS, FRENZY_MULT,
    BUSINESSES, MILESTONES, GLOBAL_MILESTONES, UPGRADES, ACHIEVEMENTS, BUY_MODES,
    formatNumber, formatMoney, formatTime,
    newState, loadState,
    milestoneInfo, globalMilestoneInfo, permanentMult, timedMult, bizMult, cycleTime,
    revenuePerCycle, incomePerSec, costFor, maxAffordable, buyAmount, buy, isUnlocked,
    hireManager, buyUpgrade, availableUpgrades, tap, tick, earn,
    computeOffline, totalStarsFor, claimableStars, nextStarAt, prestige,
    vipReward, addBoost, dailyStatus, claimDaily, checkAchievements, achievementCount,
  };
});
