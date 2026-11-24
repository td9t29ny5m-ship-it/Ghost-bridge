// Palmera Life v2 - Bedrock Script API (stable @minecraft/server 1.11 + server-ui 1.2). Original content.
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const D = __DATA__;
const GUNS = D.guns;
const WALKABLE = new Set(["minecraft:smooth_stone", "minecraft:sand", "minecraft:stone_bricks", "minecraft:grass_block", "minecraft:smooth_quartz", "minecraft:light_gray_concrete"]);
const ROAD = new Set(["minecraft:gray_concrete", "minecraft:yellow_concrete", "minecraft:white_concrete", "minecraft:black_concrete"]);
const SKIP = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:snowball", "palmera:bullet"]);
const POLICE = new Set(["palmera:cop", "palmera:swat", "palmera:police_car", "palmera:police_heli"]);
const CARS = new Set(["palmera:car", "palmera:sports_car", "palmera:bike"]);
const FLYERS = new Set(["palmera:heli", "palmera:speedboat"]);
const G = c => String.fromCharCode(0xE100 + c);
const I = { cash: G(0x20), star: G(0x21), off: G(0x22), ammo: G(0x23), heart: G(0x24), speed: G(0x25), phone: G(0x26), hit: G(0x27), skull: G(0x28) };
const TILE = [G(0), G(1), G(2), G(3), G(4), G(5)], ARROW = [0, 1, 2, 3, 4, 5, 6, 7].map(k => G(8 + k));
const COPDOT = G(0x10), TARGET = G(0x11), GANGDOT = G(0x13), VOID = G(0x14), RIM = G(0x06);
const POI = { bank: G(0x30), guns: G(0x31), hospital: G(0x32), police: G(0x33), home: G(0x34), pin: G(0x35), car: G(0x36), north: G(0x37) };

// ---------------------------------------------------------------- helpers
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const norm = a => { const l = Math.hypot(a.x, a.y, a.z) || 1; return mul(a, 1 / l); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const V = p => ({ x: p[0] + 0.5, y: p[1], z: p[2] + 0.5 });
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const money = n => "$" + Math.floor(n).toLocaleString("en-US");
const valid = e => { try { if (!e) return false; if (e.isValid === undefined) return true; return typeof e.isValid === "function" ? e.isValid() : !!e.isValid; } catch { return false; } };
const OW = () => world.getDimension("overworld");
function particle(dim, id, loc) { try { dim.spawnParticle(id, loc); } catch { } }
function sound(dim, id, loc, pitch = 1, vol = 1) {
  try { dim.playSound(id, loc, { pitch, volume: vol }); }
  catch { try { dim.runCommandAsync(`playsound ${id} @a ${loc.x} ${loc.y} ${loc.z} ${vol} ${pitch}`); } catch { } }
}
function cmd(src, c) { try { return src.runCommand(c); } catch { try { return src.runCommandAsync(c); } catch { } } }
function objectiveOf(id) { return world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, id); }
function score(id, p) { try { return objectiveOf(id).getScore(p) ?? 0; } catch { return 0; } }
function setScore(id, p, v) { try { objectiveOf(id).setScore(p, Math.max(0, Math.floor(v))); } catch { } }
const cash = p => score("pl_cash", p), ammo = p => score("pl_ammo", p);
const addCash = (p, v) => setScore("pl_cash", p, cash(p) + v);
const addAmmo = (p, v) => setScore("pl_ammo", p, ammo(p) + v);
const prop = (p, k, d) => { try { return p.getDynamicProperty(k) ?? d; } catch { return d; } };
const setProp = (p, k, v) => { try { p.setDynamicProperty(k, v); } catch { } };
const bank = p => prop(p, "bank", 0);
const wanted = p => prop(p, "wanted", 0);
function setWanted(p, w) {
  w = Math.max(0, Math.min(5, w)); setProp(p, "wanted", w);
  try { if (w > 0) p.addTag("wanted"); else p.removeTag("wanted"); } catch { }
}
const inv = p => p.getComponent("minecraft:inventory").container;
function held(p) { try { return inv(p).getItem(p.selectedSlotIndex ?? p.selectedSlot); } catch { } }
function give(p, id, n = 1, name) {
  const it = new ItemStack(id, n);
  if (name) it.nameTag = name;
  const left = inv(p).addItem(it);
  if (left) p.dimension.spawnItem(left, p.location);
}
const banners = new Map();
function title(p, t, sub) { banners.set(p.id, { t, sub: sub ?? "", until: system.currentTick + 70 }); }
function msg(p, s) { try { p.sendMessage(s); } catch { } }
function nearest(list, loc) { let b, bd = 1e18; for (const s of list) { const d = flat(V(s), loc); if (d < bd) { bd = d; b = s; } } return [b, bd]; }
function ridingCar(p) { try { const r = p.getComponent("minecraft:riding")?.entityRidingOn; return r && r.typeId.startsWith("palmera:") ? r : undefined; } catch { } }
function count(dim, loc, r, opt) { try { return dim.getEntities(Object.assign({ location: loc, maxDistance: r }, opt)).length; } catch { return 0; } }
function arrow(p, pos) {
  const dx = pos.x - p.location.x, dz = pos.z - p.location.z;
  let rel = Math.atan2(-dx, dz) * 180 / Math.PI - p.getRotation().y;
  rel = ((rel % 360) + 540) % 360 - 180;
  return ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][((Math.round(rel / 45) % 8) + 8) % 8];
}

// ---------------------------------------------------------------- trophies
const TROPHIES = [["jack", "Grand Theft Palmera", "Steal a car from a driver"], ["rob", "Register Ninja", "Rob a store"],
  ["vault", "Vault Buster", "Crack a bank vault"], ["five", "Most Wanted", "Reach 5 stars"], ["lost5", "Ghost", "Lose a 4+ star wanted level"],
  ["story", "King of Palmera", "Finish the story"], ["fly", "Sky High", "Fly a helicopter"], ["turf", "Turf War", "Take over gang turf"],
  ["rich", "Millionaire", "Have $1,000,000 in the bank"], ["taxi", "Cabbie", "Complete 5 taxi fares"], ["token", "Token Hunter", "Find 10 Palm Tokens"]];
function trophy(p, id, name, desc) {
  const got = JSON.parse(prop(p, "trophies", "[]"));
  if (got.includes(id)) return;
  got.push(id); setProp(p, "trophies", JSON.stringify(got));
  sound(p.dimension, "random.levelup", p.location, 1.2);
  msg(p, `§6🏆 Trophy unlocked: §f${name} §7- ${desc}`);
}
function trophies(p) {
  const got = JSON.parse(prop(p, "trophies", "[]"));
  new ActionFormData().title(`§6Trophies ${got.length}/${TROPHIES.length}`)
    .body(TROPHIES.map(([id, n, d]) => (got.includes(id) ? "§a✔ §f" : "§8✖ §7") + n + " §8- " + d).join("\n")).button("Close").show(p);
}

// ---------------------------------------------------------------- cinematic camera
function fade(p) { cmd(p, "camera @s fade time 0.3 0.8 0.5 color 0 0 0"); }
function shot(p, target, dist = 60, height = 35, ease = 4, side = 0) {
  const a = side + Math.random() * 0.6;
  const pos = { x: target[0] + Math.cos(a) * dist, y: target[1] + height, z: target[2] + Math.sin(a) * dist };
  cmd(p, `camera @s set minecraft:free ease ${ease} in_out_sine pos ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)} facing ${target[0]} ${target[1]} ${target[2]}`);
}
function intro(p) {
  const pts = [];
  const lm = n => D.landmarks.find(l => l[0].startsWith(n))?.[1];
  if (D.banks[0]) pts.push(["§fVISTA MARINA", D.banks[0]]);
  for (const n of ["Coral Strand", "Port Solano", "Millionaire Isles"]) { const q = lm(n); if (q) pts.push(["§f" + n.toUpperCase(), q]); }
  pts.forEach(([name, q], k) => system.runTimeout(() => {
    if (!valid(p)) return;
    shot(p, q, 90, 55, k === 0 ? 0.1 : 4, k * 1.7);
    system.runTimeout(() => title(p, "§d§lPALMERA", name), 30);
  }, k * 110));
  system.runTimeout(() => { if (valid(p)) { fade(p); system.runTimeout(() => cmd(p, "camera @s clear"), 10); } }, pts.length * 110);
}

// ---------------------------------------------------------------- world setup / join
let booted = false;
function boot() {
  if (booted) return; booted = true;
  objectiveOf("pl_cash"); objectiveOf("pl_ammo");
  for (const c of ["gamerule keepinventory true", "gamerule domobspawning false", "gamerule mobgriefing false",
    "gamerule sendcommandfeedback false", "gamerule showcoordinates true"]) cmd(OW(), c);
}
system.run(boot);

// ---------------------------------------------------------------- radar: pre-rendered map tiles in the off-hand
let mapItems = null;
const radarTile = new Map();
function loadMaps() {
  if (mapItems || !D.maps) return;
  try {
    const dim = OW(), items = [];
    for (const c of D.maps.chests) {
      const b = dim.getBlock({ x: c[0], y: c[1], z: c[2] });
      const inv = b && b.getComponent("minecraft:inventory")?.container;
      if (!inv) return;
      for (let i = 0; i < c[3]; i++) items.push(inv.getItem(i));
    }
    if (items.length && items.every(Boolean)) mapItems = items;
  } catch { }
}
function radarTick(p) {
  if (!mapItems || !prop(p, "set_radar", false)) return;
  const n = D.maps.n, st = D.maps.step;
  const i = Math.max(0, Math.min(n - 1, Math.round(p.location.z / st)));
  const j = Math.max(0, Math.min(n - 1, Math.round(p.location.x / st)));
  const k = i * n + j;
  try {
    const eq = p.getComponent("minecraft:equippable");
    const off = eq.getEquipment("Offhand");
    if (off && off.typeId !== "minecraft:filled_map") return;            // never replace a shield/totem etc.
    if (radarTile.get(p.id) === k && off) return;
    eq.setEquipment("Offhand", mapItems[k].clone());
    radarTile.set(p.id, k);
  } catch { }
}
function radarOff(p) {
  try {
    const eq = p.getComponent("minecraft:equippable");
    const off = eq.getEquipment("Offhand");
    if (off && off.typeId === "minecraft:filled_map") eq.setEquipment("Offhand", undefined);
  } catch { }
  radarTile.delete(p.id);
}
if (D.maps) {
  const cs = D.maps.chests, xs = cs.map(c => c[0]);
  system.run(() => cmd(OW(), `tickingarea add ${Math.min(...xs)} -51 ${cs[0][2]} ${Math.max(...xs)} -49 ${cs[0][2]} palmera_maps true`));
}
system.runInterval(() => { loadMaps(); for (const p of world.getAllPlayers()) radarTick(p); }, 10);

world.afterEvents.playerSpawn.subscribe(ev => {
  const p = ev.player;
  system.runTimeout(() => {
    if (!valid(p)) return;
    if (!prop(p, "joined", false)) {
      setProp(p, "joined", true);
      setScore("pl_cash", p, 2500); setScore("pl_ammo", p, 60); setWanted(p, 0);
      give(p, "palmera:phone"); give(p, "palmera:pistol");
      intro(p);
      msg(p, "§dWelcome to Palmera!§f You have §a$2,500§f, a pistol and a §dPhone§f. Use the Phone to start the §dStory§f, take jobs, buy guns and cars.");
      msg(p, "§7Tips: crouch at a shop counter with a gun out to rob it. Crouch next to a car on the street to steal it. Hurting people brings the cops.");
      msg(p, "§7Your radar is in the top-right corner. Phone > Settings has more HUD options.");
    } else if (prop(p, "died", false)) {
      setProp(p, "died", false);
      const bill = Math.max(200, Math.floor(cash(p) * 0.1));
      addCash(p, -bill);
      fade(p);
      title(p, "§4§lHOSPITALIZED", "§7Hospital bill: " + money(bill));
    }
    setWanted(p, wanted(p));
  }, 20);
});

