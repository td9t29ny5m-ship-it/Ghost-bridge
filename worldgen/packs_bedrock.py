"""
Palmera Life for Bedrock Edition: behavior pack (Script API, no experiments needed) + resource pack.

Same gameplay as the Java datapack, rebuilt natively for Bedrock:
  guns (hitscan raycasts), grenades, bat, cash + ammo, a phone with real button menus,
  wanted level with police/SWAT/chopper, ambient pedestrians, drivable car entities with
  3D models (sedan + sports car, 10 colours), and six jobs with an on-screen GPS arrow.
Output: Palmera_Life.mcaddon (contains both packs).
"""
import io
import json
import os
import uuid
import zipfile

from PIL import Image

import packs as javapacks

NS = 'palmera'
MIN_ENGINE = [1, 21, 0]
SERVER_VER = '1.11.0'
UI_VER = '1.2.0'


def U(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'palmera-life/' + name))


def J(o):
    return json.dumps(o, indent=1, ensure_ascii=False)


ITEMS = {
    # id: (display name, stack, hand_equipped)
    'pistol': ('Pistol', 1, True), 'smg': ('SMG', 1, True), 'shotgun': ('Pump Shotgun', 1, True),
    'rifle': ('Assault Rifle', 1, True), 'rocket': ('Rocket Launcher', 1, True),
    'phone': ('Phone', 1, False), 'grenade': ('Grenade', 16, False), 'cash': ('Cash', 64, False),
    'bat': ('Baseball Bat', 1, True),
}
CAR_COLORS = [(200, 30, 30), (40, 70, 200), (235, 235, 235), (25, 25, 28), (240, 200, 30),
              (90, 200, 40), (240, 120, 20), (200, 50, 180), (30, 180, 200), (150, 150, 155)]


# --------------------------------------------------------------------------- car models
def face_uv(sw):
    """All six faces map to a 4x4 swatch at (u, v) of the 32x32 car texture."""
    u, v = sw
    return {f: {'uv': [u, v], 'uv_size': [4, 4]} for f in ('north', 'south', 'east', 'west', 'up', 'down')}


SW = {'body': (0, 0), 'glass': (8, 0), 'tire': (16, 0), 'light': (24, 0), 'tail': (0, 8), 'chrome': (8, 8)}


def cube(o, s, sw):
    return {'origin': o, 'size': s, 'uv': face_uv(SW[sw])}


def car_geo(kind):
    if kind == 'car':
        cubes = [cube([-16, 3, -34], [32, 11, 68], 'body'), cube([-14, 14, -12], [28, 11, 32], 'glass'),
                 cube([-14, 25, -12], [28, 1, 32], 'body'), cube([-16, 3, -35], [32, 3, 1], 'chrome'),
                 cube([-16, 3, 34], [32, 3, 1], 'chrome'),
                 cube([-13, 8, -35], [7, 3, 1], 'light'), cube([6, 8, -35], [7, 3, 1], 'light'),
                 cube([-13, 9, 34], [7, 2, 1], 'tail'), cube([6, 9, 34], [7, 2, 1], 'tail')]
    else:
        cubes = [cube([-16, 2, -36], [32, 8, 72], 'body'), cube([-13, 10, -6], [26, 7, 24], 'glass'),
                 cube([-16, 14, 30], [32, 1, 6], 'body'), cube([-12, 10, 32], [2, 4, 2], 'tire'),
                 cube([10, 10, 32], [2, 4, 2], 'tire'), cube([-16, 2, -37], [32, 2, 1], 'chrome'),
                 cube([-14, 6, -37], [8, 2, 1], 'light'), cube([6, 6, -37], [8, 2, 1], 'light'),
                 cube([-14, 6, 36], [8, 2, 1], 'tail'), cube([6, 6, 36], [8, 2, 1], 'tail')]
    for x in (-17, 13):
        for z in (-26, 17):
            cubes.append(cube([x, 0, z], [4, 9, 9], 'tire'))
    return {'format_version': '1.12.0', 'minecraft:geometry': [{
        'description': {'identifier': 'geometry.palmera_' + kind, 'texture_width': 32, 'texture_height': 32,
                        'visible_bounds_width': 6, 'visible_bounds_height': 3, 'visible_bounds_offset': [0, 1, 0]},
        'bones': [{'name': 'body', 'pivot': [0, 0, 0], 'cubes': cubes}]}]}


