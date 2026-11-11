#!/usr/bin/env node
/*
 * Generates App Store / Google Play screenshots from the running web build.
 * Usage: npm run serve  (in another terminal), then: node tools/screenshots.js [url]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL = process.argv[2] || 'http://localhost:8765/index.html';
const OUT = path.join(__dirname, '..', 'store', 'screenshots');

// CSS viewport × scale = required pixel size
const TARGETS = [
  { dir: 'ios-6.9', width: 440, height: 956, scale: 3 },        // 1320×2868
  { dir: 'ios-ipad-13', width: 1032, height: 1376, scale: 2 },  // 2064×2752
  { dir: 'android-phone', width: 360, height: 640, scale: 3 },  // 1080×1920
];

// A mid-game save so the screenshots look exciting.
function demoSave() {
  const now = Date.now();
  const levels = [325, 210, 180, 150, 120, 100, 75, 50, 25, 0];
  return {
    cash: 8.4e12, runEarnings: 2e13, lifetime: 6e13, stars: 48, prestiges: 1,
    biz: levels.map((level, i) => ({ level, progress: 0.15 * (i % 6), running: i < 9, manager: i < 8 })),
    upgrades: { b0u0: true, b1u0: true, b2u0: true, b3u0: true, g0: true, b0u1: true },
    achievements: Object.fromEntries(['earn_1000', 'earn_1000000', 'earn_1000000000', 'earn_1000000000000', 'lvl_cart_25', 'lvl_cart_100',
      'lvl_cart_250', 'lvl_dumpling_25', 'lvl_dumpling_100', 'lvl_tea_25', 'lvl_tea_100', 'lvl_taco_25', 'lvl_taco_100', 'prestige_1',
      'vip_1', 'vip_10', 'tap_100', 'mgr_1'].map(k => [k, true])),
    boostUntil: now + 3 * 3600e3 + 42 * 60e3, lastSeen: now, createdAt: now - 86400e3 * 3,
    daily: { last: new Date().toISOString().slice(0, 10), streak: 3 },
    stats: { taps: 812, golden: 14, playTime: 5 * 3600, bestRun: 2e13 },
    settings: { sound: false, haptics: false, buyMode: 3 }, tutorial: 9,
  };
}

const SCENES = [
  { name: '1-shops', tab: 'biz' },
  { name: '2-vip', tab: 'biz', vip: true },
  { name: '3-upgrades', tab: 'upgrades' },
  { name: '4-franchise', tab: 'franchise' },
  { name: '5-welcome-back', tab: 'biz', offline: true },
];

(async () => {
  const browser = await chromium.launch();
  for (const t of TARGETS) {
    fs.mkdirSync(path.join(OUT, t.dir), { recursive: true });
    for (const scene of SCENES) {
      const ctx = await browser.newContext({ viewport: { width: t.width, height: t.height }, deviceScaleFactor: t.scale, hasTouch: true, isMobile: t.dir !== 'ios-ipad-13' });
      const page = await ctx.newPage();
      const save = demoSave();
      // Pin today's daily reward as claimed so no popup appears (dayKey uses local time).
      const d = new Date();
      save.daily.last = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (scene.offline) save.lastSeen = Date.now() - (5 * 3600e3 + 17 * 60e3);
      await page.addInitScript(s => { localStorage.setItem('yum-empire-save-v1', s); }, JSON.stringify(save));
      await page.goto(URL);
      await page.waitForTimeout(600);
      if (!scene.offline && await page.isVisible('#modal')) await page.click('#modalActions button:last-child');
      await page.evaluate(tab => window.YumEmpire.showTab(tab), scene.tab);
      if (scene.vip) {
        await page.evaluate(() => {
          const v = document.getElementById('vip');
          v.hidden = false; v.style.left = '58%'; v.style.top = '46%';
          window.YumEmpire.state.frenzyUntil = Date.now() + 24000;
        });
      }
      await page.waitForTimeout(1300);
      await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
      await page.screenshot({ path: path.join(OUT, t.dir, scene.name + '.png') });
      await ctx.close();
    }
    console.log('wrote', t.dir);
  }

  // Google Play feature graphic 1024×500
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  const icon = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(__dirname, '..', 'www/icons/icon.svg')).toString('base64');
  await page.setContent(`<body style="margin:0;width:1024px;height:500px;background:radial-gradient(circle at 30% 30%,#5a33b8,#1b1236 75%);display:flex;align-items:center;gap:48px;padding:0 64px;box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff7ec">
    <img src="${icon}" style="width:300px;border-radius:64px;box-shadow:0 20px 50px rgba(0,0,0,.45)">
    <div><div style="font-size:76px;font-weight:900;line-height:1">Yum Empire</div>
    <div style="font-size:34px;font-weight:800;color:#ffc93d;margin-top:14px">Food Tycoon</div>
    <div style="font-size:52px;margin-top:22px">🍜 🥟 🧋 🌮 🍕 🍣</div></div></body>`);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, 'feature-graphic.png') });
  console.log('wrote feature-graphic.png');
  await browser.close();
})();