// ---------------------------------------------------------------- weapons
const hitFlash = new Map();
const lastShot = new Map(), mags = new Map(), reloading = new Map(), trigger = new Map();
function magOf(p, id) { const m = mags.get(p.id) ?? {}; mags.set(p.id, m); if (m[id] === undefined) m[id] = GUNS[id].mag; return m; }
function startReload(p, id) {
  const g = GUNS[id];
  if (reloading.has(p.id) || ammo(p) <= 0) return;
  reloading.set(p.id, { id, until: system.currentTick + g.reload });
  sound(p.dimension, "palmera.reload", p.location, 1);
  system.runTimeout(() => {
    const r = reloading.get(p.id); if (!r || r.id !== id) return;
    reloading.delete(p.id);
    const m = magOf(p, id), need = g.mag - m[id], take = Math.min(need, ammo(p));
    m[id] += take; addAmmo(p, -take);
    sound(p.dimension, "random.click", p.location, 1.4);
  }, g.reload);
}
function rayEntity(p, dim, origin, dir, max) {
  let hits = [];
  try { hits = dim.getEntitiesFromRay(origin, dir, { maxDistance: max }); } catch { }
  const car = ridingCar(p);
  for (const h of hits) {
    const e = h.entity;
    if (!e || e.id === p.id || SKIP.has(e.typeId) || (car && e.id === car.id)) continue;
    return h;
  }
}
const HUMAN = new Set(["minecraft:player", "palmera:civilian", "palmera:cop", "palmera:swat", "palmera:gangster"]);
function shoot(p, dim, origin, dir, g) {
  let bh, bd = g.range;
  try { bh = dim.getBlockFromRay(origin, dir, { maxDistance: g.range, includeLiquidBlocks: false, includePassableBlocks: false }); } catch { }
  if (bh) bd = dist(origin, add(bh.block.location, bh.faceLocation));
  const eh = rayEntity(p, dim, origin, dir, bd);
  const end = eh ? eh.distance : bd;
  for (let d = 1.2; d < Math.min(end, 60); d += 1.5) particle(dim, g.particle, add(origin, mul(dir, d)));
  const endLoc = add(origin, mul(dir, end));
  if (g.explode) { boom(dim, endLoc, g.explode, p); return; }
  if (eh) {
    const e = eh.entity;
    const head = HUMAN.has(e.typeId) && endLoc.y > e.location.y + 1.45;
    try { e.applyDamage(head ? g.dmg * 2 : g.dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: p }); } catch { }
    particle(dim, "minecraft:critical_hit_emitter", endLoc);
    hitFlash.set(p.id, { head, until: system.currentTick + 8 });
  } else if (bh) {
    const b = bh.block;
    if (b.typeId.includes("glass")) { try { b.setType("minecraft:air"); } catch { } sound(dim, "random.glass", endLoc); }
    else particle(dim, "minecraft:basic_smoke_particle", endLoc);
  }
}
function fire(p, g, id) {
  const now = system.currentTick;
  if ((lastShot.get(p.id) ?? -999) + Math.max(1, g.cd) > now) return;
  if (reloading.has(p.id)) return;
  const m = magOf(p, id);
  if (m[id] <= 0) {
    if (ammo(p) > 0) startReload(p, id);
    else { title(p, "§cOut of ammo! Buy more at Sunshine Arms (Phone).", ""); sound(p.dimension, "random.click", p.location, 1.8); }
    return;
  }
  lastShot.set(p.id, now);
  m[id] -= 1;
  const dim = p.dimension, head = p.getHeadLocation(), d0 = p.getViewDirection();
  sound(dim, g.sound, head, rnd(0.94, 1.06), 2);
  particle(dim, "minecraft:basic_flame_particle", add(head, mul(d0, 1.2)));
  cmd(p, `camerashake add @s ${g.recoil} 0.1 positional`);
  heat(p);
  for (let i = 0; i < g.pellets; i++) {
    const s = i === 0 ? g.spread * 0.3 : g.spread;
    shoot(p, dim, head, norm(add(d0, { x: rnd(-s, s), y: rnd(-s, s), z: rnd(-s, s) })), g);
  }
  if (m[id] <= 0 && ammo(p) > 0) startReload(p, id);
}
function boom(dim, loc, r, src) {
  sound(dim, "palmera.explosion", loc, rnd(0.9, 1.1), 3);
  try { dim.createExplosion(loc, r, { breaksBlocks: false, causesFire: false, source: src }); }
  catch { particle(dim, "minecraft:huge_explosion_emitter", loc); }
}
function throwGrenade(p) {
  const c = inv(p), slot = p.selectedSlotIndex ?? p.selectedSlot, it = c.getItem(slot);
  if (!it) return;
  if (it.amount > 1) { it.amount--; c.setItem(slot, it); } else c.setItem(slot, undefined);
  const dim = p.dimension, head = p.getHeadLocation(), dir = p.getViewDirection();
  let land = add(head, mul(dir, 18));
  try { const bh = dim.getBlockFromRay(head, dir, { maxDistance: 18, includePassableBlocks: false }); if (bh) land = add(bh.block.location, bh.faceLocation); } catch { }
  sound(dim, "random.bow", head, 0.6);
  for (let t = 0; t < 30; t += 5) system.runTimeout(() => particle(dim, "minecraft:basic_smoke_particle", land), t);
  system.runTimeout(() => boom(dim, land, 3, p), 30);
  heat(p);
}
const boosting = new Map();
function nitro(p) {
  const car = ridingCar(p);
  if (!car) { msg(p, "§7Use nitro while driving."); return; }
  if ((boosting.get(p.id) ?? 0) > system.currentTick) return;
  const c = inv(p), slot = p.selectedSlotIndex ?? p.selectedSlot, it = c.getItem(slot);
  if (it) { if (it.amount > 1) { it.amount--; c.setItem(slot, it); } else c.setItem(slot, undefined); }
  boosting.set(p.id, system.currentTick + 60);
  sound(car.dimension, "firework.launch", car.location, 0.5, 2);
  cmd(p, "camerashake add @s 0.25 2.5 positional");
  for (let t = 0; t < 60; t += 2) system.runTimeout(() => {
    try {
      const d = p.getViewDirection(), hl = Math.hypot(d.x, d.z) || 1;
      car.applyImpulse({ x: d.x / hl * 0.12, y: 0, z: d.z / hl * 0.12 });
      particle(car.dimension, "minecraft:blue_flame_particle", add(car.location, { x: -d.x / hl * 2.4, y: 0.5, z: -d.z / hl * 2.4 }));
    } catch { }
  }, t);
}
const GLOW = { blue: "minecraft:blue_flame_particle", purple: "minecraft:dragon_breath_trail", green: "minecraft:villager_happy",
               red: "minecraft:redstone_wire_dust_particle", white: "minecraft:endrod" };
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    const g = GLOW[prop(p, "glow", "")];
    if (!g) continue;
    const car = ridingCar(p);
    if (!car || !CARS.has(car.typeId)) continue;
    for (let i = 0; i < 3; i++) particle(car.dimension, g, add(car.location, { x: rnd(-1, 1), y: 0.1, z: rnd(-1.8, 1.8) }));
  }
}, 4);
function throwMolotov(p) {
  const c = inv(p), slot = p.selectedSlotIndex ?? p.selectedSlot, it = c.getItem(slot);
  if (!it) return;
  if (it.amount > 1) { it.amount--; c.setItem(slot, it); } else c.setItem(slot, undefined);
  const dim = p.dimension, head = p.getHeadLocation(), dir = p.getViewDirection();
  let land = add(head, mul(dir, 16));
  try { const bh = dim.getBlockFromRay(head, dir, { maxDistance: 16, includePassableBlocks: false }); if (bh) land = add(bh.block.location, bh.faceLocation); } catch { }
  sound(dim, "random.glass", land, 0.8);
  heat(p);
  for (let t = 0; t < 120; t += 5) system.runTimeout(() => {
    for (let i = 0; i < 6; i++) particle(dim, "minecraft:basic_flame_particle", add(land, { x: rnd(-2.5, 2.5), y: 0.2, z: rnd(-2.5, 2.5) }));
    if (t % 10 === 0) try {
      for (const e of dim.getEntities({ location: land, maxDistance: 3 })) {
        if (SKIP.has(e.typeId)) continue;
        e.applyDamage(3, { cause: EntityDamageCause.fire, damagingEntity: p });
        try { e.setOnFire(2, true); } catch { }
      }
    } catch { }
  }, t);
}
world.afterEvents.itemUse.subscribe(ev => {
  const p = ev.source, id = ev.itemStack?.typeId;
  if (!p || !id) return;
  if (id === "palmera:phone") { system.run(() => phone(p)); return; }
  if (id === "palmera:grenade") { throwGrenade(p); return; }
  if (id === "palmera:molotov") { throwMolotov(p); return; }
  if (id === "palmera:nitro") { nitro(p); return; }
  if (GUNS[id]) fire(p, GUNS[id], id);
});
try {
  world.afterEvents.itemStartUse.subscribe(ev => {
    const p = ev.source, id = ev.itemStack?.typeId, g = GUNS[id];
    if (!p || !g) return;
    fire(p, g, id);
    if (g.auto) trigger.set(p.id, id);
    if (g.zoom) cmd(p, "camera @s fov_set 25 0.15");
  });
  const stop = ev => { const p = ev.source; if (!p) return; trigger.delete(p.id); if (GUNS[ev.itemStack?.typeId]?.zoom) cmd(p, "camera @s fov_clear 0.15"); };
  world.afterEvents.itemStopUse.subscribe(stop);
  world.afterEvents.itemReleaseUse.subscribe(stop);
} catch { }
system.runInterval(() => {                      // full-auto fire while the use button is held
  for (const p of world.getAllPlayers()) {
    const id = trigger.get(p.id);
    if (!id) continue;
    const it = held(p);
    if (!it || it.typeId !== id) { trigger.delete(p.id); continue; }
    fire(p, GUNS[id], id);
  }
}, 1);
const isGun = it => !!(it && GUNS[it.typeId]);

// ---------------------------------------------------------------- crime & police
function heat(p) {
  try {
    const dim = p.dimension;
    for (const c of dim.getEntities({ location: p.location, maxDistance: 24, families: ["civilian"] })) { try { c.triggerEvent("palmera:scare"); } catch { } }
    if (wanted(p) === 0 && count(dim, p.location, 18, { families: ["civilian"] }) > 0) {
      setWanted(p, 1); setProp(p, "wcd", 400);
      title(p, "§cShots fired! Someone called the cops.", "");
    }
  } catch { }
}
const DIRS = ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"];
function radio(p) {
  const w = wanted(p);
  const heading = DIRS[Math.round((((p.getRotation().y % 360) + 360) % 360) / 45) % 8];
  const lines = ["", "§9[Dispatch]§7 Units respond, suspect seen heading " + heading + ".",
    "§9[Dispatch]§7 Shots fired, all units, suspect is armed.", "§9[Dispatch]§7 SWAT is rolling. Suspect heading " + heading + ".",
    "§9[Dispatch]§7 Air unit up, we have eyes in the sky.", "§9[Dispatch]§7 All available units! Lethal force authorized."];
  if (lines[w]) title(p, "§9Police radio", lines[w].replace("§9[Dispatch]§7 ", "§7"));
}
function addStars(p, n = 1) {
  const before = wanted(p);
  setWanted(p, wanted(p) + n); setProp(p, "wcd", 700);
  if (wanted(p) !== before) radio(p);
  if (wanted(p) >= 4) setProp(p, "hadfour", true);
  if (wanted(p) >= 5) trophy(p, "five", "Most Wanted", "Reach 5 stars");
  setProp(p, "crimes", prop(p, "crimes", 0) + 1);
  sound(p.dimension, "note.bell", p.location, 0.6);
}
world.afterEvents.entityDie.subscribe(ev => {
  const d = ev.deadEntity, k = ev.damageSource?.damagingEntity;
  let loc, dim, type;
  try { loc = d.location; dim = d.dimension; type = d.typeId; } catch { return; }
  if (type === "minecraft:player") {
    setProp(d, "died", true); setWanted(d, 0);
    const a = active.get(d.id);
    if (a) finishMission(d, false);
    try {
      const owned = JSON.parse(prop(d, "homes", "[]"));
      const homes = owned.map(i => D.safehouses[i]?.pos).filter(Boolean);
      const [best] = nearest(homes.length ? homes : D.hospitals, loc);
      if (best) d.setSpawnPoint({ dimension: OW(), x: best[0] + 0.5, y: best[1], z: best[2] + 0.5 });
    } catch { }
    return;
  }
  let tags = [];
  try { tags = d.getTags(); } catch { }
  if (CARS.has(type) || type === "palmera:traffic_car" || type === "palmera:police_car") { boom(dim, loc, 2.5, k); return; }
  if (type === "palmera:gangster" && k?.typeId === "minecraft:player") dailyTick(k, "kill_gang");
  if (type === "palmera:gangster" && k?.typeId === "minecraft:player") {
    for (const g of D.gangs) {
      if (flat(V(g.pos), loc) > g.r) continue;
      const turf = JSON.parse(prop(k, "turf", "[]"));
      if (turf.includes(g.name)) break;
      const n = prop(k, "turfkills_" + g.name, 0) + 1;
      setProp(k, "turfkills_" + g.name, n);
      if (n % 5 === 0 && n < 15) title(k, `§c${g.name} turf`, `§f${n}/15 down`);
      if (n >= 15) { turf.push(g.name); setProp(k, "turf", JSON.stringify(turf)); title(k, "§4§lTURF TAKEN", `§f${g.name} territory is yours. +$1,000/day`); trophy(k, "turf", "Turf War", "Take over gang turf"); }
      break;
    }
  }
  if (type === "palmera:gangster") dim.spawnItem(new ItemStack("palmera:cash", tags.includes("boss") ? 12 : 2), loc);
  if (type === "palmera:civilian" && Math.random() < 0.5) dim.spawnItem(new ItemStack("palmera:cash", 1), loc);
  if (POLICE.has(type) && Math.random() < 0.5) dim.spawnItem(new ItemStack("palmera:cash", 1), loc);
  if ((type === "palmera:cop" || type === "palmera:gangster") && Math.random() < 0.18) dim.spawnItem(new ItemStack(Math.random() < 0.8 ? "palmera:pistol" : "palmera:smg", 1), loc);
  if ((type === "palmera:swat" || type === "palmera:gangster") && k?.typeId === "minecraft:player") { addAmmo(k, type === "palmera:swat" ? 20 : 8); }
  if (k && k.typeId === "minecraft:player" && (type === "palmera:civilian" || POLICE.has(type))) addStars(k, POLICE.has(type) ? 1 : 1);
});
const gangHeat = new Map();
world.afterEvents.entityHurt.subscribe(ev => {
  try {
    const k = ev.damageSource?.damagingEntity;
    if (k?.typeId === "minecraft:player" && ev.hurtEntity.typeId === "palmera:gangster") { k.addTag("gang_heat"); gangHeat.set(k.id, system.currentTick + 1200); }
  } catch { }
});

