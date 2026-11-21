// Palmera Life v2 - Bedrock Script API (stable @minecraft/server 1.11 + server-ui 1.2). Original content.
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const D = __DATA__;
const GUNS = D.guns;
const WALKABLE = new Set(["minecraft:smooth_stone", "minecraft:sand", "minecraft:stone_bricks", "minecraft:grass_block", "minecraft:smooth_quartz", "minecraft:light_gray_concrete"]);
const ROAD = new Set(["minecraft:gray_concrete", "minecraft:yellow_concrete", "minecraft:white_concrete", "minecraft:black_concrete"]);
const SKIP = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:snowball", "palmera:bullet"]);
const POLICE = new Set(["palmera:cop", "palmera:swat", "palmera:police_car", "palmera:police_heli"]);
const CARS = new Set(["palmera:car", "palmera:sports_car"]);
const G = c => String.fromCharCode(0xE100 + c);
const I = { cash: G(0x20), star: G(0x21), off: G(0x22), ammo: G(0x23), heart: G(0x24), speed: G(0x25), phone: G(0x26), hit: G(0x27), skull: G(0x28) };
const TILE = [G(0), G(1), G(2), G(3), G(4), G(5)], ARROW = [0, 1, 2, 3, 4, 5, 6, 7].map(k => G(8 + k));
const COPDOT = G(0x10), TARGET = G(0x11), GANGDOT = G(0x13), VOID = G(0x14);

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
function title(p, t, sub) { try { p.onScreenDisplay.setTitle(t, { subtitle: sub, fadeInDuration: 5, stayDuration: 60, fadeOutDuration: 15 }); } catch { } }
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

// ---------------------------------------------------------------- world setup / join
let booted = false;
function boot() {
  if (booted) return; booted = true;
  objectiveOf("pl_cash"); objectiveOf("pl_ammo");
  for (const c of ["gamerule keepinventory true", "gamerule domobspawning false", "gamerule mobgriefing false",
    "gamerule sendcommandfeedback false", "gamerule showcoordinates true"]) cmd(OW(), c);
}
system.run(boot);

world.afterEvents.playerSpawn.subscribe(ev => {
  const p = ev.player;
  system.runTimeout(() => {
    if (!valid(p)) return;
    if (!prop(p, "joined", false)) {
      setProp(p, "joined", true);
      setScore("pl_cash", p, 2500); setScore("pl_ammo", p, 60); setWanted(p, 0);
      give(p, "palmera:phone"); give(p, "palmera:pistol");
      title(p, "§d§lPALMERA", "§bWelcome to the sunshine state");
      msg(p, "§dWelcome to Palmera!§f You have §a$2,500§f, a pistol and a §dPhone§f. Use the Phone to start the §dStory§f, take jobs, buy guns and cars.");
      msg(p, "§7Tips: crouch at a shop counter with a gun out to rob it. Crouch next to a car on the street to steal it. Hurting people brings the cops.");
    } else if (prop(p, "died", false)) {
      setProp(p, "died", false);
      const bill = Math.max(200, Math.floor(cash(p) * 0.1));
      addCash(p, -bill);
      title(p, "§4§lHOSPITALIZED", "§7Hospital bill: " + money(bill));
    }
    setWanted(p, wanted(p));
  }, 20);
});

