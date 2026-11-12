/*
 * Yum Empire — game controller: connects the rules (engine.js), the 3D park (world.js) and the interface.
 * The business runs itself: cooks sell, farmers grow. The player hires, builds, buys and plans.
 */
(function () {
  'use strict';
  const E = window.Engine, P = window.Platform, W3 = window.World;
  const $ = (id) => document.getElementById(id);
  const money = E.formatMoney, num = E.formatNumber, ftime = E.formatTime;
  const I = (n, c) => window.Icons.svg(n, c);
  const face = (w, c) => window.Icons.chef(w, c);
  const now = () => Date.now();

  let state = E.newState();
  let use3d = false, ready = false;
  let sel = null;                 // { kind: 'b', u } | { kind: 'parcel', k }
  let placing = null;             // { t, moveU, x, y, ok }
  let panel = null, panelArg = null;
  const tabs = { build: 'stall', staff: 'team', buildings: 'list', quests: 'goals', hall: 'next' };
  let lastFrame = performance.now(), lastSave = 0, lastSlow = 0, cardKey = '', tickAcc = 0;
  let vipTimer = null, prices = {}, slowFrames = 0, fastFrames = 0, sumCache = null;
  const PK = () => state.park;
  const park = () => state.parks[PK()];
  const def = (t) => E.DEFS[t];
  const ROLE_ICON = { cook: 'chefhat', farmer: 'farmer', fisher: 'fisher' };
  const ROLE_NAME = { cook: 'Cook', farmer: 'Farmer', fisher: 'Fisher' };

  // ---------- Small helpers ----------
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }
  function setHTML(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } }
  function toggle(el, cls, on) { if (el && el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on); }
  function h(tag, cls, html) { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function save() { state.lastSeen = now(); P.Storage.save(state); lastSave = performance.now(); }
  function sum() { if (!sumCache) sumCache = E.summary(state, now()); return sumCache; }
  function toast(html, ms) {
    const el = h('div', 'toast', html);
    $('toasts').appendChild(el);
    while ($('toasts').children.length > 2) $('toasts').firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms || 2600);
  }
  function floater(html, x, y, cls) {
    const box = $('app').getBoundingClientRect();
    const el = h('div', 'floater' + (cls ? ' ' + cls : ''), html);
    el.style.left = (x - box.left) + 'px';
    el.style.top = (y - box.top) + 'px';
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  function flyTo(kind, x, y, n) {
    const id = kind === 'cash' ? 'cash' : kind === 'gem' ? 'gems' : 'tokens';
    const target = $(id).getBoundingClientRect();
    const box = $('app').getBoundingClientRect();
    for (let k = 0; k < (n || 6); k++) {
      const el = h('div', 'flyer', I(kind === 'cash' ? 'coin' : kind === 'gem' ? 'gem' : 'token'));
      el.style.left = (x - box.left + (Math.random() - 0.5) * 40) + 'px';
      el.style.top = (y - box.top + (Math.random() - 0.5) * 30) + 'px';
      $('floaters').appendChild(el);
      setTimeout(() => {
        el.style.transition = `left .55s cubic-bezier(.5,0,.8,.4) ${k * 0.04}s, top .55s cubic-bezier(.3,.6,.6,1) ${k * 0.04}s, transform .55s ${k * 0.04}s`;
        el.style.left = (target.left - box.left + 6) + 'px';
        el.style.top = (target.top - box.top) + 'px';
        el.style.transform = 'scale(.6)';
      }, 20);
      setTimeout(() => el.remove(), 700 + k * 40);
    }
    setTimeout(() => { const r = $(id).parentNode; r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump'); }, 600);
  }
  function feedback(sound, strong) { P.Sound.play(sound); P.Haptics.tap(strong); }
  const costHtml = (c) => `${c.cash ? `<span class="cost">${I('cash', 'inl')}${money(c.cash)}</span>` : ''}${c.tokens ? `<span class="cost">${I('token', 'inl')}${num(c.tokens)}</span>` : ''}${c.time ? `<span class="cost">${I('clock', 'inl')}${ftime(c.time)}</span>` : ''}`;
  const stars = (n) => `<span class="stars">${'<i class="on"></i>'.repeat(n)}${'<i></i>'.repeat(5 - n)}</span>`;
  const recipeHtml = (r) => Object.entries(r).map(([k, q]) => `<span class="ing-chip">${q > 1 ? q + '×' : ''}${I(E.ING[k].icon, 'inl')}</span>`).join('');
  const perH = (v) => `${num(v)}/h`;

  // ---------- Modal queue ----------
  const modalQueue = [];
  let modalOpen = false;
  function modal(opts) { modalQueue.push(opts); if (!modalOpen) nextModal(); }
  function nextModal() {
    const m = modalQueue.shift();
    if (!m) { modalOpen = false; $('modal').hidden = true; return; }
    modalOpen = true;
    $('modalIcon').innerHTML = !m.icon ? '' : m.icon[0] === '<' ? m.icon : I(m.icon, 'big');
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
        P.Sound.unlock(); P.Sound.play('tap');
        let close = true;
        if (a.onClick) close = (await a.onClick()) !== false;
        if (close) nextModal(); else actions.querySelectorAll('button').forEach(x => (x.disabled = false));
      });
      actions.appendChild(b);
    });
    $('modal').hidden = false;
  }
  async function earnReward() {
    if (state.adsRemoved) return true;
    const ok = await P.Ads.showRewarded();
    if (!ok) toast('No video available right now. Try again soon.');
    return ok;
  }

  // ---------- After anything changes ----------
  function celebrateLevelUps() {
    const ups = E.takeLevelUps(state);
    if (!ups) return;
    feedback('prestige', true);
    toast(`${I('xp', 'inl')} <b>PLAYER LEVEL ${state.level}!</b> +${10 * ups} ${I('gem', 'inl')} · more customers`, 3600);
  }
  function onStateChanged() {
    sumCache = null;
    celebrateLevelUps();
    if (use3d) W3.sync(state);
    renderCard();
    updateHud(now());
    updateBadges();
    updateMission();
    if (panel) renderPanel();
  }

  // =====================================================================
  //  Selection card
  // =====================================================================
  function select(s, focus) {
    sel = s;
    cardKey = '';
    if (use3d) {
      W3.select(s && s.kind === 'b' ? s.u : 0);
      if (focus && s && s.kind === 'b') W3.focusBuilding(s.u);
      if (focus && s && s.kind === 'parcel') { const px = s.k % E.PN, py = Math.floor(s.k / E.PN); W3.focusCell(px * E.PARCEL + 2, py * E.PARCEL + 2); }
    }
    renderCard();
  }
  function staffSlots(b) {
    const d = def(b.t), role = E.ROLE[d.cat];
    if (!role || b.lv < 1) return '';
    const ws = E.workersAt(state, PK(), b.u), n = E.slotsFor(b.t, b.lv);
    let html = '<div class="slots">';
    for (let k = 0; k < n; k++) {
      const w = ws[k];
      html += w ? `<button class="slot" type="button" data-act="staffFor" data-u="${b.u}">${face(w)}<i>${stars(w.skill)}</i></button>`
        : `<button class="slot empty ${k === 0 ? 'need' : ''}" type="button" data-act="staffFor" data-u="${b.u}">${I('plus')}<i>${ROLE_NAME[role]}</i></button>`;
    }
    const maxS = d.maxSlots;
    if (n < maxS) html += `<span class="slot lock">${I('lock')}<i>Lv ${1 + (n - d.slots + 1) * 3}</i></span>`;
    return html + '</div>';
  }
  function renderCard() {
    const card = $('shopCard');
    if (placing || !sel) { card.hidden = true; return; }
    card.hidden = false;
    const t = now();
    if (sel.kind === 'parcel') {
      const pk = park();
      if (pk.parcels[sel.k]) { select(null); return; }
      const can = E.canBuyParcel(state, PK(), sel.k);
      const key = 'p' + sel.k + can.ok + can.why + E.landPrice(state);
      if (key !== cardKey) {
        cardKey = key;
        const adj = E.parcelAdjacent(pk, sel.k);
        card.innerHTML = `<div class="c-head"><div class="c-icon">${I('land')}</div><div class="c-title"><div class="c-name">${adj ? 'Land for sale' : 'Wild land'}</div>
            <div class="c-sub">${adj ? `16 more cells · rent ${money(E.RENT_PER_PLOT)}/h · ${E.parcelCount(state)}/${E.maxParcels(state)} plots` : 'Buy the land next to it first'}</div></div>
            <button class="c-x" type="button" data-act="deselect" aria-label="Close">✕</button></div>
          ${adj ? `<button class="btn gold big wide two" type="button" data-act="buyParcel" ${can.ok ? '' : 'disabled'}><span class="row-in">${I('land', 'inl')} BUY LAND</span><span class="sub">${can.ok || can.why === 'Not enough cash' ? money(E.landPrice(state)) : esc(can.why)}</span></button>` : ''}`;
      }
      return;
    }
    const b = E.findB(state, PK(), sel.u);
    if (!b) { select(null); return; }
    const d = def(b.t), job = E.jobFor(state, PK(), b.u), up = E.canUpgrade(state, PK(), b.u);
    const ws = E.workersAt(state, PK(), b.u);
    const key = ['b', b.u, b.lv, !!job, ws.map(w => w.id + ':' + w.lvl).join(','), up.ok, up.why, !!b.starved, state.tokens >= (up.cost ? up.cost.tokens : 0)].join(':');
    if (key !== cardKey) {
      cardKey = key;
      const maxLv = E.maxLevel(state, b.t);
      let info = '';
      if (d.cat === 'stall') info = `${money(d.price)} a dish · ${recipeHtml(d.recipe)}`;
      else if (d.makes) info = `Grows ${Object.keys(d.makes).map(k => `${I(E.ING[k].icon, 'inl')} ${E.ING[k].name}`).join(' + ')}`;
      else if (d.cat === 'storage') info = `+${num(Math.round(d.store * Math.pow(1.7, Math.max(0, b.lv - 1))))} storage for every ingredient`;
      else if (d.cat === 'decor') info = d.clean ? `Keeps ${d.clean} customers an hour tidy` : `+${Math.round(d.bonus * 100)}% customers to stalls within ${d.radius} cell${d.radius > 1 ? 's' : ''}${d.seats ? ` · ${d.seats} seats` : ''}`;
      else info = `Level ${b.lv} · unlocks buildings, staff, land and levels`;
      let html = `<div class="c-head"><div class="c-icon">${I(d.icon)}${d.cat !== 'decor' ? `<span class="lv">Lv ${b.lv}</span>` : ''}</div>
        <div class="c-title"><div class="c-name">${esc(d.name)}</div><div class="c-sub">${info}</div></div>
        <button class="c-x" type="button" data-act="deselect" aria-label="Close">✕</button></div>`;
      if (job) {
        html += `<div class="bar"><div class="bar-fill" id="cJobFill"></div><div class="bar-text" id="cJobText"></div></div>
          <div class="c-row"><button class="btn purple wide two" type="button" data-act="speedUp" id="cSpeed"><span class="row-in">${I('warp', 'inl')} FINISH NOW</span><span class="sub" id="cSpeedCost"></span></button>
          ${state.cards.instant ? `<button class="btn blue fit" type="button" data-act="instantCard">${I('cards', 'inl')} ${state.cards.instant}</button>` : ''}</div>`;
      }
      if (E.ROLE[d.cat] && b.lv >= 1) {
        html += staffSlots(b) + '<div class="live" id="cLive"></div>';
        if (!ws.length) html += `<div class="c-info warn">${I('person', 'inl')} Nobody works here. ${d.cat === 'stall' ? 'Hire a cook to start selling!' : d.cat === 'water' ? 'Hire a fisher to start fishing!' : 'Hire a farmer to start growing!'}</div>`;
        else if (b.starved) html += `<div class="c-info warn">${I('crate', 'inl')} Running out of ingredients! <button class="link" type="button" data-act="openMarket">Buy at the market</button> or build more farms.</div>`;
      }
      const btns = [];
      if (!job && d.cat !== 'decor') {
        if (b.lv >= maxLv) btns.push(`<button class="btn wide" type="button" disabled>${b.t === E.HALL ? 'MAX LEVEL' : `Market Hall ${E.hallLevel(state) + 1} needed`}</button>`);
        else {
          const c = E.upgradeCost(b.t, b.lv);
          btns.push(`<button class="btn big wide two" type="button" data-act="upgrade" id="cUp" ${up.ok ? '' : 'disabled'}><span class="row-in">${I('up', 'inl')} UPGRADE TO ${b.lv + 1}</span><span class="sub">${costHtml(c)}</span></button>`);
        }
      }
      if (btns.length) html += `<div class="c-row">${btns.join('')}</div>`;
      const extra = [];
      if (b.t === E.HALL) extra.push(`<button class="btn blue wide" type="button" data-act="hallInfo">${I('hall', 'inl')} Unlock tree</button>`);
      if (d.cat === 'stall' && b.lv >= 1) extra.push(`<button class="btn blue fit" type="button" data-act="skills">${I('star', 'inl')} Skills</button>`);
      if (!job || d.cat === 'decor') extra.push(`<button class="btn ghost fit" type="button" data-act="move">${I('move', 'inl')} Move</button>`);
      if (d.cat === 'decor') extra.push(`<button class="btn ghost fit" type="button" data-act="remove">Sell</button>`);
      if (!up.ok && up.why && !job && b.lv < maxLv && d.cat !== 'decor') html += `<div class="c-info">${esc(up.why)}</div>`;
      if (extra.length) html += `<div class="c-row">${extra.join('')}</div>`;
      card.innerHTML = html;
    }
    // live parts
    if (job) {
      const left = Math.max(0, (job.end - t) / 1000);
      $('cJobFill').style.transform = `scaleX(${Math.min(1, 1 - left / job.dur)})`;
      setText($('cJobText'), (b.lv === 0 ? 'Building · ' : 'Upgrading · ') + ftime(left));
      const g = E.speedUpCost(job, t);
      setHTML($('cSpeedCost'), g === 0 ? 'FREE (under 1 min)' : `${g} ${I('gem', 'inl')}`);
      if ($('cSpeed').disabled === (state.gems >= g)) $('cSpeed').disabled = state.gems < g;
    }
    const live = $('cLive');
    if (live) {
      const hr = E.hourly(state, PK(), b, t);
      if (d.cat === 'stall') setHTML(live, `<span>${I('person', 'inl')} <b>${num(hr.demand)}</b> want food/h</span><span>${I('chefhat', 'inl')} cooks <b>${num(hr.capacity)}</b>/h</span><span>${I('cash', 'inl')} <b>${money(hr.revenue)}</b>/h</span>`);
      else if (d.makes) setHTML(live, Object.entries(hr.makes).map(([k, v]) => `<span>${I(E.ING[k].icon, 'inl')} <b>+${num(v)}</b>/h</span>`).join('') + `<span>${I('cash', 'inl')} wages <b>${money(hr.wages)}</b>/h</span>`);
    }
  }

  // =====================================================================
  //  Placement (building and moving)
  // =====================================================================
  function findSpot(t) {
    const pk = park(), d = def(t);
    const anchor = PK() === 0 && (E.hallB(state) || pk.b[0]);
    const far = d.cat === 'farm' || d.cat === 'water';
    const cx = anchor ? anchor.x + 1 : 12, cy = anchor ? anchor.y + 1 : 12;
    let best = null, bd = 1e9;
    for (let y = 0; y < E.CELLS; y++) for (let x = 0; x < E.CELLS; x++) {
      if (!E.fits(pk, t, x, y, -1)) continue;
      let dist = Math.abs(x + d.w / 2 - cx) + Math.abs(y + d.h / 2 - cy);
      if (far) dist = -dist;
      if (dist < bd) { bd = dist; best = [x, y]; }
    }
    return best;
  }
  function startPlacing(t, moveU) {
    const b = moveU ? E.findB(state, PK(), moveU) : null;
    const spot = b ? [b.x, b.y] : findSpot(t);
    if (!spot) {
      toast(`${I('land', 'inl')} No room for a ${esc(def(t).name)}. <b>Buy more land!</b> Tap a FOR SALE sign.`, 3200);
      feedback('error');
      return;
    }
    closePanel();
    placing = { t, moveU: moveU || 0, x: spot[0], y: spot[1], ok: true };
    if (!use3d) { confirmPlace(); return; }
    W3.startPlacement({ t, x: spot[0], y: spot[1], moveU: moveU || 0, lv: b ? b.lv : 1 }, state);
    W3.focusCell(spot[0], spot[1]);
    renderCard();
    renderPlaceBar();
  }
  function renderPlaceBar() {
    const bar = $('placeBar');
    if (!placing) { bar.hidden = true; return; }
    const d = def(placing.t);
    bar.hidden = false;
    const tip = d.cat === 'decor' && d.bonus ? `Boosts stalls within ${d.radius} cell${d.radius > 1 ? 's' : ''} by +${Math.round(d.bonus * 100)}%` : 'Drag it around, then tap Build';
    setHTML(bar, `<div class="c-head"><div class="c-icon">${I(d.icon)}</div><div class="c-title"><div class="c-name">${placing.moveU ? 'Move ' : ''}${esc(d.name)}</div>
      <div class="c-sub">${tip}</div></div></div>
      <div class="c-row"><button class="btn red fit" type="button" data-act="cancelPlace">✕</button>
      <button class="btn big wide two" type="button" data-act="confirmPlace" id="placeOk" ${placing.ok ? '' : 'disabled'}><span class="row-in">${I('check', 'inl')} ${placing.moveU ? 'PLACE HERE' : 'BUILD HERE'}</span>
      <span class="sub">${placing.moveU ? (placing.ok ? 'Free' : 'Blocked') : placing.ok ? costHtml({ cash: d.cost, time: d.time }) : 'Something is in the way'}</span></button></div>`);
  }
  function confirmPlace() {
    if (!placing) return;
    const p = use3d ? W3.placement() : placing;
    if (!p || !p.ok) { feedback('error'); return; }
    let u = 0;
    if (placing.moveU) { if (E.move(state, PK(), placing.moveU, p.x, p.y)) u = placing.moveU; }
    else {
      const b = E.build(state, PK(), placing.t, p.x, p.y, now());
      if (b) {
        u = b.u;
        const d = def(placing.t);
        toast(d.time ? `${I('hammer', 'inl')} Construction started: <b>${esc(d.name)}</b> (${ftime(d.time)})` : `${I(d.icon, 'inl')} <b>${esc(d.name)}</b> placed!`);
      } else toast(esc(E.canBuild(state, PK(), placing.t).why || 'Cannot build here'));
    }
    const timed = !placing.moveU && def(placing.t).time > 0;
    if (use3d) W3.endPlacement();
    placing = null;
    renderPlaceBar();
    if (u) { feedback(timed ? 'build' : 'buy', true); select({ kind: 'b', u }); }
    onStateChanged();
    save();
  }
  function cancelPlace() {
    if (use3d) W3.endPlacement();
    placing = null;
    renderPlaceBar();
    renderCard();
  }

  // =====================================================================
  //  Actions
  // =====================================================================
  function onPickBuilding(u) {
    P.Sound.unlock();
    feedback('tap');
    if (!sel || sel.kind !== 'b' || sel.u !== u) select({ kind: 'b', u });
  }
  function onPickCell(x, y, k) {
    P.Sound.unlock();
    feedback('tap');
    if (!park().parcels[k]) select({ kind: 'parcel', k }, true);
    else select(null);
  }
  function jobDone(ev) {
    const d = def(ev.t);
    if (ev.park !== PK()) { toast(`${I(d.icon, 'inl')} <b>${esc(d.name)}</b> in ${esc(E.PARKS[ev.park].name)} is ready!`); return; }
    feedback('milestone', true);
    if (ev.lv === 1) {
      const role = E.ROLE[d.cat];
      toast(`${I(d.icon, 'inl')} <b>${esc(d.name)}</b> is ready!${role ? ` Now give it a ${ROLE_NAME[role].toLowerCase()}.` : ''}`, 3200);
    } else toast(`${I('up', 'inl')} <b>${esc(d.name)}</b> reached <b>level ${ev.lv}</b>!`, 3000);
    if (ev.t === E.HALL) hallLevelUp(ev.lv);
  }
  function hallLevelUp(lv) {
    const lvl = E.hallTree()[lv - 1];
    const items = lvl.items.map(it => `<span class="${it.kind}">${I(it.icon, 'inl')} ${esc(it.text)}</span>`).join('');
    modal({ icon: 'hall', title: `Market Hall level ${lv}!`, body: `<p>Your business can grow bigger:</p><div class="loot">${items}</div>`, actions: [{ label: 'Awesome!', cls: 'gold' }] });
  }
  function worldEvents(list) {
    for (const ev of list) {
      if (ev.type === 'event') {
        const e = E.EVENTS[ev.id];
        feedback('vip', true);
        toast(`${I(e.icon, 'inl')} <b>${esc(e.name)}!</b> ${esc(e.desc)}`, 4200);
      } else if (ev.type === 'weather') {
        if (use3d && W3.setWeather) W3.setWeather(state.settings.weather ? ev.kind : 'sun');
        if (ev.kind === 'rain' || ev.kind === 'snow') toast(`${I(ev.kind, 'inl')} ${ev.kind === 'rain' ? 'Rain' : 'Snow'} is keeping some customers at home.`, 2600);
      }
    }
  }

  const ACT = {
    deselect() { feedback('tap'); select(null); },
    buyParcel() {
      if (!sel || sel.kind !== 'parcel') return;
      const k = sel.k;
      if (!E.buyParcel(state, PK(), k)) { feedback('error'); return; }
      feedback('prestige', true);
      toast(`${I('land', 'inl')} <b>Land bought!</b> Your park just got bigger.`);
      if (use3d) { const px = k % E.PN, py = Math.floor(k / E.PN); W3.sync(state); W3.burst((px * E.PARCEL + 2 - 12) * 4, 3, (py * E.PARCEL + 2 - 12) * 4, 50); }
      select(null);
      onStateChanged();
      save();
    },
    upgrade() {
      if (!sel || sel.kind !== 'b') return;
      if (E.startUpgrade(state, PK(), sel.u, now())) {
        const b = E.findB(state, PK(), sel.u);
        feedback('buy', true);
        toast(`${I('hammer', 'inl')} Upgrading <b>${esc(def(b.t).name)}</b> to level ${b.lv + 1}`);
        onStateChanged(); save();
      } else feedback('error');
    },
    speedUp() {
      if (!sel || sel.kind !== 'b') return;
      const j = E.jobFor(state, PK(), sel.u);
      if (!j) return;
      const g = E.speedUpCost(j, now());
      if (E.speedUp(state, PK(), sel.u, now())) { feedback('vip', true); if (g) toast(`${I('warp', 'inl')} Finished for ${g} ${I('gem', 'inl')}`); }
      else feedback('error');
    },
    instantCard() {
      if (!sel || sel.kind !== 'b') return;
      if (E.useCard(state, 'instant', now(), { park: PK(), u: sel.u })) { feedback('vip', true); toast(`${I('cards', 'inl')} Instant Build used!`); onStateChanged(); }
    },
    move() { if (sel && sel.kind === 'b') { feedback('tap'); const b = E.findB(state, PK(), sel.u); startPlacing(b.t, b.u); } },
    remove() {
      const b = sel && E.findB(state, PK(), sel.u);
      if (!b) return;
      modal({ icon: def(b.t).icon, title: 'Sell decoration?', body: `<p>Sell this ${esc(def(b.t).name)} for <b>${money(Math.round(def(b.t).cost * 0.5))}</b>?</p>`,
        actions: [{ label: 'Sell', cls: 'red', onClick: () => { E.demolish(state, PK(), b.u); select(null); onStateChanged(); save(); } }, { label: 'Keep', cls: 'ghost' }] });
    },
    staffFor(el) { feedback('tap'); openPanel('staff', { park: PK(), u: +el.dataset.u }); },
    openMarket() { feedback('tap'); openPanel('market'); },
    skills() { feedback('tap'); tabs.buildings = 'skills'; openPanel('buildings'); },
    hallInfo() { feedback('tap'); openPanel('hall'); },
    cancelPlace() { feedback('tap'); cancelPlace(); },
    confirmPlace() { confirmPlace(); },
    pickBuild(el) {
      const t = +el.dataset.t, can = E.canBuild(state, PK(), t);
      if (!can.ok) { feedback('error'); toast(esc(can.why)); return; }
      feedback('tap');
      startPlacing(t);
    },
    tab(el) { tabs[el.dataset.panel] = el.dataset.tab; feedback('tap'); renderPanel(); },
    goto(el) { feedback('tap'); const pi = +(el.dataset.p || PK()); closePanel(); if (pi !== PK()) goPark(pi); select({ kind: 'b', u: +el.dataset.u }, true); },
    claimQuest(el) {
      const q = E.claimQuest(state, el.dataset.kind);
      if (!q) return;
      feedback('vip', true);
      const r = el.getBoundingClientRect();
      flyTo('gem', r.left + r.width / 2, r.top, 4);
      onStateChanged();
    },
    claimMission() {
      const m = E.claimMission(state);
      if (!m) { feedback('tap'); const cur = E.mission(state); if (cur) toast(`${I('quests', 'inl')} ${esc(cur.hint)}`, 3600); return; }
      feedback('prestige', true);
      const r = $('missionBar').getBoundingClientRect();
      if (m.cash) flyTo('cash', r.left + 40, r.top + 20, 6);
      if (m.gems) flyTo('gem', r.left + r.width - 40, r.top + 20, 4);
      toast(`${I('check', 'inl')} <b>Mission complete!</b> ${m.cash ? '+' + money(m.cash) : ''} ${m.gems ? `+${m.gems} ${I('gem', 'inl')}` : ''} ${m.tokens ? `+${m.tokens} ${I('token', 'inl')}` : ''}`, 3200);
      if (state.mission === 9) modal({ icon: 'trophy', title: 'Tutorial complete!', body: '<p>You know how to run the business now: <b>hire</b> staff, <b>grow</b> ingredients, <b>expand</b> your land and <b>upgrade</b> the Market Hall.</p><p>Keep following the missions for big rewards.</p>', actions: [{ label: "Let's grow!", cls: 'gold' }] });
      onStateChanged(); save();
    },
    doResearch(el) {
      const r = E.RESEARCH.find(x => x.id === el.dataset.id);
      if (E.doResearch(state, r.id)) { feedback('milestone', true); toast(`${I('flask', 'inl')} <b>${esc(r.name)}</b>: ${esc(r.desc)}!`); onStateChanged(); }
      else feedback('error');
    },
    buySkill(el) {
      if (E.buySkill(state, +el.dataset.t, el.dataset.br)) { feedback('milestone', true); onStateChanged(); }
      else feedback('error');
    },
    hire(el) {
      const target = panelArg;
      const w = E.hire(state, +el.dataset.id);
      if (!w) { feedback('error'); toast(state.workers.length >= E.maxWorkers(state) ? 'Your team is full. Upgrade the Market Hall to employ more.' : 'Not enough cash for the signing fee.'); return; }
      feedback('hire', true);
      if (target && E.assign(state, w.id, target.park, target.u)) {
        const b = E.findB(state, target.park, target.u);
        toast(`${face(w, 'inl')} <b>${esc(w.name)}</b> started work at the ${esc(def(b.t).name)}!`);
        closePanel();
      } else toast(`${face(w, 'inl')} <b>${esc(w.name)}</b> joined your team! Assign them to a building.`);
      onStateChanged(); save();
    },
    assign(el) {
      const target = panelArg;
      if (!target) return;
      if (E.assign(state, +el.dataset.id, target.park, target.u)) {
        const w = state.workers.find(x => x.id === +el.dataset.id), b = E.findB(state, target.park, target.u);
        feedback('milestone', true);
        toast(`${face(w, 'inl')} <b>${esc(w.name)}</b> works at the ${esc(def(b.t).name)} now!`);
        closePanel(); onStateChanged(); save();
      } else feedback('error');
    },
    unassign(el) { E.unassign(state, +el.dataset.id); feedback('tap'); onStateChanged(); },
    train(el) { if (E.train(state, +el.dataset.id)) { feedback('milestone', true); onStateChanged(); } else feedback('error'); },
    fire(el) {
      const w = state.workers.find(x => x.id === +el.dataset.id);
      if (!w) return;
      modal({ icon: face(w, 'big'), title: 'Let them go?', body: `<p>Say goodbye to <b>${esc(w.name)}</b>? You stop paying their ${money(w.wage)}/h wage.</p>`,
        actions: [{ label: 'Let go', cls: 'red', onClick: () => { E.fire(state, w.id); onStateChanged(); save(); } }, { label: 'Keep', cls: 'ghost' }] });
    },
    reroll() {
      if (E.rerollCandidates(state, now(), true)) { feedback('vip', true); onStateChanged(); }
      else feedback('error');
    },
    buyIng(el) {
      const n = el.dataset.n === 'fill' ? 1e9 : +el.dataset.n;
      const got = E.buyIng(state, el.dataset.k, n, now());
      if (!got) { feedback('error'); toast('Not enough cash or no room in storage.'); return; }
      feedback('buy');
      onStateChanged();
    },
    sellIng(el) {
      const got = E.sellIng(state, el.dataset.k, +el.dataset.n);
      if (!got) { feedback('error'); return; }
      feedback('coin');
      onStateChanged();
    },
    fillOrder(el) {
      const i = +el.dataset.i, o = E.fillOrder(state, i, now());
      if (!o) { feedback('error'); return; }
      feedback('register', true);
      const r = el.getBoundingClientRect();
      flyTo('cash', r.left + r.width / 2, r.top, 7);
      toast(`${I('receipt', 'inl')} Delivered to <b>${esc(o.who)}</b>! +${money(o.cash)} +${o.tokens} ${I('token', 'inl')}`, 3000);
      onStateChanged(); save();
    },
    skipOrder(el) { if (E.skipOrder(state, +el.dataset.i, now())) { feedback('tap'); onStateChanged(); } else feedback('error'); },
    useCard(el) {
      const id = el.dataset.id;
      if (!E.useCard(state, id, now())) { feedback('error'); toast(id === 'instant' ? 'Nothing is being built right now.' : id === 'harvest' ? 'You need staffed farms first.' : 'Cannot use that now.'); return; }
      feedback('vip', true);
      toast(`${I(E.CARDS[id].icon, 'inl')} <b>${esc(E.CARDS[id].name)}</b>: ${esc(E.CARDS[id].desc)}`);
      onStateChanged(); save();
    },
    visit(el) { feedback('tap'); goPark(+el.dataset.p, true); },
    unlockPark(el) {
      const i = +el.dataset.p;
      if (!E.unlockPark(state, i)) { feedback('error'); return; }
      feedback('prestige', true);
      const pk = E.PARKS[i];
      modal({ icon: pk.icon, title: 'New location!', body: `<div class="amount">${esc(pk.name)}</div><p>A brand-new park to build. Customers here spend more: <b>×${pk.mult}</b> demand.</p>`,
        actions: [{ label: 'Take me there!', cls: 'gold', onClick: () => goPark(i, true) }] });
      onStateChanged();
    },
    async boostAd() {
      if (state.boostUntil - now() > 20 * 3600 * 1000) { toast('Your boost is almost full (24h max).'); return; }
      if (!(await earnReward())) return;
      E.addBoost(state, now()); feedback('milestone', true); toast(I('rocket', 'inl') + ' <b>2× customers</b> for 4 hours!'); save(); onStateChanged();
    },
    boostGems() { if (E.buyBoost(state, now())) { feedback('milestone', true); toast(I('rocket', 'inl') + ' <b>2× customers</b> for 4 hours!'); onStateChanged(); } else feedback('error'); },
    crate() {
      const r = E.openCrate(state, now());
      if (!r) { feedback('error'); return; }
      feedback('vip', true);
      modal({ icon: r.icon, title: 'Crate opened!', body: `<div class="amount">${esc(r.text)}</div>`, actions: [{ label: 'Awesome!', cls: 'gold' }] });
      onStateChanged();
    },
    buyBuilder() {
      if (E.buyBuilder(state)) { feedback('prestige', true); toast(`${I('builder', 'inl')} <b>A new builder joins your crew!</b>`); onStateChanged(); save(); }
      else feedback('error');
    },
    speedJob(el) {
      const j = state.jobs[+el.dataset.k];
      if (j && E.speedUp(state, j.park, j.u, now())) { feedback('vip', true); onStateChanged(); } else feedback('error');
    },
    hallUp() {
      const hb = E.hallB(state);
      if (hb && E.startUpgrade(state, 0, hb.u, now())) { feedback('buy', true); toast(`${I('hammer', 'inl')} Upgrading the <b>Market Hall</b>!`); closePanel(); if (PK() === 0) select({ kind: 'b', u: hb.u }, true); onStateChanged(); save(); }
      else feedback('error');
    },
    buildHall() { feedback('tap'); startPlacing(E.HALL); },
    async iap(el) { const owned = await P.Store.buy(el.dataset.id); if (owned) applyPurchases(owned, true); },
    async restore() { const owned = await P.Store.restore(); if (owned) { applyPurchases(owned, true); toast('Purchases restored.'); } else toast('Nothing to restore.'); },
    achInfo(el) { const a = E.ACHIEVEMENTS[+el.dataset.i]; toast(`${I(a.icon, 'inl')} <b>${esc(a.name)}</b><br>${esc(a.desc)}${state.achievements[a.id] ? ' (earned)' : ''}`); },
    reset() {
      modal({ icon: 'lock', title: 'Delete save?', body: '<p>This erases <b>everything</b>: your business, staff and gems. Purchases can be restored from the Store.</p>',
        actions: [{ label: 'Delete everything', cls: 'red', onClick: () => {
          const keep = { premium: state.premium, adsRemoved: state.adsRemoved };
          P.Storage.clear();
          state = E.newState();
          Object.assign(state, keep);
          goPark(0, true);
          save();
        } }, { label: 'Cancel', cls: 'ghost' }] });
    },
  };
  function applyPurchases(owned, announce) {
    let changed = false;
    if (owned.includes(P.CONFIG.products.premium) && !state.premium) { state.premium = true; changed = true; if (announce) toast(I('crown', 'inl') + ' Premium unlocked: +50% customers forever!'); }
    if (owned.includes(P.CONFIG.products.vipPass) && !state.adsRemoved) { state.adsRemoved = true; changed = true; if (announce) toast(I('star', 'inl') + ' VIP Pass active: no more ads!'); }
    if (changed) { save(); onStateChanged(); }
  }
  function goPark(i, sweep) {
    if (!state.parks[i].unlocked) return;
    state.park = i;
    closePanel();
    select(null);
    if (use3d) { W3.loadPark(i, state); focusHome(true); if (sweep) W3.intro(); }
    onStateChanged();
    save();
  }
  function focusHome(instant) {
    if (!use3d) return;
    const hb = PK() === 0 ? (E.hallB(state) || park().b[0]) : null;
    if (hb) W3.focusAt((hb.x + 1 - 12) * 4, (hb.y + 1 - 12) * 4 + 4, instant, 80);
    else W3.focusAt(0, -4, instant, 92);
  }

  // =====================================================================
  //  Windows
  // =====================================================================
  const PANELS = {
    build: { icon: 'hammer', title: 'Build', render: renderBuild },
    hall: { icon: 'hall', title: 'Market Hall', render: renderHall },
    buildings: { icon: 'shop', title: 'Your Business', render: renderBuildings },
    quests: { icon: 'quests', title: 'Goals', render: renderQuests },
    research: { icon: 'flask', title: 'Research', render: renderResearch },
    store: { icon: 'bag', title: 'Store', render: renderStore },
    staff: { icon: 'chefhat', title: 'Staff', render: renderStaff },
    world: { icon: 'map', title: 'World', render: renderWorld },
    builders: { icon: 'builder', title: 'Builders', render: renderBuilders },
    profile: { icon: 'chefhat', title: 'Profile', render: renderProfile },
    market: { icon: 'crate', title: 'Stock & Market', render: renderMarket },
    orders: { icon: 'receipt', title: 'Orders', render: renderOrders },
    report: { icon: 'chart', title: 'Daily Report', render: renderReport },
    cards: { icon: 'cards', title: 'Cards', render: renderCards },
    ranks: { icon: 'trophy', title: 'Top Tycoons', render: renderRanks },
  };
  function openPanel(name, arg) {
    if (placing) cancelPlace();
    panel = name; panelArg = arg === undefined ? null : arg;
    if (name === 'staff' && panelArg) tabs.staff = 'team';
    $('panelIcon').innerHTML = I(PANELS[name].icon);
    $('panelTitle').textContent = PANELS[name].title;
    $('panel').hidden = false;
    $('panelBody').scrollTop = 0;
    renderPanel();
    document.querySelectorAll('.nav button[data-panel]').forEach(b => toggle(b, 'on', b.dataset.panel === name));
    updateMission();
    if (name === 'profile' || name === 'store') maybeDaily();
  }
  function closePanel() {
    panel = null;
    $('panel').hidden = true;
    document.querySelectorAll('.nav button[data-panel]').forEach(b => toggle(b, 'on', false));
    updateMission();
  }
  function renderPanel() {
    if (!panel) return;
    const body = $('panelBody'), top = body.scrollTop;
    body.innerHTML = PANELS[panel].render(now());
    body.scrollTop = top;
    refreshButtons(body);
  }
  function refreshButtons(root) {
    root.querySelectorAll('button[data-cost],button[data-gems],button[data-tok]').forEach(b => {
      const can = (b.dataset.cost === undefined || state.cash >= +b.dataset.cost) && (b.dataset.tok === undefined || state.tokens >= +b.dataset.tok) && (b.dataset.gems === undefined || state.gems >= +b.dataset.gems);
      if (b.disabled === can) b.disabled = !can;
    });
  }
  const row = (icon, title, sub, right, cls) => `<div class="row ${cls || ''}"><div class="r-icon">${icon}</div><div class="r-main"><div class="r-title">${title}</div><div class="r-sub">${sub}</div></div>${right || ''}</div>`;
  const seg = (pn, list) => `<div class="seg">${list.map(([k, ic, n]) => `<button type="button" class="${tabs[pn] === k ? 'on' : ''}" data-act="tab" data-panel="${pn}" data-tab="${k}">${I(ic, 'inl')} ${n}</button>`).join('')}</div>`;

  const SHORT = { 'Upgrade the Market Hall to build more': 'Hall upgrade needed', 'All builders are busy': 'Builders busy', 'You own the maximum': 'Maximum owned' };
  function renderBuild() {
    let html = seg('build', [['stall', 'shop', 'Food'], ['farm', 'wheat', 'Farms'], ['decor', 'planter', 'Decor']]);
    const tab = tabs.build;
    html += `<p class="hint">${tab === 'decor' ? 'Decorations bring more customers to the stalls around them. Bins keep your park clean.' : tab === 'farm' ? 'Farms grow ingredients for your stalls. Each needs a farmer (or a fisher for ponds). Warehouses store more.' : 'Food stalls sell dishes to customers. Each dish uses ingredients, and every stall needs a cook.'}</p><div class="grid2">`;
    E.DEFS.forEach((d, t) => {
      const cat = d.cat === 'water' || d.cat === 'storage' ? 'farm' : d.cat;
      if (cat !== tab || t === E.HALL) return;
      const can = E.canBuild(state, PK(), t), have = E.countType(state, t), max = E.maxCount(state, t);
      const locked = E.hallLevel(state) < d.hall;
      const what = d.cat === 'stall' ? `${money(d.price)} · ${recipeHtml(d.recipe)}` : d.makes ? Object.entries(d.makes).map(([k, v]) => `${I(E.ING[k].icon, 'inl')} ${v}/h`).join(' ')
        : d.store ? `+${num(d.store)} storage` : d.clean ? 'Keeps it clean' : `+${Math.round(d.bonus * 100)}% · ${d.radius} cell${d.radius > 1 ? 's' : ''}`;
      html += `<div class="tile ${locked ? 'locked' : ''}"><span class="own">${locked ? '' : `${have}/${max}`}</span><span class="size">${d.w}×${d.h}</span>
        <div class="em">${I(d.icon)}</div><div class="nm">${esc(d.name)}</div>
        <div class="st">${locked ? `${I('lock', 'inl')} Market Hall ${d.hall}` : what}</div>
        ${locked ? '' : `<button class="btn small two" type="button" data-act="pickBuild" data-t="${t}" ${can.ok ? '' : 'disabled'}><span>${d.cost ? money(d.cost) : 'Free'}</span><span class="sub">${can.ok ? (d.time ? ftime(d.time) : 'Instant') : esc(SHORT[can.why] || can.why)}</span></button>`}</div>`;
    });
    return html + '</div>';
  }

  function renderHall() {
    const hl = E.hallLevel(state), hb = E.hallB(state), job = hb && E.jobFor(state, 0, hb.u);
    if (!hb) {
      const can = E.canBuild(state, 0, E.HALL);
      return `<div class="hero"><div class="big">${I('hall')}</div><h3>No Market Hall yet</h3><p>The Market Hall is the heart of your business. It unlocks new buildings, more staff, land and upgrades.</p></div>
        <button class="btn gold big wide two" type="button" data-act="buildHall" ${can.ok ? '' : 'disabled'}><span class="row-in">${I('hammer', 'inl')} BUILD IT</span><span class="sub">${costHtml({ cash: def(E.HALL).cost, time: def(E.HALL).time })}</span></button>${can.ok ? '' : `<p class="fine">${esc(can.why)}</p>`}`;
    }
    let html = `<div class="hero"><div class="big">${I('hall')}</div><h3>Level ${hl}${job ? ' → ' + (hl + 1) + ' (upgrading)' : ''}</h3>
      <p>Staff ${state.workers.length}/${E.maxWorkers(state)} · Land ${E.parcelCount(state)}/${E.maxParcels(state)} · Builders ${E.builderCount(state)}</p></div>`;
    if (hl < E.HALL_MAX && !job) {
      const c = E.upgradeCost(E.HALL, hl), can = E.canUpgrade(state, 0, hb.u);
      html += `<button class="btn gold big wide two" type="button" data-act="hallUp" ${can.ok ? '' : 'disabled'}><span class="row-in">${I('up', 'inl')} UPGRADE TO ${hl + 1}</span><span class="sub">${costHtml(c)}</span></button>${can.ok ? '' : `<p class="fine">${esc(can.why)}</p>`}`;
    }
    html += '<div class="sect">Unlock tree</div><div class="tree">';
    for (const lvl of E.hallTree()) {
      if (lvl.lv > hl + 6 && lvl.lv > 8) break;
      const st = lvl.lv <= hl ? 'done' : lvl.lv === hl + 1 ? 'next' : 'later';
      html += `<div class="tnode ${st}"><div class="tlv">${lvl.lv}</div><div class="titems">${lvl.items.filter(it => it.kind !== 'perk' || st === 'next' || it.text.includes('builder')).map(it => `<span class="${it.kind}">${I(it.icon, 'inl')} ${esc(it.text)}</span>`).join('')}</div></div>`;
    }
    return html + '</div>';
  }

  function statusOf(b, t) {
    const d = def(b.t), job = E.jobFor(state, PK(), b.u);
    if (job) return { txt: `${b.lv === 0 ? 'Building' : 'Upgrading'} · ${ftime((job.end - t) / 1000)}`, cls: '' };
    if (!E.ROLE[d.cat]) return { txt: d.cat === 'storage' ? `+${num(d.store * Math.pow(1.7, b.lv - 1))} storage` : 'Heart of your business', cls: '' };
    const ws = E.workersAt(state, PK(), b.u), hr = E.hourly(state, PK(), b, t);
    if (!ws.length) return { txt: `${I('person', 'inl')} No staff!`, cls: 'warn' };
    if (d.cat === 'stall') return { txt: `${ws.length}/${E.slotsFor(b.t, b.lv)} staff · ${num(hr.sold)} dishes/h · ${money(hr.revenue)}/h${b.starved ? ' · out of ingredients!' : ''}`, cls: b.starved ? 'warn' : '' };
    return { txt: `${ws.length}/${E.slotsFor(b.t, b.lv)} staff · ${Object.entries(hr.makes).map(([k, v]) => `+${num(v)} ${E.ING[k].name.toLowerCase()}/h`).join(', ')}`, cls: '' };
  }
  function renderBuildings(t) {
    let html = seg('buildings', [['list', 'shop', 'Buildings'], ['skills', 'star', 'Skills']]);
    if (tabs.buildings === 'skills') {
      html += '<p class="hint">Skill trees improve every stall of that kind. They cost cash and Food Tokens.</p>';
      const types = [...new Set(state.parks.flatMap(p => p.b.map(b => b.t)))].filter(t2 => def(t2).cat === 'stall');
      if (!types.length) return html + '<div class="empty">Open a food stall first.</div>';
      for (const tp of types) {
        const d = def(tp);
        html += `<div class="sect">${I(d.icon, 'inl')} ${esc(d.name)}</div>`;
        for (const br of E.SKILL_BRANCHES) {
          const tier = E.skillTier(state, tp, br.id), c = tier < 3 ? E.skillCost(tp, tier) : null;
          html += row(I(br.icon), `${esc(br.name)} <span class="pips">${[0, 1, 2].map(k => `<i class="${k < tier ? 'on' : ''}"></i>`).join('')}</span>`, esc(br.desc) + (c ? '<br>' + costHtml(c) : ''),
            c ? `<button class="btn small" type="button" data-act="buySkill" data-t="${tp}" data-br="${br.id}" data-cost="${c.cash}" data-tok="${c.tokens}">Learn</button>` : '<span class="tag">MAX</span>', c ? '' : 'done');
        }
      }
      return html;
    }
    const s = sum();
    html += `<div class="stat-grid"><div><span>Sales</span><b>${money(s.revenue)}/h</b></div><div><span>Profit</span><b class="${s.profit < 0 ? 'neg' : 'pos'}">${money(s.profit)}/h</b></div>
      <div><span>Dishes</span><b>${num(s.dishes)}/h</b></div><div><span>Staff</span><b>${state.workers.length}/${E.maxWorkers(state)}</b></div></div>`;
    const order = { hall: 0, stall: 1, farm: 2, water: 2, storage: 3 };
    const list = park().b.filter(b => def(b.t).cat !== 'decor').sort((a, b) => order[def(a.t).cat] - order[def(b.t).cat] || b.lv - a.lv);
    for (const b of list) {
      const d = def(b.t), st = statusOf(b, t);
      html += row(I(d.icon), `${esc(d.name)} <span class="tag">Lv ${b.lv}</span>`, `<span class="${st.cls}">${st.txt}</span>`,
        `<button class="btn small blue" type="button" data-act="goto" data-u="${b.u}">Go</button>`, st.cls === 'warn' ? 'hot' : '');
    }
    return html;
  }

  function workerCard(w, target) {
    const at = w.at && E.findB(state, w.at.park, w.at.u);
    const here = target && w.at && w.at.park === target.park && w.at.u === target.u;
    const tr = E.TRAITS[w.trait], tc = E.trainCost(w);
    return `<div class="chef worker"><div class="face">${face(w)}<i>Lv ${w.lvl}</i></div><div class="r-main">
      <div class="rar">${I(ROLE_ICON[w.role], 'inl')} ${ROLE_NAME[w.role]} ${stars(w.skill)}</div><div class="r-title">${esc(w.name)}</div>
      <div class="r-sub">${money(w.wage)}/h wage · output ×${E.workerPower(w).toFixed(2)}${tr.name ? ` · <b>${esc(tr.name)}</b> (${esc(tr.desc)})` : ''}</div>
      <div class="r-sub">${at ? `Works at ${I(def(at.t).icon, 'inl')} ${esc(def(at.t).name)}${w.at.park !== PK() ? ' (' + esc(E.PARKS[w.at.park].name) + ')' : ''}` : '<span class="warn">Not working</span>'}</div>
      <div class="acts">
        ${target && !here ? `<button class="btn small gold" type="button" data-act="assign" data-id="${w.id}">${at ? 'Move here' : 'Work here'}</button>` : ''}
        ${at && !target ? `<button class="btn small ghost" type="button" data-act="unassign" data-id="${w.id}">Stop</button>` : ''}
        ${!target ? (w.lvl < 10 ? `<button class="btn small purple" type="button" data-act="train" data-id="${w.id}" data-cost="${tc.cash}" data-tok="${tc.tokens}">Train ${money(tc.cash)}${tc.tokens ? ' + ' + tc.tokens + ' ' + I('token', 'inl') : ''}</button>` : '<span class="tag">MAX</span>') : ''}
        ${!target ? `<button class="btn small ghost" type="button" data-act="fire" data-id="${w.id}">Let go</button>` : ''}
      </div></div></div>`;
  }
  function candidateCard(c) {
    const tr = E.TRAITS[c.trait], fee = E.hireCost(c);
    return `<div class="chef worker cand"><div class="face">${face(c)}</div><div class="r-main">
      <div class="rar">${I(ROLE_ICON[c.role], 'inl')} ${ROLE_NAME[c.role]} ${stars(c.skill)}</div><div class="r-title">${esc(c.name)}</div>
      <div class="r-sub"><b>${money(c.wage)}/h</b> wage · output ×${E.workerPower(c).toFixed(2)}${tr.name ? ` · <b>${esc(tr.name)}</b> (${esc(tr.desc)})` : ''}</div>
      <div class="acts"><button class="btn small gold two" type="button" data-act="hire" data-id="${c.id}" data-cost="${fee}"><span>Hire</span><span class="sub">${money(fee)} fee</span></button></div></div></div>`;
  }
  function renderStaff(t) {
    const target = panelArg && E.findB(state, panelArg.park, panelArg.u) ? panelArg : null;
    const n = state.workers.length, max = E.maxWorkers(state);
    if (target) {
      const b = E.findB(state, target.park, target.u), d = def(b.t), role = E.ROLE[d.cat];
      const ws = E.workersAt(state, target.park, target.u);
      let html = `<div class="sect">${I(d.icon, 'inl')} ${esc(d.name)} · ${ws.length}/${E.slotsFor(b.t, b.lv)} ${ROLE_NAME[role].toLowerCase()}s</div>`;
      html += ws.map(w => workerCard(w, null)).join('');
      if (ws.length < E.slotsFor(b.t, b.lv)) {
        const idle = state.workers.filter(w => w.role === role && !(w.at && w.at.park === target.park && w.at.u === target.u)).sort((a, b2) => !!a.at - !!b2.at || E.workerPower(b2) - E.workerPower(a));
        if (idle.length) html += `<div class="sect">Your ${ROLE_NAME[role].toLowerCase()}s</div>` + idle.map(w => workerCard(w, target)).join('');
        const cands = state.candidates.filter(c => c.role === role);
        html += `<div class="sect">Hire a new ${ROLE_NAME[role].toLowerCase()} · team ${n}/${max}</div>`;
        html += cands.length ? cands.map(candidateCard).join('') : `<div class="empty">No ${ROLE_NAME[role].toLowerCase()}s looking for work right now. New people arrive in ${ftime((state.candAt - t) / 1000)}.</div>`;
        html += rerollRow(t);
      }
      return html;
    }
    if (!n && tabs.staff === 'team' && !panelArg) tabs.staff = 'hire';
    let html = seg('staff', [['team', 'person', `Team ${n}/${max}`], ['hire', 'plus', 'Hire']]);
    const s = sum();
    if (tabs.staff === 'hire') {
      html += `<p class="hint">Pick people who suit the job. Better staff work faster but want higher wages. You pay a signing fee of 8 hours' wages.</p>`;
      html += state.candidates.map(candidateCard).join('') || '<div class="empty">Nobody is looking for work right now.</div>';
      return html + rerollRow(t);
    }
    html += `<p class="hint">Wages: <b>${money(s.wages)}/h</b>. Staff only get paid while they work at a building. Tap a building's empty slot to give it staff.</p>`;
    if (!n) return html + `<div class="empty">${I('person', 'big')}<br>No staff yet. Open the Hire tab.</div>`;
    const sorted = state.workers.slice().sort((a, b) => !!a.at - !!b.at || a.role.localeCompare(b.role) || b.skill - a.skill);
    return html + sorted.map(w => workerCard(w, null)).join('');
  }
  function rerollRow(t) {
    return row(I('cards'), 'New candidates', `Fresh faces arrive in ${ftime((state.candAt - t) / 1000)}`,
      state.cards.reroll ? `<button class="btn small blue" type="button" data-act="reroll">Use card (${state.cards.reroll})</button>` : `<button class="btn small purple" type="button" data-act="reroll" data-gems="${E.COST.reroll}">${E.COST.reroll} ${I('gem', 'inl')}</button>`);
  }

  function renderMarket() {
    const s = sum(), cap = E.invCap(state);
    let html = `<p class="hint">Every ingredient can hold <b>${num(cap)}</b>. Build Warehouses for more room. The market sells at a mark-up, so growing your own is cheaper.</p>`;
    for (const ing of E.INGS) {
      const have = state.inv[ing.id], make = s.makes[ing.id] || 0, use = s.need[ing.id] || 0, net = make - use;
      const unlocked = have > 0 || make > 0 || use > 0 || E.DEFS.some(d => d.makes && d.makes[ing.id] && d.hall <= E.hallLevel(state));
      if (!unlocked) continue;
      const bp = E.buyPrice(state, ing.id);
      html += `<div class="inv-row"><div class="r-icon">${I(ing.icon)}</div><div class="r-main">
        <div class="r-title">${esc(ing.name)} <span class="r-sub">${num(have)} / ${num(cap)}</span></div>
        <div class="pbar ${have < use * 0.5 ? 'low' : ''}"><div style="width:${Math.min(100, have / cap * 100).toFixed(1)}%"></div></div>
        <div class="r-sub">+${num(make)}/h grown · −${num(use)}/h used · <b class="${net < 0 ? 'neg' : 'pos'}">${net >= 0 ? '+' : ''}${num(net)}/h</b>${net < 0 && have > 0 ? ` · empty in ${ftime(have / -net * 3600 / E.TIME_SCALE)}` : ''}</div>
        <div class="acts"><button class="btn small" type="button" data-act="buyIng" data-k="${ing.id}" data-n="10" data-cost="${(bp * 10).toFixed(2)}">Buy 10 · ${money(bp * 10)}</button>
          <button class="btn small" type="button" data-act="buyIng" data-k="${ing.id}" data-n="100" data-cost="${(bp * 100).toFixed(2)}">100 · ${money(bp * 100)}</button>
          <button class="btn small ghost" type="button" data-act="sellIng" data-k="${ing.id}" data-n="10" ${have >= 10 ? '' : 'disabled'}>Sell 10 · ${money(E.sellPrice(ing.id) * 10)}</button></div>
      </div></div>`;
    }
    return html;
  }

  function renderOrders(t) {
    let html = '<p class="hint">Businesses around town want ingredients. Deliver them for cash, Food Tokens and reputation.</p>';
    state.orders.forEach((o, i) => {
      const wait = o.readyAt > t;
      if (wait) { html += row(I('clock'), 'New order coming', `Arrives in ${ftime((o.readyAt - t) / 1000)}`, '', 'locked'); return; }
      const okAll = E.canFill(state, o, t);
      const needs = Object.entries(o.need).map(([k, q]) => `<span class="need ${state.inv[k] >= q ? 'ok' : ''}">${I(E.ING[k].icon, 'inl')} ${num(Math.min(state.inv[k], q))}/${num(q)}</span>`).join('');
      html += `<div class="order ${okAll ? 'ready' : ''}"><div class="o-head">${I('receipt', 'inl')} <b>${esc(o.who)}</b></div><div class="o-need">${needs}</div>
        <div class="o-rew"><span>${I('cash', 'inl')} ${money(o.cash)}</span><span>${I('token', 'inl')} ${o.tokens}</span><span>${I('medal', 'inl')} +${o.rep} rep</span></div>
        <div class="acts"><button class="btn small gold" type="button" data-act="fillOrder" data-i="${i}" ${okAll ? '' : 'disabled'}>Deliver</button>
        <button class="btn small ghost" type="button" data-act="skipOrder" data-i="${i}" data-gems="${E.COST.orderSkip}">Skip ${E.COST.orderSkip} ${I('gem', 'inl')}</button></div></div>`;
    });
    return html;
  }

  function renderReport(t) {
    const s = sum(), L = state.ledger.slice(-7), today = L[L.length - 1];
    const rp = E.repProgress(state), clean = E.cleanliness(state, 0, s.dishes);
    const ev = state.event && state.event.until > t ? E.EVENTS[state.event.id] : null;
    let html = `<div class="sect">Right now (per hour)</div><div class="ledger">
      <span>Sales</span><b class="pos">${money(s.revenue)}</b><span>Sales tax (${Math.round(E.taxRate(state) * 100)}%)</span><b class="neg">−${money(s.tax)}</b>
      <span>Supplies (8%)</span><b class="neg">−${money(s.supplies)}</b><span>Wages</span><b class="neg">−${money(s.wages)}</b>
      <span>Land rent</span><b class="neg">−${money(s.rent)}</b><span class="tot">Profit</span><b class="tot ${s.profit < 0 ? 'neg' : 'pos'}">${money(s.profit)}</b></div>`;
    html += `<div class="stat-grid"><div><span>Customers</span><b>${num(s.customers)}/h</b></div><div><span>Dishes sold</span><b>${num(s.dishes)}/h</b></div>
      <div><span>Reputation</span><b>Lv ${rp.level} <small>${num(rp.have)}/${num(rp.need)}</small></b></div><div><span>Cleanliness</span><b class="${clean < 0.8 ? 'neg' : 'pos'}">${Math.round(clean * 100)}%</b></div>
      <div><span>Weather</span><b>${I(E.WEATHER[state.weather.kind].icon, 'inl')} ${E.WEATHER[state.weather.kind].name}</b></div><div><span>Event</span><b>${ev ? esc(ev.name) : 'None'}</b></div></div>`;
    if (clean < 0.85) html += `<div class="c-info warn">${I('bin', 'inl')} Litter is putting customers off. Build more Trash Bins.</div>`;
    if (L.length) {
      const prof = L.map(e => e.revenue - e.tax - (e.supplies || 0) - e.wages - e.rent - e.market);
      const maxV = Math.max(1, ...L.map(e => e.revenue), ...prof.map(Math.abs));
      const W = 300, H = 120, bw = W / 7;
      let bars = '';
      L.forEach((e, k) => {
        const x = k * bw + 6, rh = e.revenue / maxV * (H - 24), ph = Math.abs(prof[k]) / maxV * (H - 24);
        bars += `<rect x="${x}" y="${H - 16 - rh}" width="${bw / 2 - 4}" height="${rh}" rx="3" fill="#3a86ff"/>`;
        bars += `<rect x="${x + bw / 2 - 2}" y="${H - 16 - ph}" width="${bw / 2 - 4}" height="${ph}" rx="3" fill="${prof[k] >= 0 ? '#45e08a' : '#ff5a6e'}"/>`;
        bars += `<text x="${x + bw / 2 - 4}" y="${H - 3}" text-anchor="middle" font-size="10" fill="#b4c0ea">${esc(e.day.replace('Day ', 'D'))}</text>`;
      });
      html += `<div class="sect">Last ${L.length} days <small>${I('clock', 'inl')} one game day = 48 minutes</small></div>
        <svg class="chart" viewBox="0 0 ${W} ${H}">${bars}</svg><div class="legend"><span><i style="background:#3a86ff"></i>Sales</span><span><i style="background:#45e08a"></i>Profit</span></div>`;
      html += `<div class="sect">${esc(today.day)} so far</div><div class="ledger">
        <span>Dishes sold</span><b>${num(today.dishes)}</b><span>Harvested</span><b>${num(today.harvest)}</b>
        <span>Sales</span><b class="pos">${money(today.revenue)}</b><span>Tax</span><b class="neg">−${money(today.tax)}</b>
        <span>Supplies</span><b class="neg">−${money(today.supplies || 0)}</b><span>Wages</span><b class="neg">−${money(today.wages)}</b>
        <span>Rent</span><b class="neg">−${money(today.rent)}</b><span>Market buys</span><b class="neg">−${money(today.market)}</b>
        <span class="tot">Profit</span><b class="tot ${prof[prof.length - 1] < 0 ? 'neg' : 'pos'}">${money(prof[prof.length - 1])}</b></div>`;
    }
    return html;
  }

  function renderQuests() {
    let html = seg('quests', [['goals', 'quests', 'Goals'], ['awards', 'trophy', 'Awards']]);
    if (tabs.quests === 'awards') {
      const n = Object.keys(state.achievements).length;
      return html + `<p class="hint"><b>${n} / ${E.ACHIEVEMENTS.length}</b> earned · each pays 5 ${I('gem', 'inl')}</p><div class="ach-grid">` +
        E.ACHIEVEMENTS.map((a, i) => `<button class="ach ${state.achievements[a.id] ? 'got' : ''}" type="button" data-act="achInfo" data-i="${i}">${I(a.icon)}</button>`).join('') + '</div>';
    }
    const m = E.mission(state);
    if (m) html += `<div class="sect">Story mission ${state.mission + 1}/${E.MISSIONS.length}</div>` + row(I('star'), esc(m.title), esc(m.hint) + `<br><span class="reward">${I('cash', 'inl')} ${money(m.cash)}</span><span class="reward">${I('gem', 'inl')} ${m.gems}</span>${m.tokens ? `<span class="reward">${I('token', 'inl')} ${m.tokens}</span>` : ''}`,
      m.check(state) ? '<button class="btn gold" type="button" data-act="claimMission">Claim</button>' : '', m.check(state) ? 'hot' : '');
    html += '<div class="sect">Goals</div>';
    const list = E.questList(state);
    return html + list.map(q =>
      row(I(q.icon), esc(q.title), `<span class="reward">${I('gem', 'inl')} ${q.gems}</span><span class="reward">${I('token', 'inl')} ${q.tokens}</span><span class="reward">${I('xp', 'inl')} ${q.xp} XP</span><div class="pbar"><div style="width:${Math.min(100, q.value / q.target * 100).toFixed(1)}%"></div></div>`,
        q.done ? `<button class="btn gold" type="button" data-act="claimQuest" data-kind="${q.kind}">Claim</button>` : `<span class="r-sub"><b>${q.kind === 'earn' ? money(q.value) : num(q.value)}</b>/${q.kind === 'earn' ? money(q.target) : num(q.target)}</span>`,
        q.done ? 'hot' : '')).join('');
  }

  function renderResearch() {
    const hl = E.hallLevel(state);
    let html = `<p class="hint">Research improves your whole business, forever. It costs cash and Food Tokens ${I('token', 'inl')} (from orders, events and goals).</p>`;
    for (const r of E.RESEARCH) {
      const done = E.hasResearch(state, r.id), locked = r.hall > hl;
      html += row(I(r.icon), esc(r.name), `${esc(r.desc)}<br>${done ? 'Researched' : locked ? `${I('lock', 'inl')} Market Hall ${r.hall}` : costHtml({ cash: r.cash, tokens: r.tokens })}`,
        done ? `<span class="tag">${I('check', 'inl')}</span>` : locked ? '' : `<button class="btn" type="button" data-act="doResearch" data-id="${r.id}" data-cost="${r.cash}" data-tok="${r.tokens}">Research</button>`, done ? 'done' : locked ? 'locked' : '');
    }
    return html;
  }

  function renderCards() {
    let html = '<p class="hint">Cards come from crates and daily rewards. Use them when they help most.</p>';
    for (const [id, c] of Object.entries(E.CARDS)) {
      const n = state.cards[id] || 0;
      html += row(I(c.icon), `${esc(c.name)} <span class="tag">×${n}</span>`, esc(c.desc), n ? `<button class="btn small gold" type="button" data-act="useCard" data-id="${id}">Use</button>` : '', n ? '' : 'locked');
    }
    return html;
  }

  function renderRanks(t) {
    const lb = E.leaderboard(state, t);
    const me = lb.findIndex(x => x.you);
    let html = `<p class="hint">The richest food tycoons in the region, by net worth (cash, buildings, land and staff). You are <b>#${me + 1}</b>.</p>`;
    lb.forEach((x, i) => {
      html += `<div class="rank ${x.you ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="who">${x.you ? face({ id: 3 }, 'inl') : I('chefhat', 'inl')} ${esc(x.name)}</span><b>${money(x.worth)}</b></div>`;
    });
    return html;
  }

  function renderWorld() {
    let html = '<p class="hint">Open your business in new places. Each is a fresh map where customers spend more.</p>';
    const COL = [['#46c46e', '#1d7a4c'], ['#4aa3ee', '#1f55a8'], ['#9a6cf5', '#4527a8'], ['#f0509c', '#3a1a6b']];
    E.PARKS.forEach((pk, i) => {
      const open = state.parks[i].unlocked, here = i === PK();
      const n = state.parks[i].b.length;
      html += `<div class="dist ${here ? 'here' : ''} ${open ? '' : 'locked'}" style="--c1:${COL[i][0]};--c2:${COL[i][1]}"><div class="em">${I(pk.icon)}</div><div class="r-main">
        <h3>${esc(pk.name)}</h3><div class="r-sub">Customers ×${pk.mult}${open ? ` · ${n} buildings` : ` · needs Market Hall ${pk.hall}`}</div></div>
        ${here ? '<span class="tag">You are here</span>' : open ? `<button class="btn blue" type="button" data-act="visit" data-p="${i}">Visit</button>`
          : E.hallLevel(state) >= pk.hall ? `<button class="btn gold two" type="button" data-act="unlockPark" data-p="${i}" data-cost="${pk.cost}">Open<span class="sub">${money(pk.cost)}</span></button>` : `<span class="tag">${I('lock', 'inl')}</span>`}</div>`;
    });
    return html;
  }

  function renderBuilders(t) {
    const n = E.builderCount(state);
    let html = `<p class="hint">Builders construct and upgrade buildings. You have <b>${n}</b>. ${E.hallLevel(state) < 4 ? 'You get a second one at Market Hall 4.' : ''}</p>`;
    for (let k = 0; k < n; k++) {
      const j = state.jobs[k];
      if (j) {
        const b = E.findB(state, j.park, j.u), d = def(b.t), left = Math.max(0, (j.end - t) / 1000), g = E.speedUpCost(j, t);
        html += row(I('builder'), `${esc(d.name)} → Lv ${b.lv + 1}`, `${ftime(left)} left${j.park !== PK() ? ' · ' + esc(E.PARKS[j.park].name) : ''}<div class="pbar"><div style="width:${(100 * (1 - left / j.dur)).toFixed(1)}%"></div></div>`,
          `<button class="btn small purple" type="button" data-act="speedJob" data-k="${k}" data-gems="${g}">${g ? g + ' ' + I('gem', 'inl') : 'Free'}</button>`);
      } else html += row(I('builder'), 'Free builder', 'Ready for a job: build or upgrade something!', '', 'hot');
    }
    if (!state.boughtBuilder) html += row(I('builder'), 'Hire another builder', 'A permanent extra builder', `<button class="btn purple" type="button" data-act="buyBuilder" data-gems="${E.COST.builder}">${E.COST.builder} ${I('gem', 'inl')}</button>`);
    return html;
  }

  function renderStore(t) {
    const left = state.boostUntil - t, crate = E.crateStatus(state, t);
    let html = `<div class="sect">Boosts</div>` +
      row(I('rocket'), '2× customers for 4 hours', left > 0 ? `Active: ${ftime(left / 1000)} left · stacks to 24h` : 'Stacks up to 24 hours',
        `<button class="btn small purple" type="button" data-act="boostAd">${state.adsRemoved ? 'Free' : 'Watch'}</button><button class="btn small blue" type="button" data-act="boostGems" data-gems="${E.COST.boost}">${E.COST.boost} ${I('gem', 'inl')}</button>`) +
      row(I('gift'), 'Reward crate', crate.free ? 'Your free crate is ready!' : `Free again in ${ftime(crate.wait)}`,
        crate.free ? '<button class="btn gold" type="button" data-act="crate">Open</button>' : `<button class="btn small blue" type="button" data-act="crate" data-gems="${E.COST.crate}">${E.COST.crate} ${I('gem', 'inl')}</button>`, crate.free ? 'hot' : '') +
      (state.boughtBuilder ? '' : row(I('builder'), 'Extra builder', 'Build and upgrade more at once', `<button class="btn small purple" type="button" data-act="buyBuilder" data-gems="${E.COST.builder}">${E.COST.builder} ${I('gem', 'inl')}</button>`)) +
      `<div class="sect">Premium</div>`;
    [{ id: P.CONFIG.products.premium, icon: I('crown'), title: 'Premium Business', sub: '+50% customers everywhere, forever', owned: state.premium },
     { id: P.CONFIG.products.vipPass, icon: I('star'), title: 'VIP Pass', sub: 'Get every video reward instantly, with no ads', owned: state.adsRemoved }].forEach(it => {
      html += row(it.icon, it.title, it.sub, it.owned ? '<span class="tag">Owned</span>' : P.Store.available ? `<button class="btn gold small" type="button" data-act="iap" data-id="${it.id}">${esc(prices[it.id] || 'Buy')}</button>` : '<span class="tag">In the app</span>', it.owned ? 'done' : '');
    });
    if (P.Store.available) html += '<button class="btn ghost wide" type="button" data-act="restore">Restore purchases</button>';
    return html;
  }
  function renderProfile() {
    const need = E.xpForLevel(state.level), s = sum();
    const stats = [
      ['Profit per hour', money(s.profit)], ['Net worth', money(E.netWorth(state))], ['Sales all time', money(state.stats.earned)],
      ['Dishes sold', num(state.stats.dishes)], ['Market Hall', 'Level ' + E.hallLevel(state)], ['Staff', String(state.workers.length)],
      ['Land expansions', num(state.stats.landBought)], ['Orders filled', num(state.ordersDone)], ['Reputation', 'Level ' + E.repLevel(state)],
      ['VIP visitors', num(state.stats.golden)], ['Time played', ftime(state.stats.playTime)], ['Daily streak', state.daily.streak + (state.daily.streak === 1 ? ' day' : ' days')],
    ];
    const tg = (k, label) => `<label class="toggle"><input type="checkbox" data-set="${k}" ${state.settings[k] ? 'checked' : ''}> ${label}</label>`;
    return `<div class="hero"><div class="big">${face({ id: 3 })}</div><h3>Level ${state.level} Food Tycoon</h3><p>${num(state.xp)} / ${num(need)} XP · each level brings more customers and 10 gems</p></div>
      <div class="sect">Stats</div><div class="stats">${stats.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>
      <div class="sect">Settings</div>${tg('sound', 'Sound effects')}${tg('music', 'Music')}${tg('haptics', 'Vibration')}${use3d ? tg('lens', 'Tilt-shift miniature lens') + tg('weather', 'Rain and snow') : ''}
      <button class="btn red wide" type="button" data-act="reset">Delete save &amp; restart</button>
      <p class="fine"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a> · Yum Empire v${esc(P.CONFIG.version)}</p>`;
  }

  // =====================================================================
  //  HUD, missions and pointer
  // =====================================================================
  function updateHud(t) {
    setText($('cash'), money(state.cash));
    setText($('tokens'), num(Math.floor(state.tokens)));
    setText($('gems'), num(state.gems));
    setText($('lvBadge'), String(state.level));
    const need = E.xpForLevel(state.level);
    $('xpFill').style.width = Math.min(100, state.xp / need * 100).toFixed(1) + '%';
    setText($('xpText'), `${num(state.xp)} / ${num(need)} XP`);
    const pk = E.PARKS[PK()];
    setText($('parkName'), pk.name);
    const pi = $('parkIc');
    if (pi.dataset.ic !== pk.icon) { pi.dataset.ic = pk.icon; window.Icons.hydrate($('parkBtn')); }
    const gc = E.gameClock(t);
    setText($('clockText'), `Day ${E.gameDay(state, t)} · ${String(gc.hour).padStart(2, '0')}:${String(Math.floor(gc.minute / 10) * 10).padStart(2, '0')}`);
    const wx = $('wxIc'), wk = E.WEATHER[state.weather.kind].icon;
    if (wx.dataset.ic !== wk) { wx.dataset.ic = wk; window.Icons.hydrate($('clockBtn')); }
    const free = E.freeBuilders(state), n = E.builderCount(state);
    setText($('builderText'), `${free}/${n}`);
    toggle($('builderBtn'), 'idle', free > 0);
    const s = sum();
    setText($('rates'), (s.profit >= 0 ? '+' : '') + money(s.profit) + '/h');
    toggle($('profitBtn'), 'neg', s.profit < 0);
    const left = state.boostUntil - t;
    toggle($('boostBtn'), 'active', left > 0);
    setText($('boostLabel'), left > 0 ? '2× ' + ftime(left / 1000) : '2× Boost');
    const crate = E.crateStatus(state, t);
    setText($('crateLabel'), crate.free ? 'Free!' : ftime(crate.wait));
    toggle($('crateBtn'), 'ready', crate.free);
    let pills = '';
    if (state.event && state.event.until > t) { const e = E.EVENTS[state.event.id]; pills += `<span class="pill event">${I(e.icon, 'inl')} ${esc(e.name)} · ${ftime((state.event.until - t) / 1000)}</span>`; }
    if (state.rushUntil > t) pills += `<span class="pill event">${I('clock', 'inl')} Rush · ${ftime((state.rushUntil - t) / 1000)}</span>`;
    setHTML($('statusRow'), pills);
  }

  const MISSION_TARGET = ['[data-panel="staff"]', null, '[data-panel="build"]', '[data-panel="staff"]', '[data-panel="build"]', '[data-panel="build"]', '[data-panel="build"]', null,
    '#navHall', '[data-panel="build"]', '[data-panel="build"]', '[data-panel="orders"]', '[data-panel="build"]', null, '#navHall', '[data-panel="build"]', '[data-panel="build"]', '#navHall'];
  function updateMission() {
    const bar = $('missionBar'), m = E.mission(state);
    if (!m) { bar.hidden = true; $('pointer').hidden = true; return; }
    const done = m.check(state);
    bar.hidden = false;
    toggle(bar, 'done', done);
    setHTML(bar, `<span class="m-ic">${I(done ? 'check' : 'star')}</span><span class="m-txt"><small>Mission ${state.mission + 1}</small><b>${esc(m.title)}</b></span><span class="m-go">${done ? 'CLAIM' : I('pointer', 'inl')}</span>`);
    // the bouncing arrow points at the button that helps
    let sel2 = done ? '#missionBar' : MISSION_TARGET[state.mission];
    if (!done && state.mission === 0 && state.workers.some(w => w.role === 'cook')) sel2 = null;
    const ptr = $('pointer');
    const target = sel2 && !panel && !modalOpen && !placing ? document.querySelector(sel2) : null;
    if (!target || state.mission >= 9) { ptr.hidden = true; return; }
    const r = target.getBoundingClientRect(), box = $('app').getBoundingClientRect();
    ptr.hidden = false;
    ptr.innerHTML = I('pointer');
    ptr.style.left = (r.left - box.left + r.width / 2 - 20) + 'px';
    ptr.style.top = (r.top - box.top - 44) + 'px';
    toggle(ptr, 'down', r.top - box.top > 120);
    if (r.top - box.top <= 120) ptr.style.top = (r.bottom - box.top + 4) + 'px';
  }
  function setBadge(id, txt) { const b = $('badge-' + id); if (!b) return; setText(b, txt); toggle(b, 'show', !!txt); }
  function updateBadges() {
    const t = now();
    const q = E.questList(state).filter(x => x.done).length + (E.mission(state) && E.mission(state).check(state) ? 1 : 0);
    setBadge('quests', q ? String(q) : '');
    setBadge('orders', state.orders.some(o => E.canFill(state, o, t)) ? '!' : '');
    const s = sum();
    setBadge('market', Object.keys(s.need).some(k => state.inv[k] < s.need[k] * 0.25) ? '!' : '');
    setBadge('research', E.RESEARCH.some(r => E.canResearch(state, r.id).ok) ? '!' : '');
    setBadge('cards', Object.values(state.cards).some(n => n > 0) ? String(Object.values(state.cards).reduce((a, b) => a + b, 0)) : '');
    setBadge('world', E.PARKS.some((p, i) => !state.parks[i].unlocked && E.hallLevel(state) >= p.hall && state.cash >= p.cost) ? '!' : '');
    setBadge('crate', E.crateStatus(state, t).free ? '!' : '');
    const hb = E.hallB(state);
    setBadge('hall', hb ? (E.canUpgrade(state, 0, hb.u).ok ? '!' : '') : (E.canBuild(state, 0, E.HALL).ok ? '!' : ''));
    const unstaffed = state.parks.some((p, pi) => p.b.some(b => E.ROLE[def(b.t).cat] && b.lv > 0 && !E.workersAt(state, pi, b.u).length));
    setBadge('staff', unstaffed ? '!' : '');
    setBadge('buildings', unstaffed || park().b.some(b => b.starved) ? '!' : '');
    const canBuildSomething = E.freeBuilders(state) > 0 && E.DEFS.some((d, t2) => d.cat !== 'decor' && t2 !== E.HALL && E.canBuild(state, PK(), t2).ok && E.countType(state, t2) === 0);
    setBadge('build', canBuildSomething ? 'New' : '');
  }

  // =====================================================================
  //  VIP, tips, offline, daily
  // =====================================================================
  function scheduleVip(first) { clearTimeout(vipTimer); vipTimer = setTimeout(spawnVip, first ? 90000 : 60000 + Math.random() * 120000); }
  function spawnVip() {
    if (!use3d || document.hidden || modalOpen || panel || placing || !E.hallLevel(state) || !W3.spawnVip()) { scheduleVip(); return; }
    toast(I('crown', 'inl') + ' A <b>food critic</b> is walking by. Find the golden visitor and tap them!', 3600);
    P.Sound.play('vip');
  }
  function claimVip(x, y) {
    P.Sound.unlock();
    const r = E.vipReward(state, now());
    feedback('vip', true);
    toast(`${I('crown', 'inl')} The critic loved it! <b>+${money(r.cash)}</b> +${r.rep} rep${r.gems ? ` +${r.gems} ${I('gem', 'inl')}` : ''}`, 3200);
    flyTo('cash', x, y, 8);
    onStateChanged();
    scheduleVip();
  }
  function onTip(x, y) {
    const amount = E.tip(state, now());
    feedback('coin', true);
    floater('+' + money(amount), x, y - 20);
    flyTo('cash', x, y, 3);
    onStateChanged();
  }
  function catchUp(fromBoot) {
    const t = now(), gap = (t - state.lastSeen) / 1000;
    if (gap < 5) return;
    const cash0 = state.cash, dishes0 = state.stats.dishes, earned0 = state.stats.earned;
    const r = E.tick(state, gap, t);
    state.lastSeen = t;
    const sold = state.stats.dishes - dishes0, sales = state.stats.earned - earned0, profit = state.cash - cash0;
    if (gap > 60 && (sold > 0 || r.done.length)) {
      const fin = r.done.map(ev => `<span>${I(def(ev.t).icon, 'inl')} ${esc(def(ev.t).name)} Lv ${ev.lv}</span>`).join('');
      const cap = gap > E.OFFLINE_CAP_SEC ? `<p class="fine">Your manager covers up to ${ftime(E.OFFLINE_CAP_SEC)} away.</p>` : '';
      modal({ icon: 'moon', title: 'Welcome back!', body: `<p>You were away for ${ftime(gap)}. Your staff kept the business running:</p>
        <div class="loot"><span>${I('noodle', 'inl')} ${num(sold)} dishes</span><span>${I('cash', 'inl')} ${money(sales)} sales</span><span class="${profit < 0 ? 'neg' : ''}">${I('chart', 'inl')} ${profit >= 0 ? '+' : ''}${money(profit)} profit</span>${fin}</div>${cap}`,
        actions: [{ label: 'Let\'s go!', cls: 'gold' }] });
    } else r.done.forEach(jobDone);
    if (!fromBoot) { worldEvents(r.events); onStateChanged(); }
  }
  function maybeDaily() {
    const d = E.dailyStatus(state, now());
    if (!d.available) return;
    const days = Array.from({ length: 7 }, (_, k) => `<div class="${k < d.day ? 'on' : ''}">${k === 6 ? I('rocket', 'inl') : 'Day ' + (k + 1)}</div>`).join('');
    modal({
      icon: 'gift', title: `Daily reward · day ${d.day}`,
      body: `<p>Come back every day for bigger rewards. Day 7 adds a free 4-hour boost!</p><div class="days">${days}</div><div class="loot"><span>${I('cash', 'inl')} ${money(d.cash)}</span><span>${I('gem', 'inl')} ${d.gems}</span>${d.tokens ? `<span>${I('token', 'inl')} ${d.tokens}</span>` : ''}${d.card ? `<span>${I(E.CARDS[d.card].icon, 'inl')} ${esc(E.CARDS[d.card].name)}</span>` : ''}</div>`,
      actions: [{ label: 'Claim', cls: 'gold', onClick: () => { if (E.claimDaily(state, now())) feedback('vip', true); save(); onStateChanged(); } }],
    });
  }

  // =====================================================================
  //  Main loop
  // =====================================================================
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
    if (t - state.lastSeen > 5000) catchUp(false);
    const rawDt = (ts - lastFrame) / 1000;
    const dt = Math.min(0.25, Math.max(0, rawDt));
    lastFrame = ts;
    tickAcc += (t - state.lastSeen) / 1000;
    state.lastSeen = t;
    if (tickAcc >= 0.25) {   // the economy runs four times a second
      const r = E.tick(state, tickAcc, t);
      tickAcc = 0;
      sumCache = null;
      if (r.events.length) worldEvents(r.events);
      if (r.done.length) { r.done.forEach(jobDone); onStateChanged(); save(); }
    }
    if (t >= state.candAt) { E.rerollCandidates(state, t, false); if (panel === 'staff') renderPanel(); }
    if (use3d) { W3.update(dt, state, t); W3.render(); watchPerformance(rawDt); }
    updateHud(t);
    if (sel) renderCard();
    if (ts - lastSlow > 500) {
      lastSlow = ts;
      for (const a of E.checkAchievements(state)) { feedback('milestone', true); toast(`${I(a.icon, 'inl')} <b>${esc(a.name)}</b> earned! +5 ${I('gem', 'inl')}`, 3200); }
      celebrateLevelUps();
      updateBadges();
      updateMission();
      if (panel) { if (['builders', 'buildings', 'market', 'report', 'orders'].includes(panel)) renderPanel(); else refreshButtons($('panelBody')); }
      if (placing && use3d) {
        const p = W3.placement();
        if (p && p.ok !== placing.ok) { placing.ok = p.ok; renderPlaceBar(); }
      }
      if (P.Music) P.Music.update(state, t);
    }
    if (ts - lastSave > 5000) save();
  }

  // =====================================================================
  //  Wiring
  // =====================================================================
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
    delegate($('shopCard')); delegate($('placeBar')); delegate($('panelBody'));
    $('panelBody').addEventListener('change', (ev) => {
      const k = ev.target.dataset && ev.target.dataset.set;
      if (!k) return;
      state.settings[k] = ev.target.checked;
      applySettings();
      save();
    });
    document.querySelectorAll('[data-panel]').forEach(b => b.addEventListener('click', () => {
      P.Sound.unlock(); feedback('tap');
      if (panel === b.dataset.panel) closePanel(); else openPanel(b.dataset.panel);
    }));
    $('panelClose').addEventListener('click', () => { feedback('tap'); closePanel(); });
    $('panel').addEventListener('click', (ev) => { if (ev.target === $('panel')) closePanel(); });
    $('navHall').addEventListener('click', () => {
      P.Sound.unlock(); feedback('tap'); closePanel();
      const hb = E.hallB(state);
      if (PK() !== 0 || !hb) { openPanel('hall'); return; }
      select({ kind: 'b', u: hb.u }, true);
    });
    $('missionBar').addEventListener('click', () => { P.Sound.unlock(); ACT.claimMission(); });
    $('avatarBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('profile'); });
    $('parkBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('world'); });
    $('gemBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('store'); });
    $('clockBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('report'); });
    $('profitBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('report'); });
    $('builderBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('builders'); });
    $('boostBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('store'); });
    $('crateBtn').addEventListener('click', () => { P.Sound.unlock(); if (E.crateStatus(state, now()).free) ACT.crate(); else { feedback('tap'); openPanel('store'); } });
    document.addEventListener('pointerdown', () => { P.Sound.unlock(); if (P.Music && state.settings.music) P.Music.start(); }, { once: false, passive: true });
    P.Lifecycle.onPause(() => { save(); if (P.Music) P.Music.stop(); });
    P.Lifecycle.onResume(() => { lastFrame = performance.now(); });
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) App.addListener('backButton', () => {
      if (modalOpen) return;
      if (placing) cancelPlace(); else if (panel) closePanel(); else if (sel) select(null); else if (App.minimizeApp) App.minimizeApp();
    });
    window.addEventListener('resize', () => updateMission());
  }
  function applySettings() {
    P.Sound.enabled = state.settings.sound; P.Haptics.enabled = state.settings.haptics;
    if (P.Music) { P.Music.enabled = state.settings.music; if (!state.settings.music) P.Music.stop(); }
    if (use3d) { W3.setLens(state.settings.lens); if (W3.setWeather) W3.setWeather(state.settings.weather ? state.weather.kind : 'sun'); }
  }

  async function boot() {
    window.Icons.hydrate(document);
    const raw = await P.Storage.load();
    const isNew = !raw || raw.v !== E.SAVE_VERSION;
    state = E.loadState(raw, now());
    try {
      use3d = !!(W3 && W3.init && W3.init($('city'), {
        onPickBuilding, onPickCell, onPickVip: claimVip, onTip,
        onPickNothing: () => select(null),
        onVipGone: () => scheduleVip(),
        onPlacement: (r) => { if (placing && r) { placing.x = r.x; placing.y = r.y; if (r.ok !== placing.ok) { placing.ok = r.ok; renderPlaceBar(); } } },
      }));
    } catch (e) { console.warn('3D unavailable', e); use3d = false; }
    document.body.classList.add(use3d ? 'has3d' : 'no3d');
    applySettings();
    wire();
    if (!isNew) catchUp(true);
    if (use3d) { W3.loadPark(PK(), state); focusHome(true); if (isNew) W3.intro(); }
    onStateChanged();
    ready = true;
    lastFrame = performance.now();
    if (isNew) {
      modal({ icon: 'noodle', title: 'Welcome, Boss!', body: `<p>You own one little <b>Noodle Cart</b>, ${money(state.cash)} and a few bags of wheat and vegetables.</p>
          <p>But nobody is cooking! <b>Hire your first cook</b> and they will sell noodles by themselves.</p>
          <p>Your job is to run the business: hire staff, grow ingredients, pay wages and grow from one cart into a food empire.</p>`, actions: [{ label: "Let's hire someone!", cls: 'gold' }] });
    } else maybeDaily();
    scheduleVip(true);
    P.Lifecycle.styleStatusBar();
    P.Lifecycle.hideSplash();
    requestAnimationFrame(frame);
    await Promise.all([P.Ads.init(), P.Store.init()]);
    if (P.Store.available) { prices = await P.Store.prices(); const owned = await P.Store.owned(); if (owned) applyPurchases(owned, false); }
  }

  if ('serviceWorker' in navigator && !P.isNative && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

  // For automated tests and debugging
  window.YumEmpire = {
    get state() { return state; }, get use3d() { return use3d; }, get sel() { return sel; }, get panel() { return panel; }, get placing() { return placing; },
    save, sync: onStateChanged, select, openPanel, closePanel, goPark, startPlacing, confirmPlace, act: ACT,
  };
  boot();
})();