function ground(dim, x, z, top = 75, bottom = 58) {
  for (let y = top; y >= bottom; y--) {
    let b;
    try { b = dim.getBlock({ x, y, z }); } catch { return; }
    if (!b) return;
    if (b.typeId === "minecraft:air" || b.typeId.includes("leaves") || b.typeId === "minecraft:short_grass") continue;
    const up = dim.getBlock({ x, y: y + 1, z }), up2 = dim.getBlock({ x, y: y + 2, z });
    if (!up || !up2 || (up.typeId !== "minecraft:air" && up.typeId !== "minecraft:short_grass") || up2.typeId !== "minecraft:air") return;
    return { block: b, loc: { x: x + 0.5, y: y + 1, z: z + 0.5 } };
  }
}
function spotNear(p, rMin, rMax, ok) {
  for (let t = 0; t < 4; t++) {
    const a = Math.random() * Math.PI * 2, r = rnd(rMin, rMax);
    const g = ground(p.dimension, Math.floor(p.location.x + Math.cos(a) * r), Math.floor(p.location.z + Math.sin(a) * r));
    if (g && (!ok || ok(g.block.typeId))) return g.loc;
  }
}
function spawn(dim, type, loc, name, tags = [], ev) {
  try {
    const e = dim.spawnEntity(type, loc);
    if (ev) e.triggerEvent(ev);
    if (name) e.nameTag = name;
    for (const t of tags) e.addTag(t);
    return e;
  } catch { }
}
function policeResponse(p) {
  const w = wanted(p);
  if (!w) return;
  const dim = p.dimension, loc = p.location;
  const cops = count(dim, loc, 64, { families: ["palmera_police"] });
  const cars = count(dim, loc, 80, { type: "palmera:police_car" });
  const helis = count(dim, loc, 120, { type: "palmera:police_heli" });
  const wantCops = [0, 3, 4, 6, 7, 9][w], wantCars = [0, 0, 1, 2, 3, 4][w], wantHeli = [0, 0, 0, 0, 1, 2][w];
  const base = Math.random() * Math.PI * 2;
  for (let i = 0; i < 2 && cops + i < wantCops; i++) {
    let s;
    for (let tries = 0; tries < 3 && !s; tries++) {
      const a = base + i * Math.PI + rnd(-0.4, 0.4), r = rnd(26, 40);
      const g = ground(dim, Math.floor(loc.x + Math.cos(a) * r), Math.floor(loc.z + Math.sin(a) * r));
      if (g && (WALKABLE.has(g.block.typeId) || ROAD.has(g.block.typeId))) s = g.loc;
    }
    if (!s) continue;
    if (w >= 3 && Math.random() < 0.5) spawn(dim, "palmera:swat", s, "§8§lSWAT", ["cop"]);
    else spawn(dim, "palmera:cop", s, "§9Police", ["cop"]);
  }
  if (cars < wantCars) { const s = spotNear(p, 32, 55, t => ROAD.has(t)); if (s) spawn(dim, "palmera:police_car", s, "§9Police", ["cop"]); }
  if (w >= 3 && Math.random() < 0.35) {              // roadblock ahead of a fast-moving player
    const car = ridingCar(p);
    let v = { x: 0, z: 0 }; try { v = (car ?? p).getVelocity(); } catch { }
    const sp = Math.hypot(v.x, v.z);
    if (sp > 0.3) {
      const ahead = { x: loc.x + v.x / sp * 60, z: loc.z + v.z / sp * 60 };
      const g = ground(dim, Math.floor(ahead.x), Math.floor(ahead.z));
      if (g && ROAD.has(g.block.typeId)) {
        for (const off of [-3, 3]) spawn(dim, "palmera:police_car", add(g.loc, { x: -v.z / sp * off, y: 0, z: v.x / sp * off }), "§9Roadblock", ["cop", "deployed"]);
        for (let i = 0; i < 3; i++) spawn(dim, w >= 4 ? "palmera:swat" : "palmera:cop", add(g.loc, { x: rnd(-4, 4), y: 0, z: rnd(-4, 4) }), w >= 4 ? "§8§lSWAT" : "§9Police", ["cop"]);
      }
    }
  }
  if (helis < wantHeli) spawn(dim, "palmera:police_heli", add(loc, { x: rnd(-25, 25), y: 22, z: rnd(-25, 25) }), "§9Police Air", ["cop"]);
}
function clearPolice() {
  try { for (const e of OW().getEntities({ tags: ["cop"] })) { try { e.remove(); } catch { } } } catch { }
}
function heliTick() {
  let helis = [];
  try { helis = OW().getEntities({ type: "palmera:police_heli" }); } catch { }
  const targets = world.getAllPlayers().filter(p => wanted(p) >= 4);
  for (const h of helis) {
    const [t] = targets.map(p => [p, flat(p.location, h.location)]).sort((a, b) => a[1] - b[1])[0] ?? [];
    if (!t) { try { h.teleport(add(h.location, { x: 0, y: 2, z: 0 })); if (h.location.y > 160) h.remove(); } catch { } continue; }
    const ang = system.currentTick / 60;
    const goal = add(t.location, { x: Math.cos(ang) * 14, y: 16, z: Math.sin(ang) * 14 });
    const d = dist(goal, h.location), step = Math.min(d, 7);
    const np = d > 0.1 ? add(h.location, mul(norm({ x: goal.x - h.location.x, y: goal.y - h.location.y, z: goal.z - h.location.z }), step)) : h.location;
    try { h.teleport(np, { facingLocation: t.location }); } catch { }
    if (system.currentTick % 40 === 0) sound(h.dimension, "palmera.rotor", h.location, 1, 3);
  }
}

// ---------------------------------------------------------------- robberies & heists
const cooldown = new Map();
const robbing = new Map();
function robberyTick(p) {
  const it = held(p);
  if (!p.isSneaking || !isGun(it)) { robbing.delete(p.id); return; }
  let target, isBank = false;
  const [b, bd] = nearest(D.banks, p.location);
  if (b && bd < 4.5 && Math.abs(b[1] - p.location.y) < 4) { target = b; isBank = true; }
  else { const [r, rd] = nearest(D.rob, p.location); if (r && rd < 3.5 && Math.abs(r[1] - p.location.y) < 3) target = r; }
  if (!target) { robbing.delete(p.id); return; }
  const key = target.slice(0, 3).join(",");
  const mine = JSON.parse(prop(p, "biz", "[]")).some(i => D.businesses?.[i]?.slice(0, 3).join(",") === key);
  if (mine) { title(p, "§7This is your own business.", ""); return; }
  if ((cooldown.get(key) ?? -1e9) > system.currentTick) { title(p, "§7This place was hit recently. Come back later.", ""); return; }
  const st = robbing.get(p.id) ?? { key, t: 0 };
  if (st.key !== key) { st.key = key; st.t = 0; }
  st.t += 10; robbing.set(p.id, st);
  const need = isBank ? 600 : 160;
  if (isBank && st.t % 40 === 0) sound(p.dimension, "random.anvil_use", p.location, 1.3, 0.6);
  if (isBank && st.t % 200 === 10) { setWanted(p, Math.max(wanted(p), 3)); for (let i = 0; i < 2; i++) { const s = spotNear(p, 8, 16); if (s) spawn(p.dimension, "palmera:swat", s, "§8§lSWAT", ["cop"]); } }
  if (!isBank && st.t === 10) {
    const line = pick(["Please don't shoot!", "Take it, take it!", "The register is empty, I swear!", "Not again..."]);
    msg(p, "§e[Clerk]§f " + line);
    try { for (const c of p.dimension.getEntities({ location: p.location, maxDistance: 6, tags: ["clerk"] })) c.nameTag = "§e" + line; } catch { }
  }
  if (st.t >= need) {
    robbing.delete(p.id);
    cooldown.set(key, system.currentTick + (isBank ? 24000 : 6000));
    const loot = isBank ? Math.floor(rnd(25000, 45000)) : Math.floor(rnd(target[3] === "gas" ? 300 : 400, target[3] === "gas" ? 900 : 1500));
    addCash(p, loot);
    setWanted(p, Math.max(wanted(p) + 2, isBank ? 4 : 2)); setProp(p, "wcd", 800);
    setProp(p, "crimes", prop(p, "crimes", 0) + 1);
    title(p, isBank ? "§6§lVAULT CRACKED" : "§e§lROBBERY", "§a+" + money(loot));
    if (isBank) trophy(p, "vault", "Vault Buster", "Crack a bank vault"); else trophy(p, "rob", "Register Ninja", "Rob a store");
    dailyTick(p, "rob");
    market(isBank ? "PALM" : "SUNY", -0.05);
    sound(p.dimension, "palmera.cash", p.location);
    const a = active.get(p.id);
    if (a) { if (isBank) a.heisted = true; else a.robbed = true; }
  }
}
function robHud(p) {
  const st = robbing.get(p.id);
  if (!st) return "";
  const need = D.banks.some(b => b.slice(0, 3).join(",") === st.key) ? 600 : 160;
  const f = Math.min(10, Math.floor(st.t / need * 10));
  return `  §e${need > 200 ? "DRILLING" : "ROBBING"} §a${"█".repeat(f)}§8${"█".repeat(10 - f)}`;
}

// ---------------------------------------------------------------- traffic & carjacking
function jack(p, target) {
  if (!valid(target)) return;
  const loc = target.location;
  let v = 0;
  try { v = target.getComponent("minecraft:variant")?.value ?? 0; } catch { }
  try { target.remove(); } catch { }
  const drv = spawn(p.dimension, "palmera:civilian", add(loc, { x: 1.8, y: 0, z: 0 }), "§c" + pick(["Hey! My car!", "Not my car!", "Thief!!"]));
  if (drv) { try { drv.triggerEvent("palmera:scare"); drv.applyKnockback(1, 0, 0.6, 0.3); } catch { } }
  trophy(p, "jack", "Grand Theft Palmera", "Steal a car from a driver");
  const car = spawn(p.dimension, "palmera:car", loc, undefined, ["jacked"], "palmera:c" + v);
  if (!car) return;
  try { car.getComponent("minecraft:rideable").addRider(p); } catch { }
  msg(p, "§7You stole a car.");
  if (count(p.dimension, p.location, 20, { families: ["civilian"] }) || count(p.dimension, p.location, 30, { families: ["palmera_police"] })) addStars(p, 1);
}
try {
  world.beforeEvents.playerInteractWithEntity.subscribe(ev => {
    if (ev.target?.typeId === "palmera:traffic_car") { ev.cancel = true; const p = ev.player, t = ev.target; system.run(() => jack(p, t)); }
  });
} catch { }
function bumpTick(p) {
  if (ridingCar(p)) return;
  try {
    const v = p.getVelocity(), sp = Math.hypot(v.x, v.z);
    if (sp < 0.2) return;
    for (const c of p.dimension.getEntities({ location: p.location, maxDistance: 1.3, type: "palmera:civilian" })) {
      if ((talked.get(c.id) ?? 0) > system.currentTick) continue;
      talked.set(c.id, system.currentTick + 200);
      try { c.applyKnockback(v.x / sp, v.z / sp, 0.5, 0.2); } catch { }
      const name = c.nameTag; c.nameTag = "§f" + pick(["Watch it!", "Hey!", "Excuse YOU.", "Rude!"]);
      system.runTimeout(() => { try { c.nameTag = name; } catch { } }, 50);
    }
  } catch { }
}
function honkTick(p) {
  bumpTick(p);
  if (ridingCar(p) || system.currentTick % 40 !== 0) return;
  try {
    const b = p.dimension.getBlock({ x: Math.floor(p.location.x), y: Math.floor(p.location.y) - 1, z: Math.floor(p.location.z) });
    if (!b || !ROAD.has(b.typeId)) return;
    const c = p.dimension.getEntities({ location: p.location, maxDistance: 9, type: "palmera:traffic_car" })[0];
    if (c) { sound(c.dimension, "palmera.horn", c.location, 1, 1.5); if (Math.random() < 0.3) msg(p, "§7[Driver] " + pick(["Get off the road!", "Move it!", "Are you crazy?!"])); }
  } catch { }
}
function carjackTick(p) {
  honkTick(p);
  if (!p.isSneaking || ridingCar(p)) return;
  try {
    const t = p.dimension.getEntities({ location: p.location, maxDistance: 3, type: "palmera:traffic_car" })[0];
    if (t) jack(p, t);
  } catch { }
}

