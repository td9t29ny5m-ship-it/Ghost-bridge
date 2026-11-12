/*
 * Yum Empire — game controller. Connects the Engine (rules), the World (3D) and the interface.
 */
(function () {
  'use strict';
  const E = window.Engine, P = window.Platform, W3 = window.World;
  const $ = (id) => document.getElementById(id);
  const money = E.formatMoney, num = E.formatNumber;
  const now = () => Date.now();

  let state = E.newState();
  let use3d = false, ready = false;
  let sel = 0;                       // selected plot in the current district
  let panel = null, panelArg = null; // open pop-up window
  let lastFrame = performance.now(), lastSave = 0, lastSlow = 0;
  let vipTimer = null, vipHideTimer = null, prices = {};
  let slowFrames = 0, fastFrames = 0, cardKey = '';
  const D = () => state.district;
  const DIST_COLORS = [['#46c46e', '#1d7a4c'], ['#4aa3ee', '#1f55a8'], ['#9a6cf5', '#4527a8'], ['#f0509c', '#3a1a6b']];

  // ---------- Small helpers ----------
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }
  function toggle(el, cls, on) { if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
  function h(tag, cls, html) { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function save() { state.lastSeen = now(); P.Storage.save(state); lastSave = performance.now(); }
  function toast(html, ms) {
    const el = h('div', 'toast', html);
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || 2600);
  }
  function floater(text, x, y, cls) {
    const box = $('app').getBoundingClientRect();
    const el = h('div', 'floater' + (cls ? ' ' + cls : ''));
    el.textContent = text;
    el.style.left = (x - box.left) + 'px';
    el.style.top = (y - box.top) + 'px';
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function feedback(sound, strong) { P.Sound.play(sound); P.Haptics.tap(strong); }
  const plot = (d, p) => state.plots[d][p];
  const kindOf = (x) => (!x ? 'sale' : x.t < 0 ? 'empty' : 'shop');
  const sizeOf = (d, p) => E.SIZES[E.DISTRICTS[d].plots[p].size];
  const shopRate = (d, p, t) => E.revenuePerCycle(state, d, p, t) / E.cycleTime(state, d, p);
  const chefLabel = (m, type) => `+${Math.round(E.staffBonus(m, type) * 100)}%`;

  // ---------- Modal queue (rewards, welcome, confirmations) ----------
  const modalQueue = [];
  let modalOpen = false;
  function modal(opts) { modalQueue.push(opts); if (!modalOpen) nextModal(); }
  function nextModal() {
    const m = modalQueue.shift();
    if (!m) { modalOpen = false; $('modal').hidden = true; return; }
    modalOpen = true;
    $('modalIcon').textContent = m.icon || '';
    $('modalTitle').textContent = m.title || '';
    $('modalBody').innerHTML = m.body || '';
    const actions = $('modalActions');
    actions.innerHTML = '';
    (m.actions || [{ label: 'OK', cls: 'gold' }]).forEach(a => {
      const b = h('button', 'btn ' + (a.cls || ''), esc(a.label));
      b.type = 'button';
      b.addEventListener('click', async () => {
        if (b.disabled) return;
        actions.querySelectorAll('button').forEach(x => (x.disabled = true));
        P.Sound.unlock();
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

  // Rewards gated by a video (or free with the VIP Pass)
  async function earnReward() {
    if (state.adsRemoved) return true;
    const ok = await P.Ads.showRewarded();
    if (!ok) toast('No video available right now — try again soon.');
    return ok;
  }

  // ---------- After anything changes ----------
  function celebrateLevelUps() {
    const ups = E.takeLevelUps(state);
    if (!ups) return;
    feedback('prestige', true);
    toast(`🎖️ <b>LEVEL ${state.level}!</b> +${5 * ups} 💎 and +${Math.round(E.LEVEL_BONUS * 100 * ups)}% profit`, 3600);
    if (use3d) { const s = W3.debug.shops[sel]; if (s) W3.burst(s.cx, s.h + 2, s.cz + 3, 50); }
  }
  function onStateChanged() {
    celebrateLevelUps();
    if (use3d) W3.sync(state);
    renderCard();
    updateHud(now());
    updateBadges();
    if (panel) renderPanel();
  }

  // ---------- Selected plot card ----------
  function selectPlot(p, focus) {
    const n = E.DISTRICTS[D()].plots.length;
    sel = ((p % n) + n) % n;
    if (use3d && focus) W3.focusPlot(sel);
    renderCard();
  }
  function renderCard() {
    const d = D(), x = plot(d, sel), kind = kindOf(x), size = sizeOf(d, sel), dist = E.DISTRICTS[d];
    // Bigger land = bigger building: once a shop outgrows its plot, say so.
    const TIER_AT = [25, 100, 300, 500];
    const capped = kind === 'shop' && size.maxTier < 4 && x.level >= TIER_AT[size.maxTier];
    const key = [d, sel, kind, x && x.t, x && x.manager, x && x.chef, x && x.chef && E.staffById(state, x.chef) && E.staffById(state, x.chef).level, capped].join(':');
    if (key !== cardKey) {
      cardKey = key;
      const nav = (inner) => `<div class="c-head"><button class="c-nav" type="button" data-act="prev" aria-label="Previous plot">◀</button>${inner}<button class="c-nav" type="button" data-act="next" aria-label="Next plot">▶</button></div>`;
      const sizeTag = `<span class="tag s${dist.plots[sel].size}">${size.name} land${capped ? ' · max size' : ''}</span>`;
      let html;
      if (kind === 'shop') {
        const def = E.TYPES[x.t], chef = E.staffById(state, x.chef);
        html = nav(`<button class="c-icon" id="cIcon" type="button" data-act="serve" aria-label="Serve">${def.emoji}<span class="lv" id="cLv"></span></button>
            <div class="c-title"><div class="c-name">${esc(def.name)}${x.manager ? ' 🧑‍💼' : ''}</div><div class="c-sub">${sizeTag}<span id="cSub"></span></div></div>`) +
          `<div class="bar" id="cBar"><div class="bar-fill" id="cFill"></div><div class="bar-text" id="cBarText"></div></div>
           <div class="ms-row"><div class="ms"><div id="cMs"></div></div><span id="cMsLabel"></span></div>
           <div class="c-row">
             ${x.manager ? '' : `<button class="btn blue two" type="button" data-act="hire" id="cHire">🧑‍💼 Manager<span class="sub">${money(def.managerCost)} · runs it for you</span></button>`}
             <button class="chef-slot" type="button" data-act="chef"><span class="f">${chef ? chef.face : '➕'}</span><span><b>${chef ? esc(chef.name) + ' ' + chefLabel(chef, x.t) : 'Add a chef'}</b>${chef ? 'Tap to change' : 'Boosts profit'}</span></button>
           </div>
           <div class="c-row">
             <button class="btn ghost fit" type="button" data-act="mode" id="cMode"></button>
             <button class="btn big two" type="button" data-act="upgrade" id="cBuy"><span id="cBuyN"></span><span class="sub" id="cBuyC"></span></button>
           </div>`;
      } else if (kind === 'sale') {
        const allowed = E.TYPES.filter((t, i) => E.canBuildOn(d, sel, i)).map(t => t.emoji).join(' ');
        html = nav(`<div class="c-icon">📜</div><div class="c-title"><div class="c-name">Land for sale</div><div class="c-sub">${sizeTag}${esc(dist.name)}</div></div>`) +
          `<div class="c-info">Bigger land holds bigger, better shops.<br>You can build: ${allowed}</div>
           <button class="btn gold big wide two" type="button" data-act="buyLand" id="cBuy">BUY THIS LAND<span class="sub">${dist.plots[sel].price > 0 ? money(dist.plots[sel].price) : 'Free'}</span></button>`;
      } else {
        html = nav(`<div class="c-icon">🏗️</div><div class="c-title"><div class="c-name">Your empty land</div><div class="c-sub">${sizeTag}${esc(dist.name)}</div></div>`) +
          `<div class="c-info">Choose what to build. Every new shop opens as a small stall and grows as you level it up.</div>
           <button class="btn big wide" type="button" data-act="build">🏗️ BUILD A SHOP</button>`;
      }
      $('shopCard').innerHTML = html;
    }
    updateCard(now());
  }
  function updateCard(t) {
    const d = D(), x = plot(d, sel), kind = kindOf(x);
    if (kind === 'shop') {
      const ct = E.cycleTime(state, d, sel), rev = E.revenuePerCycle(state, d, sel, t);
      const fast = ct < 0.2 && x.running, idle = !x.running && !x.manager;
      setText($('cLv'), 'Lv ' + x.level);
      toggle($('cBar'), 'fast', fast);
      toggle($('cIcon'), 'idle', idle);
      if (fast) setText($('cBarText'), money(rev / ct) + ' /s');
      else { $('cFill').style.transform = `scaleX(${Math.min(1, x.progress)})`; setText($('cBarText'), money(rev)); }
      setText($('cSub'), idle ? '👆 Tap the shop to serve' : fast ? '⚡ Max speed' : E.formatTime((1 - x.progress) * ct));
      const ms = E.milestoneInfo(x.level);
      $('cMs').style.width = ms.next ? ((x.level - ms.prev) / (ms.next - ms.prev) * 100).toFixed(1) + '%' : '100%';
      setText($('cMsLabel'), ms.next ? `Lv ${ms.next}: ${ms.nextReward}` : 'All milestones!');
      const n = E.buyAmount(state, d, sel, state.settings.buyMode), cost = E.costFor(x.t, x.level, n);
      setText($('cMode'), E.BUY_MODES[state.settings.buyMode]);
      setText($('cBuyN'), `⬆️ UPGRADE ×${n}`);
      setText($('cBuyC'), money(cost));
      if ($('cBuy').disabled === (cost <= state.cash)) $('cBuy').disabled = cost > state.cash;
      const hire = $('cHire');
      if (hire && hire.disabled === (state.cash >= E.TYPES[x.t].managerCost)) hire.disabled = state.cash < E.TYPES[x.t].managerCost;
    } else if (kind === 'sale') {
      const can = state.cash >= E.landPrice(d, sel);
      if ($('cBuy') && $('cBuy').disabled === can) $('cBuy').disabled = !can;
    }
  }

  // ---------- Actions on the selected plot ----------
  function serve(p, ev) {
    P.Sound.unlock();
    if (E.tap(state, D(), p)) {
      feedback('tap');
      if (ev && ev.clientX) floater('🔥', ev.clientX, ev.clientY - 20);
    }
  }
  function doUpgrade(d, p) {
    P.Sound.unlock();
    const x = E.shopAt(state, d, p);
    if (!x) return;
    const before = E.milestoneInfo(x.level).reached, empBefore = E.empireInfo(state).reached;
    const n = E.buy(state, d, p, state.settings.buyMode);
    if (!n) { feedback('error'); return; }
    if (use3d && d === D()) W3.pulse(p);
    const after = E.milestoneInfo(x.level);
    if (after.reached > before) {
      feedback('milestone', true);
      const m = E.MILESTONES[after.reached - 1];
      toast(`🎉 ${esc(E.TYPES[x.t].name)} level ${m}: <b>${m <= 500 ? '2× speed' : '4× profit'}</b>!`);
    } else feedback('buy');
    if (E.empireInfo(state).reached > empBefore) toast('🏆 <b>Empire milestone!</b> All profits doubled!', 3400);
    onStateChanged();
  }
  function onPickPlot(p) {
    P.Sound.unlock();
    const x = plot(D(), p);
    if (kindOf(x) === 'shop' && !x.manager && !x.running) {
      if (E.tap(state, D(), p)) feedback('tap');
      if (sel !== p) selectPlot(p, false);
      return;
    }
    feedback('tap');
    if (sel === p && kindOf(x) === 'sale') { ACT.buyLand(); return; }
    if (sel === p && kindOf(x) === 'empty') { openPanel('build', p); return; }
    selectPlot(p, true);
  }
  function goDistrict(d, sweep) {
    if (!state.districts[d]) return;
    state.district = d;
    if (use3d) W3.loadDistrict(d, state);
    const first = state.plots[d].findIndex(x => E.isShop(x));
    sel = first >= 0 ? first : 0;
    cardKey = '';
    closePanel();
    if (use3d) { W3.focusPlot(sel, true); if (sweep) W3.intro(); }
    onStateChanged();
    save();
  }

  // ---------- Pop-up windows ----------
  const PANELS = {
    quests: { icon: '📜', title: 'Quests', render: renderQuests },
    shops: { icon: '🏪', title: 'Your Shops', render: renderShops },
    awards: { icon: '🏆', title: 'Awards', render: renderAwards },
    store: { icon: '🛍️', title: 'Store', render: renderStore },
    staff: { icon: '👩‍🍳', title: 'Chefs', render: renderStaff },
    research: { icon: '🔬', title: 'Research', render: renderResearch },
    world: { icon: '🗺️', title: 'World Map', render: renderWorld },
    franchise: { icon: '⭐', title: 'Franchise', render: renderFranchise },
    build: { icon: '🏗️', title: 'Build a Shop', render: renderBuild },
    profile: { icon: '🧑‍🍳', title: 'Profile', render: renderProfile },
  };
  function openPanel(name, arg) {
    panel = name; panelArg = arg === undefined ? null : arg;
    $('panelIcon').textContent = PANELS[name].icon;
    $('panelTitle').textContent = PANELS[name].title;
    $('panel').hidden = false;
    $('panelBody').scrollTop = 0;
    renderPanel();
    document.querySelectorAll('.nav button[data-panel]').forEach(b => toggle(b, 'on', b.dataset.panel === name));
    if (name === 'profile' || name === 'store') maybeDaily();
  }
  function closePanel() {
    panel = null;
    $('panel').hidden = true;
    document.querySelectorAll('.nav button[data-panel]').forEach(b => toggle(b, 'on', false));
  }
  function renderPanel() {
    if (!panel) return;
    const body = $('panelBody'), top = body.scrollTop;
    body.innerHTML = PANELS[panel].render(now());
    body.scrollTop = top;
    refreshButtons(body);
  }
  function refreshButtons(root) {
    root.querySelectorAll('button[data-cost],button[data-gems]').forEach(b => {
      const can = b.dataset.cost !== undefined ? state.cash >= parseFloat(b.dataset.cost) : state.gems >= parseFloat(b.dataset.gems);
      if (b.disabled === can) b.disabled = !can;
    });
  }
  const row = (icon, title, sub, right, cls) => `<div class="row ${cls || ''}"><div class="r-icon">${icon}</div><div class="r-main"><div class="r-title">${title}</div><div class="r-sub">${sub}</div></div>${right || ''}</div>`;

  function renderQuests() {
    const list = E.questList(state);
    if (!list.length) return '<div class="empty">🎉 Every quest complete!</div>';
    return '<p class="hint">Complete quests to earn gems and XP. New goals keep coming.</p>' + list.map(q =>
      row(q.emoji, esc(q.title),
        `<span class="reward">💎 ${q.gems}</span><span class="reward">✨ ${q.xp} XP</span><div class="pbar"><div style="width:${Math.min(100, q.value / q.target * 100).toFixed(1)}%"></div></div>`,
        q.done ? `<button class="btn gold" type="button" data-act="claimQuest" data-kind="${q.kind}">Claim</button>`
          : `<span class="r-sub"><b>${q.kind === 'earn' ? money(q.value) : num(q.value)}</b> / ${q.kind === 'earn' ? money(q.target) : num(q.target)}</span>`,
        q.done ? 'hot' : '')).join('');
  }

  function renderShops(t) {
    let html = `<p class="hint">Upgrade amount: <button class="btn ghost small" type="button" data-act="mode">${E.BUY_MODES[state.settings.buyMode]}</button></p>`;
    const emp = E.empireInfo(state);
    html += row('🏆', 'Empire milestone', emp.next ? `${num(emp.total)} / ${num(emp.next)} total levels → all profit ×2<div class="pbar"><div style="width:${((emp.total - emp.prev) / (emp.next - emp.prev) * 100).toFixed(1)}%"></div></div>` : 'All empire milestones reached!');
    E.DISTRICTS.forEach((dist, d) => {
      if (!state.districts[d]) return;
      html += `<div class="sect">${dist.emoji} ${esc(dist.name)}</div>`;
      let any = false;
      state.plots[d].forEach((x, p) => {
        if (!E.isShop(x)) return;
        any = true;
        const def = E.TYPES[x.t], n = E.buyAmount(state, d, p, state.settings.buyMode), cost = E.costFor(x.t, x.level, n);
        html += row(def.emoji, `${esc(def.name)} <span class="tag">Lv ${x.level}</span>`,
          `${x.manager ? '<b>' + money(shopRate(d, p, t)) + '/s</b>' : 'No manager yet'} · ${sizeOf(d, p).name}`,
          `<button class="btn small blue" type="button" data-act="goto" data-d="${d}" data-p="${p}">Go</button>
           <button class="btn small two" type="button" data-act="upRow" data-d="${d}" data-p="${p}" data-cost="${cost}">×${n}<span class="sub">${money(cost)}</span></button>`);
      });
      if (!any) html += '<div class="empty">No shops here yet — buy land and build!</div>';
    });
    return html;
  }

  function renderBuild() {
    const d = D(), p = panelArg === null ? sel : panelArg, size = sizeOf(d, p);
    let html = `<p class="hint">Building on <b>${size.name} land</b> in ${esc(E.DISTRICTS[d].name)}. Bigger land and later districts unlock grander shops.</p><div class="grid2">`;
    E.TYPES.forEach((def, t) => {
      const ok = E.canBuildOn(d, p, t), cost = E.buildCost(state, t), owned = E.countType(state, t);
      const why = E.DISTRICTS[d].plots[p].size < def.minSize ? `Needs ${E.SIZES[def.minSize].name} land` : `Needs ${E.DISTRICTS[def.minDistrict].name}`;
      html += `<div class="tile ${ok ? '' : 'locked'}">${owned ? `<span class="own">Owned ×${owned}</span>` : ''}<div class="em">${def.emoji}</div><div class="nm">${esc(def.name)}</div>
        <div class="st">${ok ? `${money(def.baseRevenue)} every ${E.formatTime(def.time)}` : '🔒 ' + why}</div>
        ${ok ? `<button class="btn small" type="button" data-act="buildType" data-t="${t}" data-p="${p}" data-cost="${cost}">${money(cost)}</button>` : ''}</div>`;
    });
    return html + '</div>';
  }

  function renderStaff(t) {
    const st = E.recruitStatus(state, t);
    const target = panelArg && panelArg.assign !== undefined ? panelArg.assign : (E.shopAt(state, D(), sel) ? sel : null);
    const tShop = target !== null ? E.shopAt(state, D(), target) : null;
    let html = '<p class="hint">Chefs boost a shop\'s profit. In their favourite kind of shop they give +50% more.</p>';
    html += row('🎟️', 'Recruit a chef', st.full ? 'Your kitchen is full (30 chefs)' : st.free ? 'Your free recruit is ready!' : `Next free recruit in ${E.formatTime(st.wait)}`,
      st.full ? '' : st.free ? '<button class="btn gold" type="button" data-act="recruit">FREE</button>' : `<button class="btn purple" type="button" data-act="recruit" data-gems="${E.COST.recruit}">${E.COST.recruit} 💎</button>`, st.free && !st.full ? 'hot' : '');
    if (tShop) html += `<div class="sect">Assigning to ${E.TYPES[tShop.t].emoji} ${esc(E.TYPES[tShop.t].name)}</div>`;
    if (!state.staff.length) return html + '<div class="empty">No chefs yet. Your first recruit is free!</div>';
    const sorted = state.staff.slice().sort((a, b) => b.rarity - a.rarity || b.level - a.level);
    for (const m of sorted) {
      const r = E.RARITIES[m.rarity], at = E.staffShop(state, m.id), spec = E.TYPES[m.spec];
      const here = at && tShop && at.d === D() && at.p === target;
      const bonus = Math.round(E.staffBonus(m, tShop ? tShop.t : -1) * 100);
      html += `<div class="chef" style="--rc:${r.color}"><div class="face">${m.face}<i>Lv ${m.level}</i></div><div class="r-main">
        <div class="rar">${r.name}</div><div class="r-title">${esc(m.name)}</div>
        <div class="r-sub"><b>+${bonus}%</b> profit${tShop && m.spec === tShop.t ? ' (favourite!)' : ''} · loves ${spec.emoji} ${esc(spec.name)}</div>
        <div class="r-sub">${at ? `Works at ${E.TYPES[plot(at.d, at.p).t].emoji} in ${esc(E.DISTRICTS[at.d].name)}` : 'Waiting for a job'}</div>
        <div class="acts">
          ${tShop && !here ? `<button class="btn small" type="button" data-act="assign" data-id="${m.id}" data-p="${target}">Assign here</button>` : ''}
          ${at ? `<button class="btn small ghost" type="button" data-act="unassign" data-id="${m.id}">Remove</button>` : ''}
          ${m.level < E.STAFF_MAX_LEVEL ? `<button class="btn small purple" type="button" data-act="staffUp" data-id="${m.id}" data-gems="${E.staffUpgradeCost(m)}">Train ${E.staffUpgradeCost(m)} 💎</button>` : '<span class="tag">MAX</span>'}
          <button class="btn small ghost" type="button" data-act="dismiss" data-id="${m.id}">Dismiss</button>
        </div></div></div>`;
    }
    return html;
  }

  function renderResearch() {
    const avail = E.availableUpgrades(state).slice(0, 20);
    if (!avail.length) return '<div class="empty">🎉 All research complete!</div>';
    return '<p class="hint">Each discovery triples profit. Cheapest first.</p>' + avail.map(u =>
      row(u.emoji, esc(u.name), `${esc(u.target)}: profit ×${u.mult}`, `<button class="btn" type="button" data-act="research" data-id="${u.id}" data-cost="${u.cost}">${money(u.cost)}</button>`)).join('');
  }

  function renderWorld() {
    let html = '<p class="hint">Each district is a new map with more land, bigger plots and a profit bonus.</p>';
    E.DISTRICTS.forEach((dist, d) => {
      const open = state.districts[d], here = d === D(), canUnlock = !open && state.districts[d - 1];
      const owned = state.plots[d].filter(Boolean).length, shops = state.plots[d].filter(E.isShop).length;
      const land = E.SIZES.map((s, i) => { const n = dist.plots.filter(pl => pl.size === i).length; return n ? `${n} ${s.name}` : ''; }).filter(Boolean).join(' · ');
      html += `<div class="dist ${here ? 'here' : ''} ${open ? '' : 'locked'}" style="--c1:${DIST_COLORS[d][0]};--c2:${DIST_COLORS[d][1]}"><div class="em">${dist.emoji}</div><div class="r-main">
        <h3>${esc(dist.name)}</h3><div class="r-sub">Profit ×${dist.mult} · Land: ${land}</div>
        <div class="r-sub">${open ? `<b>${shops}</b> shops · <b>${owned}/${dist.plots.length}</b> plots owned` : canUnlock ? 'Ready to expand!' : `Unlock ${esc(E.DISTRICTS[d - 1].name)} first`}</div></div>
        ${here ? '<span class="tag">You are here</span>' : open ? `<button class="btn blue" type="button" data-act="visit" data-d="${d}">Visit</button>`
          : canUnlock ? `<button class="btn gold two" type="button" data-act="unlock" data-d="${d}" data-cost="${dist.cost}">Unlock<span class="sub">${money(dist.cost)}</span></button>` : '<span class="tag">🔒</span>'}</div>`;
    });
    return html;
  }

  function renderFranchise() {
    const claim = E.claimableStars(state);
    return `<div class="hero"><div class="big">⭐</div><p>Sell your whole empire to investors and start again from one noodle cart with <b>Golden Stars</b>. Each star gives <b>+${Math.round(E.STAR_BONUS * 100)}% profit</b> forever.</p></div>
      <div class="stat-grid">
        <div><span>Golden Stars</span><b>${num(state.stars)}</b></div><div><span>Star bonus</span><b>+${num(state.stars * E.STAR_BONUS * 100)}%</b></div>
        <div><span>Stars if you franchise now</span><b class="gold-t">+${num(claim)}</b></div><div><span>Next star at</span><b>${money(E.nextStarAt(state))}</b></div>
      </div>
      <button class="btn gold big wide" type="button" data-act="prestige" ${claim < 1 ? 'disabled' : ''}>${claim >= 1 ? `FRANCHISE FOR ⭐ ${num(claim)}` : 'Earn more to franchise'}</button>
      <p class="fine">You keep: stars, gems, chefs, your level, awards and purchases.<br>You restart: cash, land, shops, research and districts.</p>`;
  }

  function renderStore(t) {
    const left = state.boostUntil - t, crate = E.crateStatus(state, t), ips = E.incomePerSec(state, t, { managedOnly: true, noTimed: true });
    let html = `<div class="sect">Boosts</div>` +
      row('🚀', '2× profit for 4 hours', left > 0 ? `Active: ${E.formatTime(left / 1000)} left · stacks to 24h` : 'Stacks up to 24 hours',
        `<button class="btn small purple" type="button" data-act="boostAd">${state.adsRemoved ? 'Free' : '📺 Watch'}</button><button class="btn small blue" type="button" data-act="boostGems" data-gems="${E.COST.boost}">${E.COST.boost} 💎</button>`) +
      row('⏩', 'Time warp', `Collect 2 hours of income now: <b>${money(ips * 7200)}</b>`, `<button class="btn small blue" type="button" data-act="warp" data-gems="${E.COST.warp}" ${ips > 0 ? '' : 'disabled'}>${E.COST.warp} 💎</button>`) +
      row('🎁', 'Reward crate', crate.free ? 'Your free crate is ready!' : `Free again in ${E.formatTime(crate.wait)} · cash, gems, boosts or a chef`,
        crate.free ? '<button class="btn gold" type="button" data-act="crate">Open</button>' : `<button class="btn small blue" type="button" data-act="crate" data-gems="${E.COST.crate}">${E.COST.crate} 💎</button>`, crate.free ? 'hot' : '') +
      `<div class="sect">Gems</div>` + row('💎', `You have ${num(state.gems)} gems`, 'Earn more from quests, level-ups, awards, VIP visitors, crates and daily rewards.') +
      `<div class="sect">Premium</div>`;
    [{ id: P.CONFIG.products.premium, icon: '👑', title: 'Permanent 2× profit', sub: 'Doubles all profit forever, even after franchising', owned: state.premium },
     { id: P.CONFIG.products.vipPass, icon: '🎟️', title: 'VIP Pass', sub: 'Get every video reward instantly, with no ads', owned: state.adsRemoved }].forEach(it => {
      html += row(it.icon, it.title, it.sub, it.owned ? '<span class="tag">Owned ✓</span>' : P.Store.available
        ? `<button class="btn gold small" type="button" data-act="iap" data-id="${it.id}">${esc(prices[it.id] || 'Buy')}</button>` : '<span class="tag">In the app</span>', it.owned ? 'done' : '');
    });
    if (P.Store.available) html += '<button class="btn ghost wide" type="button" data-act="restore">Restore purchases</button>';
    return html;
  }

  function renderAwards() {
    const n = E.achievementCount(state);
    return `<p class="hint"><b>${n} / ${E.ACHIEVEMENTS.length}</b> earned · <b>+${Math.round(n * E.ACHIEVEMENT_BONUS * 100)}%</b> profit · each award also pays 5 💎</p><div class="ach-grid">` +
      E.ACHIEVEMENTS.map((a, i) => `<button class="ach ${state.achievements[a.id] ? 'got' : ''}" type="button" data-act="achInfo" data-i="${i}">${a.emoji}</button>`).join('') + '</div>';
  }

  function renderProfile() {
    const need = E.xpForLevel(state.level);
    const stats = [
      ['Earned this franchise', money(state.runEarnings)], ['Earned all time', money(state.lifetime)], ['Total profit multiplier', '×' + num(E.permanentMult(state))],
      ['Shops', num(E.shopCount(state))], ['Total shop levels', num(E.totalLevels(state))], ['Times franchised', num(state.prestiges)],
      ['Customers served by hand', num(state.stats.taps)], ['VIP visitors', num(state.stats.golden)], ['Crates opened', num(state.stats.crates)],
      ['Time played', E.formatTime(state.stats.playTime)], ['Daily streak', state.daily.streak + (state.daily.streak === 1 ? ' day' : ' days')],
    ];
    return `<div class="hero"><div class="big">🧑‍🍳</div><h3>Level ${state.level} Food Tycoon</h3><p>${num(state.xp)} / ${num(need)} XP · each level gives +${Math.round(E.LEVEL_BONUS * 100)}% profit and 5 💎</p></div>
      <div class="sect">Stats</div><div class="stats">${stats.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>
      <div class="sect">Settings</div>
      <label class="toggle"><input type="checkbox" data-set="sound" ${state.settings.sound ? 'checked' : ''}> Sound effects</label>
      <label class="toggle"><input type="checkbox" data-set="haptics" ${state.settings.haptics ? 'checked' : ''}> Vibration</label>
      ${use3d ? `<label class="toggle"><input type="checkbox" data-set="lens" ${state.settings.lens ? 'checked' : ''}> Tilt-shift miniature lens</label>` : ''}
      <button class="btn red wide" type="button" data-act="reset">Delete save &amp; restart</button>
      <p class="fine"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a> · Yum Empire v${esc(P.CONFIG.version)}</p>`;
  }

  // ---------- Every button in the card and the windows ----------
  const ACT = {
    prev() { feedback('tap'); selectPlot(sel - 1, true); },
    next() { feedback('tap'); selectPlot(sel + 1, true); },
    serve(el, ev) { serve(sel, ev); if (use3d) W3.focusPlot(sel); },
    upgrade() { doUpgrade(D(), sel); },
    upRow(el) { doUpgrade(+el.dataset.d, +el.dataset.p); },
    mode() {
      state.settings.buyMode = (state.settings.buyMode + 1) % E.BUY_MODES.length;
      feedback('tap');
      onStateChanged();
    },
    hire() {
      const x = E.shopAt(state, D(), sel);
      if (x && E.hireManager(state, D(), sel)) {
        feedback('milestone', true);
        toast(`🧑‍💼 A manager now runs your <b>${esc(E.TYPES[x.t].name)}</b> — it earns even while you're away!`, 3400);
        onStateChanged();
      } else feedback('error');
    },
    chef() { feedback('tap'); openPanel('staff', { assign: sel }); },
    buyLand() {
      if (E.buyLand(state, D(), sel)) {
        feedback('milestone', true);
        toast(`📜 The land is yours! Now choose what to build.`);
        onStateChanged();
        openPanel('build', sel);
      } else feedback('error');
    },
    build() { feedback('tap'); openPanel('build', sel); },
    buildType(el) {
      const p = +el.dataset.p, t = +el.dataset.t;
      if (E.build(state, D(), p, t)) {
        feedback('milestone', true);
        closePanel();
        toast(`${E.TYPES[t].emoji} <b>${esc(E.TYPES[t].name)}</b> is open for business!`);
        sel = p;
        onStateChanged();
        if (use3d) W3.focusPlot(p);
      } else feedback('error');
    },
    goto(el) {
      const d = +el.dataset.d, p = +el.dataset.p;
      feedback('tap');
      if (d !== D()) goDistrict(d);
      closePanel();
      selectPlot(p, true);
    },
    claimQuest(el) {
      const q = E.claimQuest(state, el.dataset.kind);
      if (!q) return;
      feedback('vip', true);
      const r = el.getBoundingClientRect();
      floater(`+${q.gems} 💎`, r.left + r.width / 2, r.top, 'gem');
      onStateChanged();
    },
    recruit() {
      const m = E.recruit(state, now());
      if (!m) { feedback('error'); return; }
      const r = E.RARITIES[m.rarity], spec = E.TYPES[m.spec];
      feedback(m.rarity >= 2 ? 'prestige' : 'vip', true);
      modal({ icon: m.face, title: `${r.name} chef!`, body: `<div class="amount" style="color:${r.color}">${esc(m.name)}</div><p><b>+${Math.round(E.staffBonus(m, -1) * 100)}%</b> profit for the shop they work in.</p><p>Loves ${spec.emoji} <b>${esc(spec.name)}</b> (+50% more there)</p>`,
        actions: [{ label: 'Welcome aboard!', cls: 'gold' }] });
      onStateChanged();
    },
    assign(el) {
      if (E.assignStaff(state, +el.dataset.id, D(), +el.dataset.p)) {
        feedback('milestone', true);
        const m = E.staffById(state, +el.dataset.id);
        toast(`${m.face} <b>${esc(m.name)}</b> is now cooking here!`);
        closePanel();
        onStateChanged();
      }
    },
    unassign(el) { E.unassignStaff(state, +el.dataset.id); feedback('tap'); onStateChanged(); },
    staffUp(el) { if (E.upgradeStaff(state, +el.dataset.id)) { feedback('milestone', true); onStateChanged(); } else feedback('error'); },
    dismiss(el) {
      const m = E.staffById(state, +el.dataset.id);
      if (!m) return;
      modal({ icon: m.face, title: 'Dismiss chef?', body: `<p>Say goodbye to <b>${esc(m.name)}</b>? You get 3 💎 back.</p>`,
        actions: [{ label: 'Dismiss', cls: 'red', onClick: () => { E.dismissStaff(state, m.id); onStateChanged(); } }, { label: 'Keep', cls: 'ghost' }] });
    },
    research(el) {
      const u = E.UPGRADES.find(x => x.id === el.dataset.id);
      if (E.buyUpgrade(state, el.dataset.id)) {
        feedback('milestone', true);
        toast(`🔬 <b>${esc(u.name)}</b>: ${esc(u.target)} ×${u.mult}!`);
        onStateChanged();
      } else feedback('error');
    },
    visit(el) { feedback('tap'); goDistrict(+el.dataset.d, true); },
    unlock(el) {
      const d = +el.dataset.d;
      if (!E.unlockDistrict(state, d)) { feedback('error'); return; }
      feedback('prestige', true);
      const dist = E.DISTRICTS[d];
      modal({ icon: dist.emoji, title: 'New district!', body: `<div class="amount">${esc(dist.name)}</div><p>More land, bigger plots and <b>×${dist.mult} profit</b> for every shop you build there.</p>`,
        actions: [{ label: 'Take me there!', cls: 'gold', onClick: () => goDistrict(d, true) }] });
      onStateChanged();
    },
    prestige() {
      const claim = E.claimableStars(state);
      if (claim < 1) return;
      modal({ icon: '⭐', title: 'Franchise?', body: `<p>You'll receive</p><div class="amount">⭐ ${num(claim)}</div><p>Your profit bonus becomes <b>+${num((state.stars + claim) * E.STAR_BONUS * 100)}%</b>.<br>Cash, land, shops, research and districts start over.</p>`,
        actions: [{ label: 'Franchise!', cls: 'gold', onClick: () => {
          const gain = E.prestige(state);
          feedback('prestige', true);
          E.checkAchievements(state);
          goDistrict(0, true);
          toast(`⭐ <b>+${num(gain)} Golden Stars!</b> A fresh start awaits.`, 3600);
        } }, { label: 'Not yet', cls: 'ghost' }] });
    },
    async boostAd() {
      if (state.boostUntil - now() > 20 * 3600 * 1000) { toast('Your boost is almost full (24h max).'); return; }
      if (!(await earnReward())) return;
      E.addBoost(state, now());
      feedback('milestone', true);
      toast('🚀 <b>2× profit</b> for 4 hours!');
      save(); onStateChanged();
    },
    boostGems() { if (E.buyBoost(state, now())) { feedback('milestone', true); toast('🚀 <b>2× profit</b> for 4 hours!'); onStateChanged(); } else feedback('error'); },
    warp() {
      const amount = E.timeWarp(state, now());
      if (!amount) { feedback('error'); return; }
      feedback('vip', true);
      toast(`⏩ Time warp! <b>+${money(amount)}</b>`);
      onStateChanged();
    },
    crate() {
      const r = E.openCrate(state, now());
      if (!r) { feedback('error'); return; }
      feedback(r.type === 'staff' ? 'prestige' : 'vip', true);
      modal({ icon: r.emoji, title: 'Crate opened!', body: `<div class="amount">${esc(r.text)}</div>${r.type === 'staff' ? `<p>Loves ${E.TYPES[r.staff.spec].emoji} ${esc(E.TYPES[r.staff.spec].name)}. Assign them in Chefs.</p>` : ''}`,
        actions: [{ label: 'Awesome!', cls: 'gold' }] });
      onStateChanged();
    },
    async iap(el) {
      const owned = await P.Store.buy(el.dataset.id);
      if (owned) applyPurchases(owned, true);
    },
    async restore() {
      const owned = await P.Store.restore();
      if (owned) { applyPurchases(owned, true); toast('Purchases restored.'); } else toast('Nothing to restore.');
    },
    achInfo(el) { const a = E.ACHIEVEMENTS[+el.dataset.i]; toast(`${a.emoji} <b>${esc(a.name)}</b><br>${esc(a.desc)}${state.achievements[a.id] ? ' ✓' : ''}`); },
    reset() {
      modal({ icon: '⚠️', title: 'Delete save?', body: '<p>This erases <b>everything</b>: stars, gems, chefs and awards. Purchases can be restored from the Store.</p>',
        actions: [{ label: 'Delete everything', cls: 'red', onClick: () => {
          const keep = { premium: state.premium, adsRemoved: state.adsRemoved };
          P.Storage.clear();
          state = E.newState();
          Object.assign(state, keep);
          goDistrict(0, true);
        } }, { label: 'Cancel', cls: 'ghost' }] });
    },
  };
  function applyPurchases(owned, announce) {
    let changed = false;
    if (owned.includes(P.CONFIG.products.premium) && !state.premium) { state.premium = true; changed = true; if (announce) toast('👑 Permanent 2× profit unlocked!'); }
    if (owned.includes(P.CONFIG.products.vipPass) && !state.adsRemoved) { state.adsRemoved = true; changed = true; if (announce) toast('🎟️ VIP Pass active — no more ads!'); }
    if (changed) { save(); onStateChanged(); }
  }

  // ---------- HUD ----------
  function updateHud(t) {
    setText($('cash'), money(state.cash));
    setText($('gems'), num(state.gems));
    setText($('stars'), num(state.stars));
    setText($('lvBadge'), String(state.level));
    const need = E.xpForLevel(state.level);
    $('xpFill').style.width = Math.min(100, state.xp / need * 100).toFixed(1) + '%';
    setText($('xpText'), `${num(state.xp)} / ${num(need)} XP`);
    setText($('districtBtn'), `${E.DISTRICTS[D()].emoji} ${E.DISTRICTS[D()].name}`);
    const ips = E.incomePerSec(state, t, { managedOnly: true });
    setText($('ips'), ips > 0 ? money(ips) + ' / sec' : 'No managers yet');
    const left = state.boostUntil - t;
    toggle($('boostBtn'), 'active', left > 0);
    setText($('boostLabel'), left > 0 ? '2× ' + E.formatTime(left / 1000) : '2× Boost');
    const crate = E.crateStatus(state, t);
    setText($('crateLabel'), crate.free ? 'Free!' : E.formatTime(crate.wait));
    toggle($('crateBtn'), 'ready', crate.free);
    let pills = '';
    if (state.frenzyUntil > t) pills += `<span class="pill frenzy">🤩 Frenzy ×${E.FRENZY_MULT} · ${Math.ceil((state.frenzyUntil - t) / 1000)}s</span>`;
    const tip = tutorialTip();
    if (tip) pills += `<span class="pill tip">${tip}</span>`;
    const row = $('statusRow');
    if (row._html !== pills) { row.innerHTML = pills; row._html = pills; }
  }
  function tutorialTip() {
    if (state.prestiges > 0 || state.level > 4) return '';
    if (state.stats.taps === 0) return '👆 Tap your noodle cart to serve!';
    if (state.plots[0].some(x => x && x.t === -1)) return '🏗️ Tap your empty land to build';
    if (E.managerCount(state) === 0) return state.cash >= E.TYPES[0].managerCost ? '🧑‍💼 Hire a manager on the card below!' : (E.shopAt(state, 0, 0) && E.shopAt(state, 0, 0).level < 5 ? '⬆️ Upgrade your cart to earn more' : '');
    if (E.shopCount(state) === 1 && state.cash >= E.landPrice(0, 1)) return '📜 Buy land: tap a FOR SALE sign!';
    if (!state.staff.length) return '👩‍🍳 Recruit a free chef in Chefs';
    return '';
  }
  function setBadge(id, txt) { const b = $('badge-' + id); setText(b, txt); toggle(b, 'show', !!txt); }
  function updateBadges() {
    const t = now();
    const q = E.questList(state).filter(x => x.done).length;
    setBadge('quests', q ? String(q) : '');
    setBadge('staff', E.recruitStatus(state, t).free && state.staff.length < E.STAFF_MAX ? '!' : '');
    const up = E.availableUpgrades(state).filter(u => u.cost <= state.cash).length;
    setBadge('research', up ? String(Math.min(99, up)) : '');
    const nextD = state.districts.indexOf(false);
    setBadge('world', nextD > 0 && state.cash >= E.DISTRICTS[nextD].cost ? '!' : '');
    const claim = E.claimableStars(state);
    setBadge('franchise', claim >= Math.max(10, state.stars) ? '!' : '');
    setBadge('crate', E.crateStatus(state, t).free ? '!' : '');
  }

  // ---------- VIP visitor ----------
  function scheduleVip(first) {
    clearTimeout(vipTimer);
    vipTimer = setTimeout(spawnVip, first ? 30000 : 50000 + Math.random() * 80000);
  }
  function spawnVip() {
    if (document.hidden || modalOpen || panel) { scheduleVip(); return; }
    if (use3d) {
      if (!W3.spawnVip(sel)) { scheduleVip(); return; }
      toast('🤩 A <b>VIP</b> is in town — find the golden visitor and tap them!', 3600);
      P.Sound.play('vip');
      return;
    }
    const vip = $('vip'), box = $('app').getBoundingClientRect();
    vip.style.left = (20 + Math.random() * Math.max(10, box.width - 110)) + 'px';
    vip.style.top = (150 + Math.random() * Math.max(10, box.height - 480)) + 'px';
    vip.hidden = false;
    clearTimeout(vipHideTimer);
    vipHideTimer = setTimeout(() => { vip.hidden = true; scheduleVip(); }, 9000);
  }
  function claimVip(x, y) {
    P.Sound.unlock();
    const r = E.vipReward(state, now());
    feedback('vip', true);
    const gems = r.gems ? ` and <b>${r.gems} 💎</b>` : '';
    if (r.type === 'frenzy') toast(`🤩 <b>VIP Frenzy!</b> ×${r.mult} profit for ${r.seconds}s${gems}!`, 3200);
    else { toast(`🤩 The VIP tipped you <b>${money(r.amount)}</b>${gems}!`, 3200); floater('+' + money(r.amount), x, y); }
    onStateChanged();
    scheduleVip();
  }

  // ---------- Welcome back & daily reward ----------
  function handleAway() {
    const t = now(), off = E.computeOffline(state, t);
    state.lastSeen = t;
    if (off.amount <= 0) return;
    const base = off.amount;
    modal({
      icon: '🌙', title: 'Welcome back!',
      body: `<p>Your managers kept the shops open for ${E.formatTime(off.seconds)}${off.seconds >= E.OFFLINE_CAP_SEC ? ' (the maximum)' : ''}.</p><div class="amount">${money(base)}</div>`,
      actions: [
        { label: `${state.adsRemoved ? '' : '📺 '}Collect 2× (${money(base * 2)})`, cls: 'purple', onClick: async () => {
          const ok = await earnReward();
          E.earn(state, ok ? base * 2 : base);
          feedback('coin', true); save(); onStateChanged();
        } },
        { label: 'Collect', cls: 'gold', onClick: () => { E.earn(state, base); feedback('coin'); save(); onStateChanged(); } },
      ],
    });
  }
  function maybeDaily() {
    const d = E.dailyStatus(state, now());
    if (!d.available) return;
    const days = Array.from({ length: 7 }, (_, k) => `<div class="${k < d.day ? 'on' : ''}">${k === 6 ? '🚀' : 'Day ' + (k + 1)}</div>`).join('');
    modal({
      icon: '🎁', title: `Daily reward · day ${d.day}`,
      body: `<p>Come back every day for bigger rewards. Day 7 adds a free 4-hour boost!</p><div class="days">${days}</div><div class="loot"><span>💵 ${money(d.amount)}</span><span>💎 ${d.gems}</span></div>`,
      actions: [{ label: 'Claim', cls: 'gold', onClick: () => { if (E.claimDaily(state, now())) feedback('vip', true); save(); onStateChanged(); } }],
    });
  }

  // ---------- Main loop ----------
  function watchPerformance(rawDt) {   // drop detail automatically if the device struggles
    if (rawDt > 0.045) slowFrames++; else fastFrames++;
    if (slowFrames + fastFrames < 150) return;
    if (slowFrames > 90 && W3.getQuality() < 2) W3.setQuality(W3.getQuality() + 1);
    slowFrames = fastFrames = 0;
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!ready) return;
    const t = now();
    if (t - state.lastSeen > 5000) handleAway();   // long gaps are paid out as offline earnings
    state.lastSeen = t;
    const rawDt = (ts - lastFrame) / 1000;
    const dt = Math.min(0.25, Math.max(0, rawDt));
    lastFrame = ts;
    const events = E.tick(state, dt, t);

    for (const e of events) {
      if (e.d !== D()) continue;
      const ct = E.cycleTime(state, e.d, e.p);
      if (ct < 0.5) continue;
      if (use3d && !panel) { const pos = W3.plotScreenPos(e.p); if (pos) floater('+' + money(e.amount), pos.x, pos.y); }
      if (!state.plots[e.d][e.p].manager || ct >= 3) P.Sound.play('coin');
    }
    if (use3d) {
      W3.update(dt, state, events);
      W3.render();
      watchPerformance(rawDt);
    }
    updateHud(t);
    updateCard(t);

    if (ts - lastSlow > 400) {
      lastSlow = ts;
      E.trackStats(state);
      const got = E.checkAchievements(state);
      for (const a of got) { feedback('milestone', true); toast(`🏆 <b>${esc(a.name)}</b> earned! +5 💎 and +${Math.round(E.ACHIEVEMENT_BONUS * 100)}% profit`, 3200); }
      celebrateLevelUps();
      if (use3d) W3.sync(state);
      updateBadges();
      if (panel) { if (got.length) renderPanel(); else refreshButtons($('panelBody')); }   // (no periodic re-render: it would swallow taps)
    }
    if (ts - lastSave > 5000) save();
  }

  // ---------- Wiring ----------
  function delegate(root) {
    root.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]');
      if (!el || el.disabled || !root.contains(el)) return;
      P.Sound.unlock();
      const fn = ACT[el.dataset.act];
      if (fn) fn(el, ev);
    });
  }
  function wire() {
    delegate($('shopCard'));
    delegate($('panelBody'));
    $('panelBody').addEventListener('change', (ev) => {
      const k = ev.target.dataset && ev.target.dataset.set;
      if (!k) return;
      state.settings[k] = ev.target.checked;
      P.Sound.enabled = state.settings.sound;
      P.Haptics.enabled = state.settings.haptics;
      if (use3d) W3.setLens(state.settings.lens);
      save();
    });
    document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => {
      P.Sound.unlock(); feedback('tap');
      if (panel === b.dataset.panel) closePanel(); else openPanel(b.dataset.panel);
    }));
    $('panelClose').addEventListener('click', () => { feedback('tap'); closePanel(); });
    $('panel').addEventListener('click', (ev) => { if (ev.target === $('panel')) closePanel(); });
    $('navCity').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); closePanel(); if (use3d) W3.focusPlot(sel); });
    $('avatarBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('profile'); });
    $('districtBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('world'); });
    $('gemBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('store'); });
    $('boostBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('store'); });
    $('crateBtn').addEventListener('click', () => {
      P.Sound.unlock();
      if (E.crateStatus(state, now()).free) ACT.crate(); else { feedback('tap'); openPanel('store'); }
    });
    $('vip').addEventListener('click', (ev) => {
      if ($('vip').hidden) return;
      $('vip').hidden = true;
      clearTimeout(vipHideTimer);
      claimVip(ev.clientX, ev.clientY);
    });
    P.Lifecycle.onPause(save);
    P.Lifecycle.onResume(() => { lastFrame = performance.now(); });
    // Android back button: close a window first, otherwise leave the app
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) App.addListener('backButton', () => {
      if (modalOpen) return;
      if (panel) closePanel();
      else if (App.minimizeApp) App.minimizeApp();
    });
  }

  async function boot() {
    const raw = await P.Storage.load();
    const isNew = !raw;
    state = E.loadState(raw, now());
    P.Sound.enabled = state.settings.sound;
    P.Haptics.enabled = state.settings.haptics;
    // Start the 3D world. Without WebGL the game still plays through the card and the menus.
    try { use3d = !!(W3 && W3.init && W3.init($('city'), { onPickPlot, onPickVip: claimVip, onVipGone: () => scheduleVip() })); }
    catch (e) { console.warn('3D world unavailable', e); use3d = false; }
    document.body.classList.add(use3d ? 'has3d' : 'no3d');
    wire();
    const first = state.plots[D()].findIndex(x => E.isShop(x));
    sel = first >= 0 ? first : 0;
    if (use3d) {
      W3.setLens(state.settings.lens);
      W3.loadDistrict(D(), state);
      W3.focusPlot(sel, true);
      if (isNew) W3.intro();
    }
    onStateChanged();
    ready = true;
    lastFrame = performance.now();

    if (isNew) {
      modal({
        icon: '🍜', title: 'Welcome, Chef!',
        body: '<p>You own one tiny noodle cart in a quiet suburb. Serve customers, <b>buy land</b>, <b>build new shops</b>, hire chefs and grow all the way to the Neon Metropolis!</p><p>Drag to look around · pinch to zoom · twist to rotate</p>',
        actions: [{ label: "Let's cook!", cls: 'gold' }],
      });
    } else {
      handleAway();
      maybeDaily();
    }
    scheduleVip(true);
    P.Lifecycle.styleStatusBar();
    P.Lifecycle.hideSplash();
    requestAnimationFrame(frame);
    await Promise.all([P.Ads.init(), P.Store.init()]);
    if (P.Store.available) {
      prices = await P.Store.prices();
      const owned = await P.Store.owned();
      if (owned) applyPurchases(owned, false);
    }
  }

  if ('serviceWorker' in navigator && !P.isNative && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // For automated tests and debugging
  window.YumEmpire = {
    get state() { return state; }, get use3d() { return use3d; }, get sel() { return sel; }, get panel() { return panel; },
    save, sync: onStateChanged, selectPlot, openPanel, closePanel, goDistrict,
  };

  boot();
})();
