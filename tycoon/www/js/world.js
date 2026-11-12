/*
 * Yum Empire — 3D world (Three.js, everything procedural: no model or image files).
 *
 * Each district (suburb, town, city, metropolis) is its own miniature map: a grid of blocks with
 * roads between them. Some blocks are land plots you can buy and build on; the rest is scenery
 * (houses, towers, parks). Customers walk the sidewalks to your shops, traffic drives the roads,
 * a train passes, balloons drift overhead, and the day turns to night.
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
  const BLOCK = 16, ROAD = 7, PITCH = BLOCK + ROAD, SIDE = 6.8;
  let N = 3, HALF = 0, NODES = 0;
  // plots: block (column, row) of each land plot, in the same order as Engine.DISTRICTS[d].plots
  const DCFG = [
    { n: 3, style: 'suburb', plots: [[1, 1], [0, 1], [2, 1], [1, 2], [1, 0], [2, 2]], parks: ['0,2'], people: [8, 18], cars: [3, 8] },
    { n: 4, style: 'town', plots: [[1, 1], [2, 1], [1, 2], [2, 2], [0, 1], [3, 2], [1, 3], [2, 0]], parks: ['0,3', '3,0'], people: [12, 32], cars: [7, 18] },
    { n: 5, style: 'city', plots: [[2, 2], [1, 2], [3, 2], [2, 3], [2, 1], [1, 3], [3, 3], [1, 1], [3, 1], [2, 0]], parks: ['1,4', '3,4', '0,1'], people: [14, 44], cars: [10, 30] },
    { n: 6, style: 'metro', plots: [[2, 2], [3, 2], [2, 3], [3, 3], [1, 2], [4, 3], [2, 1], [3, 4], [1, 1], [4, 4], [4, 1], [1, 4]], parks: ['0,5', '5,0', '2,5'], people: [18, 52], cars: [14, 36] },
  ];
  const PAD = [8.6, 10.4, 11.6, 12.4];   // paved area of a Small / Medium / Large / Huge plot
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
  const blockCenter = (bx, bz) => ({ x: (bx - (N - 1) / 2) * PITCH, z: (bz - (N - 1) / 2) * PITCH });
  const roadCoord = (k) => (k - (N - 2) / 2) * PITCH;   // centre line of road k (0 … N-2)
  const tierFor = (level) => (level >= 500 ? 4 : level >= 300 ? 3 : level >= 100 ? 2 : level >= 25 ? 1 : 0);
  const shopHeight = (tier) => (tier <= 0 ? 2.6 : SEGS[tier].reduce((a, s) => a + s.h, 0));
  const shopDepth = (tier) => (tier <= 0 ? 2.4 : SEGS[tier][0].d);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Seeded random so each district looks the same every time.
  let seed = 1337;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const spick = (arr) => arr[(srand() * arr.length) | 0];

  let renderer, scene, camera, canvas, hooks = {};
  let sun, hemi, fog, root = null, cfg = DCFG[0], D = -1;
  const cam = { tx: 0, tz: 2, dist: 64, yaw: 0.785, g: { tx: 0, tz: 2, dist: 64, yaw: 0.785 }, ease: 8, el: 0.9 };
  let shops = [], people = [], cars = [], decor = [], movers = [];
  const nightMats = [];   // materials whose glow follows the night
  let glowMat, skyDay, skyDusk, skyNight;
  let time = 0, dayT = 0.22, prosperity = 0, quality = 0, loadedAt = 0, nextWander = 0, nextCar = 0, introUntil = 0;
  let vip = null;
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), camRight = new T.Vector3(), tmpColor = new T.Color();

  // ---------- Small helpers ----------
  const cache = {};
  const once = (key, make) => (cache[key] || (cache[key] = make()));   // things shared by every district
  function mat(color, opts) {
    return once('m' + color + (opts ? JSON.stringify(opts) : ''), () => new T.MeshLambertMaterial(Object.assign({ color }, opts || {})));
  }
  function geo(key, make) {
    return once('g' + key, () => { const g = make(); g.userData.shared = true; return g; });
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
  const TEXT_FONT = '"Lilita One",-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  function emojiTex(e) {
    return once('e' + e, () => canvasTex(128, 128, (g) => {
      g.font = '96px ' + EMOJI_FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(e, 64, 70);
    }));
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
      if (o.isInstancedMesh) o.dispose();
      if (o.userData && o.userData.ownTex) { o.userData.ownTex.dispose(); o.material.dispose(); }
    });
    if (g.parent) g.parent.remove(g);
  }

  // ---------- Instanced detail: thousands of small parts in three draw calls ----------
  let props = [], glows = [], blobs = [];
  const prop = (x, y, z, sx, sy, sz, color, ry) => props.push([x, y, z, sx, sy, sz, color, ry || 0]);   // solid box
  const glow = (x, y, z, sx, sy, sz, color) => glows.push([x, y, z, sx, sy, sz, color, 0]);              // light that shines at night
  const blob = (x, y, z, r, color, sy) => blobs.push([x, y, z, r, r * (sy || 1), r, color, 0]);           // round: leaves, bushes, flowers
  function flushInstances() {
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), col = new T.Color();
    const make = (list, geometry, material, shadow) => {
      if (!list.length) return;
      const im = new T.InstancedMesh(geometry, material, list.length);
      list.forEach((p, i) => {
        q.setFromEuler(e.set(0, p[7], 0));
        im.setMatrixAt(i, m4.compose(tmpV.set(p[0], p[1], p[2]), q, tmpV2.set(p[3], p[4], p[5])));
        im.setColorAt(i, col.setHex(p[6]));
      });
      im.castShadow = shadow; im.receiveShadow = shadow;
      root.add(im);
    };
    make(props, boxGeo(), once('propMat', () => new T.MeshLambertMaterial({ color: 0xffffff })), true);
    make(glows, boxGeo(), glowMat, false);
    make(blobs, geo('blob', () => new T.IcosahedronGeometry(1, 1)), once('blobMat', () => new T.MeshLambertMaterial({ color: 0xffffff })), true);
    props = []; glows = []; blobs = [];
  }
  const GREENS = [0x6fdc4a, 0x8be85a, 0x57c93f, 0x7fe04f];
  const CAR_COLORS = [0xe63946, 0x2f80ed, 0xffc300, 0x06d6a0, 0xf8f9fa, 0xff8fab, 0x8338ec, 0xff7b00, 0x1f9d55];
  function tree(x, z, s, color) {
    const c = color || spick(GREENS);
    prop(x, 0.2 + s * 0.6, z, 0.26 * s, 1.2 * s, 0.26 * s, 0x8a5a3c);
    blob(x, 0.2 + s * 1.75, z, 0.92 * s, c);
    blob(x + 0.55 * s, 0.2 + s * 1.45, z + 0.25 * s, 0.64 * s, c);
    blob(x - 0.45 * s, 0.2 + s * 1.5, z - 0.35 * s, 0.68 * s, c);
  }
  function pine(x, z, s) {
    prop(x, 0.2 + s * 0.4, z, 0.22 * s, 0.8 * s, 0.22 * s, 0x7a5236);
    blob(x, 0.2 + s * 1.2, z, 0.8 * s, 0x3f9d57, 1.1);
    blob(x, 0.2 + s * 2.0, z, 0.55 * s, 0x47a85f, 1.2);
    blob(x, 0.2 + s * 2.65, z, 0.32 * s, 0x52b46a, 1.3);
  }
  function lamp(x, z) {
    prop(x, 1.8, z, 0.12, 3.2, 0.12, 0x4a4f5e);
    glow(x, 3.5, z, 0.42, 0.3, 0.42, 0xffe9a8);
  }
  function bench(x, z, ry) {
    prop(x, 0.5, z, 1.5, 0.1, 0.5, 0xb08350, ry);
    prop(x - Math.sin(ry) * 0.22, 0.82, z - Math.cos(ry) * 0.22, 1.5, 0.45, 0.08, 0xb08350, ry);
  }
  function parkedCar(x, z, ry, color) {
    prop(x, 0.6, z, 1.7, 0.6, 3.5, color, ry);
    prop(x, 1.1, z, 1.5, 0.5, 1.8, 0x2b3a55, ry);
  }

  // ---------- Textures ----------
  function makeSignTex(t) {
    const def = E.TYPES[t], st = STYLE[t];
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
  // Sign on a plot you don't own yet (FOR SALE) or own but haven't built on (BUILD HERE)
  function makeLotTex(owned, size, price) {
    return canvasTex(256, 256, (g, w, h) => {
      const c = owned ? '#2e9e6b' : '#e8452c';
      g.fillStyle = '#fffaf0'; roundRect(g, 6, 6, w - 12, h - 12, 22); g.fill();
      g.lineWidth = 10; g.strokeStyle = c; g.stroke();
      g.fillStyle = c; roundRect(g, 6, 6, w - 12, 62, 22); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `900 36px ${TEXT_FONT}`; g.fillText(owned ? 'BUILD HERE' : 'FOR SALE', w / 2, 40);
      if (owned) { g.font = '96px ' + EMOJI_FONT; g.fillText('🏗️', w / 2, 136); }
      else {
        g.fillStyle = c; g.beginPath(); g.arc(w / 2, 128, 46, 0, 6.3); g.fill();
        g.fillStyle = '#fff'; g.font = `900 ${E.SIZES[size].id.length > 1 ? 50 : 64}px ${TEXT_FONT}`; g.fillText(E.SIZES[size].id, w / 2, 132);
      }
      g.fillStyle = '#2b2140';
      const txt = owned ? E.SIZES[size].name + ' land' : (price > 0 ? E.formatMoney(price) : 'FREE');
      fitText(g, txt, w - 40, 42, 900);
      g.fillText(txt, w / 2, 214);
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
  // Tower windows: one tile is 4 bays × 4 floors. A second texture marks which windows glow at night.
  function makeWindowTex(glass) {
    const lit = [];
    for (let k = 0; k < 16; k++) lit.push(srand() < 0.55);
    const draw = (night) => (g, w, h) => {
      g.fillStyle = night ? '#000' : '#fff'; g.fillRect(0, 0, w, h);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        g.fillStyle = night ? (lit[r * 4 + c] ? '#ffd98a' : '#141824') : glass;
        g.fillRect(c * 64 + 12, r * 64 + 10, 40, 38);
        if (!night) {
          g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(c * 64 + 12, r * 64 + 10, 40, 9);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(c * 64 + 31, r * 64 + 10, 2, 38);   // mullion
          g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(c * 64 + 8, r * 64 + 50, 48, 4);     // sill
        }
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
  const CORNER = [[-1, -1], [1, -1], [1, 1], [-1, 1]];   // NW, NE, SE, SW
  const nodeId = (bx, bz, c) => (bx * N + bz) * 4 + c;
  let nodeXZ = [], ADJ = [], edgeNodes = [];
  function buildGraph() {
    nodeXZ = []; ADJ = []; edgeNodes = [];
    NODES = N * N * 4;
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

  // ---------- Ground, roads, crossings, traffic lights ----------
  function buildGround() {
    const style = cfg.style;
    const grass = new T.Mesh(geo('grass', () => new T.PlaneGeometry(1100, 1100)), mat(style === 'suburb' ? 0x7ddc62 : style === 'metro' ? 0x5fb56a : 0x74d660));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.06; grass.receiveShadow = true;
    root.add(grass);
    const asphalt = mat(style === 'metro' ? 0x2f3852 : 0x3b4766);
    if (style !== 'suburb') {
      const base = new T.Mesh(new T.PlaneGeometry(HALF * 2, HALF * 2), asphalt);
      base.rotation.x = -Math.PI / 2; base.receiveShadow = true;
      root.add(base);
    }
    const lineMat = once('lineMat', () => new T.MeshBasicMaterial({ transparent: true, map: canvasTex(16, 8, (g) => {
      g.clearRect(0, 0, 16, 8); g.fillStyle = '#ffc93d'; g.fillRect(1, 0, 4, 8); g.fillRect(11, 0, 4, 8);
    }) }));
    const stripGeo = geo('strip', () => new T.PlaneGeometry(ROAD, 600));
    const lineGeo = geo('line', () => new T.PlaneGeometry(0.42, 600));
    for (let k = 0; k < N - 1; k++) {
      const c = roadCoord(k);
      for (const vertical of [true, false]) {
        const strip = new T.Mesh(stripGeo, asphalt);
        strip.rotation.x = -Math.PI / 2; strip.position.set(vertical ? c : 0, -0.02, vertical ? 0 : c);
        if (!vertical) strip.rotation.z = Math.PI / 2;
        strip.receiveShadow = true;
        const line = new T.Mesh(lineGeo, lineMat);
        line.rotation.x = -Math.PI / 2; line.position.set(vertical ? c : 0, 0.02, vertical ? 0 : c);
        if (!vertical) line.rotation.z = Math.PI / 2;
        root.add(strip, line);
      }
    }
    // Sidewalk slabs
    const slabs = new T.InstancedMesh(boxGeo(), mat(0xe2e5ef), N * N);
    const m4 = new T.Matrix4();
    let n = 0;
    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      const c = blockCenter(bx, bz);
      slabs.setMatrixAt(n++, m4.makeScale(BLOCK, 0.2, BLOCK).setPosition(c.x, 0.1, c.z));
    }
    slabs.receiveShadow = true;
    root.add(slabs);

    // Zebra crossings
    const zebraMat = once('zebraMat', () => new T.MeshBasicMaterial({ transparent: true, map: canvasTex(64, 8, (g) => {
      g.clearRect(0, 0, 64, 8); g.fillStyle = '#f4f1e6';
      for (let k = 0; k < 4; k++) g.fillRect(k * 16 + 3, 0, 10, 8);
    }) }));
    const zebra = new T.InstancedMesh(geo('zebra', () => new T.PlaneGeometry(ROAD - 0.6, 1.9)), zebraMat, N * N * 4);
    const flat = new T.Quaternion().setFromEuler(new T.Euler(-Math.PI / 2, 0, 0));
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
    root.add(zebra);

    // Traffic lights and stop lines at every junction
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < N - 1; j++) {
      const x = roadCoord(i), z = roadCoord(j), o = ROAD / 2 + 0.55;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz], k) => {
        const px = x + sx * o, pz = z + sz * o;
        prop(px, 1.7, pz, 0.14, 3.4, 0.14, 0x39405a);
        prop(px, 3.2, pz, 0.36, 0.9, 0.36, 0x1d1f27);
        glow(px, 3.48, pz, 0.4, 0.2, 0.4, k % 2 ? 0xff4d4d : 0x39d98a);
        glow(px, 2.95, pz, 0.4, 0.2, 0.4, k % 2 ? 0x5c2020 : 0x1c5c40);
      });
      for (const s of [-1, 1]) {
        prop(x + s * 1.75, 0.025, z - s * (ROAD / 2 + 3.4), 3.1, 0.02, 0.35, 0xf4f1e6);
        prop(x + s * (ROAD / 2 + 3.4), 0.025, z + s * 1.75, 0.35, 0.02, 3.1, 0xf4f1e6);
      }
    }
  }

  // ---------- Scenery blocks ----------
  const HOUSE_WALLS = [0xfff1d6, 0xffe0c2, 0xe3f1ff, 0xf6e7ff, 0xe9f7e1, 0xfff6c7];
  const HOUSE_ROOFS = [0xd9534f, 0x4a6fa5, 0x8d6e63, 0x5b8c5a, 0xe07b39];
  function house(x, z, face) {   // face: +1 looks south (+z), -1 looks north
    const wall = spick(HOUSE_WALLS), roofC = spick(HOUSE_ROOFS), w = 4.2 + srand() * 0.8, d = 3.6 + srand() * 0.6, h = 2.5 + (srand() < 0.3 ? 1.8 : 0);
    prop(x, 0.28 + h / 2, z, w, h, d, wall);
    const roof = part(geo('hroof', () => new T.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4)), mat(roofC), x, 0.28 + h + 0.8, z, root);
    roof.scale.set(w + 0.7, 1.6, d + 0.7);
    prop(x + w * 0.28, 0.28 + h + 1.1, z - d * 0.15, 0.45, 1.3, 0.45, 0xb8493a);                 // chimney
    prop(x - w * 0.18, 0.28 + 0.85, z + face * (d / 2 + 0.03), 0.8, 1.7, 0.08, 0x7a4a2a);          // door
    for (const ox of [w * 0.22, -w * 0.4]) prop(x + ox, 0.28 + 1.5, z + face * (d / 2 + 0.03), 0.8, 0.8, 0.08, 0x79b8e6);
    if (h > 3) for (const ox of [-w * 0.28, w * 0.24]) prop(x + ox, 0.28 + 3.3, z + face * (d / 2 + 0.03), 0.8, 0.8, 0.08, 0x79b8e6);
    prop(x - w * 0.18, 0.3, z + face * (d / 2 + 1.3), 1.0, 0.04, 2.6, 0xd9dde6);                   // path to the street
    for (const ox of [-1.8, 1.9]) blob(x + ox, 0.55, z + face * (d / 2 + 0.5), 0.42, spick(GREENS));
    if (srand() < 0.6) { prop(x + w / 2 + 1.3, 0.3, z + face * 1.2, 2.2, 0.04, 5, 0xbfc5d2); if (srand() < 0.7) parkedCar(x + w / 2 + 1.3, z + face * 1.0, 0, spick(CAR_COLORS)); }
    if (srand() < 0.5) prop(x - w / 2 - 0.9, 0.65, z + face * (d / 2 + 2.3), 0.3, 0.75, 0.3, 0x3a86ff);  // mailbox
  }
  function houseBlock(c) {
    prop(c.x, 0.26, c.z, 12.4, 0.08, 12.4, 0x86de6a);
    house(c.x - 3.3, c.z - 2.6, -1); house(c.x + 3.0, c.z - 2.6, -1);
    house(c.x - 3.3, c.z + 2.6, 1); house(c.x + 3.0, c.z + 2.6, 1);
    for (let k = 0; k < 7; k++) prop(c.x - 5.4 + k * 1.8, 0.55, c.z, 0.14, 0.6, 0.14, 0xffffff);   // back-garden fence
    prop(c.x, 0.7, c.z, 11, 0.1, 0.08, 0xffffff);
    if (srand() < 0.7) tree(c.x - 0.3, c.z - 0.9, 1.1);
    if (srand() < 0.7) pine(c.x + 5.3, c.z + 0.2, 0.9);
  }
  function parkBlock(c) {
    prop(c.x, 0.26, c.z, 12.4, 0.08, 12.4, 0x6fd35c);
    prop(c.x, 0.31, c.z, 12.4, 0.03, 1.5, 0xe9dcc3); prop(c.x, 0.31, c.z, 1.5, 0.03, 12.4, 0xe9dcc3);   // paths
    part(geo('rim', () => new T.CylinderGeometry(3.4, 3.6, 0.5, 24)), mat(0xe9edf5), c.x, 0.5, c.z, root).receiveShadow = true;
    const water = new T.Mesh(geo('water', () => new T.CircleGeometry(3.0, 24)), mat(0x3f8fe0));
    water.rotation.x = -Math.PI / 2; water.position.set(c.x, 0.77, c.z);
    root.add(water);
    prop(c.x, 1.2, c.z, 0.5, 1.4, 0.5, 0xe9edf5);
    const jets = [];
    for (let k = 0; k < 6; k++) {
      const s = part(geo('drop', () => new T.SphereGeometry(0.16, 6, 5)), mat(0xd6f0ff), c.x, 2, c.z, root);
      s.castShadow = false;
      jets.push(s);
    }
    movers.push(() => jets.forEach((s, k) => {   // fountain
      const t = (time * 0.9 + k / 6) % 1, a = k * 1.047;
      s.position.set(c.x + Math.cos(a) * t * 1.9, 1.9 + Math.sin(t * Math.PI) * 1.5, c.z + Math.sin(a) * t * 1.9);
    }));
    for (const a of [0.785, 2.356, 3.927, 5.498]) bench(c.x + Math.cos(a) * 4.6, c.z + Math.sin(a) * 4.6, -a + Math.PI / 2);
    const FLOWERS = [0xff6b9d, 0xffd43b, 0xff8787, 0xffffff, 0xc77dff];
    for (let k = 0; k < 28; k++) { const a = k / 28 * 6.283, r = 4.2 + (k % 2) * 0.35; blob(c.x + Math.cos(a) * r, 0.42, c.z + Math.sin(a) * r, 0.2, FLOWERS[k % 5]); }
    for (const [ox, oz] of [[-5, -5], [5, -5], [5, 5], [-5, 5], [-5, 2.4], [5, -2.4], [2.4, -5], [-2.4, 5]]) tree(c.x + ox, c.z + oz, 1 + srand() * 0.5);
  }
  function towerBlock(c, bx, bz) {
    const style = cfg.style, key = style === 'metro' ? 'neon' : 'day';
    const mats = once('tower_' + key, () => {
      const palette = key === 'neon' ? [0x8fa3d9, 0x6f7fc4, 0xb8a6e8, 0x7fb6d9, 0x9aa8c9, 0xd4c2f0, 0x6c8fb5, 0xa6b9e6]
        : [0xffe29a, 0xffb26b, 0xf6f6fa, 0xc4d6f5, 0xffd2c4, 0xf1e7cf, 0xffc857, 0xbfe3d6];
      const [winTex, litTex] = makeWindowTex(key === 'neon' ? '#4b6fb8' : '#6f8fb3');
      return palette.map(col => {
        const side = new T.MeshLambertMaterial({ color: col, map: winTex, emissive: 0xffffff, emissiveMap: litTex, emissiveIntensity: 0 });
        nightMats.push({ m: side, max: key === 'neon' ? 1.15 : 0.95 });
        return { side, roof: mat(new T.Color(col).multiplyScalar(0.7).getHex()) };
      });
    });
    prop(c.x, 0.26, c.z, 12.4, 0.08, 12.4, 0xcdd2e0);
    const rf = 1 - bz / Math.max(1, N - 1);
    const lo = style === 'town' ? 4 + 3 * rf : style === 'metro' ? 9 + 14 * rf : 4 + 10 * rf;
    const hi = style === 'town' ? 7 + 6 * rf : style === 'metro' ? 16 + 30 * rf : 7 + 21 * rf;
    const dist = Math.hypot(bx - (N - 1) / 2, bz - (N - 1) / 2) / (N * 0.6);
    const AWN = [0xe8452c, 0x2e9e6b, 0x3a86ff, 0xf08c00, 0x9b5de5];
    const NEON = [0xff4fd8, 0x3df5ff, 0xfff34f, 0x7dff6b, 0xff7a3d];
    const neonMat = (col) => once('neon' + col, () => new T.MeshBasicMaterial({ color: col }));
    for (const ox of [-3.1, 3.1]) for (const oz of [-3.1, 3.1]) {
      const w = 4.4 + srand() * 1.2, d = 4.4 + srand() * 1.2, H = lo + srand() * (hi - lo);
      const g = new T.BoxGeometry(w, H, d);
      g.translate(0, H / 2, 0);
      scaleBoxUV(g, w, H, d, 9.6, 12.8);
      const m = spick(mats);
      const mesh = new T.Mesh(g, [m.side, m.side, m.roof, m.roof, m.side, m.side]);
      mesh.position.set(c.x + ox, 0.28, c.z + oz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      root.add(mesh);
      // Roof: rim, air-con units, then a water tower, an antenna or a billboard
      if (srand() < 0.6) box(w + 0.25, 0.35, d + 0.25, mat(srand() < 0.5 ? 0xff8a3d : 0x8d99ae), 0, H + 0.1, 0, mesh);
      for (let k = 0, n = 1 + ((srand() * 3) | 0); k < n; k++) box(0.7 + srand() * 0.7, 0.5, 0.7 + srand() * 0.5, mat(0xf4f6fb), (srand() - 0.5) * (w - 1.6), H + 0.5, (srand() - 0.5) * (d - 1.6), mesh);
      const r = srand();
      if (r < 0.22) {
        part(geo('wtank', () => new T.CylinderGeometry(0.7, 0.7, 1.1, 10)), mat(0x9c6b4a), w * 0.22, H + 1.5, -d * 0.2, mesh);
        part(geo('wcap', () => new T.ConeGeometry(0.8, 0.5, 10)), mat(0x6b4630), w * 0.22, H + 2.3, -d * 0.2, mesh);
        box(0.9, 0.9, 0.9, mat(0x5c677d), w * 0.22, H + 0.5, -d * 0.2, mesh);
      } else if (r < 0.4) {
        box(0.1, 3, 0.1, mat(0x8d99ae), -w * 0.25, H + 1.7, d * 0.2, mesh);
        box(0.25, 0.25, 0.25, neonMat(0xff4d4d), -w * 0.25, H + 3.3, d * 0.2, mesh, true);
      } else if (r < 0.52) {
        box(w * 0.8, 1.6, 0.15, neonMat(spick(NEON)), 0, H + 1.4, d * 0.3, mesh, true);
        box(0.12, 0.8, 0.12, mat(0x5c677d), -w * 0.3, H + 0.5, d * 0.3, mesh);
        box(0.12, 0.8, 0.12, mat(0x5c677d), w * 0.3, H + 0.5, d * 0.3, mesh);
      }
      if (style === 'metro' && srand() < 0.7) box(0.12, H * 0.9, 0.12, neonMat(spick(NEON)), w / 2 + 0.03, H * 0.5, d / 2 + 0.03, mesh, true);   // neon edge
      // Street level: a shop awning and a door on the side facing the street
      const fz = oz > 0 ? 1 : -1;
      prop(c.x + ox, 2.75, c.z + oz + fz * (d / 2 + 0.45), w * 0.9, 0.14, 0.9, spick(AWN));
      prop(c.x + ox, 1.3, c.z + oz + fz * (d / 2 + 0.03), 1.2, 2.1, 0.08, 0x4a3428);
      // "need" = how well you must be doing here before this tower reaches full height
      decor.push({ mesh, H, need: clamp(0.06 + dist * 0.3 + srand() * 0.42, 0, 0.8), f: -1 });
    }
  }
  function kerbDetail(c, isPlot) {
    // Street furniture along the four kerbs (never where customers queue in front of a shop)
    for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const front = isPlot && sz > 0;
      if (!front) for (const o of [-3.6, 3.6]) tree(c.x + (sx ? sx * 7.5 : o), c.z + (sz ? sz * 7.5 : o), 0.8 + srand() * 0.3);
      if (front) continue;
      const r = srand(), o = (srand() - 0.5) * 3;
      const x = c.x + (sx ? sx * 7.3 : o), z = c.z + (sz ? sz * 7.3 : o);
      if (r < 0.3) bench(x, z, sx ? (sx > 0 ? -Math.PI / 2 : Math.PI / 2) : (sz > 0 ? Math.PI : 0));
      else if (r < 0.5) { prop(x, 0.55, z, 0.5, 0.7, 0.5, 0x4a8f5a); prop(x, 0.94, z, 0.56, 0.08, 0.56, 0x2f5f3c); }      // bin
      else if (r < 0.65) { prop(x, 0.5, z, 0.3, 0.6, 0.3, 0xe63946); prop(x, 0.85, z, 0.38, 0.12, 0.38, 0xe63946); }     // hydrant
      else if (r < 0.78 && cfg.style !== 'suburb') {                                                                       // bus stop
        prop(x, 2.3, z, 3, 0.12, 1.1, 0x3a86ff, sx ? Math.PI / 2 : 0);
        prop(x + (sx ? 0 : -1.4), 1.25, z + (sx ? -1.4 : 0), 0.1, 2.1, 0.1, 0x8d99ae);
        prop(x + (sx ? 0 : 1.4), 1.25, z + (sx ? 1.4 : 0), 0.1, 2.1, 0.1, 0x8d99ae);
        glow(x + (sx ? 0 : 1.4), 1.3, z + (sx ? 1.4 : 0), 0.12, 1.3, 0.12, 0x9be7ff);
      }
      if (cfg.style !== 'suburb' && srand() < 0.55) {   // cars parked at the kerb
        const po = (srand() < 0.5 ? -1 : 1) * 4.8;
        parkedCar(c.x + (sx ? sx * 9.05 : po), c.z + (sz ? sz * 9.05 : po), sx ? 0 : Math.PI / 2, spick(CAR_COLORS));
      }
    }
    for (const k of CORNER) lamp(c.x + k[0] * 7.55, c.z + k[1] * 7.55);
  }
  function buildScenery() {
    const style = cfg.style;
    for (let bx = 0; bx < N; bx++) for (let bz = 0; bz < N; bz++) {
      const c = blockCenter(bx, bz);
      const isPlot = cfg.plots.some(l => l[0] === bx && l[1] === bz);
      kerbDetail(c, isPlot);
      if (isPlot) continue;
      if (cfg.parks.includes(bx + ',' + bz)) parkBlock(c);
      else if (style === 'suburb' || (style === 'town' && srand() < 0.3)) houseBlock(c);
      else towerBlock(c, bx, bz);
    }
    buildOutskirts();
  }

  // What lies beyond the edge of the map: gives each district its own character.
  function buildOutskirts() {
    const style = cfg.style;
    const onRoad = (x, z) => { for (let j = 0; j < N - 1; j++) { const rc = roadCoord(j); if (Math.abs(x - rc) < 5.5 || Math.abs(z - rc) < 5.5) return true; } return false; };
    const ringPoint = (rmin, rmax) => { const a = srand() * 6.283, r = rmin + srand() * (rmax - rmin); return [Math.cos(a) * r, Math.sin(a) * r]; };
    const edge = HALF + 10;
    if (style === 'suburb') {
      const FIELD = [0xf2d06b, 0x9bd66b, 0xc9a66b, 0xb4e07a, 0xe8c15a];
      for (let k = 0; k < 26; k++) {   // farm fields
        const [x, z] = ringPoint(edge + 26, edge + 130);
        if (!onRoad(x, z)) prop(x, -0.02, z, 18 + srand() * 22, 0.05, 14 + srand() * 20, spick(FIELD));
      }
      for (let k = 0; k < 70; k++) { const [x, z] = ringPoint(edge, edge + 110); if (!onRoad(x, z)) (srand() < 0.5 ? tree : pine)(x, z, 1.2 + srand() * 1.2); }
      prop(edge + 20, 2.2, -edge - 6, 7, 4.4, 5, 0xc0392b); prop(edge + 20, 4.9, -edge - 6, 7.6, 1, 5.6, 0x7b241c);   // barn
      prop(edge + 26, 3.5, -edge - 3, 2.2, 7, 2.2, 0xdfe6e9);                                                       // silo
      for (let k = 0; k < 8; k++) blob(edge + 8 + (k % 4) * 2.2, 0.6, -edge - 14 - ((k / 4) | 0) * 2.2, 0.75, 0xf2d06b);   // hay bales
    } else {
      if (style === 'town') {   // the river, with sailboats
        const river = new T.Mesh(geo('river', () => new T.PlaneGeometry(52, 900)), mat(0x3f8fe0));
        river.rotation.x = -Math.PI / 2; river.position.set(-edge - 34, -0.04, 0);
        root.add(river);
        for (let k = 0; k < 5; k++) {
          const g = new T.Group();
          box(1.4, 0.5, 3.6, mat(0xfff7ec), 0, 0.25, 0, g); box(0.1, 3, 0.1, mat(0x8a5a3c), 0, 1.8, 0, g);
          box(0.06, 2.2, 1.5, mat([0xffffff, 0xff6b6b, 0xffd43b][k % 3]), 0, 2, 0.8, g);
          g.position.set(-edge - 22 - srand() * 26, 0, -200 + k * 90);
          root.add(g);
          const sp = 1.2 + srand() * 1.4;
          movers.push((dt) => { g.position.z += sp * dt; if (g.position.z > 240) g.position.z = -240; g.rotation.z = Math.sin(time + k) * 0.05; });
        }
      }
      // Sprawl: lower buildings fading into the distance
      const SPRAWL = style === 'metro' ? [0x7f8fc0, 0x9aa8c9, 0x6c7fb5] : [0xf1e7cf, 0xffd2c4, 0xdfe6f2, 0xffe29a];
      for (let k = 0; k < (style === 'town' ? 60 : 130); k++) {
        const [x, z] = ringPoint(edge + 4, edge + 150);
        if (onRoad(x, z) || (style === 'town' && x < -edge - 4) || z < -edge - 2 && z > -edge - 12) continue;
        const h = style === 'town' ? 2.4 + srand() * 3 : 3 + srand() * (style === 'metro' ? 16 : 9), w = 5 + srand() * 5, dd = 5 + srand() * 5;
        prop(x, h / 2, z, w, h, dd, spick(SPRAWL));
        if (style !== 'town' && srand() < 0.5) glow(x, h * 0.6, z + dd / 2 + 0.06, w * 0.5, 0.5, 0.1, 0xffd98a);
      }
      for (let k = 0; k < 50; k++) { const [x, z] = ringPoint(edge, edge + 130); if (!onRoad(x, z) && !(style === 'town' && x < -edge - 4)) tree(x, z, 1.2 + srand() * 1.2); }
      // Railway along the north edge, with a train that comes through
      const rz = -edge - 7;
      prop(0, 0.02, rz, 900, 0.08, 3.6, 0x8d8172);
      prop(0, 0.14, rz - 0.75, 900, 0.1, 0.16, 0x4a4f5e); prop(0, 0.14, rz + 0.75, 900, 0.1, 0.16, 0x4a4f5e);
      for (let k = -40; k <= 40; k++) prop(k * 5, 0.09, rz, 0.5, 0.06, 2.6, 0x6b5a48);
      const train = new T.Group();
      (style === 'metro' ? [0x3df5ff, 0xf4f6fb, 0xf4f6fb, 0xf4f6fb] : [0xe63946, 0x2f80ed, 0xffc300, 0x06d6a0]).forEach((col, k) => {
        box(7.4, 2.4, 2.4, mat(col), -k * 8, 1.6, 0, train);
        box(7.0, 0.7, 2.44, mat(0x2b3a55), -k * 8, 2.1, 0, train, true);
        box(6.6, 0.4, 2.0, mat(0x1d1f27), -k * 8, 0.3, 0, train, true);
      });
      train.position.set(-200, 0, rz);
      root.add(train);
      movers.push((dt) => { train.position.x += 26 * dt; if (train.position.x > 420) train.position.x = -420 - rand(100, 500); });
    }
    // Distant hills
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.283 + srand() * 0.3, r = 280 + srand() * 70, s = 40 + srand() * 50;
      const hill = new T.Mesh(geo('hill', () => new T.ConeGeometry(1, 1, 7)), mat(k % 2 ? 0x6fb58a : 0x7fbf8f));
      hill.scale.set(s * 1.6, s * 0.7, s * 1.6);
      hill.position.set(Math.cos(a) * r, s * 0.35 - 2, Math.sin(a) * r);
      root.add(hill);
    }
    // Hot-air balloons drifting overhead
    [[0xff6b6b, 0xfff7ec], [0x4dabf7, 0xffd43b]].forEach(([c1, c2], k) => {
      const g = new T.Group();
      part(geo('balloon', () => new T.SphereGeometry(2.6, 14, 12)), mat(c1), 0, 0, 0, g).scale.y = 1.2;
      part(geo('bband', () => new T.CylinderGeometry(2.62, 2.62, 0.9, 14, 1, true)), mat(c2), 0, 0.2, 0, g);
      box(1, 0.8, 1, mat(0x9c6b4a), 0, -4, 0, g);
      for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) box(0.04, 1.8, 0.04, mat(0x5c4632), x, -2.9, z, g, true);
      g.position.set(-HALF - 30 + k * 90, 34 + k * 6, -HALF + k * 60);
      root.add(g);
      movers.push((dt) => {
        g.position.x += (2.2 + k) * dt; g.position.y = 34 + k * 6 + Math.sin(time * 0.5 + k) * 1.5;
        if (g.position.x > HALF + 90) { g.position.x = -HALF - 90; g.position.z = rand(-HALF, HALF); }
      });
    });
  }

  // ---------- People ----------
  const SHIRTS = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xffd43b, 0xcc5de8, 0xff922b, 0x20c997, 0xf783ac, 0x748ffc, 0xe9ecef];
  const SKINS = [0xffd9b3, 0xf1c27d, 0xc68642, 0x8d5524];
  const HAIRS = [0x2b2118, 0x5a3825, 0xd9a441, 0x8c8c8c, 0xb5442e];
  function makePersonMesh(shirt, opts) {
    const g = new T.Group();
    const plain = opts && opts.plain;
    const body = part(geo('cap', () => new T.CapsuleGeometry(0.2, 0.36, 3, 8)), mat(shirt), 0, 0.66, 0, g);
    part(geo('head', () => new T.SphereGeometry(0.19, 10, 8)), mat(pick(SKINS)), 0, 1.16, 0, g).castShadow = false;
    const extra = plain ? 0.5 : Math.random();
    if (opts && opts.hat) part(geo('chefhat', () => new T.CylinderGeometry(0.2, 0.17, 0.3, 10)), mat(0xffffff), 0, 1.42, 0, g).castShadow = false;
    else if (extra < 0.18) {   // sun hat
      part(geo('brim', () => new T.CylinderGeometry(0.3, 0.3, 0.04, 12)), mat(pick(SHIRTS)), 0, 1.3, 0, g).castShadow = false;
      part(geo('crown', () => new T.CylinderGeometry(0.17, 0.19, 0.16, 10)), mat(pick(SHIRTS)), 0, 1.38, 0, g).castShadow = false;
    } else part(geo('hair', () => new T.SphereGeometry(0.205, 10, 6, 0, 6.283, 0, 1.75)), mat(pick(HAIRS)), 0, 1.19, 0, g).castShadow = false;
    if (extra > 0.8 && extra < 0.92) box(0.3, 0.36, 0.16, mat(pick(SHIRTS)), 0, 0.72, -0.24, g).castShadow = false;   // backpack
    if (extra > 0.95) {   // balloon
      box(0.02, 1.2, 0.02, mat(0xffffff), 0.3, 1.6, 0, g, true);
      part(geo('pballoon', () => new T.SphereGeometry(0.3, 10, 8)), mat(pick(SHIRTS)), 0.3, 2.4, 0, g).castShadow = false;
    }
    const legGeo = geo('leg', () => new T.BoxGeometry(0.13, 0.36, 0.14).translate(0, -0.18, 0));
    const legs = [part(legGeo, mat(0x39405a), -0.1, 0.4, 0, g), part(legGeo, mat(0x39405a), 0.1, 0.4, 0, g)];
    legs.forEach(l => (l.castShadow = false));
    const size = !plain && extra > 0.6 && extra < 0.7 ? 0.95 : 1.25;   // some children
    g.scale.setScalar(size);
    g.userData = { legs, body, size };
    return g;
  }
  function spawnPerson(node, opts) {
    const g = makePersonMesh(opts && opts.shirt !== undefined ? opts.shirt : pick(SHIRTS), opts);
    const p = {
      g, x: nodeXZ[node].x, z: nodeXZ[node].z, ox: rand(-0.45, 0.45), oz: rand(-0.45, 0.45),
      path: [], pi: 0, speed: rand(2.1, 3), state: 'wander', shop: null, phase: rand(0, 6), born: time,
      hop: 0, moving: false, bubble: null, node,
    };
    p.x += p.ox; p.z += p.oz;
    g.position.set(p.x, 0.2, p.z);
    root.add(g);
    people.push(p);
    return p;
  }
  function setPathTo(p, fromNode, toNode) { p.path = findPath(fromNode, toNode); p.pi = 0; }
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
  // Turn a nearby passer-by into a customer; if the street is empty, someone steps out from nearby.
  function summonCustomer(s) {
    let best = null, bd = 30 * 30;
    for (const p of people) {
      if (p.state !== 'wander' || p === (vip && vip.p)) continue;
      const dx = p.x - s.cx, dz = p.z - s.cz, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = p; }
    }
    if (!best) {
      const near = [];
      for (let i = 0; i < NODES; i++) { const d = Math.hypot(nodeXZ[i].x - s.cx, nodeXZ[i].z - s.cz); if (d > 12 && d < 34) near.push(i); }
      best = spawnPerson(pick(near.length ? near : edgeNodes));
    }
    const from = best.path.length ? best.path[Math.min(best.pi, best.path.length - 1)] : best.node;
    best.path = findPath(from, nodeId(s.bx, s.bz, Math.random() < 0.5 ? 2 : 3));
    best.pi = 0;
    best.state = 'toShop';
    best.shop = s;
    best.speed = rand(3.1, 3.7);
    s.incoming++;
    setBubble(best, E.TYPES[s.t].emoji);
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
    box(0.22, 0.26, 0.16, mat(STYLE[s.t].accent), 0.3, 0.62, 0.05, p.g).castShadow = false;   // take-away bag
    p.node = nodeId(s.bx, s.bz, p.x > s.cx ? 2 : 3);
    setPathTo(p, p.node, pick(edgeNodes));
    popCoin(p.x, 2.6, p.z);
  }
  function releaseCustomers(s) {
    s.queue.slice().forEach(p => { p.shop = null; setBubble(p, null); p.node = nearestNode(p.x, p.z); wanderAgain(p); });
    s.queue.length = 0;
    people.forEach(p => { if (p.shop === s) { p.shop = null; setBubble(p, null); p.state = 'wander'; } });
    s.incoming = 0;
  }
  function updatePeople(dt) {
    const target = Math.round(cfg.people[0] + prosperity * (cfg.people[1] - cfg.people[0]));
    let wanderers = 0;
    for (const p of people) if (p.state === 'wander') wanderers++;
    if (wanderers < target && people.length < 80 && time > nextWander) {
      nextWander = time + 0.35;
      wanderAgain(spawnPerson(time - loadedAt < 2 ? ((Math.random() * NODES) | 0) : pick(edgeNodes)));
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
        p.g.rotation.y = p.shop.queue[0] === p ? Math.PI : -Math.PI / 2;
      } else if (p.pi < p.path.length) {
        p.node = p.path[p.pi];
        p.pi++;
      }
      if (arrive) {
        if (p.state === 'toShop' && p.shop) {
          p.state = 'queue';
          p.shop.incoming = Math.max(0, p.shop.incoming - 1);
          p.shop.queue.push(p);
        } else if (p === (vip && vip.p)) wanderAgain(p);
        else { removePerson(p); continue; }
      }
      p.phase += dt * (p.moving ? p.speed * 3.2 : 0);
      const sw = p.moving ? Math.sin(p.phase) * 0.7 : 0;
      p.g.userData.legs[0].rotation.x = sw;
      p.g.userData.legs[1].rotation.x = -sw;
      let y = 0.2 + (p.moving ? Math.abs(Math.sin(p.phase)) * 0.05 : 0);
      if (p.hop > 0) { p.hop -= dt; y += Math.sin(Math.max(0, p.hop) / 0.4 * Math.PI) * 0.5; }
      p.g.position.set(p.x, y, p.z);
      const born = Math.min(1, (time - p.born) * 3);
      if (born < 1) p.g.scale.setScalar(p.g.userData.size * born);
      if (p.bubble && p.bubbleUntil && time > p.bubbleUntil) { setBubble(p, null); p.bubbleUntil = 0; }
      else if (p.bubble && p !== (vip && vip.p)) p.bubble.position.y = 1.85 + Math.sin(time * 4 + p.phase) * 0.05;
    }
  }

  // ---------- Traffic ----------
  let headMat, tailMat;
  function spawnCar() {
    const g = new T.Group();
    const color = pick(CAR_COLORS);
    const kind = Math.random();
    let len = 3.6;
    if (kind < 0.72) {           // car, or a yellow taxi with a roof sign
      const taxi = kind > 0.6, c = taxi ? 0xffc300 : color;
      box(1.7, 0.6, 3.6, mat(c), 0, 0.62, 0, g);
      box(1.5, 0.55, 1.9, mat(0x2b3a55), 0, 1.15, -0.15, g);
      box(1.52, 0.06, 1.92, mat(c), 0, 1.45, -0.15, g, true);
      if (taxi) box(0.6, 0.2, 0.3, headMat, 0, 1.58, -0.15, g, true);
    } else if (kind < 0.9) {     // delivery van
      len = 4.6;
      box(1.8, 1.5, 3.2, mat(0xf8f9fa), 0, 1.1, -0.6, g);
      box(1.75, 1.05, 1.3, mat(color), 0, 0.88, 1.65, g);
      box(1.6, 0.4, 0.1, mat(0x2b3a55), 0, 1.15, 2.31, g, true);
    } else {                     // bus
      len = 7;
      box(1.9, 1.7, 7, mat(pick([0x2f80ed, 0xffc300, 0xe63946])), 0, 1.2, 0, g);
      box(1.94, 0.55, 6.4, mat(0x2b3a55), 0, 1.5, 0, g, true);
      box(1.7, 0.1, 6.6, mat(0xf8f9fa), 0, 2.08, 0, g, true);
    }
    box(1.84, 0.4, 0.7, mat(0x1d1f27), 0, 0.3, len / 2 - 0.8, g, true);
    box(1.84, 0.4, 0.7, mat(0x1d1f27), 0, 0.3, -len / 2 + 0.8, g, true);
    for (const x of [-0.6, 0.6]) {   // headlights and tail lights
      box(0.34, 0.2, 0.06, headMat, x, 0.62, len / 2 + 0.01, g, true);
      box(0.34, 0.16, 0.06, tailMat, x, 0.62, -len / 2 - 0.01, g, true);
    }
    const axis = Math.random() < 0.5 ? 'x' : 'z', dir = Math.random() < 0.5 ? 1 : -1;
    const road = roadCoord((Math.random() * (N - 1)) | 0);
    const c = { g, axis, dir, lane: road + (axis === 'z' ? -dir : dir) * 1.75, s: -dir * (HALF + rand(20, 60)), v: 9, max: rand(8, 11), len };
    g.rotation.y = axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    if (time - loadedAt < 3) c.s = rand(-HALF, HALF);
    root.add(g);
    cars.push(c);
  }
  function updateCars(dt) {
    const want = Math.round(cfg.cars[0] + prosperity * (cfg.cars[1] - cfg.cars[0]));
    if (cars.length < want && time > nextCar) { nextCar = time + 0.7; spawnCar(); }
    for (let i = cars.length - 1; i >= 0; i--) {
      const c = cars[i];
      let go = c.max;
      const cx = c.axis === 'x' ? c.s : c.lane, cz = c.axis === 'z' ? c.s : c.lane;
      for (const p of people) {   // stop for pedestrians
        const ahead = ((c.axis === 'x' ? p.x : p.z) - c.s) * c.dir;
        const side = Math.abs((c.axis === 'x' ? p.z : p.x) - c.lane);
        if (ahead > 0.5 && ahead < 5 && side < 1.5) { go = 0; break; }
      }
      if (go > 0) for (const o of cars) {   // keep distance; east-west traffic gives way at junctions
        if (o === c) continue;
        const ox = o.axis === 'x' ? o.s : o.lane, oz = o.axis === 'z' ? o.s : o.lane;
        const ahead = ((c.axis === 'x' ? ox : oz) - c.s) * c.dir;
        const side = Math.abs((c.axis === 'x' ? oz : ox) - c.lane);
        if (o.axis === c.axis) { if (ahead > 0 && ahead < 5 + (c.len + o.len) / 2 && side < 1) go = Math.min(go, o.v * 0.7); }
        else if (c.axis === 'x' && ahead > 1 && ahead < 7 && side < 4.5) go = 0;
      }
      c.v += (go - c.v) * Math.min(1, dt * 5);
      c.s += c.dir * c.v * dt;
      c.g.position.set(cx, 0.02, cz);
      if (c.s * c.dir > HALF + 70 || (cars.length > want + 1 && Math.abs(c.s) > HALF + 15)) {
        disposeGroup(c.g);
        cars.splice(i, 1);
      }
    }
  }

  // ---------- Rooftop mascots (one per shop type) ----------
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
      case 0:   // noodle bowl
        add(cyl(0.62, 0.34, 0.5), 0xe8452c, 0, 0.3, 0);
        add(cyl(0.64, 0.64, 0.07), 0xfff7ec, 0, 0.56, 0);
        add(sph(0.52), 0xffd166, 0, 0.56, 0, 1, 0.35, 1);
        add(cyl(0.03, 0.03, 1.2, 6), 0x8a4b1c, 0.25, 0.9, 0).rotation.z = -0.9;
        add(cyl(0.03, 0.03, 1.2, 6), 0x8a4b1c, 0.35, 0.82, 0.12).rotation.z = -1.0;
        break;
      case 1:   // dumpling
        add(sph(0.6), 0xfff3dc, 0, 0.42, 0, 1.1, 0.7, 0.8);
        add(new T.TorusGeometry(0.5, 0.08, 6, 14, Math.PI), 0xf3dfb8, 0, 0.55, 0).scale.set(1.05, 0.75, 1);
        break;
      case 2:   // bubble tea
        add(cyl(0.42, 0.3, 0.95), 0xd9a066, 0, 0.5, 0);
        add(cyl(0.45, 0.45, 0.1), 0xf7e6ff, 0, 1.02, 0);
        add(cyl(0.05, 0.05, 0.9, 6), 0x9b5de5, 0.1, 1.3, 0).rotation.z = -0.25;
        for (let k = 0; k < 6; k++) add(sph(0.08), 0x2b1d14, Math.cos(k * 1.05) * 0.33, 0.2 + (k % 2) * 0.14, Math.sin(k * 1.05) * 0.33);
        break;
      case 3: { // taco
        const shell = add(new T.CylinderGeometry(0.62, 0.62, 0.42, 16, 1, true, 0, Math.PI), 0xf4b942, 0, 0.66, 0);
        shell.rotation.set(0, Math.PI / 2, Math.PI / 2); shell.material = mat(0xf4b942, { side: T.DoubleSide });
        for (let k = 0; k < 5; k++) add(sph(0.14), [0x51cf66, 0xe8452c, 0xffd43b][k % 3], -0.4 + k * 0.2, 0.68, 0);
        break;
      }
      case 4:   // pizza slice
        add(new T.CylinderGeometry(0.75, 0.75, 0.12, 3), 0xffc93d, 0, 0.7, 0).rotation.x = Math.PI / 2 - 0.25;
        add(new T.BoxGeometry(1.3, 0.2, 0.2), 0xd98a3a, 0, 1.12, -0.1);
        [[0, 0.75], [-0.2, 0.45], [0.2, 0.5], [0, 0.2]].forEach(p => { add(cyl(0.11, 0.11, 0.05, 10), 0xd62828, p[0], p[1] + 0.05, 0.09).rotation.x = Math.PI / 2 - 0.25; });
        break;
      case 5:   // sushi
        add(new T.BoxGeometry(1.2, 0.42, 0.6), 0xffffff, 0, 0.3, 0);
        add(new T.BoxGeometry(1.3, 0.24, 0.66), 0xff8c5a, 0, 0.62, 0);
        add(new T.BoxGeometry(0.26, 0.7, 0.7), 0x1d2b24, 0, 0.42, 0);
        break;
      case 6:   // burger
        add(cyl(0.6, 0.55, 0.22), 0xe0a050, 0, 0.16, 0);
        add(cyl(0.66, 0.66, 0.08), 0x51cf66, 0, 0.32, 0);
        add(cyl(0.6, 0.6, 0.2), 0x6b3a22, 0, 0.46, 0);
        add(new T.BoxGeometry(1.0, 0.06, 1.0), 0xffd43b, 0, 0.6, 0).rotation.y = 0.78;
        add(sph(0.6), 0xe0a050, 0, 0.64, 0, 1, 0.62, 1);
        break;
      case 7:   // food court umbrellas
        [[-0.55, 0xe8452c], [0.1, 0x3a86ff], [0.6, 0xffc93d]].forEach(([x, c], k) => {
          add(cyl(0.03, 0.03, 0.9, 6), 0x7a7f8f, x, 0.45, k === 1 ? 0.3 : -0.15);
          add(new T.ConeGeometry(0.5, 0.35, 10), c, x, 1.0, k === 1 ? 0.3 : -0.15);
        });
        break;
      case 8:   // factory chimneys with smoke
        add(cyl(0.2, 0.26, 1.3, 10), 0xb8493a, -0.35, 0.65, 0);
        add(cyl(0.16, 0.22, 1.0, 10), 0xb8493a, 0.35, 0.5, 0);
        g.userData.smoke = [];
        for (let k = 0; k < 5; k++) {
          const s = part(sph(0.2), new T.MeshLambertMaterial({ color: 0xf1f3f5, transparent: true, opacity: 0.85 }), 0, 0, 0, g);
          s.castShadow = false;
          g.userData.smoke.push({ s, t: k / 5, x: k % 2 ? 0.35 : -0.35, y0: k % 2 ? 1.0 : 1.3 });
        }
        break;
      default:  // globe
        add(sph(0.62), 0x3a86ff, 0, 0.75, 0);
        [[0.3, 0.95, 0.42], [-0.42, 0.7, 0.36], [0.1, 0.5, -0.52], [-0.2, 1.15, -0.3], [0.5, 0.6, -0.1]].forEach(p => add(sph(0.2), 0x51cf66, p[0], p[1], p[2], 1, 0.9, 0.6));
        add(new T.TorusGeometry(0.85, 0.035, 6, 28), 0xffc93d, 0, 0.75, 0).rotation.x = 1.2;
    }
    return g;
  }

  // ---------- Shop buildings ----------
  let glassMat, doorMat, bulbMat;
  function signMat(t) {
    return once('sign' + t, () => {
      const tex = makeSignTex(t);
      const m = new T.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
      nightMats.push({ m, max: 0.85 });
      return m;
    });
  }
  function awningMat(t, repeat) {
    return once('awn' + t + '_' + repeat, () => {
      const tex = makeAwningTex(STYLE[t].accent);
      tex.repeat.set(repeat, 1);
      return new T.MeshLambertMaterial({ map: tex });
    });
  }
  // A string of party lights between two points
  function stringLights(g, x1, y, z, x2, n) {
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      part(geo('bulb', () => new T.SphereGeometry(0.09, 6, 5)), bulbMat, x1 + (x2 - x1) * f, y - Math.sin(f * Math.PI) * 0.35, z, g).castShadow = false;
    }
  }
  function steam(g, x, y, z) {
    const puffs = [];
    for (let k = 0; k < 3; k++) {
      const s = part(geo('puff', () => new T.SphereGeometry(0.16, 8, 6)), new T.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), x, y, z, g);
      s.castShadow = false;
      puffs.push({ s, t: k / 3 });
    }
    g.userData.steam = { puffs, x, y, z };
  }

  function buildStall(t, g) {
    const st = STYLE[t];
    box(3.2, 1.0, 1.2, mat(st.wall), 0, 0.5, 0.4, g);
    box(3.3, 0.22, 1.3, mat(st.accent), 0, 0.92, 0.4, g);
    box(3.24, 0.3, 0.05, mat(st.accent), 0, 0.35, 1.02, g, true);
    for (const x of [-1.5, 1.5]) for (const z of [-0.9, 1.0]) part(geo('post', () => new T.CylinderGeometry(0.06, 0.06, 2.3, 6)), mat(0x7a5a3c), x, 1.15, z, g);
    box(3.8, 0.14, 2.0, awningMat(t, 5), 0, 2.38, -0.35, g).rotation.x = 0.1;
    stringLights(g, -1.5, 2.25, 1.0, 1.5, 7);
    if (t === 0) {   // the noodle cart has wheels and a steaming pot
      const wheel = geo('wheel', () => new T.CylinderGeometry(0.34, 0.34, 0.12, 12).rotateZ(Math.PI / 2));
      part(wheel, mat(0x2b2118), -1.7, 0.34, 0.4, g); part(wheel, mat(0x2b2118), 1.7, 0.34, 0.4, g);
      part(geo('pot', () => new T.CylinderGeometry(0.32, 0.26, 0.36, 12)), mat(0x8d99ae), -0.9, 1.2, 0.4, g);
      steam(g, -0.9, 1.5, 0.4);
    } else {
      box(0.7, 0.5, 0.6, mat(0xc99b66), -1.0, 1.26, 0.35, g);
      box(0.5, 0.36, 0.5, mat(0xddb67c), 0.9, 1.2, 0.4, g);
      steam(g, -1.0, 1.6, 0.35);
    }
    // Crates of produce, stools, a menu board and lanterns
    for (const [x, col] of [[-2.4, 0xff922b], [-1.9, 0x51cf66]]) { box(0.5, 0.4, 0.5, mat(0xc99b66), x, 0.2, 1.3, g); part(geo('veg', () => new T.SphereGeometry(0.16, 6, 5)), mat(col), x, 0.48, 1.3, g).castShadow = false; }
    for (const x of [-0.8, 0.1, 1.0]) part(geo('stool', () => new T.CylinderGeometry(0.2, 0.16, 0.5, 8)), mat(st.accent), x, 0.25, 1.75, g);
    box(0.7, 1.0, 0.08, mat(0x2b2118), 2.5, 0.6, 1.3, g).rotation.x = -0.2;
    box(0.56, 0.7, 0.02, mat(0xfff7ec), 2.5, 0.66, 1.36, g, true).rotation.x = -0.2;
    for (const x of [-1.9, 1.9]) part(geo('lantern', () => new T.SphereGeometry(0.2, 8, 6)), bulbMat, x, 2.0, 1.0, g).castShadow = false;
    const chef = makePersonMesh(0xffffff, { hat: true, plain: true });
    chef.position.set(0.35, 0, -0.5);
    g.add(chef);
    g.userData.chef = chef;
    const em = sprite(emojiTex(E.TYPES[t].emoji), 1.5, 1.5, { depthTest: true });
    em.position.set(0, 3.5, 0.1);
    g.add(em);
    g.userData.bobber = em;
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

  function buildBuilding(t, tier, g) {
    const st = STYLE[t], segs = SEGS[tier];
    let y = 0;
    segs.forEach((seg, k) => {
      box(seg.w, seg.h, seg.d, mat(st.wall), 0, y + seg.h / 2, 0, g);
      box(seg.w + 0.4, 0.3, seg.d + 0.4, mat(st.accent), 0, y + seg.h + 0.15, 0, g);
      addWindows(g, seg, y, k === 0);
      // corner pilasters give the walls some depth
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.3, seg.h, 0.3, mat(st.accent), sx * seg.w / 2, y + seg.h / 2, sz * seg.d / 2, g, true);
      y += seg.h + 0.3;
    });
    const base = segs[0], fz = base.d / 2;
    box(1.5, 2.3, 0.14, doorMat, 0, 1.15, fz + 0.05, g, true);
    box(0.08, 2.3, 0.16, mat(st.accent), 0, 1.15, fz + 0.07, g, true);
    box(2.2, 0.12, 0.9, mat(0xd9dde6), 0, 0.06, fz + 0.5, g, true);   // door step
    box(base.w * 0.92, 0.16, 1.5, awningMat(t, Math.round(base.w)), 0, 2.95, fz + 0.6, g).rotation.x = 0.28;
    stringLights(g, -base.w * 0.46, 2.6, fz + 1.35, base.w * 0.46, Math.round(base.w * 1.2));
    const sw = Math.min(base.w * 0.86, 7.2);
    box(sw, sw / 4, 0.22, [mat(st.accent), mat(st.accent), mat(st.accent), mat(st.accent), signMat(t), mat(st.accent)], 0,
      tier === 1 ? base.h + 0.3 + sw / 8 : 4.35, tier === 1 ? fz - 0.2 : fz + 0.14, g);
    // Planters by the door, a menu board and a delivery scooter
    for (const x of [-1.5, 1.5]) { box(0.6, 0.5, 0.6, mat(0xf4f6fb), x, 0.25, fz + 0.5, g); part(geo('bush', () => new T.IcosahedronGeometry(0.42, 1)), mat(0x6fdc4a), x, 0.75, fz + 0.5, g); }
    box(0.7, 1.0, 0.08, mat(0x2b2118), -base.w / 2 + 0.9, 0.6, fz + 1.2, g).rotation.x = -0.2;
    box(0.5, 0.5, 1.3, mat(st.accent), base.w / 2 - 0.7, 0.55, fz + 1.0, g); box(0.5, 0.5, 0.5, mat(0xf4f6fb), base.w / 2 - 0.7, 1.0, fz + 0.6, g);
    box(1.1, 0.6, 0.9, mat(0xdfe6e9), -segs[segs.length - 1].w * 0.28, y + 0.3, -segs[segs.length - 1].d * 0.25, g);   // roof air-con
    if (tier >= 2) {   // café tables out front
      for (const x of [-base.w / 2 + 0.2, base.w / 2 - 0.2]) {
        if (Math.abs(x) + 0.8 > 6) continue;
        part(geo('tpole', () => new T.CylinderGeometry(0.04, 0.04, 1.9, 6)), mat(0x7a7f8f), x, 0.95, fz + 2.1, g);
        part(geo('umb', () => new T.ConeGeometry(0.95, 0.42, 10)), mat(st.accent), x, 2.0, fz + 2.1, g);
        part(geo('ttop', () => new T.CylinderGeometry(0.5, 0.5, 0.07, 12)), mat(0xfff7ec), x, 0.78, fz + 2.1, g);
        for (const o of [-0.7, 0.7]) part(geo('stool', () => new T.CylinderGeometry(0.2, 0.16, 0.5, 8)), mat(0xfff7ec), x + o, 0.25, fz + 2.1, g);
      }
    }
    if (tier >= 3) {   // balconies with flower boxes
      const s1 = segs[1];
      for (const x of [-s1.w * 0.28, s1.w * 0.28]) { box(1.6, 0.14, 0.7, mat(0xdfe6e9), x, base.h + 0.4, s1.d / 2 + 0.35, g); box(1.4, 0.25, 0.25, mat(0xff6b9d), x, base.h + 0.6, s1.d / 2 + 0.6, g, true); }
    }
    if (tier >= 4) {   // flagship banners
      for (const x of [-base.w / 2 + 0.9, base.w / 2 - 0.9]) box(0.9, 4.4, 0.1, mat(st.accent), x, base.h + 0.3 + 2.8, SEGS[4][1].d / 2 + 0.08, g, true);
    }
    const m = mascot(t);
    m.scale.setScalar([0, 1.7, 2.4, 3.1, 3.6][tier]);
    m.position.set(tier === 1 ? base.w / 2 - 1.4 : 0, y, tier === 1 ? -0.6 : 0);
    g.add(m);
    g.userData.mascot = m;
  }

  function buildLotSign(owned, size, price, g) {
    const tex = makeLotTex(owned, size, price);
    for (const x of [-1.25, 1.25]) part(geo('spost', () => new T.CylinderGeometry(0.08, 0.08, 2.2, 6)), mat(0x8a5a3c), x, 1.1, 0, g);
    const board = new T.Mesh(geo('board', () => new T.PlaneGeometry(3, 3)), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide }));
    board.position.set(0, 3.1, 0);
    board.castShadow = true;
    board.userData.ownTex = tex;
    g.add(board);
    g.userData.board = board;
    const half = PAD[size] / 2 - 0.4;
    if (owned) {   // construction site: cones, planks, a little digger, a pile of earth
      for (const [x, z] of [[-half, 1], [half, 1], [-half, -4], [half, -4]]) part(geo('cone', () => new T.ConeGeometry(0.22, 0.6, 8)), mat(0xff7b00), x, 0.3, z, g);
      box(2.2, 0.16, 0.5, mat(0xc99b66), -2.4, 0.1, -1.6, g); box(2.2, 0.16, 0.5, mat(0xc99b66), -2.2, 0.26, -1.4, g);
      box(1.6, 0.9, 1.1, mat(0xffc300), 2.4, 0.7, -2, g); box(0.9, 0.8, 0.9, mat(0x2b3a55), 2.2, 1.5, -2, g);
      box(0.25, 0.25, 1.8, mat(0xffc300), 2.9, 1.2, -0.8, g).rotation.x = -0.5;
      for (let k = 0; k < 3; k++) part(geo('dirt', () => new T.SphereGeometry(0.7, 8, 6)), mat(0xb08350), -0.4 + k * 0.6, 0.15, -3.2 - (k % 2) * 0.5, g).scale.y = 0.6;
    } else {       // empty lot behind a little fence
      const n = Math.round(half * 2 / 1.6);
      for (let k = 0; k <= n; k++) box(0.12, 0.7, 0.12, mat(0xfff7ec), -half + k * (half * 2 / n), 0.35, 0.9, g, true);
      box(half * 2, 0.1, 0.08, mat(0xfff7ec), 0, 0.55, 0.9, g, true);
      for (let k = 0; k < 4; k++) part(geo('weed', () => new T.IcosahedronGeometry(0.3, 0)), mat(0x6fbf5a), -half + 1 + k * (half * 0.55), 0.2, -1.5 - (k % 2) * 2, g).castShadow = false;
    }
  }

  function rebuildShop(s, kind, t, tier, price) {
    if (s.group) disposeGroup(s.group);
    const g = new T.Group();
    s.kind = kind; s.t = t; s.tier = tier;
    if (kind === 'shop' && tier >= 1) buildBuilding(t, tier, g);
    else if (kind === 'shop') buildStall(t, g);
    else buildLotSign(kind === 'empty', s.size, price, g);
    const d = shopDepth(kind === 'shop' ? tier : 0);
    g.position.set(s.cx, 0.3, kind === 'shop' ? s.cz + 5 - d / 2 : s.cz + 3.4);
    root.add(g);
    s.group = g;
    s.h = kind === 'shop' ? shopHeight(tier) : 4.6;
    s.box.set(tmpV.set(s.cx - 6.2, 0, s.cz - 6.2), tmpV2.set(s.cx + 6.2, s.h + (tier >= 1 ? 4 : 1.2), s.cz + 7.6));
    s.pad.material = mat(kind === 'shop' ? 0xeadfce : kind === 'empty' ? 0xd9c7a3 : 0xb9d99a);
    s.barY = s.h + (kind === 'shop' && tier >= 1 ? [0, 2.9, 3.6, 4.4, 4.9][tier] : 1.9);
  }

  let barBg, barFill;
  function buildPlots() {
    shops = [];
    cfg.plots.forEach((l, p) => {
      const c = blockCenter(l[0], l[1]);
      const size = E.DISTRICTS[D].plots[p].size;
      const s = { p, bx: l[0], bz: l[1], cx: c.x, cz: c.z, size, key: '', kind: '', t: -1, tier: -1, group: null, box: new T.Box3(),
        queue: [], incoming: 0, nextSpawn: 0, lastServe: 0, pop: 0, h: 3, barY: 5, affordable: false };
      // The block: lawn (or pavement) with the plot's own pad at the front. Bigger land = bigger pad.
      prop(c.x, 0.26, c.z, 12.4, 0.08, 12.4, cfg.style === 'suburb' ? 0x86de6a : 0xcdd2e0);
      s.pad = box(PAD[size], 0.06, PAD[size], mat(0xeadfce), c.x, 0.33, c.z + (12.4 - PAD[size]) / 2, root, true);
      s.pad.receiveShadow = true;
      if (size < 3) {   // a hedge marks the edge of smaller plots
        const hw = PAD[size] / 2 + 0.3, back = c.z + 6.2 - PAD[size] - 0.3;
        for (let z = back; z < c.z + 5.6; z += 1.1) { blob(c.x - hw, 0.62, z, 0.5, 0x57c93f); blob(c.x + hw, 0.62, z, 0.5, 0x57c93f); }
        for (let x = -hw; x <= hw; x += 1.1) blob(c.x + x, 0.62, back, 0.5, 0x57c93f);
      }
      s.bg = new T.Sprite(barBg); s.bg.scale.set(3.3, 0.5, 1); s.bg.renderOrder = 10;
      s.fill = new T.Sprite(barFill); s.fill.center.set(0, 0.5); s.fill.renderOrder = 11;
      s.hint = sprite(emojiTex('👆'), 1.5, 1.5);
      s.bg.visible = s.fill.visible = s.hint.visible = false;
      root.add(s.bg, s.fill, s.hint);
      shops.push(s);
    });
  }

  // ---------- Effects: coins and confetti ----------
  const coins = [], confetti = [];
  function buildFx() {
    for (let k = 0; k < 14; k++) { const s = sprite(emojiTex('💰'), 0.9, 0.9); s.visible = false; scene.add(s); coins.push({ s, t: 9 }); }
    const cols = [0xff6b6b, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8, 0xffffff];
    for (let k = 0; k < 60; k++) {
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
  const servedNow = {};
  function updateShops(dt, state, events) {
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    for (const k in servedNow) delete servedNow[k];
    if (events) for (const e of events) if (e.d === D) servedNow[e.p] = true;
    for (const s of shops) {
      if (!s.group) continue;
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
      if (ud.steam) for (const p of ud.steam.puffs) {
        p.t = (p.t + dt * 0.5) % 1;
        p.s.position.set(ud.steam.x + Math.sin(p.t * 6) * 0.1, ud.steam.y + p.t * 1.1, ud.steam.z);
        p.s.scale.setScalar(0.6 + p.t * 1.4);
        p.s.material.opacity = 0.7 * (1 - p.t);
      }
      if (ud.bobber) ud.bobber.position.y = 3.5 + Math.sin(time * 2 + s.p) * 0.12;
      if (ud.board) {
        const k = s.affordable ? 1 + Math.abs(Math.sin(time * 4)) * 0.12 : 1;
        ud.board.scale.setScalar(k);
        ud.board.position.y = 3.1 + (s.affordable ? Math.abs(Math.sin(time * 4)) * 0.35 : 0);
      }
      const b = s.kind === 'shop' ? E.shopAt(state, D, s.p) : null;
      if (!b) { s.bg.visible = s.fill.visible = s.hint.visible = false; continue; }

      const ct = E.cycleTime(state, D, s.p);
      // Customers: a quiet trickle for a new stall, a constant line for a famous restaurant
      const cap = Math.min(6, 1 + s.tier + (b.level >= 10 ? 1 : 0));
      if (s.queue.length + s.incoming < cap && time > s.nextSpawn) {
        summonCustomer(s);
        s.nextSpawn = time + Math.max(1.5, 6.5 * Math.pow(0.88, b.level - 1)) * rand(0.8, 1.25);
      }
      if (servedNow[s.p]) {
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
  }

  // ---------- Day and night ----------
  function updateDayNight(dt) {
    dayT = (dayT + dt / 300) % 1;
    let day;   // 0 → 0.55 day, → 0.65 dusk, → 0.9 night, → 1 dawn
    if (dayT < 0.55) day = 1;
    else if (dayT < 0.65) day = 1 - (dayT - 0.55) / 0.1;
    else if (dayT < 0.9) day = 0;
    else day = (dayT - 0.9) / 0.1;
    const dusk = 1 - Math.abs(day - 0.5) * 2;
    const sky = scene.background;
    sky.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * 0.55);
    fog.color.copy(sky);
    sun.intensity = 0.35 + day * 2.9;
    sun.color.setHex(0xfff1dc).lerp(tmpColor.setHex(0xff9a5c), dusk * 0.7);
    hemi.intensity = 0.7 + day * 1.0;
    const night = 1 - day;
    for (const n of nightMats) n.m.emissiveIntensity = (n.min || 0) + (n.max - (n.min || 0)) * night;
    glowMat.color.setScalar(0.5 + 0.5 * night);
    W.night = night;
  }

  // ---------- Skyline grows with your success in this district ----------
  function updateDecor(dt, instant) {
    for (const b of decor) {
      const target = 0.22 + 0.78 * clamp((prosperity - b.need) / 0.22, 0, 1);
      if (b.f < 0 || instant) b.f = target;
      else if (Math.abs(target - b.f) > 0.001) b.f += clamp(target - b.f, -dt * 0.25, dt * 0.25);
      else continue;
      b.mesh.position.y = 0.28 - (1 - b.f) * b.H;
    }
  }

  // ---------- Camera ----------
  function updateCamera(dt) {
    const g = cam.g;
    g.tx = clamp(g.tx, -HALF, HALF); g.tz = clamp(g.tz, -HALF, HALF); g.dist = clamp(g.dist, 30, 290);
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
    canvas.addEventListener('pointerup', (e) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (p && pts.size === 0 && moved < 12 && performance.now() - downAt < 450) tapAt(e.clientX, e.clientY);
      lastPinch = 0;
    });
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
      if (ray.ray.distanceSqToPoint(tmpV) < 2.4 * 2.4) {
        W.burst(vip.p.x, 2, vip.p.z, 40);
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
      if (d < bd) { bd = d; best = s.p; }
    }
    if (best >= 0 && hooks.onPickPlot) hooks.onPickPlot(best, clientX, clientY);
  }

  // ---------- VIP visitor ----------
  function endVip() {
    if (!vip) return;
    const p = vip.p;
    vip = null;
    removePerson(p);
  }
  W.spawnVip = function (nearPlot) {
    if (!W.ok || !root || vip) return false;
    const s = shops[nearPlot] || shops[0];
    const near = [];
    for (let i = 0; i < NODES; i++) { const d = Math.hypot(nodeXZ[i].x - s.cx, nodeXZ[i].z - s.cz); if (d > 8 && d < 30) near.push(i); }
    const p = spawnPerson(pick(near.length ? near : edgeNodes), { shirt: 0xffc93d, plain: true });
    p.speed = 2.6;
    part(geo('vipcrown', () => new T.ConeGeometry(0.2, 0.24, 5)), mat(0xffb000), 0, 1.5, 0, p.g).castShadow = false;
    const beam = new T.Mesh(geo('beam', () => new T.CylinderGeometry(0.75, 0.75, 16, 12, 1, true)),
      once('beamMat', () => new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide })));
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
      const finalFs = `uniform sampler2D sharp; uniform sampler2D blur; uniform float focus; uniform float band; varying vec2 vUv;
        ${amount}
        void main(){
          vec3 c = mix(texture2D(sharp, vUv).rgb, texture2D(blur, vUv).rgb, amount(vUv.y));
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
      const fMat = mk(finalFs, { sharp: { value: sceneRT.texture }, blur: { value: blurB.texture } });
      const quad = new T.Mesh(new T.PlaneGeometry(2, 2), hMat);
      quad.frustumCulled = false;
      const pScene = new T.Scene();
      pScene.add(quad);
      post = { sceneRT, blurA, blurB, hMat, vMat, fMat, quad, pScene, pCam: new T.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
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

  // ---------- Public API ----------
  W.init = function (canvasEl, h) {
    canvas = canvasEl; hooks = h || {};
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); }
    catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    skyDay = new T.Color(0x9ad8ff); skyDusk = new T.Color(0xff9e6b); skyNight = new T.Color(0x161b3d);
    scene.background = skyDay.clone();
    fog = new T.Fog(scene.background.getHex(), 300, 860);
    scene.fog = fog;
    camera = new T.PerspectiveCamera(24, 1, 2, 1400);
    hemi = new T.HemisphereLight(0xd8e9ff, 0x8f86b0, 1.7);
    scene.add(hemi);
    sun = new T.DirectionalLight(0xfff1dc, 2.8);
    sun.position.set(-70, 62, 34);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
    scene.add(sun, sun.target);

    glowMat = new T.MeshBasicMaterial({ color: 0xffffff });
    glassMat = new T.MeshLambertMaterial({ color: 0x79b8e6, emissive: 0xffd27a, emissiveIntensity: 0 });
    bulbMat = new T.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc94d, emissiveIntensity: 0.2 });
    headMat = new T.MeshLambertMaterial({ color: 0xfff7d6, emissive: 0xfff2b0, emissiveIntensity: 0.1 });
    tailMat = new T.MeshLambertMaterial({ color: 0xc92a2a, emissive: 0xff3b3b, emissiveIntensity: 0.1 });
    nightMats.push({ m: glassMat, max: 0.9 }, { m: headMat, max: 1.6, min: 0.1 }, { m: tailMat, max: 1.2, min: 0.1 }, { m: bulbMat, max: 1.4, min: 0.2 });
    doorMat = mat(0x4a3428);
    barBg = new T.SpriteMaterial({ color: 0x1b1236, depthTest: false, transparent: true, opacity: 0.85 });
    barFill = new T.SpriteMaterial({ color: 0xffb03d, depthTest: false });
    barBg.userData.shared = barFill.userData.shared = true;

    buildFx();
    bindInput();
    buildPost();
    W.ok = true;
    W.setQuality(0);
    window.addEventListener('resize', W.resize);
    return true;
  };

  // Build (or rebuild) the map for one district.
  W.loadDistrict = function (d, state) {
    if (!W.ok) return;
    if (root) {
      endVip();
      people.slice().forEach(removePerson);
      disposeGroup(root);
    }
    D = d; cfg = DCFG[d]; N = cfg.n;
    // Each district has its own sky: bright for the suburb, violet neon dusk for the metropolis.
    skyDay.setHex([0x9ad8ff, 0x8fd3ff, 0x9fcbf5, 0xb3a3f5][d]);
    skyNight.setHex([0x161b3d, 0x161b3d, 0x141638, 0x1c0f3d][d]);
    HALF = (N * BLOCK + (N - 1) * ROAD) / 2;
    seed = 1337 + d * 7919;
    root = new T.Group();
    scene.add(root);
    people = []; cars = []; decor = []; movers = []; props = []; glows = []; blobs = [];
    loadedAt = time; nextWander = 0; nextCar = 0;
    buildGraph();
    buildGround();
    buildScenery();
    buildPlots();
    flushInstances();
    const span = HALF + 45, sc = sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span;
    sc.updateProjectionMatrix();
    W.sync(state, true);
    W.setQuality(quality);
  };
  W.district = () => D;

  W.resize = function () {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.7 ? 30 : 22;   // keep the town readable on tall phone screens
    camera.updateProjectionMatrix();
    sizePost();
  };

  // 0 = full, 1 = no shadows, 2 = no shadows + lower resolution
  W.setQuality = function (q) {
    quality = q;
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(q === 0 ? Math.min(dpr, 2) : q === 1 ? Math.min(dpr, 1.5) : 1);
    renderer.shadowMap.enabled = q === 0;
    sun.castShadow = q === 0;
    scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)); });
    W.resize();
  };
  W.getQuality = () => quality;

  // Match the 3D map to the save: what stands on each plot, and how lively the district is.
  W.sync = function (state, instant) {
    if (!W.ok || !root || state.district !== D) return;
    let milestones = 0, owned = 0, cheapest = Infinity;
    for (let t = 0; t < E.TYPES.length; t++) cheapest = Math.min(cheapest, E.buildCost(state, t));
    shops.forEach((s) => {
      const x = state.plots[D][s.p];
      const kind = !x ? 'sale' : x.t < 0 ? 'empty' : 'shop';
      const tier = kind === 'shop' ? Math.min(tierFor(x.level), E.SIZES[s.size].maxTier) : -1;
      const key = kind + ':' + (kind === 'shop' ? x.t : '') + ':' + tier;
      if (kind === 'shop') { owned++; milestones += E.milestoneInfo(x.level).reached; }
      if (key !== s.key) {
        const celebrate = s.key !== '' && !instant && kind !== 'sale';
        if (kind !== 'shop' || (s.kind === 'shop' && s.t !== x.t)) releaseCustomers(s);
        rebuildShop(s, kind, kind === 'shop' ? x.t : -1, tier, E.landPrice(D, s.p));
        s.key = key;
        if (celebrate) { s.pop = 1; W.burst(s.cx, s.h + 1, s.cz + 3, 30); }
      }
      s.affordable = kind === 'sale' ? state.cash >= E.landPrice(D, s.p) : kind === 'empty' ? state.cash >= cheapest : false;
    });
    prosperity = clamp(0.04 + 0.5 * owned / shops.length + 0.46 * Math.min(1, milestones / (shops.length * 5)), 0, 1);
    if (instant) updateDecor(0, true);
  };

  W.pulse = function (p) { if (W.ok && shops[p]) shops[p].pop = 1; };

  W.focusPlot = function (p, instant) {
    if (!W.ok || !shops[p]) return;
    const s = shops[p];
    cam.g.tx = s.cx; cam.g.tz = s.cz + 2.5;
    cam.g.dist = FOCUS_DIST[Math.max(0, s.tier)];
    cam.ease = 5;
    if (instant) { cam.tx = cam.g.tx; cam.tz = cam.g.tz; cam.dist = cam.g.dist; cam.yaw = cam.g.yaw; }
  };

  // Opening shot: sweep down from high above to the selected plot.
  W.intro = function () {
    if (!W.ok) return;
    cam.tx = 0; cam.tz = 0; cam.dist = 250; cam.yaw = cam.g.yaw + 1.6;
    cam.ease = 1.15;
    introUntil = time + 4;
  };

  // Screen position (CSS pixels) just above a plot, for floating "+$" text. Null when off-screen.
  W.plotScreenPos = function (p) {
    if (!W.ok || !shops[p] || !shops[p].group) return null;
    const s = shops[p];
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

  W.update = function (dt, state, events) {
    if (!W.ok || !root) return;
    time += dt;
    if (introUntil && time > introUntil) { introUntil = 0; cam.ease = 8; }
    else if (!introUntil && cam.ease !== 8) cam.ease += (8 - cam.ease) * Math.min(1, dt * 2);
    updateCamera(dt);
    updateDayNight(dt);
    updateDecor(dt);
    updateShops(dt, state, events);
    updatePeople(dt);
    updateCars(dt);
    for (const m of movers) m(dt);
    updateFx(dt);
    if (vip && time > vip.until) { endVip(); if (hooks.onVipGone) hooks.onVipGone(); }
  };

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
    get stats() { return { people: people.length, cars: cars.length, prosperity, quality, district: D }; },
    setTime(t) { dayT = t; },
    get vip() { return vip ? { x: vip.p.x, z: vip.p.z } : null; },
    get shops() { return shops; },
    cam,
  };
})();