// ---------------------------------------------------------------- ambient life
let worldCounts = { civ: 0, traffic: 0 };
system.runInterval(() => {
  try { worldCounts = { civ: OW().getEntities({ type: "palmera:civilian" }).length, traffic: OW().getEntities({ type: "palmera:traffic_car" }).length }; } catch { }
}, 40);
function ambient(p) {
  const dim = p.dimension, loc = p.location;
  const ps = world.getAllPlayers().length;
  if (worldCounts.civ > 28 * ps && worldCounts.traffic > 14 * ps) return;
  const civ = count(dim, loc, 48, { type: "palmera:civilian" });
  for (let i = 0; i < 2 && civ + i < 16 && worldCounts.civ < 28 * ps; i++) {
    const s = spotNear(p, 14, 36, t => WALKABLE.has(t));
    if (s && s.y > 62 && s.y < 70) spawn(dim, "palmera:civilian", s, pick(D.peds));
  }
  const cars = count(dim, loc, 72, { type: "palmera:traffic_car" });
  if (cars < 8 && worldCounts.traffic < 14 * ps) { const s = spotNear(p, 30, 60, t => ROAD.has(t)); if (s) spawn(dim, "palmera:traffic_car", s); }
  for (const g of D.gangs) {
    if (JSON.parse(prop(p, "turf", "[]")).includes(g.name)) continue;
    if (flat(V(g.pos), loc) < g.r && count(dim, loc, 60, { type: "palmera:gangster" }) < 6) {
      const s = spotNear(p, 16, 36, t => WALKABLE.has(t) || t === "minecraft:mud");
      if (s) spawn(dim, "palmera:gangster", s, (g.name === "Swamp Kings" ? "§2" : "§5") + g.name.slice(0, -1), ["gang"], "palmera:s" + pick(g.skins));
    }
  }
  const s = spotNear(p, 16, 40);
  if (s) {
    const b = dim.getBlock({ x: Math.floor(s.x), y: s.y - 1, z: Math.floor(s.z) });
    if (b?.typeId === "minecraft:mud" && count(dim, loc, 64, { type: "palmera:gator" }) < 3) spawn(dim, "palmera:gator", s);
    else if (b?.typeId === "minecraft:sand" && Math.random() < 0.2 && count(dim, loc, 64, { type: "palmera:flamingo" }) < 4) spawn(dim, "palmera:flamingo", s);
  }
}
function despawnFar() {
  const ps = world.getAllPlayers();
  const far = (e, r) => !ps.some(p => flat(p.location, e.location) < r);
  try {
    for (const e of OW().getEntities({ families: ["civilian"] })) if (far(e, e.hasTag("clerk") ? 70 : 100)) e.remove();
    for (const e of OW().getEntities({ type: "palmera:traffic_car" })) if (far(e, 120)) e.remove();
    for (const e of OW().getEntities({ type: "palmera:gangster", tags: ["gang"] })) if (far(e, 110)) e.remove();
    for (const t of ["palmera:gator", "palmera:flamingo"]) for (const e of OW().getEntities({ type: t })) if (far(e, 120)) e.remove();
    for (const e of OW().getEntities({ tags: ["parked"] })) if (far(e, 130)) { const t = e.getTags().find(x => x.startsWith("spot:")); if (t) usedSpots.delete(t.slice(5)); e.remove(); }
    for (const e of OW().getEntities({ tags: ["jacked"] })) {
      let ridden = false; try { ridden = e.getComponent("minecraft:rideable").getRiders().length > 0; } catch { }
      if (!ridden && far(e, 160)) e.remove();
    }
  } catch { }
}

// ---------------------------------------------------------------- missions (story, jobs, races)
const active = new Map();
function startMission(p, m) {
  if (active.has(p.id)) { msg(p, "§cFinish or cancel your current mission first."); return; }
  active.set(p.id, Object.assign({ i: 0, ents: [] }, m));
  title(p, "§d§l" + m.title, m.sub ?? "");
  const first = m.steps.find(st => st.pos);
  if (first && flat(V(first.pos), p.location) > 40) {
    shot(p, first.pos, 45, 25, 0.1);
    system.runTimeout(() => shot(p, first.pos, 35, 18, 3, 1.2), 2);
    system.runTimeout(() => { fade(p); system.runTimeout(() => cmd(p, "camera @s clear"), 10); }, 90);
  }
  enterStep(p);
}
function stepOf(p) { const a = active.get(p.id); return a && a.steps[a.i]; }
function enterStep(p) {
  const a = active.get(p.id);
  if (!a) return;
  const s = a.steps[a.i];
  if (!s) return finishMission(p, true);
  a.spawned = false; a.got = []; a.robbed = false; a.heisted = false; a.cp = 0; a.t0 = system.currentTick;
  const token = a.token = Math.random();
  if (s.t === "talk") {
    s.lines.forEach((l, k) => system.runTimeout(() => { if (valid(p) && active.get(p.id)?.token === token) msg(p, l); }, k * 60));
    system.runTimeout(() => { if (active.get(p.id)?.token === token) nextStep(p); }, s.lines.length * 60 + 10);
  } else if (s.t === "cash") {
    addCash(p, s.amount); msg(p, "§a+" + money(s.amount)); system.run(() => nextStep(p));
  } else if (s.t === "escape") {
    if (wanted(p) < 2) { setWanted(p, 2); setProp(p, "wcd", 700); }
  } else if (s.label) msg(p, "§e» " + s.label);
}
function nextStep(p) { const a = active.get(p.id); if (!a) return; a.i++; enterStep(p); }
function finishMission(p, ok) {
  const a = active.get(p.id);
  if (!a) return;
  active.delete(p.id);
  try { p.removeTag("gang_heat"); } catch { }
  for (const e of a.ents) { try { if (valid(e)) e.remove(); } catch { } }
  if (ok) {
    if (a.kind === "story") { setProp(p, "story", a.idx + 1); if (a.idx + 1 >= D.story.length) trophy(p, "story", "King of Palmera", "Finish the story"); }
    dailyTick(p, "mission");
    if (a.kind === "taxi") { dailyTick(p, "taxi"); }
    if (a.kind === "taxi") { const n = prop(p, "fares", 0) + 1; setProp(p, "fares", n); if (n >= 5) trophy(p, "taxi", "Cabbie", "Complete 5 taxi fares"); }
    if (/Launch/.test(a.title)) market("ORBT", 0.2);
    if (/Swamp/.test(a.title)) market("GATR", 0.12);
    setProp(p, "missions", prop(p, "missions", 0) + 1);
    title(p, "§6§lMISSION COMPLETE", "§f" + a.title);
    sound(p.dimension, "random.levelup", p.location);
  } else title(p, "§c§lMISSION FAILED", "§7" + a.title);
}
function missionTick(p) {
  const a = active.get(p.id);
  if (!a) return;
  const s = a.steps[a.i];
  if (!s) return;
  const dim = p.dimension, loc = p.location;
  switch (s.t) {
    case "goto": if (flat(loc, V(s.pos)) < s.r) nextStep(p); break;
    case "drive": {
      if (s.limit && system.currentTick - a.t0 > s.limit) { msg(p, "§cOut of time!"); finishMission(p, false); break; }
      if (ridingCar(p) && flat(loc, V(s.pos)) < s.r) nextStep(p);
      break;
    }
    case "escape": if (wanted(p) === 0) nextStep(p); break;
    case "rob": if (a.robbed) nextStep(p); break;
    case "heist": if (a.heisted) nextStep(p); break;
    case "collect": {
      s.items.forEach((it, k) => {
        if (a.got.includes(k)) return;
        const pos = V(it);
        if (flat(loc, pos) < 60) for (let y = 0; y < 6; y++) particle(dim, "minecraft:villager_happy", add(pos, { x: 0, y: y * 0.6, z: 0 }));
        if (dist(loc, pos) < 2.5) { a.got.push(k); msg(p, `§aLedger ${a.got.length}/${s.items.length}`); sound(dim, "random.orb", loc); }
      });
      if (a.got.length >= s.items.length) nextStep(p);
      break;
    }
    case "kill": {
      const pos = V(s.pos), d = flat(loc, pos);
      if (!a.spawned && d < 48) {
        a.spawned = true;
        p.addTag("gang_heat");
        if (s.spawn.some(x => x[0] === "palmera:swat")) setWanted(p, Math.max(wanted(p), 3));
        let n = 0;
        for (const [type, name, cnt, boss] of s.spawn) for (let i = 0; i < cnt; i++) {
          const ang = (n++) * 2.4, r = boss ? 0 : 3 + (n % 3);
          const e = spawn(dim, type, add(pos, { x: Math.cos(ang) * r, y: 0, z: Math.sin(ang) * r }), (boss ? "§4§l" : "§c") + name, boss ? ["mission", "boss"] : ["mission"]);
          if (e) { a.ents.push(e); if (boss) { try { e.addEffect("resistance", 20000000, { amplifier: 1, showParticles: false }); } catch { } } }
        }
        msg(p, "§cThere they are. Take them out!");
      } else if (a.spawned && d < 120) {
        if (!a.ents.some(valid)) nextStep(p);
      }
      break;
    }
    case "race": {
      const cp = s.cps[a.cp];
      if (!cp) break;
      const pos = V(cp);
      if (flat(loc, pos) < 80) for (let y = 0; y < 10; y++) particle(dim, "minecraft:endrod", add(pos, { x: 0, y: y, z: 0 }));
      if (flat(loc, pos) < 9) {
        a.cp++; sound(dim, "note.pling", loc, 1 + a.cp * 0.1);
        if (a.cp >= s.cps.length) {
          const secs = (system.currentTick - a.t0) / 20;
          if (secs <= s.par) { addCash(p, s.reward); msg(p, `§aFinished in ${secs.toFixed(1)}s (par ${s.par}s): +${money(s.reward)}`); }
          else { addCash(p, 500); msg(p, `§eFinished in ${secs.toFixed(1)}s, too slow for par ${s.par}s. +$500 for trying.`); }
          nextStep(p);
        } else msg(p, `§7Checkpoint ${a.cp}/${s.cps.length}`);
      }
      break;
    }
  }
}
function objective(p) {
  const s = stepOf(p);
  if (s) {
    if (s.t === "race") { const cp = s.cps[active.get(p.id).cp]; return cp && { label: "Checkpoint", pos: V(cp) }; }
    if (s.t === "collect") { const a = active.get(p.id); const k = s.items.findIndex((_, i) => !a.got.includes(i)); return k >= 0 && { label: s.label, pos: V(s.items[k]) }; }
    if (s.t === "escape") return { label: "Lose the cops" };
    if (s.t === "rob" && s.pos) return { label: s.label, pos: V(s.pos) };
    if (s.pos) return { label: s.label, pos: V(s.pos) };
    if (s.label) return { label: s.label };
  }
  const wp = prop(p, "wp", "");
  if (wp) { try { const w = JSON.parse(wp); return { label: w.name, pos: V(w.pos) }; } catch { } }
}
function storyMission(p) {
  const idx = prop(p, "story", 0);
  const m = D.story[idx];
  if (!m) { msg(p, "§6You finished the story! Jobs, races, robberies and heists are always available."); return; }
  startMission(p, { kind: "story", idx, title: m.title, sub: `§7Story ${idx + 1}/${D.story.length}`, steps: m.steps });
}
function jobMission(p, j) {
  startMission(p, { kind: "job", title: j.title, sub: "§7" + j.where, steps: [
    { t: "talk", lines: ["§e[Job]§f " + j.desc] },
    { t: "kill", pos: j.spot, label: j.title, spawn: [["palmera:gangster", j.boss, 1, true], ["palmera:gangster", "Goon", j.goons, false]] },
    { t: "cash", amount: j.reward }] });
}
function deliveryMission(p) {
  const spots = D.rob.filter(s => { const d = flat(V(s), p.location); return d > 250 && d < 1400; });
  if (!spots.length) { msg(p, "§7No deliveries available around here."); return; }
  const to = pick(spots), d = flat(V(to), p.location);
  const limit = Math.round(d / 9 + 25) * 20, pay = Math.round(d * 2.2 / 50) * 50 + 300;
  startMission(p, { kind: "job", title: "Delivery Run", sub: `§7${Math.round(d)}m, ${Math.round(limit / 20)}s, ${money(pay)}`, steps: [
    { t: "talk", lines: ["§a[Dispatcher]§f Package for a shop across town. Get a car and step on it."] },
    { t: "drive", pos: to.slice(0, 3), r: 10, label: "Deliver the package", limit },
    { t: "cash", amount: pay }] });
}
function taxiJob(p) {
  if (!ridingCar(p)) { msg(p, "§cGet in a car first, then start the taxi job."); return; }
  const near_ = D.rob.filter(s => { const d = flat(V(s), p.location); return d > 60 && d < 300; });
  const far_ = D.rob.filter(s => { const d = flat(V(s), p.location); return d > 300 && d < 1100; });
  if (!near_.length || !far_.length) { msg(p, "§7No fares around here."); return; }
  const a = pick(near_), b = pick(far_), fare = Math.round(flat(V(a), V(b)) * 1.6 / 10) * 10 + 150;
  startMission(p, { kind: "taxi", title: "Taxi Fare", sub: `§7Fare ${money(fare)}`, steps: [
    { t: "drive", pos: a.slice(0, 3), r: 9, label: "Pick up the passenger" },
    { t: "talk", lines: ["§e[Passenger]§f " + pick(["Take me across town, and step on it!", "Downtown, please. I'm late!", "Follow the GPS, I tip well."])] },
    { t: "drive", pos: b.slice(0, 3), r: 9, label: "Drop off the passenger", limit: Math.round(flat(V(a), V(b)) / 8 + 30) * 20 },
    { t: "cash", amount: fare }] });
}
function vigilanteMission(p) {
  const spots = D.rob.filter(s => { const d = flat(V(s), p.location); return d > 150 && d < 900; });
  if (!spots.length) { msg(p, "§7No criminals reported nearby."); return; }
  const at = pick(spots);
  startMission(p, { kind: "job", title: "Vigilante", sub: "§7Armed suspects reported", steps: [
    { t: "talk", lines: ["§9[Scanner]§f Armed suspects reported near " + at.slice(0, 3).join(" ") + ". Take them down."] },
    { t: "kill", pos: at.slice(0, 3), label: "Take down the suspects", spawn: [["palmera:gangster", "Suspect", 3, false], ["palmera:gangster", "Ringleader", 1, true]] },
    { t: "cash", amount: 2500 }] });
}
function raceMission(p, r) {
  startMission(p, { kind: "race", title: r.title, sub: `§7Street race, par ${r.par}s`, steps: [
    { t: "goto", pos: r.cps[0], r: 10, label: "Go to the start line" },
    { t: "talk", lines: ["§e3...", "§e2...", "§e1...", "§a§lGO!"] },
    { t: "race", cps: r.cps.slice(1), par: r.par, reward: r.reward }] });
}