def car_texture(rgb):
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 255))
    def sw(key, col):
        u, v = SW[key]
        for x in range(u, u + 4):
            for y in range(v, v + 4):
                im.putpixel((x, y), col + (255,))
    sw('body', rgb)
    sw('glass', (30, 40, 55))
    sw('tire', (18, 18, 20))
    sw('light', (255, 250, 210))
    sw('tail', (220, 20, 20))
    sw('chrome', (200, 200, 205))
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


def car_behavior(kind, speed, hp, seat_y):
    groups = {'c%d' % i: {'minecraft:variant': {'value': i}} for i in range(len(CAR_COLORS))}
    return {'format_version': '1.21.0', 'minecraft:entity': {
        'description': {'identifier': 'palmera:' + kind, 'is_spawnable': True, 'is_summonable': True, 'is_experimental': False},
        'component_groups': groups,
        'components': {
            'minecraft:type_family': {'family': ['palmera_car', 'inanimate']},
            'minecraft:collision_box': {'width': 1.9, 'height': 1.3},
            'minecraft:health': {'value': hp, 'max': hp},
            'minecraft:physics': {}, 'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': True},
            'minecraft:movement': {'value': speed}, 'minecraft:movement.basic': {},
            'minecraft:navigation.walk': {}, 'minecraft:jump.static': {},
            'minecraft:variable_max_auto_step': {'base_value': 1.0625, 'jump_prevented_value': 1.0625},
            'minecraft:input_ground_controlled': {},
            'minecraft:rideable': {'seat_count': 2, 'crouching_skip_interact': True, 'family_types': ['player'],
                                   'interact_text': 'action.interact.ride.horse',
                                   'seats': [{'position': [0.35, seat_y, 0.1]}, {'position': [-0.35, seat_y, 0.1]}]},
            'minecraft:knockback_resistance': {'value': 1.0},
            'minecraft:damage_sensor': {'triggers': [{'cause': 'fall', 'deals_damage': False},
                                                     {'cause': 'suffocation', 'deals_damage': False}]},
            'minecraft:nameable': {}, 'minecraft:persistent': {},
            'minecraft:conditional_bandwidth_optimization': {}},
        'events': {'palmera:c%d' % i: {'add': {'component_groups': ['c%d' % i]}} for i in range(len(CAR_COLORS))}}}


def car_client(kind, label):
    tex = {'c%d' % i: 'textures/entity/palmera_car/c%d' % i for i in range(len(CAR_COLORS))}
    return {'format_version': '1.10.0', 'minecraft:client_entity': {'description': {
        'identifier': 'palmera:' + kind, 'materials': {'default': 'entity_alphatest'}, 'textures': tex,
        'geometry': {'default': 'geometry.palmera_' + kind}, 'render_controllers': ['controller.render.palmera_car'],
        'spawn_egg': {'base_color': '#d02020', 'overlay_color': '#202020'}}}}


RENDER_CONTROLLER = {'format_version': '1.8.0', 'render_controllers': {'controller.render.palmera_car': {
    'arrays': {'textures': {'Array.skins': ['Texture.c%d' % i for i in range(len(CAR_COLORS))]}},
    'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}],
    'textures': ['Array.skins[query.variant]']}}}


