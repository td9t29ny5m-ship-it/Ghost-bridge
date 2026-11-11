/*
 * Yum Empire — 3D city (Three.js, everything procedural: no model or image files).
 *
 * The city is a 5×5 grid of blocks. Your first shop sits on the centre block; the other nine
 * businesses open on the lots around it. Customers walk the sidewalks to your shops, cars drive
 * the roads, the skyline grows with your empire and the day turns to night.
 *
 * This file only draws and animates. All money logic stays in engine.js.
 */
(function () {
  'use strict';
  const T = window.THREE;
  const E = window.Engine;
  const W = { ok: false };
  window.World = W;
  if (!T) return;

  // ---------- Layout ----------
  const N = 5, BLOCK = 16, ROAD = 7, PITCH = BLOCK + ROAD;
  const HALF = (N * BLOCK + (N - 1) * ROAD) / 2;   // half the city width
  const SIDE = 6.8;                                 // sidewalk centre line, from block centre
  // Block (column, row) for each business. Row 0 is north (far), row 4 is south (near).
  const LOTS = [[2, 2], [1, 2], [3, 2], [2, 3], [2, 1], [1, 3], [3, 3], [1, 1], [3, 1], [2, 0]];
  const PARKS = { '1,4': 1, '3,4': 1, '0,1': 1 };
  const STYLE = [
    { wall: 0xfff1d6, accent: 0xe8452c }, { wall: 0xfdf6ec, accent: 0x2e9e6b },
    { wall: 0xf7e6ff, accent: 0x9b5de5 }, { wall: 0xfff3c4, accent: 0xf08c00 },
    { wall: 0xffe8dc, accent: 0xd62828 }, { wall: 0xe9f5f9, accent: 0x1d6fa5 },
    { wall: 0xfff0c9, accent: 0xe36414 }, { wall: 0xeef0f7, accent: 0x3a86ff },
    { wall: 0xd9dde3, accent: 0x5c677d }, { wall: 0xcfe8ff, accent: 0x0b4f8a },
  ];
  // Building stages: stall → shop → restaurant → big restaurant → flagship tower
  const SEGS = [
    null,
    [{ w: 6, h: 3.4, d: 5 }],
    [{ w: 8, h: 6.4, d: 6.5 }],
    [{ w: 10, h: 6.4, d: 8 }, { w: 8, h: 3.4, d: 6.2 }],
    [{ w: 10.5, h: 6.4, d: 9 }, { w: 8.6, h: 6, d: 7.4 }, { w: 6.4, h: 3.6, d: 5.6 }],
  ];
  const FOCUS_DIST = [64, 72, 84, 96, 110];
  const blockCenter = (bx, bz) => ({ x: (bx - 2) * PITCH, z: (bz - 2) * PITCH });
  const tierFor = (level) => (level >= 500 ? 4 : level >= 300 ? 3 : level >= 100 ? 2 : level >= 25 ? 1 : 0);
  const shopHeight = (tier) => (tier <= 0 ? 2.6 : SEGS[tier].reduce((a, s) => a + s.h, 0));
  const shopDepth = (tier) => (tier <= 0 ? 2.4 : SEGS[tier][0].d);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Seeded random so the city looks the same every launch.
  let seed = 1337;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  let renderer, scene, camera, canvas, hooks = {};
  let sun, hemi, fog;
  const cam = { tx: 0, tz: 2, dist: 64, yaw: 0.785, g: { tx: 0, tz: 2, dist: 64, yaw: 0.785 }, ease: 8, el: 0.9 };
  const shops = [];
  const people = [];
  const cars = [];
  const decor = [];
  const nightMats = [];   // materials whose glow follows the night
  let lampMat, skyDay, skyDusk, skyNight;
  let time = 0, dayT = 0.22, prosperity = 0, shadowsOn = true, quality = 0;
  let vip = null;
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), camRight = new T.Vector3();

  // ---------- Small helpers ----------
  const matCache = {};
  function mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!matCache[key]) matCache[key] = new T.MeshLambertMaterial(Object.assign({ color }, opts || {}));
    return matCache[key];
  }
  const geoCache = {};
  function geo(key, make) {
    if (!geoCache[key]) { geoCache[key] = make(); geoCache[key].userData.shared = true; }
    return geoCache[key];
  }
  const boxGeo = () => geo('box', () => new T.BoxGeometry(1, 1, 1));
  function box(w, h, d, material, x, y, z, parent, noShadow) {
    const m = new T.Mesh(boxGeo(), material);
    m.scale.set(w, h, d);
    m.position.set(x || 0, y || 0, z || 0);
    if (!noShadow) { m.castShadow = true; m.receiveShadow = true; }
    if (parent) parent.add(m);
    return m;
  }
  function part(geometry, material, x, y, z, parent) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    if (parent) parent.add(m);
    return m;
  }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  const TEXT_FONT = '-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  const emojiCache = {};
  function emojiTex(e) {
    if (!emojiCache[e]) {
      emojiCache[e] = canvasTex(128, 128, (g) => {
        g.font = '96px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(e, 64, 70);
      });
    }
    return emojiCache[e];
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fitText(g, text, maxW, size, weight) {
    do { g.font = `${weight || 800} ${size}px ${TEXT_FONT}`; size -= 2; } while (g.measureText(text).width > maxW && size > 10);
  }
  function sprite(tex, sx, sy, opts) {
    const s = new T.Sprite(new T.SpriteMaterial(Object.assign({ map: tex || null, depthTest: false, transparent: true }, opts || {})));
    s.scale.set(sx, sy, 1);
    s.renderOrder = 10;
    return s;
  }
  function disposeGroup(g) {
    g.traverse(o => {
      if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      if (o.isSprite && o.material && !o.material.userData.shared) o.material.dispose();
    });
    if (g.parent) g.parent.remove(g);
  }

  // ---------- Textures ----------
  function makeSignTex(i) {
    const def = E.BUSINESSES[i], st = STYLE[i];
    return canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = hex(st.accent); roundRect(g, 4, 4, w - 8, h - 8, 26); g.fill();
      g.lineWidth = 8; g.strokeStyle = '#fff7ec'; g.stroke();
      g.font = '82px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(def.emoji, 70, 70);
      g.fillStyle = '#fff7ec'; g.textAlign = 'left';
      fitText(g, def.name, w - 150, 58, 900);
      g.fillText(def.name, 128, 68);
    });
  }
  function makeSaleTex(i, locked) {
    const def = E.BUSINESSES[i];
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#fffaf0'; roundRect(g, 6, 6, w - 12, h - 12, 22); g.fill();
      g.lineWidth = 10; g.strokeStyle = locked ? '#8d8aa3' : '#e8452c'; g.stroke();
      g.fillStyle = locked ? '#8d8aa3' : '#e8452c'; roundRect(g, 6, 6, w - 12, 62, 22); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 36px ${TEXT_FONT}`; g.fillText(locked ? 'COMING SOON' : 'FOR SALE', w / 2, 40);
      g.font = '92px ' + EMOJI_FONT; g.fillText(locked ? '🔒' : def.emoji, w / 2, 132);
      g.fillStyle = '#2b2140'; fitText(g, locked ? '???' : E.formatMoney(def.baseCost), w - 40, 44, 900);
      g.fillText(locked ? '???' : E.formatMoney(def.baseCost), w / 2, 212);
    });
  }
  function makeAwningTex(color) {
    const t = canvasTex(64, 16, (g) => {
      g.fillStyle = '#fff7ec'; g.fillRect(0, 0, 64, 16);
      g.fillStyle = hex(color); g.fillRect(0, 0, 32, 16);
    });
    t.wrapS = T.RepeatWrapping; t.magFilter = T.NearestFilter;
    return t;
  }
  // City building windows: one tile is 4 bays × 4 floors. A second texture marks which windows glow at night.
  function makeWindowTex() {
    const lit = [];
    for (let k = 0; k < 16; k++) lit.push(srand() < 0.55);
    const draw = (night) => (g, w, h) => {
      g.fillStyle = night ? '#000' : '#fff'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const on = lit[r * 4 + c];
        g.fillStyle = night ? (on ? '#ffd98a' : '#141824') : '#6f8fb3';
        g.fillRect(c * 64 + 14, r * 64 + 12, 36, 34);
        if (!night) { g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(c * 64 + 14, r * 64 + 12, 36, 8); }
      }
    };
    const a = canvasTex(256, 256, draw(false)), b = canvasTex(256, 256, draw(true));
    [a, b].forEach(t => { t.wrapS = t.wrapT = T.RepeatWrapping; });
    return [a, b];
  }
  function scaleBoxUV(g, w, h, d, tileW, tileH) {
    const uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const su = (f < 2 ? d : w) / tileW, sv = (f === 2 || f === 3) ? 1 : h / tileH;
      for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * su, uv.getY(f * 4 + k) * sv);
    }
  }

  // ---------- Sidewalk graph (people walk corner to corner and use the crosswalks) ----------
  const NODES = N * N * 4;
  const CORNER = [[-1, -1], [1, -1], [1, 1], [-1, 1]];   // NW, NE, SE, SW
  const nodeId = (bx, bz, c) => (bx * N + bz) * 4 + c;
  const nodeXZ = [];
  const ADJ = [];
  const edgeNodes = [];
  function buildGraph() {
    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      const c = blockCenter(bx, bz);
      for (let k = 0; k < 4; k++) {
        const id = nodeId(bx, bz, k);
        nodeXZ[id] = { x: c.x + CORNER[k][0] * SIDE, z: c.z + CORNER[k][1] * SIDE };
        ADJ[id] = [nodeId(bx, bz, (k + 1) % 4), nodeId(bx, bz, (k + 3) % 4)];
        const outer = (bx === 0 && CORNER[k][0] < 0) || (bx === N - 1 && CORNER[k][0] > 0) ||
                      (bz === 0 && CORNER[k][1] < 0) || (bz === N - 1 && CORNER[k][1] > 0);
        if (outer) edgeNodes.push(id);
      }
    }
    const link = (a, b) => { ADJ[a].push(b); ADJ[b].push(a); };
    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      if (bx < N - 1) { link(nodeId(bx, bz, 1), nodeId(bx + 1, bz, 0)); link(nodeId(bx, bz, 2), nodeId(bx + 1, bz, 3)); }
      if (bz < N - 1) { link(nodeId(bx, bz, 3), nodeId(bx, bz + 1, 0)); link(nodeId(bx, bz, 2), nodeId(bx, bz + 1, 1)); }
    }
  }
  function findPath(a, b) {
    if (a === b) return [a];
    const prev = new Int16Array(NODES).fill(-1);
    const q = [a]; prev[a] = a;
    for (let h = 0; h < q.length; h++) {
      const n = q[h];
      if (n === b) break;
      const nb = ADJ[n], off = (Math.random() * nb.length) | 0;
      for (let k = 0; k < nb.length; k++) {
        const m = nb[(k + off) % nb.length];
        if (prev[m] < 0) { prev[m] = n; q.push(m); }
      }
    }
    const out = [];
    for (let c = b; c !== a; c = prev[c]) out.push(c);
    out.push(a);
    return out.reverse();
  }
  function nearestNode(x, z) {
    let best = 0, bd = 1e9;
    for (let i = 0; i < NODES; i++) {
      const dx = nodeXZ[i].x - x, dz = nodeXZ[i].z - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---------- Static city ----------
  function buildGround() {
    const grass = new T.Mesh(new T.PlaneGeometry(900, 900), mat(0x74d660));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.06; grass.receiveShadow = true;
    scene.add(grass);
    const asphalt = mat(0x3b4766);
    const base = new T.Mesh(new T.PlaneGeometry(HALF * 2, HALF * 2), asphalt);
    base.rotation.x = -Math.PI / 2; base.receiveShadow = true;
    scene.add(base);

    // Roads continue out of town; centre dashes on every road.
    const dashTex = canvasTex(16, 8, (g) => { g.clearRect(0, 0, 16, 8); g.fillStyle = '#ffc93d'; g.fillRect(1, 0, 4, 8); g.fillRect(11, 0, 4, 8); });
    dashTex.wrapT = T.RepeatWrapping; dashTex.repeat.set(1, 60);
    const dashMat = new T.MeshBasicMaterial({ map: dashTex, transparent: true });
    for (let k = 0; k < N - 1; k++) {
      const c = (k - 1.5) * PITCH;
      for (const vertical of [true, false]) {
        const strip = new T.Mesh(new T.PlaneGeometry(ROAD, 500), asphalt);
        strip.rotation.x = -Math.PI / 2; strip.position.set(vertical ? c : 0, -0.02, vertical ? 0 : c);
        if (!vertical) strip.rotation.z = Math.PI / 2;
        strip.receiveShadow = true;
        scene.add(strip);
        const dash = new T.Mesh(new T.PlaneGeometry(0.42, 500), dashMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(vertical ? c : 0, 0.02, vertical ? 0 : c);
        if (!vertical) dash.rotation.z = Math.PI / 2;
        scene.add(dash);
      }
    }

    // Sidewalk slabs
    const slabs = new T.InstancedMesh(boxGeo(), mat(0xe2e5ef), N * N);
    const m4 = new T.Matrix4();
    let n = 0;
    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      const c = blockCenter(bx, bz);
      m4.makeScale(BLOCK, 0.2, BLOCK).setPosition(c.x, 0.1, c.z);
      slabs.setMatrixAt(n++, m4);
    }
    slabs.receiveShadow = true;
    scene.add(slabs);

    // Zebra crossings where the sidewalk graph crosses a road
    const zebraTex = canvasTex(64, 8, (g) => {
      g.clearRect(0, 0, 64, 8); g.fillStyle = '#f4f1e6';
      for (let k = 0; k < 4; k++) g.fillRect(k * 16 + 3, 0, 10, 8);
    });
    const zebra = new T.InstancedMesh(new T.PlaneGeometry(ROAD - 0.6, 1.9), new T.MeshBasicMaterial({ map: zebraTex, transparent: true }), 80);
    const q = new T.Quaternion(), flat = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0));
    const turn = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, Math.PI / 2));
    const one = new T.Vector3(1, 1, 1);
    n = 0;
    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      const c = blockCenter(bx, bz);
      for (const s of [-1, 1]) {
        if (bx < N - 1) zebra.setMatrixAt(n++, m4.compose(tmpV.set(c.x + PITCH / 2, 0.03, c.z + s * SIDE), flat, one));
        if (bz < N - 1) zebra.setMatrixAt(n++, m4.compose(tmpV.set(c.x + s * SIDE, 0.03, c.z + PITCH / 2), turn, one));
      }
    }
    zebra.count = n;
    scene.add(zebra);
    void q;
  }

  function buildDecor() {
    const [winTex, litTex] = makeWindowTex();
    const palette = [0xffe29a, 0xffb26b, 0xf6f6fa, 0xc4d6f5, 0xffd2c4, 0xf1e7cf, 0xffc857, 0xbfe3d6];
    const sideMats = palette.map(c => {
      const m = new T.MeshLambertMaterial({ color: c, map: winTex, emissive: 0xffffff, emissiveMap: litTex, emissiveIntensity: 0 });
      nightMats.push({ m, max: 0.95 });
      return m;
    });
    const roofMats = palette.map(c => mat(new T.Color(c).multiplyScalar(0.72).getHex()));
    const rowH = [[14, 28], [9, 18], [7, 13], [5, 9], [3.5, 6.5]];
    const trees = [];
    const lamps = [];

    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      const c = blockCenter(bx, bz);
      const lotIndex = LOTS.findIndex(l => l[0] === bx && l[1] === bz);
      const isPark = PARKS[bx + ',' + bz];
      for (const k of CORNER) lamps.push([c.x + k[0] * 7.55, c.z + k[1] * 7.55]);
      // Street trees along the kerb (not where customers queue in front of a shop)
      for (const s of [-1, 1]) for (const o of [-3.6, 3.6]) {
        trees.push([c.x + s * 7.5, c.z + o, 0.8 + srand() * 0.3]);
        if (!(lotIndex >= 0 && s > 0)) trees.push([c.x + o, c.z + s * 7.5, 0.8 + srand() * 0.3]);
      }
      if (lotIndex >= 0) continue;
      if (isPark) {
        box(12.4, 0.08, 12.4, mat(0x6fd35c), c.x, 0.24, c.z, scene, true).receiveShadow = true;
        const rim = new T.Mesh(new T.CircleGeometry(3.7, 28), mat(0xe9edf5));
        rim.rotation.x = -Math.PI / 2; rim.position.set(c.x, 0.3, c.z); rim.receiveShadow = true;
        const pond = new T.Mesh(new T.CircleGeometry(3.2, 28), mat(0x3f8fe0));
        pond.rotation.x = -Math.PI / 2; pond.position.set(c.x, 0.32, c.z);
        scene.add(rim, pond);
        for (let k = 0; k < 11; k++) {
          const a = srand() * 6.28, r = 4.6 + srand() * 1.2;
          trees.push([c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, 1 + srand() * 0.7]);
        }
        continue;
      }
      box(12.4, 0.08, 12.4, mat(0xcdd2e0), c.x, 0.24, c.z, scene, true).receiveShadow = true;
      const [lo, hi] = rowH[bz];
      const dist = Math.hypot(bx - 2, bz - 2) / 2.83;
      for (const ox of [-3.1, 3.1]) for (const oz of [-3.1, 3.1]) {
        const w = 4.4 + srand() * 1.2, d = 4.4 + srand() * 1.2, H = lo + srand() * (hi - lo);
        const g = new T.BoxGeometry(w, H, d);
        g.translate(0, H / 2, 0);
        scaleBoxUV(g, w, H, d, 9.6, 12.8);
        const ci = (srand() * palette.length) | 0;
        const mesh = new T.Mesh(g, [sideMats[ci], sideMats[ci], roofMats[ci], roofMats[ci], sideMats[ci], sideMats[ci]]);
        mesh.position.set(c.x + ox, 0.28, c.z + oz);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        if (srand() < 0.6) box(w + 0.25, 0.35, d + 0.25, mat(srand() < 0.5 ? 0xff8a3d : 0x8d99ae), 0, H + 0.1, 0, mesh);
        for (let k = 0, n = 1 + ((srand() * 3) | 0); k < n; k++) {
          box(0.7 + srand() * 0.7, 0.5, 0.7 + srand() * 0.5, mat(0xf4f6fb), (srand() - 0.5) * (w - 1.6), H + 0.5, (srand() - 0.5) * (d - 1.6), mesh);
        }
        // "need" = how prosperous the city must be before this building reaches full height
        decor.push({ mesh, H, need: clamp(0.08 + dist * 0.35 + srand() * 0.4, 0, 0.8), f: -1 });
      }
    }

    // Countryside: trees and far hills
    for (let k = 0; k < 90; k++) {
      const a = srand() * 6.283, r = HALF * 1.25 + srand() * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      let onRoad = false;
      for (let j = 0; j < N - 1; j++) { const rc = (j - 1.5) * PITCH; if (Math.abs(x - rc) < 5 || Math.abs(z - rc) < 5) onRoad = true; }
      if (!onRoad) trees.push([x, z, 1.2 + srand() * 1.2]);
    }
    const hillGeo = new T.ConeGeometry(1, 1, 7);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.283 + srand() * 0.3, r = 210 + srand() * 60, s = 40 + srand() * 50;
      const hill = new T.Mesh(hillGeo, mat(k % 2 ? 0x6fb58a : 0x7fbf8f));
      hill.scale.set(s * 1.6, s * 0.7, s * 1.6);
      hill.position.set(Math.cos(a) * r, s * 0.35 - 2, Math.sin(a) * r);
      scene.add(hill);
    }

    // Trees (instanced: two draw calls for the whole city)
    const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.12, 0.16, 1, 6), mat(0x8a5a3c), trees.length);
    const leaves = new T.InstancedMesh(new T.IcosahedronGeometry(0.8, 1), new T.MeshLambertMaterial({ color: 0xffffff }), trees.length * 3);
    const m4 = new T.Matrix4(), col = new T.Color();
    const greens = [0x6fdc4a, 0x8be85a, 0x57c93f, 0x7fe04f];
    trees.forEach((t, i) => {
      const s = t[2];
      m4.makeScale(s, s * 1.3, s).setPosition(t[0], 0.2 + s * 0.65, t[1]);
      trunks.setMatrixAt(i, m4);
      const gc = greens[(srand() * greens.length) | 0];
      [[0, 1.75, 0, 1.15], [0.55, 1.45, 0.25, 0.8], [-0.45, 1.5, -0.35, 0.85]].forEach((o, k) => {
        m4.makeScale(s * o[3], s * o[3], s * o[3]).setPosition(t[0] + o[0] * s, 0.2 + s * o[1], t[1] + o[2] * s);
        leaves.setMatrixAt(i * 3 + k, m4);
        leaves.setColorAt(i * 3 + k, col.setHex(gc).multiplyScalar(k ? 0.92 : 1));
      });
    });
    trunks.castShadow = leaves.castShadow = true;
    scene.add(trunks, leaves);

    // Street lamps
    const poles = new T.InstancedMesh(new T.CylinderGeometry(0.06, 0.08, 3.2, 6), mat(0x4a4f5e), lamps.length);
    lampMat = new T.MeshBasicMaterial({ color: 0x9aa0ad });
    const bulbs = new T.InstancedMesh(new T.SphereGeometry(0.22, 8, 6), lampMat, lamps.length);
    lamps.forEach((l, i) => {
      poles.setMatrixAt(i, m4.makeTranslation(l[0], 1.8, l[1]));
      bulbs.setMatrixAt(i, m4.makeTranslation(l[0], 3.5, l[1]));
    });
    scene.add(poles, bulbs);
  }

  // ---------- People ----------
  const SHIRTS = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xffd43b, 0xcc5de8, 0xff922b, 0x20c997, 0xf783ac, 0x748ffc, 0xe9ecef];
  const SKINS = [0xffd9b3, 0xf1c27d, 0xc68642, 0x8d5524];
  const HAIRS = [0x2b2118, 0x5a3825, 0xd9a441, 0x8c8c8c, 0xb5442e];
  function makePersonMesh(shirt, opts) {
    const g = new T.Group();
    const cap = geo('cap', () => new T.CapsuleGeometry(0.2, 0.36, 3, 8));
    const body = part(cap, mat(shirt), 0, 0.66, 0, g);
    part(geo('head', () => new T.SphereGeometry(0.19, 10, 8)), mat(pick(SKINS)), 0, 1.16, 0, g).castShadow = false;
    if (!opts || !opts.hat) {
      part(geo('hair', () => new T.SphereGeometry(0.205, 10, 6, 0, 6.283, 0, 1.75)), mat(pick(HAIRS)), 0, 1.19, 0, g).castShadow = false;
    } else {
      part(geo('chefhat', () => new T.CylinderGeometry(0.2, 0.17, 0.3, 10)), mat(0xffffff), 0, 1.42, 0, g).castShadow = false;
    }
    const legGeo = geo('leg', () => new T.BoxGeometry(0.13, 0.36, 0.14).translate(0, -0.18, 0));
    const legs = [part(legGeo, mat(0x39405a), -0.1, 0.4, 0, g), part(legGeo, mat(0x39405a), 0.1, 0.4, 0, g)];
    legs.forEach(l => (l.castShadow = false));
    g.scale.setScalar(1.25);
    g.userData = { legs, body };
    return g;
  }
  function spawnPerson(node, opts) {
    const g = makePersonMesh(opts && opts.shirt !== undefined ? opts.shirt : pick(SHIRTS));
    const p = {
      g, x: nodeXZ[node].x, z: nodeXZ[node].z, ox: rand(-0.45, 0.45), oz: rand(-0.45, 0.45),
      path: [], pi: 0, speed: rand(2.1, 3), state: 'wander', shop: null, phase: rand(0, 6), born: time,
      hop: 0, moving: false, bubble: null, node,
    };
    p.x += p.ox; p.z += p.oz;
    g.position.set(p.x, 0.2, p.z);
    scene.add(g);
    people.push(p);
    return p;
  }
  function setPathTo(p, fromNode, toNode) {
    p.path = findPath(fromNode, toNode);
    p.pi = 0;
  }
  function wanderAgain(p) {
    let target = pick(edgeNodes);
    for (let k = 0; k < 4 && target === p.node; k++) target = pick(edgeNodes);
    setPathTo(p, p.node, target);
    p.state = 'wander';
  }
  function removePerson(p) {
    if (p.shop) {
      const q = p.shop.queue.indexOf(p);
      if (q >= 0) p.shop.queue.splice(q, 1);
      else if (p.state === 'toShop') p.shop.incoming = Math.max(0, p.shop.incoming - 1);
    }
    disposeGroup(p.g);
    const i = people.indexOf(p);
    if (i >= 0) people.splice(i, 1);
  }
  function setBubble(p, emoji) {
    if (p.bubble) { p.g.remove(p.bubble); p.bubble.material.dispose(); p.bubble = null; }
    if (!emoji) return;
    p.bubble = sprite(emojiTex(emoji), 0.62, 0.62);
    p.bubble.position.set(0, 1.85, 0);
    p.g.add(p.bubble);
  }
  // Turn a nearby passer-by into a customer; if the street is empty, someone steps out of a building nearby.
  function summonCustomer(s) {
    let best = null, bd = 30 * 30;
    for (const p of people) {
      if (p.state !== 'wander' || p === (vip && vip.p)) continue;
      const dx = p.x - s.cx, dz = p.z - s.cz, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) {
      const near = [];
      for (let i = 0; i < NODES; i++) {
        const d = Math.hypot(nodeXZ[i].x - s.cx, nodeXZ[i].z - s.cz);
        if (d > 12 && d < 34) near.push(i);
      }
      best = spawnPerson(pick(near));
    }
    const from = best.path.length ? best.path[Math.min(best.pi, best.path.length - 1)] : best.node;
    const corner = nodeId(s.bx, s.bz, Math.random() < 0.5 ? 2 : 3);
    best.path = findPath(from, corner);
    best.pi = 0;
    best.state = 'toShop';
    best.shop = s;
    best.speed = rand(3.1, 3.7);
    s.incoming++;
    setBubble(best, E.BUSINESSES[s.i].emoji);
  }
  function serve(s, p) {
    const q = s.queue.indexOf(p);
    if (q >= 0) s.queue.splice(q, 1);
    p.shop = null;
    p.state = 'leave';
    p.hop = 0.4;
    p.speed = rand(2.4, 3);
    setBubble(p, '😋');
    p.bubbleUntil = time + 1.6;
    box(0.22, 0.26, 0.16, mat(STYLE[s.i].accent), 0.3, 0.62, 0.05, p.g).castShadow = false;   // take-away bag
    p.node = nodeId(s.bx, s.bz, p.x > s.cx ? 2 : 3);
    setPathTo(p, p.node, pick(edgeNodes));
    popCoin(p.x, 2.6, p.z);
  }
  function updatePeople(dt) {
    const target = Math.round(11 + prosperity * 30);
    let wanderers = 0;
    for (const p of people) if (p.state === 'wander') wanderers++;
    if (wanderers < target && people.length < 70 && time > (W._nextWander || 0)) {
      W._nextWander = time + 0.35;
      wanderAgain(spawnPerson(pick(edgeNodes)));
    }
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i];
      let tx = p.x, tz = p.z, arrive = false;
      if (p.state === 'queue') {
        const k = p.shop.queue.indexOf(p);
        tx = p.shop.cx + (k === 0 ? 0 : 0.2 + k * 0.95);
        tz = p.shop.cz + (k === 0 ? 6.15 : 7.0);
      } else if (p.pi < p.path.length) {
        const n = nodeXZ[p.path[p.pi]];
        tx = n.x + p.ox; tz = n.z + p.oz;
      } else arrive = true;

      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      p.moving = d > 0.06;
      if (p.moving) {
        const step = Math.min(d, p.speed * dt);
        p.x += dx / d * step; p.z += dz / d * step;
        p.g.rotation.y = Math.atan2(dx, dz);
      } else if (p.state === 'queue') {
        p.g.rotation.y = p.shop.queue[0] === p ? Math.PI : -Math.PI / 2;   // face the counter / the line
      } else if (p.pi < p.path.length) {
        p.node = p.path[p.pi];
        p.pi++;
      }
      if (arrive) {
        if (p.state === 'toShop') {
          p.state = 'queue';
          p.shop.incoming = Math.max(0, p.shop.incoming - 1);
          p.shop.queue.push(p);
        } else if (p === (vip && vip.p)) {
          wanderAgain(p);
        } else { removePerson(p); continue; }
      }
      // Walk cycle
      p.phase += dt * (p.moving ? p.speed * 3.2 : 0);
      const sw = p.moving ? Math.sin(p.phase) * 0.7 : 0;
      p.g.userData.legs[0].rotation.x = sw;
      p.g.userData.legs[1].rotation.x = -sw;
      let y = 0.2 + (p.moving ? Math.abs(Math.sin(p.phase)) * 0.05 : 0);
      if (p.hop > 0) { p.hop -= dt; y += Math.sin(Math.max(0, p.hop) / 0.4 * Math.PI) * 0.5; }
      p.g.position.set(p.x, y, p.z);
      const born = Math.min(1, (time - p.born) * 3);
      if (born < 1) p.g.scale.setScalar(1.25 * born);
      if (p.bubble && p.bubbleUntil && time > p.bubbleUntil) { setBubble(p, null); p.bubbleUntil = 0; }
      else if (p.bubble) p.bubble.position.y = 1.85 + Math.sin(time * 4 + p.phase) * 0.05;
    }
  }

  // ---------- Cars ----------
  const CAR_COLORS = [0xe63946, 0x2f80ed, 0xffc300, 0x06d6a0, 0xf8f9fa, 0xff8fab, 0x8338ec, 0xff7b00, 0x1f9d55];
  function spawnCar() {
    const g = new T.Group();
    const color = pick(CAR_COLORS);
    const kind = Math.random();
    let len = 3.6;
    if (kind < 0.72) {            // car
      box(1.7, 0.6, 3.6, mat(color), 0, 0.62, 0, g);
      box(1.5, 0.55, 1.9, mat(0x2b3a55), 0, 1.15, -0.15, g);
      box(1.52, 0.06, 1.92, mat(color), 0, 1.45, -0.15, g, true);
    } else if (kind < 0.9) {      // delivery van
      len = 4.6;
      box(1.8, 1.5, 3.2, mat(0xf8f9fa), 0, 1.1, -0.6, g);
      box(1.75, 1.05, 1.3, mat(color), 0, 0.88, 1.65, g);
      box(1.6, 0.4, 0.1, mat(0x2b3a55), 0, 1.15, 2.31, g, true);
    } else {                      // bus
      len = 7;
      const bc = pick([0x2f80ed, 0xffc300, 0xe63946]);
      box(1.9, 1.7, 7, mat(bc), 0, 1.2, 0, g);
      box(1.94, 0.55, 6.4, mat(0x2b3a55), 0, 1.5, 0, g, true);
      box(1.7, 0.1, 6.6, mat(0xf8f9fa), 0, 2.08, 0, g, true);
    }
    box(1.84, 0.4, 0.7, mat(0x1d1f27), 0, 0.3, len / 2 - 0.8, g, true);
    box(1.84, 0.4, 0.7, mat(0x1d1f27), 0, 0.3, -len / 2 + 0.8, g, true);
    const axis = Math.random() < 0.5 ? 'x' : 'z', dir = Math.random() < 0.5 ? 1 : -1;
    const road = (((Math.random() * (N - 1)) | 0) - 1.5) * PITCH;
    const c = { g, axis, dir, lane: road + (axis === 'z' ? -dir : dir) * 1.75, s: -dir * (HALF + rand(20, 60)), v: 9, max: rand(8, 11), len };
    g.rotation.y = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (time < 3) c.s = rand(-HALF, HALF);
    scene.add(g);
    cars.push(c);
  }
  function updateCars(dt) {
    const want = Math.round(9 + prosperity * 21);
    if (cars.length < want && time > (W._nextCar || 0)) { W._nextCar = time + 0.7; spawnCar(); }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      let go = c.max;
      const cx = c.axis === 'x' ? c.s : c.lane, cz = c.axis === 'z' ? c.s : c.lane;
      // Stop for pedestrians on the road ahead
      for (const p of people) {
        const ahead = ((c.axis === 'x' ? p.x : p.z) - c.s) * c.dir;
        const side = Math.abs((c.axis === 'x' ? p.z : p.x) - c.lane);
        if (ahead > 0.5 && ahead < 5 && side < 1.5) { go = 0; break; }
      }
      // Keep distance; east-west traffic gives way at crossings
      if (go > 0) for (const o of cars) {
        if (o === c) continue;
        const ox = o.axis === 'x' ? o.s : o.lane, oz = o.axis === 'z' ? o.s : o.lane;
        const ahead = ((c.axis === 'x' ? ox : oz) - c.s) * c.dir;
        const side = Math.abs((c.axis === 'x' ? oz : ox) - c.lane);
        if (o.axis === c.axis) { if (ahead > 0 && ahead < 5 + (c.len + o.len) / 2 && side < 1) { go = Math.min(go, o.v * 0.7); } }
        else if (c.axis === 'x' && ahead > 1 && ahead < 7 && side < 4.5) { go = 0; }
      }
      c.v += (go - c.v) * Math.min(1, dt * 5);
      c.s += c.dir * c.v * dt;
      c.g.position.set(cx, 0.02, cz);
      if (c.s * c.dir > HALF + 70 || cars.length > want + 1 && Math.abs(c.s) > HALF + 15) {
        disposeGroup(c.g);
        cars.splice(i, 1);
      }
    }
  }

  // ---------- Rooftop mascots (one per business) ----------
  function mascot(i) {
    const g = new T.Group();
    const cyl = (rt, rb, h, seg) => new T.CylinderGeometry(rt, rb, h, seg || 14);
    const sph = (r) => new T.SphereGeometry(r, 14, 10);
    const add = (geometry, color, x, y, z, sx, sy, sz) => {
      const m = part(geometry, mat(color), x, y, z, g);
      if (sx) m.scale.set(sx, sy, sz);
      return m;
    };
    switch (i) {
      case 0: { // noodle bowl
        add(cyl(0.62, 0.34, 0.5), 0xe8452c, 0, 0.3, 0);
        add(cyl(0.64, 0.64, 0.07), 0xfff7ec, 0, 0.56, 0);
        add(sph(0.52), 0xffd166, 0, 0.56, 0, 1, 0.35, 1);
        const a = add(cyl(0.03, 0.03, 1.2, 6), 0x8a4b1c, 0.25, 0.9, 0); a.rotation.z = -0.9;
        const b = add(cyl(0.03, 0.03, 1.2, 6), 0x8a4b1c, 0.35, 0.82, 0.12); b.rotation.z = -1.0;
        break;
      }
      case 1: { // dumpling
        add(sph(0.6), 0xfff3dc, 0, 0.42, 0, 1.1, 0.7, 0.8);
        const t = add(new T.TorusGeometry(0.5, 0.08, 6, 14, Math.PI), 0xf3dfb8, 0, 0.55, 0); t.scale.set(1.05, 0.75, 1);
        break;
      }
      case 2: { // bubble tea
        add(cyl(0.42, 0.3, 0.95), 0xd9a066, 0, 0.5, 0);
        add(cyl(0.45, 0.45, 0.1), 0xf7e6ff, 0, 1.02, 0);
        const s = add(cyl(0.05, 0.05, 0.9, 6), 0x9b5de5, 0.1, 1.3, 0); s.rotation.z = -0.25;
        for (let k = 0; k < 6; k++) add(sph(0.08), 0x2b1d14, Math.cos(k * 1.05) * 0.33, 0.2 + (k % 2) * 0.14, Math.sin(k * 1.05) * 0.33);
        break;
      }
      case 3: { // taco
        const shell = add(new T.CylinderGeometry(0.62, 0.62, 0.42, 16, 1, true, 0, Math.PI), 0xf4b942, 0, 0.66, 0);
        shell.rotation.set(0, 0, Math.PI / 2); shell.rotation.y = Math.PI / 2; shell.material = mat(0xf4b942, { side: T.DoubleSide });
        for (let k = 0; k < 5; k++) add(sph(0.14), [0x51cf66, 0xe8452c, 0xffd43b][k % 3], -0.4 + k * 0.2, 0.68, 0);
        break;
      }
      case 4: { // pizza slice
        const s = add(new T.CylinderGeometry(0.75, 0.75, 0.12, 3), 0xffc93d, 0, 0.7, 0); s.rotation.x = Math.PI / 2 - 0.25;
        const cr = add(new T.BoxGeometry(1.3, 0.2, 0.2), 0xd98a3a, 0, 1.12, -0.1);
        void cr;
        [[0, 0.75], [-0.2, 0.45], [0.2, 0.5], [0, 0.2]].forEach(p => { const pp = add(cyl(0.11, 0.11, 0.05, 10), 0xd62828, p[0], p[1] + 0.05, 0.09); pp.rotation.x = Math.PI / 2 - 0.25; });
        break;
      }
      case 5: { // sushi
        add(new T.BoxGeometry(1.2, 0.42, 0.6), 0xffffff, 0, 0.3, 0);
        add(new T.BoxGeometry(1.3, 0.24, 0.66), 0xff8c5a, 0, 0.62, 0);
        add(new T.BoxGeometry(0.26, 0.7, 0.7), 0x1d2b24, 0, 0.42, 0);
        break;
      }
      case 6: { // burger
        add(cyl(0.6, 0.55, 0.22), 0xe0a050, 0, 0.16, 0);
        add(cyl(0.66, 0.66, 0.08), 0x51cf66, 0, 0.32, 0);
        add(cyl(0.6, 0.6, 0.2), 0x6b3a22, 0, 0.46, 0);
        const ch = add(new T.BoxGeometry(1.0, 0.06, 1.0), 0xffd43b, 0, 0.6, 0); ch.rotation.y = 0.78;
        add(sph(0.6), 0xe0a050, 0, 0.64, 0, 1, 0.62, 1);
        break;
      }
      case 7: { // food court umbrellas
        [[-0.55, 0xe8452c], [0.1, 0x3a86ff], [0.6, 0xffc93d]].forEach(([x, c], k) => {
          add(cyl(0.03, 0.03, 0.9, 6), 0x7a7f8f, x, 0.45, k === 1 ? 0.3 : -0.15);
          add(new T.ConeGeometry(0.5, 0.35, 10), c, x, 1.0, k === 1 ? 0.3 : -0.15);
        });
        break;
      }
      case 8: { // factory chimneys with smoke
        add(cyl(0.2, 0.26, 1.3, 10), 0xb8493a, -0.35, 0.65, 0);
        add(cyl(0.16, 0.22, 1.0, 10), 0xb8493a, 0.35, 0.5, 0);
        g.userData.smoke = [];
        for (let k = 0; k < 5; k++) {
          const s = part(sph(0.2), mat(0xf1f3f5, { transparent: true, opacity: 0.85 }), 0, 0, 0, g);
          s.castShadow = false;
          g.userData.smoke.push({ s, t: k / 5, x: k % 2 ? 0.35 : -0.35, y0: k % 2 ? 1.0 : 1.3 });
        }
        break;
      }
      default: { // globe
        add(sph(0.62), 0x3a86ff, 0, 0.75, 0);
        [[0.3, 0.95, 0.42], [-0.42, 0.7, 0.36], [0.1, 0.5, -0.52], [-0.2, 1.15, -0.3], [0.5, 0.6, -0.1]].forEach(p => add(sph(0.2), 0x51cf66, p[0], p[1], p[2], 1, 0.9, 0.6));
        const ring = add(new T.TorusGeometry(0.85, 0.035, 6, 28), 0xffc93d, 0, 0.75, 0); ring.rotation.x = 1.2;
        break;
      }
    }
    return g;
  }

  // ---------- Shop buildings ----------
  let glassMat, doorMat;
  const signMats = {};
  function signMat(i) {
    if (!signMats[i]) {
      const tex = makeSignTex(i);
      signMats[i] = new T.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
      nightMats.push({ m: signMats[i], max: 0.85 });
    }
    return signMats[i];
  }
  const awningMats = {};
  function awningMat(i, repeat) {
    const key = i + '_' + repeat;
    if (!awningMats[key]) {
      const tex = makeAwningTex(STYLE[i].accent);
      tex.repeat.set(repeat, 1);
      awningMats[key] = new T.MeshLambertMaterial({ map: tex });
    }
    return awningMats[key];
  }

  function buildStall(i, g) {
    const st = STYLE[i];
    box(3.2, 1.0, 1.2, mat(st.wall), 0, 0.5, 0.4, g);
    box(3.3, 0.22, 1.3, mat(st.accent), 0, 0.92, 0.4, g);
    box(3.24, 0.3, 0.05, mat(st.accent), 0, 0.35, 1.02, g, true);
    for (const x of [-1.5, 1.5]) for (const z of [-0.9, 1.0]) part(geo('post', () => new T.CylinderGeometry(0.06, 0.06, 2.3, 6)), mat(0x7a5a3c), x, 1.15, z, g);
    const roof = box(3.8, 0.14, 2.0, awningMat(i, 5), 0, 2.38, -0.35, g);
    roof.rotation.x = 0.1;
    if (i === 0) { // the noodle cart has wheels and a steaming pot
      const wheel = geo('wheel', () => new T.CylinderGeometry(0.34, 0.34, 0.12, 12).rotateZ(Math.PI / 2));
      part(wheel, mat(0x2b2118), -1.7, 0.34, 0.4, g); part(wheel, mat(0x2b2118), 1.7, 0.34, 0.4, g);
      part(geo('pot', () => new T.CylinderGeometry(0.32, 0.26, 0.36, 12)), mat(0x8d99ae), -0.9, 1.2, 0.4, g);
    } else {
      box(0.7, 0.5, 0.6, mat(0xc99b66), -1.0, 1.26, 0.35, g);
      box(0.5, 0.36, 0.5, mat(0xddb67c), 0.9, 1.2, 0.4, g);
    }
    const chef = makePersonMesh(0xffffff, { hat: true });
    chef.position.set(0.35, 0, -0.5);
    g.add(chef);
    g.userData.chef = chef;
    const em = sprite(emojiTex(E.BUSINESSES[i].emoji), 1.5, 1.5, { depthTest: true });
    em.position.set(0, 3.5, 0.1);
    g.add(em);
    g.userData.bobber = em;
    // A little plaza around the stall: picnic tables and planters
    for (const [x, z] of [[-3.6, 0.2], [3.7, -0.6]]) {
      box(1.5, 0.1, 0.8, mat(0xc99b66), x, 0.75, z, g);
      box(1.5, 0.08, 0.3, mat(0xb08350), x, 0.42, z - 0.7, g, true);
      box(1.5, 0.08, 0.3, mat(0xb08350), x, 0.42, z + 0.7, g, true);
      box(0.1, 0.75, 0.6, mat(0x7a5a3c), x - 0.55, 0.37, z, g, true);
      box(0.1, 0.75, 0.6, mat(0x7a5a3c), x + 0.55, 0.37, z, g, true);
    }
    for (const [x, z] of [[-5.2, -3.4], [5.2, -3.4], [-5.2, 0.9], [5.2, 0.9]]) {
      box(0.9, 0.5, 0.9, mat(0xf4f6fb), x, 0.25, z, g);
      part(geo('bush', () => new T.IcosahedronGeometry(0.55, 1)), mat(0x6fdc4a), x, 0.85, z, g);
    }
  }

  function addWindows(g, seg, y0, isBase) {
    const floors = Math.max(1, Math.round(seg.h / 3.2)), fh = seg.h / floors;
    const list = [];
    const place = (x, y, z, ry, sx, sy) => list.push([x, y, z, ry, sx, sy]);
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh + fh * 0.55;
      const ground = isBase && f === 0;
      const nf = Math.max(2, Math.floor(seg.w / 1.9)), nd = Math.max(1, Math.floor(seg.d / 2.1));
      for (let k = 0; k < nf; k++) {
        const x = (k + 0.5) / nf * seg.w - seg.w / 2;
        if (ground) { if (Math.abs(x) > 1.2) place(x, y0 + 1.5, seg.d / 2 + 0.02, 0, 1.5, 1.4); }
        else place(x, y, seg.d / 2 + 0.02, 0, 1, 1);
        if (!ground) place(x, y, -seg.d / 2 - 0.02, Math.PI, 1, 1);
      }
      for (let k = 0; k < nd; k++) {
        const z = (k + 0.5) / nd * seg.d - seg.d / 2;
        place(seg.w / 2 + 0.02, y, z, Math.PI / 2, 1, 1);
        place(-seg.w / 2 - 0.02, y, z, -Math.PI / 2, 1, 1);
      }
    }
    const inst = new T.InstancedMesh(geo('win', () => new T.PlaneGeometry(0.95, 1.25)), glassMat, list.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    list.forEach((w, k) => {
      q.setFromEuler(e.set(0, w[3], 0));
      inst.setMatrixAt(k, m4.compose(tmpV.set(w[0], w[1], w[2]), q, tmpV2.set(w[4], w[5], 1)));
    });
    g.add(inst);
  }

  function buildBuilding(i, tier, g) {
    const st = STYLE[i], segs = SEGS[tier];
    let y = 0;
    segs.forEach((seg, k) => {
      box(seg.w, seg.h, seg.d, mat(st.wall), 0, y + seg.h / 2, 0, g);
      box(seg.w + 0.4, 0.3, seg.d + 0.4, mat(st.accent), 0, y + seg.h + 0.15, 0, g);
      addWindows(g, seg, y, k === 0);
      y += seg.h + 0.3;
    });
    const base = segs[0];
    box(1.5, 2.3, 0.14, doorMat, 0, 1.15, base.d / 2 + 0.05, g, true);
    box(0.08, 2.3, 0.16, mat(st.accent), 0, 1.15, base.d / 2 + 0.07, g, true);
    const aw = box(base.w * 0.92, 0.16, 1.5, awningMat(i, Math.round(base.w)), 0, 2.95, base.d / 2 + 0.6, g);
    aw.rotation.x = 0.28;
    // Shop sign: on the roof edge for the small shop, across the facade for bigger ones
    const sw = Math.min(base.w * 0.86, 7.2);
    const sign = box(sw, sw / 4, 0.22, [mat(st.accent), mat(st.accent), mat(st.accent), mat(st.accent), signMat(i), mat(st.accent)], 0,
      tier === 1 ? base.h + 0.3 + sw / 8 : 4.35, tier === 1 ? base.d / 2 - 0.2 : base.d / 2 + 0.14, g);
    void sign;
    if (tier >= 2) { // café tables out front
      for (const x of [-base.w / 2 + 0.2, base.w / 2 - 0.2]) {
        if (Math.abs(x) + 0.8 > 6) continue;
        part(geo('tpole', () => new T.CylinderGeometry(0.04, 0.04, 1.9, 6)), mat(0x7a7f8f), x, 0.95, base.d / 2 + 1.5, g);
        part(geo('umb', () => new T.ConeGeometry(0.95, 0.42, 10)), mat(st.accent), x, 2.0, base.d / 2 + 1.5, g);
        part(geo('ttop', () => new T.CylinderGeometry(0.5, 0.5, 0.07, 12)), mat(0xfff7ec), x, 0.78, base.d / 2 + 1.5, g);
      }
    }
    if (tier >= 4) { // flagship banners
      for (const x of [-base.w / 2 + 0.9, base.w / 2 - 0.9]) box(0.9, 4.4, 0.1, mat(st.accent), x, base.h + 0.3 + 2.8, SEGS[4][1].d / 2 + 0.08, g, true);
    }
    const m = mascot(i);
    const ms = [0, 1.7, 2.4, 3.1, 3.6][tier];
    m.scale.setScalar(ms);
    m.position.set(tier === 1 ? base.w / 2 - 1.4 : 0, y, tier === 1 ? -0.6 : 0);
    g.add(m);
    g.userData.mascot = m;
  }

  function buildLotSign(i, locked, g) {
    const tex = makeSaleTex(i, locked);
    for (const x of [-1.25, 1.25]) part(geo('spost', () => new T.CylinderGeometry(0.08, 0.08, 2.2, 6)), mat(0x8a5a3c), x, 1.1, 0, g);
    const board = new T.Mesh(new T.PlaneGeometry(3, 3), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide }));
    board.position.set(0, 3.1, 0);
    board.castShadow = true;
    g.add(board);
    g.userData.board = board;
    g.userData.tex = tex;
    for (let k = 0; k < 7; k++) { // little fence
      box(0.12, 0.7, 0.12, mat(0xfff7ec), -5.4 + k * 1.8, 0.35, 0.9, g, true);
    }
    box(11, 0.1, 0.08, mat(0xfff7ec), 0, 0.55, 0.9, g, true);
  }

  function rebuildShop(s, tier) {
    if (s.group) {
      if (s.group.userData.tex) { s.group.userData.tex.dispose(); s.group.userData.board.material.dispose(); }
      disposeGroup(s.group);
    }
    const g = new T.Group();
    s.tier = tier;
    const d = shopDepth(tier);
    if (tier >= 1) buildBuilding(s.i, tier, g);
    else if (tier === 0) buildStall(s.i, g);
    else buildLotSign(s.i, tier === -2, g);
    g.position.set(s.cx, 0.28, tier >= 0 ? s.cz + 5 - d / 2 : s.cz + 3.4);
    scene.add(g);
    s.group = g;
    s.h = tier >= 0 ? shopHeight(tier) : 4.6;
    s.box.set(tmpV.set(s.cx - 6.2, 0, s.cz - 6.2), tmpV2.set(s.cx + 6.2, s.h + (tier >= 1 ? 4 : 1.2), s.cz + 7.6));
    s.ground.material = mat(tier >= 0 ? 0xeadfce : tier === -1 ? 0xa5d08a : 0x97b98a);
    s.barY = s.h + (tier >= 1 ? [0, 2.9, 3.6, 4.4, 4.9][tier] : 1.9);
  }

  function buildShops() {
    glassMat = new T.MeshLambertMaterial({ color: 0x79b8e6, emissive: 0xffd27a, emissiveIntensity: 0 });
    nightMats.push({ m: glassMat, max: 0.9 });
    doorMat = mat(0x4a3428);
    const barBg = new T.SpriteMaterial({ color: 0x1b1236, depthTest: false, transparent: true, opacity: 0.85 });
    const barFill = new T.SpriteMaterial({ color: 0xffb03d, depthTest: false });
    barBg.userData.shared = barFill.userData.shared = true;
    LOTS.forEach((l, i) => {
      const c = blockCenter(l[0], l[1]);
      const s = { i, bx: l[0], bz: l[1], cx: c.x, cz: c.z, tier: -9, group: null, box: new T.Box3(), queue: [], incoming: 0,
        nextSpawn: 0, lastServe: 0, pop: 0, h: 3, barY: 5, affordable: false };
      s.ground = box(12.4, 0.08, 12.4, mat(0xeadfce), c.x, 0.24, c.z, scene, true);
      s.ground.receiveShadow = true;
      s.bg = new T.Sprite(barBg); s.bg.scale.set(3.3, 0.5, 1); s.bg.renderOrder = 10;
      s.fill = new T.Sprite(barFill); s.fill.center.set(0, 0.5); s.fill.renderOrder = 11;
      s.hint = sprite(emojiTex('👆'), 1.5, 1.5);
      s.bg.visible = s.fill.visible = s.hint.visible = false;
      scene.add(s.bg, s.fill, s.hint);
      shops.push(s);
    });
  }

  // ---------- Effects: coins and confetti ----------
  const coins = [], confetti = [];
  function buildFx() {
    for (let k = 0; k < 14; k++) { const s = sprite(emojiTex('💰'), 0.9, 0.9); s.visible = false; scene.add(s); coins.push({ s, t: 9 }); }
    const cols = [0xff6b6b, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8, 0xffffff];
    for (let k = 0; k < 48; k++) {
      const s = new T.Sprite(new T.SpriteMaterial({ color: cols[k % cols.length], depthTest: false }));
      s.scale.set(0.28, 0.28, 1); s.visible = false; s.renderOrder = 12; scene.add(s);
      confetti.push({ s, t: 9, vx: 0, vy: 0, vz: 0 });
    }
  }
  function popCoin(x, y, z) {
    const c = coins.find(k => k.t > 0.9);
    if (!c) return;
    c.t = 0; c.s.position.set(x, y, z); c.s.visible = true;
  }
  W.burst = function (x, y, z, count) {
    let n = count || 24;
    for (const c of confetti) {
      if (n <= 0) break;
      if (c.t < 1.3) continue;
      c.t = 0; c.s.position.set(x, y, z); c.s.visible = true;
      const a = Math.random() * 6.283, sp = rand(3, 8);
      c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = rand(7, 13);
      n--;
    }
  };
  function updateFx(dt) {
    for (const c of coins) {
      if (c.t > 0.9) continue;
      c.t += dt;
      c.s.position.y += dt * 2.4;
      c.s.material.opacity = 1 - Math.max(0, c.t - 0.5) / 0.4;
      if (c.t > 0.9) c.s.visible = false;
    }
    for (const c of confetti) {
      if (c.t > 1.3) continue;
      c.t += dt;
      c.vy -= 22 * dt;
      c.s.position.x += c.vx * dt; c.s.position.y += c.vy * dt; c.s.position.z += c.vz * dt;
      if (c.t > 1.3 || c.s.position.y < 0.2) { c.s.visible = false; c.t = 9; }
    }
  }

  // ---------- Per-frame shop logic ----------
  function updateShops(dt, state, earned, nowMs) {
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const s of shops) {
      const b = state.biz[s.i];
      const owned = b.level > 0;
      // Animations
      if (s.pop > 0) {
        s.pop = Math.max(0, s.pop - dt * 2.2);
        const k = 1 + Math.sin(s.pop * Math.PI) * 0.16 * s.pop;
        s.group.scale.set(k, 1 + (k - 1) * 1.6, k);
      }
      const ud = s.group.userData;
      if (ud.mascot) {
        ud.mascot.rotation.y += dt * 0.6;
        if (ud.mascot.userData.smoke) for (const p of ud.mascot.userData.smoke) {
          p.t = (p.t + dt * 0.35) % 1;
          p.s.position.set(p.x + Math.sin(p.t * 5) * 0.15, p.y0 + p.t * 1.6, 0);
          p.s.scale.setScalar(0.5 + p.t * 1.3);
          p.s.material.opacity = 0.85 * (1 - p.t);
        }
      }
      if (ud.bobber) ud.bobber.position.y = 3.5 + Math.sin(time * 2 + s.i) * 0.12;
      if (ud.board) {
        const k = s.affordable ? 1 + Math.abs(Math.sin(time * 4)) * 0.12 : 1;
        ud.board.scale.setScalar(k);
        ud.board.position.y = 3.1 + (s.affordable ? Math.abs(Math.sin(time * 4)) * 0.35 : 0);
      }
      if (!owned) { s.bg.visible = s.fill.visible = s.hint.visible = false; continue; }

      const ct = E.cycleTime(state, s.i);
      // Customers: a quiet trickle for a new stall, a constant line for a famous restaurant
      const cap = Math.min(6, 1 + s.tier + (b.level >= 10 ? 1 : 0));
      if (s.queue.length + s.incoming < cap && time > s.nextSpawn) {
        summonCustomer(s);
        s.nextSpawn = time + Math.max(1.5, 6.5 * Math.pow(0.88, b.level - 1)) * rand(0.8, 1.25);
      }
      if (earned[s.i] > 0) {
        const ready = s.queue.filter((p, k) => !p.moving || k === 0);
        if (ct >= 3) ready.forEach(p => serve(s, p));
        else if (ready.length && time - s.lastServe > 0.75) { serve(s, ready[0]); s.lastServe = time; }
        if (ud.chef) ud.chef.userData.hopT = 0.3;
      }
      if (ud.chef) {
        const c = ud.chef;
        c.userData.hopT = Math.max(0, (c.userData.hopT || 0) - dt);
        c.position.y = Math.sin(c.userData.hopT / 0.3 * Math.PI) * 0.3;
        c.rotation.y = b.running ? Math.sin(time * 9) * 0.25 : 0;
      }

      // Floating progress bar / tap hint
      const idle = !b.running && !b.manager;
      const showBar = b.running && ct >= 0.6;
      s.bg.visible = s.fill.visible = showBar;
      if (showBar) {
        s.bg.position.set(s.cx, s.barY, s.group.position.z);
        s.fill.position.copy(s.bg.position).addScaledVector(camRight, -1.55);
        s.fill.scale.set(Math.max(0.02, 3.1 * Math.min(1, b.progress)), 0.32, 1);
      }
      s.hint.visible = idle;
      if (idle) s.hint.position.set(s.cx, s.barY + 1.5 + Math.abs(Math.sin(time * 5)) * 0.6, s.group.position.z);
    }
    void nowMs;
  }

  // ---------- Day and night ----------
  function updateDayNight(dt) {
    dayT = (dayT + dt / 300) % 1;
    // 0 → 0.55 day, 0.55 → 0.65 dusk, 0.65 → 0.9 night, 0.9 → 1 dawn
    let day;
    if (dayT < 0.55) day = 1;
    else if (dayT < 0.65) day = 1 - (dayT - 0.55) / 0.1;
    else if (dayT < 0.9) day = 0;
    else day = (dayT - 0.9) / 0.1;
    const dusk = 1 - Math.abs(day - 0.5) * 2;   // 1 in the middle of a transition
    const sky = scene.background;
    sky.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * 0.55);
    fog.color.copy(sky);
    sun.intensity = 0.35 + day * 2.9;
    sun.color.setHex(0xfff1dc).lerp(tmpColor.setHex(0xff9a5c), dusk * 0.7);
    hemi.intensity = 0.7 + day * 1.0;
    const night = 1 - day;
    for (const n of nightMats) n.m.emissiveIntensity = n.max * night;
    lampMat.color.setHex(0x9aa0ad).lerp(tmpColor.setHex(0xffe08a), night);
    W.night = night;
  }
  const tmpColor = new T.Color();

  // ---------- Skyline grows with the empire ----------
  function updateDecor(dt, instant) {
    for (const b of decor) {
      const target = 0.2 + 0.8 * clamp((prosperity - b.need) / 0.22, 0, 1);
      if (b.f < 0 || instant) b.f = target;
      else if (Math.abs(target - b.f) > 0.001) b.f += clamp(target - b.f, -dt * 0.25, dt * 0.25);
      else continue;
      b.mesh.position.y = 0.28 - (1 - b.f) * b.H;
    }
  }

  // ---------- Camera ----------
  function updateCamera(dt) {
    const g = cam.g;
    g.tx = clamp(g.tx, -HALF, HALF); g.tz = clamp(g.tz, -HALF, HALF); g.dist = clamp(g.dist, 30, 270);
    const k = 1 - Math.exp(-dt * cam.ease);
    cam.tx += (g.tx - cam.tx) * k; cam.tz += (g.tz - cam.tz) * k;
    cam.dist += (g.dist - cam.dist) * k; cam.yaw += (g.yaw - cam.yaw) * k;
    const ce = Math.cos(cam.el), se = Math.sin(cam.el);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * ce * cam.dist, se * cam.dist + 1.5, cam.tz + Math.cos(cam.yaw) * ce * cam.dist);
    camera.lookAt(cam.tx, 1.5, cam.tz);
    camera.updateMatrixWorld();
  }
  function bindInput() {
    const pts = new Map();
    let moved = 0, downAt = 0, lastPinch = 0, lastAngle = 0;
    const panBy = (dx, dy) => {
      const k = cam.dist * 2 * Math.tan(camera.fov * Math.PI / 360) / canvas.clientHeight;
      const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
      cam.g.tx += (-dx * cy - dy * sy / Math.sin(cam.el)) * k;
      cam.g.tz += (dx * sy - dy * cy / Math.sin(cam.el)) * k;
      cam.ease = 14;
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button });
      if (pts.size === 1) { moved = 0; downAt = performance.now(); }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastAngle = Math.atan2(b.y - a.y, b.x - a.x);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) {
        if (p.button === 2 || e.shiftKey) cam.g.yaw -= dx * 0.008;
        else panBy(dx, dy);
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (lastPinch > 0) cam.g.dist *= lastPinch / Math.max(1, d);
        let da = ang - lastAngle;
        if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
        cam.g.yaw -= da;
        panBy(dx / 2, dy / 2);
        lastPinch = d; lastAngle = ang;
      }
    });
    const up = (e) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (p && pts.size === 0 && moved < 12 && performance.now() - downAt < 450) tapAt(e.clientX, e.clientY);
      lastPinch = 0;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); lastPinch = 0; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.g.dist *= Math.exp(e.deltaY * 0.0012); cam.ease = 14; }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  function tapAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (vip) {
      tmpV.set(vip.p.x, 1.4, vip.p.z);
      if (ray.ray.distanceSqToPoint(tmpV) < 2.2 * 2.2) {
        const pos = { x: vip.p.x, z: vip.p.z };
        W.burst(pos.x, 2, pos.z, 40);
        endVip();
        if (hooks.onPickVip) hooks.onPickVip(clientX, clientY);
        return;
      }
    }
    let best = -1, bd = 1e9;
    for (const s of shops) {
      const hit = ray.ray.intersectBox(s.box, tmpV);
      if (!hit) continue;
      const d = hit.distanceToSquared(camera.position);
      if (d < bd) { bd = d; best = s.i; }
    }
    if (best >= 0 && hooks.onPickShop) hooks.onPickShop(best, clientX, clientY);
  }

  // ---------- VIP customer ----------
  function endVip() {
    if (!vip) return;
    const p = vip.p;
    vip = null;
    removePerson(p);
  }
  W.spawnVip = function (nearShop) {
    if (!W.ok || vip) return false;
    const s = shops[nearShop] || shops[0];
    const near = [];
    for (let i = 0; i < NODES; i++) { const d = Math.hypot(nodeXZ[i].x - s.cx, nodeXZ[i].z - s.cz); if (d > 8 && d < 30) near.push(i); }
    const p = spawnPerson(pick(near), { shirt: 0xffc93d });
    p.speed = 2.6;
    part(new T.ConeGeometry(0.2, 0.24, 5), mat(0xffb000), 0, 1.5, 0, p.g).castShadow = false;
    const beam = new T.Mesh(new T.CylinderGeometry(0.75, 0.75, 16, 12, 1, true), new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide }));
    beam.position.y = 8;
    p.g.add(beam);
    const face = sprite(emojiTex('🤩'), 1.5, 1.5);
    face.position.y = 2.7;
    p.g.add(face);
    p.bubble = face;
    wanderAgain(p);
    vip = { p, until: time + 22 };
    return true;
  };
  W.hasVip = () => !!vip;

  // ---------- Public API ----------
  W.init = function (canvasEl, h) {
    canvas = canvasEl; hooks = h || {};
    try {
      renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    skyDay = new T.Color(0x9ad8ff); skyDusk = new T.Color(0xff9e6b); skyNight = new T.Color(0x161b3d);
    scene.background = skyDay.clone();
    fog = new T.Fog(scene.background.getHex(), 260, 760);
    scene.fog = fog;
    camera = new T.PerspectiveCamera(24, 1, 2, 1200);
    hemi = new T.HemisphereLight(0xd8e9ff, 0x8f86b0, 1.7);
    scene.add(hemi);
    sun = new T.DirectionalLight(0xfff1dc, 2.8);
    sun.position.set(-70, 62, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 10; sc.far = 260;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
    scene.add(sun, sun.target);

    buildGraph();
    buildGround();
    buildDecor();
    buildShops();
    buildFx();
    bindInput();
    buildPost();
    W.setQuality(0);
    W.resize();
    window.addEventListener('resize', W.resize);
    W.ok = true;
    return true;
  };

  W.resize = function () {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep the city readable on tall phone screens
    camera.fov = w / h < 0.7 ? 30 : 22;
    camera.updateProjectionMatrix();
    sizePost();
  };

  // 0 = full, 1 = no shadows, 2 = no shadows + lower resolution
  W.setQuality = function (q) {
    quality = q;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(q === 0 ? Math.min(dpr, 2) : q === 1 ? Math.min(dpr, 1.5) : 1);
    shadowsOn = q === 0;
    renderer.shadowMap.enabled = shadowsOn;
    sun.castShadow = shadowsOn;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)); });
    W.resize();
  };
  W.getQuality = () => quality;

  // Match the 3D city to the save: building stages, for-sale signs, prosperity.
  W.sync = function (state, instant) {
    if (!W.ok) return;
    const firstUnowned = state.biz.findIndex(b => b.level === 0);
    let milestones = 0, owned = 0;
    shops.forEach((s) => {
      const b = state.biz[s.i];
      const want = b.level > 0 ? tierFor(b.level) : (s.i === firstUnowned ? -1 : -2);
      if (b.level > 0) { owned++; milestones += E.milestoneInfo(b.level).reached; }
      if (want !== s.tier) {
        const grew = s.tier >= -1 && want > s.tier && !instant;
        rebuildShop(s, want);
        if (grew) { s.pop = 1; W.burst(s.cx, s.h + 1, s.cz + 3, 30); }
        if (want < 0) { // closed down (franchise reset): customers walk away
          s.queue.slice().forEach(p => { s.queue.splice(s.queue.indexOf(p), 1); p.shop = null; setBubble(p, null); p.node = nearestNode(p.x, p.z); wanderAgain(p); });
          people.forEach(p => { if (p.shop === s) { p.shop = null; setBubble(p, null); p.state = 'wander'; } });
          s.incoming = 0;
        }
      }
      s.affordable = want === -1 && state.cash >= E.BUSINESSES[s.i].baseCost;
    });
    prosperity = clamp(0.03 + 0.45 * (owned - 1) / 9 + 0.52 * Math.min(1, milestones / 55), 0, 1);
    if (instant) updateDecor(0, true);
  };

  W.pulse = function (i) { if (W.ok && shops[i]) shops[i].pop = 1; };

  W.focusShop = function (i, instant) {
    if (!W.ok) return;
    const s = shops[i];
    cam.g.tx = s.cx; cam.g.tz = s.cz + 2.5;
    cam.g.dist = FOCUS_DIST[Math.max(0, s.tier)];
    cam.ease = 5;
    if (instant) { cam.tx = cam.g.tx; cam.tz = cam.g.tz; cam.dist = cam.g.dist; cam.yaw = cam.g.yaw; }
  };

  // Opening shot: sweep down from high above the city to the little cart in the middle.
  W.intro = function () {
    if (!W.ok) return;
    cam.tx = 0; cam.tz = 0; cam.dist = 260; cam.yaw = cam.g.yaw + 1.6;
    cam.ease = 1.15;
    W._introUntil = time + 4;
  };

  // Screen position (CSS pixels) just above a shop, for floating "+$" text. Null when off-screen.
  W.shopScreenPos = function (i) {
    if (!W.ok) return null;
    const s = shops[i];
    tmpV.set(s.cx, s.barY - 0.6, s.group.position.z).project(camera);
    if (tmpV.z > 1 || Math.abs(tmpV.x) > 1 || Math.abs(tmpV.y) > 1) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (tmpV.x + 1) / 2 * r.width, y: r.top + (1 - tmpV.y) / 2 * r.height };
  };
  W.vipScreenPos = function () {
    if (!vip) return null;
    tmpV.set(vip.p.x, 1.4, vip.p.z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (tmpV.x + 1) / 2 * r.width, y: r.top + (1 - tmpV.y) / 2 * r.height, visible: Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1 };
  };

  W.update = function (dt, state, earned, nowMs) {
    if (!W.ok) return;
    time += dt;
    if (W._introUntil && time > W._introUntil) { W._introUntil = 0; cam.ease = 8; }
    else if (!W._introUntil && cam.ease !== 8) cam.ease += (8 - cam.ease) * Math.min(1, dt * 2);
    updateCamera(dt);
    updateDayNight(dt);
    updateDecor(dt);
    updateShops(dt, state, earned, nowMs);
    updatePeople(dt);
    updateCars(dt);
    updateFx(dt);
    if (vip && time > vip.until) { endVip(); if (hooks.onVipGone) hooks.onVipGone(); }
  };

  // ---------- Tilt-shift lens ----------
  // Scene → off-screen target → blurred copy at quarter resolution → final pass keeps a sharp band
  // across the middle of the screen and melts the top and bottom into blur, like a miniature photo.
  let post = null;
  function buildPost() {
    try {
      const type = renderer.capabilities.isWebGL2 ? T.HalfFloatType : T.UnsignedByteType;
      const sceneRT = new T.WebGLRenderTarget(4, 4, { type, samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
      const blurA = new T.WebGLRenderTarget(4, 4, { type, depthBuffer: false });
      const blurB = new T.WebGLRenderTarget(4, 4, { type, depthBuffer: false });
      const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const amount = 'float amount(float y){ return smoothstep(band, band + 0.30, abs(y - focus)); }';
      const blurFs = `uniform sampler2D tex; uniform vec2 dir; uniform float focus; uniform float band; varying vec2 vUv;
        ${amount}
        void main(){
          vec2 o = dir * (0.35 + amount(vUv.y) * 1.9);
          vec4 c = texture2D(tex, vUv) * 0.227027;
          c += (texture2D(tex, vUv + o) + texture2D(tex, vUv - o)) * 0.1945946;
          c += (texture2D(tex, vUv + o * 2.0) + texture2D(tex, vUv - o * 2.0)) * 0.1216216;
          c += (texture2D(tex, vUv + o * 3.0) + texture2D(tex, vUv - o * 3.0)) * 0.054054;
          c += (texture2D(tex, vUv + o * 4.0) + texture2D(tex, vUv - o * 4.0)) * 0.016216;
          gl_FragColor = c;
        }`;
      const finalFs = `uniform sampler2D sharp; uniform sampler2D blur; uniform float focus; uniform float band; uniform float strength; varying vec2 vUv;
        ${amount}
        void main(){
          vec3 c = mix(texture2D(sharp, vUv).rgb, texture2D(blur, vUv).rgb, amount(vUv.y) * strength);
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 1.28);                       // toy-like saturation
          c = (c - 0.18) * 1.08 + 0.18;                    // a touch of contrast
          vec2 v = vUv - 0.5;
          c *= 1.0 - dot(v, v) * 0.55;                     // soft vignette
          gl_FragColor = vec4(max(c, 0.0), 1.0);
          #include <colorspace_fragment>
        }`;
      const u = { focus: { value: 0.57 }, band: { value: 0.1 } };
      const mk = (fs, extra) => new T.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms: Object.assign({}, u, extra), depthTest: false, depthWrite: false });
      const hMat = mk(blurFs, { tex: { value: sceneRT.texture }, dir: { value: new T.Vector2() } });
      const vMat = mk(blurFs, { tex: { value: blurA.texture }, dir: { value: new T.Vector2() } });
      const fMat = mk(finalFs, { sharp: { value: sceneRT.texture }, blur: { value: blurB.texture }, strength: { value: 1 } });
      const quad = new T.Mesh(new T.PlaneGeometry(2, 2), hMat);
      quad.frustumCulled = false;
      const pScene = new T.Scene();
      pScene.add(quad);
      post = { sceneRT, blurA, blurB, hMat, vMat, fMat, quad, pScene, pCam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), u };
    } catch (e) { post = null; }
  }
  function sizePost() {
    if (!post) return;
    const sz = renderer.getDrawingBufferSize(new T.Vector2());
    const bw = Math.max(2, Math.round(sz.x / 4)), bh = Math.max(2, Math.round(sz.y / 4));
    post.sceneRT.setSize(sz.x, sz.y);
    post.blurA.setSize(bw, bh);
    post.blurB.setSize(bw, bh);
    post.hMat.uniforms.dir.value.set(1 / bw, 0);
    post.vMat.uniforms.dir.value.set(0, 1 / bh);
  }
  W.setLens = function (on) { W.lens = !!on; };
  W.lens = true;

  W.render = function () {
    if (!W.ok) return;
    if (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio())) W.resize();
    if (!post || !W.lens) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    renderer.setRenderTarget(post.sceneRT);
    renderer.render(scene, camera);
    post.quad.material = post.hMat;
    renderer.setRenderTarget(post.blurA);
    renderer.render(post.pScene, post.pCam);
    post.quad.material = post.vMat;
    renderer.setRenderTarget(post.blurB);
    renderer.render(post.pScene, post.pCam);
    post.quad.material = post.fMat;
    renderer.setRenderTarget(null);
    renderer.render(post.pScene, post.pCam);
  };

  // For tests and screenshots
  W.debug = {
    get stats() { return { people: people.length, cars: cars.length, prosperity, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, quality }; },
    setTime(t) { dayT = t; },
    get vip() { return vip ? { x: vip.p.x, z: vip.p.z } : null; },
    cam,
    shops,
  };
})();