// ---------------------------------------------------------------- phone
async function phone(p) {
  sound(p.dimension, "palmera.phone", p.location, 1, 0.6);
  const story = D.story[prop(p, "story", 0)];
  const f = new ActionFormData().title(`§d${I.phone} Palmera Phone`)
    .body(`§aCash ${money(cash(p))}   §bBank ${money(bank(p))}   §fAmmo ${ammo(p)}   §eWanted ${"★".repeat(wanted(p)) || "-"}`)
    .button(`§dStory\n§8${story ? story.title : "Complete"}`, "textures/ui/palmera_app_story")
    .button("§cJobs & Races\n§8Make money", "textures/ui/palmera_app_jobs")
    .button("§6Sunshine Arms\n§8Guns, ammo, armor", "textures/ui/palmera_app_arms")
    .button("§bCoastline Motors\n§8Buy a car", "textures/ui/palmera_app_cars")
    .button("§2Real Estate\n§8Safehouses", "textures/ui/palmera_app_estate")
    .button("§3Palm Bank\n§8Deposit / withdraw", "textures/ui/palmera_app_bank")
    .button("§fGPS\n§8Set a waypoint", "textures/ui/palmera_app_gps")
    .button(`§eTaxi\n§8Fast travel ($250)`, "textures/ui/palmera_app_gps")
    .button(`§9Call Lawyer\n§8Clear wanted level`, "textures/ui/palmera_app_lawyer")
    .button("§5Feed\n§8What's happening", "textures/ui/palmera_app_feed")
    .button("§6Exchange\n§8Stocks", "textures/ui/palmera_app_bank")
    .button("§bCall My Car\n§8Delivered to you", "textures/ui/palmera_app_cars")
    .button(active.has(p.id) ? "§8Cancel current mission" : "§7Settings & Stats", active.has(p.id) ? "textures/ui/palmera_app_stats" : "textures/ui/palmera_app_settings");
  const r = await f.show(p);
  if (r.canceled) return;
  [() => storyMission(p), () => jobsForm(p), () => shopForm(p, "arms", "§6Sunshine Arms"), () => shopForm(p, "cars", "§bCoastline Motors"),
  () => estateForm(p), () => bankForm(p), () => gpsForm(p), () => taxi(p), () => lawyer(p), () => feed(p), () => exchange(p), () => callCar(p),
  () => active.has(p.id) ? finishMission(p, false) : settings(p)][r.selection]?.();
}
async function jobsForm(p) {
  const f = new ActionFormData().title("§cJobs & Races").body("§7Pick something:");
  for (const j of D.jobs) f.button(`§f${j.title} §6${money(j.reward)}\n§8${j.where}`);
  for (const r of D.races) f.button(`§bRace: ${r.title} §6${money(r.reward)}\n§8Par ${r.par}s`);
  f.button("§aDelivery Run\n§8Drive a package across town, against the clock");
  f.button("§9Vigilante\n§8Hunt down armed criminals");
  f.button("§eTaxi Driver\n§8Pick up fares in your car");
  const r = await f.show(p);
  if (r.canceled) return;
  const nj = D.jobs.length, nr = D.races.length;
  if (r.selection < nj) jobMission(p, D.jobs[r.selection]);
  else if (r.selection < nj + nr) raceMission(p, D.races[r.selection - nj]);
  else if (r.selection === nj + nr) deliveryMission(p);
  else if (r.selection === nj + nr + 1) vigilanteMission(p);
  else taxiJob(p);
}
async function shopForm(p, cat, name) {
  const list = D.shop.filter(s => s.cat === cat);
  const f = new ActionFormData().title(name).body(`§aYou have ${money(cash(p))}`);
  for (const s of list) f.button(`${s.label}\n§2${money(s.price)}`, s.icon);
  if (cat === "cars") f.button("§aQuick Coat Respray\n§2$1,000 §8(drive in first)", "textures/ui/palmera_app_cars");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === list.length) { respray(p); return; }
  buy(p, list[r.selection]);
}
function buy(p, s) {
  if (cash(p) < s.price) { msg(p, `§cNot enough cash for ${s.label} (${money(s.price)}). Try the bank or a job.`); return; }
  addCash(p, -s.price);
  const k = s.key;
  if (GUNS["palmera:" + k] || k === "bat") give(p, "palmera:" + k);
  else if (k === "ammo") addAmmo(p, 60);
  else if (k === "ammo300") addAmmo(p, 300);
  else if (k === "grenade") give(p, "palmera:grenade", 4);
  else if (k === "molotov") give(p, "palmera:molotov", 4);
  else if (k === "nitro") give(p, "palmera:nitro", 3);
  else if (k.startsWith("glow_")) { setProp(p, "glow", k.slice(5)); msg(p, "§bUnderglow installed. It lights up whatever car you drive."); }
  else if (k === "armor") { give(p, "minecraft:iron_chestplate", 1, "§7Body Armor"); give(p, "minecraft:iron_helmet", 1, "§7Helmet"); }
  else if (k === "medkit") give(p, "minecraft:golden_apple", 3, "§aMedkit");
  else if (k === "car_sedan") spawnCar(p, "palmera:car");
  else if (k === "car_sports") spawnCar(p, "palmera:sports_car");
  else if (k === "car_bike") spawnCar(p, "palmera:bike");
  else if (k === "car_heli") spawnCar(p, "palmera:heli");
  else if (k === "car_boat") {
    const s = spotNear(p, 2, 8, t => t === "minecraft:water");
    if (!s) { addCash(p, s ? 0 : 20000); msg(p, "§cStand next to open water to launch a boat. (refunded)"); return; }
    const b = spawn(p.dimension, "palmera:speedboat", add(s, { x: 0, y: 0.2, z: 0 }), undefined, [], "palmera:c" + Math.floor(Math.random() * 10));
    if (b) setProp(p, "car", b.id);
  }
  sound(p.dimension, "palmera.cash", p.location);
  msg(p, `§aBought ${s.label} for ${money(s.price)}.`);
  market("CSTL", 0.01);
}
function spawnCar(p, type) {
  const old = prop(p, "car", "");
  if (old) { try { world.getEntity(old)?.remove(); } catch { } }
  const d = p.getViewDirection();
  const car = spawn(p.dimension, type, add(p.location, { x: d.x * 4, y: 0.5, z: d.z * 4 }), undefined, [], "palmera:c" + Math.floor(Math.random() * 10));
  if (car) { setProp(p, "car", car.id); msg(p, "§bYour car is parked in front of you. Interact with it to drive."); }
}
// ---------------------------------------------------------------- respray + stock market
function respray(p) {
  const car = ridingCar(p);
  if (!car) { msg(p, "§cDrive a car in first."); return; }
  if (cash(p) < 1000) { msg(p, "§cA respray costs $1,000."); return; }
  addCash(p, -1000);
  try { car.triggerEvent("palmera:c" + Math.floor(Math.random() * 10)); } catch { }
  sound(p.dimension, "random.fizz", p.location, 0.8);
  if (wanted(p) <= 2) { setWanted(p, 0); msg(p, "§a[Quick Coat]§f Fresh paint, new plates. The cops lost track of you."); if (!world.getAllPlayers().some(x => wanted(x) > 0)) clearPolice(); }
  else msg(p, "§a[Quick Coat]§f Nice color. The cops still know it's you, though.");
}
const TICKERS = { SUNY: ["Sunny Mart Corp", 42], PALM: ["Palm Bank", 120], CSTL: ["Coastline Motors", 65], GATR: ["Gator Energy", 18],
                  ORBT: ["Orbital Palmera", 230], NEON: ["Neon Nights Ent.", 31] };