// ---------------------------------------------------------------- weapons
const lastShot = new Map(), mags = new Map(), reloading = new Map(), trigger = new Map();
function magOf(p, id) { const m = mags.get(p.id) ?? {}; mags.set(p.id, m); if (m[id] === undefined) m[id] = GUNS[id].mag; return m; }
function startReload(p, id) {
  const g = GUNS[id];
  if (reloading.has(p.id) || ammo(p) <= 0) return;
  reloading.set(p.id, { id, until: system.currentTick + g.reload });
  sound(p.dimension, "random.click", p.location, 0.8);
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
    try { p.onScreenDisplay.setTitle(head ? "§c" + I.skull : "§f" + I.hit, { fadeInDuration: 0, stayDuration: 3, fadeOutDuration: 2, subtitle: head ? "§cHEADSHOT" : "" }); } catch { }
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
    else { p.onScreenDisplay.setActionBar("§cOut of ammo! Buy more at Sunshine Arms (Phone)."); sound(p.dimension, "random.click", p.location, 1.8); }
    return;
  }
  lastShot.set(p.id, now);
  m[id] -= 1;
  const dim = p.dimension, head = p.getHeadLocation(), d0 = p.getViewDirection();
  sound(dim, g.sound, head, g.pitch, 2);
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
world.afterEvents.itemUse.subscribe(ev => {
  const p = ev.source, id = ev.itemStack?.typeId;
  if (!p || !id) return;
  if (id === "palmera:phone") { system.run(() => phone(p)); return; }
  if (id === "palmera:grenade") { throwGrenade(p); return; }
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
      p.onScreenDisplay.setActionBar("§cShots fired! Someone called the cops.");
    }
  } catch { }
}
function addStars(p, n = 1) {
  setWanted(p, wanted(p) + n); setProp(p, "wcd", 700);
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
  if (type === "palmera:gangster") dim.spawnItem(new ItemStack("palmera:cash", tags.includes("boss") ? 12 : 2), loc);
  if (type === "palmera:civilian" && Math.random() < 0.5) dim.spawnItem(new ItemStack("palmera:cash", 1), loc);
  if (POLICE.has(type) && Math.random() < 0.5) dim.spawnItem(new ItemStack("palmera:cash", 1), loc);
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
  for (let i = 0; i < 2 && cops + i < wantCops; i++) {
    const s = spotNear(p, 26, 42, t => WALKABLE.has(t) || ROAD.has(t));
    if (!s) continue;
    if (w >= 3 && Math.random() < 0.5) spawn(dim, "palmera:swat", s, "§8§lSWAT", ["cop"]);
    else spawn(dim, "palmera:cop", s, "§9Police", ["cop"]);
  }
  if (cars < wantCars) { const s = spotNear(p, 32, 55, t => ROAD.has(t)); if (s) spawn(dim, "palmera:police_car", s, "§9Police", ["cop"]); }
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
    if (system.currentTick % 40 === 0) sound(h.dimension, "mob.blaze.breathe", h.location, 0.5, 2);
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
  if ((cooldown.get(key) ?? -1e9) > system.currentTick) { p.onScreenDisplay.setActionBar("§7This place was hit recently. Come back later."); return; }
  const st = robbing.get(p.id) ?? { key, t: 0 };
  if (st.key !== key) { st.key = key; st.t = 0; }
  st.t += 10; robbing.set(p.id, st);
  const need = isBank ? 600 : 160;
  if (isBank && st.t % 40 === 0) sound(p.dimension, "random.anvil_use", p.location, 1.3, 0.6);
  if (isBank && st.t % 200 === 10) { setWanted(p, Math.max(wanted(p), 3)); for (let i = 0; i < 2; i++) { const s = spotNear(p, 8, 16); if (s) spawn(p.dimension, "palmera:swat", s, "§8§lSWAT", ["cop"]); } }
  if (!isBank && st.t === 10) { msg(p, "§e[Clerk]§f " + pick(["Please don't shoot!", "Take it, take it!", "The register is empty, I swear!", "Not again..."])); }
  if (st.t >= need) {
    robbing.delete(p.id);
    cooldown.set(key, system.currentTick + (isBank ? 24000 : 6000));
    const loot = isBank ? Math.floor(rnd(25000, 45000)) : Math.floor(rnd(target[3] === "gas" ? 300 : 400, target[3] === "gas" ? 900 : 1500));
    addCash(p, loot);
    setWanted(p, Math.max(wanted(p) + 2, isBank ? 4 : 2)); setProp(p, "wcd", 800);
    setProp(p, "crimes", prop(p, "crimes", 0) + 1);
    title(p, isBank ? "§6§lVAULT CRACKED" : "§e§lROBBERY", "§a+" + money(loot));
    sound(p.dimension, "random.levelup", p.location);
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
function carjackTick(p) {
  if (!p.isSneaking || ridingCar(p)) return;
  try {
    const t = p.dimension.getEntities({ location: p.location, maxDistance: 3, type: "palmera:traffic_car" })[0];
    if (t) jack(p, t);
  } catch { }
}

// ---------------------------------------------------------------- ambient life
function ambient(p) {
  const dim = p.dimension, loc = p.location;
  const civ = count(dim, loc, 48, { type: "palmera:civilian" });
  for (let i = 0; i < 2 && civ + i < 16; i++) {
    const s = spotNear(p, 14, 36, t => WALKABLE.has(t));
    if (s && s.y > 62 && s.y < 70) spawn(dim, "palmera:civilian", s, pick(D.peds));
  }
  const cars = count(dim, loc, 72, { type: "palmera:traffic_car" });
  if (cars < 8) { const s = spotNear(p, 30, 60, t => ROAD.has(t)); if (s) spawn(dim, "palmera:traffic_car", s); }
  for (const g of D.gangs) {
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
    for (const e of OW().getEntities({ families: ["civilian"] })) if (far(e, 100)) e.remove();
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
    if (a.kind === "story") setProp(p, "story", a.idx + 1);
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
    case "drive": if (ridingCar(p) && flat(loc, V(s.pos)) < s.r) nextStep(p); break;
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
function raceMission(p, r) {
  startMission(p, { kind: "race", title: r.title, sub: `§7Street race, par ${r.par}s`, steps: [
    { t: "goto", pos: r.cps[0], r: 10, label: "Go to the start line" },
    { t: "talk", lines: ["§e3...", "§e2...", "§e1...", "§a§lGO!"] },
    { t: "race", cps: r.cps.slice(1), par: r.par, reward: r.reward }] });
}

// ---------------------------------------------------------------- phone
async function phone(p) {
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
    .button(`§9Call Lawyer\n§8Clear wanted level`, "textures/ui/palmera_app_lawyer")
    .button("§5Feed\n§8What's happening", "textures/ui/palmera_app_feed")
    .button(active.has(p.id) ? "§8Cancel current mission" : "§7Stats", "textures/ui/palmera_app_stats");
  const r = await f.show(p);
  if (r.canceled) return;
  [() => storyMission(p), () => jobsForm(p), () => shopForm(p, "arms", "§6Sunshine Arms"), () => shopForm(p, "cars", "§bCoastline Motors"),
  () => estateForm(p), () => bankForm(p), () => gpsForm(p), () => lawyer(p), () => feed(p),
  () => active.has(p.id) ? finishMission(p, false) : stats(p)][r.selection]?.();
}
async function jobsForm(p) {
  const f = new ActionFormData().title("§cJobs & Races").body("§7Pick something:");
  for (const j of D.jobs) f.button(`§f${j.title} §6${money(j.reward)}\n§8${j.where}`);
  for (const r of D.races) f.button(`§bRace: ${r.title} §6${money(r.reward)}\n§8Par ${r.par}s`);
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection < D.jobs.length) jobMission(p, D.jobs[r.selection]); else raceMission(p, D.races[r.selection - D.jobs.length]);
}
async function shopForm(p, cat, name) {
  const list = D.shop.filter(s => s.cat === cat);
  const f = new ActionFormData().title(name).body(`§aYou have ${money(cash(p))}`);
  for (const s of list) f.button(`${s.label}\n§2${money(s.price)}`, s.icon);
  const r = await f.show(p);
  if (r.canceled) return;
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
  else if (k === "armor") { give(p, "minecraft:iron_chestplate", 1, "§7Body Armor"); give(p, "minecraft:iron_helmet", 1, "§7Helmet"); }
  else if (k === "medkit") give(p, "minecraft:golden_apple", 3, "§aMedkit");
  else if (k === "car_sedan") spawnCar(p, "palmera:car");
  else if (k === "car_sports") spawnCar(p, "palmera:sports_car");
  sound(p.dimension, "random.orb", p.location);
  msg(p, `§aBought ${s.label} for ${money(s.price)}.`);
}
function spawnCar(p, type) {
  const old = prop(p, "car", "");
  if (old) { try { world.getEntity(old)?.remove(); } catch { } }
  const d = p.getViewDirection();
  const car = spawn(p.dimension, type, add(p.location, { x: d.x * 4, y: 0.5, z: d.z * 4 }), undefined, [], "palmera:c" + Math.floor(Math.random() * 10));
  if (car) { setProp(p, "car", car.id); msg(p, "§bYour car is parked in front of you. Interact with it to drive."); }
}
async function estateForm(p) {
  const owned = JSON.parse(prop(p, "homes", "[]"));
  const f = new ActionFormData().title("§2Real Estate").body("§7Safehouses become your respawn point and pay daily income into your bank.");
  D.safehouses.forEach((h, i) => f.button(`${owned.includes(i) ? "§a[OWNED] " : ""}§f${h.kind === "mansion" ? "Isle Mansion" : "Family Home"} #${i + 1}\n§2${money(h.price)} §8+${money(h.income)}/day`));
  const r = await f.show(p);
  if (r.canceled) return;
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
function lawyer(p) {
  const w = wanted(p);
  if (!w) { msg(p, "§9[Lawyer]§f You're clean, kid. Call me when you're not."); return; }
  const fee = w * 1500;
  if (cash(p) < fee) { msg(p, `§9[Lawyer]§f My fee is ${money(fee)}. Come back with cash.`); return; }
  addCash(p, -fee); setWanted(p, 0);
  msg(p, `§9[Lawyer]§f Paperwork's filed. You were never there. (${money(fee)})`);
  if (!world.getAllPlayers().some(x => wanted(x) > 0)) clearPolice();
}
function feed(p) {
  const posts = [...D.feed].sort(() => Math.random() - 0.5).slice(0, 5);
  new ActionFormData().title("§5Feed").body(posts.join("\n\n")).button("Close").show(p);
}
function stats(p) {
  msg(p, `§aCash ${money(cash(p))} §bBank ${money(bank(p))} §7| Story ${prop(p, "story", 0)}/${D.story.length} | Missions ${prop(p, "missions", 0)} | Crimes ${prop(p, "crimes", 0)} | Homes ${JSON.parse(prop(p, "homes", "[]")).length}`);
}

// ---------------------------------------------------------------- HUD + minimap
const MMR = 3, MMC = 6;
function cellAt(cx, cz) {
  const row = D.mm[cz];
  if (!row || cx < 0 || cx >= row.length) return VOID;
  return TILE[row.charCodeAt(cx) - 48] ?? VOID;
}
function minimap(p, o) {
  const C = D.mmcell, pcx = Math.floor(p.location.x / C), pcz = Math.floor(p.location.z / C);
  const marks = new Map();
  try {
    for (const e of p.dimension.getEntities({ location: p.location, maxDistance: C * 7, families: ["palmera_police"] }))
      marks.set(`${Math.floor(e.location.x / C) - pcx},${Math.floor(e.location.z / C) - pcz}`, COPDOT);
    for (const e of p.dimension.getEntities({ location: p.location, maxDistance: C * 7, tags: ["mission"] }))
      marks.set(`${Math.floor(e.location.x / C) - pcx},${Math.floor(e.location.z / C) - pcz}`, GANGDOT);
  } catch { }
  if (o && o.pos) {
    let dx = Math.floor(o.pos.x / C) - pcx, dz = Math.floor(o.pos.z / C) - pcz;
    const k = Math.max(Math.abs(dx) / MMC, Math.abs(dz) / MMR, 1);
    marks.set(`${Math.round(dx / k)},${Math.round(dz / k)}`, TARGET);
  }
  const yaw = ((p.getRotation().y % 360) + 360) % 360;
  marks.set("0,0", ARROW[Math.round(yaw / 45) % 8]);
  const rows = [];
  for (let dz = -MMR; dz <= MMR; dz++) {
    let line = "";
    for (let dx = -MMC; dx <= MMC; dx++) line += marks.get(`${dx},${dz}`) ?? cellAt(pcx + dx, pcz + dz);
    rows.push(line);
  }
  return rows.join("\n");
}
function hud(p) {
  const w = wanted(p), o = objective(p), it = held(p), g = it && GUNS[it.typeId];
  let line = `${I.cash}§a${money(cash(p))}  ` + `${I.star.repeat(w)}${I.off.repeat(5 - w)}`;
  if (g) {
    const r = reloading.get(p.id);
    line += `  ${I.ammo}§f` + (r ? "§eRELOADING" : `${magOf(p, it.typeId)[it.typeId]}§7/${ammo(p)}`);
  }
  const car = ridingCar(p);
  if (car) {
    let v = { x: 0, z: 0 }; try { v = car.getVelocity(); } catch { }
    line += `  ${I.speed}§b${Math.round(Math.hypot(v.x, v.z) * 72)} km/h`;
    try { const h = car.getComponent("minecraft:health"); line += `  ${I.heart}§c${Math.round(h.currentValue / h.effectiveMax * 100)}%`; } catch { }
  }
  let obj = "";
  if (o) obj = `§d${o.label}` + (o.pos ? ` §f${Math.round(flat(p.location, o.pos))}m ${arrow(p, o.pos)}` : "");
  const a = arrestState.get(p.id);
  if (a) obj = `§9§lPOLICE: STOP! §r§f${"█".repeat(Math.floor(a / 6))}`;
  return minimap(p, o) + "\n" + line + robHud(p) + (obj ? "\n" + obj : "");
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
function carPhysics() {
  for (const p of world.getAllPlayers()) {
    const car = ridingCar(p);
    if (!car || !CARS.has(car.typeId)) continue;
    if (car.hasTag("parked")) {
      car.removeTag("parked");
      if (count(p.dimension, p.location, 20, { families: ["civilian"] }) || count(p.dimension, p.location, 30, { families: ["palmera_police"] })) {
        msg(p, "§cCar alarm! Someone saw you take it."); addStars(p, 1);
      }
    }
    let v; try { v = car.getVelocity(); } catch { continue; }
    const sp = Math.hypot(v.x, v.z), top = car.typeId === "palmera:sports_car" ? 1.25 : 0.85;
    if (sp > 0.08 && sp < top) { try { car.applyImpulse({ x: v.x / sp * 0.045, y: 0, z: v.z / sp * 0.045 }); } catch { } }
    if (system.currentTick % 6 === 0) sound(car.dimension, "minecart.base", car.location, 0.6 + sp * 0.8, 0.5);
    if (sp > 0.35) {
      try {
        for (const e of car.dimension.getEntities({ location: car.location, maxDistance: 2.4, excludeFamilies: ["palmera_vehicle", "inanimate"] })) {
          if (e.id === p.id || e.typeId === "minecraft:item") continue;
          e.applyDamage(Math.round(sp * 22), { cause: EntityDamageCause.entityAttack, damagingEntity: p });
          try { e.applyKnockback(v.x / sp, v.z / sp, sp * 2.5, 0.4); } catch { }
          sound(car.dimension, "random.hurt", e.location, 0.8);
        }
      } catch { }
    }
    try {
      const h = car.getComponent("minecraft:health");
      if (h && h.currentValue < h.effectiveMax * 0.35 && system.currentTick % 4 === 0) particle(car.dimension, "minecraft:basic_smoke_particle", add(car.location, { x: 0, y: 1.2, z: 0 }));
    } catch { }
  }
}
system.runInterval(carPhysics, 2);

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
    if (st) { try { p.teleport(V(st)); } catch { } }
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
      p.onScreenDisplay.setActionBar(hud(p));
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
    if (seen) { setProp(p, "wcd", Math.max(prop(p, "wcd", 600), 300)); continue; }
    const cd = prop(p, "wcd", 600) - 20;
    if (cd <= 0) {
      setWanted(p, w - 1); setProp(p, "wcd", 600);
      if (w - 1 === 0) { msg(p, "§aYou lost the cops."); if (!ps.some(x => wanted(x) > 0)) clearPolice(); }
    } else setProp(p, "wcd", cd);
  }
  if (system.currentTick % 40 === 0) {
    try { for (const c of OW().getEntities({ type: "palmera:police_car" })) sound(c.dimension, "note.bit", c.location, system.currentTick % 80 === 0 ? 1.4 : 1.1, 3); } catch { }
  }
}, 20);

system.runInterval(() => { for (const p of world.getAllPlayers()) { try { policeResponse(p); } catch { } } }, 100);
system.runInterval(() => { for (const p of world.getAllPlayers()) { try { ambient(p); } catch { } } despawnFar(); }, 40);
system.runInterval(() => {                       // every in-game day: property income
  for (const p of world.getAllPlayers()) {
    const owned = JSON.parse(prop(p, "homes", "[]"));
    const inc = owned.reduce((s, i) => s + (D.safehouses[i]?.income ?? 0), 0);
    if (inc) { setProp(p, "bank", bank(p) + inc); msg(p, `§2Your properties earned ${money(inc)} today (paid to your bank).`); }
  }
}, 24000);
