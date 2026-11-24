// "You don't procrastinate because you're lazy" — 43 s, one desk, seven stations.
// Every `at` sits on its word in words.js. Frame shows roughly x ±480, y −600 … +450 around each station.
window.FILM = {
  duration: 43,
  accent: "#ec5626",
  musicGain: -18,
  stations: [
    // HOOK — "You don't procrastinate because you're lazy. You do it to feel better, right now."
    { t: 0, x: 1000, y: 850, zoom: 1.08, items: [
      { type: "text", text: "NOT\nLAZY.", x: 600, y: 440, size: 150, rot: -2, at: 0.1 },
      { type: "cutout", src: "assets/img/sloth.png", w: 360, x: 1080, y: 470, rot: 6, at: 0.52 },
      { type: "marker", kind: "slash", x: 1060, y: 490, w: 400, h: 380, at: 2.04 },
      { type: "note", text: "feel\nbetter\nNOW", color: "yellow", x: 680, y: 1000, rot: -5, at: 3.36 },
    ] },
    // BEAT 1 — "Sirois and Pychyl call it a mood problem, not a time problem."
    { t: 4.85, x: 2500, y: 1000, zoom: 1.08, items: [
      { type: "card", num: "01", title: "MOOD\nPROBLEM", x: 2080, y: 600, rot: -2, at: 5.03 },
      { type: "hand", text: "Sirois & Pychyl", x: 2110, y: 860, size: 64, rot: -3, at: 5.87 },
      { type: "cutout", src: "assets/img/stressed_face.png", w: 260, x: 2560, y: 960, rot: 5, at: 8.42 },
      { type: "cutout", src: "assets/img/alarm_clock.png", w: 280, x: 2120, y: 990, rot: -6, at: 9.75 },
      { type: "marker", kind: "slash", x: 2100, y: 1000, w: 320, h: 300, at: 10.07 },
    ] },
    // "The task feels bad, so you dodge the feeling. Instant relief."
    { t: 11.0, flight: 0.8, x: 2500, y: 2350, zoom: 1.08, items: [
      { type: "label", text: "THE TASK", x: 2090, y: 1960, rot: -2, at: 11.29 },
      { type: "cutout", src: "assets/img/stressed_face.png", w: 260, x: 2080, y: 2150, rot: -4, at: 11.91 },
      { type: "marker", kind: "arrow", x: 2360, y: 2220, w: 200, h: 120, at: 12.66 },
      { type: "cutout", src: "assets/img/relieved_face.png", w: 260, x: 2580, y: 2150, rot: 4, at: 14.23 },
      { type: "hand", text: "instant relief", x: 2250, y: 2470, size: 90, rot: -4, at: 14.53 },
    ] },
    // BEAT 2 — "But the dread doesn't leave. It piles up."
    { t: 15.65, flight: 0.8, x: 1100, y: 2550, zoom: 1.08, items: [
      { type: "cutout", src: "assets/img/rain_cloud.png", w: 340, x: 820, y: 2140, rot: -3, at: 16.09 },
      { type: "note", text: "taxes", color: "yellow", x: 700, y: 2520, rot: -7, at: 17.42 },
      { type: "note", text: "emails", color: "pink", x: 900, y: 2580, rot: 6, at: 17.72 },
      { type: "note", text: "gym", color: "green", x: 760, y: 2700, rot: -2, at: 18.02 },
    ] },
    // BEAT 3 — "Stanford brain scan… future self looked like… a stranger. So you hand the job to someone you don't know."
    { t: 19.2, flight: 0.8, x: 2100, y: 3750, zoom: 1.08, items: [
      { type: "card", num: "02", title: "STANFORD\nBRAIN SCAN", x: 1680, y: 3330, rot: 2, at: 19.46 },
      { type: "cutout", src: "assets/img/brain.png", w: 300, x: 1700, y: 3640, rot: -4, at: 20.91 },
      { type: "cutout", src: "assets/img/stranger.png", w: 300, x: 2080, y: 3640, rot: 3, at: 22.57 },
      { type: "label", text: "FUTURE YOU", x: 2050, y: 3970, rot: -2, size: 48, at: 22.92 },
      { type: "marker", kind: "ring", x: 2010, y: 3590, w: 430, h: 420, at: 24.65 },
      { type: "note", text: "your\nto-do", color: "yellow", x: 1720, y: 3990, rot: -6, at: 26.43, anim: "slide", fx: -700, fy: 120 },
    ] },
    // BEAT 4 — "The fix sounds soft, but it works. Students who forgave themselves… procrastinated less on the next."
    { t: 28.2, x: 3600, y: 2850, zoom: 1.08, items: [
      { type: "card", num: "03", title: "THE FIX", x: 3180, y: 2430, rot: -2, at: 28.63 },
      { type: "hand", text: "it works", x: 3200, y: 3080, size: 80, rot: -3, at: 30.02 },
      { type: "cutout", src: "assets/img/mending_heart.png", w: 280, x: 3560, y: 2710, rot: 5, at: 31.63 },
      { type: "cutout", src: "assets/img/exam.png", w: 280, x: 3200, y: 2720, rot: -5, at: 33.92 },
      { type: "note", text: "less\ndelay", color: "green", x: 3620, y: 3020, rot: 5, at: 35.06 },
    ] },
    // CLOSE — "So forgive yourself. Make the first step tiny. And just start."
    { t: 36.35, x: 2600, y: 4850, zoom: 1.08, items: [
      { type: "hand", text: "forgive yourself", x: 2190, y: 4480, size: 96, rot: -3, at: 36.72 },
      { type: "cutout", src: "assets/img/footprints.png", w: 240, x: 2260, y: 4700, rot: -8, at: 39.09 },
      { type: "hand", text: "tiny", x: 2560, y: 4790, size: 96, rot: 4, at: 39.37 },
      { type: "stamp", text: "JUST\nSTART", x: 2240, y: 5040, w: 640, h: 300, rot: -6, at: 40.31 },
    ] },
  ],
};