function prices() { try { return JSON.parse(world.getDynamicProperty("market") ?? "{}"); } catch { return {}; } }
function market(t, pct) {
  const m = prices();
  for (const k in TICKERS) if (m[k] === undefined) m[k] = TICKERS[k][1];
  if (t) m[t] = Math.max(1, m[t] * (1 + pct));
  try { world.setDynamicProperty("market", JSON.stringify(m)); } catch { }
  return m;
}
system.runInterval(() => {
  const m = market();
  for (const k in m) m[k] = Math.max(1, +(m[k] * (1 + (Math.random() - 0.48) * 0.06)).toFixed(2));
  try { world.setDynamicProperty("market", JSON.stringify(m)); } catch { }
}, 1200);
function callCar(p) {
  const id = prop(p, "car", "");
  let car; try { car = id && world.getEntity(id); } catch { }
  if (!car) { msg(p, "§7You don't own a car right now. Buy one at Coastline Motors, or steal one."); return; }
  const s = spotNear(p, 6, 14, t => ROAD.has(t)) ?? spotNear(p, 4, 10);
  if (!s) { msg(p, "§7No space to bring your car here."); return; }
  try { car.teleport(s); } catch { }
  title(p, "§bYour car is here", "§7Parked nearby");
}
async function exchange(p) {
  const m = market(), own = JSON.parse(prop(p, "stocks", "{}"));
  const keys = Object.keys(TICKERS);
  const f = new ActionFormData().title("§6Palmera Exchange").body("§7Prices move every minute. Robbing a Sunny Mart hurts SUNY; crashing the spaceport deal lifts ORBT...");
  for (const k of keys) f.button(`§f${k} §7${TICKERS[k][0]}\n§a$${m[k].toFixed(2)} §8owned ${own[k] ?? 0}`);
  const r = await f.show(p);
  if (r.canceled) return;
  const k = keys[r.selection];
  const g = await new ActionFormData().title(`§6${k}`).body(`§f${TICKERS[k][0]} at §a$${m[k].toFixed(2)}§f. You own ${own[k] ?? 0}.`)
    .button("Buy 10").button("Buy 100").button("Sell all").show(p);
  if (g.canceled) return;
  if (g.selection < 2) {
    const n = g.selection ? 100 : 10, cost = Math.ceil(n * m[k]);
    if (cash(p) < cost) { msg(p, "§cNot enough cash."); return; }
    addCash(p, -cost); own[k] = (own[k] ?? 0) + n; market(k, 0.002 * n / 10);
  } else {
    const n = own[k] ?? 0; addCash(p, Math.floor(n * m[k])); own[k] = 0; market(k, -0.002 * n / 10);
    msg(p, `§aSold ${n} ${k} for ${money(n * m[k])}.`);
  }
  setProp(p, "stocks", JSON.stringify(own));
}
async function estateForm(p) {
  const owned = JSON.parse(prop(p, "homes", "[]"));
  const f = new ActionFormData().title("§2Real Estate").body("§7Safehouses become your respawn point and pay daily income into your bank.");
  D.safehouses.forEach((h, i) => f.button(`${owned.includes(i) ? "§a[OWNED] " : ""}§f${h.kind === "mansion" ? "Isle Mansion" : "Family Home"} #${i + 1}\n§2${money(h.price)} §8+${money(h.income)}/day`));
  const biz = JSON.parse(prop(p, "biz", "[]"));
  (D.businesses ?? []).forEach((b, i) => f.button(`${biz.includes(i) ? "§a[OWNED] " : ""}§6${b[3].toUpperCase()} business #${i + 1}\n§2$120,000 §8+$1,500/day`));
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection >= D.safehouses.length) {
    const i = r.selection - D.safehouses.length, b = D.businesses[i];
    if (biz.includes(i)) { setProp(p, "wp", JSON.stringify({ name: "Your business", pos: b.slice(0, 3) })); msg(p, "§aWaypoint set to your business."); return; }
    if (cash(p) + bank(p) < 120000) { msg(p, "§cYou can't afford this business yet."); return; }
    let left = 120000; const c = Math.min(cash(p), left); addCash(p, -c); left -= c; setProp(p, "bank", bank(p) - left);
    biz.push(i); setProp(p, "biz", JSON.stringify(biz));
    title(p, "§6§lBUSINESS BOUGHT", "§7+$1,500 every day. Nobody robs your own place.");
    return;
  }
  const i = r.selection, h = D.safehouses[i];
  if (owned.includes(i)) { setProp(p, "wp", JSON.stringify({ name: "Safehouse", pos: h.pos })); msg(p, "§aWaypoint set to your safehouse."); return; }
  if (cash(p) + bank(p) < h.price) { msg(p, "§cYou can't afford this place yet."); return; }
  let left = h.price; const c = Math.min(cash(p), left); addCash(p, -c); left -= c; setProp(p, "bank", bank(p) - left);
  owned.push(i); setProp(p, "homes", JSON.stringify(owned));
  try { p.setSpawnPoint({ dimension: OW(), x: h.pos[0] + 0.5, y: h.pos[1], z: h.pos[2] + 0.5 }); } catch { }
  setProp(p, "wp", JSON.stringify({ name: "Safehouse", pos: h.pos }));
  title(p, "§2§lPROPERTY BOUGHT", "§7Spawn point and income set");
}
async function bankForm(p) {
  const f = new ActionFormData().title("§3Palm Bank").body(`§aCash ${money(cash(p))}\n§bBank ${money(bank(p))}\n§7Money in the bank is safe when you die.`)
    .button("Deposit all cash").button("Withdraw $1,000").button("Withdraw $10,000").button("Withdraw all");
  const r = await f.show(p);
  if (r.canceled) return;
  const b = bank(p), c = cash(p);
  if (r.selection === 0) { setProp(p, "bank", b + c); setScore("pl_cash", p, 0); }
  else { const amt = Math.min(b, [0, 1000, 10000, b][r.selection]); setProp(p, "bank", b - amt); addCash(p, amt); }
  sound(p.dimension, "random.orb", p.location);
}
async function gpsForm(p) {
  const opts = [];
  for (const [name, list] of [["Nearest Hospital", D.hospitals], ["Nearest Police Station", D.police], ["Nearest Sunshine Arms", D.gunshops], ["Nearest Palm Bank", D.banks]]) {
    const [b] = nearest(list, p.location); if (b) opts.push([name, b]);
  }
  for (const [name, pos] of D.landmarks) opts.push([name, pos]);
  const f = new ActionFormData().title("§fGPS").body("§7Choose a destination:");
  for (const [n] of opts) f.button(n);
  f.button("§8Clear waypoint");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === opts.length) { setProp(p, "wp", ""); return; }
  const [n, pos] = opts[r.selection];
  setProp(p, "wp", JSON.stringify({ name: n, pos }));
  msg(p, `§aWaypoint set: ${n} (${pos[0]} ${pos[1]} ${pos[2]})`);
}
async function taxi(p) {
  if (wanted(p) > 0) { msg(p, "§e[Taxi]§f Not with the cops on your tail, pal."); return; }
  const dests = D.landmarks.slice();
  for (const [name, list] of [["Nearest Hospital", D.hospitals], ["Nearest Sunshine Arms", D.gunshops], ["Nearest Palm Bank", D.banks]]) {
    const [b] = nearest(list, p.location); if (b) dests.unshift([name, b]);
  }
  const f = new ActionFormData().title("§eTaxi").body("§7$250 anywhere in Palmera.");
  for (const [n] of dests) f.button(n);
  const r = await f.show(p);
  if (r.canceled) return;
  if (cash(p) < 250) { msg(p, "§cYou can't afford the fare."); return; }
  addCash(p, -250);
  const [n, pos] = dests[r.selection];
  title(p, "§e§lTAXI", "§7Heading to " + n + "...");
  system.runTimeout(() => fade(p), 30);
  system.runTimeout(() => { try { p.teleport({ x: pos[0] + 0.5, y: pos[1] + 1, z: pos[2] + 2.5 }); } catch { } }, 40);
}
function lawyer(p) {
  const w = wanted(p);
  if (!w) { msg(p, "§9[Lawyer]§f You're clean, kid. Call me when you're not."); return; }
  const fee = w * 1500;
  if (cash(p) < fee) { msg(p, `§9[Lawyer]§f My fee is ${money(fee)}. Come back with cash.`); return; }
  addCash(p, -fee); setWanted(p, 0);
  msg(p, `§9[Lawyer]§f Paperwork's filed. You were never there. (${money(fee)})`);
  if (!world.getAllPlayers().some(x => wanted(x) > 0)) clearPolice();
}
const HINTS = {
  goto: "Follow the purple GPS distance on your HUD, it points the way.",
  drive: "Grab any car: crouch next to one on the street, or buy one at Coastline Motors.",
  rob: "Walk up to the shop counter, crouch and hold a gun out until the bar fills.",
  escape: "Break line of sight. Get indoors or far away, the stars drop faster when you hide inside.",
  kill: "They're marked as purple dots on your radar. Bring armor and medkits from Sunshine Arms.",
  heist: "Get inside the vault behind the counter, crouch with a gun and hold. SWAT comes in waves.",
  collect: "Look for the green sparkles near the shops in Port Isla.",
  race: "Stay on the road and hit every white beam. A sports car makes par easy.",
};
function contacts(p) {
  const s = stepOf(p);
  const who = pick(["§d[Sol]", "§6[Benny]"]);
  msg(p, `${who}§f ` + (s ? (HINTS[s.t] ?? "You've got this. Check your objective on the HUD.") : pick(["Bored? Pull a job from the phone.", "Heard Palm Bank's vault is full this week...", "Gang turf pays well if you clear it out."])));
  sound(p.dimension, "palmera.phone", p.location, 1.2, 0.6);
}
const DAILY = [["rob", 3, "Rob 3 stores", 3000], ["kill_gang", 8, "Take down 8 gang members", 2500], ["taxi", 2, "Complete 2 taxi fares", 2000],
               ["token", 2, "Find 2 Palm Tokens", 2000], ["mission", 2, "Complete 2 missions or jobs", 3500]];
function daily(p) {
  const day = Math.floor(system.currentTick / 24000);
  if (prop(p, "daily_day", -1) !== day) { setProp(p, "daily_day", day); setProp(p, "daily_prog", 0); setProp(p, "daily_done", false); }
  return DAILY[day % DAILY.length];
}
function dailyTick(p, kind) {
  const [k, n, label, reward] = daily(p);
  if (k !== kind || prop(p, "daily_done", false)) return;
  const v = prop(p, "daily_prog", 0) + 1;
  setProp(p, "daily_prog", v);
  if (v >= n) { setProp(p, "daily_done", true); addCash(p, reward); title(p, "§b§lDAILY CHALLENGE", `§f${label} §a+${money(reward)}`); }
  else title(p, "§bDaily challenge", `§f${label} ${v}/${n}`);
}
function feed(p) {
  const posts = [...D.feed].sort(() => Math.random() - 0.5).slice(0, 5);
  const [, n, label, reward] = daily(p);
  new ActionFormData().title("§5Feed").body(`§bToday's challenge: §f${label} §7(${prop(p, "daily_prog", 0)}/${n}) §a${money(reward)}\n\n` + posts.join("\n\n"))
    .button("§dCall Sol / Benny for a hint").button("Close").show(p).then(r => { if (!r.canceled && r.selection === 0) contacts(p); });
}
async function settings(p) {
  const mm = prop(p, "set_minimap", false), h = prop(p, "set_hud", "full"), rd = prop(p, "set_radar", false);
  const f = new ActionFormData().title("§7Settings").body(`§aCash ${money(cash(p))} §bBank ${money(bank(p))}\n§7Story ${prop(p, "story", 0)}/${D.story.length} | Missions ${prop(p, "missions", 0)} | Crimes ${prop(p, "crimes", 0)} | Palm Tokens ${JSON.parse(prop(p, "tokens", "[]")).length}/${TOKENS.length}`)
    .button("§6Trophies")
    .button(`Fast running: ${prop(p, "set_run", true) ? "§aON" : "§cOFF"}`)
    .button(`Radar map (off-hand): ${rd ? "§aON" : "§cOFF"}`).button(`HUD: ${h === "full" ? "§aON" : "§cOFF"}`).button(`Text radar: ${mm ? "§aON" : "§cOFF"}`);
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === 0) return trophies(p);
  if (r.selection === 1) { setProp(p, "set_run", !prop(p, "set_run", true)); return; }
  if (r.selection - 1 === 1) { setProp(p, "set_radar", !rd); if (rd) radarOff(p); }
  if (r.selection === 3) setProp(p, "set_hud", h === "full" ? "off" : "full");
  if (r.selection === 4) setProp(p, "set_minimap", !mm);
}
function stats(p) {
  msg(p, `§aCash ${money(cash(p))} §bBank ${money(bank(p))} §7| Story ${prop(p, "story", 0)}/${D.story.length} | Missions ${prop(p, "missions", 0)} | Crimes ${prop(p, "crimes", 0)} | Homes ${JSON.parse(prop(p, "homes", "[]")).length}`);
}