# --------------------------------------------------------------------------- script
SCRIPT = r'''
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const DATA = __DATA__;
const GUNS = DATA.guns, SHOP = DATA.shop, JOBS = DATA.jobs, PEDS = DATA.peds;
const WALKABLE = new Set(["minecraft:smooth_stone", "minecraft:sand", "minecraft:stone_bricks", "minecraft:grass_block", "minecraft:smooth_quartz"]);
const SKIP = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:arrow", "minecraft:snowball", "minecraft:fireball"]);

// ---------- helpers
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = a => Math.hypot(a.x, a.y, a.z);
const norm = a => mul(a, 1 / (len(a) || 1));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);
const valid = e => { try { if (e.isValid === undefined) return true; return typeof e.isValid === "function" ? e.isValid() : !!e.isValid; } catch { return false; } };
function particle(dim, id, loc) { try { dim.spawnParticle(id, loc); } catch { } }
function sound(dim, id, loc, pitch = 1, vol = 1) {
  try { dim.playSound(id, loc, { pitch, volume: vol }); }
  catch { try { dim.runCommandAsync(`playsound ${id} @a ${loc.x} ${loc.y} ${loc.z} ${vol} ${pitch}`); } catch { } }
}
function cmd(src, c) { try { return src.runCommand(c); } catch { try { return src.runCommandAsync(c); } catch { } } }
function objective(id, name) { return world.scoreboard.getObjective(id) ?? world.scoreboard.addObjective(id, name); }
function score(id, p) { try { return objective(id, id).getScore(p) ?? 0; } catch { return 0; } }
function setScore(id, p, v) { try { objective(id, id).setScore(p, Math.max(0, Math.floor(v))); } catch { } }
function addScore(id, p, v) { setScore(id, p, score(id, p) + v); }
const cash = p => score("pl_cash", p), ammo = p => score("pl_ammo", p);
const wanted = p => p.getDynamicProperty("wanted") ?? 0;
function setWanted(p, w) { p.setDynamicProperty("wanted", Math.max(0, Math.min(5, w))); }
function inv(p) { return p.getComponent("minecraft:inventory").container; }
function give(p, id, n = 1, name) {
  const it = new ItemStack(id, n);
  if (name) it.nameTag = name;
  const left = inv(p).addItem(it);
  if (left) p.dimension.spawnItem(left, p.location);
}
function title(p, t, sub) { try { p.onScreenDisplay.setTitle(t, { subtitle: sub, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 15 }); } catch { } }
function msg(p, s) { try { p.sendMessage(s); } catch { } }

// ---------- setup
let booted = false;
function boot() {
  if (booted) return; booted = true;
  objective("pl_cash", "Cash"); objective("pl_ammo", "Ammo");
  const ow = world.getDimension("overworld");
  for (const c of ["gamerule keepinventory true", "gamerule domobspawning false", "gamerule mobgriefing false", "gamerule sendcommandfeedback false"]) cmd(ow, c);
}
system.run(boot);

world.afterEvents.playerSpawn.subscribe(ev => {
  const p = ev.player;
  system.runTimeout(() => {
    if (!valid(p)) return;
    if (!p.getDynamicProperty("joined")) {
      p.setDynamicProperty("joined", true);
      setScore("pl_cash", p, 2500); setScore("pl_ammo", p, 60); setWanted(p, 0);
      give(p, "palmera:phone"); give(p, "palmera:pistol");
      title(p, "§d§lPALMERA", "§bWelcome to the sunshine state");
      msg(p, "§dWelcome to Palmera! §fYou have §a$2,500§f, a pistol and a phone. §7Use the Phone to buy guns and cars and take jobs. Hurting civilians brings the cops.");
    } else if (p.getDynamicProperty("died")) {
      p.setDynamicProperty("died", false);
      addScore("pl_cash", p, -500);
      title(p, "§4§lYOU DIED", "§7Hospital bill: $500");
    }
  }, 20);
});

// ---------- guns
const lastShot = new Map();
function rayEntity(p, dim, origin, dir, max) {
  let hits = [];
  try { hits = dim.getEntitiesFromRay(origin, dir, { maxDistance: max }); } catch { }
  for (const h of hits) {
    const e = h.entity;
    if (!e || e.id === p.id || SKIP.has(e.typeId)) continue;
    if (e.typeId.startsWith("palmera:")) {
      const r = e.getComponent("minecraft:rideable");
      try { if (r && r.getRiders().some(x => x.id === p.id)) continue; } catch { }
    }
    return h;
  }
}
function shoot(p, dim, origin, dir, g) {
  let bh, bd = g.range;
  try { bh = dim.getBlockFromRay(origin, dir, { maxDistance: g.range, includeLiquidBlocks: false, includePassableBlocks: false }); } catch { }
  if (bh) bd = dist(origin, add(bh.block.location, bh.faceLocation));
  const eh = rayEntity(p, dim, origin, dir, bd);
  const end = eh ? eh.distance : bd;
  for (let d = 1.2; d < end; d += 1.4) particle(dim, g.particle, add(origin, mul(dir, d)));
  const endLoc = add(origin, mul(dir, end));
  if (g.explode) { boom(dim, endLoc, g.explode, p); return; }
  if (eh) {
    try { eh.entity.applyDamage(g.dmg, { cause: EntityDamageCause.entityAttack, damagingEntity: p }); } catch { }
    particle(dim, "minecraft:critical_hit_emitter", endLoc);
  } else if (bh) {
    const b = bh.block;
    if (b.typeId.includes("glass")) { try { b.setType("minecraft:air"); } catch { } sound(dim, "random.glass", endLoc); }
    else particle(dim, "minecraft:basic_smoke_particle", endLoc);
  }
}
function fire(p, g) {
  const now = system.currentTick;
  if ((lastShot.get(p.id) ?? -999) + g.cd > now) return;
  lastShot.set(p.id, now);
  if (ammo(p) < g.ammo) { p.onScreenDisplay.setActionBar("§cOut of ammo! Buy more at Sunshine Arms."); sound(p.dimension, "random.click", p.location, 1.8); return; }
  addScore("pl_ammo", p, -g.ammo);
  const dim = p.dimension, head = p.getHeadLocation(), d0 = p.getViewDirection();
  sound(dim, g.sound, head, g.pitch, 2);
  heat(p);
  for (let i = 0; i < g.pellets; i++) {
    const s = i === 0 ? g.spread * 0.3 : g.spread;
    shoot(p, dim, head, norm(add(d0, { x: rnd(-s, s), y: rnd(-s, s), z: rnd(-s, s) })), g);
  }
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
}

world.afterEvents.itemUse.subscribe(ev => {
  const p = ev.source, id = ev.itemStack?.typeId;
  if (!p || !id) return;
  if (id === "palmera:phone") { system.run(() => phone(p)); return; }
  if (id === "palmera:grenade") { throwGrenade(p); return; }
  const g = GUNS[id];
  if (g) fire(p, g);
});

// ---------- crime & police
function heat(p) {
  if (wanted(p) > 0) return;
  try {
    if (p.dimension.getEntities({ location: p.location, maxDistance: 16, tags: ["ped"] }).length) {
      setWanted(p, 1); p.setDynamicProperty("wcd", 400);
      p.onScreenDisplay.setActionBar("§cShots fired! The police are on the way.");
    }
  } catch { }
}
function addStar(p) {
  setWanted(p, wanted(p) + 1); p.setDynamicProperty("wcd", 700);
  sound(p.dimension, "note.bell", p.location, 0.6);
}
world.afterEvents.entityDie.subscribe(ev => {
  const d = ev.deadEntity, k = ev.damageSource?.damagingEntity;
  let loc, dim;
  try { loc = d.location; dim = d.dimension; } catch { return; }
  if (d.typeId === "minecraft:player") {
    d.setDynamicProperty("died", true); setWanted(d, 0);
    if (job && job.owner === d.id) endJob(false);
    return;
  }
  let tags = [];
  try { tags = d.getTags(); } catch { }
  if (tags.includes("job_enemy")) dim.spawnItem(new ItemStack("palmera:cash", tags.includes("boss") ? 10 : 2), loc);
  if (tags.includes("ped") && Math.random() < 0.5) dim.spawnItem(new ItemStack("palmera:cash", 1), loc);
  if (k && k.typeId === "minecraft:player" && (tags.includes("ped") || tags.includes("cop"))) addStar(k);
});

function ground(dim, x, z) {
  for (let y = 72; y >= 60; y--) {
    let b;
    try { b = dim.getBlock({ x, y, z }); } catch { return; }
    if (!b) return;
    if (b.typeId === "minecraft:air") continue;
    const up = dim.getBlock({ x, y: y + 1, z }), up2 = dim.getBlock({ x, y: y + 2, z });
    if (!up || up.typeId !== "minecraft:air" || !up2 || up2.typeId !== "minecraft:air") return;
    return { block: b, loc: { x: x + 0.5, y: y + 1, z: z + 0.5 } };
  }
}
function spotNear(p, rMin, rMax, needWalk) {
  const a = Math.random() * Math.PI * 2, r = rnd(rMin, rMax);
  const g = ground(p.dimension, Math.floor(p.location.x + Math.cos(a) * r), Math.floor(p.location.z + Math.sin(a) * r));
  if (!g) return;
  if (needWalk && !WALKABLE.has(g.block.typeId)) return;
  return g.loc;
}
function spawnNamed(dim, type, loc, name, tags) {
  try {
    const e = dim.spawnEntity(type, loc);
    e.nameTag = name;
    for (const t of tags) e.addTag(t);
    return e;
  } catch { }
}
function spawnCop(p) {
  const loc = spotNear(p, 14, 28, false);
  if (!loc) return;
  const w = wanted(p), r = Math.random(), dim = p.dimension;
  if (w >= 5 && r < 0.2) {
    const e = spawnNamed(dim, "minecraft:phantom", add(loc, { x: 0, y: 12, z: 0 }), "§9§lPolice Chopper", ["cop"]);
    try { e?.addEffect("fire_resistance", 20000000, { showParticles: false }); } catch { }
  } else if (w >= 3 && r < 0.6) {
    const e = spawnNamed(dim, "minecraft:wither_skeleton", loc, "§8§lSWAT", ["cop"]);
    if (e) { cmd(e, "replaceitem entity @s slot.weapon.mainhand 0 iron_sword"); cmd(e, "replaceitem entity @s slot.armor.head 0 netherite_helmet"); }
  } else {
    const e = spawnNamed(dim, "minecraft:skeleton", loc, "§9Police", ["cop"]);
    if (e) { cmd(e, "replaceitem entity @s slot.armor.head 0 iron_helmet"); cmd(e, "replaceitem entity @s slot.armor.chest 0 chainmail_chestplate"); }
  }
}
function clearCops() {
  for (const d of ["overworld"]) for (const e of world.getDimension(d).getEntities({ tags: ["cop"] })) { try { e.remove(); } catch { } }
}

// ---------- pedestrians
function spawnPed(p) {
  const loc = spotNear(p, 14, 34, true);
  if (!loc || loc.y < 63 || loc.y > 68) return;
  spawnNamed(p.dimension, "minecraft:villager_v2", loc, PEDS[Math.floor(Math.random() * PEDS.length)], ["ped"]);
}

// ---------- jobs
let job = null;
function startJob(p, j) {
  if (job) { msg(p, "§cA job is already running. Finish or cancel it first."); return; }
  job = { j, owner: p.id, spawned: false };
  title(p, "§c§l" + j.title, "§7" + j.where);
  msg(p, `§f${j.desc} §7Follow the GPS arrow on your screen (${j.spot[0]} ${j.spot[1]} ${j.spot[2]}).`);
}
function endJob(ok) {
  if (!job) return;
  const owner = world.getAllPlayers().find(x => x.id === job.owner);
  if (ok && owner) {
    addScore("pl_cash", owner, job.j.reward);
    owner.setDynamicProperty("jobs", (owner.getDynamicProperty("jobs") ?? 0) + 1);
    title(owner, "§6§lJOB COMPLETE", "§a+$" + job.j.reward);
    sound(owner.dimension, "random.levelup", owner.location);
  } else if (owner) msg(owner, "§cJob failed.");
  if (!ok) for (const e of world.getDimension("overworld").getEntities({ tags: ["job_enemy"] })) { try { e.remove(); } catch { } }
  job = null;
}
function jobTick() {
  if (!job) return;
  const owner = world.getAllPlayers().find(x => x.id === job.owner);
  if (!owner) return endJob(false);
  const [x, y, z] = job.j.spot, spot = { x: x + 0.5, y, z: z + 0.5 };
  const d = dist(owner.location, spot);
  if (!job.spawned && d < 48) {
    const dim = owner.dimension;
    const b = job.j.boss;
    const boss = spawnNamed(dim, "minecraft:" + b[0], spot, "§4§l" + b[1], ["job_enemy", "boss"]);
    try { boss?.addEffect("resistance", 20000000, { amplifier: 1, showParticles: false }); } catch { }
    job.j.goons.forEach((g, i) => {
      const a = i / job.j.goons.length * Math.PI * 2;
      spawnNamed(dim, "minecraft:" + g[0], add(spot, { x: Math.cos(a) * 2.5, y: 0, z: Math.sin(a) * 2.5 }), "§c" + g[1], ["job_enemy"]);
    });
    job.spawned = true;
    msg(owner, "§cHere they are. Take them out!");
  } else if (job.spawned && d < 96) {
    if (!owner.dimension.getEntities({ tags: ["job_enemy"] }).length) endJob(true);
  }
}
function gps(p) {
  if (!job || job.owner !== p.id) return "";
  const [x, , z] = job.j.spot, dx = x - p.location.x, dz = z - p.location.z;
  const bearing = Math.atan2(-dx, dz) * 180 / Math.PI;
  let rel = bearing - p.getRotation().y;
  rel = ((rel % 360) + 540) % 360 - 180;
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  return `   §c${job.j.title} §f${Math.round(Math.hypot(dx, dz))}m ${arrows[((Math.round(rel / 45) % 8) + 8) % 8]}`;
}

// ---------- phone (forms)
async function phone(p) {
  const f = new ActionFormData().title("§dPalmera Phone")
    .body(`§aCash: $${cash(p)}   §fAmmo: ${ammo(p)}   §eWanted: ${"★".repeat(wanted(p)) || "none"}`)
    .button("§6Sunshine Arms\n§8Guns, ammo, armor", "textures/items/palmera_pistol")
    .button("§bCoastline Motors\n§8Buy a car", "textures/items/palmera_phone")
    .button("§cJobs\n§8Make money", "textures/items/palmera_cash")
    .button("§7Stats");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === 0) shopForm(p, SHOP.filter(s => s.cat === "arms"), "§6Sunshine Arms");
  if (r.selection === 1) shopForm(p, SHOP.filter(s => s.cat === "cars"), "§bCoastline Motors");
  if (r.selection === 2) jobsForm(p);
  if (r.selection === 3) msg(p, `§aCash $${cash(p)} §7| Jobs done ${p.getDynamicProperty("jobs") ?? 0} | Wanted ${wanted(p)}`);
}
async function shopForm(p, list, name) {
  const f = new ActionFormData().title(name).body(`§aYou have $${cash(p)}`);
  for (const s of list) f.button(`${s.label}\n§2$${s.price}`, s.icon);
  const r = await f.show(p);
  if (r.canceled) return;
  buy(p, list[r.selection]);
}
function buy(p, s) {
  if (cash(p) < s.price) { msg(p, `§cNot enough cash for ${s.label} ($${s.price}).`); return; }
  addScore("pl_cash", p, -s.price);
  const k = s.key;
  if (GUNS["palmera:" + k] || k === "bat") give(p, "palmera:" + k);
  else if (k === "ammo") addScore("pl_ammo", p, 60);
  else if (k === "grenade") give(p, "palmera:grenade", 4);
  else if (k === "armor") give(p, "minecraft:iron_chestplate", 1, "§7Body Armor");
  else if (k === "medkit") give(p, "minecraft:golden_apple", 3, "§aMedkit");
  else if (k === "car_sedan") spawnCar(p, "palmera:car");
  else if (k === "car_sports") spawnCar(p, "palmera:sports_car");
  sound(p.dimension, "random.orb", p.location);
  msg(p, `§aBought ${s.label} for $${s.price}.`);
}
function spawnCar(p, type) {
  const old = p.getDynamicProperty("car");
  if (old) { try { world.getEntity(old)?.remove(); } catch { } }
  const d = p.getViewDirection(), loc = add(p.location, { x: d.x * 4, y: 0.5, z: d.z * 4 });
  try {
    const car = p.dimension.spawnEntity(type, loc);
    car.triggerEvent("palmera:c" + Math.floor(Math.random() * 10));
    p.setDynamicProperty("car", car.id);
    msg(p, "§bYour car is parked in front of you. Interact with it to drive.");
  } catch { msg(p, "§cNo room to park the car here."); }
}
async function jobsForm(p) {
  const f = new ActionFormData().title("§cJobs").body(job ? `§eCurrent job: ${job.j.title}` : "§7Pick a job:");
  for (const j of JOBS) f.button(`§f${j.title} §6$${j.reward}\n§8${j.where}`);
  f.button("§8Cancel current job");
  const r = await f.show(p);
  if (r.canceled) return;
  if (r.selection === JOBS.length) { if (job && job.owner === p.id) endJob(false); return; }
  startJob(p, JOBS[r.selection]);
}

// ---------- loops
system.runInterval(() => {          // HUD + cash pickup (every 10 ticks)
  for (const p of world.getAllPlayers()) {
    const c = inv(p);
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it && it.typeId === "palmera:cash") { addScore("pl_cash", p, it.amount * 50); c.setItem(i, undefined); sound(p.dimension, "random.orb", p.location, 1.4); }
    }
    const w = wanted(p);
    p.onScreenDisplay.setActionBar(`§a$${cash(p)}   §7Ammo §f${ammo(p)}   §e${"★".repeat(w)}§8${"☆".repeat(5 - w)}${gps(p)}`);
  }
}, 10);

system.runInterval(() => {          // wanted decay + jobs (every second)
  for (const p of world.getAllPlayers()) {
    const w = wanted(p);
    if (!w) continue;
    let near = 0;
    try { near = p.dimension.getEntities({ location: p.location, maxDistance: 28, tags: ["cop"] }).length; } catch { }
    if (near) continue;
    const cd = (p.getDynamicProperty("wcd") ?? 600) - 20;
    if (cd <= 0) {
      setWanted(p, w - 1); p.setDynamicProperty("wcd", 600);
      if (w - 1 === 0) { msg(p, "§aYou lost the cops."); if (!world.getAllPlayers().some(x => wanted(x) > 0)) clearCops(); }
    } else p.setDynamicProperty("wcd", cd);
  }
  jobTick();
}, 20);

system.runInterval(() => {          // police (every 5 s)
  for (const p of world.getAllPlayers()) {
    const w = wanted(p);
    if (!w) continue;
    let n = 0;
    try { n = p.dimension.getEntities({ location: p.location, maxDistance: 56, tags: ["cop"] }).length; } catch { }
    if (n < w * 2 + 1) { spawnCop(p); spawnCop(p); }
  }
}, 100);

system.runInterval(() => {          // pedestrians (every 2 s)
  const players = world.getAllPlayers();
  for (const p of players) {
    let n = 0;
    try { n = p.dimension.getEntities({ location: p.location, maxDistance: 48, tags: ["ped"] }).length; } catch { }
    if (n < 14) spawnPed(p);
    if (n < 9) spawnPed(p);
  }
  try {
    for (const e of world.getDimension("overworld").getEntities({ tags: ["ped"] })) {
      if (!players.some(p => dist(p.location, e.location) < 80)) e.remove();
    }
  } catch { }
}, 40);
'''


