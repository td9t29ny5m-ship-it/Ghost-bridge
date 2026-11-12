/*
 * Yum Empire — the 3D world (Three.js; every model and texture is made in code).
 *
 * The park you build sits in the middle of a little town. It is a 24 × 24 grid of cells
 * (4 m each). Land you own is paved; land for sale is wild grass with a FOR SALE sign.
 * Around the park run sidewalks and a ring road, and beyond that the neighbourhood:
 * houses, towers, shops and parks, which change with each location.
 *
 * Customers walk in from the street, queue at your stalls, sit at your tables and leave.
 * This file only draws and animates; all game rules live in engine.js.
 */
(function () {
  'use strict';
  const T = window.THREE;
  const E = window.Engine;
  const W = { ok: false };
  window.World = W;
  if (!T) return;

  const CELL = 4, G = 24, HALF = (G * CELL) / 2;   // the park spans -48 … 48
  const RING = 55, OUTER = 84;                      // centre lines of the two ring roads
  const STYLES = ['suburb', 'town', 'city', 'metro'];
  const ACCENT = { cart: 0xe8452c, dumpling: 0x2e9e6b, tea: 0x9b5de5, taco: 0xf08c00, pizza: 0xd62828, sushi: 0x1d6fa5,
    burger: 0xe36414, court: 0x3a86ff, global: 0x0b4f8a, garden: 0x3a9e4a, spice: 0xd9663b, fish: 0x1d8fd1, farm: 0x2e9e6b };
  const WALL = { cart: 0xfff1d6, dumpling: 0xfdf6ec, tea: 0xf7e6ff, taco: 0xfff3c4, pizza: 0xffe8dc, sushi: 0xe9f5f9, burger: 0xfff0c9,
    court: 0xeef0f7, global: 0xcfe8ff, fish: 0xe3f4ff };
  const cellX = (x) => (x + 0.5 - G / 2) * CELL;
  const footX = (b, d) => (b.x + d.w / 2 - G / 2) * CELL;
  const footZ = (b, d) => (b.y + d.h / 2 - G / 2) * CELL;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let seed = 1337;
  const srand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const spick = (arr) => arr[(srand() * arr.length) | 0];

  let renderer, scene, camera, canvas, hooks = {};
  let sun, hemi, fog, root = null, parkRoot = null, decoRoot = null, style = 'suburb', P = 0;
  const cam = { tx: 0, tz: 0, dist: 90, yaw: 0.785, g: { tx: 0, tz: 0, dist: 90, yaw: 0.785 }, ease: 8, el: 0.92 };
  let views = new Map();       // building uid → its 3D view
  let people = [], cars = [], movers = [], tips = [];
  const nightMats = [];
  let glowMat, skyDay, skyDusk, skyNight, glassMat, bulbMat, headMat, tailMat;
  let time = 0, dayT = 0.22, quality = 0, loadedAt = 0, nextWander = 0, nextCar = 0, introUntil = 0;
  let fixedDay = null, clockNow = 0;
  let vip = null, selU = 0, selRing = null, place = null, landKey = '', lastState = null;
  const tmpV = new T.Vector3(), tmpV2 = new T.Vector3(), camRight = new T.Vector3(), tmpColor = new T.Color();

  // ---------- Helpers ----------
  const cache = {};
  const once = (key, make) => (cache[key] || (cache[key] = make()));
  const mat = (color, opts) => once('m' + color + (opts ? JSON.stringify(opts) : ''), () => new T.MeshLambertMaterial(Object.assign({ color }, opts || {})));
  const geo = (key, make) => once('g' + key, () => { const g = make(); g.userData.shared = true; return g; });
  const boxGeo = () => geo('box', () => new T.BoxGeometry(1, 1, 1));
  // Boxes with softly rounded edges: the toy look. Each size is built once and shared.
  // The box is split so that a band of radius r along every edge can bend into a quarter circle.
  let ROUND = true;
  function roundedBoxGeo(w, h, d, r, k) {
    const S = 2 * k + 1, g = new T.BoxGeometry(1, 1, 1, S, S, S);
    const pos = g.attributes.position, nor = g.attributes.normal, half = [w / 2, h / 2, d / 2];
    const p = [0, 0, 0], inner = [0, 0, 0];
    for (let v = 0; v < pos.count; v++) {
      for (let a = 0; a < 3; a++) {
        const i = Math.round((pos.getComponent(v, a) + 0.5) * S), H = half[a];
        p[a] = i <= k ? -H + r * (i / k) : i >= S - k ? H - r * ((S - i) / k) : 0;
        if (i > k && i < S - k) p[a] = 0;
        inner[a] = Math.max(-H + r, Math.min(H - r, p[a]));
      }
      const dx = p[0] - inner[0], dy = p[1] - inner[1], dz = p[2] - inner[2], len = Math.hypot(dx, dy, dz);
      if (len > 1e-6) {
        pos.setXYZ(v, inner[0] + dx / len * r, inner[1] + dy / len * r, inner[2] + dz / len * r);
        nor.setXYZ(v, dx / len, dy / len, dz / len);
      } else pos.setXYZ(v, p[0], p[1], p[2]);
    }
    g.computeBoundingSphere();
    return g;
  }
  function box(w, h, d, material, x, y, z, parent, noShadow) {
    const mn = Math.min(w, h, d);
    let m;
    if (ROUND && mn >= 0.22 && quality < 2) {
      const r = Math.min(0.16, mn * 0.2), q = (v) => Math.round(v * 20) / 20;
      const key = 'rb' + q(w) + '_' + q(h) + '_' + q(d);
      m = new T.Mesh(geo(key, () => roundedBoxGeo(q(w), q(h), q(d), r, 2)), material);
    } else {
      m = new T.Mesh(boxGeo(), material);
      m.scale.set(w, h, d);
    }
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
  const TEXT_FONT = '"Lilita One",-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif';
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fitText(g, text, maxW, size) {
    do { g.font = `400 ${size}px ${TEXT_FONT}`; size -= 2; } while (g.measureText(text).width > maxW && size > 10);
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
      if (o.userData && o.userData.ownTex) { o.userData.ownTex.dispose(); if (o.material) o.material.dispose(); }
    });
    if (g.parent) g.parent.remove(g);
  }
  // Our own icon art (icons.js) drawn onto canvases; the SVG loads asynchronously.
  function drawIcon(tex, g, name, x, y, size) {
    const img = new Image();
    img.onload = () => { g.drawImage(img, x, y, size, size); tex.needsUpdate = true; };
    img.src = window.Icons.url(name);
  }
  function iconTex(name) {
    return once('i' + name, () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const t = new T.CanvasTexture(c);
      t.colorSpace = T.SRGBColorSpace;
      drawIcon(t, c.getContext('2d'), name, 4, 4, 120);
      return t;
    });
  }
  // A round speech bubble with an icon in it (collect bubbles, customer orders)
  function bubbleTex(name, ring) {
    return once('b' + name + ring, () => {
      const c = document.createElement('canvas');
      c.width = c.height = 160;
      const g = c.getContext('2d');
      const t = new T.CanvasTexture(c);
      t.colorSpace = T.SRGBColorSpace;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(80, 76, 62, 0, 6.3); g.fill();
      g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(80, 72, 62, 0, 6.3); g.fill();
      g.beginPath(); g.moveTo(66, 128); g.lineTo(80, 152); g.lineTo(94, 128); g.fill();
      g.lineWidth = 8; g.strokeStyle = ring; g.beginPath(); g.arc(80, 72, 58, 0, 6.3); g.stroke();
      drawIcon(t, g, name, 34, 26, 92);
      return t;
    });
  }

  // ---------- Hand-made textures ----------
  const R = (n) => Math.random() * n;
  function speckle(g, w, h, n, cols, size) {
    for (let k = 0; k < n; k++) { g.fillStyle = cols[(R(cols.length)) | 0]; const s = size * (0.5 + R(1)); g.fillRect(R(w), R(h), s, s); }
  }
  const DRAW = {
    grass: (base) => (g, w, h) => {
      g.fillStyle = base; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2600, ['rgba(255,255,255,.07)', 'rgba(0,60,0,.08)', 'rgba(255,255,160,.07)'], 4);
      g.lineWidth = 2;
      for (let k = 0; k < 900; k++) {
        const x = R(w), y = R(h);
        g.strokeStyle = R(1) < 0.5 ? 'rgba(20,90,20,.18)' : 'rgba(220,255,170,.16)';
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(4) - 2, y - 4 - R(5)); g.stroke();
      }
    },
    asphalt: (g, w, h) => {
      g.fillStyle = '#3d4865'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.12)', 'rgba(160,170,210,.08)'], 2.5);
      g.strokeStyle = 'rgba(15,20,35,.35)'; g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        let x = R(w), y = R(h); g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += R(24) - 12; y += R(24) - 12; g.lineTo(x, y); }
        g.stroke();
      }
    },
    pavers: (a, b, n) => (g, w, h) => {
      const c = w / n;
      g.fillStyle = b; g.fillRect(0, 0, w, h);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const l = 0.92 + R(0.16);
        g.fillStyle = a; g.fillRect(x * c + 2, y * c + 2, c - 4, c - 4);
        g.fillStyle = l > 1 ? 'rgba(255,255,255,' + (l - 1) * 2 + ')' : 'rgba(0,0,0,' + (1 - l) * 1.5 + ')';
        g.fillRect(x * c + 2, y * c + 2, c - 4, c - 4);
        g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x * c + 2, y * c + 2, c - 4, 2);
      }
      speckle(g, w, h, 900, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.08)'], 2);
    },
    plaster: (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2200, ['rgba(0,0,0,.035)', 'rgba(0,0,0,.05)', 'rgba(255,255,255,.5)'], 3);
      g.fillStyle = 'rgba(0,0,0,.05)';
      for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 2);
    },
    brick: (g, w, h) => {
      g.fillStyle = '#e9e1da'; g.fillRect(0, 0, w, h);
      const bw = 32, bh = 14;
      for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) {
        const x = c * bw + (r % 2 ? bw / 2 : 0), l = 0.85 + R(0.3);
        g.fillStyle = `rgb(${Math.round(255 * l)},${Math.round(250 * l)},${Math.round(245 * l)})`;
        g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
        g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, 2);
      }
    },
    gravel: (g, w, h) => { g.fillStyle = '#a9afbf'; g.fillRect(0, 0, w, h); speckle(g, w, h, 4000, ['#8e95a8', '#c3c8d5', '#9aa1b3', '#b7bccb'], 3.5); },
    wood: (g, w, h) => {
      g.fillStyle = '#c99b66'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 16) {
        g.fillStyle = `rgba(90,50,20,${0.1 + R(0.12)})`; g.fillRect(0, y, w, 16);
        g.fillStyle = 'rgba(60,30,10,.35)'; g.fillRect(0, y, w, 1.5);
      }
    },
    soil: (g, w, h) => {
      g.fillStyle = '#8a5a30'; g.fillRect(0, 0, w, h);
      speckle(g, w, h, 3000, ['#6e4422', '#a87344', '#7b4f28'], 3);
      g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 8; y < h; y += 32) g.fillRect(0, y, w, 8);
    },
    water: (g, w, h) => {
      g.fillStyle = '#3f8fe0'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2.5; g.lineCap = 'round';
      for (let k = 0; k < 40; k++) { const x = R(w), y = R(h); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6, y - 4, x + 12, y); g.stroke(); }
    },
    stripes: (col) => (g, w, h) => { g.fillStyle = '#fff7ec'; g.fillRect(0, 0, w, h); g.fillStyle = col; g.fillRect(0, 0, w / 2, h); },
  };
  function texMat(key, size, draw, rx, ry, color) {
    return once('tm' + key + rx + 'x' + ry + (color || ''), () => {
      const base = once('tex' + key, () => { const t = canvasTex(size, size, draw); t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8; return t; });
      const t = base.clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      return new T.MeshLambertMaterial({ map: t, color: color || 0xffffff });
    });
  }
  const awningMat = (col, rep) => {
    const m = texMat('awn' + col, 64, DRAW.stripes(hex(col)), rep, 1);
    m.map.magFilter = T.NearestFilter;
    return m;
  };

  // ---------- Instanced detail (thousands of small parts in a few draw calls) ----------
  let props = [], glows = [], blobs = [];
  const prop = (x, y, z, sx, sy, sz, color, ry) => props.push([x, y, z, sx, sy, sz, color, ry || 0]);
  const glow = (x, y, z, sx, sy, sz, color) => glows.push([x, y, z, sx, sy, sz, color, 0]);
  const blob = (x, y, z, r, color, sy) => blobs.push([x, y, z, r, r * (sy || 1), r, color, 0]);
  function flushInstances(target) {
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
      target.add(im);
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
  function lampPost(x, z) { prop(x, 1.8, z, 0.12, 3.2, 0.12, 0x4a4f5e); glow(x, 3.5, z, 0.42, 0.3, 0.42, 0xffe9a8); }
  function bench(x, z, ry) {
    prop(x, 0.5, z, 1.5, 0.1, 0.5, 0xb08350, ry);
    prop(x - Math.sin(ry) * 0.22, 0.82, z - Math.cos(ry) * 0.22, 1.5, 0.45, 0.08, 0xb08350, ry);
  }
  function parkedCar(x, z, ry, color) {
    prop(x, 0.6, z, 1.7, 0.6, 3.5, color, ry);
    prop(x, 1.1, z, 1.5, 0.5, 1.8, 0x6fa8dc, ry);
  }

  // ---------- Windows for the town's towers ----------
  function makeWindowTex(glass) {
    const lit = [];
    for (let k = 0; k < 16; k++) lit.push(srand() < 0.55);
    const draw = (night) => (g, w, h) => {
      g.fillStyle = night ? '#000' : '#fff'; g.fillRect(0, 0, w, h);
      if (!night) speckle(g, w, h, 1200, ['rgba(0,0,0,.04)', 'rgba(255,255,255,.4)'], 3);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        g.fillStyle = night ? (lit[r * 4 + c] ? '#ffd98a' : '#141824') : glass;
        g.fillRect(c * 64 + 12, r * 64 + 10, 40, 38);
        if (!night) {
          g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(c * 64 + 12, r * 64 + 10, 40, 9);
          g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(c * 64 + 31, r * 64 + 10, 2, 38);
          g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(c * 64 + 8, r * 64 + 50, 48, 4);
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

  // =====================================================================
  //  The neighbourhood around the park
  // =====================================================================
  function buildStreets() {
    const grassCol = style === 'suburb' ? '#7ddc62' : style === 'metro' ? '#5fb56a' : '#74d660';
    const grass = new T.Mesh(geo('grass', () => new T.PlaneGeometry(1200, 1200)), texMat('grass' + style, 256, DRAW.grass(grassCol), 150, 150));
    grass.rotation.x = -Math.PI / 2; grass.position.y = -0.06; grass.receiveShadow = true;
    root.add(grass);
    const tint = style === 'metro' ? 0xc2c8e8 : 0xffffff;
    const walk = texMat('walk', 256, DRAW.pavers('#e6e9f2', '#b9bfd0', 4), 1, 1);
    // A square "ring" strip: four flat boxes forming a frame between radius a and b.
    const ring = (a, b, y, material, rep) => {
      const w = b - a, len = 2 * b;
      for (const [x, z, sx, sz] of [[0, -(a + w / 2), len, w], [0, a + w / 2, len, w], [-(a + w / 2), 0, w, 2 * a], [a + w / 2, 0, w, 2 * a]]) {
        const m = new T.Mesh(boxGeo(), rep ? texMat(rep.key, 256, rep.draw, Math.max(1, Math.round(sx / rep.size)), Math.max(1, Math.round(sz / rep.size)), rep.tint) : material);
        m.scale.set(sx, 0.1, sz); m.position.set(x, y, z); m.receiveShadow = true;
        root.add(m);
      }
    };
    const asph = { key: 'asphalt', draw: DRAW.asphalt, size: 9, tint };
    const pav = { key: 'walk', draw: DRAW.pavers('#e6e9f2', '#b9bfd0', 4), size: 4 };
    ring(HALF, HALF + 3, 0.12, null, pav);              // sidewalk around the park
    ring(RING - 4, RING + 4, 0.01, null, asph);          // ring road
    ring(RING + 4, RING + 7, 0.12, null, pav);           // outer sidewalk
    ring(OUTER - 3, OUTER + 3, 0.01, null, asph);        // outer road
    void walk;
    // Side streets running out of town
    for (const c of [-36, -12, 12, 36]) {
      for (const sgn of [-1, 1]) {
        const len = 140, mid = sgn * (RING + 4 + len / 2);
        const v = new T.Mesh(boxGeo(), texMat('asphalt', 256, DRAW.asphalt, 1, 16, tint)); v.scale.set(6, 0.1, len); v.position.set(c, 0.0, mid); v.receiveShadow = true;
        const hz = new T.Mesh(boxGeo(), texMat('asphalt', 256, DRAW.asphalt, 16, 1, tint)); hz.scale.set(len, 0.1, 6); hz.position.set(mid, 0.0, c); hz.receiveShadow = true;
        root.add(v, hz);
      }
    }
    // Road markings: centre lines and crossings at the four park gates
    const lineMat = once('lineMat', () => new T.MeshBasicMaterial({ color: 0xffc93d }));
    for (const r of [RING, OUTER]) {
      for (const [x, z, sx, sz] of [[0, -r, 2 * r, 0.25], [0, r, 2 * r, 0.25], [-r, 0, 0.25, 2 * r], [r, 0, 0.25, 2 * r]]) {
        const m = new T.Mesh(boxGeo(), lineMat); m.scale.set(sx, 0.02, sz); m.position.set(x, 0.07, z); root.add(m);
      }
    }
    for (let k = 0; k < 4; k++) for (let i = 0; i < 6; i++) {
      const o = -3.75 + i * 1.5, a = k * Math.PI / 2, cx = Math.sin(a) * RING, cz = Math.cos(a) * RING;
      prop(cx + Math.cos(a) * o, 0.08, cz - Math.sin(a) * o, Math.abs(Math.cos(a)) > 0.5 ? 0.8 : 7.4, 0.02, Math.abs(Math.cos(a)) > 0.5 ? 7.4 : 0.8, 0xf4f1e6);
    }
    // Street lamps and trees along the park sidewalk
    for (let k = -HALF + 6; k <= HALF - 6; k += 12) for (const s of [-1, 1]) {
      lampPost(k, s * (HALF + 2.4)); lampPost(s * (HALF + 2.4), k);
      tree(k + 6, s * (RING + 5.6), 0.9); tree(s * (RING + 5.6), k + 6, 0.9);
    }
  }

  // Neighbourhood blocks: 18 m squares on a 24 m grid, outside the ring road.
  const BLOCKS = [];
  for (const x of [-96, -72, -48, -24, 0, 24, 48, 72, 96]) for (const z of [-96, -72, -48, -24, 0, 24, 48, 72, 96]) {
    if (Math.max(Math.abs(x), Math.abs(z)) >= 72) BLOCKS.push([x, z]);
  }
  const HOUSE_WALLS = [0xfff1d6, 0xffe0c2, 0xe3f1ff, 0xf6e7ff, 0xe9f7e1, 0xfff6c7];
  const HOUSE_ROOFS = [0xd9534f, 0x4a6fa5, 0x8d6e63, 0x5b8c5a, 0xe07b39];
  function house(x, z, face) {
    const wall = spick(HOUSE_WALLS), roofC = spick(HOUSE_ROOFS), w = 4.4 + srand(), d = 3.8 + srand() * 0.6, h = 2.5 + (srand() < 0.35 ? 1.8 : 0);
    prop(x, 0.28 + h / 2, z, w, h, d, wall);
    const roof = part(geo('hroof', () => new T.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4)), mat(roofC), x, 0.28 + h + 0.8, z, root);
    roof.scale.set(w + 0.7, 1.6, d + 0.7);
    prop(x + w * 0.28, 0.28 + h + 1.1, z - d * 0.15, 0.45, 1.3, 0.45, 0xb8493a);
    prop(x - w * 0.18, 0.28 + 0.85, z + face * (d / 2 + 0.03), 0.8, 1.7, 0.08, 0x7a4a2a);
    for (const ox of [w * 0.22, -w * 0.4]) prop(x + ox, 0.28 + 1.5, z + face * (d / 2 + 0.03), 0.8, 0.8, 0.08, 0x79b8e6);
    if (h > 3) for (const ox of [-w * 0.28, w * 0.24]) prop(x + ox, 0.28 + 3.3, z + face * (d / 2 + 0.03), 0.8, 0.8, 0.08, 0x79b8e6);
    prop(x - w * 0.18, 0.3, z + face * (d / 2 + 1.4), 1.0, 0.04, 2.8, 0xd9dde6);
    for (const ox of [-1.8, 1.9]) blob(x + ox, 0.55, z + face * (d / 2 + 0.5), 0.42, spick(GREENS));
    if (srand() < 0.6) parkedCar(x + w / 2 + 1.4, z + face * 1.0, 0, spick(CAR_COLORS));
  }
  function houseBlock(c) {
    prop(c[0], 0.2, c[1], 18, 0.12, 18, 0x86de6a);
    for (const [ox, oz, f] of [[-4.2, -3.4, -1], [4.2, -3.4, -1], [-4.2, 3.4, 1], [4.2, 3.4, 1]]) house(c[0] + ox, c[1] + oz, f);
    for (let k = 0; k < 9; k++) prop(c[0] - 8 + k * 2, 0.55, c[1], 0.14, 0.6, 0.14, 0xffffff);
    prop(c[0], 0.7, c[1], 16, 0.1, 0.08, 0xffffff);
    if (srand() < 0.7) tree(c[0] - 0.4, c[1] - 1, 1.1);
    tree(c[0] + 8, c[1] + 8, 0.9); tree(c[0] - 8, c[1] - 8, 0.9);
  }
  function greenBlock(c) {
    prop(c[0], 0.2, c[1], 18, 0.12, 18, 0x6fd35c);
    prop(c[0], 0.27, c[1], 18, 0.03, 1.6, 0xe9dcc3); prop(c[0], 0.27, c[1], 1.6, 0.03, 18, 0xe9dcc3);
    for (const [ox, oz] of [[-5, -5], [5, -5], [5, 5], [-5, 5], [-7.5, 2], [7.5, -2], [2, -7.5], [-2, 7.5]]) tree(c[0] + ox, c[1] + oz, 1.1 + srand() * 0.6);
    for (const a of [0.785, 2.356, 3.927, 5.498]) bench(c[0] + Math.cos(a) * 2.8, c[1] + Math.sin(a) * 2.8, -a + Math.PI / 2);
    const FLOWERS = [0xff6b9d, 0xffd43b, 0xff8787, 0xffffff, 0xc77dff];
    for (let k = 0; k < 18; k++) blob(c[0] + rand(-8, 8), 0.36, c[1] + rand(-8, 8), 0.22, FLOWERS[k % 5]);
  }
  let towerMats = {};
  function towerBlock(c) {
    const key = style === 'metro' ? 'neon' : 'day';
    const mats = towerMats[key] || (towerMats[key] = (() => {
      const palette = key === 'neon' ? [0x8fa3d9, 0x6f7fc4, 0xb8a6e8, 0x7fb6d9, 0x9aa8c9, 0xd4c2f0] : [0xffe29a, 0xffb26b, 0xf6f6fa, 0xc4d6f5, 0xffd2c4, 0xf1e7cf, 0xffc857, 0xbfe3d6];
      const [winTex, litTex] = makeWindowTex(key === 'neon' ? '#4b6fb8' : '#6f8fb3');
      return palette.map(col => {
        const side = new T.MeshLambertMaterial({ color: col, map: winTex, emissive: 0xffffff, emissiveMap: litTex, emissiveIntensity: 0 });
        nightMats.push({ m: side, max: key === 'neon' ? 1.15 : 0.95 });
        return { side, roof: mat(new T.Color(col).multiplyScalar(0.7).getHex()) };
      });
    })());
    prop(c[0], 0.2, c[1], 18, 0.12, 18, 0xcdd2e0);
    const far = Math.max(Math.abs(c[0]), Math.abs(c[1])) > 90;
    const lo = style === 'town' ? 4 : style === 'metro' ? 12 : 6, hi = style === 'town' ? 9 : style === 'metro' ? 40 : 24;
    const NEON = [0xff4fd8, 0x3df5ff, 0xfff34f, 0x7dff6b];
    const AWN = [0xe8452c, 0x2e9e6b, 0x3a86ff, 0xf08c00, 0x9b5de5];
    for (const ox of [-4.2, 4.2]) for (const oz of [-4.2, 4.2]) {
      const w = 6 + srand() * 1.6, d = 6 + srand() * 1.6, H = lo + srand() * (hi - lo) * (far ? 1 : 0.8);
      const g = new T.BoxGeometry(w, H, d);
      g.translate(0, H / 2, 0);
      scaleBoxUV(g, w, H, d, 9.6, 12.8);
      const m = spick(mats);
      const mesh = new T.Mesh(g, [m.side, m.side, m.roof, m.roof, m.side, m.side]);
      mesh.position.set(c[0] + ox, 0.26, c[1] + oz);
      mesh.castShadow = true; mesh.receiveShadow = true;
      root.add(mesh);
      if (srand() < 0.6) box(w + 0.25, 0.35, d + 0.25, mat(srand() < 0.5 ? 0xff8a3d : 0x8d99ae), 0, H + 0.1, 0, mesh);
      for (let k = 0, n = 1 + ((srand() * 3) | 0); k < n; k++) box(0.8 + srand() * 0.8, 0.6, 0.8 + srand() * 0.6, mat(0xf4f6fb), (srand() - 0.5) * (w - 2), H + 0.5, (srand() - 0.5) * (d - 2), mesh);
      const r = srand();
      if (r < 0.25) {
        part(geo('wtank', () => new T.CylinderGeometry(0.8, 0.8, 1.2, 10)), mat(0x9c6b4a), w * 0.2, H + 1.6, -d * 0.2, mesh);
        part(geo('wcap', () => new T.ConeGeometry(0.9, 0.6, 10)), mat(0x6b4630), w * 0.2, H + 2.5, -d * 0.2, mesh);
      } else if (r < 0.45) {
        box(w * 0.75, 1.8, 0.15, once('neon' + r, () => new T.MeshBasicMaterial({ color: pick(NEON) })), 0, H + 1.5, d * 0.3, mesh, true);
      }
      if (style === 'metro' && srand() < 0.7) box(0.14, H * 0.9, 0.14, once('neonE' + ((srand() * 4) | 0), () => new T.MeshBasicMaterial({ color: pick(NEON) })), w / 2 + 0.04, H * 0.5, d / 2 + 0.04, mesh, true);
      const fz = oz > 0 ? 1 : -1;
      prop(c[0] + ox, 2.75, c[1] + oz + fz * (d / 2 + 0.45), w * 0.9, 0.14, 0.9, spick(AWN));
      prop(c[0] + ox, 1.3, c[1] + oz + fz * (d / 2 + 0.03), 1.2, 2.1, 0.08, 0x4a3428);
    }
  }
  function buildNeighbourhood() {
    for (const c of BLOCKS) {
      const r = srand();
      if (r < 0.14) greenBlock(c);
      else if (style === 'suburb' || (style === 'town' && r < 0.55)) houseBlock(c);
      else towerBlock(c);
      // kerb lamps
      for (const [sx, sz] of [[-1, -1], [1, 1]]) lampPost(c[0] + sx * 8.8, c[1] + sz * 8.8);
    }
    // Beyond town
    const ringPoint = (rmin, rmax) => { const a = srand() * 6.283, r = rmin + srand() * (rmax - rmin); return [Math.cos(a) * r, Math.sin(a) * r]; };
    if (style === 'suburb') {
      const FIELD = [0xf2d06b, 0x9bd66b, 0xc9a66b, 0xb4e07a, 0xe8c15a];
      for (let k = 0; k < 30; k++) { const [x, z] = ringPoint(125, 230); prop(x, -0.02, z, 18 + srand() * 22, 0.05, 14 + srand() * 20, spick(FIELD)); }
      for (let k = 0; k < 80; k++) { const [x, z] = ringPoint(112, 220); (srand() < 0.5 ? tree : pine)(x, z, 1.3 + srand() * 1.2); }
      prop(128, 2.2, -118, 7, 4.4, 5, 0xc0392b); prop(128, 4.9, -118, 7.6, 1, 5.6, 0x7b241c); prop(134, 3.5, -115, 2.2, 7, 2.2, 0xdfe6e9);
    } else {
      if (style === 'town') {
        const river = new T.Mesh(geo('river', () => new T.PlaneGeometry(52, 1000)), texMat('water', 128, DRAW.water, 4, 80));
        river.rotation.x = -Math.PI / 2; river.position.set(-140, -0.04, 0);
        root.add(river);
        for (let k = 0; k < 5; k++) {
          const g = new T.Group();
          box(1.4, 0.5, 3.6, mat(0xfff7ec), 0, 0.25, 0, g); box(0.1, 3, 0.1, mat(0x8a5a3c), 0, 1.8, 0, g);
          box(0.06, 2.2, 1.5, mat([0xffffff, 0xff6b6b, 0xffd43b][k % 3]), 0, 2, 0.8, g);
          g.position.set(-128 - srand() * 24, 0, -200 + k * 90);
          root.add(g);
          const sp = 1.2 + srand() * 1.4;
          movers.push((dt) => { g.position.z += sp * dt; if (g.position.z > 240) g.position.z = -240; g.rotation.z = Math.sin(time + k) * 0.05; });
        }
      }
      const SPRAWL = style === 'metro' ? [0x7f8fc0, 0x9aa8c9, 0x6c7fb5] : [0xf1e7cf, 0xffd2c4, 0xdfe6f2, 0xffe29a];
      for (let k = 0; k < 120; k++) {
        const [x, z] = ringPoint(115, 250);
        if (style === 'town' && x < -110) continue;
        const h = style === 'town' ? 2.4 + srand() * 3 : 3 + srand() * (style === 'metro' ? 22 : 10), w = 6 + srand() * 6, dd = 6 + srand() * 6;
        prop(x, h / 2, z, w, h, dd, spick(SPRAWL));
        if (style !== 'town' && srand() < 0.5) glow(x, h * 0.6, z + dd / 2 + 0.06, w * 0.5, 0.5, 0.1, 0xffd98a);
      }
      for (let k = 0; k < 40; k++) { const [x, z] = ringPoint(112, 200); if (!(style === 'town' && x < -110)) tree(x, z, 1.3 + srand()); }
      // Railway with a passing train
      const rz = -112;
      prop(0, 0.02, rz, 900, 0.08, 3.6, 0x8d8172);
      prop(0, 0.14, rz - 0.75, 900, 0.1, 0.16, 0x4a4f5e); prop(0, 0.14, rz + 0.75, 900, 0.1, 0.16, 0x4a4f5e);
      const train = new T.Group();
      (style === 'metro' ? [0x3df5ff, 0xf4f6fb, 0xf4f6fb, 0xf4f6fb] : [0xe63946, 0x2f80ed, 0xffc300, 0x06d6a0]).forEach((col, k) => {
        box(7.4, 2.4, 2.4, mat(col), -k * 8, 1.6, 0, train);
        box(7.0, 0.7, 2.44, mat(0x2b3a55), -k * 8, 2.1, 0, train, true);
      });
      train.position.set(-300, 0, rz);
      root.add(train);
      movers.push((dt) => { train.position.x += 26 * dt; if (train.position.x > 420) train.position.x = -420 - rand(100, 500); });
    }
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 6.283 + srand() * 0.3, r = 330 + srand() * 70, s = 50 + srand() * 50;
      const hill = new T.Mesh(geo('hill', () => new T.ConeGeometry(1, 1, 7)), mat(k % 2 ? 0x6fb58a : 0x7fbf8f));
      hill.scale.set(s * 1.6, s * 0.7, s * 1.6);
      hill.position.set(Math.cos(a) * r, s * 0.35 - 2, Math.sin(a) * r);
      root.add(hill);
    }
    [[0xff6b6b, 0xfff7ec], [0x4dabf7, 0xffd43b]].forEach(([c1, c2], k) => {
      const g = new T.Group();
      part(geo('balloon', () => new T.SphereGeometry(2.6, 14, 12)), mat(c1), 0, 0, 0, g).scale.y = 1.2;
      part(geo('bband', () => new T.CylinderGeometry(2.62, 2.62, 0.9, 14, 1, true)), mat(c2), 0, 0.2, 0, g);
      box(1, 0.8, 1, mat(0x9c6b4a), 0, -4, 0, g);
      g.position.set(-90 + k * 120, 40 + k * 6, -70 + k * 90);
      root.add(g);
      movers.push((dt) => {
        g.position.x += (2 + k) * dt; g.position.y = 40 + k * 6 + Math.sin(time * 0.5 + k) * 1.5;
        if (g.position.x > 160) { g.position.x = -160; g.position.z = rand(-100, 100); }
      });
    });
  }

  // =====================================================================
  //  Your land
  // =====================================================================
  let landGroup = null;
  function buildLand(state) {
    const park = state.parks[P];
    const key = park.parcels.join('') + '|' + E.landPrice(state) + '|' + E.parcelCount(state) + '|' + E.maxParcels(state);
    if (key === landKey) return;
    landKey = key;
    if (landGroup) disposeGroup(landGroup);
    landGroup = new T.Group();
    parkRoot.add(landGroup);
    seed = 4242 + P * 31;
    const S = E.PARCEL * CELL, PN = E.PN;
    const paved = texMat('plaza', 256, DRAW.pavers('#f1ddc2', '#c9a985', 4), 4, 4);
    const wild = texMat('wild', 256, DRAW.grass('#8fd46f'), 4, 4);
    const sale = texMat('salegrass', 256, DRAW.grass('#a6e08a'), 4, 4);
    const canExpand = E.parcelCount(state) < E.maxParcels(state);
    for (let k = 0; k < PN * PN; k++) {
      const px = k % PN, py = Math.floor(k / PN), cx = (px + 0.5) * S - HALF, cz = (py + 0.5) * S - HALF;
      const owned = park.parcels[k], adj = !owned && E.parcelAdjacent(park, k);
      const tile = new T.Mesh(boxGeo(), owned ? paved : adj ? sale : wild);
      tile.scale.set(S, 0.12, S); tile.position.set(cx, 0.14, cz); tile.receiveShadow = true;
      landGroup.add(tile);
      if (owned) {
        // hedge on every edge that borders land you don't own
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, ny = py + dy;
          const outside = nx < 0 || ny < 0 || nx >= PN || ny >= PN || !park.parcels[ny * PN + nx];
          if (!outside) continue;
          const ex = cx + dx * (S / 2 - 0.35), ez = cz + dy * (S / 2 - 0.35);
          for (let i = -7; i <= 7; i++) {
            if (Math.abs(i) <= 1 && (nx < 0 || ny < 0 || nx >= PN || ny >= PN)) continue;   // gate to the street
            blob(ex + (dy ? i * 1.05 : 0), 0.62, ez + (dx ? i * 1.05 : 0), 0.52, 0x57c93f);
          }
        }
      } else if (adj) {
        // For sale: a sign with the price, corner stakes with flags
        const tex = makeSaleTex(canExpand ? E.landPrice(state) : -1);
        const board = new T.Mesh(geo('board', () => new T.PlaneGeometry(4.4, 4.4)), new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide }));
        board.position.set(cx, 4.4, cz); board.castShadow = true; board.userData.ownTex = tex;
        landGroup.add(board);
        landGroup.userData['sign' + k] = board;
        for (const x of [-1.6, 1.6]) part(geo('spost', () => new T.CylinderGeometry(0.1, 0.1, 3, 6)), mat(0x8a5a3c), cx + x, 1.6, cz, landGroup);
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          prop(cx + sx * (S / 2 - 1), 0.8, cz + sz * (S / 2 - 1), 0.12, 1.4, 0.12, 0x8a5a3c);
          prop(cx + sx * (S / 2 - 1) + 0.3, 1.3, cz + sz * (S / 2 - 1), 0.6, 0.4, 0.04, 0xff5a4e);
        }
        for (let i = 0; i < 6; i++) blob(cx + rand(-6, 6), 0.35, cz + rand(-6, 6), 0.35, 0x6fbf5a);
      } else {
        // Wild land: trees and bushes
        for (let i = 0; i < 5; i++) tree(cx + (srand() - 0.5) * 12, cz + (srand() - 0.5) * 12, 1 + srand() * 0.8);
        for (let i = 0; i < 6; i++) blob(cx + (srand() - 0.5) * 13, 0.45, cz + (srand() - 0.5) * 13, 0.5 + srand() * 0.4, spick(GREENS));
      }
    }
    flushInstances(landGroup);
  }
  function makeSaleTex(price) {
    let tex;
    tex = canvasTex(256, 256, (g, w, h) => {
      const locked = price < 0, c = locked ? '#8d8aa3' : '#e8452c';
      g.fillStyle = '#fffaf0'; roundRect(g, 6, 6, w - 12, h - 12, 22); g.fill();
      g.lineWidth = 10; g.strokeStyle = c; g.stroke();
      g.fillStyle = c; roundRect(g, 6, 6, w - 12, 62, 22); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
      fitText(g, locked ? 'LOCKED' : 'FOR SALE', w - 40, 38); g.fillText(locked ? 'LOCKED' : 'FOR SALE', w / 2, 40);
      g.fillStyle = '#2b2140';
      const txt = locked ? 'Hall level up' : E.formatMoney(price);
      fitText(g, txt, w - 40, 46); g.fillText(txt, w / 2, 214);
      setTimeout(() => drawIcon(tex, g, locked ? 'lock' : 'land', 78, 76, 100));
    });
    return tex;
  }

  // =====================================================================
  //  Buildings
  // =====================================================================
  function windows(g, w, h, d, y0, floors, skipFront) {
    const list = [];
    const fh = h / floors;
    for (let f = 0; f < floors; f++) {
      const y = y0 + f * fh + fh * 0.55;
      const nf = Math.max(1, Math.floor(w / 1.9)), nd = Math.max(1, Math.floor(d / 2.1));
      for (let k = 0; k < nf; k++) {
        const x = (k + 0.5) / nf * w - w / 2;
        if (!(skipFront && f === 0 && Math.abs(x) < 1.4)) list.push([x, y, d / 2 + 0.02, 0]);
        list.push([x, y, -d / 2 - 0.02, Math.PI]);
      }
      for (let k = 0; k < nd; k++) {
        const z = (k + 0.5) / nd * d - d / 2;
        list.push([w / 2 + 0.02, y, z, Math.PI / 2], [-w / 2 - 0.02, y, z, -Math.PI / 2]);
      }
    }
    const inst = new T.InstancedMesh(geo('win', () => new T.PlaneGeometry(0.95, 1.2)), glassMat, list.length);
    const frame = new T.InstancedMesh(geo('winf', () => new T.PlaneGeometry(1.2, 1.45)), mat(0xfdfaf3), list.length);
    const sill = new T.InstancedMesh(boxGeo(), mat(0xe3ddd2), list.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler();
    list.forEach((w4, k) => {
      q.setFromEuler(e.set(0, w4[3], 0));
      const nx = Math.sin(w4[3]), nz = Math.cos(w4[3]);
      inst.setMatrixAt(k, m4.compose(tmpV.set(w4[0], w4[1], w4[2]), q, tmpV2.set(1, 1, 1)));
      frame.setMatrixAt(k, m4.compose(tmpV.set(w4[0] - nx * 0.01, w4[1], w4[2] - nz * 0.01), q, tmpV2.set(1, 1, 1)));
      sill.setMatrixAt(k, m4.compose(tmpV.set(w4[0] + nx * 0.08, w4[1] - 0.72, w4[2] + nz * 0.08), q, tmpV2.set(1.35, 0.12, 0.22)));
    });
    g.add(frame, inst, sill);
  }
  function wallMat(id, w, h, col) {
    const brick = ['taco', 'pizza', 'burger', 'fish'].includes(id);
    return texMat(brick ? 'brick' : 'plaster', 256, brick ? DRAW.brick : DRAW.plaster, Math.max(1, Math.round(w / (brick ? 2.4 : 3))), Math.max(1, Math.round(h / (brick ? 1.1 : 3))), col);
  }
  function stringLights(g, x1, y, z, x2, n) {
    for (let k = 0; k <= n; k++) {
      const f = k / n;
      part(geo('bulb', () => new T.SphereGeometry(0.09, 6, 5)), bulbMat, x1 + (x2 - x1) * f, y - Math.sin(f * Math.PI) * 0.35, z, g).castShadow = false;
    }
  }
  function signBoard(def, w, h) {
    return once('sign' + def.id + w, () => {
      let tex;
      tex = canvasTex(512, 128, (g, cw, ch) => {
        const col = hex(ACCENT[def.id] || 0x3a86ff);
        g.fillStyle = col; roundRect(g, 4, 4, cw - 8, ch - 8, 26); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; roundRect(g, 14, 12, cw - 28, 30, 14); g.fill();
        g.lineWidth = 8; g.strokeStyle = '#fff7ec'; roundRect(g, 4, 4, cw - 8, ch - 8, 26); g.stroke();
        g.fillStyle = '#fff7ec'; g.beginPath(); g.arc(68, 64, 46, 0, 6.3); g.fill();
        g.textBaseline = 'middle'; g.textAlign = 'left';
        g.fillStyle = 'rgba(0,0,0,.25)'; fitText(g, def.name, cw - 150, 58); g.fillText(def.name, 131, 71);
        g.fillStyle = '#fff7ec'; g.fillText(def.name, 128, 67);
        setTimeout(() => drawIcon(tex, g, def.icon, 28, 24, 80));
      });
      const m = new T.MeshLambertMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
      nightMats.push({ m, max: 0.85 });
      return m;
    });
  }
  function sign(def, g, w, x, y, z) {
    const acc = mat(ACCENT[def.id] || 0x3a86ff);
    return box(w, w / 4, 0.22, [acc, acc, acc, acc, signBoard(def, w), acc], x, y, z, g);
  }
  function person(shirt, opts) { return makePersonMesh(shirt, opts); }

  // --- Mascots on the roofs of restaurants ---
  function mascot(id) {
    const g = new T.Group();
    const cyl = (rt, rb, h, seg) => new T.CylinderGeometry(rt, rb, h, seg || 14);
    const sph = (r) => new T.SphereGeometry(r, 14, 10);
    const add = (geometry, color, x, y, z, sx, sy, sz) => { const m = part(geometry, mat(color), x, y, z, g); if (sx) m.scale.set(sx, sy, sz); return m; };
    switch (id) {
      case 'pizza':
        add(new T.CylinderGeometry(0.75, 0.75, 0.12, 3), 0xffc93d, 0, 0.7, 0).rotation.x = Math.PI / 2 - 0.25;
        add(new T.BoxGeometry(1.3, 0.2, 0.2), 0xd98a3a, 0, 1.12, -0.1);
        [[0, 0.75], [-0.2, 0.45], [0.2, 0.5]].forEach(p => { add(cyl(0.11, 0.11, 0.05, 10), 0xd62828, p[0], p[1] + 0.05, 0.09).rotation.x = Math.PI / 2 - 0.25; });
        break;
      case 'sushi':
        add(new T.BoxGeometry(1.2, 0.42, 0.6), 0xffffff, 0, 0.3, 0); add(new T.BoxGeometry(1.3, 0.24, 0.66), 0xff8c5a, 0, 0.62, 0); add(new T.BoxGeometry(0.26, 0.7, 0.7), 0x1d2b24, 0, 0.42, 0);
        break;
      case 'burger':
        add(cyl(0.6, 0.55, 0.22), 0xe0a050, 0, 0.16, 0); add(cyl(0.66, 0.66, 0.08), 0x51cf66, 0, 0.32, 0); add(cyl(0.6, 0.6, 0.2), 0x6b3a22, 0, 0.46, 0);
        add(new T.BoxGeometry(1.0, 0.06, 1.0), 0xffd43b, 0, 0.6, 0).rotation.y = 0.78; add(sph(0.6), 0xe0a050, 0, 0.64, 0, 1, 0.62, 1);
        break;
      case 'court':
        [[-0.55, 0xe8452c], [0.1, 0x3a86ff], [0.6, 0xffc93d]].forEach(([x, c], k) => { add(cyl(0.03, 0.03, 0.9, 6), 0x7a7f8f, x, 0.45, k === 1 ? 0.3 : -0.15); add(new T.ConeGeometry(0.5, 0.35, 10), c, x, 1.0, k === 1 ? 0.3 : -0.15); });
        break;
      case 'global':
        add(sph(0.62), 0x3a86ff, 0, 0.75, 0);
        [[0.3, 0.95, 0.42], [-0.42, 0.7, 0.36], [0.1, 0.5, -0.52], [-0.2, 1.15, -0.3]].forEach(p => add(sph(0.2), 0x51cf66, p[0], p[1], p[2], 1, 0.9, 0.6));
        add(new T.TorusGeometry(0.85, 0.035, 6, 28), 0xffc93d, 0, 0.75, 0).rotation.x = 1.2;
        break;
      case 'fish':
        add(sph(0.5), 0x4fc3ff, 0, 0.6, 0, 1.6, 0.8, 0.6); add(new T.ConeGeometry(0.4, 0.6, 4), 0x4fc3ff, -0.95, 0.6, 0).rotation.z = Math.PI / 2;
        break;
      default:
        add(cyl(0.62, 0.34, 0.5), ACCENT[id] || 0xe8452c, 0, 0.3, 0); add(sph(0.52), 0xffd166, 0, 0.56, 0, 1, 0.35, 1);
    }
    return g;
  }

  // --- 1 × 1 food stall (gets fancier with level) ---
  function stallModel(def, lv) {
    const g = new T.Group(), acc = ACCENT[def.id] || 0xe8452c;
    box(3.2, 1.0, 1.2, texMat('wood', 128, DRAW.wood, 2, 1), 0, 0.5, 0.4, g);
    box(3.3, 0.22, 1.3, mat(acc), 0, 0.92, 0.4, g);
    for (const x of [-1.5, 1.5]) for (const z of [-0.9, 1.0]) part(geo('post', () => new T.CylinderGeometry(0.06, 0.06, 2.3, 6)), mat(0x7a5a3c), x, 1.15, z, g);
    box(3.8, 0.14, 2.0, awningMat(acc, 5), 0, 2.38, -0.35, g).rotation.x = 0.1;
    stringLights(g, -1.5, 2.25, 1.0, 1.5, 7);
    if (def.id === 'cart') {
      const wheel = geo('wheel', () => new T.CylinderGeometry(0.34, 0.34, 0.12, 12).rotateZ(Math.PI / 2));
      part(wheel, mat(0x2b2118), -1.7, 0.34, 0.4, g); part(wheel, mat(0x2b2118), 1.7, 0.34, 0.4, g);
      part(geo('pot', () => new T.CylinderGeometry(0.32, 0.26, 0.36, 12)), mat(0x8d99ae), -0.9, 1.2, 0.4, g);
    } else if (def.id === 'spice') {
      [0xe8b45a, 0xd9663b, 0xffd23f, 0x8a5a30].forEach((c, k) => {
        part(geo('sack', () => new T.CylinderGeometry(0.28, 0.34, 0.5, 8)), mat(0xd9c3a0), -1.2 + k * 0.8, 1.25, 0.4, g);
        part(geo('sackTop', () => new T.ConeGeometry(0.3, 0.25, 8)), mat(c), -1.2 + k * 0.8, 1.6, 0.4, g);
      });
    } else {
      box(0.7, 0.5, 0.6, mat(0xc99b66), -1.0, 1.26, 0.35, g);
      box(0.5, 0.36, 0.5, mat(0xddb67c), 0.9, 1.2, 0.4, g);
    }
    for (const x of [-0.8, 0.2]) part(geo('stool', () => new T.CylinderGeometry(0.2, 0.16, 0.5, 8)), mat(acc), x, 0.25, 1.6, g);
    // food waiting on the counter
    const FOOD = { cart: 0xf2c94c, dumpling: 0xfff1d6, tea: 0xc99bff, spice: 0xd9663b };
    for (const x of [-0.3, 0.25, 0.8]) {
      part(geo('bowl', () => new T.CylinderGeometry(0.2, 0.13, 0.14, 12)), mat(0xffffff), x, 1.12, 0.85, g).castShadow = false;
      part(geo('bowlFood', () => new T.SphereGeometry(0.17, 10, 6, 0, 6.3, 0, 1.3)), mat(FOOD[def.id] || 0xffb35c), x, 1.17, 0.85, g).castShadow = false;
    }
    const chef = person(0xffffff, { hat: true, plain: true });
    chef.position.set(0.35, 0, -0.5);
    g.add(chef);
    g.userData.chef = chef;
    if (lv >= 5) {   // a menu board, lanterns and crates
      box(0.7, 1.0, 0.08, mat(0x2b2118), 1.6, 0.6, 1.4, g).rotation.x = -0.2;
      for (const x of [-1.9, 1.9]) part(geo('lantern', () => new T.SphereGeometry(0.2, 8, 6)), bulbMat, x, 2.0, 1.0, g).castShadow = false;
      box(0.5, 0.4, 0.5, mat(0xc99b66), -1.6, 0.2, 1.4, g);
    }
    if (lv >= 10) {  // a roof sign with the shop's icon, gold trim
      box(3.9, 0.12, 0.12, mat(0xffcf2e), 0, 2.5, 0.65, g, true);
      const s = sprite(iconTex(def.icon), 1.4, 1.4, { depthTest: true });
      s.position.set(0, 3.4, -0.3);
      g.add(s);
      g.userData.bob = s;
    }
    return g;
  }

  // --- Food truck (Taco Truck, 1 × 2) ---
  function truckModel(def, lv) {
    const g = new T.Group(), acc = ACCENT[def.id];
    box(2.8, 2.4, 5.6, mat(0xfff3c4), 0, 1.75, -0.4, g);
    box(2.82, 0.5, 5.62, mat(acc), 0, 0.85, -0.4, g, true);
    box(2.6, 1.6, 1.8, mat(acc), 0, 1.3, 3.2, g);   // cab
    box(2.62, 0.7, 1.0, mat(0x6fa8dc), 0, 1.75, 3.6, g, true);
    box(0.08, 1.1, 3.2, mat(0x2b2118), 1.42, 1.9, -0.6, g, true);   // serving hatch
    box(0.08, 0.9, 3.0, mat(0xffe29a, { emissive: 0xffb84d, emissiveIntensity: 0.3 }), 1.43, 1.9, -0.6, g, true);
    box(1.2, 0.1, 3.4, awningMat(acc, 6), 2.0, 2.7, -0.6, g).rotation.z = -0.3;
    box(0.6, 0.12, 3.2, mat(0xdfe6ef), 1.7, 1.35, -0.6, g);   // counter
    const wheel = geo('twheel', () => new T.CylinderGeometry(0.5, 0.5, 0.35, 14).rotateZ(Math.PI / 2));
    for (const sx of [-1.35, 1.35]) for (const sz of [-2.2, 2.8]) part(wheel, mat(0x1d1f27), sx, 0.5, sz, g);
    sign(def, g, 2.8, 0, 3.3, -0.4).rotation.y = Math.PI / 2;
    const chef = person(0xffffff, { hat: true, plain: true });
    chef.position.set(0.6, 0.85, -0.6); chef.rotation.y = Math.PI / 2;
    g.add(chef);
    g.userData.chef = chef;
    for (let k = 0; k < (lv >= 5 ? 3 : 1); k++) part(geo('stool', () => new T.CylinderGeometry(0.2, 0.16, 0.5, 8)), mat(acc), 2.6, 0.25, -1.8 + k * 1.2, g);
    g.rotation.y = 0;
    return g;
  }

  // --- Restaurant buildings (2 × 2 and 3 × 3), taller with level ---
  function restaurantModel(def, lv, size) {
    const g = new T.Group(), acc = ACCENT[def.id] || 0x3a86ff, wall = WALL[def.id] || 0xfff1d6;
    const fw = size * CELL - 1.2;
    const floors = Math.min(size === 2 ? 3 : 5, 1 + Math.floor(lv / 5));
    let y = 0;
    const segs = [];
    for (let f = 0; f < floors; f++) {
      const shrink = f === 0 ? 0 : Math.min(2.4, f * 0.9);
      segs.push({ w: fw - shrink, d: fw - 0.8 - shrink, h: f === 0 ? 3.6 : 3.1 });
    }
    segs.forEach((s, k) => {
      box(s.w, s.h, s.d, wallMat(def.id, s.w, s.h, wall), 0, y + s.h / 2, 0, g);
      box(s.w + 0.4, 0.3, s.d + 0.4, mat(acc), 0, y + s.h + 0.15, 0, g);
      box(s.w - 0.5, 0.06, s.d - 0.5, texMat('gravel', 128, DRAW.gravel, 3, 3), 0, y + s.h + 0.32, 0, g, true);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.3, s.h, 0.3, mat(acc), sx * s.w / 2, y + s.h / 2, sz * s.d / 2, g, true);
      windows(g, s.w, s.h, s.d, y, k === 0 ? 1 : 1, k === 0);
      y += s.h + 0.3;
    });
    const base = segs[0], fz = base.d / 2;
    box(1.6, 2.4, 0.14, mat(0x4a3428), 0, 1.2, fz + 0.05, g, true);
    box(base.w * 0.9, 0.16, 1.6, awningMat(acc, Math.round(base.w)), 0, 3.0, fz + 0.65, g).rotation.x = 0.28;
    stringLights(g, -base.w * 0.45, 2.6, fz + 1.4, base.w * 0.45, Math.round(base.w * 1.2));
    sign(def, g, Math.min(base.w * 0.8, 7), 0, 4.5, fz + 0.14);
    for (const x of [-1.6, 1.6]) { box(0.6, 0.5, 0.6, mat(0xf4f6fb), x, 0.25, fz + 0.5, g); part(geo('bush', () => new T.IcosahedronGeometry(0.42, 1)), mat(0x6fdc4a), x, 0.75, fz + 0.5, g); }
    part(geo('vent', () => new T.CylinderGeometry(0.22, 0.22, 0.6, 10)), mat(0xb9c3d6), segs[floors - 1].w * 0.28, y + 0.25, -segs[floors - 1].d * 0.25, g);
    box(1.1, 0.6, 0.9, mat(0xdfe6e9), -segs[floors - 1].w * 0.25, y + 0.3, -segs[floors - 1].d * 0.2, g);
    if (lv >= 5) for (const x of [-base.w / 2 + 0.6, base.w / 2 - 0.6]) {   // café tables
      part(geo('tpole', () => new T.CylinderGeometry(0.04, 0.04, 1.9, 6)), mat(0x7a7f8f), x, 0.95, fz + 2.3, g);
      part(geo('umb', () => new T.ConeGeometry(0.95, 0.42, 10)), mat(acc), x, 2.0, fz + 2.3, g);
      part(geo('ttop', () => new T.CylinderGeometry(0.5, 0.5, 0.07, 12)), mat(0xfff7ec), x, 0.78, fz + 2.3, g);
    }
    if (lv >= 15) for (const x of [-base.w / 2 + 0.9, base.w / 2 - 0.9]) box(0.9, 4.4, 0.1, mat(acc), x, base.h + 2.8, segs[1] ? segs[1].d / 2 + 0.08 : fz + 0.1, g, true);
    const m = mascot(def.id);
    m.scale.setScalar(size === 3 ? 3.4 : 2.4);
    m.position.set(0, y, 0);
    g.add(m);
    g.userData.mascot = m;
    return g;
  }

  // --- The Market Hall: grows from a modest hall into a grand palace of food ---
  function hallModel(lv) {
    const g = new T.Group();
    const stage = lv >= 15 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0;
    const w = 7.2, d = 6.6, h = 3.6 + stage * 1.2;
    const wall = mat(0xfff1d6), roofC = [0xe8452c, 0x3a6ff0, 0x2e9e6b, 0x6b4fd6][stage];
    box(w + 0.6, 0.4, d + 0.6, mat(0xd9dde6), 0, 0.2, 0, g);   // plinth
    box(w, h, d, wallMat('hall', w, h, 0xfff1d6), 0, 0.4 + h / 2, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.5, h, 0.5, mat(0xffcf2e), sx * w / 2, 0.4 + h / 2, sz * d / 2, g, true);
    windows(g, w, h, d, 0.4, stage >= 1 ? 2 : 1, true);
    // grand doors with steps
    box(2.4, 2.8, 0.2, mat(0x8a5a3c), 0, 1.8, d / 2 + 0.05, g, true);
    box(2.8, 0.3, 0.2, mat(0xffcf2e), 0, 3.3, d / 2 + 0.08, g, true);
    for (let k = 0; k < 3; k++) box(3.6 - k * 0.3, 0.2, 0.6, mat(0xe9edf5), 0, 0.1 + k * 0.2, d / 2 + 1.0 - k * 0.3, g);
    // roof
    const roof = part(geo('hallroof', () => new T.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4)), mat(roofC), 0, 0.4 + h + 1.2, 0, g);
    roof.scale.set(w + 1.2, 2.4, d + 1.2);
    box(w + 0.8, 0.3, d + 0.8, mat(0xffcf2e), 0, 0.4 + h + 0.15, 0, g);
    // clock tower
    const th = 2.6 + stage * 1.6;
    box(2, th, 2, wall, 0, 0.4 + h + 1.6 + th / 2, 0, g);
    const clock = canvasTex(128, 128, (c) => {
      c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(64, 64, 58, 0, 6.3); c.fill();
      c.lineWidth = 8; c.strokeStyle = '#2b1d3a'; c.stroke();
      c.lineCap = 'round'; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 24); c.moveTo(64, 64); c.lineTo(92, 70); c.stroke();
    });
    for (let k = 0; k < 4; k++) {
      const face = new T.Mesh(geo('clock', () => new T.CircleGeometry(0.7, 20)), new T.MeshLambertMaterial({ map: clock }));
      face.userData.ownTex = k === 0 ? clock : null;
      const a = k * Math.PI / 2;
      face.position.set(Math.sin(a) * 1.02, 0.4 + h + 1.6 + th - 0.9, Math.cos(a) * 1.02);
      face.rotation.y = a;
      g.add(face);
    }
    const spire = part(geo('spire', () => new T.ConeGeometry(1.5, 2.6, 4).rotateY(Math.PI / 4)), mat(roofC), 0, 0.4 + h + 1.6 + th + 1.3, 0, g);
    void spire;
    part(geo('ball', () => new T.SphereGeometry(0.3, 10, 8)), mat(0xffcf2e), 0, 0.4 + h + 1.6 + th + 2.8, 0, g);
    // flags and banners by level
    const flags = Math.min(4, 1 + stage);
    for (let k = 0; k < flags; k++) {
      const x = -w / 2 + 0.5 + k * (w - 1) / Math.max(1, flags - 1);
      box(0.08, 2.4, 0.08, mat(0x8d99ae), x, 0.4 + h + 1.4, d / 2 - 0.2, g, true);
      box(0.9, 0.6, 0.04, mat([0xff4d5e, 0x3ddc84, 0x3a86ff, 0xffcf2e][k]), x + 0.5, 0.4 + h + 2.3, d / 2 - 0.2, g, true);
    }
    if (stage >= 1) for (const x of [-w / 2 - 0.2, w / 2 + 0.2]) box(0.12, h * 0.8, 1.2, mat(roofC), x, 0.4 + h * 0.55, d / 2 - 1.2, g, true);
    if (stage >= 2) for (const x of [-w / 2, w / 2]) {   // corner turrets
      part(geo('turret', () => new T.CylinderGeometry(0.7, 0.7, 2, 12)), wall, x, 0.4 + h + 1, -d / 2, g);
      part(geo('turretTop', () => new T.ConeGeometry(0.9, 1.4, 12)), mat(roofC), x, 0.4 + h + 2.7, -d / 2, g);
    }
    if (stage >= 3) { // golden dome
      part(geo('dome', () => new T.SphereGeometry(1.3, 16, 10, 0, 6.283, 0, 1.6)), mat(0xffcf2e), 0, 0.4 + h + 1.6 + th + 0.2, 0, g);
    }
    stringLights(g, -w / 2, 0.4 + h - 0.3, d / 2 + 0.3, w / 2, 10);
    for (const x of [-2.2, 2.2]) { box(0.6, 0.6, 0.6, mat(0xf4f6fb), x, 0.3, d / 2 + 1.4, g); part(geo('bush', () => new T.IcosahedronGeometry(0.42, 1)), mat(0x6fdc4a), x, 0.85, d / 2 + 1.4, g); }
    return g;
  }

  // --- Supply buildings ---
  function gardenModel(lv) {
    const g = new T.Group();
    const soil = texMat('soil', 128, DRAW.soil, 2, 2);
    const rows = 3, plant = 0.4 + Math.min(1, lv / 10) * 0.5;
    for (let r = 0; r < rows; r++) {
      const z = -2.4 + r * 2.4;
      box(6.6, 0.4, 1.6, texMat('wood', 128, DRAW.wood, 4, 1), 0, 0.2, z, g);
      box(6.3, 0.1, 1.3, soil, 0, 0.42, z, g, true);
      for (let k = 0; k < 7; k++) {
        const crop = [0x51cf66, 0x3a9e4a, 0x8be85a][r];
        part(geo('crop', () => new T.IcosahedronGeometry(0.32, 0)), mat(crop), -2.8 + k * 0.93, 0.5 + plant * 0.3, z, g).scale.setScalar(plant * 1.4);
        if (lv >= 3 && (k + r) % 2 === 0) part(geo('veg', () => new T.SphereGeometry(0.16, 6, 5)), mat([0xff4d4d, 0xff922b, 0xffd23f][r]), -2.8 + k * 0.93 + 0.2, 0.6 + plant * 0.3, z + 0.25, g).castShadow = false;
      }
    }
    // fence and a scarecrow
    for (let k = 0; k <= 8; k++) { box(0.12, 0.8, 0.12, mat(0xfff7ec), -3.6 + k * 0.9, 0.4, 3.6, g, true); box(0.12, 0.8, 0.12, mat(0xfff7ec), -3.6 + k * 0.9, 0.4, -3.6, g, true); }
    box(7.4, 0.1, 0.08, mat(0xfff7ec), 0, 0.6, 3.6, g, true); box(7.4, 0.1, 0.08, mat(0xfff7ec), 0, 0.6, -3.6, g, true);
    if (lv >= 2) {
      box(0.12, 2.2, 0.12, mat(0x8a5a3c), 3.1, 1.1, 0, g); box(1.4, 0.12, 0.12, mat(0x8a5a3c), 3.1, 1.6, 0, g);
      part(geo('scHead', () => new T.SphereGeometry(0.28, 8, 6)), mat(0xf2d06b), 3.1, 2.4, 0, g);
      part(geo('scHat', () => new T.ConeGeometry(0.42, 0.4, 8)), mat(0x8a5a3c), 3.1, 2.75, 0, g);
    }
    if (lv >= 5) { part(geo('can', () => new T.CylinderGeometry(0.25, 0.3, 0.5, 10)), mat(0x3a86ff), -3.1, 0.25, 3.0, g); box(0.8, 0.5, 0.6, mat(0xc99b66), -2.2, 0.25, 3.0, g); }
    return g;
  }
  function fishModel(def, lv) {
    const g = restaurantModel(def, Math.min(lv, 9), 2);
    for (let k = 0; k < 3; k++) { box(0.9, 0.4, 0.7, mat(0x3a86ff), -1.6 + k * 1.1, 0.2, 3.9, g); box(0.8, 0.12, 0.6, mat(0xe9f5ff), -1.6 + k * 1.1, 0.45, 3.9, g, true); }
    return g;
  }
  function greenhouseModel(lv) {
    const g = new T.Group();
    const glass = once('ghGlass', () => new T.MeshLambertMaterial({ color: 0xc7f0ff, transparent: true, opacity: 0.45, depthWrite: false }));
    box(10.8, 0.3, 6.8, mat(0xd9dde6), 0, 0.15, 0, g);
    const walls = box(10.2, 3, 6.2, glass, 0, 1.8, 0, g, true);
    walls.castShadow = false;
    const roof = part(geo('ghroof', () => new T.CylinderGeometry(3.1, 3.1, 10.2, 3, 1, true).rotateZ(Math.PI / 2)), glass, 0, 3.6, 0, g);
    roof.scale.set(1, 0.55, 1); roof.castShadow = false;
    for (let k = -2; k <= 2; k++) box(0.12, 3, 6.3, mat(0xfdfaf3), k * 2.5, 1.8, 0, g, true);
    for (let r = -1; r <= 1; r++) for (let k = 0; k < 8; k++) part(geo('crop', () => new T.IcosahedronGeometry(0.32, 0)), mat(0x3ddc84), -4.2 + k * 1.2, 0.6, r * 1.8, g).scale.setScalar(1 + Math.min(1, lv / 10));
    return g;
  }

  // --- v4 farms, ponds, barn and warehouse (all made in code) ---
  const dummy = new T.Object3D();
  // Many copies of one small mesh in a single draw call.
  function scatter(g, geometry, material, list, shadow) {
    const im = new T.InstancedMesh(geometry, material, list.length);
    list.forEach((p, k) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.rotation.set(p[4] || 0, p[5] || 0, p[6] || 0);
      dummy.scale.setScalar(p[3] || 1);
      dummy.updateMatrix();
      im.setMatrixAt(k, dummy.matrix);
    });
    im.castShadow = !!shadow; im.receiveShadow = true;
    g.add(im);
    return im;
  }
  function fenceAround(g, w, d, color) {
    const c = mat(color || 0xfff7ec), hw = w / 2, hd = d / 2;
    const posts = [];
    for (let x = -hw; x <= hw + 0.01; x += w / Math.round(w / 1.2)) posts.push([x, 0.4, -hd], [x, 0.4, hd]);
    for (let z = -hd + d / Math.round(d / 1.2); z < hd - 0.01; z += d / Math.round(d / 1.2)) posts.push([-hw, 0.4, z], [hw, 0.4, z]);
    scatter(g, geo('fpost', () => new T.BoxGeometry(0.14, 0.8, 0.14)), c, posts, true);
    for (const z of [-hd, hd]) for (const y of [0.35, 0.65]) box(w, 0.07, 0.06, c, 0, y, z, g, true);
    for (const x of [-hw, hw]) for (const y of [0.35, 0.65]) box(0.06, 0.07, d, c, x, y, 0, g, true);
  }
  function scarecrow(g, x, z) {
    box(0.12, 2.2, 0.12, mat(0x8a5a3c), x, 1.1, z, g); box(1.4, 0.12, 0.12, mat(0x8a5a3c), x, 1.6, z, g);
    box(0.5, 0.7, 0.3, mat(0x3a86ff), x, 1.45, z, g);
    part(geo('scHead', () => new T.SphereGeometry(0.28, 8, 6)), mat(0xf2d06b), x, 2.2, z, g);
    part(geo('scHat', () => new T.ConeGeometry(0.42, 0.4, 8)), mat(0x8a5a3c), x, 2.55, z, g);
  }
  function hayBale(g, x, z, r) {
    const m = part(geo('hay', () => new T.CylinderGeometry(0.5, 0.5, 0.8, 14).rotateZ(Math.PI / 2)), mat(0xe8c15a), x, 0.5, z, g);
    m.rotation.y = r || 0;
    return m;
  }
  function tractor(g, x, z, ry) {
    const t = new T.Group();
    box(1.4, 0.6, 0.9, mat(0xe8452c), 0.2, 0.75, 0, t); box(0.7, 0.8, 0.8, mat(0xe8452c), -0.45, 1.15, 0, t);
    box(0.62, 0.5, 0.82, glassMat, -0.45, 1.3, 0, t, true);
    box(0.08, 0.6, 0.08, mat(0x333333), 0.6, 1.3, 0.2, t);
    const wb = geo('twheelB', () => new T.CylinderGeometry(0.55, 0.55, 0.3, 14).rotateX(Math.PI / 2));
    const ws = geo('twheelS', () => new T.CylinderGeometry(0.32, 0.32, 0.25, 12).rotateX(Math.PI / 2));
    for (const s of [-1, 1]) { part(wb, mat(0x2b2118), -0.45, 0.55, s * 0.55, t); part(ws, mat(0x2b2118), 0.7, 0.32, s * 0.5, t); }
    t.position.set(x, 0, z); t.rotation.y = ry || 0;
    g.add(t);
    return t;
  }
  function fieldModel(lv) {
    const g = new T.Group();
    box(7.6, 0.3, 7.6, texMat('soil', 128, DRAW.soil, 3, 3), 0, 0.15, 0, g);
    const h = 0.55 + Math.min(1, lv / 8) * 0.55, list = [];
    for (let r = 0; r < 6; r++) for (let k = 0; k < 10; k++) list.push([-3.2 + k * 0.71 + (r % 2) * 0.2, 0.3 + h * 0.5, -3.0 + r * 1.2, 1, 0, Math.random() * 3, (Math.random() - 0.5) * 0.25]);
    const stalk = geo('wheat', () => { const c = new T.ConeGeometry(0.28, 1, 6); return c; });
    const ears = scatter(g, stalk, mat(0xf2c94c), list.map(p => [p[0], p[1], p[2], 1, p[4], p[5], p[6]]), true);
    ears.scale.y = h;
    ears.position.y = -(h - 1) * 0.25;
    fenceAround(g, 7.8, 7.8, 0xfff1d6);
    hayBale(g, 3.1, 3.2, 0.3);
    if (lv >= 3) scarecrow(g, -0.1, 0.6);
    if (lv >= 5) tractor(g, -2.6, 3.4, 0.2);
    g.userData.sway = ears;
    return g;
  }
  function vegGardenModel(lv) {
    const g = gardenModel(lv);
    return g;
  }
  function orchardModel(lv) {
    const g = new T.Group();
    box(7.6, 0.3, 7.6, texMat('grass', 128, DRAW.grass('#62c24a'), 3, 3), 0, 0.15, 0, g);
    const n = lv >= 4 ? 9 : 4, sp = n === 9 ? 2.4 : 3.2, start = n === 9 ? -2.4 : -1.6, fruit = [];
    const trunk = geo('otrunk', () => new T.CylinderGeometry(0.16, 0.24, 1.6, 7));
    const crown = geo('ocrown', () => new T.IcosahedronGeometry(1.05, 1));
    for (let i = 0; i < n; i++) {
      const x = start + (i % Math.sqrt(n)) * sp, z = start + Math.floor(i / Math.sqrt(n)) * sp;
      part(trunk, mat(0x8a5a3c), x, 1.1, z, g);
      const c = part(crown, mat(0x3fae4a), x, 2.3, z, g);
      c.scale.set(1, 0.85, 1);
      for (let k = 0; k < 7; k++) { const a = k * 0.9 + i, r = 0.95; fruit.push([x + Math.cos(a) * r * 0.9, 2.1 + Math.sin(k * 2.1) * 0.45, z + Math.sin(a) * r * 0.9, 1]); }
    }
    scatter(g, geo('ofruit', () => new T.SphereGeometry(0.14, 7, 5)), mat(0xff4d5e, { emissive: 0x330000 }), fruit);
    fenceAround(g, 7.8, 7.8, 0xd9b38c);
    for (let k = 0; k < 2; k++) { box(0.7, 0.4, 0.5, mat(0xc99b66), 2.6 - k * 0.9, 0.5, 3.3, g); scatter(g, geo('ofruit', () => new T.SphereGeometry(0.14, 7, 5)), mat(0xff4d5e), [[2.45 - k * 0.9, 0.75, 3.25], [2.7 - k * 0.9, 0.75, 3.35], [2.6 - k * 0.9, 0.82, 3.3]]); }
    if (lv >= 3) { const l = box(0.08, 2.2, 0.5, mat(0xd9a66c), -0.4, 1.2, 0.5, g); l.rotation.z = 0.35; }
    return g;
  }
  function paddyModel(lv) {
    const g = new T.Group();
    box(7.6, 0.2, 7.6, mat(0x8a6a3c), 0, 0.1, 0, g);
    const water = texMat('water', 128, DRAW.water, 2, 2);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) box(3.4, 0.1, 3.4, water, -1.8 + i * 3.6, 0.24, -1.8 + j * 3.6, g, true);
    for (const c of [-3.7, 0, 3.7]) { box(7.6, 0.35, 0.3, mat(0x7c9a4a), 0, 0.3, c, g, true); box(0.3, 0.35, 7.6, mat(0x7c9a4a), c, 0.3, 0, g, true); }
    const h = 0.4 + Math.min(1, lv / 8) * 0.4, list = [];
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) list.push([-3.1 + i * 3.6 + a * 0.62, 0.3 + h / 2, -3.1 + j * 3.6 + b * 0.62, 1, 0, Math.random() * 3]);
    const shoots = scatter(g, geo('shoot', () => new T.ConeGeometry(0.16, 1, 5)), mat(0x7fdc5a), list, false);
    shoots.scale.y = h;
    g.userData.sway = shoots;
    if (lv >= 3) {   // a little stilt hut
      for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) box(0.1, 1.2, 0.1, mat(0x8a5a3c), 3.0 + x, 0.6, 3.0 + z, g);
      box(1.3, 0.1, 1.3, mat(0xc99b66), 3.0, 1.2, 3.0, g);
      const roof = part(geo('hutroof', () => new T.ConeGeometry(1.1, 0.8, 4)), mat(0xe0b062), 3.0, 1.75, 3.0, g); roof.rotation.y = Math.PI / 4;
    }
    return g;
  }
  function spiceModel(lv) {
    const g = new T.Group();
    box(3.6, 0.3, 3.6, texMat('soil', 128, DRAW.soil, 1, 1), 0, 0.15, 0, g);
    const COLS = [0xe8452c, 0xffb21f, 0x6fbf3a, 0xd9663b];
    for (let r = 0; r < 3; r++) {
      box(3.2, 0.3, 0.7, texMat('wood', 128, DRAW.wood, 2, 1), 0, 0.42, -1.1 + r * 1.1, g);
      const list = [];
      for (let k = 0; k < 6; k++) list.push([-1.3 + k * 0.52, 0.75, -1.1 + r * 1.1, 0.9 + Math.random() * 0.3]);
      scatter(g, geo('leaf', () => new T.IcosahedronGeometry(0.3, 0)), mat(0x4caf50), list, true);
      scatter(g, geo('chili', () => new T.ConeGeometry(0.06, 0.26, 5)), mat(COLS[r]), list.map(p => [p[0] + 0.1, p[1] + 0.25, p[2], 1, Math.PI]), false);
    }
    if (lv >= 2) [0xe8b45a, 0xd9663b].forEach((c, k) => { part(geo('sack', () => new T.CylinderGeometry(0.22, 0.28, 0.42, 8)), mat(0xd9c3a0), 1.4, 0.5, -1.4 + k * 0.6, g); part(geo('sackTop', () => new T.ConeGeometry(0.24, 0.2, 8)), mat(c), 1.4, 0.8, -1.4 + k * 0.6, g); });
    return g;
  }
  function animal(kind) {
    const a = new T.Group(), cow = kind === 'cow';
    const body = box(cow ? 1.3 : 0.9, cow ? 0.7 : 0.55, cow ? 0.65 : 0.55, mat(cow ? 0xffffff : 0xffa8b8), 0, cow ? 0.85 : 0.55, 0, a);
    body.castShadow = true;
    box(cow ? 0.5 : 0.45, cow ? 0.5 : 0.42, cow ? 0.5 : 0.45, mat(cow ? 0xffffff : 0xffa8b8), cow ? 0.8 : 0.55, cow ? 1.05 : 0.65, 0, a);
    box(0.18, 0.2, cow ? 0.36 : 0.26, mat(cow ? 0xffb3b3 : 0xff7f99), cow ? 1.07 : 0.8, cow ? 0.95 : 0.6, 0, a, true);
    if (cow) { box(0.4, 0.3, 0.66, mat(0x2b2118), -0.2, 1.0, 0, a, true); box(0.3, 0.25, 0.3, mat(0x2b2118), 0.3, 0.75, 0.2, a, true); }
    const leg = geo(cow ? 'cleg' : 'pleg', () => new T.BoxGeometry(0.14, cow ? 0.55 : 0.32, 0.14));
    for (const x of [-0.4, 0.4]) for (const z of [-0.22, 0.22]) part(leg, mat(cow ? 0xffffff : 0xffa8b8), x * (cow ? 1 : 0.7), cow ? 0.28 : 0.16, z * (cow ? 1 : 0.8), a).castShadow = false;
    a.userData.animal = true;
    return a;
  }
  function barnModel(lv) {
    const g = new T.Group();
    box(7.6, 0.3, 11.6, texMat('grass', 128, DRAW.grass('#6cc04a'), 3, 4), 0, 0.15, 0, g);
    box(7.4, 0.08, 6.6, texMat('gravel', 128, DRAW.gravel, 3, 3), 0, 0.32, 2.3, g, true);
    // the barn
    const red = mat(0xc8402f), white = mat(0xfff7ec);
    box(5.2, 3.0, 4.0, red, 0, 1.8, -3.4, g);
    const roof = part(geo('barnroof', () => new T.CylinderGeometry(2.9, 2.9, 4.4, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4)), mat(0x5a4a44), 0, 3.3, -3.4, g);
    roof.scale.set(1, 0.62, 0.78);
    box(2.0, 2.2, 0.12, white, 0, 1.4, -1.36, g);
    box(1.7, 1.9, 0.08, mat(0xa83426), 0, 1.4, -1.3, g, true);
    const x1 = box(0.12, 2.4, 0.06, white, 0, 1.4, -1.24, g, true); x1.rotation.z = 0.72;
    const x2 = box(0.12, 2.4, 0.06, white, 0, 1.4, -1.24, g, true); x2.rotation.z = -0.72;
    box(0.8, 0.8, 0.1, white, 0, 3.5, -1.36, g, true);
    if (lv >= 3) { part(geo('silo', () => new T.CylinderGeometry(0.9, 0.9, 4.6, 14)), mat(0xd9dde6), 3.0, 2.6, -4.4, g); part(geo('silotop', () => new T.SphereGeometry(0.9, 14, 8, 0, 6.3, 0, 1.6)), mat(0x9aa3b5), 3.0, 4.9, -4.4, g); }
    const fenceGroup = new T.Group();
    fenceAround(fenceGroup, 7.2, 6.4, 0xfff7ec);
    fenceGroup.position.z = 2.4;
    g.add(fenceGroup);
    box(1.2, 0.4, 0.5, mat(0x8a5a3c), -2.6, 0.5, 4.6, g);
    box(1.1, 0.12, 0.4, mat(0x6fb6ff), -2.6, 0.72, 4.6, g, true);
    const herd = [];
    const n = Math.min(6, 2 + Math.floor(lv / 2));
    for (let k = 0; k < n; k++) {
      const a = animal(k % 3 === 2 ? 'pig' : 'cow');
      a.position.set(-2 + (k % 3) * 2, 0.3, 1.0 + Math.floor(k / 3) * 2.4);
      a.rotation.y = Math.random() * 6.28;
      a.userData.home = [a.position.x, a.position.z];
      g.add(a); herd.push(a);
    }
    g.userData.herd = herd;
    hayBale(g, 2.8, 4.6, 0.4);
    return g;
  }
  function pondModel(lv) {
    const g = new T.Group();
    box(7.6, 0.3, 7.6, texMat('grass', 128, DRAW.grass('#5fbf55'), 3, 3), 0, 0.15, 0, g);
    part(geo('pondrim', () => new T.CylinderGeometry(3.5, 3.6, 0.2, 28)), mat(0xb9a07a), 0, 0.32, 0, g).castShadow = false;
    const w = part(geo('pondwater', () => new T.CircleGeometry(3.25, 28).rotateX(-Math.PI / 2)), texMat('water', 128, DRAW.water, 2, 2), 0, 0.44, 0, g);
    w.castShadow = false; w.receiveShadow = true;
    const pads = [];
    for (let k = 0; k < 7; k++) { const a = k * 0.9, r = 1.4 + (k % 3) * 0.6; pads.push([Math.cos(a) * r, 0.47, Math.sin(a) * r, 1]); }
    scatter(g, geo('lily', () => new T.CylinderGeometry(0.3, 0.3, 0.03, 10)), mat(0x3fae4a), pads);
    const reeds = [];
    for (let k = 0; k < 18; k++) { const a = 2.2 + k * 0.12, r = 3.3; reeds.push([Math.cos(a) * r, 0.75, Math.sin(a) * r, 1, (Math.random() - 0.5) * 0.3]); }
    scatter(g, geo('reed', () => new T.CylinderGeometry(0.03, 0.05, 0.9, 4)), mat(0x5c8a2e), reeds);
    // a wooden dock
    box(0.9, 0.12, 2.6, texMat('wood', 128, DRAW.wood, 1, 2), 2.3, 0.6, 2.2, g);
    for (const z of [1.2, 2.2, 3.2]) box(0.12, 0.6, 0.12, mat(0x7a5a3c), 2.75, 0.3, z, g);
    if (lv >= 3) { const boat = new T.Group(); box(1.4, 0.3, 0.6, mat(0xffffff), 0, 0, 0, boat); box(1.2, 0.08, 0.5, mat(0x3a86ff), 0, 0.17, 0, boat, true); boat.position.set(-1.2, 0.55, 1.2); boat.rotation.y = 0.6; g.add(boat); g.userData.boat = boat; }
    // fish that jump out of the water now and then
    const fish = [];
    for (let k = 0; k < 2; k++) { const f = part(geo('jfish', () => new T.SphereGeometry(0.22, 8, 6)), mat(0xff922b), 0, -1, 0, g); f.scale.set(1.6, 0.8, 0.6); f.castShadow = false; f.userData.t = Math.random() * 4; fish.push(f); }
    g.userData.fish = fish;
    return g;
  }
  function warehouseModel(lv) {
    const g = new T.Group();
    box(7.6, 0.3, 7.6, texMat('asphalt', 128, DRAW.asphalt, 2, 2), 0, 0.15, 0, g);
    box(6.0, 3.0, 5.0, mat(0x9fb3c8), 0, 1.8, -0.8, g);
    const roof = part(geo('whroof', () => new T.CylinderGeometry(2.6, 2.6, 6.2, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)), mat(0x6f8299), 0, 3.3, -0.8, g);
    roof.scale.set(1, 0.5, 1);
    box(3.0, 2.4, 0.12, mat(0x55657a), 0, 1.5, 1.72, g, true);
    for (let k = 0; k < 6; k++) box(2.9, 0.06, 0.04, mat(0x46546a), 0, 0.6 + k * 0.38, 1.79, g, true);
    box(6.1, 0.2, 0.1, mat(0xffcf2e), 0, 3.2, 1.72, g, true);
    const crate = geo('crate', () => new T.BoxGeometry(0.7, 0.7, 0.7)), wood = texMat('wood', 128, DRAW.wood, 1, 1);
    const n = Math.min(8, 3 + lv);
    for (let k = 0; k < n; k++) part(crate, wood, -2.6 + (k % 4) * 0.8, 0.65 + Math.floor(k / 4) * 0.7, 2.9, g);
    box(1.2, 0.12, 1.2, mat(0xc99b66), 2.4, 0.36, 2.9, g);
    if (lv >= 3) {   // forklift
      const f = new T.Group();
      box(0.9, 0.6, 1.2, mat(0xffb21f), 0, 0.6, 0, f); box(0.8, 0.9, 0.1, mat(0x333333), 0, 1.3, -0.5, f, true);
      for (const x of [-0.25, 0.25]) box(0.1, 1.6, 0.1, mat(0x333333), x, 1.0, 0.68, f);
      box(0.6, 0.06, 0.8, mat(0x333333), 0, 0.3, 1.1, f, true);
      f.position.set(2.4, 0.2, 1.0); f.rotation.y = -0.4;
      g.add(f);
    }
    return g;
  }

  // --- Decorations ---
  function decorModel(def) {
    const g = new T.Group();
    switch (def.id) {
      case 'table':
        box(2.6, 0.12, 1.1, texMat('wood', 128, DRAW.wood, 2, 1), 0, 0.82, 0, g);
        for (const z of [-0.9, 0.9]) box(2.6, 0.1, 0.4, texMat('wood', 128, DRAW.wood, 2, 1), 0, 0.48, z, g);
        for (const x of [-1, 1]) { box(0.1, 0.8, 1.9, mat(0x8a5a3c), x, 0.4, 0, g); }
        part(geo('cup', () => new T.CylinderGeometry(0.12, 0.1, 0.25, 8)), mat(0xff5a4e), -0.5, 1.0, 0.1, g).castShadow = false;
        box(0.4, 0.06, 0.3, mat(0xfff7ec), 0.4, 0.9, 0, g, true);
        break;
      case 'bin':
        part(geo('binBody', () => new T.CylinderGeometry(0.42, 0.36, 1.0, 12)), mat(0x2fae66), 0, 0.5, 0, g);
        part(geo('binLid', () => new T.CylinderGeometry(0.47, 0.47, 0.12, 12)), mat(0x228a50), 0, 1.06, 0, g);
        box(0.3, 0.08, 0.08, mat(0x228a50), 0, 1.16, 0, g, true);
        for (let k = 0; k < 3; k++) box(0.04, 0.7, 0.02, mat(0x228a50), Math.cos(k * 1.2 - 1.2) * 0.4, 0.5, Math.sin(k * 1.2 - 1.2) * 0.4 + 0.02, g, true);
        break;
      case 'lamp':
        part(geo('lpole', () => new T.CylinderGeometry(0.08, 0.12, 3.6, 8)), mat(0x3a4058), 0, 1.8, 0, g);
        box(0.6, 0.16, 0.6, mat(0x3a4058), 0, 0.08, 0, g);
        box(0.2, 0.08, 1.1, mat(0x3a4058), 0, 3.5, 0.4, g, true);
        part(geo('lglobe', () => new T.SphereGeometry(0.32, 10, 8)), bulbMat, 0, 3.3, 0.85, g).castShadow = false;
        part(geo('lglobe', () => new T.SphereGeometry(0.32, 10, 8)), bulbMat, 0, 3.3, -0.05, g).castShadow = false;
        g.userData.light = true;
        break;
      case 'planter': {
        box(2.2, 0.8, 2.2, mat(0xe07a5f), 0, 0.4, 0, g);
        box(2.4, 0.15, 2.4, mat(0xf0957a), 0, 0.85, 0, g);
        box(2, 0.1, 2, texMat('soil', 128, DRAW.soil, 1, 1), 0, 0.82, 0, g, true);
        const F = [0xff6b9d, 0xffd43b, 0xc77dff, 0xffffff, 0xff8787];
        for (let k = 0; k < 9; k++) {
          const x = -0.7 + (k % 3) * 0.7, z = -0.7 + Math.floor(k / 3) * 0.7;
          part(geo('leaf', () => new T.IcosahedronGeometry(0.3, 0)), mat(0x57c93f), x, 1.05, z, g).castShadow = false;
          part(geo('flower', () => new T.SphereGeometry(0.17, 8, 6)), mat(F[k % 5]), x + 0.05, 1.35, z, g).castShadow = false;
        }
        break;
      }
      case 'tree': {
        part(geo('trunk', () => new T.CylinderGeometry(0.22, 0.32, 2.4, 8)), mat(0x8a5a3c), 0, 1.2, 0, g);
        const c = mat(0x57c93f), c2 = mat(0x6fdc4a);
        for (const [x, y, z, r, m] of [[0, 3.2, 0, 1.5, c], [0.9, 2.7, 0.4, 1.1, c2], [-0.8, 2.8, -0.5, 1.15, c2], [0.2, 4.1, -0.2, 0.9, c]]) part(geo('leafBall', () => new T.IcosahedronGeometry(1, 1)), m, x, y, z, g).scale.setScalar(r);
        box(1.8, 0.3, 1.8, mat(0x8a8fa6), 0, 0.15, 0, g);   // tree pit
        break;
      }
      case 'umbrella': {
        part(geo('rtable', () => new T.CylinderGeometry(0.8, 0.8, 0.08, 16)), mat(0xfff7ec), 0, 0.85, 0, g);
        part(geo('rleg', () => new T.CylinderGeometry(0.06, 0.06, 0.85, 6)), mat(0x8d99ae), 0, 0.42, 0, g);
        part(geo('upole', () => new T.CylinderGeometry(0.05, 0.05, 2.6, 6)), mat(0xdfe6ef), 0, 1.5, 0, g);
        const top = part(geo('ucanopy', () => new T.ConeGeometry(1.7, 0.7, 8)), mat(pick([0xff5a4e, 0x3a86ff, 0x3ddc84, 0xffcf2e])), 0, 2.85, 0, g);
        void top;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; part(geo('chair', () => new T.CylinderGeometry(0.28, 0.25, 0.5, 10)), mat(0x8a5a3c), Math.cos(a) * 1.25, 0.25, Math.sin(a) * 1.25, g); }
        break;
      }
      case 'fountain': {
        part(geo('fbase', () => new T.CylinderGeometry(3.4, 3.6, 0.7, 24)), mat(0xe9edf5), 0, 0.35, 0, g).receiveShadow = true;
        const water = new T.Mesh(geo('fwater', () => new T.CircleGeometry(3.0, 24)), texMat('water', 128, DRAW.water, 1.5, 1.5));
        water.rotation.x = -Math.PI / 2; water.position.y = 0.72; g.add(water);
        part(geo('fcol', () => new T.CylinderGeometry(0.35, 0.5, 1.6, 12)), mat(0xe9edf5), 0, 1.4, 0, g);
        part(geo('fbowl', () => new T.CylinderGeometry(1.2, 0.5, 0.4, 16)), mat(0xe9edf5), 0, 2.3, 0, g);
        const jets = [];
        for (let k = 0; k < 8; k++) { const s = part(geo('drop', () => new T.SphereGeometry(0.16, 6, 5)), mat(0xd6f0ff), 0, 2, 0, g); s.castShadow = false; jets.push(s); }
        g.userData.jets = jets;
        break;
      }
      case 'stage': {
        box(11, 1.2, 6.4, texMat('wood', 128, DRAW.wood, 6, 3), 0, 0.6, -0.2, g);
        for (const x of [-5.2, 5.2]) box(0.3, 5.2, 0.3, mat(0x3a4058), x, 3.2, -3, g);
        box(10.7, 0.4, 0.4, mat(0x3a4058), 0, 5.8, -3, g);
        box(10.6, 3.6, 0.15, mat(0x6b4fd6), 0, 3.0, -3.3, g);
        for (const x of [-4.2, 4.2]) { box(1, 1.8, 1, mat(0x2b2f45), x, 2.1, -1.8, g); part(geo('spk', () => new T.CircleGeometry(0.3, 12)), mat(0x8a8fa6), x, 2.3, -1.29, g); }
        const lights = [];
        for (let k = 0; k < 6; k++) { const s = part(geo('slight', () => new T.SphereGeometry(0.25, 8, 6)), once('stl' + k, () => new T.MeshBasicMaterial({ color: [0xff4fd8, 0x3df5ff, 0xfff34f, 0x7dff6b, 0xff7a3d, 0xffffff][k] })), -4 + k * 1.6, 5.5, -2.7, g); s.castShadow = false; lights.push(s); }
        g.userData.lights = lights;
        const singer = person(0xff4fd8, { plain: true });
        singer.position.set(0, 1.2, -1.2);
        g.add(singer);
        g.userData.singer = singer;
        part(geo('mic', () => new T.CylinderGeometry(0.03, 0.03, 1.4, 6)), mat(0x2b2f45), 0.4, 1.9, -0.8, g);
        break;
      }
    }
    return g;
  }

  // Scaffolding shown while something is being built or upgraded
  function scaffold(w, d, h) {
    const g = new T.Group(), pole = mat(0xffb03d), plank = texMat('wood', 128, DRAW.wood, 2, 1);
    const xs = [-w / 2, 0, w / 2], zs = [-d / 2, d / 2];
    for (const x of xs) for (const z of zs) box(0.12, h, 0.12, pole, x, h / 2, z, g, true);
    for (let y = 1.4; y < h; y += 1.6) {
      for (const z of zs) box(w, 0.12, 0.6, plank, 0, y, z, g, true);
      for (const x of [-w / 2, w / 2]) box(0.6, 0.12, d, plank, x, y, 0, g, true);
    }
    const net = once('net', () => new T.MeshLambertMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.35, side: T.DoubleSide, depthWrite: false }));
    const n1 = box(w, h, 0.02, net, 0, h / 2, d / 2 + 0.05, g, true); n1.castShadow = false;
    // a little crane
    box(0.4, h + 3, 0.4, mat(0xffcf2e), w / 2 - 0.3, (h + 3) / 2, -d / 2 + 0.3, g);
    const jib = box(w + 2, 0.35, 0.35, mat(0xffcf2e), w / 2 - 0.3 - (w + 2) / 2 + 1, h + 3, -d / 2 + 0.3, g);
    g.userData.jib = jib;
    for (const [x, z] of [[-w / 2 - 0.8, d / 2 + 0.6], [w / 2 + 0.8, d / 2 + 0.6]]) part(geo('cone', () => new T.ConeGeometry(0.25, 0.7, 8)), mat(0xff7b00), x, 0.35, z, g);
    const worker = person(0xff922b, { plain: true, hardhat: true });
    worker.position.set(-w / 2 + 0.8, 0, d / 2 + 0.9);
    g.add(worker);
    g.userData.worker = worker;
    return g;
  }

  function progressTex() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 72;
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    return { c, t, g: c.getContext('2d'), last: '' };
  }
  function drawProgress(pt, f, label) {
    const key = Math.round(f * 100) + label;
    if (pt.last === key) return;
    pt.last = key;
    const g = pt.g;
    g.clearRect(0, 0, 256, 72);
    g.fillStyle = 'rgba(16,26,63,.92)'; roundRect(g, 2, 2, 252, 68, 18); g.fill();
    g.fillStyle = '#ffd24a'; roundRect(g, 2, 2, 252, 68, 18); g.lineWidth = 4; g.strokeStyle = '#ffd24a'; g.stroke();
    g.fillStyle = 'rgba(0,0,0,.5)'; roundRect(g, 14, 40, 228, 20, 10); g.fill();
    g.fillStyle = '#45e08a'; roundRect(g, 14, 40, Math.max(20, 228 * f), 20, 10); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, label, 220, 26); g.fillText(label, 128, 21);
    pt.t.needsUpdate = true;
  }

  // Build the 3D view of one building
  function makeView(b) {
    const def = E.DEFS[b.t];
    const g = new T.Group();
    const lv = Math.max(1, b.lv);
    let model;
    if (def.cat === 'hall') model = hallModel(lv);
    else if (def.cat === 'decor') model = decorModel(def);
    else if (def.id === 'garden') model = gardenModel(lv);
    else if (def.id === 'field') model = fieldModel(lv);
    else if (def.id === 'orchard') model = orchardModel(lv);
    else if (def.id === 'paddy') model = paddyModel(lv);
    else if (def.id === 'spicegdn') model = spiceModel(lv);
    else if (def.id === 'barn') model = barnModel(lv);
    else if (def.id === 'pond') model = pondModel(lv);
    else if (def.id === 'warehouse') model = warehouseModel(lv);
    else if (def.id === 'greenhouse') model = greenhouseModel(lv);
    else if (def.id === 'taco') model = truckModel(def, lv);
    else if (def.w === 1) model = stallModel(def, lv);
    else model = restaurantModel(def, lv, def.w);
    g.add(model);
    g.position.set(footX(b, def), 0.2, footZ(b, def));
    const v = { u: b.u, t: b.t, g, model, key: '', box: new T.Box3(), queue: [], incoming: 0, nextSpawn: 0, lastServe: 0, pop: 0, h: 3, bubble: null, prog: null, scaf: null };
    model.updateMatrixWorld(true);
    const bb = new T.Box3().setFromObject(model);
    v.h = Math.max(2, bb.max.y);
    parkRoot.add(g);
    return v;
  }
  function viewKey(b, building) {
    const def = E.DEFS[b.t];
    const lvKey = def.cat === 'hall' ? (b.lv >= 15 ? 3 : b.lv >= 10 ? 2 : b.lv >= 5 ? 1 : 0)
      : def.w >= 2 && def.cat === 'stall' ? Math.min(def.w === 2 ? 3 : 5, 1 + Math.floor(Math.max(1, b.lv) / 5)) + (b.lv >= 15 ? 'f' : '')
      : def.cat === 'decor' ? 0 : def.cat !== 'stall' ? Math.min(10, b.lv) : (b.lv >= 10 ? 2 : b.lv >= 5 ? 1 : 0);
    return [b.t, b.x, b.y, lvKey, building ? 'B' : ''].join(':');
  }
  function updateViewBox(v, b) {
    const def = E.DEFS[b.t];
    const x0 = (b.x - G / 2) * CELL, z0 = (b.y - G / 2) * CELL;
    v.box.set(tmpV.set(x0, 0, z0), tmpV2.set(x0 + def.w * CELL, Math.max(v.h, 3) + 1.5, z0 + def.h * CELL));
  }

  // =====================================================================
  //  People
  // =====================================================================
  const SHIRTS = [0xff6b6b, 0x4dabf7, 0x51cf66, 0xffd43b, 0xcc5de8, 0xff922b, 0x20c997, 0xf783ac, 0x748ffc, 0xe9ecef];
  const SKINS = [0xffd9b3, 0xf1c27d, 0xc68642, 0x8d5524];
  const HAIRS = [0x2b2118, 0x5a3825, 0xd9a441, 0x8c8c8c, 0xb5442e];
  function makePersonMesh(shirt, opts) {
    const g = new T.Group(), plain = opts && opts.plain;
    const body = part(geo('cap', () => new T.CapsuleGeometry(0.2, 0.36, 3, 8)), mat(shirt), 0, 0.66, 0, g);
    part(geo('head', () => new T.SphereGeometry(0.19, 10, 8)), mat(pick(SKINS)), 0, 1.16, 0, g).castShadow = false;
    const extra = plain ? 0.5 : Math.random();
    if (opts && opts.hat) part(geo('chefhat', () => new T.CylinderGeometry(0.2, 0.17, 0.3, 10)), mat(0xffffff), 0, 1.42, 0, g).castShadow = false;
    else if (opts && opts.straw) {
      part(geo('sbrim', () => new T.CylinderGeometry(0.38, 0.38, 0.04, 14)), mat(0xe0b062), 0, 1.3, 0, g).castShadow = false;
      part(geo('scrown', () => new T.CylinderGeometry(0.17, 0.2, 0.16, 10)), mat(0xffd27a), 0, 1.39, 0, g).castShadow = false;
    } else if (opts && opts.sou) part(geo('souw', () => new T.SphereGeometry(0.26, 10, 6, 0, 6.283, 0, 1.7)), mat(0xffcf2e), 0, 1.2, 0, g).castShadow = false;
    else if (opts && opts.hardhat) part(geo('hardhat', () => new T.SphereGeometry(0.23, 10, 6, 0, 6.283, 0, 1.6)), mat(0xffcf2e), 0, 1.2, 0, g).castShadow = false;
    else if (extra < 0.18) {
      part(geo('brim', () => new T.CylinderGeometry(0.3, 0.3, 0.04, 12)), mat(pick(SHIRTS)), 0, 1.3, 0, g).castShadow = false;
      part(geo('crown', () => new T.CylinderGeometry(0.17, 0.19, 0.16, 10)), mat(pick(SHIRTS)), 0, 1.38, 0, g).castShadow = false;
    } else part(geo('hair', () => new T.SphereGeometry(0.205, 10, 6, 0, 6.283, 0, 1.75)), mat(pick(HAIRS)), 0, 1.19, 0, g).castShadow = false;
    if (extra > 0.8 && extra < 0.92) box(0.3, 0.36, 0.16, mat(pick(SHIRTS)), 0, 0.72, -0.24, g).castShadow = false;
    const pants = pick([0x39405a, 0x2f5f8f, 0x5c4632, 0x3a3a3a]);
    const legGeo = geo('leg', () => new T.BoxGeometry(0.13, 0.36, 0.14).translate(0, -0.18, 0));
    const legs = [part(legGeo, mat(pants), -0.1, 0.4, 0, g), part(legGeo, mat(pants), 0.1, 0.4, 0, g)];
    legs.forEach(l => (l.castShadow = false));
    const armGeo = geo('arm', () => new T.CapsuleGeometry(0.065, 0.3, 2, 6).translate(0, -0.17, 0));
    const arms = [part(armGeo, mat(shirt), -0.27, 0.88, 0, g), part(armGeo, mat(shirt), 0.27, 0.88, 0, g)];
    arms.forEach(a => { a.castShadow = false; });
    arms[0].rotation.z = -0.12; arms[1].rotation.z = 0.12;
    for (const x of [-0.1, 0.1]) box(0.15, 0.08, 0.22, mat(0x2b2118), x, 0.05, 0.03, g, true);
    const size = !plain && extra > 0.6 && extra < 0.7 ? 0.95 : 1.25;
    g.scale.setScalar(size);
    g.userData = { legs, arms, body, size };
    return g;
  }

  // Walking graph: park cells (24 × 24) plus the sidewalk around the park.
  let walkable = new Uint8Array(G * G);
  function rebuildWalk(state) {
    const park = state.parks[P];
    walkable = new Uint8Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const o = E.occupant(park, x, y, -1);
      walkable[y * G + x] = o ? 0 : 1;
    }
  }
  function cellPath(sx, sy, tx, ty) {
    const N = G * G, prev = new Int16Array(N).fill(-1);
    const start = sy * G + sx, goal = ty * G + tx;
    const q = [start]; prev[start] = start;
    for (let h = 0; h < q.length; h++) {
      const n = q[h];
      if (n === goal) break;
      const x = n % G, y = (n / G) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, m = ny * G + nx;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G || prev[m] >= 0 || (!walkable[m] && m !== goal)) continue;
        prev[m] = n; q.push(m);
      }
    }
    if (prev[goal] < 0) return null;
    const out = [];
    for (let c = goal; c !== start; c = prev[c]) out.push([cellX(c % G), cellX((c / G) | 0)]);
    out.push([cellX(sx), cellX(sy)]);
    return out.reverse();
  }
  // A point on the street edge of the park, and the edge cell next to it.
  function gatePoint() {
    const side = (Math.random() * 4) | 0, i = (Math.random() * G) | 0;
    const cell = [[i, 0], [i, G - 1], [0, i], [G - 1, i]][side];
    const out = [[cellX(i), -HALF - 1.5], [cellX(i), HALF + 1.5], [-HALF - 1.5, cellX(i)], [HALF + 1.5, cellX(i)]][side];
    return { cell, out };
  }
  function frontCell(b) {
    const d = E.DEFS[b.t];
    const cands = [];
    for (let i = 0; i < d.w; i++) cands.push([b.x + i, b.y + d.h]);
    for (let j = 0; j < d.h; j++) cands.push([b.x + d.w, b.y + j], [b.x - 1, b.y + j]);
    for (let i = 0; i < d.w; i++) cands.push([b.x + i, b.y - 1]);
    return cands.find(([x, y]) => x >= 0 && y >= 0 && x < G && y < G && walkable[y * G + x]) || null;
  }

  function spawnPerson(x, z, opts) {
    const g = makePersonMesh(opts && opts.shirt !== undefined ? opts.shirt : pick(SHIRTS), opts);
    const p = { g, x, z, path: [], pi: 0, speed: rand(2.1, 2.9), state: 'walk', v: null, phase: rand(0, 6), born: time, hop: 0, moving: false, bubble: null, wait: 0 };
    g.position.set(x, 0.24, z);
    parkRoot.add(g);
    people.push(p);
    return p;
  }
  function removePerson(p) {
    if (p.v) { const q = p.v.queue.indexOf(p); if (q >= 0) p.v.queue.splice(q, 1); else if (p.state === 'toShop') p.v.incoming = Math.max(0, p.v.incoming - 1); }
    disposeGroup(p.g);
    const i = people.indexOf(p);
    if (i >= 0) people.splice(i, 1);
  }
  function setBubble(p, name, ring) {
    if (p.bubble) { p.g.remove(p.bubble); p.bubble.material.dispose(); p.bubble = null; }
    if (!name) return;
    p.bubble = sprite(bubbleTex(name, ring || '#ffcf2e'), 0.85, 0.85);
    p.bubble.position.set(0, 1.95, 0);
    p.g.add(p.bubble);
  }
  // Walk along the sidewalk around the park (ambient life)
  function strollPath(p) {
    const r = HALF + 1.5 + (Math.random() < 0.5 ? 0 : RING + 5.5 - HALF - 1.5), pts = [];
    let a = Math.atan2(p.z, p.x), dir = Math.random() < 0.5 ? 1 : -1;
    for (let k = 0; k < 6; k++) {
      a += dir * rand(0.3, 0.8);
      const cx = Math.cos(a), cz = Math.sin(a), m = Math.max(Math.abs(cx), Math.abs(cz));
      pts.push([cx / m * r, cz / m * r]);
    }
    p.path = pts; p.pi = 0; p.state = 'stroll';
  }
  function sendCustomer(v, b) {
    const fc = frontCell(b);
    if (!fc) return false;
    const gp = gatePoint();
    const route = cellPath(gp.cell[0], gp.cell[1], fc[0], fc[1]);
    if (!route) return false;
    const p = spawnPerson(gp.out[0], gp.out[1]);
    p.path = route; p.pi = 0; p.state = 'toShop'; p.v = v; p.front = fc; p.speed = rand(2.8, 3.4);
    v.incoming++;
    setBubble(p, E.DEFS[b.t].icon);
    return true;
  }
  function leave(p, sit) {
    const here = [Math.round(p.x / CELL + G / 2 - 0.5), Math.round(p.z / CELL + G / 2 - 0.5)];
    if (sit) {
      const route = cellPath(clamp(here[0], 0, G - 1), clamp(here[1], 0, G - 1), sit.cell[0], sit.cell[1]);
      if (route) { p.path = route; p.pi = 0; p.state = 'toSeat'; p.seat = sit; return; }
    }
    const gp = gatePoint();
    const route = cellPath(clamp(here[0], 0, G - 1), clamp(here[1], 0, G - 1), gp.cell[0], gp.cell[1]) || [];
    route.push(gp.out);
    p.path = route; p.pi = 0; p.state = 'leave';
  }
  let seats = [];
  function rebuildSeats(state) {
    seats = [];
    for (const b of state.parks[P].b) {
      const d = E.DEFS[b.t];
      if (d.id !== 'table' && d.id !== 'umbrella') continue;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const x = b.x + dx, y = b.y + dy;
        if (x >= 0 && y >= 0 && x < G && y < G && walkable[y * G + x]) {
          seats.push({ cell: [x, y], at: [footX(b, d) + dx * 1.1, footZ(b, d) + dy * 1.1], face: Math.atan2(-dx, -dy), busy: null });
          break;
        }
      }
    }
  }
  function updatePeople(dt) {
    let strollers = 0;
    for (const p of people) if (p.state === 'stroll') strollers++;
    // the town gets busier as your reputation grows; fewer people at night and in bad weather
    const rep = lastState ? Math.min(15, E.repLevel(lastState)) : 1;
    const busy = (0.55 + rep * 0.09) * (1 - 0.6 * (W.night || 0)) * (wxKind === 'rain' || wxKind === 'snow' ? 0.6 : 1) * (quality >= 2 ? 0.6 : 1);
    const target = Math.round({ suburb: 8, town: 14, city: 18, metro: 22 }[style] * busy);
    if (strollers < target && time > nextWander) {
      nextWander = time + 0.6;
      const a = Math.random() * 6.283, r = Math.random() < 0.5 ? HALF + 1.5 : RING + 5.5, cx = Math.cos(a), cz = Math.sin(a), m = Math.max(Math.abs(cx), Math.abs(cz));
      strollPath(spawnPerson(cx / m * r, cz / m * r));
    }
    for (let i = people.length - 1; i >= 0; i--) {
      const p = people[i];
      let tx = p.x, tz = p.z, arrived = false;
      if (p.state === 'queue') {
        const k = p.v.queue.indexOf(p), b = lastState && E.findB(lastState, P, p.v.u);
        if (!b) { removePerson(p); continue; }
        tx = cellX(p.front[0]) + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.9 : 0);
        tz = cellX(p.front[1]) + (k ? 0.6 : 0);
      } else if (p.state === 'sit') {
        p.wait -= dt;
        if (p.wait <= 0) { p.seat.busy = null; leave(p); }
      } else if (p.pi < p.path.length) { tx = p.path[p.pi][0]; tz = p.path[p.pi][1]; }
      else arrived = true;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      p.moving = d > 0.06 && p.state !== 'sit';
      if (p.moving) {
        const step = Math.min(d, p.speed * dt);
        p.x += dx / d * step; p.z += dz / d * step;
        p.g.rotation.y = Math.atan2(dx, dz);
      } else if (p.state === 'queue') p.g.rotation.y = Math.atan2(p.v.g.position.x - p.x, p.v.g.position.z - p.z);
      else if (p.state !== 'sit' && p.pi < p.path.length) p.pi++;
      if (arrived) {
        if (p.state === 'toShop' && p.v) { p.state = 'queue'; p.v.incoming = Math.max(0, p.v.incoming - 1); p.v.queue.push(p); }
        else if (p.state === 'toSeat') { p.state = 'sit'; p.wait = rand(5, 10); p.x = p.seat.at[0]; p.z = p.seat.at[1]; p.g.rotation.y = p.seat.face; }
        else if (p.state === 'stroll' && Math.random() < 0.7) strollPath(p);
        else if (p === (vip && vip.p)) strollPath(p);
        else { removePerson(p); continue; }
      }
      p.phase += dt * (p.moving ? p.speed * 3.2 : 0);
      const sw = p.moving ? Math.sin(p.phase) * 0.7 : 0;
      const u = p.g.userData;
      u.legs[0].rotation.x = p.state === 'sit' ? -1.4 : sw; u.legs[1].rotation.x = p.state === 'sit' ? -1.4 : -sw;
      u.arms[0].rotation.x = -sw * 0.8; u.arms[1].rotation.x = sw * 0.8;
      let y = (p.state === 'sit' ? 0.1 : 0.24) + (p.moving ? Math.abs(Math.sin(p.phase)) * 0.05 : 0);
      if (p.hop > 0) { p.hop -= dt; y += Math.sin(Math.max(0, p.hop) / 0.4 * Math.PI) * 0.5; }
      p.g.position.set(p.x, y, p.z);
      const born = Math.min(1, (time - p.born) * 3);
      if (born < 1) p.g.scale.setScalar(u.size * born);
      if (p.bubble && p.bubbleUntil && time > p.bubbleUntil) { setBubble(p, null); p.bubbleUntil = 0; }
    }
  }
  function serve(v, p) {
    const q = v.queue.indexOf(p);
    if (q >= 0) v.queue.splice(q, 1);
    p.v = null; p.hop = 0.4;
    setBubble(p, 'heart', '#ff4d6d');
    p.bubbleUntil = time + 1.6;
    box(0.22, 0.26, 0.16, mat(ACCENT[E.DEFS[v.t].id] || 0xff5a4e), 0.3, 0.62, 0.05, p.g).castShadow = false;
    popCoin(p.x, 2.6, p.z);
    if (Math.random() < 0.18) dropTip(p.x + rand(-0.5, 0.5), p.z + rand(0.6, 1.1));
    const free = seats.filter(s => !s.busy);
    if (free.length && Math.random() < 0.6) { const s = pick(free); s.busy = p; leave(p, s); }
    else leave(p);
  }

  // =====================================================================
  //  Traffic on the two ring roads
  // =====================================================================
  function ringPos(r, s) {   // s: distance along the square loop of half-size r, counter-clockwise from (r, -r)
    const side = 2 * r, per = 4 * side;
    s = ((s % per) + per) % per;
    const k = Math.floor(s / side), f = s - k * side;
    return [[r, -r + f, 0], [r - f, r, Math.PI / 2], [-r, r - f, Math.PI], [-r + f, -r, -Math.PI / 2]][k];
  }
  function spawnCar() {
    const g = new T.Group(), color = pick(CAR_COLORS), kind = Math.random();
    let len = 3.6;
    if (kind < 0.72) {
      const c = kind > 0.6 ? 0xffc300 : color;
      box(1.7, 0.6, 3.6, mat(c), 0, 0.62, 0, g);
      box(1.5, 0.55, 1.9, mat(0x6fa8dc), 0, 1.15, -0.15, g);
      box(1.52, 0.08, 1.92, mat(c), 0, 1.46, -0.15, g, true);
      if (kind > 0.6) box(0.6, 0.2, 0.3, headMat, 0, 1.58, -0.15, g, true);
    } else if (kind < 0.9) {
      len = 4.6;
      box(1.8, 1.5, 3.2, mat(0xf8f9fa), 0, 1.1, -0.6, g); box(1.75, 1.05, 1.3, mat(color), 0, 0.88, 1.65, g); box(1.6, 0.4, 0.1, mat(0x2b3a55), 0, 1.15, 2.31, g, true);
    } else {
      len = 7;
      box(1.9, 1.7, 7, mat(pick([0x2f80ed, 0xffc300, 0xe63946])), 0, 1.2, 0, g); box(1.94, 0.55, 6.4, mat(0x2b3a55), 0, 1.5, 0, g, true);
    }
    const wheel = geo('cwheel', () => new T.CylinderGeometry(0.36, 0.36, 0.26, 12).rotateZ(Math.PI / 2));
    for (const sx of [-0.86, 0.86]) for (const sz of [len / 2 - 0.85, -len / 2 + 0.85]) part(wheel, mat(0x1d1f27), sx, 0.36, sz, g).castShadow = false;
    for (const x of [-0.6, 0.6]) { box(0.34, 0.2, 0.06, headMat, x, 0.62, len / 2 + 0.01, g, true); box(0.34, 0.16, 0.06, tailMat, x, 0.62, -len / 2 - 0.01, g, true); }
    const outer = Math.random() < 0.45, dir = Math.random() < 0.5 ? 1 : -1;
    const r = (outer ? OUTER : RING) + (dir > 0 ? 1.8 : -1.8);
    const c = { g, r, dir, s: rand(0, 8 * r), v: 9, max: rand(8, 11), len };
    root.add(g);
    cars.push(c);
  }
  function updateCars(dt) {
    const rep = lastState ? Math.min(15, E.repLevel(lastState)) : 1;
    const want = Math.round({ suburb: 7, town: 12, city: 18, metro: 24 }[style] * (0.6 + rep * 0.06) * (1 - 0.4 * (W.night || 0)));
    if (cars.length < want && time > nextCar) { nextCar = time + 0.5; spawnCar(); }
    for (const c of cars) {
      let go = c.max;
      for (const o of cars) {
        if (o === c || o.r !== c.r) continue;
        const per = 8 * c.r;
        const ahead = (((o.s - c.s) * c.dir) % per + per) % per;
        if (ahead > 0 && ahead < 4 + (c.len + o.len) / 2) go = Math.min(go, o.v * 0.7);
      }
      const [x, z] = ringPos(c.r, c.s);
      for (let k = 0; k < 4 && go > 0; k++) {   // stop at the four zebra crossings when someone is crossing
        const a = k * Math.PI / 2, cx = Math.sin(a) * RING, cz = Math.cos(a) * RING;
        const dist = Math.hypot(cx - x, cz - z);
        if (dist < 9 && dist > 2.5 && people.some(p => Math.hypot(p.x - cx, p.z - cz) < 4.5)) go = 0;
      }
      c.v += (go - c.v) * Math.min(1, dt * 5);
      c.s += c.dir * c.v * dt;
      const [px, pz, ang] = ringPos(c.r, c.s);
      c.g.position.set(px, 0.06, pz);
      c.g.rotation.y = ang + (c.dir > 0 ? 0 : Math.PI);
    }
  }

  // =====================================================================
  //  Effects: coins, confetti, tips, VIP
  // =====================================================================
  const coins = [], confetti = [];
  function buildFx() {
    for (let k = 0; k < 16; k++) { const s = sprite(iconTex('coin'), 0.9, 0.9); s.visible = false; scene.add(s); coins.push({ s, t: 9 }); }
    const cols = [0xff6b6b, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8, 0xffffff];
    for (let k = 0; k < 70; k++) {
      const s = new T.Sprite(new T.SpriteMaterial({ color: cols[k % cols.length], depthTest: false }));
      s.scale.set(0.3, 0.3, 1); s.visible = false; s.renderOrder = 12; scene.add(s);
      confetti.push({ s, t: 9, vx: 0, vy: 0, vz: 0 });
    }
  }
  function popCoin(x, y, z) { const c = coins.find(k => k.t > 0.9); if (c) { c.t = 0; c.s.position.set(x, y, z); c.s.visible = true; } }
  W.burst = function (x, y, z, count) {
    let n = count || 24;
    for (const c of confetti) {
      if (n <= 0) break;
      if (c.t < 1.3) continue;
      c.t = 0; c.s.position.set(x, y, z); c.s.visible = true;
      const a = Math.random() * 6.283, sp = rand(3, 9);
      c.vx = Math.cos(a) * sp; c.vz = Math.sin(a) * sp; c.vy = rand(8, 14);
      n--;
    }
  };
  // Kitchen smoke and steam
  const puffs = [];
  let puffTex = null;
  function puff(x, y, z) {
    if (!puffTex) puffTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    let p = puffs.find(q => q.t >= 1);
    if (!p) { if (puffs.length > 40) return; const sp = sprite(puffTex, 1, 1, { depthTest: true, depthWrite: false, opacity: 0.6 }); sp.renderOrder = 4; scene.add(sp); p = { s: sp, t: 1 }; puffs.push(p); }
    p.t = 0; p.s.position.set(x, y, z); p.s.visible = true;
  }
  // Rain and snow
  let wx = null, wxKind = 'sun';
  W.setWeather = function (kind) {
    wxKind = kind || 'sun';
    if (wx) { scene.remove(wx.pts); wx.pts.geometry.dispose(); wx.pts.material.dispose(); wx = null; }
    if (!scene || (wxKind !== 'rain' && wxKind !== 'snow')) return;
    const n = quality >= 2 ? 500 : 1300, pos = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { pos[k * 3] = rand(-70, 70); pos[k * 3 + 1] = rand(0, 50); pos[k * 3 + 2] = rand(-70, 70); }
    const geom = new T.BufferGeometry();
    geom.setAttribute('position', new T.BufferAttribute(pos, 3));
    const snow = wxKind === 'snow';
    const m = new T.PointsMaterial({ color: snow ? 0xffffff : 0xb8d4ff, size: snow ? 0.6 : 0.32, transparent: true, opacity: snow ? 0.95 : 0.75, depthWrite: false });
    wx = { pts: new T.Points(geom, m), speed: snow ? 5 : 40, snow };
    wx.pts.frustumCulled = false;
    scene.add(wx.pts);
  };
  function updateWeather(dt) {
    if (!wx) return;
    const a = wx.pts.geometry.attributes.position, arr = a.array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i + 1] -= wx.speed * dt * (0.8 + (i % 7) * 0.05);
      if (wx.snow) arr[i] += Math.sin(time * 0.8 + i) * dt * 0.9;
      if (arr[i + 1] < 0) arr[i + 1] += 50;
    }
    a.needsUpdate = true;
    wx.pts.position.set(cam.tx, 0, cam.tz);
  }
  function updateFx(dt) {
    for (const p of puffs) {
      if (p.t >= 1) continue;
      p.t = Math.min(1, p.t + dt * 0.6);
      p.s.position.y += dt * 1.6; p.s.position.x += dt * 0.3;
      const k = 0.8 + p.t * 2.4; p.s.scale.set(k, k, 1);
      p.s.material.opacity = 0.5 * (1 - p.t);
      if (p.t >= 1) p.s.visible = false;
    }
    for (const c of coins) {
      if (c.t > 0.9) continue;
      c.t += dt; c.s.position.y += dt * 2.4; c.s.material.opacity = 1 - Math.max(0, c.t - 0.5) / 0.4;
      if (c.t > 0.9) c.s.visible = false;
    }
    for (const c of confetti) {
      if (c.t > 1.3) continue;
      c.t += dt; c.vy -= 22 * dt;
      c.s.position.x += c.vx * dt; c.s.position.y += c.vy * dt; c.s.position.z += c.vz * dt;
      if (c.t > 1.3 || c.s.position.y < 0.2) { c.s.visible = false; c.t = 9; }
    }
  }
  function dropTip(x, z) {
    if (tips.length >= 6) return;
    const g = new T.Group();
    const c = part(geo('tipcoin', () => new T.CylinderGeometry(0.42, 0.42, 0.12, 20).rotateX(Math.PI / 2)), mat(0xffcf2e, { emissive: 0x6b4a00, emissiveIntensity: 0.6 }), 0, 0, 0, g);
    part(geo('tiprim', () => new T.TorusGeometry(0.42, 0.06, 6, 20)), mat(0xd99a1c), 0, 0, 0, c).castShadow = false;
    const ring = new T.Mesh(geo('tipglow', () => new T.RingGeometry(0.5, 0.9, 24).rotateX(-Math.PI / 2)), once('tipGlowMat', () => new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.55, depthWrite: false })));
    ring.position.y = -0.95;
    g.add(ring);
    g.position.set(x, 1.2, z);
    parkRoot.add(g);
    tips.push({ g, c, ring, born: time });
  }
  function updateTips() {
    for (let i = tips.length - 1; i >= 0; i--) {
      const tp = tips[i], age = time - tp.born;
      tp.c.rotation.y = time * 3;
      tp.c.position.y = Math.abs(Math.sin(time * 3 + i)) * 0.25;
      if (age > 25) { disposeGroup(tp.g); tips.splice(i, 1); }
    }
  }
  function endVip() { if (!vip) return; const p = vip.p; vip = null; removePerson(p); }
  W.spawnVip = function () {
    if (!W.ok || !root || vip) return false;
    const gp = gatePoint();
    const p = spawnPerson(gp.out[0], gp.out[1], { shirt: 0xffc93d, plain: true });
    p.speed = 2.4;
    const beam = new T.Mesh(geo('beam', () => new T.CylinderGeometry(0.75, 0.75, 16, 12, 1, true)), once('beamMat', () => new T.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide })));
    beam.position.y = 8;
    p.g.add(beam);
    const crown = sprite(iconTex('crown'), 1.6, 1.6);
    crown.position.y = 2.6;
    p.g.add(crown);
    strollPath(p);
    vip = { p, until: time + 25 };
    return true;
  };
  W.hasVip = () => !!vip;

  // =====================================================================
  //  Per-frame building logic: customers, bubbles, construction
  // =====================================================================
  function updateBuildings(dt, state, now) {
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const park = state.parks[P];
    for (const b of park.b) {
      const v = views.get(b.u);
      if (!v) continue;
      const def = E.DEFS[b.t], ud = v.model.userData;
      if (v.pop > 0) {
        v.pop = Math.max(0, v.pop - dt * 2.2);
        const k = 1 + Math.sin(v.pop * Math.PI) * 0.16 * v.pop;
        v.g.scale.set(k, 1 + (k - 1) * 1.6, k);
      }
      if (ud.mascot) ud.mascot.rotation.y += dt * 0.6;
      if (ud.bob) ud.bob.position.y = 3.4 + Math.sin(time * 2 + b.u) * 0.12;
      if (ud.jets) ud.jets.forEach((s, k) => { const t = (time * 0.9 + k / 8) % 1, a = k * 0.785; s.position.set(Math.cos(a) * t * 2, 2.3 + Math.sin(t * Math.PI) * 1.6, Math.sin(a) * t * 2); });
      if (ud.lights) ud.lights.forEach((s, k) => s.scale.setScalar(0.7 + 0.5 * Math.abs(Math.sin(time * 4 + k))));
      if (ud.singer) ud.singer.rotation.y = Math.sin(time * 2) * 0.4;
      if (v.scaf) {
        const sd = v.scaf.userData;
        sd.jib.rotation.y = Math.sin(time * 0.6) * 0.5;
        sd.worker.userData.arms[1].rotation.x = -1 - Math.abs(Math.sin(time * 6)) * 0.8;
      }
      // Construction progress
      const job = E.jobFor(state, P, b.u);
      if (job) {
        if (!v.prog) {
          v.prog = progressTex();
          v.progS = sprite(v.prog.t, 4.2, 1.2);
          v.progS.material.userData.shared = false;
          parkRoot.add(v.progS);
        }
        const left = Math.max(0, (job.end - now) / 1000), f = 1 - left / job.dur;
        drawProgress(v.prog, clamp(f, 0, 1), (b.lv === 0 ? 'Building ' : 'Upgrading ') + E.formatTime(left));
        v.progS.position.set(v.g.position.x, Math.max(v.h, 4) + 2.2, v.g.position.z);
      } else if (v.prog) { parkRoot.remove(v.progS); v.progS.material.dispose(); v.prog.t.dispose(); v.prog = null; }
      // Status bubble: nobody working here, or no ingredients
      const role = E.ROLE[def.cat];
      const ws = role && b.lv >= 1 ? E.workersAt(state, P, b.u) : null;
      if (!v.hrAt || time > v.hrAt) { v.hrAt = time + 1; v.hr = ws && ws.length ? E.hourly(state, P, b, now) : null; }
      const need = !job && ws ? (!ws.length ? 'person' : b.starved ? 'crate' : '') : '';
      if (need !== (v.need || '')) {
        if (v.bubble) { parkRoot.remove(v.bubble); v.bubble.material.dispose(); v.bubble = null; }
        v.need = need;
        if (need) { v.bubble = sprite(bubbleTex(need, need === 'person' ? '#ff5a6e' : '#ff9f1c'), 2.2, 2.2); v.bubble.material.userData.shared = false; parkRoot.add(v.bubble); }
      }
      if (v.bubble) v.bubble.position.set(v.g.position.x, Math.max(v.h, 3) + 1.6 + Math.abs(Math.sin(time * 3 + b.u)) * 0.4, v.g.position.z);
      // Customers come as often as the stall really sells
      const sold = v.hr ? v.hr.sold : 0;
      if (def.cat === 'stall' && b.lv >= 1 && !job && sold > 0) {
        const gameSec = 3600 / E.TIME_SCALE;               // real seconds in one game hour
        const cap = Math.min(6, 1 + Math.floor(sold / 40));
        if (v.queue.length + v.incoming < cap && time > v.nextSpawn && people.length < 80) {
          sendCustomer(v, b);
          v.nextSpawn = time + clamp(gameSec / sold * 6, 1.2, 14) * rand(0.7, 1.3);
        }
        const every = clamp(gameSec / Math.max(1, v.hr.capacity) * 6, 0.9, 8);
        const ready2 = v.queue.filter((p, k) => !p.moving || k === 0);
        if (ready2.length && time - v.lastServe > every) {
          serve(v, ready2[0]);
          v.lastServe = time;
          if (ud.chef) ud.chef.userData.hop = 0.3;
        }
      }
      if (ud.chef) {
        const c = ud.chef;
        c.visible = !!(ws && ws.length) || def.cat !== 'stall';
        c.userData.hop = Math.max(0, (c.userData.hop || 0) - dt);
        c.position.y = (def.id === 'taco' ? 0.85 : 0) + Math.sin(c.userData.hop / 0.3 * Math.PI) * 0.3;
        c.userData.arms[0].rotation.x = -0.6 + Math.sin(time * 8) * 0.4;
      }
      // Smoke from busy kitchens
      if (def.cat === 'stall' && sold > 0 && Math.random() < dt * Math.min(3, 0.6 + sold / 80) && quality < 2) puff(v.g.position.x + rand(-0.5, 0.5), v.h + 0.3, v.g.position.z - (def.h * CELL) * 0.2);
      // Farm workers and animals
      const nW = ws && (def.cat === 'farm' || def.cat === 'water') ? Math.min(3, ws.length) : 0;
      if ((ud.farmers || []).length !== nW) {
        (ud.farmers || []).forEach(f => v.g.remove(f));
        ud.farmers = [];
        for (let k = 0; k < nW; k++) {
          const f = makePersonMesh(def.cat === 'water' ? 0x3a86ff : pick([0x5c8a2e, 0x2f5f8f, 0xc8402f]), { plain: true, straw: def.cat === 'farm', sou: def.cat === 'water' });
          const hw = def.w * CELL / 2 - 1.2, hd = def.h * CELL / 2 - 1.2;
          f.userData.box = [hw, hd];
          if (def.cat === 'water') { const a = rand(0, 6.28); f.position.set(Math.cos(a) * 3.6, 0.3, Math.sin(a) * 3.6); } else f.position.set(rand(-hw, hw), 0.3, rand(-hd, hd));
          f.userData.to = [f.position.x, f.position.z]; f.userData.wait = rand(0, 2);
          v.g.add(f); ud.farmers.push(f);
        }
      }
      for (const f of ud.farmers || []) {
        const fd = f.userData, dx = fd.to[0] - f.position.x, dz = fd.to[1] - f.position.z, dist = Math.hypot(dx, dz);
        if (dist > 0.1) {
          const st = Math.min(dist, dt * 1.6);
          f.position.x += dx / dist * st; f.position.z += dz / dist * st;
          f.rotation.y = Math.atan2(dx, dz);
          fd.legs && fd.legs.forEach((l, k) => (l.rotation.x = Math.sin(time * 10 + k * Math.PI) * 0.5));
          fd.arms[0].rotation.x = fd.arms[1].rotation.x = Math.sin(time * 10) * 0.4;
        } else {
          fd.wait -= dt;
          fd.arms[0].rotation.x = fd.arms[1].rotation.x = -0.9 - Math.abs(Math.sin(time * 5 + b.u)) * 0.9;   // hoeing, picking, casting
          if (fd.wait <= 0) { if (def.cat === 'water') { const a = rand(0, 6.28); fd.to = [Math.cos(a) * 3.6, Math.sin(a) * 3.6]; } else fd.to = [rand(-fd.box[0], fd.box[0]), rand(-fd.box[1], fd.box[1])]; fd.wait = rand(2, 5); }
        }
      }
      if (ud.herd) for (const a of ud.herd) {
        a.rotation.y += Math.sin(time * 0.3 + a.userData.home[0]) * dt * 0.4;
        a.position.x = a.userData.home[0] + Math.sin(time * 0.2 + a.userData.home[1]) * 0.6;
        a.children[1].rotation.z = Math.sin(time * 2 + a.userData.home[0]) * 0.1;
      }
      if (ud.fish && ws && ws.length) for (const f of ud.fish) {
        f.userData.t += dt;
        const t = f.userData.t % 4;
        if (t < 0.8) { if (!f.userData.x || t < dt * 1.5) { f.userData.x = rand(-2, 2); f.userData.z = rand(-2, 2); } f.position.set(f.userData.x + t, 0.45 + Math.sin(t / 0.8 * Math.PI) * 1.2, f.userData.z); f.rotation.z = 1 - t * 2.5; }
        else f.position.y = -1;
      }
      if (ud.boat) ud.boat.rotation.z = Math.sin(time * 1.5) * 0.05;
      if (ud.sway) ud.sway.rotation.z = Math.sin(time * 1.3 + b.u) * 0.02;
    }
  }

  // =====================================================================
  //  Selection ring and placement ghost
  // =====================================================================
  function footprintMesh(w, h, color, opacity) {
    const m = new T.Mesh(boxGeo(), new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.scale.set(w * CELL - 0.2, 0.06, h * CELL - 0.2);
    m.renderOrder = 5;
    return m;
  }
  function updateSelection(state) {
    if (selRing) { parkRoot.remove(selRing); selRing.material.dispose(); selRing = null; }
    const b = selU && E.findB(state, P, selU);
    if (!b || place) return;
    const d = E.DEFS[b.t];
    selRing = footprintMesh(d.w, d.h, 0xffd24a, 0.45);
    selRing.position.set(footX(b, d), 0.26, footZ(b, d));
    parkRoot.add(selRing);
  }
  W.select = function (u) { selU = u || 0; if (lastState) updateSelection(lastState); };

  // Placement: a ghost of the building follows your finger; green = fits, red = blocked.
  W.startPlacement = function (opts, state) {
    W.endPlacement();
    const d = E.DEFS[opts.t];
    const g = new T.Group();
    const fake = { u: -1, t: opts.t, x: opts.x, y: opts.y, lv: opts.lv || 1 };
    const view = makeView(fake);
    parkRoot.remove(view.g);
    view.model.traverse(o => { if (o.isMesh) o.castShadow = false; });
    g.add(view.model);
    const tile = footprintMesh(d.w, d.h, 0x45e08a, 0.5);
    tile.position.y = 0.08;
    g.add(tile);
    let rangeM = null;
    if (d.cat === 'decor') {   // show which cells this decoration will boost
      rangeM = footprintMesh(d.w + d.radius * 2, d.h + d.radius * 2, 0xffd24a, 0.18);
      rangeM.position.y = 0.05;
      g.add(rangeM);
    }
    parkRoot.add(g);
    place = { t: opts.t, x: opts.x, y: opts.y, moveU: opts.moveU || 0, g, tile, view };
    if (opts.moveU) { const v = views.get(opts.moveU); if (v) v.g.visible = false; }
    W.updatePlacement(opts.x, opts.y, state);
    updateSelection(state);
    // grid lines over your land
    const lines = [];
    const park = state.parks[P];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (E.ownsCell(park, x, y)) lines.push([x, y]);
    const grid = new T.InstancedMesh(geo('gridCell', () => new T.PlaneGeometry(CELL - 0.25, CELL - 0.25).rotateX(-Math.PI / 2)),
      once('gridMat', () => new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false })), lines.length);
    const m4 = new T.Matrix4();
    lines.forEach(([x, y], i) => grid.setMatrixAt(i, m4.makeTranslation(cellX(x), 0.24, cellX(y))));
    parkRoot.add(grid);
    place.grid = grid;
  };
  W.updatePlacement = function (x, y, state) {
    if (!place) return null;
    const d = E.DEFS[place.t];
    place.x = clamp(x, 0, G - d.w); place.y = clamp(y, 0, G - d.h);
    const ok = E.fits(state.parks[P], place.t, place.x, place.y, place.moveU || -1);
    place.g.position.set((place.x + d.w / 2 - G / 2) * CELL, 0.25 + (ok ? 0 : 0.3), (place.y + d.h / 2 - G / 2) * CELL);
    place.tile.material.color.setHex(ok ? 0x45e08a : 0xff4d5e);
    place.ok = ok;
    return { x: place.x, y: place.y, ok };
  };
  W.endPlacement = function () {
    if (!place) return;
    if (place.moveU) { const v = views.get(place.moveU); if (v) v.g.visible = true; }
    disposeGroup(place.g);
    if (place.grid) { parkRoot.remove(place.grid); place.grid.dispose(); }
    place = null;
    if (lastState) updateSelection(lastState);
  };
  W.placement = () => (place ? { t: place.t, x: place.x, y: place.y, ok: place.ok, moveU: place.moveU } : null);

  // =====================================================================
  //  Camera and input
  // =====================================================================
  function updateCamera(dt) {
    const g = cam.g;
    g.tx = clamp(g.tx, -HALF - 20, HALF + 20); g.tz = clamp(g.tz, -HALF - 20, HALF + 20); g.dist = clamp(g.dist, 28, 230);
    const k = 1 - Math.exp(-dt * cam.ease);
    cam.tx += (g.tx - cam.tx) * k; cam.tz += (g.tz - cam.tz) * k;
    cam.dist += (g.dist - cam.dist) * k; cam.yaw += (g.yaw - cam.yaw) * k;
    const ce = Math.cos(cam.el), se = Math.sin(cam.el);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * ce * cam.dist, se * cam.dist + 1.5, cam.tz + Math.cos(cam.yaw) * ce * cam.dist);
    camera.lookAt(cam.tx, 1.5, cam.tz);
    camera.updateMatrixWorld();
  }
  const ray = new T.Raycaster(), ndc = new T.Vector2(), ground = new T.Plane(new T.Vector3(0, 1, 0), -0.25);
  function rayAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function cellAt(clientX, clientY) {
    rayAt(clientX, clientY);
    if (!ray.ray.intersectPlane(ground, tmpV)) return null;
    return { x: Math.floor(tmpV.x / CELL + G / 2), y: Math.floor(tmpV.z / CELL + G / 2), wx: tmpV.x, wz: tmpV.z };
  }
  function bindInput() {
    const pts = new Map();
    let moved = 0, downAt = 0, lastPinch = 0, lastAngle = 0, dragGhost = false, grab = null;
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
      if (pts.size === 1) {
        moved = 0; downAt = performance.now(); dragGhost = false;
        if (place) {
          const c = cellAt(e.clientX, e.clientY), d = E.DEFS[place.t];
          if (c && c.x >= place.x - 1 && c.x <= place.x + d.w && c.y >= place.y - 1 && c.y <= place.y + d.h) { dragGhost = true; grab = [c.x - place.x, c.y - place.y]; }
        }
      }
      if (pts.size === 2) {
        dragGhost = false;
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
        if (dragGhost && place) {
          const c = cellAt(e.clientX, e.clientY);
          if (c && lastState) { const r = W.updatePlacement(c.x - grab[0], c.y - grab[1], lastState); if (hooks.onPlacement) hooks.onPlacement(r); }
        } else if (p.button === 2 || e.shiftKey) cam.g.yaw -= dx * 0.008;
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
      lastPinch = 0; dragGhost = false;
    });
    canvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); lastPinch = 0; dragGhost = false; });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.g.dist *= Math.exp(e.deltaY * 0.0012); cam.ease = 14; }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function tapAt(clientX, clientY) {
    if (place) {
      const c = cellAt(clientX, clientY);
      if (c && lastState) { const d = E.DEFS[place.t]; const r = W.updatePlacement(c.x - Math.floor((d.w - 1) / 2), c.y - Math.floor((d.h - 1) / 2), lastState); if (hooks.onPlacement) hooks.onPlacement(r); }
      return;
    }
    rayAt(clientX, clientY);
    for (let i = 0; i < tips.length; i++) {
      tips[i].g.getWorldPosition(tmpV);
      if (ray.ray.distanceSqToPoint(tmpV) < 1.8 * 1.8) {
        W.burst(tmpV.x, tmpV.y + 0.5, tmpV.z, 14);
        disposeGroup(tips[i].g); tips.splice(i, 1);
        if (hooks.onTip) hooks.onTip(clientX, clientY);
        return;
      }
    }
    if (vip) {
      tmpV.set(vip.p.x, 1.4, vip.p.z);
      if (ray.ray.distanceSqToPoint(tmpV) < 2.6 * 2.6) { W.burst(vip.p.x, 2, vip.p.z, 40); endVip(); if (hooks.onPickVip) hooks.onPickVip(clientX, clientY); return; }
    }
    // Collect bubbles are big targets of their own
    let best = null, bd = 1e9;
    for (const [u, v] of views) {
      if (v.bubble && ray.ray.distanceSqToPoint(v.bubble.position) < 1.7 * 1.7) { if (hooks.onPickBuilding) hooks.onPickBuilding(u, clientX, clientY); return; }
      const hit = ray.ray.intersectBox(v.box, tmpV);
      if (!hit) continue;
      const d = hit.distanceToSquared(camera.position);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) { if (hooks.onPickBuilding) hooks.onPickBuilding(best, clientX, clientY); return; }
    const c = cellAt(clientX, clientY);
    if (c && c.x >= 0 && c.y >= 0 && c.x < G && c.y < G) { if (hooks.onPickCell) hooks.onPickCell(c.x, c.y, E.parcelOf(c.x, c.y)); }
    else if (hooks.onPickNothing) hooks.onPickNothing();
  }

  // =====================================================================
  //  Day, night and the tilt-shift lens
  // =====================================================================
  function updateDayNight(dt) {
    if (fixedDay !== null) dayT = fixedDay;
    else if (clockNow) { const c = E.gameClock(clockNow), hr = c.hour + c.minute / 60; dayT = (((hr - 6.5) / 24) % 1 + 1) % 1; }
    let day;
    if (dayT < 0.55) day = 1; else if (dayT < 0.65) day = 1 - (dayT - 0.55) / 0.1; else if (dayT < 0.9) day = 0; else day = (dayT - 0.9) / 0.1;
    const dusk = 1 - Math.abs(day - 0.5) * 2;
    const sky = scene.background;
    sky.copy(skyNight).lerp(skyDay, day).lerp(skyDusk, dusk * 0.55);
    const dim = wxKind === 'rain' ? 0.6 : wxKind === 'snow' ? 0.8 : wxKind === 'cloud' ? 0.85 : 1;
    if (dim < 1) sky.lerp(tmpColor.setHex(0x8f99ad), (1 - dim) * 0.9 * (0.3 + day * 0.7));
    fog.color.copy(sky);
    sun.intensity = (0.35 + day * 2.9) * dim;
    sun.color.setHex(0xfff1dc).lerp(tmpColor.setHex(0xff9a5c), dusk * 0.7);
    hemi.intensity = 0.7 + day * 1.0;
    const night = 1 - day;
    for (const n of nightMats) n.m.emissiveIntensity = (n.min || 0) + (n.max - (n.min || 0)) * night;
    glowMat.color.setScalar(0.5 + 0.5 * night);
    W.night = night;
  }
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
          c = mix(vec3(l), c, 1.28);
          c = (c - 0.18) * 1.08 + 0.18;
          vec2 v = vUv - 0.5;
          c *= 1.0 - dot(v, v) * 0.55;
          gl_FragColor = vec4(max(c, 0.0), 1.0);
          #include <colorspace_fragment>
        }`;
      const u = { focus: { value: 0.55 }, band: { value: 0.12 } };
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
    post.sceneRT.setSize(sz.x, sz.y); post.blurA.setSize(bw, bh); post.blurB.setSize(bw, bh);
    post.hMat.uniforms.dir.value.set(1 / bw, 0); post.vMat.uniforms.dir.value.set(0, 1 / bh);
  }
  W.setLens = function (on) { W.lens = !!on; };
  W.lens = true;

  // =====================================================================
  //  Public API
  // =====================================================================
  W.init = function (canvasEl, h) {
    canvas = canvasEl; hooks = h || {};
    try { renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
    if (!renderer.getContext()) return false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    skyDay = new T.Color(0x9ad8ff); skyDusk = new T.Color(0xff9e6b); skyNight = new T.Color(0x161b3d);
    scene.background = skyDay.clone();
    fog = new T.Fog(scene.background.getHex(), 320, 900);
    scene.fog = fog;
    camera = new T.PerspectiveCamera(24, 1, 2, 1500);
    hemi = new T.HemisphereLight(0xd8e9ff, 0x8f86b0, 1.7);
    scene.add(hemi);
    sun = new T.DirectionalLight(0xfff1dc, 2.8);
    sun.position.set(-70, 80, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 320;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
    scene.add(sun, sun.target);
    glowMat = new T.MeshBasicMaterial({ color: 0xffffff });
    glassMat = new T.MeshLambertMaterial({ color: 0x79b8e6, emissive: 0xffd27a, emissiveIntensity: 0 });
    bulbMat = new T.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffc94d, emissiveIntensity: 0.2 });
    headMat = new T.MeshLambertMaterial({ color: 0xfff7d6, emissive: 0xfff2b0, emissiveIntensity: 0.1 });
    tailMat = new T.MeshLambertMaterial({ color: 0xc92a2a, emissive: 0xff3b3b, emissiveIntensity: 0.1 });
    nightMats.push({ m: glassMat, max: 0.9 }, { m: headMat, max: 1.6, min: 0.1 }, { m: tailMat, max: 1.2, min: 0.1 }, { m: bulbMat, max: 1.5, min: 0.2 });
    buildFx();
    bindInput();
    buildPost();
    W.ok = true;
    W.setQuality(0);
    window.addEventListener('resize', W.resize);
    return true;
  };

  // Build the map for one park (location).
  W.loadPark = function (pi, state) {
    if (!W.ok) return;
    if (root) { endVip(); people.slice().forEach(removePerson); cars = []; disposeGroup(root); }
    P = pi; style = STYLES[pi];
    seed = 1337 + pi * 7919;
    skyDay.setHex([0x9ad8ff, 0x8fd3ff, 0x9fcbf5, 0xb3a3f5][pi]);
    skyNight.setHex([0x161b3d, 0x161b3d, 0x141638, 0x1c0f3d][pi]);
    root = new T.Group(); scene.add(root);
    parkRoot = new T.Group(); root.add(parkRoot);
    views = new Map(); people = []; movers = []; tips = []; landKey = ''; landGroup = null; selU = 0; selRing = null; place = null;
    loadedAt = time; nextWander = 0; nextCar = 0;
    props = []; glows = []; blobs = [];
    buildStreets();
    buildNeighbourhood();
    flushInstances(root);
    for (let k = 0; k < 16; k++) spawnCar();
    W.sync(state, true);
    W.setQuality(quality);
  };
  W.park = () => P;

  // Match the 3D park to the save.
  W.sync = function (state, instant) {
    if (!W.ok || !root) return;
    lastState = state;
    if (state.park !== P) return;
    buildLand(state);
    const park = state.parks[P];
    const alive = new Set();
    let changed = false;
    for (const b of park.b) {
      alive.add(b.u);
      const building = !!E.jobFor(state, P, b.u);
      const key = viewKey(b, building && b.lv === 0);
      let v = views.get(b.u);
      if (v && v.key === key) { updateViewBox(v, b); continue; }
      changed = true;
      const old = v;
      v = makeView(b);
      v.key = key;
      if (old) {
        v.queue = old.queue; v.incoming = old.incoming; v.nextSpawn = old.nextSpawn;
        v.queue.forEach(p => (p.v = v));
        people.forEach(p => { if (p.v === old) p.v = v; });
        if (old.bubble) { parkRoot.remove(old.bubble); old.bubble.material.dispose(); }
        if (old.prog) { parkRoot.remove(old.progS); old.progS.material.dispose(); }
        disposeGroup(old.g);
        if (old.scaf) disposeGroup(old.scaf);
        if (!instant) { v.pop = 1; W.burst(v.g.position.x, v.h + 1, v.g.position.z, 30); }
      }
      views.set(b.u, v);
      updateViewBox(v, b);
    }
    for (const [u, v] of views) {
      if (alive.has(u)) continue;
      changed = true;
      v.queue.forEach(p => { p.v = null; leave(p); });
      if (v.bubble) { parkRoot.remove(v.bubble); v.bubble.material.dispose(); }
      if (v.prog) { parkRoot.remove(v.progS); v.progS.material.dispose(); }
      if (v.scaf) disposeGroup(v.scaf);
      disposeGroup(v.g);
      views.delete(u);
    }
    // scaffolding on anything under construction; a building being built shows only its frame
    for (const b of park.b) {
      const v = views.get(b.u), job = E.jobFor(state, P, b.u);
      if (job && !v.scaf) {
        const d = E.DEFS[b.t];
        v.scaf = scaffold(d.w * CELL - 0.8, d.h * CELL - 0.8, Math.max(3.5, b.lv === 0 ? 3.5 : v.h + 0.5));
        v.scaf.position.copy(v.g.position);
        parkRoot.add(v.scaf);
        v.model.visible = b.lv > 0;
      } else if (!job && v.scaf) { disposeGroup(v.scaf); v.scaf = null; v.model.visible = true; }
    }
    if (changed) { rebuildWalk(state); rebuildSeats(state); }
    updateSelection(state);
  };

  W.pulse = function (u) { const v = views.get(u); if (v) v.pop = 1; };
  W.focusBuilding = function (u, instant) {
    const v = views.get(u);
    if (!v) return;
    W.focusAt(v.g.position.x, v.g.position.z + 2, instant, Math.max(55, 40 + v.h * 3));
  };
  W.focusCell = function (x, y, instant) { W.focusAt(cellX(x), cellX(y), instant); };
  W.focusAt = function (x, z, instant, dist) {
    cam.g.tx = x; cam.g.tz = z;
    if (dist) cam.g.dist = dist;
    cam.ease = 5;
    if (instant) { cam.tx = x; cam.tz = z; if (dist) cam.dist = dist; cam.yaw = cam.g.yaw; }
  };
  // Opening shot: sweep down from high above.
  W.intro = function () { cam.dist = 230; cam.yaw = cam.g.yaw + 1.4; cam.ease = 1.2; introUntil = time + 4; };
  W.screenPos = function (x, y, z) {
    tmpV.set(x, y, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (tmpV.x + 1) / 2 * r.width, y: r.top + (1 - tmpV.y) / 2 * r.height, on: tmpV.z < 1 && Math.abs(tmpV.x) < 1 && Math.abs(tmpV.y) < 1 };
  };
  W.buildingScreenPos = function (u) { const v = views.get(u); return v ? W.screenPos(v.g.position.x, Math.max(v.h, 3) + 1, v.g.position.z) : null; };
  W.cellScreenPos = function (x, y) { return W.screenPos(cellX(x), 0.3, cellX(y)); };
  W.vipScreenPos = function () { if (!vip) return null; const p = W.screenPos(vip.p.x, 1.4, vip.p.z); p.visible = p.on; return p; };

  W.resize = function () {
    if (!renderer) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.7 ? 30 : 22;
    camera.updateProjectionMatrix();
    sizePost();
  };
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

  W.update = function (dt, state, now) {
    if (!W.ok || !root) return;
    time += dt;
    lastState = state;
    clockNow = now;
    if (introUntil && time > introUntil) { introUntil = 0; cam.ease = 8; }
    else if (!introUntil && cam.ease !== 8) cam.ease += (8 - cam.ease) * Math.min(1, dt * 2);
    updateCamera(dt);
    updateDayNight(dt);
    updateBuildings(dt, state, now);
    updatePeople(dt);
    updateCars(dt);
    updateTips();
    for (const m of movers) m(dt);
    updateFx(dt);
    updateWeather(dt);
    if (selRing) selRing.material.opacity = 0.3 + Math.abs(Math.sin(time * 3)) * 0.3;
    if (vip && time > vip.until) { endVip(); if (hooks.onVipGone) hooks.onVipGone(); }
  };
  W.render = function () {
    if (!W.ok) return;
    if (canvas.width !== Math.round(canvas.clientWidth * renderer.getPixelRatio())) W.resize();
    if (!post || !W.lens) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
    renderer.setRenderTarget(post.sceneRT); renderer.render(scene, camera);
    post.quad.material = post.hMat; renderer.setRenderTarget(post.blurA); renderer.render(post.pScene, post.pCam);
    post.quad.material = post.vMat; renderer.setRenderTarget(post.blurB); renderer.render(post.pScene, post.pCam);
    post.quad.material = post.fMat; renderer.setRenderTarget(null); renderer.render(post.pScene, post.pCam);
  };

  W.debug = {
    get stats() { return { people: people.length, cars: cars.length, views: views.size, quality, park: P }; },
    get scene() { return scene; },
    setRound(on) { ROUND = !!on; },
    setTime(t) { fixedDay = t; },
    get vip() { return vip ? { x: vip.p.x, z: vip.p.z } : null; },
    dropTip(x, z) { dropTip(x, z); },
    get tips() { return tips.map(t => { t.g.getWorldPosition(tmpV); return { x: tmpV.x, y: tmpV.y, z: tmpV.z }; }); },
    cam,
  };
})();