// ---------------------------------------------------------------- HUD + minimap
const RR = 2, RC = 3;                         // radar: 5 rows x 7 columns, heading-up
function cellAt(cx, cz) {
  const row = D.mm[cz];
  if (!row || cx < 0 || cx >= row.length) return VOID;
  return TILE[row.charCodeAt(cx) - 48] ?? VOID;
}
function minimap(p, o) {
  const car = ridingCar(p);
  const C = car ? 28 : 16;                      // zoom out while driving
  const yaw = p.getRotation().y * Math.PI / 180;
  const f = { x: -Math.sin(yaw), z: Math.cos(yaw) }, r = { x: -Math.cos(yaw), z: -Math.sin(yaw) };
  const L = p.location, marks = new Map();
  const toScreen = (pos) => {
    const wx = pos.x - L.x, wz = pos.z - L.z;
    return [(wx * r.x + wz * r.z) / C, -(wx * f.x + wz * f.z) / C];
  };
  const put = (pos, glyph, pin) => {
    let [sx, sy] = toScreen(pos);
    const k = Math.max(Math.abs(sx) / RC, Math.abs(sy) / RR);
    if (k > 1.15) { if (!pin) return; sx /= k; sy /= k; }
    const key = `${Math.round(sx)},${Math.round(sy)}`;
    if (key !== "0,0") marks.set(key, glyph);
  };
  const near = (list, glyph) => { for (const s of list) if (flat(V(s), L) < C * 6) put(V(s), glyph, false); };
  near(D.banks, POI.bank); near(D.gunshops, POI.guns); near(D.hospitals, POI.hospital); near(D.police, POI.police);
  try {
    const homes = JSON.parse(prop(p, "homes", "[]")).map(i => D.safehouses[i]?.pos).filter(Boolean);
    near(homes, POI.home);
    const mine = prop(p, "car", "") && world.getEntity(prop(p, "car", ""));
    if (mine && !car) put(mine.location, POI.car, false);
    for (const e of p.dimension.getEntities({ location: L, maxDistance: C * 5, tags: ["mission"] })) put(e.location, GANGDOT, false);
    for (const e of p.dimension.getEntities({ location: L, maxDistance: C * 6, families: ["palmera_police"] })) put(e.location, COPDOT, wanted(p) > 0);
  } catch { }
  const [nx, ny] = [Math.sin(yaw), Math.cos(yaw)];
  const kN = Math.max(Math.abs(nx) / RC, Math.abs(ny) / RR);
  marks.set(`${Math.round(nx / kN)},${Math.round(ny / kN)}`, POI.north);
  const wp = prop(p, "wp", "");
  if (wp) { try { put(V(JSON.parse(wp).pos), POI.pin, true); } catch { } }
  if (o && o.pos) put(o.pos, TARGET, true);
  const rows = [];
  for (let sy = -RR; sy <= RR; sy++) {
    let line = "";
    for (let sx = -RC; sx <= RC; sx++) {
      if (Math.abs(sx) === RC && Math.abs(sy) === RR) { line += RIM; continue; }
      if (sx === 0 && sy === 0) { line += ARROW[4]; continue; }
      const m = marks.get(`${sx},${sy}`);
      if (m) { line += m; continue; }
      const wx = L.x + r.x * sx * C - f.x * sy * C, wz = L.z + r.z * sx * C - f.z * sy * C;
      line += cellAt(Math.floor(wx / D.mmcell), Math.floor(wz / D.mmcell));
    }
    rows.push(line);
  }
  return rows.join("\n");
}
const RAD = D.radar;
const RG = c => String.fromCharCode(c);
function radarRows(p) {
  const n = RAD.n, h = (n - 1) / 2, b = RAD.bpg;
  const ptx = Math.floor(p.location.x / b), ptz = Math.floor(p.location.z / b);
  const rows = [];
  for (let dz = -h; dz <= h; dz++) {
    let line = "";
    for (let dx = -h; dx <= h; dx++) {
      const tx = ptx + dx, tz = ptz + dz;
      line += (tx < 0 || tz < 0 || tx >= RAD.T || tz >= RAD.T) ? G(0x15) : RG(RAD.base + tz * RAD.T + tx);
    }
    rows.push(line);
  }
  return rows.join("\n");
}
function overlayRows(p, o) {
  const n = RAD.n, h = (n - 1) / 2, b = RAD.bpg;
  const ptx = Math.floor(p.location.x / b), ptz = Math.floor(p.location.z / b);
  const cells = new Map();
  const sub = (x, z) => Math.min(3, Math.floor(((x % b) + b) % b / b * 4)) + 4 * Math.min(3, Math.floor(((z % b) + b) % b / b * 4));
  const put = (pos, type, pin) => {
    let tx = Math.floor(pos.x / b) - ptx, tz = Math.floor(pos.z / b) - ptz;
    let sx = pos.x, sz = pos.z;
    if (Math.abs(tx) > h || Math.abs(tz) > h) {
      if (!pin) return;
      const k = Math.max(Math.abs(tx), Math.abs(tz)) / h;
      tx = Math.round(tx / k); tz = Math.round(tz / k); sx = b * 1.5; sz = b * 1.5;
    }
    const key = `${tx},${tz}`;
    if (!cells.has(key)) cells.set(key, RG(0xF300 + type * 16 + sub(sx, sz)));
  };
  const yaw = ((p.getRotation().y % 360) + 360) % 360;
  cells.set("0,0", RG(0xF200 + (Math.round(yaw / 45) % 8) * 16 + sub(p.location.x, p.location.z)));
  if (o && o.pos) put(o.pos, 0, true);
  const wp = prop(p, "wp", "");
  if (wp) { try { put(V(JSON.parse(wp).pos), 1, true); } catch { } }
  try {
    for (const e of p.dimension.getEntities({ location: p.location, maxDistance: b * 2.6, families: ["palmera_police"] })) put(e.location, 2, wanted(p) > 0);
    for (const e of p.dimension.getEntities({ location: p.location, maxDistance: b * 2.6, tags: ["mission"] })) put(e.location, 3, false);
  } catch { }
  for (const [list, t] of [[D.banks, 4], [D.gunshops, 5], [D.hospitals, 6], [D.police, 7]]) for (const s of list) if (flat(V(s), p.location) < b * 2.6) put(V(s), t, false);
  const mine = prop(p, "car", "");
  if (mine && !ridingCar(p)) { try { const c = world.getEntity(mine); if (c) put(c.location, 9, false); } catch { } }
  const rows = [];
  for (let dz = -h; dz <= h; dz++) {
    let line = "";
    for (let dx = -h; dx <= h; dx++) line += cells.get(`${dx},${dz}`) ?? RG(0xF280);
    rows.push(line);
  }
  return rows.join("\n");
}
function statusText(p) {
  const w = wanted(p), o = objective(p), it = held(p), g = it && GUNS[it.typeId];
  let hp = 20; try { hp = Math.ceil(p.getComponent("minecraft:health").currentValue); } catch { }
  let clock = ""; try { const t = (world.getTimeOfDay() + 6000) % 24000; clock = `§7${String(Math.floor(t / 1000)).padStart(2, "0")}:${String(Math.floor(t % 1000 * 0.06)).padStart(2, "0")}`; } catch { }
  const lines = [];
  const bn = banners.get(p.id);
  if (bn && bn.until > system.currentTick) lines.push(bn.t, bn.sub);
  lines.push(`§a§l${money(cash(p))}`);
  lines.push(`${I.star.repeat(w)}${I.off.repeat(5 - w)}` + (w && prop(p, "searching", false) && system.currentTick % 20 < 10 ? " §7(searching)" : ""));
  lines.push(`${I.heart}§c${hp}  ${clock}`);
  if (g) { const r = reloading.get(p.id); lines.push(`${I.ammo}§f ` + (r ? "§eRELOADING" : `${magOf(p, it.typeId)[it.typeId]} §7/ ${ammo(p)}`)); }
  const car = ridingCar(p);
  if (car) {
    let v = { x: 0, z: 0 }; try { v = car.getVelocity(); } catch { }
    let hpc = ""; try { const hh = car.getComponent("minecraft:health"); hpc = `  ${I.heart}§c${Math.round(hh.currentValue / hh.effectiveMax * 100)}%`; } catch { }
    lines.push(`§b§l${Math.round(Math.hypot(v.x, v.z) * 72)} §r§bkm/h${hpc}`);
  }
  const hf = hitFlash.get(p.id);
  if (hf && hf.until > system.currentTick) lines.push(hf.head ? `§c${I.skull} HEADSHOT` : `§f${I.hit}`);
  const a = arrestState.get(p.id);
  if (a) lines.push(`§9§lPOLICE: STOP! §r§f${"█".repeat(Math.floor(a / 6))}`);
  if (o) lines.push(`§d${o.label}` + (o.pos ? `\n§f${Math.round(flat(p.location, o.pos))}m ${arrow(p, o.pos)}` : ""));
  const rh = robHud(p);
  if (rh) lines.push(rh.trim());
  return lines.join("\n");
}
function drawHud(p) {
  if (prop(p, "set_hud", "full") === "off") { try { p.onScreenDisplay.setActionBar(" "); } catch { } return; }
  const o = objective(p);
  try {
    p.onScreenDisplay.setActionBar(radarRows(p));
    p.onScreenDisplay.setTitle(overlayRows(p, o), { subtitle: statusText(p), fadeInDuration: 0, stayDuration: 40, fadeOutDuration: 0 });
  } catch { }
}

// ---------------------------------------------------------------- cars: parked cars, physics, crashes
const parkedIdx = new Map();
for (const c of D.parked) { const k = `${Math.floor(c[0] / 128)},${Math.floor(c[2] / 128)}`; (parkedIdx.get(k) ?? parkedIdx.set(k, []).get(k)).push(c); }
const usedSpots = new Set();
function parkedTick(p) {
  if (system.currentTick % 40 !== 0) return;
  const dim = p.dimension, loc = p.location;
  if (count(dim, loc, 80, { tags: ["parked"] }) >= 10) return;
  const bx = Math.floor(loc.x / 128), bz = Math.floor(loc.z / 128);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const c of parkedIdx.get(`${bx + i},${bz + j}`) ?? []) {
    const key = c.join(","), d = flat(loc, V(c));
    if (usedSpots.has(key) || d < 24 || d > 70 || Math.random() > 0.25) continue;
    const pos = { x: c[0] + (c[3] === 1 ? 2 : 1), y: c[1], z: c[2] + (c[3] === 1 ? 1 : 2) };
    const car = spawn(dim, "palmera:car", pos, undefined, ["parked"], "palmera:c" + Math.floor(Math.random() * 10));
    if (car) { usedSpots.add(key); car.addTag("spot:" + key); try { car.setRotation({ x: 0, y: c[3] === 1 ? 90 : 0 }); } catch { } }
    if (count(dim, loc, 80, { tags: ["parked"] }) >= 10) return;
  }
}
const carState = new Map();
const CARSPEC = { "palmera:car": { top: 0.95, acc: 0.022, grip: 0.55 }, "palmera:sports_car": { top: 1.45, acc: 0.034, grip: 0.42 },
                  "palmera:bike": { top: 1.2, acc: 0.04, grip: 0.65 } };
function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function carPhysics() {
  for (const p of world.getAllPlayers()) {
    const car = ridingCar(p);
    if (!car || !CARS.has(car.typeId)) continue;
    if (car.hasTag("parked")) {
      car.removeTag("parked");
      if (count(p.dimension, p.location, 20, { families: ["civilian"] }) || count(p.dimension, p.location, 30, { families: ["palmera_police"] })) {
        title(p, "§cCar alarm!", "§fSomeone saw you take it"); addStars(p, 1);
      }
    }
    const spec = CARSPEC[car.typeId];
    let v; try { v = car.getVelocity(); } catch { continue; }
    const dim = car.dimension, pos = car.location;
    const yawP = p.getRotation().y * Math.PI / 180;
    const face = { x: -Math.sin(yawP), z: Math.cos(yawP) };
    const st = carState.get(car.id) ?? { vx: 0, vz: 0, sp: 0, hd: yawP, x: pos.x, z: pos.z, vy: 0 };
    // what the driver is pressing: the mount's own input pushes it along the rider's facing
    const ix = v.x - st.vx * 0.91, iz = v.z - st.vz * 0.91;
    const thr = ix * face.x + iz * face.z;
    let sp = st.sp;
    if (thr > 0.008) sp = Math.min(spec.top, sp + spec.acc * (1 - sp / spec.top * 0.6));
    else if (thr < -0.008) sp = Math.max(-0.3, sp - 0.06);
    else sp *= 0.985;
    if (Math.abs(sp) < 0.01) sp = 0;
    // steering: limited turn rate that shrinks with speed
    const rate = 0.075 / (1 + Math.abs(sp) * 1.4) * Math.min(1, Math.abs(sp) / 0.15 + 0.1);
    const hd = st.hd + Math.max(-rate, Math.min(rate, angDiff(yawP, st.hd)));
    // grip: velocity follows heading; low grip at speed = drift
    const grip = Math.abs(sp) > 0.8 ? spec.grip * 0.6 : spec.grip;
    const tx = -Math.sin(hd) * sp, tz = Math.cos(hd) * sp;
    let nvx = st.vx + (tx - st.vx) * grip, nvz = st.vz + (tz - st.vz) * grip;
    // crash: commanded fast but barely moved
    const moved = Math.hypot(pos.x - st.x, pos.z - st.z);
    if (Math.abs(st.sp) > 0.45 && moved < Math.abs(st.sp) * 0.3) {
      sound(dim, "palmera.explosion", pos, 2.2, 0.5);
      for (let i = 0; i < 6; i++) particle(dim, "minecraft:basic_smoke_particle", add(pos, { x: rnd(-1, 1), y: 1, z: rnd(-1, 1) }));
      try { car.applyDamage(Math.round(Math.abs(st.sp) * 25), { cause: EntityDamageCause.entityAttack }); } catch { }
      if (Math.abs(st.sp) > 0.9) try { p.applyDamage(Math.round(Math.abs(st.sp) * 6), { cause: EntityDamageCause.entityAttack }); } catch { }
      cmd(p, `camerashake add @s ${Math.min(1, Math.abs(st.sp) * 0.6).toFixed(2)} 0.3 positional`);
      sp = -st.sp * 0.25; nvx = -st.vx * 0.25; nvz = -st.vz * 0.25;
    }
    try { car.clearVelocity(); car.applyImpulse({ x: nvx, y: v.y, z: nvz }); } catch { }
    // tire smoke when sliding
    const slip = Math.abs(angDiff(Math.atan2(-nvx, nvz), hd));
    if (Math.abs(sp) > 0.5 && slip > 0.18) {
      for (let i = 0; i < 2; i++) particle(dim, "minecraft:basic_smoke_particle", add(pos, { x: Math.sin(hd) * 2 + rnd(-0.8, 0.8), y: 0.2, z: -Math.cos(hd) * 2 + rnd(-0.8, 0.8) }));
      if (system.currentTick % 8 === 0) sound(dim, "random.fizz", pos, 1.6, 0.3);
    }
    if (st.vy < -0.7 && v.y > -0.1) { sound(dim, "random.anvil_land", pos, 0.8, 0.5); cmd(p, "camerashake add @s 0.4 0.2 positional"); }
    carState.set(car.id, { vx: nvx, vz: nvz, sp, hd, x: pos.x, z: pos.z, vy: v.y });
    if (system.currentTick % 40 === 0) sound(dim, "palmera.engine", pos, 0.7 + Math.abs(sp) * 0.9, 0.6);
    const real = Math.hypot(nvx, nvz);
    if (real > 0.35) {
      try {
        for (const e of dim.getEntities({ location: pos, maxDistance: 2.4, excludeFamilies: ["palmera_vehicle", "inanimate"] })) {
          if (e.id === p.id || e.typeId === "minecraft:item") continue;
          e.applyDamage(Math.round(real * 22), { cause: EntityDamageCause.entityAttack, damagingEntity: p });
          try { e.applyKnockback(nvx / real, nvz / real, real * 3, 0.5); } catch { }
          sound(dim, "random.hurt", e.location, 0.8);
        }
      } catch { }
    }
    try {
      const h = car.getComponent("minecraft:health");
      if (h && h.currentValue < h.effectiveMax * 0.35 && system.currentTick % 4 === 0) particle(dim, "minecraft:basic_smoke_particle", add(pos, { x: 0, y: 1.2, z: 0 }));
      if (h && h.currentValue < h.effectiveMax * 0.15 && system.currentTick % 4 === 0) particle(dim, "minecraft:basic_flame_particle", add(pos, { x: 0, y: 1.1, z: 0 }));
    } catch { }
  }
}
system.runInterval(carPhysics, 1);
function steerTick() {
  for (const p of world.getAllPlayers()) {
    let v;
    try { v = p.getComponent("minecraft:riding")?.entityRidingOn; } catch { }
    if (!v || !FLYERS.has(v.typeId)) continue;
    const d = p.getViewDirection(), pitch = p.getRotation().x;          // negative = looking up
    const hl = Math.hypot(d.x, d.z) || 1;
    let vel;
    if (v.typeId === "palmera:heli") {
      if (v.location.y > 110) trophy(p, "fly", "Sky High", "Fly a helicopter");
      const climb = pitch < -25 ? 0.45 : pitch > 35 ? -0.45 : 0;
      const sp = pitch > 60 ? 0.1 : 0.95;
      vel = { x: d.x / hl * sp, y: climb, z: d.z / hl * sp };
      if (system.currentTick % 40 === 0) sound(v.dimension, "palmera.rotor", v.location, 1, 1);
    } else {
      let cur = { y: 0 }; try { cur = v.getVelocity(); } catch { }
      vel = { x: d.x / hl * 0.85, y: cur.y, z: d.z / hl * 0.85 };
      if (system.currentTick % 4 === 0) particle(v.dimension, "minecraft:water_splash_particle", add(v.location, { x: -d.x * 2, y: 0.3, z: -d.z * 2 }));
    }
    try { v.clearVelocity(); v.applyImpulse(vel); v.setRotation({ x: 0, y: p.getRotation().y }); } catch { }
  }
}
system.runInterval(steerTick, 1);

