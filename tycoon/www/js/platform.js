/*
 * Platform layer: storage, sound, haptics, rewarded ads and in-app purchases.
 * Works in a plain browser (with safe fallbacks) and inside the Capacitor iOS/Android shell.
 * Native plugins are optional — if one isn't installed the feature degrades gracefully.
 */
(function () {
  'use strict';

  const CONFIG = {
    version: '4.0.0',
    saveKey: 'yum-empire-save-v1',
    // Google's official TEST ad units. Replace with your own before release (see README).
    admob: {
      androidRewarded: 'ca-app-pub-3940256099942544/5224354917',
      iosRewarded: 'ca-app-pub-3940256099942544/1712485313',
      testing: true,
    },
    // RevenueCat public SDK keys (leave empty to disable purchases).
    revenuecat: { androidKey: '', iosKey: '' },
    products: {
      premium: 'yum_premium_2x',   // non-consumable: permanent ×2 profit
      vipPass: 'yum_vip_pass',     // non-consumable: rewards without watching ads
    },
  };

  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const platform = Cap && Cap.getPlatform ? Cap.getPlatform() : 'web';
  const plugin = (name) => (Cap && Cap.Plugins && Cap.Plugins[name]) || null;

  // ---------- Storage ----------
  const Storage = {
    async load() {
      let local = null, pref = null;
      try { local = JSON.parse(localStorage.getItem(CONFIG.saveKey) || 'null'); } catch (e) { /* ignore */ }
      const P = plugin('Preferences');
      if (P) {
        try { const r = await P.get({ key: CONFIG.saveKey }); pref = r && r.value ? JSON.parse(r.value) : null; } catch (e) { /* ignore */ }
      }
      if (local && pref) return (pref.lastSeen || 0) > (local.lastSeen || 0) ? pref : local;
      return pref || local;
    },
    save(state) {
      const json = JSON.stringify(state);
      try { localStorage.setItem(CONFIG.saveKey, json); } catch (e) { /* quota/private mode */ }
      const P = plugin('Preferences');
      if (P) P.set({ key: CONFIG.saveKey, value: json }).catch(() => {});
    },
    clear() {
      try { localStorage.removeItem(CONFIG.saveKey); } catch (e) { /* ignore */ }
      const P = plugin('Preferences');
      if (P) P.remove({ key: CONFIG.saveKey }).catch(() => {});
    },
  };

  // ---------- Sound (synthesized, no asset files) ----------
  let ctx = null;
  let lastSound = 0;
  const Sound = {
    enabled: true,
    unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) try { ctx = new AC(); } catch (e) { ctx = null; }
    },
    tone(freqs, dur, type, vol) {
      if (!this.enabled || !ctx) return;
      const now = ctx.currentTime;
      freqs.forEach((f, k) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(f, now + k * dur);
        g.gain.setValueAtTime(0.0001, now + k * dur);
        g.gain.exponentialRampToValueAtTime(vol || 0.06, now + k * dur + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + (k + 1) * dur);
        o.connect(g).connect(ctx.destination);
        o.start(now + k * dur);
        o.stop(now + (k + 1) * dur + 0.02);
      });
    },
    play(name) {
      const t = performance.now();
      if (name === 'coin' && t - lastSound < 90) return; // throttle rapid coins
      lastSound = t;
      switch (name) {
        case 'coin': return this.tone([988, 1319], 0.06, 'square', 0.035);
        case 'buy': return this.tone([523, 659, 784], 0.05, 'triangle', 0.08);
        case 'tap': return this.tone([330], 0.04, 'triangle', 0.05);
        case 'milestone': return this.tone([523, 659, 784, 1047], 0.09, 'square', 0.05);
        case 'vip': return this.tone([784, 988, 1175, 1568], 0.07, 'triangle', 0.08);
        case 'prestige': return this.tone([392, 523, 659, 784, 1047, 1319], 0.1, 'triangle', 0.09);
        case 'error': return this.tone([196, 147], 0.08, 'sawtooth', 0.04);
        case 'hire': return this.tone([392, 494, 587, 784], 0.07, 'triangle', 0.08);
        case 'register': return this.tone([1568, 2093, 1568, 2637], 0.045, 'square', 0.03);
        case 'build': return this.tone([196, 262, 196, 330], 0.06, 'square', 0.04);
      }
    },
  };

  // ---------- Music (composed in code: a gentle market tune, no audio files) ----------
  // A four-chord loop with a plucked melody, bass and soft shaker. Daytime is brighter and
  // faster; at night it slows down and drops the melody to a music-box line.
  const Music = {
    enabled: true, playing: false, step: 0, nextAt: 0, timer: null, mood: 'day', bus: null,
    start() {
      if (!this.enabled || this.playing || !ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      this.bus = ctx.createGain(); this.bus.gain.value = 0.0001; this.bus.connect(ctx.destination);
      this.bus.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 2);
      this.playing = true; this.step = 0; this.nextAt = ctx.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 120);
    },
    stop() {
      if (!this.playing) return;
      this.playing = false; clearInterval(this.timer);
      const bus = this.bus;
      try { bus.gain.cancelScheduledValues(ctx.currentTime); bus.gain.setValueAtTime(bus.gain.value, ctx.currentTime); bus.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6); } catch (e) { /* ignore */ }
      setTimeout(() => { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 800);
    },
    update(state, now) {
      if (!state) return;
      const E = window.Engine, c = E && E.gameClock ? E.gameClock(now) : { hour: 12 };
      this.mood = c.hour >= 21 || c.hour < 6 ? 'night' : 'day';
      if (state.settings.music && !this.playing && ctx && ctx.state === 'running') this.start();
    },
    note(freq, t, dur, type, vol, attack) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.bus);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(t, vol) {
      const len = Math.floor(ctx.sampleRate * 0.05), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      f.type = 'highpass'; f.frequency.value = 6000;
      src.buffer = buf; g.gain.value = vol;
      src.connect(f).connect(g).connect(this.bus); src.start(t);
    },
    schedule() {
      if (!this.playing) return;
      const night = this.mood === 'night', beat = night ? 0.42 : 0.3;
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const CHORDS = [[60, 64, 67], [57, 60, 64], [65, 69, 72], [67, 71, 74]];   // C  Am  F  G
      const MEL = [76, 74, 72, 74, 76, 79, 76, 74, 72, 69, 72, 74, 71, 72, 74, 79];
      while (this.nextAt < ctx.currentTime + 0.4) {
        const t = this.nextAt, k = this.step % 32, bar = Math.floor(this.step / 8) % 4, ch = CHORDS[bar];
        if (k % 8 === 0) { this.note(mtof(ch[0] - 24), t, beat * 3.5, 'triangle', 0.09, 0.02); ch.forEach(n => this.note(mtof(n), t, beat * 7.5, 'sine', 0.018, 0.3)); }
        if (k % 8 === 4) this.note(mtof(ch[0] - 17), t, beat * 2, 'triangle', 0.06, 0.02);
        if (!night && k % 2 === 1) this.noise(t, 0.035);
        const m = MEL[(this.step + (bar % 2 ? 4 : 0)) % 16];
        if (night ? k % 4 === 0 : k % 2 === 0 || k % 8 === 3) this.note(mtof(night ? m + 12 : m), t, night ? beat * 3 : beat * 1.4, night ? 'sine' : 'square', night ? 0.025 : 0.016, 0.005);
        this.nextAt += beat; this.step++;
      }
    },
  };

  // ---------- Haptics ----------
  const Haptics = {
    enabled: true,
    tap(strong) {
      if (!this.enabled) return;
      const H = plugin('Haptics');
      if (H) { H.impact({ style: strong ? 'MEDIUM' : 'LIGHT' }).catch(() => {}); return; }
      // Browsers only allow vibration after the player has touched the page.
      const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (navigator.vibrate && touched) try { navigator.vibrate(strong ? 25 : 8); } catch (e) { /* ignore */ }
    },
  };

  // ---------- Ads (rewarded only — no forced interstitials) ----------
  let admobReady = false;
  const Ads = {
    async init() {
      const AdMob = plugin('AdMob');
      if (!AdMob) return;
      try {
        await AdMob.initialize({ initializeForTesting: CONFIG.admob.testing });
        if (platform === 'ios' && AdMob.requestTrackingAuthorization) {
          try { await AdMob.requestTrackingAuthorization(); } catch (e) { /* user declined */ }
        }
        admobReady = true;
      } catch (e) { console.warn('AdMob init failed', e); }
    },
    // Resolves true if the player earned the reward.
    async showRewarded() {
      const AdMob = plugin('AdMob');
      if (AdMob && admobReady) {
        try {
          const adId = platform === 'ios' ? CONFIG.admob.iosRewarded : CONFIG.admob.androidRewarded;
          await AdMob.prepareRewardVideoAd({ adId, isTesting: CONFIG.admob.testing });
          const reward = await AdMob.showRewardVideoAd();
          return !!reward;
        } catch (e) {
          console.warn('Rewarded ad failed', e);
          return false;
        }
      }
      return demoAd();
    },
  };

  // Web build: a short simulated ad so the reward flow can be played end-to-end.
  function demoAd() {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'ad-demo';
      let n = 3;
      const render = () => { el.innerHTML = `<div><div style="font-size:48px">📺</div><p>Sponsored message</p><p style="opacity:.6">Reward in ${n}…</p></div>`; };
      render();
      document.body.appendChild(el);
      const iv = setInterval(() => {
        n--;
        if (n <= 0) { clearInterval(iv); el.remove(); resolve(true); } else render();
      }, 1000);
    });
  }

  // ---------- In-app purchases (RevenueCat) ----------
  let purchasesReady = false;
  const Store = {
    get available() { return purchasesReady; },
    async init() {
      const P = plugin('Purchases');
      const key = platform === 'ios' ? CONFIG.revenuecat.iosKey : CONFIG.revenuecat.androidKey;
      if (!P || !key) return;
      try { await P.configure({ apiKey: key }); purchasesReady = true; } catch (e) { console.warn('Purchases init failed', e); }
    },
    async prices() {
      if (!purchasesReady) return {};
      try {
        const ids = Object.values(CONFIG.products);
        const { products } = await plugin('Purchases').getProducts({ productIdentifiers: ids, type: 'NON_SUBSCRIPTION' });
        return Object.fromEntries((products || []).map(p => [p.identifier, p.priceString]));
      } catch (e) { return {}; }
    },
    // Resolves to the list of owned product ids after the purchase (or null on cancel/failure).
    async buy(productId) {
      if (!purchasesReady) return null;
      const P = plugin('Purchases');
      try {
        const { products } = await P.getProducts({ productIdentifiers: [productId], type: 'NON_SUBSCRIPTION' });
        if (!products || !products.length) return null;
        const { customerInfo } = await P.purchaseStoreProduct({ product: products[0] });
        return ownedFrom(customerInfo);
      } catch (e) { return null; }
    },
    // Silent check of what the player already owns (no store sign-in prompt).
    async owned() {
      if (!purchasesReady) return null;
      try {
        const { customerInfo } = await plugin('Purchases').getCustomerInfo();
        return ownedFrom(customerInfo);
      } catch (e) { return null; }
    },
    async restore() {
      if (!purchasesReady) return null;
      try {
        const { customerInfo } = await plugin('Purchases').restorePurchases();
        return ownedFrom(customerInfo);
      } catch (e) { return null; }
    },
  };
  function ownedFrom(info) {
    if (!info) return [];
    return (info.nonSubscriptionTransactions || []).map(t => t.productIdentifier);
  }

  // ---------- Lifecycle ----------
  const Lifecycle = {
    onPause(fn) {
      document.addEventListener('visibilitychange', () => { if (document.hidden) fn(); });
      window.addEventListener('pagehide', fn);
      const App = plugin('App');
      if (App) App.addListener('pause', fn);
    },
    onResume(fn) {
      document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); });
      const App = plugin('App');
      if (App) App.addListener('resume', fn);
    },
    async hideSplash() {
      const S = plugin('SplashScreen');
      if (S) try { await S.hide(); } catch (e) { /* ignore */ }
    },
    async styleStatusBar() {
      const SB = plugin('StatusBar');
      if (!SB) return;
      try {
        await SB.setStyle({ style: 'DARK' });
        if (platform === 'android') {
          await SB.setOverlaysWebView({ overlay: false });
          await SB.setBackgroundColor({ color: '#1b1236' });
        }
      } catch (e) { /* ignore */ }
    },
  };

  window.Platform = { CONFIG, isNative, platform, Storage, Sound, Music, Haptics, Ads, Store, Lifecycle };
})();
