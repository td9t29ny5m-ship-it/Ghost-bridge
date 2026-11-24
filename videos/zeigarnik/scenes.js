// Episode 1 — "Don't watch this to the end" (the Zeigarnik effect). ~50 s, loops back to the opening desk.
// Every `at` sits on its word in words.js. Station frame ≈ x −440…+340, y −560…+400 around (x, y) at zoom 1.08.
window.FILM = {
  duration: 50,
  accent: "#ec5626",
  musicGain: -20,
  stations: [
    // HOOK — "Don't watch this to the end. Seriously. If you quit halfway, your brain might not let it go."
    { t: 0, x: 1000, y: 740, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/stop_sign.png", w: 290, x: 620, y: 330, rot: -6, at: 0.5, anim: "pop" },
      { type: "text", text: "DON'T WATCH\nTO THE END.", x: 580, y: 680, size: 100, rot: -2, at: 0 },
      { type: "marker", kind: "underline", x: 600, y: 900, w: 600, h: 60, at: 1.07 },
      { type: "note", text: "seriously.", color: "pink", x: 1060, y: 330, rot: 7, size: 52, at: 1.4 },
      { type: "cutout", src: "assets/img/brain.png", w: 240, x: 1090, y: 1010, rot: 5, at: 3.61 },
      { type: "hand", text: "can't let go", x: 600, y: 1050, size: 80, rot: -4, at: 3.95 },
    ] },
    // "Berlin, the 1920s. A psychologist is watching a waiter who never writes anything down."
    { t: 5.3, flight: 0.8, x: 2500, y: 890, zoom: 1.08, items: [
      { type: "label", text: "BERLIN · 1920s", x: 2090, y: 480, size: 52, rot: -2, at: 5.39 },
      { type: "cutout", src: "assets/img/coffee.png", w: 200, x: 2640, y: 640, rot: 6, at: 6.41 },
      { type: "cutout", src: "assets/img/eyes.png", w: 170, x: 2420, y: 690, rot: -4, at: 7.33, anim: "pop" },
      { type: "cutout", src: "assets/img/waiter.png", w: 340, x: 2100, y: 700, rot: -3, at: 8.68 },
      { type: "hand", text: "no notepad!", x: 2470, y: 900, size: 72, rot: -5, at: 9.54 },
    ] },
    // "He remembers every unpaid order. Perfectly. Then the bill gets paid. And it's gone."
    { t: 10.75, flight: 0.8, x: 2400, y: 2140, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/receipt.png", w: 300, x: 1990, y: 1740, rot: -6, at: 11.63, until: 15.85 },
      { type: "note", text: "table 4:\n2 coffees\n1 cake", color: "yellow", x: 2400, y: 1740, size: 46, rot: 4, at: 11.96, until: 15.85 },
      { type: "marker", kind: "ring", x: 1940, y: 1700, w: 420, h: 400, at: 12.98, until: 15.85 },
      { type: "cutout", src: "assets/img/coin.png", w: 190, x: 2040, y: 2160, rot: 0, at: 15.02, anim: "slide", fx: -900, fy: 0 },
      { type: "cutout", src: "assets/img/dash.png", w: 280, x: 2380, y: 2120, rot: 0, at: 15.85, anim: "pop" },
    ] },
    // "His student, Bluma Zeigarnik, tested it. People remembered interrupted tasks better than finished ones."
    { t: 17.15, flight: 0.8, x: 1100, y: 2390, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/scientist.png", w: 320, x: 690, y: 1980, rot: -4, at: 17.44 },
      { type: "label", text: "BLUMA ZEIGARNIK", x: 640, y: 2340, size: 44, rot: -2, at: 17.78 },
      { type: "cutout", src: "assets/img/puzzle.png", w: 240, x: 1100, y: 1990, rot: 8, at: 20.35 },
      { type: "hand", text: "stuck in memory", x: 1040, y: 2250, size: 58, rot: -4, at: 21.23 },
    ] },
    // "That's why cliffhangers hook you. Why an unread message itches."
    { t: 22.85, flight: 0.8, x: 2200, y: 3590, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/tv.png", w: 300, x: 1790, y: 3160, rot: -4, at: 23.39 },
      { type: "cutout", src: "assets/img/hook.png", w: 220, x: 2200, y: 3150, rot: 12, at: 23.95, anim: "pop" },
      { type: "cutout", src: "assets/img/message.png", w: 250, x: 1810, y: 3530, rot: 4, at: 25.64 },
      { type: "note", text: "1 unread", color: "pink", x: 2160, y: 3520, rot: 6, size: 54, at: 26.1 },
    ] },
    // OPEN LOOP PAYOFF — "But here's the twist nobody tells you."
    { t: 27.1, flight: 0.8, x: 3400, y: 2590, zoom: 1.0, items: [
      { type: "card", num: "?!", title: "THE TWIST", wide: true, x: 2990, y: 2420, rot: -2, at: 27.56 },
      { type: "hand", text: "nobody tells you", x: 3020, y: 2800, size: 76, rot: -3, at: 27.9 },
    ] },
    // "In 2025, scientists pooled almost a century of these studies. The memory part? It didn't hold up."
    { t: 29.25, flight: 0.7, x: 1300, y: 3990, zoom: 1.08, items: [
      { type: "label", text: "2025 · META-ANALYSIS", x: 880, y: 3580, size: 44, rot: -2, at: 29.32 },
      { type: "cutout", src: "assets/img/books.png", w: 300, x: 880, y: 3760, rot: -4, at: 31.78 },
      { type: "cutout", src: "assets/img/chart_down.png", w: 290, x: 1270, y: 3760, rot: 5, at: 33.74 },
      { type: "hand", text: "didn't hold up", x: 900, y: 4110, size: 80, rot: -4, at: 34.64 },
    ] },
    // "What did hold up is stranger. Interrupted people go back and finish, on their own."
    { t: 35.75, flight: 0.8, x: 3600, y: 4190, zoom: 1.08, items: [
      { type: "text", text: "THE URGE.", x: 3200, y: 3780, size: 110, rot: -2, at: 35.96 },
      { type: "cutout", src: "assets/img/repeat.png", w: 250, x: 3220, y: 3990, rot: -5, at: 38.51 },
      { type: "cutout", src: "assets/img/check.png", w: 220, x: 3570, y: 4010, rot: 6, at: 38.94 },
      { type: "hand", text: "on their own", x: 3200, y: 4290, size: 76, rot: -4, at: 39.34 },
    ] },
    // "So use it. Start the thing you're avoiding. Two minutes. Then stop. Your brain will drag you back."
    { t: 40.4, flight: 0.8, x: 2450, y: 5090, zoom: 1.08, items: [
      { type: "label", text: "TRY THIS", x: 2030, y: 4660, rot: -2, at: 40.51 },
      { type: "cutout", src: "assets/img/stopwatch.png", w: 270, x: 2030, y: 4840, rot: -5, at: 42.88 },
      { type: "hand", text: "2 minutes", x: 2340, y: 4920, size: 92, rot: -4, at: 43.2 },
      { type: "stamp", text: "THEN\nSTOP", x: 2000, y: 5170, w: 520, h: 250, rot: -6, at: 44.17 },
      { type: "cutout", src: "assets/img/brain.png", w: 200, x: 2560, y: 5180, rot: 6, at: 45.16 },
      { type: "marker", kind: "arrow", x: 2540, y: 5420, w: 220, h: 110, rot: 180, at: 45.5 },
    ] },
    // LOOP — "Kind of like how you just watched this to the end." → back to the opening desk
    { t: 46.9, flight: 1.0, hop: 0.12, x: 1000, y: 740, zoom: 1.08, items: [
      { type: "hand", text: "...oops.", x: 720, y: 1180, size: 84, rot: -6, at: 47.86 },
    ] },
  ],
};