// ---------------------------------------------------------------- smarter police: deploy from cars, arrests
const arrestState = new Map();
function arrestTick(p) {
  const w = wanted(p);
  if (w < 1 || w > 2 || isGun(held(p)) || ridingCar(p)) { arrestState.delete(p.id); return; }
  let close = 0;
  try { close = p.dimension.getEntities({ location: p.location, maxDistance: 2.6, type: "palmera:cop" }).length; } catch { }
  if (!close) { arrestState.delete(p.id); return; }
  const t = (arrestState.get(p.id) ?? 0) + 10;
  arrestState.set(p.id, t);
  if (t >= 60) {
    arrestState.delete(p.id);
    const fine = Math.max(300, Math.floor(cash(p) * 0.15));
    addCash(p, -fine); setWanted(p, 0);
    if (active.has(p.id)) finishMission(p, false);
    const [st] = nearest(D.police, p.location);
    fade(p);
    if (st) system.runTimeout(() => { try { p.teleport(V(st)); } catch { } }, 10);
    title(p, "§9§lARRESTED", "§7Fine: " + money(fine) + " - released from the station");
    if (!world.getAllPlayers().some(x => wanted(x) > 0)) clearPolice();
  }
}
system.runInterval(() => {
  try {
    for (const c of OW().getEntities({ type: "palmera:police_car" })) {
      if (c.hasTag("deployed")) continue;
      const t = world.getAllPlayers().find(p => wanted(p) > 0 && flat(p.location, c.location) < 12);
      if (!t) continue;
      c.addTag("deployed");
      for (let i = 0; i < 2; i++) spawn(c.dimension, wanted(t) >= 3 ? "palmera:swat" : "palmera:cop", add(c.location, { x: rnd(-2, 2), y: 0.5, z: rnd(-2, 2) }), wanted(t) >= 3 ? "§8§lSWAT" : "§9Police", ["cop"]);
      sound(c.dimension, "random.door_close", c.location);
    }
  } catch { }
}, 20);

// ---------------------------------------------------------------- shop clerks
const clerks = new Map();
function clerkTick(p) {
  const [s] = nearest(D.rob, p.location);
  if (!s || flat(V(s), p.location) > 40) return;
  const key = s.slice(0, 3).join(",");
  const c = clerks.get(key);
  if (c && valid(c)) return;
  const pos = { x: s[0] + 0.5, y: s[1], z: s[2] + 2.5 };
  const e = spawn(p.dimension, "palmera:civilian", pos, "§eClerk", ["clerk"], "palmera:stay");
  if (e) clerks.set(key, e);
}
system.runInterval(() => {
  for (const p of world.getAllPlayers()) { try { clerkTick(p); } catch { } }
  for (const [k, e] of clerks) if (!valid(e)) clerks.delete(k);
}, 60);

// ---------------------------------------------------------------- hidden Palm Tokens + random street events
const TOKENS = [];
{ let seed = 1234567; const rr = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pool = D.parked.length ? D.parked : D.rob;
  for (let i = 0; i < 50 && pool.length; i++) { const c = pool[Math.floor(rr() * pool.length)]; TOKENS.push([c[0] + 1, c[1] + 1, c[2] - 3]); } }
function tokenTick(p) {
  const got = JSON.parse(prop(p, "tokens", "[]"));
  TOKENS.forEach((t, i) => {
    if (got.includes(i)) return;
    const pos = V(t), d = dist(p.location, pos);
    if (d < 32) particle(p.dimension, "minecraft:totem_particle", pos);
    if (d < 2.2) {
      got.push(i); setProp(p, "tokens", JSON.stringify(got));
      addCash(p, 500); sound(p.dimension, "random.levelup", p.location, 1.8);
      title(p, "§6§lPALM TOKEN", `§f${got.length}/${TOKENS.length} found  §a+$500`);
      if (got.length >= 10) trophy(p, "token", "Token Hunter", "Find 10 Palm Tokens");
      dailyTick(p, "token");
      if (got.length === TOKENS.length) { addCash(p, 25000); msg(p, "§6You found every Palm Token! +$25,000"); }
    }
  });
}
const events = new Map();
function streetEvent(p) {
  if (active.has(p.id) || wanted(p) || events.has(p.id) || Math.random() > 0.15) return;
  const s = spotNear(p, 25, 45, t => WALKABLE.has(t));
  if (!s) return;
  const dim = p.dimension;
  const victim = spawn(dim, "palmera:civilian", s, "§fHELP! I'm being robbed!", ["event"], "palmera:stay");
  const mugger = spawn(dim, "palmera:gangster", add(s, { x: 1.5, y: 0, z: 0 }), "§cMugger", ["event", "mission"]);
  if (!mugger) return;
  p.addTag("gang_heat"); gangHeat.set(p.id, system.currentTick + 1200);
  events.set(p.id, { mugger, victim, until: system.currentTick + 1800 });
  msg(p, "§e» A mugging is happening nearby! Stop the mugger for a reward.");
}
function eventTick(p) {
  const e = events.get(p.id);
  if (!e) return;
  if (!valid(e.mugger)) {
    events.delete(p.id);
    addCash(p, 750); title(p, "§a§lGOOD SAMARITAN", "§a+$750");
    try { if (valid(e.victim)) { e.victim.nameTag = "§aThank you!!"; e.victim.triggerEvent("palmera:wander"); } } catch { }
  } else if (system.currentTick > e.until) {
    events.delete(p.id);
    for (const x of [e.mugger, e.victim]) { try { if (valid(x)) x.remove(); } catch { } }
  }
}
system.runInterval(() => { for (const p of world.getAllPlayers()) { try { tokenTick(p); eventTick(p); } catch { } } }, 10);
system.runInterval(() => { for (const p of world.getAllPlayers()) { try { streetEvent(p); } catch { } } }, 1200);

// ---------------------------------------------------------------- tropical storms + police searchlight
let storm = 0;
system.runInterval(() => {
  if (storm === 0 && Math.random() < 0.08) {
    storm = 1; cmd(OW(), "weather thunder 6000");
    for (const p of world.getAllPlayers()) { msg(p, "§b[Palmera Weather]§f Tropical storm warning! Heavy rain and strong winds incoming."); }
    system.runTimeout(() => { storm = 0; cmd(OW(), "weather clear"); }, 6000);
  }
}, 6000);
system.runInterval(() => {
  if (storm) for (const p of world.getAllPlayers()) { if (!ridingCar(p)) try { p.applyKnockback(1, 0.3, 0.12, 0); } catch { } }
  let night = false; try { const t = world.getTimeOfDay(); night = t > 13000 && t < 23000; } catch { }
  if (!night) return;
  try {
    for (const h of OW().getEntities({ type: "palmera:police_heli" })) {
      const t = world.getAllPlayers().find(p => wanted(p) > 0 && flat(p.location, h.location) < 60);
      if (!t) continue;
      const a = h.location, b = t.location;
      for (let k = 0; k <= 12; k++) particle(h.dimension, "minecraft:endrod", { x: a.x + (b.x - a.x) * k / 12, y: a.y + (b.y - a.y) * k / 12, z: a.z + (b.z - a.z) * k / 12 });
    }
  } catch { }
}, 10);

// ---------------------------------------------------------------- faster on foot
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    if (!prop(p, "set_run", true) || ridingCar(p)) continue;
    try { p.addEffect("speed", 60, { amplifier: 1, showParticles: false }); } catch { }
  }
}, 40);

// ---------------------------------------------------------------- hospitals heal you
system.runInterval(() => {
  for (const p of world.getAllPlayers()) {
    try {
      const [h, d] = nearest(D.hospitals, p.location);
      if (!h || d > 3) continue;
      const hc = p.getComponent("minecraft:health");
      if (hc.currentValue >= hc.effectiveMax) continue;
      if (cash(p) < 200) { title(p, "§cTreatment costs $200.", ""); continue; }
      addCash(p, -200); hc.resetToMaxValue();
      try { p.addEffect("regeneration", 100, { amplifier: 1, showParticles: false }); } catch { }
      title(p, "§a§lPATCHED UP", "§7Hospital treatment: $200");
    } catch { }
  }
}, 40);

// ---------------------------------------------------------------- pedestrian chatter
const LINES = {
  calm: ["Nice day, huh?", "Have you tried the tacos at Taco Sol?", "Traffic on the causeway is insane.", "I'm late for work!",
         "Is that a real gun?", "Love your outfit!", "My cousin got a job at the spaceport.", "Watch out for gators by the swamp."],
  car: ["Hey! Watch where you're driving!", "Learn to drive!", "Nice ride!", "Slow down, maniac!"],
  gun: ["He's got a gun!", "Somebody call the cops!", "Don't shoot!", "Run!"],
};
const talked = new Map();
function chatter(p) {
  try {
    const it = held(p), car = ridingCar(p);
    for (const c of p.dimension.getEntities({ location: p.location, maxDistance: car ? 10 : 4, families: ["civilian"] })) {
      if ((talked.get(c.id) ?? 0) > system.currentTick) continue;
      talked.set(c.id, system.currentTick + 600);
      const set = isGun(it) ? LINES.gun : car ? LINES.car : LINES.calm;
      if (Math.random() < 0.5) {
        const name = c.nameTag;
        c.nameTag = "§f" + pick(set);
        system.runTimeout(() => { try { c.nameTag = name; } catch { } }, 70);
        if (isGun(it)) { try { c.triggerEvent("palmera:scare"); } catch { } }
      }
      break;
    }
  } catch { }
}
system.runInterval(() => { for (const p of world.getAllPlayers()) chatter(p); }, 20);

// ---------------------------------------------------------------- main loops
system.runInterval(() => {                       // every 10 ticks: HUD, cash pickup, robberies, carjacking, missions
  for (const p of world.getAllPlayers()) {
    try {
      const c = inv(p);
      for (let i = 0; i < c.size; i++) {
        const it = c.getItem(i);
        if (it && it.typeId === "palmera:cash") { addCash(p, it.amount * 50); c.setItem(i, undefined); sound(p.dimension, "random.orb", p.location, 1.4); }
      }
      robberyTick(p);
      carjackTick(p);
      missionTick(p);
      drawHud(p);
      arrestTick(p);
      parkedTick(p);
    } catch { }
  }
  heliTick();
}, 10);

system.runInterval(() => {                       // every second: wanted decay, tags, sirens
  const ps = world.getAllPlayers();
  for (const p of ps) {
    const w = wanted(p);
    try { if (w > 0) p.addTag("wanted"); else p.removeTag("wanted"); } catch { }
    if ((gangHeat.get(p.id) ?? 0) < system.currentTick && !active.has(p.id)) { try { p.removeTag("gang_heat"); } catch { } }
    if (!w) continue;
    const seen = count(p.dimension, p.location, 16, { families: ["palmera_police"] });
    setProp(p, "searching", !seen);
    if (seen) { setProp(p, "wcd", Math.max(prop(p, "wcd", 600), 300)); continue; }
    let indoors = false;
    try { const b = p.dimension.getBlockFromRay(p.getHeadLocation(), { x: 0, y: 1, z: 0 }, { maxDistance: 12 }); indoors = !!b; } catch { }
    const cd = prop(p, "wcd", 600) - (indoors ? 40 : 20);
    if (cd <= 0) {
      setWanted(p, w - 1); setProp(p, "wcd", 600);
      if (w - 1 === 0 && prop(p, "hadfour", false)) { setProp(p, "hadfour", false); trophy(p, "lost5", "Ghost", "Lose a 4+ star wanted level"); }
      if (w - 1 === 0) { msg(p, "§aYou lost the cops."); if (!ps.some(x => wanted(x) > 0)) clearPolice(); }
    } else setProp(p, "wcd", cd);
  }
  if (system.currentTick % 40 === 0) {
    try { for (const c of OW().getEntities({ type: "palmera:police_car" })) if (system.currentTick % 80 === 0) sound(c.dimension, "palmera.siren", c.location, 1, 3); } catch { }
  }
}, 20);

system.runInterval(() => { for (const p of world.getAllPlayers()) { try { policeResponse(p); } catch { } } }, 100);
system.runInterval(() => { for (const p of world.getAllPlayers()) { try { ambient(p); } catch { } } despawnFar(); }, 40);
system.runInterval(() => {                       // every in-game day: property income
  for (const p of world.getAllPlayers()) {
    const owned = JSON.parse(prop(p, "homes", "[]"));
    const inc = owned.reduce((s, i) => s + (D.safehouses[i]?.income ?? 0), 0) + JSON.parse(prop(p, "biz", "[]")).length * 1500
      + JSON.parse(prop(p, "turf", "[]")).length * 1000;
    if (bank(p) >= 1000000) trophy(p, "rich", "Millionaire", "Have $1,000,000 in the bank");
    if (inc) { setProp(p, "bank", bank(p) + inc); msg(p, `§2Your properties earned ${money(inc)} today (paid to your bank).`); }
  }
}, 24000);
