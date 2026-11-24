// Episode 2 — "You're going to yawn before this video ends." ~47 s, all ages, loops back to the opening desk.
// Every `at` sits on its word in words.js. Station frame ≈ x −440…+340, y −560…+400 around (x, y) at zoom 1.08.
window.FILM = {
  duration: 47,
  accent: "#ec5626",
  musicGain: -20,
  stations: [
    // HOOK — "You're going to yawn before this video ends. Don't fight it. Your brain already started."
    { t: 0, x: 1000, y: 740, zoom: 1.08, items: [
      { type: "text", text: "YOU'RE GOING\nTO YAWN.", x: 580, y: 560, size: 86, rot: -2, at: 0 },
      { type: "cutout", src: "assets/img/yawn.png", w: 280, x: 640, y: 230, rot: -6, at: 0.74, anim: "pop" },
      { type: "marker", kind: "underline", x: 600, y: 780, w: 560, h: 60, at: 1.86 },
      { type: "note", text: "don't\nfight it", color: "yellow", x: 1060, y: 240, rot: 6, size: 54, at: 2.56 },
      { type: "cutout", src: "assets/img/brain.png", w: 230, x: 1090, y: 880, rot: 5, at: 3.64 },
      { type: "hand", text: "already started", x: 580, y: 910, size: 64, rot: -4, at: 4.31 },
    ] },
    // "Here's the weird part. Seeing a yawn, hearing one, even reading the word yawn, can set you off."
    { t: 5.6, flight: 0.8, x: 2500, y: 890, zoom: 1.08, items: [
      { type: "card", num: "01", title: "THE WEIRD\nPART", x: 2090, y: 370, rot: -2, at: 5.61 },
      { type: "cutout", src: "assets/img/eyes.png", w: 200, x: 2090, y: 660, rot: -4, at: 6.37 },
      { type: "cutout", src: "assets/img/ear.png", w: 190, x: 2370, y: 650, rot: 5, at: 7.2 },
      { type: "cutout", src: "assets/img/book.png", w: 200, x: 2630, y: 660, rot: -3, at: 8.16 },
      { type: "hand", text: "= instant yawn", x: 2140, y: 930, size: 76, rot: -3, at: 9.03 },
    ] },
    // "In one scientist's tests, up to half the people watching a yawning video yawned too."
    { t: 10.5, flight: 0.8, x: 2400, y: 2140, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/scientist.png", w: 280, x: 1990, y: 1620, rot: -4, at: 11.06 },
      { type: "text", text: "1 IN 2", x: 2040, y: 1960, size: 130, rot: -2, at: 12.36 },
      { type: "cutout", src: "assets/img/video.png", w: 250, x: 2380, y: 1640, rot: 6, at: 14.2 },
    ] },
    // "But babies don't catch yawns. Kids only start around age four."
    { t: 15.4, flight: 0.8, x: 1100, y: 2390, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/baby.png", w: 250, x: 700, y: 1880, rot: -5, at: 15.74 },
      { type: "marker", kind: "slash", x: 690, y: 1890, w: 280, h: 250, at: 16.43 },
      { type: "cutout", src: "assets/img/child.png", w: 250, x: 1080, y: 1880, rot: 5, at: 17.58 },
      { type: "note", text: "age 4+", color: "green", x: 1050, y: 2190, rot: 5, size: 64, at: 18.55 },
    ] },
    // "And it's not just people. Chimps catch yawns. So do dogs."
    { t: 19.75, flight: 0.8, x: 2200, y: 3590, zoom: 1.08, items: [
      { type: "hand", text: "not just people", x: 1780, y: 3060, size: 80, rot: -3, at: 20.24 },
      { type: "cutout", src: "assets/img/chimp.png", w: 280, x: 1790, y: 3220, rot: -5, at: 21.28 },
      { type: "cutout", src: "assets/img/dog.png", w: 330, x: 2140, y: 3200, rot: 3, at: 23.18 },
    ] },
    // "In one study, 21 out of 29 dogs yawned after watching a person yawn."
    { t: 24.2, flight: 0.7, x: 3500, y: 2600, zoom: 1.08, items: [
      { type: "label", text: "ONE STUDY", x: 3090, y: 2060, rot: -2, at: 24.34 },
      { type: "text", text: "21 / 29", x: 3080, y: 2270, size: 140, rot: -2, at: 24.95 },
      { type: "hand", text: "dogs yawned!", x: 3110, y: 2480, size: 80, rot: -4, at: 26.61 },
      { type: "cutout", src: "assets/img/yawn.png", w: 200, x: 3600, y: 2030, rot: 8, at: 27.27, anim: "pop" },
    ] },
    // "So why do we do it? One idea: a big yawn pulls in cool air and helps cool your brain."
    { t: 28.65, flight: 0.8, x: 1300, y: 3990, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/thinking.png", w: 240, x: 890, y: 3460, rot: -4, at: 28.83 },
      { type: "label", text: "IDEA 1", x: 1200, y: 3520, rot: 3, at: 30.04 },
      { type: "cutout", src: "assets/img/wind.png", w: 290, x: 880, y: 3760, rot: -2, at: 31.95 },
      { type: "cutout", src: "assets/img/snowflake.png", w: 190, x: 1250, y: 3780, rot: 8, at: 32.8 },
      { type: "hand", text: "a cooler brain", x: 890, y: 4100, size: 76, rot: -4, at: 33.51 },
    ] },
    // "Another idea: it's about connection. We catch yawns most from family and friends."
    { t: 34.6, flight: 0.8, x: 3600, y: 4190, zoom: 1.08, items: [
      { type: "label", text: "IDEA 2", x: 3200, y: 3650, rot: -2, at: 34.82 },
      { type: "cutout", src: "assets/img/heart.png", w: 200, x: 3580, y: 3640, rot: 6, at: 36.05, anim: "pop" },
      { type: "cutout", src: "assets/img/family.png", w: 300, x: 3220, y: 3880, rot: -3, at: 38.18 },
      { type: "hand", text: "family & friends", x: 3200, y: 4230, size: 72, rot: -4, at: 38.84 },
    ] },
    // "So send this to someone you love, and watch what happens."
    { t: 40.0, flight: 0.8, x: 2450, y: 5090, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/phone.png", w: 250, x: 2030, y: 4550, rot: -5, at: 40.01 },
      { type: "cutout", src: "assets/img/heart.png", w: 180, x: 2390, y: 4580, rot: 6, at: 41.06, anim: "pop" },
      { type: "label", text: "SEND TO A FRIEND", x: 2030, y: 4870, size: 40, rot: -2, at: 40.67 },
      { type: "cutout", src: "assets/img/eyes.png", w: 180, x: 2560, y: 5030, rot: 4, at: 41.81 },
    ] },
    // LOOP — "And if you still haven't yawned... you're going to." → back to the opening desk
    { t: 43.0, flight: 1.0, hop: 0.12, x: 1000, y: 740, zoom: 1.08, items: [
      { type: "hand", text: "...you will.", x: 640, y: 1060, size: 84, rot: -6, at: 44.93 },
    ] },
  ],
};
