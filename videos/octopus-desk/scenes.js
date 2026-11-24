// "This animal has three hearts, blue blood, and nine brains." — desk style v2: 3D cut-outs, fast stations, ~37 s.
// Every `at` sits on its word in words.js. Station frame ≈ x −440…+340, y −560…+400 around (x, y) at zoom 1.08.
const I = (n) => `assets/img/${n}.png`;
window.FILM = {
  duration: 37.3,
  accent: "#ec5626",
  musicGain: -19,
  stations: [
    // HOOK — "This animal has three hearts, blue blood, and nine brains."
    { t: 0, x: 1000, y: 620, zoom: 1.08, items: [
      { type: "cutout", src: I("octopus"), w: 360, x: 800, y: 190, rot: -4, at: 0.09, anim: "pop" },
      { type: "cutout", src: I("heart"), w: 200, x: 580, y: 610, rot: -8, at: 0.79 },
      { type: "hand", text: "x3", x: 640, y: 820, size: 96, rot: -6, at: 1.12 },
      { type: "cutout", src: I("blue_heart"), w: 200, x: 840, y: 600, rot: 5, at: 1.84 },
      { type: "hand", text: "blue!", x: 860, y: 820, size: 84, rot: 4, at: 2.09 },
      { type: "cutout", src: I("brain"), w: 220, x: 1100, y: 600, rot: 7, at: 2.81 },
      { type: "hand", text: "x9", x: 1160, y: 820, size: 96, rot: -4, at: 3.16 },
    ] },
    // "It's the octopus. And it gets weirder."
    { t: 4.1, flight: 0.7, x: 2500, y: 770, zoom: 1.08, items: [
      { type: "text", text: "MEET THE\nOCTOPUS.", x: 2080, y: 360, size: 112, rot: -2, at: 4.24 },
      { type: "hand", text: "it gets weirder…", x: 2090, y: 690, size: 80, rot: -3, at: 5.39 },
      { type: "cutout", src: I("mind_blown"), w: 230, x: 2520, y: 820, rot: 8, at: 5.6, anim: "pop" },
    ] },
    // #1 — "Two hearts pump blood to the gills. The third pumps it everywhere else."
    { t: 6.5, flight: 0.6, x: 2400, y: 2020, zoom: 1.08, items: [
      { type: "card", num: "01", title: "THREE\nHEARTS", x: 1990, y: 1600, rot: -2, at: 6.56 },
      { type: "cutout", src: I("heart"), w: 190, x: 2000, y: 1880, rot: -6, at: 7.32 },
      { type: "cutout", src: I("heart"), w: 190, x: 2210, y: 1880, rot: 5, at: 7.62 },
      { type: "hand", text: "→ gills", x: 2020, y: 2090, size: 76, rot: -3, at: 8.43 },
      { type: "cutout", src: I("heart"), w: 240, x: 2470, y: 1850, rot: 8, at: 9.33, anim: "pop" },
      { type: "hand", text: "→ whole body", x: 2380, y: 2110, size: 62, rot: -4, at: 10.01 },
    ] },
    // "But when it swims, that heart stops. So it would rather crawl."
    { t: 11.0, flight: 0.7, x: 1100, y: 2270, zoom: 1.08, items: [
      { type: "cutout", src: I("swimmer"), w: 270, x: 690, y: 1870, rot: -4, at: 11.38 },
      { type: "hand", text: "heart stops!", x: 680, y: 2170, size: 76, rot: -4, at: 12.03 },
      { type: "cutout", src: I("broken_heart"), w: 240, x: 1010, y: 1870, rot: 6, at: 12.38, anim: "pop" },
      { type: "cutout", src: I("octopus"), w: 230, x: 1080, y: 2190, rot: 4, at: 13.83, anim: "slide", fx: 900, fy: 0 },
    ] },
    // #2 — "Its blood is blue, because it uses copper, not iron."
    { t: 14.9, flight: 0.7, x: 2200, y: 3470, zoom: 1.08, items: [
      { type: "card", num: "02", title: "BLUE\nBLOOD", x: 1780, y: 3050, rot: 2, at: 15.0 },
      { type: "cutout", src: I("blue_heart"), w: 230, x: 1790, y: 3320, rot: -6, at: 16.0, anim: "pop" },
      { type: "cutout", src: I("coin"), w: 200, x: 2110, y: 3330, rot: 5, at: 17.22 },
      { type: "hand", text: "copper ✓", x: 2070, y: 3560, size: 70, rot: -3, at: 17.6 },
      { type: "cutout", src: I("bolt"), w: 170, x: 2370, y: 3340, rot: -8, at: 17.97 },
      { type: "marker", kind: "slash", x: 2350, y: 3330, w: 220, h: 200, at: 18.25 },
    ] },
    // #3 — "One main brain, plus a mini brain in every arm. Its arms can even taste, just by touching."
    { t: 19.2, flight: 0.7, x: 3500, y: 2480, zoom: 1.08, items: [
      { type: "card", num: "03", title: "NINE\nBRAINS", x: 3080, y: 2050, rot: -2, at: 19.3 },
      { type: "cutout", src: I("brain"), w: 260, x: 3080, y: 2320, rot: -5, at: 20.13 },
      { type: "hand", text: "+8 mini ones", x: 3370, y: 2400, size: 66, rot: -4, at: 21.35 },
      { type: "cutout", src: I("crab"), w: 220, x: 3110, y: 2630, rot: 6, at: 23.69, anim: "pop" },
      { type: "hand", text: "arms taste!", x: 3370, y: 2700, size: 72, rot: -3, at: 24.34 },
    ] },
    // "And the craziest part? It changes color in less than a second. But it's probably colorblind."
    { t: 25.4, flight: 0.7, x: 1300, y: 3870, zoom: 1.08, items: [
      { type: "text", text: "THE CRAZIEST\nPART", x: 880, y: 3440, size: 96, rot: -2, at: 25.63 },
      { type: "cutout", src: I("palette"), w: 240, x: 880, y: 3690, rot: -6, at: 27.28 },
      { type: "hand", text: "< 1 second!", x: 1160, y: 3770, size: 72, rot: -4, at: 28.21 },
      { type: "label", text: "COLORBLIND?!", x: 1100, y: 4010, size: 52, rot: 3, at: 29.13 },
      { type: "cutout", src: I("sunglasses"), w: 230, x: 860, y: 3980, rot: -8, at: 29.53, anim: "pop" },
    ] },
    // "Scientists think its skin might sense light."
    { t: 30.45, flight: 0.6, x: 3600, y: 4070, zoom: 1.08, items: [
      { type: "cutout", src: I("scientist"), w: 270, x: 3190, y: 3650, rot: -4, at: 30.58 },
      { type: "cutout", src: I("magnifier"), w: 210, x: 3520, y: 3680, rot: 8, at: 31.37 },
      { type: "hand", text: "skin senses light?", x: 3190, y: 4000, size: 62, rot: -4, at: 31.9 },
      { type: "cutout", src: I("bulb"), w: 190, x: 3600, y: 3930, rot: 6, at: 32.22, anim: "pop" },
    ] },
    // CTA / LOOP — "Which one blew your mind? Comment one, two, or three." → back to the opening desk
    { t: 33.2, flight: 0.7, hop: 0.12, x: 1000, y: 620, zoom: 1.08, items: [
      { type: "stamp", text: "WHICH\nONE?", x: 870, y: 200, w: 470, h: 240, size: 92, rot: 8, at: 33.33 },
      { type: "cutout", src: I("one"), w: 130, x: 620, y: 960, rot: -8, at: 34.55, anim: "pop" },
      { type: "cutout", src: I("two"), w: 130, x: 880, y: 960, rot: 4, at: 35.1, anim: "pop" },
      { type: "cutout", src: I("three"), w: 130, x: 1140, y: 960, rot: 8, at: 35.88, anim: "pop" },
    ] },
  ],
};
