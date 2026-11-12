/*
 * Yum Empire — game controller: connects the rules (engine.js), the 3D park (world.js) and the interface.
 */
(function () {
  'use strict';
  const E = window.Engine, P = window.Platform, W3 = window.World;
  const $ = (id) => document.getElementById(id);
  const money = E.formatMoney, num = E.formatNumber, ftime = E.formatTime;
  const I = (n, c) => window.Icons.svg(n, c);
  const C = (m, c) => window.Icons.chef(m, c);
  const now = () => Date.now();
  const CHEV = '<svg viewBox="0 0 20 20" width="14" height="14"><path d="M7 3 14 10 7 17" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let state = E.newState();
  let use3d = false, ready = false;
  let sel = null;                 // { kind: 'b', u } | { kind: 'parcel', k }
  let placing = null;             // { t, moveU }
  let panel = null, panelArg = null, buildTab = 'stall';
  let lastFrame = performance.now(), lastSave = 0, lastSlow = 0, cardKey = '';
  let vipTimer = null, prices = {}, slowFrames = 0, fastFrames = 0;
  const PK = () => state.park;
  const park = () => state.parks[PK()];

  // ---------- Small helpers ----------
  function setText(el, txt) { if (el && el.textContent !== txt) el.textContent = txt; }
  function setHTML(el, html) { if (el && el._html !== html) { el.innerHTML = html; el._html = html; } }
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
  function floater(html, x, y, cls) {
    const box = $('app').getBoundingClientRect();
    const el = h('div', 'floater' + (cls ? ' ' + cls : ''), html);
    el.style.left = (x - box.left) + 'px';
    el.style.top = (y - box.top) + 'px';
    $('floaters').appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }
  // Coins / ingredients fly from the world into the resource bar
  function flyTo(kind, x, y, n) {
    const target = $(kind === 'cash' ? 'cash' : kind === 'gem' ? 'gems' : 'ing').getBoundingClientRect();
    const box = $('app').getBoundingClientRect();
    for (let k = 0; k < (n || 6); k++) {
      const el = h('div', 'flyer', I(kind === 'cash' ? 'coin' : kind === 'gem' ? 'gem' : 'ingredients'));
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
    setTimeout(() => { const r = $(kind === 'cash' ? 'cash' : kind === 'gem' ? 'gems' : 'ing').parentNode; r.classList.remove('bump'); void r.offsetWidth; r.classList.add('bump'); }, 600);
  }
  function feedback(sound, strong) { P.Sound.play(sound); P.Haptics.tap(strong); }
  const def = (t) => E.DEFS[t];
  const costHtml = (c) => `${c.cash ? `<span class="cost">${I('cash', 'inl')}${money(c.cash)}</span>` : ''}${c.ing ? `<span class="cost">${I('ingredients', 'inl')}${num(c.ing)}</span>` : ''}${c.time ? `<span class="cost">${I('clock', 'inl')}${ftime(c.time)}</span>` : ''}`;

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
    if (!ok) toast('No video available right now — try again soon.');
    return ok;
  }

  // ---------- After anything changes ----------
  function celebrateLevelUps() {
    const ups = E.takeLevelUps(state);
    if (!ups) return;
    feedback('prestige', true);
    toast(`${I('xp', 'inl')} <b>PLAYER LEVEL ${state.level}!</b> +${10 * ups} ${I('gem', 'inl')} and +${Math.round(E.LEVEL_BONUS * 100 * ups)}% income`, 3600);
  }
  function onStateChanged() {
    celebrateLevelUps();
    if (use3d) W3.sync(state);
    renderCard();
    updateHud(now());
    updateBadges();
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
            <div class="c-sub">${adj ? `Grows your park by 16 cells · ${E.parcelCount(state)}/${E.maxParcels(state)} plots` : 'Buy the land next to it first'}</div></div>
            <button class="c-x" type="button" data-act="deselect" aria-label="Close">✕</button></div>
          ${adj ? `<button class="btn gold big wide two" type="button" data-act="buyParcel" ${can.ok ? '' : 'disabled'}><span class="row-in">${I('land', 'inl')} BUY LAND</span><span class="sub">${can.ok || can.why === 'Not enough cash' ? money(E.landPrice(state)) : esc(can.why)}</span></button>` : ''}`;
      }
      return;
    }
    const b = E.findB(state, PK(), sel.u);
    if (!b) { select(null); return; }
    const d = def(b.t), job = E.jobFor(state, PK(), b.u), up = E.canUpgrade(state, PK(), b.u);
    const producer = d.cat === 'stall' || d.cat === 'supply';
    const key = ['b', b.u, b.lv, !!job, b.chef, up.ok, up.why, d.cat].join(':');
    if (key !== cardKey) {
      cardKey = key;
      const chef = E.staffById(state, b.chef);
      const maxLv = E.maxLevel(state, b.t);
      let info = '';
      if (d.cat === 'stall') info = `<span id="cRate"></span> · decor <b>+${Math.round(E.decorBonus(park(), b) * 100)}%</b>`;
      else if (d.cat === 'supply') info = `<span id="cRate"></span>`;
      else if (d.cat === 'decor') info = `+${Math.round(d.bonus * 100)}% to food stalls within ${d.radius} cell${d.radius > 1 ? 's' : ''}`;
      else info = `Level ${b.lv} · unlocks buildings, land and levels`;
      let html = `<div class="c-head"><div class="c-icon">${I(d.icon)}${d.cat !== 'decor' ? `<span class="lv">Lv ${b.lv}</span>` : ''}</div>
        <div class="c-title"><div class="c-name">${esc(d.name)}</div><div class="c-sub">${info}</div></div>
        <button class="c-x" type="button" data-act="deselect" aria-label="Close">✕</button></div>`;
      if (job) {
        html += `<div class="bar"><div class="bar-fill" id="cJobFill"></div><div class="bar-text" id="cJobText"></div></div>
          <div class="c-row"><button class="btn purple wide two" type="button" data-act="speedUp" id="cSpeed"><span class="row-in">${I('warp', 'inl')} FINISH NOW</span><span class="sub" id="cSpeedCost"></span></button></div>`;
      } else if (producer && b.lv >= 1) {
        html += `<div class="bar store"><div class="bar-fill" id="cStoreFill"></div><div class="bar-text" id="cStoreText"></div></div>`;
      }
      const btns = [];
      if (producer && b.lv >= 1) btns.push(`<button class="btn gold fit" type="button" data-act="collect" id="cCollect">${I(d.cat === 'stall' ? 'coin' : 'ingredients', 'inl')}</button>`);
      if (!job && d.cat !== 'decor') {
        if (b.lv >= maxLv) btns.push(`<button class="btn wide" type="button" disabled>${b.t === E.HALL ? 'MAX LEVEL' : `Hall level ${state && E.hallLevel(state) + 1} needed`}</button>`);
        else {
          const c = E.upgradeCost(b.t, b.lv);
          btns.push(`<button class="btn big wide two" type="button" data-act="upgrade" id="cUp" ${up.ok ? '' : 'disabled'}><span class="row-in">${I('up', 'inl')} UPGRADE TO ${b.lv + 1}</span><span class="sub">${costHtml(c)}</span></button>`);
        }
      }
      html += `<div class="c-row">${btns.join('')}</div>`;
      const extra = [];
      if (d.cat === 'stall') extra.push(`<button class="chef-slot" type="button" data-act="chef"><span class="f">${chef ? C(chef) : I('plus')}</span><span><b>${chef ? esc(chef.name) + ' +' + Math.round(E.staffBonus(chef, b.t) * 100) + '%' : 'Add a chef'}</b>${chef ? 'Tap to change' : 'Boosts profit'}</span></button>`);
      if (b.t === E.HALL) extra.push(`<button class="btn blue wide" type="button" data-act="hallInfo">${I('hall', 'inl')} What's next?</button>`);
      if (!job || d.cat === 'decor') extra.push(`<button class="btn ghost fit" type="button" data-act="move">${I('move', 'inl')} Move</button>`);
      if (d.cat === 'decor') extra.push(`<button class="btn ghost fit" type="button" data-act="remove">Sell</button>`);
      if (!up.ok && up.why && !job && b.lv < maxLv && d.cat !== 'decor') html += `<div class="c-info warn">${esc(up.why)}</div>`;
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
    if ($('cStoreFill')) {
      const cap = E.storeCap(state, PK(), b);
      $('cStoreFill').style.transform = `scaleX(${Math.min(1, b.st / Math.max(1, cap))})`;
      setText($('cStoreText'), (d.cat === 'stall' ? money(b.st) : num(b.st)) + ' / ' + (d.cat === 'stall' ? money(cap) : num(cap)));
      if ($('cCollect').disabled === (b.st >= 1)) $('cCollect').disabled = b.st < 1;
    }
    if ($('cRate')) {
      const r = E.rate(state, PK(), b, t);
      setText($('cRate'), d.cat === 'stall' ? money(r) + '/h' : num(r) + ' ingredients/h');
    }
  }

  // =====================================================================
  //  Placement (building and moving)
  // =====================================================================
  function findSpot(t) {
    const pk = park(), d = def(t);
    const hb = E.hallB(state);
    const cx = PK() === 0 && hb ? hb.x + 1 : 12, cy = PK() === 0 && hb ? hb.y + 1 : 12;
    let best = null, bd = 1e9;
    for (let y = 0; y < E.CELLS; y++) for (let x = 0; x < E.CELLS; x++) {
      if (!E.fits(pk, t, x, y, -1)) continue;
      const dist = Math.abs(x + d.w / 2 - cx) + Math.abs(y + d.h / 2 - cy);
      if (dist < bd) { bd = dist; best = [x, y]; }
    }
    return best;
  }
  function startPlacing(t, moveU) {
    const b = moveU ? E.findB(state, PK(), moveU) : null;
    const spot = b ? [b.x, b.y] : findSpot(t);
    if (!spot) {
      toast(`${I('land', 'inl')} No room for a ${esc(def(t).name)}. <b>Buy more land!</b>`, 3200);
      feedback('error');
      return;
    }
    closePanel();
    if (!use3d) {   // no 3D: place straight away
      placing = { t, moveU: moveU || 0, x: spot[0], y: spot[1], ok: true };
      confirmPlace();
      return;
    }
    placing = { t, moveU: moveU || 0, x: spot[0], y: spot[1], ok: true };
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
    const bonus = d.cat === 'decor' ? `Boosts stalls within ${d.radius} cell${d.radius > 1 ? 's' : ''} by +${Math.round(d.bonus * 100)}%` : 'Drag to move it · tap a spot to place';
    setHTML(bar, `<div class="c-head"><div class="c-icon">${I(d.icon)}</div><div class="c-title"><div class="c-name">${placing.moveU ? 'Move ' : ''}${esc(d.name)}</div>
      <div class="c-sub">${bonus}</div></div></div>
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
    if (use3d) W3.endPlacement();
    placing = null;
    renderPlaceBar();
    if (u) { feedback('buy', true); select({ kind: 'b', u }); }
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
  function doCollect(u, x, y) {
    const r = E.collect(state, PK(), u);
    if (!r) return false;
    feedback('coin', true);
    if (x === undefined && use3d) { const p = W3.buildingScreenPos(u); if (p) { x = p.x; y = p.y; } }
    if (x !== undefined) {
      floater('+' + (r.kind === 'cash' ? money(r.amount) : num(r.amount)) + ' ' + I(r.kind === 'cash' ? 'coin' : 'ingredients', 'fl'), x, y - 20, r.kind === 'cash' ? '' : 'ing');
      flyTo(r.kind, x, y, 5);
    }
    if (use3d) W3.pulse(u);
    onStateChanged();
    return true;
  }
  function onPickBuilding(u, x, y) {
    P.Sound.unlock();
    const b = E.findB(state, PK(), u);
    if (!b) return;
    const d = def(b.t);
    const ready = (d.cat === 'stall' || d.cat === 'supply') && b.lv >= 1 && b.st >= Math.max(1, E.storeCap(state, PK(), b) * 0.04);
    if (ready) doCollect(u, x, y);
    else feedback('tap');
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
    if (ev.lv === 1) toast(`${I(d.icon, 'inl')} <b>${esc(d.name)}</b> is open for business!`, 3000);
    else toast(`${I('up', 'inl')} <b>${esc(d.name)}</b> reached <b>level ${ev.lv}</b>!`, 3000);
    if (ev.t === E.HALL) hallLevelUp(ev.lv);
  }
  function hallLevelUp(lv) {
    const unlocked = E.DEFS.filter(d => d.hall === lv && d.cat !== 'hall').map(d => `<span>${I(d.icon, 'inl')} ${esc(d.name)}</span>`).join('');
    const parks = E.PARKS.filter(p => p.hall === lv).map(p => `<span>${I(p.icon, 'inl')} ${esc(p.name)}</span>`).join('');
    modal({ icon: 'hall', title: `Market Hall level ${lv}!`, body: `<p>Your park can now grow bigger:</p><div class="loot">${unlocked}${parks}<span>${I('up', 'inl')} Buildings up to level ${lv}</span><span>${I('land', 'inl')} ${E.maxParcels(state)} land plots</span></div>`,
      actions: [{ label: 'Awesome!', cls: 'gold' }] });
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
    collect() { if (sel && sel.kind === 'b') { const p = $('cCollect').getBoundingClientRect(); doCollect(sel.u, p.left + p.width / 2, p.top); } },
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
    move() { if (sel && sel.kind === 'b') { feedback('tap'); const b = E.findB(state, PK(), sel.u); startPlacing(b.t, b.u); } },
    remove() {
      const b = sel && E.findB(state, PK(), sel.u);
      if (!b) return;
      modal({ icon: def(b.t).icon, title: 'Sell decoration?', body: `<p>Sell this ${esc(def(b.t).name)} for <b>${money(Math.round(def(b.t).cost * 0.5))}</b>?</p>`,
        actions: [{ label: 'Sell', cls: 'red', onClick: () => { E.demolish(state, PK(), b.u); select(null); onStateChanged(); save(); } }, { label: 'Keep', cls: 'ghost' }] });
    },
    chef() { feedback('tap'); openPanel('staff', { assign: sel.u }); },
    hallInfo() { feedback('tap'); openPanel('hall'); },
    cancelPlace() { feedback('tap'); cancelPlace(); },
    confirmPlace() { confirmPlace(); },
    pickBuild(el) {
      const t = +el.dataset.t, can = E.canBuild(state, PK(), t);
      if (!can.ok) { feedback('error'); toast(esc(can.why)); return; }
      feedback('tap');
      startPlacing(t);
    },
    tab(el) { buildTab = el.dataset.tab; feedback('tap'); renderPanel(); },
    goto(el) { feedback('tap'); closePanel(); select({ kind: 'b', u: +el.dataset.u }, true); },
    collectRow(el) { const r = el.getBoundingClientRect(); doCollect(+el.dataset.u, r.left + r.width / 2, r.top); },
    claimQuest(el) {
      const q = E.claimQuest(state, el.dataset.kind);
      if (!q) return;
      feedback('vip', true);
      const r = el.getBoundingClientRect();
      flyTo('gem', r.left + r.width / 2, r.top, 4);
      onStateChanged();
    },
    research(el) {
      const r = E.RESEARCH.find(x => x.id === el.dataset.id);
      if (E.research(state, r.id)) { feedback('milestone', true); toast(`${I('flask', 'inl')} <b>${esc(r.name)}</b>: ${esc(r.sub)} ×${r.mult}!`); onStateChanged(); }
      else feedback('error');
    },
    recruit() {
      const m = E.recruit(state, now());
      if (!m) { feedback('error'); return; }
      const r = E.RARITIES[m.rarity], spec = def(m.spec);
      feedback(m.rarity >= 2 ? 'prestige' : 'vip', true);
      modal({ icon: C(m, 'big'), title: `${r.name} chef!`, body: `<div class="amount" style="color:${r.color}">${esc(m.name)}</div><p><b>+${Math.round(E.staffBonus(m, -1) * 100)}%</b> profit for the stall they work at.</p><p>Loves ${I(spec.icon, 'inl')} <b>${esc(spec.name)}</b> (+50% more there)</p>`,
        actions: [{ label: 'Welcome aboard!', cls: 'gold' }] });
      onStateChanged();
    },
    assign(el) {
      if (E.assignStaff(state, +el.dataset.id, PK(), +el.dataset.u)) {
        const m = E.staffById(state, +el.dataset.id);
        feedback('milestone', true);
        toast(`${C(m, 'inl')} <b>${esc(m.name)}</b> is cooking here now!`);
        closePanel(); onStateChanged();
      }
    },
    unassign(el) { E.unassignStaff(state, +el.dataset.id); feedback('tap'); onStateChanged(); },
    staffUp(el) { if (E.upgradeStaff(state, +el.dataset.id)) { feedback('milestone', true); onStateChanged(); } else feedback('error'); },
    dismiss(el) {
      const m = E.staffById(state, +el.dataset.id);
      if (!m) return;
      modal({ icon: C(m, 'big'), title: 'Dismiss chef?', body: `<p>Say goodbye to <b>${esc(m.name)}</b>? You get 3 ${I('gem', 'inl')} back.</p>`,
        actions: [{ label: 'Dismiss', cls: 'red', onClick: () => { E.dismissStaff(state, m.id); onStateChanged(); } }, { label: 'Keep', cls: 'ghost' }] });
    },
    visit(el) { feedback('tap'); goPark(+el.dataset.p, true); },
    unlockPark(el) {
      const i = +el.dataset.p;
      if (!E.unlockPark(state, i)) { feedback('error'); return; }
      feedback('prestige', true);
      const pk = E.PARKS[i];
      modal({ icon: pk.icon, title: 'New location!', body: `<div class="amount">${esc(pk.name)}</div><p>A brand-new park to build. Every stall here earns <b>×${pk.mult}</b>.</p>`,
        actions: [{ label: 'Take me there!', cls: 'gold', onClick: () => goPark(i, true) }] });
      onStateChanged();
    },
    async boostAd() {
      if (state.boostUntil - now() > 20 * 3600 * 1000) { toast('Your boost is almost full (24h max).'); return; }
      if (!(await earnReward())) return;
      E.addBoost(state, now()); feedback('milestone', true); toast(I('rocket', 'inl') + ' <b>2× income</b> for 4 hours!'); save(); onStateChanged();
    },
    boostGems() { if (E.buyBoost(state, now())) { feedback('milestone', true); toast(I('rocket', 'inl') + ' <b>2× income</b> for 4 hours!'); onStateChanged(); } else feedback('error'); },
    warp() {
      const r = E.timeWarp(state, now());
      if (!r) { feedback('error'); return; }
      feedback('vip', true);
      toast(`${I('warp', 'inl')} Time warp! <b>+${money(r.cash)}</b> and <b>+${num(r.ing)}</b> ingredients`);
      onStateChanged();
    },
    crate() {
      const r = E.openCrate(state, now());
      if (!r) { feedback('error'); return; }
      feedback(r.type === 'staff' ? 'prestige' : 'vip', true);
      modal({ icon: r.type === 'staff' ? C(r.staff, 'big') : r.icon, title: 'Crate opened!', body: `<div class="amount">${esc(r.text)}</div>${r.type === 'staff' ? `<p>Loves ${I(def(r.staff.spec).icon, 'inl')} ${esc(def(r.staff.spec).name)}. Assign them in Chefs.</p>` : ''}`,
        actions: [{ label: 'Awesome!', cls: 'gold' }] });
      onStateChanged();
    },
    buyBuilder() {
      if (E.buyBuilder(state)) { feedback('prestige', true); toast(`${I('builder', 'inl')} <b>A new builder joins your crew!</b>`); onStateChanged(); save(); }
      else feedback('error');
    },
    async iap(el) { const owned = await P.Store.buy(el.dataset.id); if (owned) applyPurchases(owned, true); },
    async restore() { const owned = await P.Store.restore(); if (owned) { applyPurchases(owned, true); toast('Purchases restored.'); } else toast('Nothing to restore.'); },
    achInfo(el) { const a = E.ACHIEVEMENTS[+el.dataset.i]; toast(`${I(a.icon, 'inl')} <b>${esc(a.name)}</b><br>${esc(a.desc)}${state.achievements[a.id] ? ' (earned)' : ''}`); },
    reset() {
      modal({ icon: 'lock', title: 'Delete save?', body: '<p>This erases <b>everything</b>: your parks, gems and chefs. Purchases can be restored from the Store.</p>',
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
    if (owned.includes(P.CONFIG.products.premium) && !state.premium) { state.premium = true; changed = true; if (announce) toast(I('crown', 'inl') + ' Permanent 2× income unlocked!'); }
    if (owned.includes(P.CONFIG.products.vipPass) && !state.adsRemoved) { state.adsRemoved = true; changed = true; if (announce) toast(I('star', 'inl') + ' VIP Pass active — no more ads!'); }
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
    const hb = PK() === 0 ? E.hallB(state) : null;
    if (hb) W3.focusAt((hb.x + 1 - 12) * 4 + 4, (hb.y + 1 - 12) * 4 + 4, instant, 92);
    else W3.focusAt(0, -4, instant, 92);
  }

  // =====================================================================
  //  Windows
  // =====================================================================
  const PANELS = {
    build: { icon: 'hammer', title: 'Build', render: renderBuild },
    hall: { icon: 'hall', title: 'Market Hall', render: renderHall },
    buildings: { icon: 'shop', title: 'Your Park', render: renderBuildings },
    quests: { icon: 'quests', title: 'Quests', render: renderQuests },
    research: { icon: 'flask', title: 'Research', render: renderResearch },
    awards: { icon: 'trophy', title: 'Awards', render: renderAwards },
    store: { icon: 'bag', title: 'Store', render: renderStore },
    staff: { icon: 'chefhat', title: 'Chefs', render: renderStaff },
    world: { icon: 'map', title: 'World', render: renderWorld },
    builders: { icon: 'builder', title: 'Builders', render: renderBuilders },
    profile: { icon: 'chefhat', title: 'Profile', render: renderProfile },
  };
  function openPanel(name, arg) {
    if (placing) cancelPlace();
    panel = name; panelArg = arg === undefined ? null : arg;
    $('panelIcon').innerHTML = I(PANELS[name].icon);
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
      const can = (b.dataset.cost === undefined || state.cash >= +b.dataset.cost) && (b.dataset.ing === undefined || state.ing >= +b.dataset.ing) && (b.dataset.gems === undefined || state.gems >= +b.dataset.gems);
      if (b.disabled === can) b.disabled = !can;
    });
  }
  const row = (icon, title, sub, right, cls) => `<div class="row ${cls || ''}"><div class="r-icon">${icon}</div><div class="r-main"><div class="r-title">${title}</div><div class="r-sub">${sub}</div></div>${right || ''}</div>`;

  const SHORT = { 'Upgrade the Market Hall to build more': 'Hall upgrade needed', 'All builders are busy': 'Builders busy', 'You own the maximum': 'Maximum owned' };
  function renderBuild() {
    const tabs = [['stall', 'shop', 'Food'], ['supply', 'garden', 'Supply'], ['decor', 'planter', 'Decor']];
    let html = `<div class="seg">${tabs.map(([k, ic, n]) => `<button type="button" class="${buildTab === k ? 'on' : ''}" data-act="tab" data-tab="${k}">${I(ic, 'inl')} ${n}</button>`).join('')}</div>`;
    html += `<p class="hint">${buildTab === 'decor' ? 'Decorations boost every food stall around them. Place them close!' : buildTab === 'supply' ? 'Supply buildings grow the ingredients you need for upgrades.' : 'Food stalls earn cash. Collect it before they fill up.'}</p>`;
    html += `<div class="grid2">`;
    E.DEFS.forEach((d, t) => {
      if (d.cat !== buildTab) return;
      const can = E.canBuild(state, PK(), t), have = E.countType(state, t), max = E.maxCount(state, t);
      const locked = E.hallLevel(state) < d.hall;
      const what = d.cat === 'decor' ? `+${Math.round(d.bonus * 100)}% to stalls within ${d.radius}` : d.cat === 'stall' ? `${money(E.baseOutput(t, 1) * E.PARKS[PK()].mult)}/h` : `${num(E.baseOutput(t, 1) * E.PARKS[PK()].mult)} ingredients/h`;
      html += `<div class="tile ${locked ? 'locked' : ''}"><span class="own">${locked ? '' : `${have}/${max}`}</span><span class="size">${d.w}×${d.h}</span>
        <div class="em">${I(d.icon)}</div><div class="nm">${esc(d.name)}</div>
        <div class="st">${locked ? `${I('lock', 'inl')} Market Hall ${d.hall}` : what}</div>
        ${locked ? '' : `<button class="btn small two" type="button" data-act="pickBuild" data-t="${t}" ${can.ok ? '' : 'disabled'}><span>${d.cost ? money(d.cost) : 'Free'}</span><span class="sub">${can.ok ? (d.time ? ftime(d.time) : 'Instant') : esc(SHORT[can.why] || can.why)}</span></button>`}</div>`;
    });
    return html + '</div>';
  }

  function renderHall() {
    const hl = E.hallLevel(state), hb = E.hallB(state), job = E.jobFor(state, 0, hb.u);
    const next = hl + 1;
    let html = `<div class="hero"><div class="big">${I('hall')}</div><h3>Level ${hl}${job ? ' → ' + next + ' (upgrading)' : ''}</h3>
      <p>The Market Hall is the heart of your park. Its level decides what you can build, how many, how high everything can be upgraded and how much land you can own.</p></div>`;
    if (hl < E.HALL_MAX) {
      const items = [];
      E.DEFS.forEach((d, t) => {
        if (d.cat === 'hall') return;
        if (d.hall === next) items.push(`${I(d.icon, 'inl')} New: <b>${esc(d.name)}</b>`);
        else if (d.hall < next) {
          const a = Math.min(d.cap, d.n0 + Math.floor((hl - d.hall) / d.every)), b = Math.min(d.cap, d.n0 + Math.floor((next - d.hall) / d.every));
          if (b > a) items.push(`${I(d.icon, 'inl')} ${esc(d.name)}: ${a} → <b>${b}</b>`);
        }
      });
      E.PARKS.forEach(p => { if (p.hall === next) items.push(`${I(p.icon, 'inl')} New location: <b>${esc(p.name)}</b>`); });
      items.push(`${I('up', 'inl')} Buildings up to level <b>${next}</b>`);
      items.push(`${I('land', 'inl')} Land plots: ${E.maxParcels(state)} → <b>${Math.min(E.PN * E.PN, 2 + next * 2)}</b>`);
      if (next === 4) items.push(`${I('builder', 'inl')} <b>A second builder</b>`);
      html += `<div class="sect">Level ${next} unlocks</div><div class="unlocks">${items.map(x => `<div>${x}</div>`).join('')}</div>`;
      const c = E.upgradeCost(E.HALL, hl), can = E.canUpgrade(state, 0, hb.u);
      if (!job) html += `<button class="btn gold big wide two" type="button" data-act="hallUp" ${can.ok ? '' : 'disabled'}><span class="row-in">${I('up', 'inl')} UPGRADE TO ${next}</span><span class="sub">${costHtml(c)}</span></button>${can.ok ? '' : `<p class="fine">${esc(can.why)}</p>`}`;
    } else html += '<div class="empty">Your Market Hall is at its maximum level!</div>';
    return html;
  }
  ACT.hallUp = () => {
    const hb = E.hallB(state);
    if (E.startUpgrade(state, 0, hb.u, now())) { feedback('buy', true); toast(`${I('hammer', 'inl')} Upgrading the <b>Market Hall</b>!`); closePanel(); if (PK() === 0) select({ kind: 'b', u: hb.u }, true); onStateChanged(); save(); }
    else feedback('error');
  };

  function renderBuildings(t) {
    const pk = park(), list = pk.b.filter(b => def(b.t).cat !== 'decor').sort((a, b) => (def(a.t).cat === 'hall' ? -1 : 0) - (def(b.t).cat === 'hall' ? -1 : 0) || b.st - a.st);
    const tot = E.totals(state, t);
    let html = `<div class="stat-grid"><div><span>Cash per hour</span><b>${money(tot.cash)}</b></div><div><span>Ingredients per hour</span><b>${num(tot.ing)}</b></div>
      <div><span>Decorations</span><b>${pk.b.filter(b => def(b.t).cat === 'decor').length}</b></div><div><span>Land plots</span><b>${pk.parcels.filter(Boolean).length}</b></div></div>`;
    for (const b of list) {
      const d = def(b.t), job = E.jobFor(state, PK(), b.u);
      const producer = d.cat === 'stall' || d.cat === 'supply';
      const sub = job ? `${b.lv === 0 ? 'Building' : 'Upgrading'} · ${ftime((job.end - t) / 1000)}` : producer ? `${d.cat === 'stall' ? money(E.rate(state, PK(), b, t)) + '/h' : num(E.rate(state, PK(), b, t)) + ' ingredients/h'} · stored ${d.cat === 'stall' ? money(b.st) : num(b.st)}` : 'Market Hall';
      html += row(I(d.icon), `${esc(d.name)} <span class="tag">Lv ${b.lv}</span>`, sub,
        `${producer && b.st >= 1 ? `<button class="btn small gold" type="button" data-act="collectRow" data-u="${b.u}">${I(d.cat === 'stall' ? 'coin' : 'ingredients', 'inl')}</button>` : ''}<button class="btn small blue" type="button" data-act="goto" data-u="${b.u}">Go</button>`);
    }
    return html;
  }

  function renderQuests() {
    const list = E.questList(state);
    if (!list.length) return '<div class="empty">' + I('check', 'big') + '<br>Every quest complete!</div>';
    return '<p class="hint">Complete quests for gems and XP. New goals keep coming.</p>' + list.map(q =>
      row(I(q.icon), esc(q.title), `<span class="reward">${I('gem', 'inl')} ${q.gems}</span><span class="reward">${I('xp', 'inl')} ${q.xp} XP</span><div class="pbar"><div style="width:${Math.min(100, q.value / q.target * 100).toFixed(1)}%"></div></div>`,
        q.done ? `<button class="btn gold" type="button" data-act="claimQuest" data-kind="${q.kind}">Claim</button>` : `<span class="r-sub"><b>${q.kind === 'earn' ? money(q.value) : num(q.value)}</b>/${q.kind === 'earn' ? money(q.target) : num(q.target)}</span>`,
        q.done ? 'hot' : '')).join('');
  }

  function renderResearch() {
    const hl = E.hallLevel(state);
    const list = E.RESEARCH.filter(r => !state.upgrades[r.id]).sort((a, b) => (a.hall > hl) - (b.hall > hl) || a.cash - b.cash).slice(0, 24);
    if (!list.length) return '<div class="empty">' + I('check', 'big') + '<br>All research complete!</div>';
    return '<p class="hint">Research makes things earn more, forever.</p>' + list.map(r => {
      const locked = r.hall > hl;
      return row(I(r.icon), esc(r.name), `${esc(r.sub)} ×${r.mult}<br>${locked ? `${I('lock', 'inl')} Market Hall ${r.hall}` : costHtml({ cash: r.cash, ing: r.ing })}`,
        locked ? '' : `<button class="btn" type="button" data-act="research" data-id="${r.id}" data-cost="${r.cash}" data-ing="${r.ing}">Research</button>`, locked ? 'locked' : '');
    }).join('');
  }

  function renderStaff(t) {
    const st = E.recruitStatus(state, t);
    const target = panelArg && panelArg.assign ? E.findB(state, PK(), panelArg.assign) : (sel && sel.kind === 'b' && def(E.findB(state, PK(), sel.u) ? E.findB(state, PK(), sel.u).t : 0).cat === 'stall' ? E.findB(state, PK(), sel.u) : null);
    let html = '<p class="hint">Chefs boost a food stall\'s profit. In their favourite stall they give +50% more.</p>';
    html += row(I('chefhat'), 'Recruit a chef', st.full ? 'Your kitchen is full (30 chefs)' : st.free ? 'Your free recruit is ready!' : `Next free recruit in ${ftime(st.wait)}`,
      st.full ? '' : st.free ? '<button class="btn gold" type="button" data-act="recruit">FREE</button>' : `<button class="btn purple" type="button" data-act="recruit" data-gems="${E.COST.recruit}">${E.COST.recruit} ${I('gem', 'inl')}</button>`, st.free && !st.full ? 'hot' : '');
    if (target) html += `<div class="sect">Assigning to ${I(def(target.t).icon, 'inl')} ${esc(def(target.t).name)}</div>`;
    if (!state.staff.length) return html + '<div class="empty">No chefs yet. Your first recruit is free!</div>';
    for (const m of state.staff.slice().sort((a, b) => b.rarity - a.rarity || b.level - a.level)) {
      const r = E.RARITIES[m.rarity], at = E.staffAt(state, m.id), spec = def(m.spec);
      const atB = at && E.findB(state, at.park, at.u);
      const here = at && target && at.park === PK() && at.u === target.u;
      html += `<div class="chef" style="--rc:${r.color}"><div class="face">${C(m)}<i>Lv ${m.level}</i></div><div class="r-main">
        <div class="rar">${r.name}</div><div class="r-title">${esc(m.name)}</div>
        <div class="r-sub"><b>+${Math.round(E.staffBonus(m, target ? target.t : -1) * 100)}%</b> profit${target && m.spec === target.t ? ' (favourite!)' : ''} · loves ${I(spec.icon, 'inl')} ${esc(spec.name)}</div>
        <div class="r-sub">${atB ? `Works at ${I(def(atB.t).icon, 'inl')} ${esc(def(atB.t).name)}` : 'Waiting for a job'}</div>
        <div class="acts">
          ${target && !here ? `<button class="btn small" type="button" data-act="assign" data-id="${m.id}" data-u="${target.u}">Assign here</button>` : ''}
          ${at ? `<button class="btn small ghost" type="button" data-act="unassign" data-id="${m.id}">Remove</button>` : ''}
          ${m.level < E.STAFF_MAX_LEVEL ? `<button class="btn small purple" type="button" data-act="staffUp" data-id="${m.id}" data-gems="${E.staffUpgradeCost(m)}">Train ${E.staffUpgradeCost(m)} ${I('gem', 'inl')}</button>` : '<span class="tag">MAX</span>'}
          <button class="btn small ghost" type="button" data-act="dismiss" data-id="${m.id}">Dismiss</button>
        </div></div></div>`;
    }
    return html;
  }

  function renderWorld() {
    let html = '<p class="hint">Open more parks in new locations. Each one is a fresh map, and its stalls earn more.</p>';
    const COL = [['#46c46e', '#1d7a4c'], ['#4aa3ee', '#1f55a8'], ['#9a6cf5', '#4527a8'], ['#f0509c', '#3a1a6b']];
    E.PARKS.forEach((pk, i) => {
      const open = state.parks[i].unlocked, here = i === PK(), can = E.canUnlockPark(state, i);
      const n = state.parks[i].b.length;
      html += `<div class="dist ${here ? 'here' : ''} ${open ? '' : 'locked'}" style="--c1:${COL[i][0]};--c2:${COL[i][1]}"><div class="em">${I(pk.icon)}</div><div class="r-main">
        <h3>${esc(pk.name)}</h3><div class="r-sub">Income ×${pk.mult}${open ? ` · ${n} buildings` : ` · needs Market Hall ${pk.hall}`}</div></div>
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
  ACT.speedJob = (el) => {
    const j = state.jobs[+el.dataset.k];
    if (j && E.speedUp(state, j.park, j.u, now())) { feedback('vip', true); onStateChanged(); } else feedback('error');
  };

  function renderStore(t) {
    const left = state.boostUntil - t, crate = E.crateStatus(state, t), tot = E.totals(state);
    let html = `<div class="sect">Boosts</div>` +
      row(I('rocket'), '2× income for 4 hours', left > 0 ? `Active: ${ftime(left / 1000)} left · stacks to 24h` : 'Stacks up to 24 hours',
        `<button class="btn small purple" type="button" data-act="boostAd">${state.adsRemoved ? 'Free' : 'Watch'}</button><button class="btn small blue" type="button" data-act="boostGems" data-gems="${E.COST.boost}">${E.COST.boost} ${I('gem', 'inl')}</button>`) +
      row(I('warp'), 'Time warp', `2 hours of output now: <b>${money(tot.cash * 2)}</b> + <b>${num(tot.ing * 2)}</b> ingredients`, `<button class="btn small blue" type="button" data-act="warp" data-gems="${E.COST.warp}">${E.COST.warp} ${I('gem', 'inl')}</button>`) +
      row(I('gift'), 'Reward crate', crate.free ? 'Your free crate is ready!' : `Free again in ${ftime(crate.wait)}`,
        crate.free ? '<button class="btn gold" type="button" data-act="crate">Open</button>' : `<button class="btn small blue" type="button" data-act="crate" data-gems="${E.COST.crate}">${E.COST.crate} ${I('gem', 'inl')}</button>`, crate.free ? 'hot' : '') +
      (state.boughtBuilder ? '' : row(I('builder'), 'Extra builder', 'Build and upgrade more at once', `<button class="btn small purple" type="button" data-act="buyBuilder" data-gems="${E.COST.builder}">${E.COST.builder} ${I('gem', 'inl')}</button>`)) +
      `<div class="sect">Premium</div>`;
    [{ id: P.CONFIG.products.premium, icon: I('crown'), title: 'Permanent 2× income', sub: 'Doubles everything your parks make, forever', owned: state.premium },
     { id: P.CONFIG.products.vipPass, icon: I('star'), title: 'VIP Pass', sub: 'Get every video reward instantly, with no ads', owned: state.adsRemoved }].forEach(it => {
      html += row(it.icon, it.title, it.sub, it.owned ? '<span class="tag">Owned</span>' : P.Store.available ? `<button class="btn gold small" type="button" data-act="iap" data-id="${it.id}">${esc(prices[it.id] || 'Buy')}</button>` : '<span class="tag">In the app</span>', it.owned ? 'done' : '');
    });
    if (P.Store.available) html += '<button class="btn ghost wide" type="button" data-act="restore">Restore purchases</button>';
    return html;
  }
  function renderAwards() {
    const n = E.achievementCount(state);
    return `<p class="hint"><b>${n} / ${E.ACHIEVEMENTS.length}</b> earned · <b>+${Math.round(n * E.ACHIEVEMENT_BONUS * 100)}%</b> income · each pays 5 ${I('gem', 'inl')}</p><div class="ach-grid">` +
      E.ACHIEVEMENTS.map((a, i) => `<button class="ach ${state.achievements[a.id] ? 'got' : ''}" type="button" data-act="achInfo" data-i="${i}">${I(a.icon)}</button>`).join('') + '</div>';
  }
  function renderProfile() {
    const need = E.xpForLevel(state.level), tot = E.totals(state);
    const stats = [
      ['Cash per hour', money(tot.cash)], ['Ingredients per hour', num(tot.ing)], ['Earned all time', money(state.lifetime)],
      ['Market Hall', 'Level ' + E.hallLevel(state)], ['Buildings', num(state.parks.reduce((a, p) => a + p.b.length, 0))], ['Land expansions', num(state.stats.landBought)],
      ['Times collected', num(state.stats.collects)], ['VIP visitors', num(state.stats.golden)], ['Tips picked up', num(state.stats.tips)],
      ['Time played', ftime(state.stats.playTime)], ['Daily streak', state.daily.streak + (state.daily.streak === 1 ? ' day' : ' days')],
    ];
    return `<div class="hero"><div class="big">${C({ id: 3 })}</div><h3>Level ${state.level} Food Tycoon</h3><p>${num(state.xp)} / ${num(need)} XP · each level gives +${Math.round(E.LEVEL_BONUS * 100)}% income and 10 gems</p></div>
      <div class="sect">Stats</div><div class="stats">${stats.map(([k, v]) => `<span>${esc(k)}</span><b>${esc(v)}</b>`).join('')}</div>
      <div class="sect">Settings</div>
      <label class="toggle"><input type="checkbox" data-set="sound" ${state.settings.sound ? 'checked' : ''}> Sound effects</label>
      <label class="toggle"><input type="checkbox" data-set="haptics" ${state.settings.haptics ? 'checked' : ''}> Vibration</label>
      ${use3d ? `<label class="toggle"><input type="checkbox" data-set="lens" ${state.settings.lens ? 'checked' : ''}> Tilt-shift miniature lens</label>` : ''}
      <button class="btn red wide" type="button" data-act="reset">Delete save &amp; restart</button>
      <p class="fine"><a href="privacy.html" target="_blank" rel="noopener">Privacy policy</a> · Yum Empire v${esc(P.CONFIG.version)}</p>`;
  }

  // =====================================================================
  //  HUD
  // =====================================================================
  function updateHud(t) {
    setText($('cash'), money(state.cash));
    setText($('ing'), num(state.ing));
    setText($('gems'), num(state.gems));
    setText($('lvBadge'), String(state.level));
    const need = E.xpForLevel(state.level);
    $('xpFill').style.width = Math.min(100, state.xp / need * 100).toFixed(1) + '%';
    setText($('xpText'), `${num(state.xp)} / ${num(need)} XP`);
    const pk = E.PARKS[PK()];
    setText($('parkName'), pk.name);
    const pi = $('parkIc');
    if (pi.dataset.ic !== pk.icon) { pi.dataset.ic = pk.icon; window.Icons.hydrate($('parkBtn')); }
    const free = E.freeBuilders(state), n = E.builderCount(state);
    setText($('builderText'), `${free}/${n}`);
    toggle($('builderBtn'), 'idle', free > 0);
    const tot = E.totals(state, t);
    setHTML($('rates'), `${money(tot.cash)}/h`);
    const left = state.boostUntil - t;
    toggle($('boostBtn'), 'active', left > 0);
    setText($('boostLabel'), left > 0 ? '2× ' + ftime(left / 1000) : '2× Boost');
    const crate = E.crateStatus(state, t);
    setText($('crateLabel'), crate.free ? 'Free!' : ftime(crate.wait));
    toggle($('crateBtn'), 'ready', crate.free);
    let pills = '';
    if (state.frenzyUntil > t) pills += `<span class="pill frenzy">${I('crown', 'inl')} Frenzy ×${E.FRENZY_MULT} · ${Math.ceil((state.frenzyUntil - t) / 1000)}s</span>`;
    const tip = tutorialTip();
    if (tip) pills += `<span class="pill tip">${tip}</span>`;
    setHTML($('statusRow'), pills);
    // Collect all (unlocked at Market Hall 3)
    let any = false;
    if (E.hallLevel(state) >= 3) for (const b of park().b) if (b.st >= 1 && (def(b.t).cat === 'stall' || def(b.t).cat === 'supply')) { any = true; break; }
    if ($('collectAll').hidden === any) $('collectAll').hidden = !any;
  }
  function tutorialTip() {
    if (state.stats.collects === 0) return I('pointer', 'inl') + ' Tap the coins above your Noodle Cart!';
    if (E.countType(state, E.ID.garden) === 0) return I('hammer', 'inl') + ' Build a Veggie Garden: Build → Supply';
    if (E.hallLevel(state) < 2 && !E.jobFor(state, 0, E.hallB(state).u)) return I('hall', 'inl') + ' Upgrade your Market Hall: tap the Hall button';
    if (E.countCat(state, 'decor') < 3) return I('table', 'inl') + ' Place tables next to stalls: +6% each';
    if (state.stats.landBought === 0 && E.hallLevel(state) >= 2) return I('land', 'inl') + ' Tap a FOR SALE sign to expand your land';
    if (!state.staff.length && E.hallLevel(state) >= 2) return I('chefhat', 'inl') + ' Recruit a free chef in Chefs';
    return '';
  }
  function setBadge(id, txt) { const b = $('badge-' + id); if (!b) return; setText(b, txt); toggle(b, 'show', !!txt); }
  function updateBadges() {
    const t = now();
    const q = E.questList(state).filter(x => x.done).length;
    setBadge('quests', q ? String(q) : '');
    setBadge('staff', E.recruitStatus(state, t).free && state.staff.length < E.STAFF_MAX ? '!' : '');
    setBadge('research', E.RESEARCH.some(r => E.canResearch(state, r.id).ok) ? '!' : '');
    setBadge('world', E.PARKS.some((p, i) => E.canUnlockPark(state, i).ok) ? '!' : '');
    setBadge('crate', E.crateStatus(state, t).free ? '!' : '');
    const hb = E.hallB(state);
    setBadge('hall', E.canUpgrade(state, 0, hb.u).ok ? '!' : '');
    const canBuildSomething = E.freeBuilders(state) > 0 && E.DEFS.some((d, t2) => d.cat !== 'decor' && E.canBuild(state, PK(), t2).ok);
    setBadge('build', canBuildSomething ? '!' : '');
  }

  // =====================================================================
  //  VIP, tips, offline, daily
  // =====================================================================
  function scheduleVip(first) { clearTimeout(vipTimer); vipTimer = setTimeout(spawnVip, first ? 45000 : 60000 + Math.random() * 90000); }
  function spawnVip() {
    if (!use3d || document.hidden || modalOpen || panel || placing || !W3.spawnVip()) { scheduleVip(); return; }
    toast(I('crown', 'inl') + ' A <b>VIP</b> is walking by — find the golden visitor and tap them!', 3600);
    P.Sound.play('vip');
  }
  function claimVip(x, y) {
    P.Sound.unlock();
    const r = E.vipReward(state, now());
    feedback('vip', true);
    const gems = r.gems ? ` and <b>${r.gems}</b> ${I('gem', 'inl')}` : '';
    if (r.type === 'frenzy') toast(`${I('crown', 'inl')} <b>VIP Frenzy!</b> ×${r.mult} income for ${r.seconds}s${gems}!`, 3200);
    else { toast(`${I('crown', 'inl')} The VIP tipped you <b>${money(r.amount)}</b>${gems}!`, 3200); flyTo('cash', x, y, 8); }
    onStateChanged();
    scheduleVip();
  }
  function onTip(x, y) {
    const amount = E.tip(state);
    feedback('coin', true);
    floater('+' + money(amount), x, y - 20);
    flyTo('cash', x, y, 3);
    onStateChanged();
  }
  function catchUp(fromBoot) {
    const t = now(), gap = (t - state.lastSeen) / 1000;
    if (gap < 5) return;
    const beforeCash = pending('stall'), beforeIng = pending('supply');
    const done = E.tick(state, gap, t);
    state.lastSeen = t;
    const cash = pending('stall') - beforeCash, ing = pending('supply') - beforeIng;
    if (gap > 60 && (cash > 0 || ing > 0 || done.length)) {
      const fin = done.map(ev => `<span>${I(def(ev.t).icon, 'inl')} ${esc(def(ev.t).name)} Lv ${ev.lv}</span>`).join('');
      modal({ icon: 'moon', title: 'Welcome back!', body: `<p>You were away for ${ftime(gap)}. Your shops kept busy:</p><div class="loot"><span>${I('coin', 'inl')} ${money(cash)}</span><span>${I('ingredients', 'inl')} ${num(ing)}</span>${fin}</div><p>Tap the bubbles over your buildings to collect.</p>`,
        actions: [{ label: 'Let\'s go!', cls: 'gold' }] });
    } else done.forEach(jobDone);
    if (!fromBoot) onStateChanged();
  }
  function pending(cat) { let s = 0; state.parks.forEach(p => p.b.forEach(b => { if (def(b.t).cat === cat) s += b.st; })); return s; }
  function maybeDaily() {
    const d = E.dailyStatus(state, now());
    if (!d.available) return;
    const days = Array.from({ length: 7 }, (_, k) => `<div class="${k < d.day ? 'on' : ''}">${k === 6 ? I('rocket', 'inl') : 'Day ' + (k + 1)}</div>`).join('');
    modal({
      icon: 'gift', title: `Daily reward · day ${d.day}`,
      body: `<p>Come back every day for bigger rewards. Day 7 adds a free 4-hour boost!</p><div class="days">${days}</div><div class="loot"><span>${I('cash', 'inl')} ${money(d.cash)}</span><span>${I('ingredients', 'inl')} ${num(d.ing)}</span><span>${I('gem', 'inl')} ${d.gems}</span></div>`,
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
    state.lastSeen = t;
    const rawDt = (ts - lastFrame) / 1000;
    const dt = Math.min(0.25, Math.max(0, rawDt));
    lastFrame = ts;
    const done = E.tick(state, dt, t);
    if (done.length) { done.forEach(jobDone); onStateChanged(); save(); }
    if (use3d) { W3.update(dt, state, t); W3.render(); watchPerformance(rawDt); }
    updateHud(t);
    if (sel) renderCard();
    if (ts - lastSlow > 500) {
      lastSlow = ts;
      for (const a of E.checkAchievements(state)) { feedback('milestone', true); toast(`${I(a.icon, 'inl')} <b>${esc(a.name)}</b> earned! +5 ${I('gem', 'inl')}`, 3200); }
      celebrateLevelUps();
      updateBadges();
      if (panel) { if (panel === 'builders' || panel === 'buildings') renderPanel(); else refreshButtons($('panelBody')); }
      if (placing && use3d) {
        const p = W3.placement();
        if (p && p.ok !== placing.ok) { placing.ok = p.ok; renderPlaceBar(); }
      }
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
      P.Sound.enabled = state.settings.sound; P.Haptics.enabled = state.settings.haptics;
      if (use3d) W3.setLens(state.settings.lens);
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
      if (PK() !== 0) { openPanel('hall'); return; }
      const hb = E.hallB(state);
      select({ kind: 'b', u: hb.u }, true);
    });
    $('avatarBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('profile'); });
    $('parkBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('world'); });
    $('gemBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('store'); });
    $('builderBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('builders'); });
    $('boostBtn').addEventListener('click', () => { P.Sound.unlock(); feedback('tap'); openPanel('store'); });
    $('crateBtn').addEventListener('click', () => { P.Sound.unlock(); if (E.crateStatus(state, now()).free) ACT.crate(); else { feedback('tap'); openPanel('store'); } });
    $('collectAll').addEventListener('click', () => {
      P.Sound.unlock();
      const r = E.collectAll(state, PK());
      if (!r.n) return;
      feedback('coin', true);
      const rect = $('collectAll').getBoundingClientRect();
      if (r.cash) { flyTo('cash', rect.left + 30, rect.top, 8); floater('+' + money(r.cash), rect.left + 40, rect.top - 10); }
      if (r.ing) { flyTo('ing', rect.left + 30, rect.top, 6); floater('+' + num(r.ing) + ' ' + I('ingredients', 'fl'), rect.left + 40, rect.top - 40, 'ing'); }
      onStateChanged();
    });
    P.Lifecycle.onPause(save);
    P.Lifecycle.onResume(() => { lastFrame = performance.now(); });
    const App = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (App) App.addListener('backButton', () => {
      if (modalOpen) return;
      if (placing) cancelPlace(); else if (panel) closePanel(); else if (sel) select(null); else if (App.minimizeApp) App.minimizeApp();
    });
  }

  async function boot() {
    window.Icons.hydrate(document);
    const raw = await P.Storage.load();
    const isNew = !raw || raw.v !== E.SAVE_VERSION;
    state = E.loadState(raw, now());
    P.Sound.enabled = state.settings.sound; P.Haptics.enabled = state.settings.haptics;
    try {
      use3d = !!(W3 && W3.init && W3.init($('city'), {
        onPickBuilding, onPickCell, onPickVip: claimVip, onTip,
        onPickNothing: () => select(null),
        onVipGone: () => scheduleVip(),
        onPlacement: (r) => { if (placing && r) { placing.x = r.x; placing.y = r.y; if (r.ok !== placing.ok) { placing.ok = r.ok; renderPlaceBar(); } } },
      }));
    } catch (e) { console.warn('3D unavailable', e); use3d = false; }
    document.body.classList.add(use3d ? 'has3d' : 'no3d');
    wire();
    if (!isNew) catchUp(true);
    if (use3d) { W3.setLens(state.settings.lens); W3.loadPark(PK(), state); focusHome(true); if (isNew) W3.intro(); }
    onStateChanged();
    ready = true;
    lastFrame = performance.now();
    if (isNew) {
      modal({ icon: 'hall', title: 'Welcome, Chef!', body: `<p>This little plot is yours: a <b>Market Hall</b>, a noodle cart and a picnic table.</p>
          <p>Collect your earnings, <b>build</b> stalls and gardens, <b>buy the land</b> next door and turn it into the biggest street-food park in town!</p>
          <p>Drag to look around · pinch to zoom · twist to rotate</p>`, actions: [{ label: "Let's cook!", cls: 'gold' }] });
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
