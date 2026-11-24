// The film: stations on one desk, items on them. Replace this demo with your own (see references/scenes.md).
// Coordinates are desk pixels; the frame is 1080x1920 and the camera centres each station on (540, 820).
// Times are seconds of film time; items default to `at: station.t`.
window.FILM = {
  duration: 20,
  accent: "#ec5626",
  stations: [
    { t: 0, x: 1000, y: 1000, zoom: 1.0, items: [
      { type: "card", num: "01", title: "THE BRIEF", x: 640, y: 520, at: 0.4, rot: -2 },
      { type: "page", title: "CAN MEDICAID TAKE YOUR HOUSE?", lines: ["While you're living in it,", "almost never. But after", "you're gone, the state can", "send a bill."], x: 560, y: 820, w: 860, h: 700, at: 1.2, rot: 1.5 },
      { type: "marker", kind: "underline", x: 600, y: 1010, w: 520, h: 60, at: 3.2 },
      { type: "hand", text: "this one", x: 1160, y: 980, size: 80, rot: -6, at: 3.6 },
    ] },
    { t: 5.5, x: 2600, y: 1200, zoom: 0.95, items: [
      { type: "card", num: "02", title: "THE IMAGES", x: 2200, y: 700, at: 5.9, rot: 2 },
      { type: "print", src: "assets/props/d_mug.png", w: 520, h: 420, x: 2250, y: 1000, at: 6.6, rot: -2, caption: "9:07" },
      { type: "cutout", src: "assets/props/folder.png", w: 480, x: 2800, y: 1050, at: 7.4, rot: 4, anim: "slide", fx: 1200, fy: -300 },
      { type: "box", x: 2240, y: 990, w: 540, h: 560, tag: "shot 08", at: 8.4, until: 10.3 },
      { type: "cursor", name: "Claude", path: [[8.0, 3200, 1700], [8.4, 2800, 1300], [9.6, 2800, 1300], [10.2, 2600, 1600]], clicks: [8.45] },
    ] },
    { t: 11, x: 1400, y: 2800, zoom: 0.9, items: [
      { type: "note", text: "bigger\ntext", color: "yellow", x: 1500, y: 2300, at: 11.4, rot: 6 },
      { type: "label", text: "SKILL.md", x: 900, y: 2650, at: 12.2, rot: -2 },
      { type: "text", text: "ZERO CREW", x: 900, y: 2950, size: 110, at: 13.0, rot: -1 },
      { type: "marker", kind: "ring", x: 850, y: 2900, w: 760, h: 240, at: 13.6, rot: -3 },
      { type: "stamp", text: "COMMENT\nSKILL", x: 1000, y: 3200, w: 760, h: 270, at: 15.0, rot: -7 },
      { type: "cutout", src: "assets/props/paper_plane.png", w: 360, x: 1700, y: 3100, at: 16.5, anim: "pop" },
    ] },
    { t: 18, x: 1800, y: 1900, zoom: 0.3, hop: 0.1, items: [] },
  ],
};