def build_addon(out_path, P):
    jobs = javapacks.job_defs(P)
    guns = {}
    for k, (cmd, label, color, dmg, cd, rng, step, pellets, ammo) in javapacks.GUNS.items():
        guns['palmera:' + k] = {
            'dmg': dmg, 'cd': {'pistol': 5, 'smg': 2, 'shotgun': 16, 'rifle': 3, 'rocket': 30}[k],
            'range': int(rng * step), 'pellets': pellets, 'ammo': ammo,
            'spread': {'pistol': 0.01, 'smg': 0.04, 'shotgun': 0.12, 'rifle': 0.015, 'rocket': 0}[k],
            'sound': {'pistol': 'firework.blast', 'smg': 'firework.blast', 'shotgun': 'random.explode',
                      'rifle': 'firework.large_blast', 'rocket': 'firework.launch'}[k],
            'pitch': {'pistol': 1.6, 'smg': 2.0, 'shotgun': 1.8, 'rifle': 1.5, 'rocket': 0.6}[k],
            'particle': 'minecraft:basic_flame_particle' if k == 'rocket' else 'minecraft:basic_crit_particle',
            'explode': 4 if k == 'rocket' else 0}
    icon = lambda key: 'textures/items/palmera_' + (key if key in ITEMS else 'cash')
    shop = [{'key': key, 'label': label, 'price': price, 'cat': 'cars' if key.startswith('car') else 'arms',
             'icon': icon(key)} for _, label, price, key in javapacks.SHOP]
    data = {'guns': guns, 'shop': shop, 'peds': javapacks.PED_NAMES,
            'jobs': [{'title': j['title'], 'where': j['where'], 'reward': j['reward'], 'desc': j['desc'],
                      'spot': list(j['spot']), 'boss': [j['boss'][0], j['boss'][1]],
                      'goons': [list(g) for g in j['goons']]} for j in jobs]}

    bp, rp = {}, {}
    bp_uuid, rp_uuid = U('bp'), U('rp')
    rp['manifest.json'] = J({'format_version': 2, 'header': {
        'name': 'Palmera Life (Resources)', 'description': 'Guns, phone, cash and car models for Palmera',
        'uuid': rp_uuid, 'version': [1, 0, 0], 'min_engine_version': MIN_ENGINE},
        'modules': [{'type': 'resources', 'uuid': U('rp-mod'), 'version': [1, 0, 0]}]})
    bp['manifest.json'] = J({'format_version': 2, 'header': {
        'name': 'Palmera Life', 'description': 'Guns, cash, cops, pedestrians, cars and jobs for the Palmera map',
        'uuid': bp_uuid, 'version': [1, 0, 0], 'min_engine_version': MIN_ENGINE},
        'modules': [{'type': 'data', 'uuid': U('bp-data'), 'version': [1, 0, 0]},
                    {'type': 'script', 'language': 'javascript', 'uuid': U('bp-script'), 'version': [1, 0, 0],
                     'entry': 'scripts/main.js'}],
        'dependencies': [{'module_name': '@minecraft/server', 'version': SERVER_VER},
                         {'module_name': '@minecraft/server-ui', 'version': UI_VER},
                         {'uuid': rp_uuid, 'version': [1, 0, 0]}]})
    bp['scripts/main.js'] = SCRIPT.replace('__DATA__', json.dumps(data))

    icon_png = javapacks.sprite_png(javapacks.SPRITES['pistol'])
    big_icon = Image.open(io.BytesIO(icon_png)).resize((128, 128), Image.NEAREST)
    b = io.BytesIO()
    big_icon.save(b, 'PNG')
    bp['pack_icon.png'] = rp['pack_icon.png'] = b.getvalue()

    tex_data = {}
    for key, (label, stack, hand) in ITEMS.items():
        comps = {'minecraft:icon': {'textures': {'default': 'palmera_' + key}},
                 'minecraft:display_name': {'value': label},
                 'minecraft:max_stack_size': stack, 'minecraft:hand_equipped': hand}
        if key == 'bat':
            comps['minecraft:damage'] = 7
        bp['items/%s.json' % key] = J({'format_version': '1.21.0', 'minecraft:item': {
            'description': {'identifier': 'palmera:' + key, 'menu_category': {'category': 'equipment'}},
            'components': comps}})
        rp['textures/items/palmera_%s.png' % key] = javapacks.sprite_png(javapacks.SPRITES[key])
        tex_data['palmera_' + key] = {'textures': 'textures/items/palmera_' + key}
    rp['textures/item_texture.json'] = J({'resource_pack_name': 'palmera', 'texture_name': 'atlas.items', 'texture_data': tex_data})

    for kind, label, speed, hp, seat in (('car', 'Sedan', 0.38, 60, 0.55), ('sports_car', 'Sports Car', 0.55, 45, 0.35)):
        geo = 'car' if kind == 'car' else 'sports'
        bp['entities/%s.json' % kind] = J(car_behavior(kind, speed, hp, seat))
        client = car_client(kind, label)
        client['minecraft:client_entity']['description']['geometry']['default'] = 'geometry.palmera_' + geo
        rp['entity/%s.entity.json' % kind] = J(client)
        rp['models/entity/palmera_%s.geo.json' % geo] = J(car_geo(geo))
    for i, rgb in enumerate(CAR_COLORS):
        rp['textures/entity/palmera_car/c%d.png' % i] = car_texture(rgb)
    rp['render_controllers/palmera_car.render_controllers.json'] = J(RENDER_CONTROLLER)
    rp['texts/en_US.lang'] = '\n'.join([
        'entity.palmera:car.name=Sedan', 'entity.palmera:sports_car.name=Sports Car',
        'item.spawn_egg.entity.palmera:car.name=Sedan', 'item.spawn_egg.entity.palmera:sports_car.name=Sports Car']) + '\n'
    rp['texts/languages.json'] = J(['en_US'])

    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in bp.items():
            z.writestr('Palmera_Life_BP/' + k, v)
        for k, v in rp.items():
            z.writestr('Palmera_Life_RP/' + k, v)
    return bp, rp
