/*
 * Yum Empire — UI controller. Connects the Engine (pure logic) to the DOM and Platform services.
 */
(function () {
  'use strict';
  const E = window.Engine;
  const P = window.Platform;
  const $ = (id) => document.getElementById(id);
  const money = E.formatMoney;

  let state = E.newState();
  let activeTab = 'biz';
  let lastFrame = performance.now();
  let lastSave = 0;
  let lastSlowUpdate = 0;
  let vipTimer = null;
  let vipHideTimer = null;
  let prices = {};
  let ready = false;
  const W3 = window.World;     // 3D city (may be unavailable on very old devices)
  let use3d = false;
  let sel = 0;                 // business shown in the bottom card
  let sheetOpen = false;       // "all shops" list
  let slowFrames = 0, fastFrames = 0;

  // ---------- Helpers ----------
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }
  function setHTML(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } }
  function toggle(el, cls, on) { if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
  function h(tag, cls, html) { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  const now = () => Date.now();

  function save() {
    state.lastSeen = now();
    P.Storage.save(state);
    lastSave = performance.now();
  }

  function toast(html, ms) {
    const el = h('div', 'toast', html);
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || 2600);
  }

  function floater(text, x, y) {
    const box = $('app').getBoundingClientRect();
    const el = h('div', 'floater');
    el.textContent = text;
    el.style.left = (x - box.left) + 'px';
    el.style.top = (y - box.top) + 'px';
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function feedback(sound, strong) {
    P.Sound.play(sound);
    P.Haptics.tap(strong);
  }

  // ---------- Modal queue ----------
  const modalQueue = [];
  let modalOpen = false;
  function modal(opts) {
    modalQueue.push(opts);
    if (!modalOpen) nextModal();
  }
  function nextModal() {
    const m = modalQueue.shift();
    if (!m) { modalOpen = false; $('modal').hidden = true; return; }
    modalOpen = true;
    $('modalIcon').textContent = m.icon || '';
    $('modalTitle').textContent = m.title || '';
    $('modalBody').innerHTML = m.body || '';
    const actions = $('modalActions');
    actions.innerHTML = '';
    (m.actions || [{ label: 'OK' }]).forEach(a => {
      const b = h('button', 'btn ' + (a.cls || ''), esc(a.label));
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (b.disabled) return;
        actions.querySelectorAll('button').forEach(x => (x.disabled = true));
        P.Sound.play('tap');
        let close = true;
        if (a.onClick) close = (await a.onClick()) !== false;
        if (close) nextModal();
        else actions.querySelectorAll('button').forEach(x => (x.disabled = false));
      });
      actions.appendChild(b);
    });
    $('modal').hidden = false;
  }
  function closeAllModals() { modalQueue.length = 0; nextModal(); }

  // ---------- Rewards gated by ads (or VIP pass) ----------
  async function earnReward() {
    if (state.adsRemoved) return true;
    const ok = await P.Ads.showRewarded();
    if (!ok) toast('Ad not available right now — try again soon.');
    return ok;
  }

  // ---------- Tabs ----------
  function showTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.tabbar button').forEach(b => toggle(b, 'active', b.dataset.tab === tab));
    document.querySelectorAll('.screen').forEach(s => toggle(s, 'active', s.id === 'tab-' + tab));
    if (tab === 'managers') renderManagers();
    if (tab === 'upgrades') renderUpgrades();
    if (tab === 'more') renderMore();
    if (tab === 'franchise') updateFranchise();
  }

  // ---------- Businesses ----------
  const cards = [];
  function buildBusinesses() {
    const list = $('bizList');
    list.innerHTML = '';
    E.BUSINESSES.forEach((b, i) => {
      const el = h('div', 'biz');
      el.innerHTML = `
        <button class="biz-icon" type="button" aria-label="Cook ${esc(b.name)}">${b.emoji}<span class="biz-level">0</span><span class="biz-mgr" hidden>🧑‍🍳</span></button>
        <div class="biz-main">
          <div class="biz-head"><div class="biz-name">${esc(b.name)}</div><div class="biz-time"></div></div>
          <div class="bar"><div class="bar-fill"></div><div class="bar-text"></div></div>
          <div class="ms"><div></div></div>
          <div class="ms-label"></div>
          <button class="buy" type="button"><span class="buy-n">Buy ×1</span><span class="buy-c"></span></button>
        </div>`;
      const c = {
        el, icon: el.querySelector('.biz-icon'), level: el.querySelector('.biz-level'), mgr: el.querySelector('.biz-mgr'),
        time: el.querySelector('.biz-time'), bar: el.querySelector('.bar'), fill: el.querySelector('.bar-fill'),
        barText: el.querySelector('.bar-text'), ms: el.querySelector('.ms > div'), msLabel: el.querySelector('.ms-label'),
        buy: el.querySelector('.buy'), buyN: el.querySelector('.buy-n'), buyC: el.querySelector('.buy-c'),
      };
      c.icon.addEventListener('click', (ev) => onTapBiz(i, ev));
      c.buy.addEventListener('click', () => onBuy(i));
      cards.push(c);
      list.appendChild(el);
    });
    const more = h('div', 'empty');
    more.id = 'bizMore';
    list.appendChild(more);
  }

  function onTapBiz(i, ev) {
    P.Sound.unlock();
    if (state.biz[i].level <= 0) { onBuy(i); return; }
    if (E.tap(state, i)) {
      feedback('tap');
      if (ev && ev.clientX) floater('🔥', ev.clientX, ev.clientY - 20);
    }
  }

  function onBuy(i) {
    P.Sound.unlock();
    const before = E.milestoneInfo(state.biz[i].level).reached;
    const wasOwned = state.biz[i].level > 0;
    const n = E.buy(state, i, state.settings.buyMode);
    if (!n) { feedback('error'); return; }
    const after = E.milestoneInfo(state.biz[i].level);
    if (use3d) W3.pulse(i);
    if (!wasOwned) {
      feedback('milestone', true);
      toast(`${E.BUSINESSES[i].emoji} <b>${esc(E.BUSINESSES[i].name)}</b> is open for business!`);
      if (use3d) { W3.sync(state); selectShop(i, true); W3.burst(...shopWorldPos(i), 36); }
    } else if (after.reached > before) {
      feedback('milestone', true);
      const m = E.MILESTONES[after.reached - 1];
      toast(`🎉 ${esc(E.BUSINESSES[i].name)} level ${m}: <b>${m <= 500 ? '2× speed' : '4× profit'}</b>!`);
    } else feedback('buy');
    onStateChanged();
  }

  // ---------- Selected shop card (3D city view) ----------
  function visibleMax() {
    const firstUnowned = state.biz.findIndex(b => b.level === 0);
    return firstUnowned === -1 ? E.BUSINESSES.length - 1 : firstUnowned;
  }
  function shopWorldPos(i) {
    const s = W3.debug.shops[i];
    return [s.cx, s.h + 1.5, s.cz + 3];
  }
  function selectShop(i, focus) {
    sel = Math.max(0, Math.min(visibleMax(), i));
    if (use3d && focus) W3.focusShop(sel);
    updateShopCard(now());
  }
  function updateShopCard(t) {
    if (!use3d) return;
    const max = visibleMax();
    if (sel > max) sel = max;
    const i = sel, b = state.biz[i], def = E.BUSINESSES[i], owned = b.level > 0;
    setText($('scEmoji'), def.emoji);
    setText($('scLevel'), owned ? String(b.level) : '🔒');
    setText($('scName'), def.name + (b.manager ? ' 🧑‍🍳' : ''));
    const ct = E.cycleTime(state, i);
    const fast = owned && ct < 0.2 && b.running;
    const idle = owned && !b.running && !b.manager;
    toggle($('scBar'), 'fast', fast);
    toggle($('scIcon'), 'idle', idle);
    if (!owned) {
      $('scFill').style.transform = 'scaleX(0)';
      setText($('scBarText'), 'For sale');
      setText($('scTime'), 'Buy this lot to open');
    } else {
      const rev = E.revenuePerCycle(state, i, t);
      if (fast) setText($('scBarText'), money(rev / ct) + ' /s');
      else {
        $('scFill').style.transform = `scaleX(${Math.min(1, b.progress)})`;
        setText($('scBarText'), money(rev));
      }
      setText($('scTime'), idle ? '👆 Tap the shop to serve' : fast ? '⚡ Max speed' : E.formatTime((1 - b.progress) * ct));
    }
    const ms = E.milestoneInfo(b.level);
    $('scMs').style.width = ms.next ? ((b.level - ms.prev) / (ms.next - ms.prev) * 100).toFixed(1) + '%' : '100%';
    setText($('scMsLabel'), ms.next ? `Level ${ms.next}: ${ms.nextReward}` : 'All milestones reached!');
    const n = E.buyAmount(state, i, state.settings.buyMode);
    const cost = E.costFor(i, b.level, n);
    setText($('scBuyN'), owned ? `Buy ×${n}` : `Open ${def.emoji}`);
    setText($('scBuyC'), money(cost));
    const can = cost <= state.cash;
    if ($('scBuy').disabled === can) $('scBuy').disabled = !can;
    const hire = $('scHire');
    const showHire = owned && !b.manager;
    if (hire.hidden === showHire) hire.hidden = !showHire;
    if (showHire) {
      setText(hire, `🧑‍🍳 Hire ${money(def.managerCost)}`);
      const canHire = state.cash >= def.managerCost;
      if (hire.disabled === canHire) hire.disabled = !canHire;
    }
    if ($('scPrev').disabled !== (i <= 0)) $('scPrev').disabled = i <= 0;
    if ($('scNext').disabled !== (i >= max)) $('scNext').disabled = i >= max;
  }
  function setSheet(open) {
    sheetOpen = open;
    $('bizSheet').hidden = !open && use3d;
    // The buy-amount chip lives wherever the player is buying from
    if (use3d) {
      if (open) $('sheetBar').insertBefore($('buyMode'), $('sheetClose'));
      else $('scNext').parentNode.insertBefore($('buyMode'), $('scNext'));
    }
    if (open) updateBusinesses(now());
  }

  function updateBusinesses(t) {
    updateShopCard(t);
    if (use3d && !sheetOpen) return;
    const firstUnowned = state.biz.findIndex(b => b.level === 0);
    const showUpTo = firstUnowned === -1 ? E.BUSINESSES.length - 1 : firstUnowned;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i], b = state.biz[i], def = E.BUSINESSES[i];
      const visible = i <= showUpTo;
      if (c.el.hidden !== !visible) c.el.hidden = !visible;
      if (!visible) continue;
      const owned = b.level > 0;
      toggle(c.el, 'locked', !owned);
      setText(c.level, owned ? String(b.level) : '🔒');
      if (c.mgr.hidden !== !b.manager) c.mgr.hidden = !b.manager;
      const ct = E.cycleTime(state, i);
      const fast = owned && ct < 0.2 && b.running;
      toggle(c.bar, 'fast', fast);
      const idle = owned && !b.running && !b.manager;
      toggle(c.icon, 'idle', idle);
      if (!owned) {
        c.fill.style.transform = 'scaleX(0)';
        setText(c.barText, 'Closed');
        setText(c.time, '');
      } else {
        const rev = E.revenuePerCycle(state, i, t);
        if (fast) setText(c.barText, money(rev / ct) + ' /s');
        else {
          c.fill.style.transform = `scaleX(${Math.min(1, b.progress)})`;
          setText(c.barText, money(rev));
        }
        if (idle) setText(c.time, '👆 Tap to cook');
        else setText(c.time, fast ? '⚡ Max speed' : E.formatTime((1 - b.progress) * ct));
      }
      const ms = E.milestoneInfo(b.level);
      if (ms.next) {
        c.ms.style.width = ((b.level - ms.prev) / (ms.next - ms.prev) * 100).toFixed(1) + '%';
        setText(c.msLabel, `Level ${ms.next}: ${ms.nextReward}`);
      } else {
        c.ms.style.width = '100%';
        setText(c.msLabel, 'All milestones reached!');
      }
      const n = E.buyAmount(state, i, state.settings.buyMode);
      const cost = E.costFor(i, b.level, n);
      setText(c.buyN, owned ? `Buy ×${n}` : `Open ${def.emoji}`);
      setText(c.buyC, money(cost));
      const can = cost <= state.cash;
      if (c.buy.disabled === can) c.buy.disabled = !can;
    }
    const hidden = E.BUSINESSES.length - 1 - showUpTo;
    setText($('bizMore'), hidden > 0 ? `🔒 ${hidden} more business${hidden > 1 ? 'es' : ''} to discover…` : '');
    const gm = E.globalMilestoneInfo(state);
    setText($('globalMilestone'), gm.next ? `All shops level ${gm.next}: 2× profit (${gm.minLevel}/${gm.next})` : 'All global milestones reached!');
  }

  // ---------- Managers ----------
  function renderManagers() {
    const list = $('mgrList');
    list.innerHTML = '';
    E.BUSINESSES.forEach((b, i) => {
      const s = state.biz[i];
      const row = h('div', 'row' + (s.manager ? ' done' : s.level === 0 ? ' locked' : ''));
      row.innerHTML = `<div class="r-icon">🧑‍🍳</div>
        <div class="r-main"><div class="r-title">${esc(b.managerName)}</div>
        <div class="r-sub">Runs your ${b.emoji} ${esc(b.name)} automatically</div></div>`;
      const btn = h('button', 'btn');
      btn.type = 'button';
      if (s.manager) { btn.textContent = 'Hired ✓'; btn.disabled = true; }
      else if (s.level === 0) { btn.textContent = 'Locked'; btn.disabled = true; }
      else {
        btn.textContent = money(b.managerCost);
        btn.dataset.cost = b.managerCost;
        btn.addEventListener('click', () => {
          if (E.hireManager(state, i)) {
            feedback('milestone', true);
            toast(`🧑‍🍳 ${esc(b.managerName)} now runs your ${esc(b.name)}!`);
            onStateChanged();
            renderManagers();
          } else feedback('error');
        });
      }
      row.appendChild(btn);
      list.appendChild(row);
    });
    refreshButtons(list);
  }

  // ---------- Upgrades ----------
  function renderUpgrades() {
    const list = $('upgList');
    list.innerHTML = '';
    const avail = E.availableUpgrades(state).slice(0, 20);
    if (!avail.length) { list.appendChild(h('div', 'empty', '🎉 Every upgrade purchased!')); return; }
    avail.forEach(u => {
      const row = h('div', 'row');
      row.innerHTML = `<div class="r-icon">${u.emoji}</div>
        <div class="r-main"><div class="r-title">${esc(u.name)}</div>
        <div class="r-sub">${esc(u.target)} profit ×${u.mult}</div></div>`;
      const btn = h('button', 'btn', money(u.cost));
      btn.type = 'button';
      btn.dataset.cost = u.cost;
      btn.addEventListener('click', () => {
        if (E.buyUpgrade(state, u.id)) {
          feedback('milestone', true);
          toast(`⚡ <b>${esc(u.name)}</b>: ${esc(u.target)} ×${u.mult}!`);
          onStateChanged();
          renderUpgrades();
        } else feedback('error');
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
    refreshButtons(list);
  }

  function refreshButtons(root) {
    root.querySelectorAll('button[data-cost]').forEach(b => {
      const can = state.cash >= parseFloat(b.dataset.cost);
      if (b.disabled === can) b.disabled = !can;
    });
  }

  // ---------- Franchise ----------
  function updateFranchise() {
    const claim = E.claimableStars(state);
    setText($('starPct'), `+${Math.round(E.STAR_BONUS * 100)}%`);
    setText($('starsOwned'), E.formatNumber(state.stars));
    setText($('starsBonus'), `+${E.formatNumber(state.stars * E.STAR_BONUS * 100)}%`);
    setText($('starsClaim'), '+' + E.formatNumber(claim));
    setText($('starsNext'), money(E.nextStarAt(state)) + ' earned');
    const btn = $('prestigeBtn');
    if (btn.disabled === claim >= 1) btn.disabled = claim < 1;
    setText(btn, claim >= 1 ? `Franchise for ⭐ ${E.formatNumber(claim)}` : 'Earn more to franchise');
  }

  function onPrestige() {
    const claim = E.claimableStars(state);
    if (claim < 1) return;
    const newBonus = (state.stars + claim) * E.STAR_BONUS * 100;
    modal({
      icon: '⭐', title: 'Franchise your empire?',
      body: `<p>You'll receive</p><div class="amount">⭐ ${E.formatNumber(claim)}</div>
             <p>Total profit bonus becomes <b>+${E.formatNumber(newBonus)}%</b>.<br>Your businesses, managers and upgrades will reset.</p>`,
      actions: [
        { label: 'Franchise!', cls: 'btn-gold', onClick: () => {
          const gain = E.prestige(state);
          feedback('prestige', true);
          E.checkAchievements(state);
          save();
          onStateChanged();
          showTab('biz');
          if (use3d) { setSheet(false); selectShop(0, true); W3.intro(); }
          toast(`⭐ +${E.formatNumber(gain)} Golden Stars! A fresh start awaits.`, 3500);
        } },
        { label: 'Not yet', cls: 'btn-ghost' },
      ],
    });
  }

  // ---------- More tab ----------
  function renderMore() {
    // Shop
    const shop = $('shopList');
    shop.innerHTML = '';
    const boostRow = h('div', 'row');
    boostRow.innerHTML = `<div class="r-icon">🚀</div><div class="r-main"><div class="r-title">2× Profit for 4 hours</div><div class="r-sub">${state.adsRemoved ? 'Free with VIP Pass' : 'Watch a short video'} · stacks up to 24h</div></div>`;
    const bb = h('button', 'btn btn-purple', state.adsRemoved ? 'Claim' : '📺 Watch');
    bb.type = 'button';
    bb.addEventListener('click', onBoost);
    boostRow.appendChild(bb);
    shop.appendChild(boostRow);

    const iap = [
      { id: P.CONFIG.products.premium, icon: '💎', title: 'Permanent 2× Profit', sub: 'Doubles all profits forever — even after franchising', owned: state.premium },
      { id: P.CONFIG.products.vipPass, icon: '🎟️', title: 'VIP Pass', sub: 'Get every video reward instantly, no ads', owned: state.adsRemoved },
    ];
    iap.forEach(item => {
      const row = h('div', 'row' + (item.owned ? ' done' : ''));
      row.innerHTML = `<div class="r-icon">${item.icon}</div><div class="r-main"><div class="r-title">${esc(item.title)}</div><div class="r-sub">${esc(item.sub)}</div></div>`;
      const b = h('button', 'btn btn-gold');
      b.type = 'button';
      if (item.owned) { b.textContent = 'Owned ✓'; b.disabled = true; }
      else if (!P.Store.available) { b.textContent = 'In app'; b.disabled = true; }
      else {
        b.textContent = prices[item.id] || 'Buy';
        b.addEventListener('click', async () => {
          b.disabled = true;
          const owned = await P.Store.buy(item.id);
          b.disabled = false;
          if (owned) applyPurchases(owned, true);
        });
      }
      row.appendChild(b);
      shop.appendChild(row);
    });
    if (P.Store.available) {
      const r = h('button', 'btn btn-ghost', 'Restore purchases');
      r.type = 'button';
      r.addEventListener('click', async () => {
        const owned = await P.Store.restore();
        if (owned) { applyPurchases(owned, true); toast('Purchases restored.'); } else toast('Nothing to restore.');
      });
      shop.appendChild(r);
    }

    // Achievements
    const grid = $('achList');
    grid.innerHTML = '';
    E.ACHIEVEMENTS.forEach(a => {
      const got = !!state.achievements[a.id];
      const el = h('div', 'ach' + (got ? ' got' : ''), a.emoji);
      el.title = `${a.name} — ${a.desc}`;
      el.addEventListener('click', () => toast(`${a.emoji} <b>${esc(a.name)}</b><br>${esc(a.desc)}${got ? ' ✓' : ''}`));
      grid.appendChild(el);
    });
    setText($('achCount'), `${E.achievementCount(state)}/${E.ACHIEVEMENTS.length} · +${Math.round(E.achievementCount(state) * E.ACHIEVEMENT_BONUS * 100)}% profit`);
    renderStats();
    $('setSound').checked = state.settings.sound;
    $('setHaptics').checked = state.settings.haptics;
    document.getElementById('setLens').checked = state.settings.lens !== false;
    document.getElementById('setLens').closest('label').hidden = !use3d;
  }

  function renderStats() {
    const rows = [
      ['Cash earned (this franchise)', money(state.runEarnings)],
      ['Cash earned (all time)', money(state.lifetime)],
      ['Best franchise', money(state.stats.bestRun)],
      ['Times franchised', E.formatNumber(state.prestiges)],
      ['Golden Stars', E.formatNumber(state.stars)],
      ['Total profit multiplier', '×' + E.formatNumber(E.permanentMult(state))],
      ['VIP customers served', E.formatNumber(state.stats.golden)],
      ['Meals cooked by hand', E.formatNumber(state.stats.taps)],
      ['Time played', E.formatTime(state.stats.playTime)],
      ['Daily streak', state.daily.streak + ' day' + (state.daily.streak === 1 ? '' : 's')],
    ];
    setHTML($('statsList'), rows.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join(''));
  }

  function applyPurchases(owned, announce) {
    let changed = false;
    if (owned.includes(P.CONFIG.products.premium) && !state.premium) { state.premium = true; changed = true; if (announce) toast('💎 Permanent 2× profit unlocked!'); }
    if (owned.includes(P.CONFIG.products.vipPass) && !state.adsRemoved) { state.adsRemoved = true; changed = true; if (announce) toast('🎟️ VIP Pass active — no more ads!'); }
    if (changed) { save(); onStateChanged(); if (activeTab === 'more') renderMore(); }
  }

  // ---------- Boost ----------
  async function onBoost() {
    P.Sound.unlock();
    const remaining = state.boostUntil - now();
    if (remaining > 20 * 3600 * 1000) { toast('Boost is already almost full (max 24h).'); return; }
    if (!(await earnReward())) return;
    E.addBoost(state, now());
    feedback('milestone', true);
    toast('🚀 <b>2× profit</b> active!');
    save();
  }

  function updateTopbar(t) {
    setText($('cash'), money(state.cash));
    const ips = E.incomePerSec(state, t, { managedOnly: true });
    setText($('ips'), ips > 0 ? money(ips) + ' / sec' : 'Hire managers to earn while idle');
    const btn = $('boostBtn');
    const left = state.boostUntil - t;
    toggle(btn, 'active', left > 0);
    setText($('boostLabel'), left > 0 ? '2× ' + E.formatTime(left / 1000) : (state.adsRemoved ? '2× Free' : '2× Profit'));

    let pills = '';
    if (state.frenzyUntil > t) pills += `<span class="pill frenzy">🤩 VIP Frenzy ×${E.FRENZY_MULT} · ${Math.ceil((state.frenzyUntil - t) / 1000)}s</span>`;
    if (state.stars > 0) pills += `<span class="pill">⭐ +${E.formatNumber(state.stars * E.STAR_BONUS * 100)}%</span>`;
    if (state.premium) pills += '<span class="pill">💎 ×2</span>';
    const tip = tutorialTip();
    if (tip) pills += `<span class="pill">${tip}</span>`;
    setHTML($('statusRow'), pills);
  }

  function tutorialTip() {
    if (state.prestiges > 0) return '';
    if (state.stats.taps === 0) return use3d ? '👆 Tap your noodle cart to serve customers!' : '👆 Tap the noodle bowl to cook!';
    const anyMgr = state.biz.some(b => b.manager);
    if (!anyMgr) {
      if (state.cash >= E.BUSINESSES[0].managerCost) return '🧑‍🍳 Hire a manager in the Managers tab!';
      if (state.biz[0].level < 5) return '🛒 Buy more carts to earn faster';
      return '💡 Save up to hire a manager';
    }
    if (state.biz[1].level === 0) return '🥟 Save up for a Dumpling Stand!';
    return '';
  }

  function updateBadges() {
    const mgr = state.biz.filter((b, i) => !b.manager && b.level > 0 && state.cash >= E.BUSINESSES[i].managerCost).length;
    const upg = E.availableUpgrades(state).filter(u => u.cost <= state.cash).length;
    const claim = E.claimableStars(state);
    const fr = claim >= Math.max(10, state.stars);
    const daily = E.dailyStatus(state, now()).available;
    setBadge('managers', mgr ? String(mgr) : '');
    setBadge('upgrades', upg ? String(Math.min(upg, 99)) : '');
    setBadge('franchise', fr ? '!' : '');
    setBadge('more', daily ? '🎁' : '');
  }
  function setBadge(id, txt) {
    const b = $('badge-' + id);
    setText(b, txt);
    toggle(b, 'show', !!txt);
  }

  // ---------- VIP customers ----------
  function scheduleVip(first) {
    clearTimeout(vipTimer);
    const delay = first ? 25000 : 45000 + Math.random() * 75000;
    vipTimer = setTimeout(spawnVip, delay);
  }
  function spawnVip() {
    if (document.hidden || modalOpen || state.biz[0].level === 0) { scheduleVip(); return; }
    if (use3d) {
      // In the city the VIP is a golden visitor walking near your shop — tap them!
      if (activeTab !== 'biz' || sheetOpen || !W3.spawnVip(sel)) { scheduleVip(); return; }
      toast('🤩 A <b>VIP</b> is in town — find the golden visitor and tap them!', 3500);
      P.Sound.play('vip');
      return;
    }
    const vip = $('vip');
    const box = $('screens').getBoundingClientRect();
    const app = $('app').getBoundingClientRect();
    const x = 20 + Math.random() * Math.max(10, box.width - 110);
    const y = box.top - app.top + 30 + Math.random() * Math.max(10, box.height - 140);
    vip.style.left = x + 'px';
    vip.style.top = y + 'px';
    vip.hidden = false;
    clearTimeout(vipHideTimer);
    vipHideTimer = setTimeout(() => { vip.hidden = true; scheduleVip(); }, 9000);
  }
  function onVip(ev) {
    const vip = $('vip');
    if (vip.hidden) return;
    vip.hidden = true;
    clearTimeout(vipHideTimer);
    claimVip(ev.clientX, ev.clientY);
  }
  function claimVip(x, y) {
    const ev = { clientX: x, clientY: y };
    P.Sound.unlock();
    const r = E.vipReward(state, now());
    feedback('vip', true);
    if (r.type === 'frenzy') toast(`🤩 <b>VIP Frenzy!</b> ×${r.mult} profit for ${r.seconds}s!`, 3000);
    else {
      toast(`🤩 A VIP tipped you <b>${money(r.amount)}</b>!`, 3000);
      floater('+' + money(r.amount), ev.clientX, ev.clientY);
    }
    onStateChanged();
    scheduleVip();
  }

  // ---------- Offline & daily ----------
  function handleAway() {
    const t = now();
    const off = E.computeOffline(state, t);
    state.lastSeen = t;
    if (off.amount <= 0) return;
    const base = off.amount;
    modal({
      icon: '🌙', title: 'Welcome back!',
      body: `<p>Your managers kept cooking for ${E.formatTime(off.seconds)}${off.seconds >= E.OFFLINE_CAP_SEC ? ' (max)' : ''}.</p><div class="amount">${money(base)}</div>`,
      actions: [
        { label: state.adsRemoved ? `Collect 2× (${money(base * 2)})` : `📺 Collect 2× (${money(base * 2)})`, cls: 'btn-purple', onClick: async () => {
          const ok = await earnReward();
          E.earn(state, ok ? base * 2 : base);
          feedback('coin', true);
          save();
        } },
        { label: 'Collect', onClick: () => { E.earn(state, base); feedback('coin'); save(); } },
      ],
    });
  }

  function maybeDaily() {
    const d = E.dailyStatus(state, now());
    if (!d.available) return;
    const days = Array.from({ length: 7 }, (_, k) => `<div class="${k < d.day ? 'on' : ''}">${k === 6 ? '🚀' : 'Day ' + (k + 1)}</div>`).join('');
    modal({
      icon: '🎁', title: `Daily reward — day ${d.day}`,
      body: `<p>Come back every day for bigger rewards. Day 7 includes a free 4h 2× boost!</p><div class="days">${days}</div><div class="amount">${money(d.amount)}</div>`,
      actions: [{ label: 'Claim', cls: 'btn-gold', onClick: () => {
        const r = E.claimDaily(state, now());
        if (r) { feedback('vip', true); toast(`🎁 +${money(r.amount)}${r.day === 7 ? ' and a 4h 2× boost!' : ''}`); }
        save();
        updateBadges();
      } }],
    });
  }

  // ---------- Main loop ----------
  function onStateChanged() {
    const t = now();
    if (use3d) W3.sync(state);
    updateBusinesses(t);
    updateTopbar(t);
    updateBadges();
    if (activeTab === 'franchise') updateFranchise();
  }

  // The city view: tap a shop to serve its customer, or to select it.
  function onPickShop(i) {
    P.Sound.unlock();
    if (i > visibleMax()) { toast('🔒 Open your other shops first to unlock this lot.'); feedback('error'); return; }
    const b = state.biz[i];
    if (b.level > 0 && !b.manager && !b.running) {
      if (E.tap(state, i)) feedback('tap');
      if (sel !== i) selectShop(i, false);
      return;
    }
    if (sel === i && b.level === 0) { onBuy(i); return; }
    feedback('tap');
    selectShop(i, true);
  }

  // Drop detail automatically if the device struggles, so the game stays smooth.
  function watchPerformance(rawDt) {
    if (rawDt > 0.045) slowFrames++; else fastFrames++;
    if (slowFrames + fastFrames < 150) return;
    if (slowFrames > 90 && W3.getQuality() < 2) W3.setQuality(W3.getQuality() + 1);
    slowFrames = fastFrames = 0;
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!ready) return;
    const t = now();
    // Large gaps (app was backgrounded) are paid out as offline earnings instead.
    if (t - state.lastSeen > 5000) handleAway();
    state.lastSeen = t;
    const rawDt = (ts - lastFrame) / 1000;
    const dt = Math.min(0.25, Math.max(0, rawDt));
    lastFrame = ts;
    const earned = E.tick(state, dt, t);

    if (use3d && activeTab === 'biz') {
      // Floating "+$" over each shop in the city
      if (!sheetOpen) for (let i = 0; i < earned.length; i++) {
        if (earned[i] <= 0) continue;
        const ct = E.cycleTime(state, i);
        if (ct < 0.5) continue;
        const p = W3.shopScreenPos(i);
        if (p) floater('+' + money(earned[i]), p.x, p.y);
        if (!state.biz[i].manager || ct >= 3) P.Sound.play('coin');
      }
      W3.update(dt, state, earned, t);
      W3.render();
      watchPerformance(rawDt);
      updateBusinesses(t);
    } else if (activeTab === 'biz') {
      for (let i = 0; i < earned.length; i++) {
        if (earned[i] <= 0) continue;
        const ct = E.cycleTime(state, i);
        if (ct >= 0.5 && !cards[i].el.hidden) {
          const r = cards[i].bar.getBoundingClientRect();
          floater('+' + money(earned[i]), r.left + r.width / 2, r.top);
          if (!state.biz[i].manager || ct >= 3) P.Sound.play('coin');
        }
      }
      updateBusinesses(t);
    }
    updateTopbar(t);

    if (ts - lastSlowUpdate > 400) {
      lastSlowUpdate = ts;
      updateBadges();
      if (activeTab === 'managers') refreshButtons($('mgrList'));
      if (activeTab === 'upgrades') refreshButtons($('upgList'));
      if (activeTab === 'franchise') updateFranchise();
      if (activeTab === 'more') renderStats();
      for (const a of E.checkAchievements(state)) {
        feedback('milestone', true);
        toast(`🏆 <b>${esc(a.name)}</b> unlocked! +${Math.round(E.ACHIEVEMENT_BONUS * 100)}% profit`, 3200);
      }
    }
    if (ts - lastSave > 5000) save();
  }

  // ---------- Wiring ----------
  function wire() {
    document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
      P.Sound.unlock();
      P.Sound.play('tap');
      P.Haptics.tap();
      showTab(b.dataset.tab);
      if (b.dataset.tab === 'more') maybeDaily();
    }));
    $('buyMode').addEventListener('click', () => {
      state.settings.buyMode = (state.settings.buyMode + 1) % E.BUY_MODES.length;
      setText($('buyMode'), 'Buy ' + E.BUY_MODES[state.settings.buyMode]);
      feedback('tap');
      onStateChanged();
    });
    setText($('buyMode'), 'Buy ' + E.BUY_MODES[state.settings.buyMode]);
    $('boostBtn').addEventListener('click', onBoost);
    $('prestigeBtn').addEventListener('click', onPrestige);
    $('vip').addEventListener('click', onVip);
    $('setSound').addEventListener('change', (e) => { state.settings.sound = P.Sound.enabled = e.target.checked; save(); });
    $('setHaptics').addEventListener('change', (e) => { state.settings.haptics = P.Haptics.enabled = e.target.checked; save(); });
    $('resetBtn').addEventListener('click', () => modal({
      icon: '⚠️', title: 'Delete your save?',
      body: '<p>This erases <b>everything</b>, including Golden Stars and achievements. Purchases can be restored from the Shop.</p>',
      actions: [
        { label: 'Delete everything', cls: 'btn-ghost danger', onClick: () => {
          const keep = { premium: state.premium, adsRemoved: state.adsRemoved };
          P.Storage.clear();
          state = E.newState();
          Object.assign(state, keep);
          save();
          onStateChanged();
          showTab('biz');
          if (use3d) { setSheet(false); selectShop(0, true); W3.intro(); }
        } },
        { label: 'Cancel' },
      ],
    }));
    setText($('ver'), P.CONFIG.version);

    // Shop card + list panel (3D city view)
    $('scPrev').addEventListener('click', () => { feedback('tap'); selectShop(sel - 1, true); });
    $('scNext').addEventListener('click', () => { feedback('tap'); selectShop(sel + 1, true); });
    $('scIcon').addEventListener('click', (ev) => { onTapBiz(sel, ev); if (use3d) W3.focusShop(sel); });
    $('scBuy').addEventListener('click', () => onBuy(sel));
    $('scHire').addEventListener('click', () => {
      const def = E.BUSINESSES[sel];
      if (E.hireManager(state, sel)) {
        feedback('milestone', true);
        toast(`🧑‍🍳 ${esc(def.managerName)} now runs your ${esc(def.name)}!`);
        onStateChanged();
      } else feedback('error');
    });
    $('listBtn').addEventListener('click', () => { feedback('tap'); setSheet(true); });
    $('sheetClose').addEventListener('click', () => { feedback('tap'); setSheet(false); });
    $('setLens').addEventListener('change', (e) => { state.settings.lens = e.target.checked; if (use3d) W3.setLens(state.settings.lens); save(); });

    P.Lifecycle.onPause(save);
    P.Lifecycle.onResume(() => { lastFrame = performance.now(); });

    // Android hardware back button: close modal → go to first tab → minimize.
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) App.addListener('backButton', () => {
      if (modalOpen) return; // modals require an explicit choice
      if (activeTab !== 'biz') showTab('biz');
      else if (App.minimizeApp) App.minimizeApp();
    });
  }

  async function boot() {
    const raw = await P.Storage.load();
    const isNew = !raw;
    state = E.loadState(raw, now());
    P.Sound.enabled = state.settings.sound;
    P.Haptics.enabled = state.settings.haptics;
    buildBusinesses();
    // Start the 3D city. If the device can't do WebGL, fall back to the classic list view.
    try { use3d = !!(W3 && W3.init && W3.init($('city'), { onPickShop, onPickVip: (x, y) => claimVip(x, y), onVipGone: () => scheduleVip() })); }
    catch (e) { console.warn('3D city unavailable', e); use3d = false; }
    document.body.classList.add(use3d ? 'has3d' : 'no3d');
    if (!use3d) $('sheetBar').appendChild($('buyMode'));
    wire();
    if (use3d) {
      W3.setLens(state.settings.lens);
      W3.sync(state, true);
      sel = 0;
      W3.focusShop(sel, true);
      if (isNew) W3.intro();
    }
    setSheet(false);
    onStateChanged();
    ready = true;
    lastFrame = performance.now();

    if (isNew) {
      modal({
        icon: '🍜', title: 'Welcome to Yum Empire!',
        body: '<p>You own one tiny noodle cart in the middle of the city. Serve customers, buy more shops, hire managers and grow a <b>global food empire</b>!</p><p>Drag to move around · pinch to zoom · twist to rotate</p>',
        actions: [{ label: "Let's cook!", cls: 'btn-gold', onClick: () => { P.Sound.unlock(); } }],
      });
    } else {
      handleAway();
      maybeDaily();
    }
    scheduleVip(true);
    P.Lifecycle.styleStatusBar();
    P.Lifecycle.hideSplash();
    await Promise.all([P.Ads.init(), P.Store.init()]);
    if (P.Store.available) {
      prices = await P.Store.prices();
      const owned = await P.Store.owned();
      if (owned) applyPurchases(owned, false);
    }
    requestAnimationFrame(frame);
  }

  if ('serviceWorker' in navigator && !P.isNative && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Exposed for automated tests / debugging.
  window.YumEmpire = { get state() { return state; }, save, showTab, selectShop, setSheet, get use3d() { return use3d; }, sync: () => onStateChanged() };

  boot();
})();
