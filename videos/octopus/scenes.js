// "This animal has three hearts, blue blood, and nine brains." — POP style, ~37 s, cut every 1–3 s.
// Text: *word* = yellow. Titles sit y 260–760; captions own y 1250–1510; keep x ≤ 930 (Reels buttons).
const S = (n) => `assets/shots/${n}.jpg`, K = (n) => `assets/stickers/${n}.png`;
window.FILM = {
  duration: 37.3,
  musicGain: -19,
  shots: [
    // HOOK — three claims, three cuts, one second each
    { t: 0, img: S("red"), over: [
      { type: "title", text: "*3* HEARTS", y: 300, size: 150, at: 0.0 },
      { type: "sticker", src: K("heart"), x: 640, y: 560, w: 220, rot: 10, at: 1.12 },
    ] },
    { t: 1.84, img: S("blue"), over: [
      { type: "title", text: "*BLUE* BLOOD", y: 300, size: 140, at: 1.84 },
      { type: "sticker", src: K("blue_heart"), x: 640, y: 640, w: 210, rot: 10, at: 2.09 },
    ] },
    { t: 2.81, img: S("giant"), over: [
      { type: "title", text: "*9* BRAINS", y: 300, size: 150, at: 2.81 },
      { type: "sticker", src: K("brain"), x: 600, y: 560, w: 240, rot: 8, at: 3.16 },
    ] },
    { t: 4.05, img: S("coral"), over: [{ type: "title", text: "THE\n*OCTOPUS*", y: 290, size: 140, at: 4.24 }] },
    { t: 5.29, img: S("tentacles"), over: [{ type: "title", text: "IT GETS\n*WEIRDER*", y: 290, size: 130, at: 5.39 }] },
    // #1 — three hearts
    { t: 6.36, img: S("spotted"), over: [
      { type: "badge", text: "#1  3 hearts", at: 6.36 },
      { type: "sticker", src: K("heart"), x: 110, y: 470, w: 230, rot: -8, at: 7.32 },
      { type: "sticker", src: K("heart"), x: 390, y: 450, w: 230, rot: 4, at: 7.58 },
      { type: "title", text: "→ GILLS", y: 720, size: 110, at: 8.43 },
      { type: "sticker", src: K("heart"), x: 670, y: 470, w: 230, rot: 10, at: 9.33 },
    ] },
    { t: 11.14, img: S("blue"), zoom: [1.2, 1.05], over: [
      { type: "title", text: "SWIMS =\nHEART *STOPS*", y: 290, size: 120, at: 12.03 },
      { type: "sticker", src: K("broken_heart"), x: 380, y: 720, w: 240, rot: -6, at: 12.38 },
    ] },
    { t: 13.35, img: S("crawl"), over: [{ type: "title", text: "*CRAWL*\nMODE", y: 290, size: 140, at: 13.83 }] },
    // #2 — blue blood
    { t: 14.58, img: S("giant"), zoom: [1.25, 1.08], over: [
      { type: "badge", text: "#2  blue blood", at: 14.58 },
      { type: "sticker", src: K("blue_heart"), x: 640, y: 470, w: 240, rot: 8, at: 16.0 },
    ] },
    { t: 16.66, img: S("den"), over: [{ type: "title", text: "*COPPER*\nNOT IRON", y: 300, size: 130, at: 17.22 }] },
    // #3 — nine brains
    { t: 18.89, img: S("red"), zoom: [1.3, 1.1], over: [
      { type: "badge", text: "#3  9 brains", at: 18.89 },
      { type: "sticker", src: K("brain"), x: 120, y: 450, w: 260, rot: -8, at: 20.13 },
      { type: "num", from: 0, to: 8, prefix: "+", y: 420, size: 260, at: 21.0, dur: 1.2 },
      { type: "title", text: "MINI BRAINS\nIN EVERY ARM", y: 760, size: 92, at: 22.18 },
    ] },
    { t: 23.08, img: S("tentacles"), zoom: [1.25, 1.05], over: [
      { type: "title", text: "ARMS THAT\n*TASTE*", y: 290, size: 130, at: 23.69 },
      { type: "sticker", src: K("tongue"), x: 620, y: 620, w: 230, rot: 8, at: 24.63 },
    ] },
    // the craziest part
    { t: 25.52, img: S("coral"), zoom: [1.3, 1.1], over: [
      { type: "title", text: "THE *CRAZIEST*\nPART", y: 290, size: 120, at: 25.63 },
      { type: "sticker", src: K("zap"), x: 660, y: 600, w: 220, rot: 10, at: 26.16 },
    ] },
    { t: 26.82, img: S("hidden"), over: [{ type: "title", text: "NEW COLOR\nIN *0.2 SEC*", y: 290, size: 120, at: 27.84 }] },
    { t: 28.98, img: S("gray"), over: [{ type: "title", text: "BUT…\n*COLORBLIND*?!", y: 290, size: 120, at: 29.13 }] },
    { t: 30.58, img: S("den"), zoom: [1.35, 1.15], over: [
      { type: "title", text: "SKIN THAT\n*SENSES LIGHT*", y: 290, size: 110, at: 31.37 },
      { type: "sticker", src: K("eyes"), x: 640, y: 620, w: 220, rot: -6, at: 32.37 },
    ] },
    // CTA — comment 1, 2 or 3
    { t: 33.07, img: S("red"), zoom: [1.05, 1.18], over: [
      { type: "title", text: "WHICH ONE\nBLEW YOUR *MIND*?", y: 280, size: 104, at: 33.17 },
      { type: "sticker", src: K("one"), x: 100, y: 640, w: 200, rot: -8, at: 34.55 },
      { type: "sticker", src: K("two"), x: 370, y: 620, w: 200, rot: 3, at: 35.10 },
      { type: "sticker", src: K("three"), x: 640, y: 640, w: 200, rot: 9, at: 35.88 },
    ] },
  ],
};
