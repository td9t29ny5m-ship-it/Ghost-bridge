"""
Palmera Life - gameplay datapack + item resource pack for the Palmera world (Java 1.21.1).

Adds: guns (pistol, SMG, shotgun, assault rifle, rocket launcher), grenades, bat, body armor, medkits,
a phone menu, cash economy, a wanted-level/police system, ambient pedestrians, drivable cars
(sedans and sports cars) and six jobs spread over the map.
"""
import io
import json
import os
import zipfile

import numpy as np
from PIL import Image

NS = 'palmera'
DP_FORMAT = 48      # 1.21 / 1.21.1
RP_FORMAT = 34


def _j(o):
    return json.dumps(o, ensure_ascii=False)


def name(text, color='white', bold=False):
    return "'" + _j({'text': text, 'color': color, 'italic': False, 'bold': bold}).replace("'", "\\'") + "'"


# --------------------------------------------------------------------------- items
GUNS = {
    #        cmd   label             color        dmg  cd range(steps) step  pellets ammo
    'pistol': (1001, 'Pistol', 'gold', 6, 5, 80, 0.5, 1, 1),
    'smg': (1002, 'SMG', 'yellow', 4, 0, 60, 0.5, 1, 1),
    'shotgun': (1003, 'Pump Shotgun', 'red', 4, 16, 28, 0.5, 5, 1),
    'rifle': (1004, 'Assault Rifle', 'aqua', 7, 0, 120, 0.5, 1, 1),
    'rocket': (1005, 'Rocket Launcher', 'dark_red', 0, 30, 90, 1.0, 1, 5),
}
SHOP = [
    # id  label                price  give-function
    (1, 'Pistol', 500, 'pistol'),
    (2, 'SMG', 2500, 'smg'),
    (3, 'Pump Shotgun', 3500, 'shotgun'),
    (4, 'Assault Rifle', 7500, 'rifle'),
    (5, 'Rocket Launcher', 25000, 'rocket'),
    (6, 'Ammo x60', 150, 'ammo'),
    (7, 'Grenades x4', 600, 'grenade'),
    (8, 'Body Armor', 1500, 'armor'),
    (9, 'Medkits x3', 300, 'medkit'),
    (10, 'Baseball Bat', 100, 'bat'),
    (20, 'Sedan', 4000, 'car_sedan'),
    (21, 'Sports Car', 15000, 'car_sports'),
]


def give_cmd(key):
    if key in GUNS:
        cmd, label, color = GUNS[key][:3]
        return ("give @s carrot_on_a_stick[custom_data={gun:\"%s\"},custom_model_data=%d,custom_name=%s,"
                "unbreakable={show_in_tooltip:false},lore=['{\"text\":\"Right-click to fire\",\"color\":\"gray\",\"italic\":false}']] 1"
                % (key, cmd, name(label, color)))
    return {
        'phone': "give @s carrot_on_a_stick[custom_data={phone:1b},custom_model_data=1010,custom_name=%s,unbreakable={show_in_tooltip:false},"
                 "lore=['{\"text\":\"Right-click to open\",\"color\":\"gray\",\"italic\":false}']] 1" % name('Phone', 'light_purple'),
        'ammo': 'scoreboard players add @s pl_ammo 60',
        'grenade': "give @s snowball[custom_data={grenade:1b},custom_model_data=1201,custom_name=%s] 4" % name('Grenade', 'red'),
        'armor': "give @s iron_chestplate[custom_name=%s,enchantments={levels:{\"minecraft:protection\":3}}] 1" % name('Body Armor', 'gray'),
        'medkit': "give @s golden_apple[custom_name=%s] 3" % name('Medkit', 'green'),
        'bat': ("give @s stick[custom_model_data=1401,custom_name=%s,attribute_modifiers={modifiers:[{type:\"minecraft:generic.attack_damage\","
                "id:\"palmera:bat\",amount:6,operation:\"add_value\",slot:\"mainhand\"}]}] 1" % name('Baseball Bat', 'white')),
        'car_sedan': 'function palmera:car/buy_sedan',
        'car_sports': 'function palmera:car/buy_sports',
    }[key]


# --------------------------------------------------------------------------- NPC / police
PED_NAMES = ['Marisol', 'Dwayne', 'Rosa', 'Tyler', 'Yolanda', 'Kevin', 'Ines', 'Marcus', 'Brittany', 'Carlos',
             'Destiny', 'Hank', 'Lucia', 'Brandon', 'Gloria', 'Andre', 'Tiffany', 'Rafael', 'Shonda', 'Earl',
             'Camila', 'Duke', 'Paloma', 'Travis', 'Nadia', 'Ricky', 'Jasmine', 'Wade', 'Esperanza', 'Cody',
             'Tourist', 'Surfer Sam', 'Old Man Joe', 'Jogger', 'Street Vendor', 'Skater Kid', 'Beach Bum',
             'Fisherman Lou', 'Real Estate Agent', 'Influencer']
VTYPES = ['plains', 'desert', 'jungle', 'savanna', 'swamp', 'taiga', 'snow']
NAVY, BLACK = 0x1B2A5C, 0x161616


def leather(color):
    parts = ['leather_boots', 'leather_leggings', 'leather_chestplate', 'leather_helmet']
    return '[' + ','.join('{id:"minecraft:%s",count:1,components:{"minecraft:dyed_color":{rgb:%d}}}' % (p, color) for p in parts) + ']'


COP = ('summon skeleton ~ ~ ~ {Tags:["cop"],CustomName:%s,PersistenceRequired:1b,DeathLootTable:"minecraft:empty",'
       'HandItems:[{id:"minecraft:bow",count:1},{}],HandDropChances:[0f,0f],ArmorItems:%s,ArmorDropChances:[0f,0f,0f,0f]}'
       % (name('Police', 'blue'), leather(NAVY)))
SWAT = ('summon wither_skeleton ~ ~ ~ {Tags:["cop"],CustomName:%s,PersistenceRequired:1b,DeathLootTable:"minecraft:empty",'
        'HandItems:[{id:"minecraft:iron_sword",count:1},{}],HandDropChances:[0f,0f],ArmorItems:%s,ArmorDropChances:[0f,0f,0f,0f]}'
        % (name('SWAT', 'dark_gray', True), leather(BLACK)))
CHOPPER = ('summon phantom ~ ~12 ~ {Tags:["cop"],CustomName:%s,Size:4,PersistenceRequired:1b,DeathLootTable:"minecraft:empty",'
           'active_effects:[{id:"minecraft:fire_resistance",duration:-1,amplifier:0,show_particles:0b}]}' % name('Police Chopper', 'blue', True))


# --------------------------------------------------------------------------- cars
CAR_COLORS = ['red', 'blue', 'white', 'black', 'yellow', 'lime', 'orange', 'magenta', 'cyan', 'light_gray']


def display(block, t, s, extra_tags=()):
    tags = ['car_part', 'car_any', 'car_new'] + list(extra_tags)
    return ('summon block_display ~ ~ ~ {Tags:%s,teleport_duration:2,block_state:{Name:"minecraft:%s"},'
            'transformation:{left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f],translation:[%sf,%sf,%sf],scale:[%sf,%sf,%sf]}}'
            % (_j(tags), block, *t, *s))


def car_model(kind, color):
    out = []
    speed, hp = (0.42, 50) if kind == 'sedan' else (0.62, 40)
    out.append('summon horse ~ ~ ~ {Tags:["car","car_any","car_new"],Tame:1b,Silent:1b,PersistenceRequired:1b,'
               'CustomName:%s,SaddleItem:{id:"minecraft:saddle",count:1},Health:%df,'
               'attributes:[{id:"minecraft:generic.movement_speed",base:%s},{id:"minecraft:generic.jump_strength",base:0.45},'
               '{id:"minecraft:generic.max_health",base:%d},{id:"minecraft:generic.step_height",base:1.1}],'
               'active_effects:[{id:"minecraft:invisibility",duration:-1,amplifier:0,show_particles:0b}]}'
               % (name('Sports Car' if kind == 'sports' else 'Sedan', 'gold'), hp, speed, hp))
    c = color + '_concrete'
    if kind == 'sedan':
        out.append(display(c, (-1, 0.35, -2.2), (2, 0.8, 4.4)))
        out.append(display('black_stained_glass', (-0.9, 1.15, -1.2), (1.8, 0.75, 2.2)))
        out.append(display(c, (-0.9, 1.9, -1.1), (1.8, 0.12, 2.0)))
        out.append(display('sea_lantern', (-0.85, 0.6, 2.18), (0.4, 0.25, 0.05)))
        out.append(display('sea_lantern', (0.45, 0.6, 2.18), (0.4, 0.25, 0.05)))
        out.append(display('redstone_block', (-0.85, 0.6, -2.23), (0.4, 0.2, 0.05)))
        out.append(display('redstone_block', (0.45, 0.6, -2.23), (0.4, 0.2, 0.05)))
    else:
        out.append(display(c, (-1, 0.25, -2.3), (2, 0.6, 4.6)))
        out.append(display('black_stained_glass', (-0.85, 0.85, -0.9), (1.7, 0.55, 1.6)))
        out.append(display(c, (-1, 1.0, -2.3), (2, 0.12, 0.3)))
        out.append(display('black_concrete', (-0.9, 0.85, -2.3), (0.15, 0.2, 0.15)))
        out.append(display('black_concrete', (0.75, 0.85, -2.3), (0.15, 0.2, 0.15)))
        out.append(display('sea_lantern', (-0.85, 0.45, 2.28), (0.45, 0.15, 0.05)))
        out.append(display('sea_lantern', (0.4, 0.45, 2.28), (0.45, 0.15, 0.05)))
    for wx in (-1.1, 0.6):
        for wz in (-1.7, 1.1):
            out.append(display('black_concrete', (wx, 0.0, wz), (0.5, 0.6, 0.6)))
    return out


# --------------------------------------------------------------------------- jobs
def find_spot(P, u, v, zones, radius=200, need_sand=False):
    from generate import SAND
    S = P.S
    cx, cz = int(u * S), int(v * S)
    x0, z0 = max(0, cx - radius), max(0, cz - radius)
    sl = (slice(z0, min(S, cz + radius)), slice(x0, min(S, cx + radius)))
    ok = np.isin(P.zone[sl], zones) & ~P.occ[sl] & (P.H[sl] >= 62)
    if need_sand:
        ok &= P.TOP[sl] == SAND
    zz, xx = np.nonzero(ok)
    if not len(zz):
        zz, xx = np.nonzero(np.isin(P.zone[sl], zones) & (P.H[sl] >= 62))
    if not len(zz):
        return cx, 70, cz
    i = int(np.argmin((zz + z0 - cz) ** 2 + (xx + x0 - cx) ** 2))
    x, z = int(xx[i] + x0), int(zz[i] + z0)
    return x, int(P.H[z, x]) + 1, z


def job_defs(P):
    import generate as g
    return [
        dict(id=1, title='Beach Brawl', where='Coral Strand', reward=1500,
             desc='Some thugs are shaking down beach vendors. Run them off.',
             spot=find_spot(P, 0.86, 0.33, [g.Z_RESORT], need_sand=True),
             boss=('vindicator', 'Thug Leader', 40), goons=[('vindicator', 'Beach Thug')] * 4),
        dict(id=2, title='Dockside Shakedown', where='Port Solano', reward=3000,
             desc='A crew is stealing containers at the port. Take out the Dock Boss.',
             spot=find_spot(P, 0.74, 0.70, [g.Z_PORT]),
             boss=('vindicator', 'Dock Boss', 70), goons=[('pillager', 'Dock Goon')] * 5),
        dict(id=3, title='Swamp Runners', where='Mangrove Point', reward=2500,
             desc='Smugglers are moving product through the swamp. Shut them down.',
             spot=find_spot(P, 0.29, 0.715, [g.Z_TOWN, g.Z_SWAMP]),
             boss=('vindicator', 'Swamp King', 60), goons=[('pillager', 'Smuggler')] * 5),
        dict(id=4, title='Hangar Deal', where='International Airport', reward=6000,
             desc='An arms deal is going down by the hangars. Crash it.',
             spot=find_spot(P, 0.68, 0.27, [g.Z_AIR]),
             boss=('evoker', 'Arms Dealer', 60), goons=[('vindicator', 'Bodyguard')] * 4 + [('pillager', 'Lookout')] * 2),
        dict(id=5, title='Launch Day', where='Spaceport', reward=8000,
             desc='Saboteurs want to wreck the launch. Stop them and their getaway truck.',
             spot=find_spot(P, 0.68, 0.11, [g.Z_SPACE]),
             boss=('ravager', 'Getaway Truck', 100), goons=[('pillager', 'Saboteur')] * 6),
        dict(id=6, title='Isle Heist', where='Millionaire Isles', reward=12000,
             desc='The Kingpin is hiding out in a mansion. Get past his guards.',
             spot=find_spot(P, 0.8125, 0.47, [g.Z_ISLE], radius=80),
             boss=('evoker', 'The Kingpin', 90), goons=[('vindicator', 'Bodyguard')] * 5 + [('pillager', 'Sniper')] * 3),
    ]


def mob(kind, label, hp, tags, loot, color='red', glow=False):
    hand = {'pillager': '[{id:"minecraft:crossbow",count:1},{}]', 'vindicator': '[{id:"minecraft:iron_axe",count:1},{}]'}.get(kind, '[{},{}]')
    return ('summon %s ~ ~ ~ {Tags:%s,CustomName:%s,PersistenceRequired:1b,DeathLootTable:"%s",Glowing:%s,'
            'HandItems:%s,HandDropChances:[0f,0f],Health:%df,attributes:[{id:"minecraft:generic.max_health",base:%d}]}'
            % (kind, _j(tags), name(label, color, glow), loot, '1b' if glow else '0b', hand, hp, hp))


# --------------------------------------------------------------------------- sprites
PAL = {'.': None, '#': (38, 38, 44), 'S': (120, 122, 132), 'L': (175, 178, 188), 'B': (92, 60, 36),
       'b': (130, 88, 52), 'G': (60, 110, 40), 'g': (95, 160, 60), 'R': (170, 30, 30), 'r': (220, 60, 50),
       'Y': (230, 190, 40), 'W': (235, 235, 235), 'P': (150, 70, 200), 'C': (70, 200, 230), 'O': (230, 120, 30),
       'K': (15, 15, 18), 'D': (60, 62, 70)}
SPRITES = {
    'pistol': [
        '................', '................', '................', '................',
        '...SSSSSSSSSSS..', '...LLLLLLLLLLLS.', '...SSSSSSSSSSSS.', '...##K#.........',
        '...##.K.........', '...##KK.........', '..###...........', '..###...........',
        '..##............', '................', '................', '................'],
    'smg': [
        '................', '................', '................', '.....S..........',
        '..DDDDDDDDDDDD..', '..DSSSSSSSSSSSDD', '..DDDDDDDDDDDD..', '..DD.##K#.......',
        '..D..##.K.......', '.DD..#.KK.......', '.D...#..........', '.....#..........',
        '................', '................', '................', '................'],
    'shotgun': [
        '................', '................', '................', '................',
        '................', 'BB..............', 'BBBSSSSSSSSSSSSS', 'BBBBDDDDDDDDDDDD',
        '.BBB..K..bbbb...', '..B...KK........', '................', '................',
        '................', '................', '................', '................'],
    'rifle': [
        '................', '................', '................', '.......S........',
        '#.....SSS.......', '##DDDDDDDDDDDDDD', '###SSSSSSSSDDD..', '####DDDDDD......',
        '.##..#K.#D......', '.....#.K#.......', '.....#..#.......', '......#..#......',
        '..........#.....', '................', '................', '................'],
    'rocket': [
        '................', '................', '................', '..........r.....',
        'GGGGGGGGGGGGGrr.', 'gGGGGGGGGGGGGrrr', 'GGGGGGGGGGGGGrr.', '....#K#...r.....',
        '....#.K.........', '....##..........', '................', '................',
        '................', '................', '................', '................'],
    'phone': [
        '................', '.....KKKKKK.....', '....KDDDDDDK....', '....KCCCCCCK....',
        '....KCPCCPCK....', '....KCCCCCCK....', '....KCPCCYCK....', '....KCCCCCCK....',
        '....KCYCCPCK....', '....KCCCCCCK....', '....KCCCCCCK....', '....KDDDDDDK....',
        '....KDDLLDDK....', '.....KKKKKK.....', '................', '................'],
    'grenade': [
        '................', '......SS........', '.....S..S.......', '......GGGG......',
        '.....GgGGGG.....', '....GGgGGGGG....', '....GgGGGGGG....', '....GGGGGGGG....',
        '....GGGGGGGG....', '....GGGGGGgG....', '.....GGGGGG.....', '......GGGG......',
        '................', '................', '................', '................'],
    'cash': [
        '................', '................', '................', '..GGGGGGGGGGGG..',
        '..GggggggggggG..', '..GgYYggggYYgG..', '..GggggWWggggG..', '..GgggWggWgggG..',
        '..GggggWWggggG..', '..GgYYggggYYgG..', '..GggggggggggG..', '..GGGGGGGGGGGG..',
        '................', '................', '................', '................'],
    'bat': [
        '................', '................', '..............bb', '.............bbb',
        '............bbb.', '...........bbb..', '..........bbb...', '.........bbb....',
        '........bb......', '.......bb.......', '......bb........', '.....bb.........',
        '....KK..........', '...KK...........', '..K.............', '................'],
}


def sprite_png(rows):
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            c = PAL.get(ch)
            if c:
                im.putpixel((x, y), c + (255,))
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


GUN_DISPLAY = {
    'thirdperson_righthand': {'rotation': [0, -90, 0], 'translation': [0, 3, 1], 'scale': [0.9, 0.9, 0.9]},
    'thirdperson_lefthand': {'rotation': [0, 90, 0], 'translation': [0, 3, 1], 'scale': [0.9, 0.9, 0.9]},
    'firstperson_righthand': {'rotation': [0, -90, 5], 'translation': [1.5, 3.5, 1], 'scale': [0.75, 0.75, 0.75]},
    'firstperson_lefthand': {'rotation': [0, 90, -5], 'translation': [1.5, 3.5, 1], 'scale': [0.75, 0.75, 0.75]},
}


def build_resource_pack(path):
    files = {}
    files['pack.mcmeta'] = _j({'pack': {'pack_format': RP_FORMAT, 'description': 'Palmera Life items'}})
    for key, rows in SPRITES.items():
        files['assets/palmera/textures/item/%s.png' % key] = sprite_png(rows)
        model = {'parent': 'minecraft:item/handheld', 'textures': {'layer0': 'palmera:item/' + key}}
        if key in GUNS:
            model['display'] = GUN_DISPLAY
        files['assets/palmera/models/item/%s.json' % key] = _j(model)
    files['pack.png'] = sprite_png(SPRITES['pistol'])
    ov = lambda cmd, m: {'predicate': {'custom_model_data': cmd}, 'model': 'palmera:item/' + m}
    files['assets/minecraft/models/item/carrot_on_a_stick.json'] = _j({
        'parent': 'minecraft:item/handheld_rod', 'textures': {'layer0': 'minecraft:item/carrot_on_a_stick'},
        'overrides': [ov(GUNS[k][0], k) for k in GUNS] + [ov(1010, 'phone')]})
    files['assets/minecraft/models/item/snowball.json'] = _j({
        'parent': 'minecraft:item/generated', 'textures': {'layer0': 'minecraft:item/snowball'}, 'overrides': [ov(1201, 'grenade')]})
    files['assets/minecraft/models/item/emerald.json'] = _j({
        'parent': 'minecraft:item/generated', 'textures': {'layer0': 'minecraft:item/emerald'}, 'overrides': [ov(1301, 'cash')]})
    files['assets/minecraft/models/item/stick.json'] = _j({
        'parent': 'minecraft:item/handheld', 'textures': {'layer0': 'minecraft:item/stick'}, 'overrides': [ov(1401, 'bat')]})
    files['assets/minecraft/lang/en_us.json'] = _j({
        'death.attack.palmera.bullet': '%1$s was shot',
        'death.attack.palmera.bullet.player': '%1$s was shot by %2$s',
        'death.attack.palmera.bullet.item': '%1$s was shot by %2$s using %3$s'})
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in files.items():
            z.writestr(k, v)


# --------------------------------------------------------------------------- datapack
def build_datapack(root, P):
    F = {}

    def fn(path, lines):
        F['data/%s/function/%s.mcfunction' % (NS, path)] = '\n'.join(lines) + '\n'

    F['pack.mcmeta'] = _j({'pack': {'pack_format': DP_FORMAT, 'description': 'Palmera Life: guns, cash, cops, cars, jobs'}})
    F['data/minecraft/tags/function/load.json'] = _j({'values': ['palmera:load']})
    F['data/minecraft/tags/function/tick.json'] = _j({'values': ['palmera:tick']})
    F['data/palmera/damage_type/bullet.json'] = _j({'message_id': 'palmera.bullet', 'exhaustion': 0.1,
                                                    'scaling': 'when_caused_by_living_non_player', 'effects': 'hurt'})
    F['data/minecraft/tags/damage_type/bypasses_cooldown.json'] = _j({'replace': False, 'values': ['palmera:bullet']})
    F['data/palmera/tags/entity_type/not_target.json'] = _j({'values': [
        'minecraft:item', 'minecraft:experience_orb', 'minecraft:marker', 'minecraft:block_display', 'minecraft:item_display',
        'minecraft:text_display', 'minecraft:interaction', 'minecraft:arrow', 'minecraft:spectral_arrow', 'minecraft:snowball',
        'minecraft:area_effect_cloud', 'minecraft:falling_block', 'minecraft:tnt', 'minecraft:armor_stand',
        'minecraft:firework_rocket', 'minecraft:evoker_fangs']})
    F['data/palmera/tags/block/passable.json'] = _j({'values': [
        'minecraft:air', 'minecraft:cave_air', 'minecraft:void_air', 'minecraft:water', 'minecraft:short_grass',
        'minecraft:tall_grass', 'minecraft:fern', 'minecraft:seagrass', 'minecraft:lily_pad', 'minecraft:light',
        '#minecraft:small_flowers', '#minecraft:crops', '#minecraft:wool_carpets', 'minecraft:lantern',
        'minecraft:lightning_rod', 'minecraft:end_rod', 'minecraft:oak_fence', '#minecraft:rails']})
    F['data/palmera/tags/block/glass.json'] = _j({'values': ['#minecraft:impermeable', 'minecraft:glass_pane']})
    F['data/palmera/tags/block/walkable.json'] = _j({'values': [
        'minecraft:smooth_stone', 'minecraft:sand', 'minecraft:stone_bricks', 'minecraft:grass_block', 'minecraft:smooth_quartz']})

    def loot(path, lo, hi):
        F['data/palmera/loot_table/entities/%s.json' % path] = _j({'type': 'minecraft:entity', 'pools': [{'rolls': 1, 'entries': [{
            'type': 'minecraft:item', 'name': 'minecraft:emerald', 'functions': [
                {'function': 'minecraft:set_count', 'count': {'type': 'minecraft:uniform', 'min': lo, 'max': hi}},
                {'function': 'minecraft:set_components', 'components': {
                    'minecraft:custom_data': {'cash': True}, 'minecraft:custom_model_data': 1301,
                    'minecraft:custom_name': _j({'text': 'Cash', 'color': 'green', 'italic': False})}}]}]}]})
    loot('cash_small', 0, 1)
    loot('cash', 1, 3)
    loot('cash_big', 6, 12)

    objectives = [
        ('pl_use', 'minecraft.used:minecraft.carrot_on_a_stick'), ('pl_cash', 'dummy'), ('pl_ammo', 'dummy'),
        ('pl_wanted', 'dummy'), ('pl_wcd', 'dummy'), ('pl_cd', 'dummy'), ('pl_tmp', 'dummy'), ('pl_g', 'dummy'),
        ('pl_const', 'dummy'), ('pl_joined', 'dummy'), ('pl_death', 'deathCount'), ('pl_car', 'dummy'),
        ('pl_kped', 'minecraft.killed:minecraft.villager'), ('pl_kcop1', 'minecraft.killed:minecraft.skeleton'),
        ('pl_kcop2', 'minecraft.killed:minecraft.wither_skeleton'), ('pl_kcop3', 'minecraft.killed:minecraft.phantom'),
        ('pl_shop', 'trigger'), ('pl_job', 'trigger'), ('pl_menu', 'trigger'), ('pl_jobsdone', 'dummy'),
        ('pl_crimes', 'dummy'),
    ]
    fn('load', ['scoreboard objectives add %s %s' % o for o in objectives] + [
        'scoreboard players set #2 pl_const 2', 'scoreboard players set #50 pl_const 50',
        'execute unless score #job pl_g matches 0.. run scoreboard players set #job pl_g 0',
        'execute unless score #jobsp pl_g matches 0.. run scoreboard players set #jobsp pl_g 0',
        'schedule function palmera:npc/cycle 40t replace',
        'schedule function palmera:police/cycle 100t replace',
        'tellraw @a {"text":"[Palmera Life] loaded. Right-click your Phone or type /trigger pl_menu","color":"light_purple"}',
    ])
    fn('tick', [
        'execute as @a unless score @s pl_joined matches 1 run function palmera:player/first_join',
        'scoreboard players enable @a pl_shop', 'scoreboard players enable @a pl_job', 'scoreboard players enable @a pl_menu',
        'execute as @a[scores={pl_menu=1..}] run function palmera:menu/handle',
        'execute as @a[scores={pl_shop=1..}] run function palmera:shop/handle',
        'execute as @a[scores={pl_job=1..}] run function palmera:job/handle',
        'scoreboard players remove @a[scores={pl_cd=1..}] pl_cd 1',
        'execute as @a[scores={pl_use=1..}] at @s run function palmera:item/use',
        'scoreboard players reset @a pl_use',
        'execute as @a[scores={pl_kped=1..}] run function palmera:police/crime_ped',
        'execute as @a[scores={pl_kcop1=1..}] run function palmera:police/crime_cop',
        'execute as @a[scores={pl_kcop2=1..}] run function palmera:police/crime_cop',
        'execute as @a[scores={pl_kcop3=1..}] run function palmera:police/crime_cop',
        'execute as @a[scores={pl_wanted=1..}] at @s unless entity @e[tag=cop,distance=..28] run scoreboard players remove @s pl_wcd 1',
        'execute as @a[scores={pl_wanted=1..,pl_wcd=..0}] run function palmera:police/cool_down',
        'execute as @a[scores={pl_death=1..}] run function palmera:player/died',
        'execute as @a run function palmera:player/cash_pickup',
        'function palmera:grenade/tick',
        'function palmera:car/tick',
        'execute if score #job pl_g matches 1.. run function palmera:job/tick',
        'scoreboard players add #hud pl_g 1',
        'execute if score #hud pl_g matches 5.. run function palmera:hud/all',
    ])

    # ---- player
    fn('player/first_join', [
        'scoreboard players set @s pl_joined 1', 'scoreboard players set @s pl_cash 2500',
        'scoreboard players set @s pl_ammo 60', 'scoreboard players set @s pl_wanted 0', 'scoreboard players set @s pl_car 0',
        give_cmd('phone'), give_cmd('pistol'),
        'title @s times 10 70 20',
        'title @s title {"text":"PALMERA","color":"light_purple","bold":true}',
        'title @s subtitle {"text":"Welcome to the sunshine state","color":"aqua"}',
        'tellraw @s ["",{"text":"\\nWelcome to Palmera! ","color":"light_purple","bold":true},'
        '{"text":"You have $2,500, a pistol and a phone.\\n","color":"white"},'
        '{"text":"Right-click the Phone to buy guns and cars, and to take jobs. Hurting civilians brings the cops.\\n","color":"gray"},'
        '{"text":"[ Open Phone ]","color":"gold","clickEvent":{"action":"run_command","value":"/trigger pl_menu set 1"}}]',
    ])
    fn('player/died', [
        'scoreboard players reset @s pl_death', 'scoreboard players set @s pl_wanted 0',
        'scoreboard players remove @s pl_cash 500',
        'execute if score @s pl_cash matches ..-1 run scoreboard players set @s pl_cash 0',
        'title @s times 5 60 20',
        'title @s title {"text":"YOU DIED","color":"dark_red","bold":true}',
        'title @s subtitle {"text":"Hospital bill: $500","color":"gray"}',
        'execute if entity @s[tag=pl_jobowner] run function palmera:job/fail',
        'execute unless entity @a[scores={pl_wanted=1..}] run function palmera:police/clear',
    ])
    fn('player/cash_pickup', [
        'execute store result score @s pl_tmp run clear @s emerald[custom_data~{cash:1b}]',
        'execute if score @s pl_tmp matches 1.. run playsound minecraft:entity.experience_orb.pickup player @s ~ ~ ~ 1 1.4',
        'scoreboard players operation @s pl_tmp *= #50 pl_const',
        'scoreboard players operation @s pl_cash += @s pl_tmp',
    ])

    # ---- HUD
    fn('hud/all', ['scoreboard players set #hud pl_g 0', 'execute as @a run function palmera:hud/show'])
    hud = []
    for w in range(6):
        stars = [{'text': '★' * w, 'color': 'yellow'}, {'text': '☆' * (5 - w), 'color': 'dark_gray'}]
        comp = [{'text': '$', 'color': 'green'}, {'score': {'name': '@s', 'objective': 'pl_cash'}, 'color': 'green'},
                {'text': '    Ammo ', 'color': 'gray'}, {'score': {'name': '@s', 'objective': 'pl_ammo'}, 'color': 'white'},
                {'text': '    '}] + stars
        hud.append('execute if score @s pl_wanted matches %d run title @s actionbar %s' % (w, _j(comp)))
    fn('hud/show', hud)

    # ---- menu / phone
    def btn(label, color, cmd, hover):
        return {'text': '[ %s ]' % label, 'color': color, 'clickEvent': {'action': 'run_command', 'value': cmd},
                'hoverEvent': {'action': 'show_text', 'contents': hover}}
    fn('menu/handle', [
        'execute if score @s pl_menu matches 1 run function palmera:menu/open',
        'execute if score @s pl_menu matches 2 run function palmera:menu/stats',
        'scoreboard players set @s pl_menu 0'])
    fn('menu/open', [
        'playsound minecraft:block.note_block.chime player @s ~ ~ ~ 1 1.6',
        'tellraw @s {"text":"\\n======= PALMERA PHONE =======","color":"light_purple","bold":true}',
        'tellraw @s ' + _j(['', btn('Sunshine Arms', 'gold', '/trigger pl_shop set 99', 'Guns, ammo and armor'), '  ',
                            btn('Coastline Motors', 'aqua', '/trigger pl_shop set 98', 'Buy a car'), '  ',
                            btn('Jobs', 'red', '/trigger pl_job set 99', 'Make money'), '  ',
                            btn('Stats', 'gray', '/trigger pl_menu set 2', 'Your stats')])])
    fn('menu/stats', ['tellraw @s ' + _j(['', {'text': 'Cash $', 'color': 'green'}, {'score': {'name': '@s', 'objective': 'pl_cash'}},
                                          {'text': '   Jobs done ', 'color': 'gray'}, {'score': {'name': '@s', 'objective': 'pl_jobsdone'}},
                                          {'text': '   Crimes ', 'color': 'gray'}, {'score': {'name': '@s', 'objective': 'pl_crimes'}}])])

    # ---- shop
    lines = ['execute if score @s pl_shop matches 99 run function palmera:shop/menu_guns',
             'execute if score @s pl_shop matches 98 run function palmera:shop/menu_cars']
    for sid, label, price, key in SHOP:
        lines.append('execute if score @s pl_shop matches %d run function palmera:shop/buy {price:%d,item:"%s",label:"%s"}' % (sid, price, key, label))
        fn('shop/give_' + key, [give_cmd(key)])
    lines.append('scoreboard players set @s pl_shop 0')
    fn('shop/handle', lines)
    fn('shop/buy', [
        '$execute unless score @s pl_cash matches $(price).. run return run tellraw @s {"text":"Not enough cash for $(label) ($$(price)).","color":"red"}',
        '$scoreboard players remove @s pl_cash $(price)',
        '$function palmera:shop/give_$(item)',
        'playsound minecraft:entity.villager.yes player @s ~ ~ ~ 1 1',
        '$tellraw @s {"text":"Bought $(label) for $$(price).","color":"green"}'])

    def menu(title, color, rng):
        out = ['tellraw @s {"text":"\\n--- %s ---","color":"%s","bold":true}' % (title, color)]
        for sid, label, price, key in SHOP:
            if sid in rng:
                out.append('tellraw @s ' + _j(['', btn('BUY', 'green', '/trigger pl_shop set %d' % sid, 'Click to buy'),
                                               {'text': ' %s ' % label, 'color': 'white'}, {'text': '$%d' % price, 'color': 'gold'}]))
        return out
    fn('shop/menu_guns', menu('Sunshine Arms', 'gold', range(1, 20)))
    fn('shop/menu_cars', menu('Coastline Motors', 'aqua', range(20, 30)))

    # ---- guns
    fn('item/use', [
        'execute if items entity @s weapon.mainhand carrot_on_a_stick[custom_data~{phone:1b}] run return run function palmera:menu/open',
        'execute if score @s pl_cd matches 1.. run return 0'] +
       ['execute if items entity @s weapon.mainhand carrot_on_a_stick[custom_data~{gun:"%s"}] run return run function palmera:gun/%s' % (k, k) for k in GUNS])
    fn('gun/empty', ['playsound minecraft:block.dispenser.fail player @s ~ ~ ~ 1 1.8',
                     'title @s actionbar {"text":"Out of ammo! Buy more from Sunshine Arms.","color":"red"}',
                     'scoreboard players set @s pl_cd 10'])
    fn('gun/heat', ['execute if score @s pl_wanted matches 0 if entity @e[type=villager,tag=ped,distance=..16] run function palmera:police/shots_fired'])
    spreads = [(0, 0), (-4, -2), (4, -2), (-3, 3), (3, 3)]
    for k, (cmd, label, color, dmg, cd, rng, step, pellets, ammo) in GUNS.items():
        snd = {'pistol': ('minecraft:entity.firework_rocket.blast', 1.6), 'smg': ('minecraft:entity.firework_rocket.blast', 2.0),
               'shotgun': ('minecraft:entity.generic.explode', 1.8), 'rifle': ('minecraft:entity.firework_rocket.large_blast', 1.5),
               'rocket': ('minecraft:entity.firework_rocket.launch', 0.6)}[k]
        body = ['execute unless score @s pl_ammo matches %d.. run return run function palmera:gun/empty' % ammo,
                'scoreboard players remove @s pl_ammo %d' % ammo, 'scoreboard players set @s pl_cd %d' % cd,
                'playsound %s player @a ~ ~ ~ 1.5 %s' % snd, 'function palmera:gun/heat', 'tag @s add pl_shooter']
        for i in range(pellets):
            ry, rx = spreads[i]
            body += ['scoreboard players set #steps pl_tmp %d' % rng, 'scoreboard players set #hit pl_tmp 0',
                     'execute rotated ~%d ~%d anchored eyes positioned ^ ^ ^0.6 anchored feet run function palmera:gun/ray_%s' % (ry, rx, k)]
        body.append('tag @s remove pl_shooter')
        fn('gun/' + k, body)
        part = 'minecraft:flame' if k == 'rocket' else 'minecraft:crit'
        tgt = '@e[type=!#palmera:not_target,tag=!pl_shooter,tag=!car,distance=..1.6,sort=nearest,limit=1]'
        hit_end = 'function palmera:gun/boom' if k == 'rocket' else 'damage %s %d palmera:bullet by @s' % (tgt, dmg)
        fn('gun/ray_' + k, [
            'particle %s ~ ~ ~ 0 0 0 0 1' % part,
            'execute if block ~ ~ ~ #palmera:glass run setblock ~ ~ ~ air destroy',
            'execute positioned ~-0.5 ~-0.5 ~-0.5 if entity @e[dx=0,dy=0,dz=0,type=!#palmera:not_target,tag=!pl_shooter,tag=!car] '
            'positioned ~0.5 ~0.5 ~0.5 run return run function palmera:gun/hit_' + k,
            'execute unless block ~ ~ ~ #palmera:passable run return run function palmera:gun/stop_' + k,
            'scoreboard players remove #steps pl_tmp 1',
            'execute if score #steps pl_tmp matches 1.. positioned ^ ^ ^%s run function palmera:gun/ray_%s' % (step, k)])
        fn('gun/hit_' + k, [hit_end, 'particle minecraft:damage_indicator ~ ~ ~ 0.2 0.2 0.2 0.1 3',
                            'playsound minecraft:entity.arrow.hit_player player @s'])
        fn('gun/stop_' + k, ['function palmera:gun/boom' if k == 'rocket' else 'particle minecraft:smoke ~ ~ ~ 0.05 0.05 0.05 0.01 4'])
    fn('gun/boom', ['summon creeper ~ ~ ~ {Fuse:0s,ignited:1b,ExplosionRadius:4b,Silent:1b,Invulnerable:1b,Tags:["pl_boom"]}',
                    'particle minecraft:explosion_emitter ~ ~ ~'])

    # ---- grenades
    fn('grenade/tick', [
        'execute as @e[type=marker,tag=pl_gpos] at @s unless entity @e[type=snowball,tag=pl_gren,distance=..4] run function palmera:gun/boom',
        'kill @e[type=marker,tag=pl_gpos]',
        'execute as @e[type=snowball,tag=!pl_gchk] run function palmera:grenade/check',
        'execute as @e[type=snowball,tag=pl_gren] at @s run summon marker ~ ~ ~ {Tags:["pl_gpos"]}',
        'execute as @e[type=snowball,tag=pl_gren] at @s run particle minecraft:smoke ~ ~ ~ 0 0 0 0 1'])
    fn('grenade/check', ['tag @s add pl_gchk',
                         'execute if data entity @s Item.components."minecraft:custom_data".grenade run tag @s add pl_gren'])

    # ---- police
    fn('police/crime_ped', ['scoreboard players reset @s pl_kped', 'scoreboard players add @s pl_crimes 1',
                            'function palmera:police/add_star'])
    fn('police/crime_cop', ['scoreboard players reset @s pl_kcop1', 'scoreboard players reset @s pl_kcop2',
                            'scoreboard players reset @s pl_kcop3', 'scoreboard players add @s pl_crimes 1',
                            'function palmera:police/add_star'])
    fn('police/shots_fired', ['scoreboard players set @s pl_wanted 1', 'scoreboard players set @s pl_wcd 400',
                              'title @s actionbar {"text":"Shots fired! The police are on the way.","color":"red"}'])
    fn('police/add_star', ['scoreboard players add @s pl_wanted 1',
                           'execute if score @s pl_wanted matches 6.. run scoreboard players set @s pl_wanted 5',
                           'scoreboard players set @s pl_wcd 700',
                           'playsound minecraft:block.note_block.bell player @s ~ ~ ~ 1 0.6'])
    fn('police/cool_down', ['scoreboard players remove @s pl_wanted 1', 'scoreboard players set @s pl_wcd 600',
                            'execute if score @s pl_wanted matches 0 run tellraw @s {"text":"You lost the cops.","color":"green"}',
                            'execute unless entity @a[scores={pl_wanted=1..}] run function palmera:police/clear'])
    fn('police/clear', ['execute as @e[tag=cop] at @s run tp @s ~ -350 ~', 'kill @e[tag=cop]'])
    fn('police/cycle', ['execute as @a[scores={pl_wanted=1..},gamemode=!spectator] at @s run function palmera:police/spawn_for',
                        'schedule function palmera:police/cycle 100t replace'])
    fn('police/spawn_for', [
        'scoreboard players operation #lvl pl_g = @s pl_wanted',
        'execute store result score #c pl_tmp if entity @e[tag=cop,distance=..56]',
        'scoreboard players operation #t pl_tmp = @s pl_wanted', 'scoreboard players operation #t pl_tmp *= #2 pl_const',
        'scoreboard players add #t pl_tmp 1',
        'execute if score #c pl_tmp < #t pl_tmp run function palmera:police/spawn_one',
        'execute if score #c pl_tmp < #t pl_tmp run function palmera:police/spawn_one'])
    fn('police/spawn_one', ['summon marker ~ ~ ~ {Tags:["pl_cspot"]}',
                            'spreadplayers ~ ~ 2 26 under 90 false @e[type=marker,tag=pl_cspot]',
                            'execute as @e[type=marker,tag=pl_cspot] at @s run function palmera:police/place',
                            'kill @e[type=marker,tag=pl_cspot]'])
    fn('police/place', [
        'execute if entity @a[distance=..7] run return 0',
        'execute store result score #r pl_tmp run random value 1..10',
        'execute if score #lvl pl_g matches 5 if score #r pl_tmp matches 1..2 run return run ' + CHOPPER,
        'execute if score #lvl pl_g matches 3.. if score #r pl_tmp matches 3..6 run return run ' + SWAT,
        COP])

    # ---- pedestrians
    fn('npc/cycle', ['execute as @a[gamemode=!spectator] at @s run function palmera:npc/around',
                     'execute as @e[type=villager,tag=ped] at @s unless entity @a[distance=..80] run function palmera:npc/despawn',
                     'schedule function palmera:npc/cycle 40t replace'])
    fn('npc/around', ['execute store result score #c pl_tmp if entity @e[type=villager,tag=ped,distance=..48]',
                      'execute if score #c pl_tmp matches ..13 run function palmera:npc/try',
                      'execute if score #c pl_tmp matches ..8 run function palmera:npc/try'])
    fn('npc/try', ['summon marker ~ ~ ~ {Tags:["pl_pspot"]}',
                   'spreadplayers ~ ~ 2 34 under 72 false @e[type=marker,tag=pl_pspot]',
                   'execute as @e[type=marker,tag=pl_pspot] at @s run function palmera:npc/place',
                   'kill @e[type=marker,tag=pl_pspot]'])
    fn('npc/place', ['execute if entity @a[distance=..12] run return 0',
                     'execute unless entity @s[y=62,dy=5] run return 0',
                     'execute unless block ~ ~-1 ~ #palmera:walkable run return 0',
                     'execute unless block ~ ~ ~ #palmera:passable run return 0',
                     'execute store result score #r pl_tmp run random value 0..%d' % (len(PED_NAMES) - 1),
                     'function palmera:npc/variant'])
    var = []
    for i, nm in enumerate(PED_NAMES):
        vt = VTYPES[i % len(VTYPES)]
        prof = 'nitwit' if i % 3 == 0 else 'none'
        var.append('execute if score #r pl_tmp matches %d run summon villager ~ ~ ~ {Tags:["ped"],CustomName:%s,'
                   'VillagerData:{type:"minecraft:%s",profession:"minecraft:%s",level:1},DeathLootTable:"palmera:entities/cash_small"}'
                   % (i, name(nm, 'white'), vt, prof))
    fn('npc/variant', var)
    fn('npc/despawn', ['tp @s ~ -350 ~', 'kill @s'])

    # ---- cars
    fn('car/tick', ['execute as @e[type=horse,tag=car] at @s run function palmera:car/sync',
                    'kill @e[type=block_display,tag=car_part,tag=!car_seen]',
                    'tag @e[type=block_display,tag=car_seen] remove car_seen'])
    fn('car/sync', ['scoreboard players operation #cid pl_g = @s pl_car',
                    'execute as @e[type=block_display,tag=car_part,distance=..8] if score @s pl_car = #cid pl_g run function palmera:car/part'])
    fn('car/part', ['tp @s ~ ~ ~ ~ 0', 'tag @s add car_seen'])
    for kind in ('sedan', 'sports'):
        fn('car/buy_' + kind, [
            'scoreboard players operation #cid pl_g = @s pl_car',
            'execute if score #cid pl_g matches 1.. as @e[tag=car_any] if score @s pl_car = #cid pl_g at @s run tp @s ~ -350 ~',
            'execute if score #cid pl_g matches 1.. as @e[tag=car_any] if score @s pl_car = #cid pl_g run kill @s',
            'scoreboard players add #nextcar pl_g 1', 'scoreboard players operation @s pl_car = #nextcar pl_g',
            'execute store result score #r pl_tmp run random value 0..%d' % (len(CAR_COLORS) - 1),
            'execute rotated ~ 0 positioned ^ ^ ^4 run function palmera:car/%s_pick' % kind,
            'scoreboard players operation @e[tag=car_new] pl_car = #nextcar pl_g',
            'tag @e[tag=car_new] remove car_new',
            'tellraw @s {"text":"Your car is parked in front of you. Right-click it to get in.","color":"aqua"}'])
        fn('car/%s_pick' % kind, ['execute if score #r pl_tmp matches %d run function palmera:car/%s_%s' % (i, kind, c)
                                  for i, c in enumerate(CAR_COLORS)])
        for c in CAR_COLORS:
            fn('car/%s_%s' % (kind, c), car_model(kind, c))

    # ---- jobs
    jobs = job_defs(P)
    lines = ['execute if score @s pl_job matches 99 run function palmera:job/list',
             'execute if score @s pl_job matches 50 if entity @s[tag=pl_jobowner] run function palmera:job/fail']
    for j in jobs:
        lines.append('execute if score @s pl_job matches %d run function palmera:job/start_%d' % (j['id'], j['id']))
    lines.append('scoreboard players set @s pl_job 0')
    fn('job/handle', lines)
    lst = ['tellraw @s {"text":"\\n--- Jobs ---","color":"red","bold":true}']
    for j in jobs:
        lst.append('tellraw @s ' + _j(['', btn('START', 'red', '/trigger pl_job set %d' % j['id'], j['desc']),
                                       {'text': ' %s ' % j['title'], 'color': 'white'},
                                       {'text': '(%s) ' % j['where'], 'color': 'gray'}, {'text': '$%d' % j['reward'], 'color': 'gold'}]))
    lst.append('tellraw @s ' + _j(['', btn('CANCEL CURRENT JOB', 'dark_gray', '/trigger pl_job set 50', 'Give up')]))
    fn('job/list', lst)
    tick = []
    for j in jobs:
        x, y, z = j['spot']
        jid = j['id']
        fn('job/start_%d' % jid, [
            'execute if score #job pl_g matches 1.. run return run tellraw @s {"text":"A job is already running. Finish or cancel it first.","color":"red"}',
            'scoreboard players set #job pl_g %d' % jid, 'scoreboard players set #jobsp pl_g 0', 'tag @s add pl_jobowner',
            'give @s compass[lodestone_tracker={target:{pos:[I;%d,%d,%d],dimension:"minecraft:overworld"},tracked:false},'
            'custom_data={jobgps:1b},custom_name=%s] 1' % (x, y, z, name('Job GPS: ' + j['title'], 'red')),
            'title @s times 10 60 20', 'title @s title %s' % _j({'text': j['title'], 'color': 'red', 'bold': True}),
            'title @s subtitle %s' % _j({'text': j['where'], 'color': 'gray'}),
            'tellraw @s %s' % _j(['', {'text': j['desc'] + ' ', 'color': 'white'},
                                  {'text': 'Follow the Job GPS to %d %d %d.' % (x, y, z), 'color': 'gray'}])])
        tick.append('execute if score #job pl_g matches %d if score #jobsp pl_g matches 0 positioned %d %d %d '
                    'if entity @a[tag=pl_jobowner,distance=..64] run function palmera:job/spawn_%d' % (jid, x, y, z, jid))
        sp = ['scoreboard players set #jobsp pl_g 1', 'scoreboard players set #reward pl_g %d' % j['reward'],
              'tellraw @a[tag=pl_jobowner] {"text":"Here they are. Take them out!","color":"red"}']
        bk, bl, bhp = j['boss']
        sp.append('execute positioned %d %d %d run %s' % (x, y, z, mob(bk, bl, bhp, ['job_enemy'], 'palmera:entities/cash_big', 'dark_red', True)))
        for i, (gk, gl) in enumerate(j['goons']):
            ox, oz = [(2, 0), (-2, 0), (0, 2), (0, -2), (2, 2), (-2, -2), (2, -2), (-2, 2)][i % 8]
            sp.append('execute positioned %d %d %d run %s' % (x + ox, y, z + oz, mob(gk, gl, 24, ['job_enemy'], 'palmera:entities/cash')))
        fn('job/spawn_%d' % jid, sp)
    tick.append('execute if score #jobsp pl_g matches 1 unless entity @e[tag=job_enemy] run function palmera:job/complete')
    fn('job/tick', tick)
    fn('job/complete', [
        'scoreboard players operation @a[tag=pl_jobowner] pl_cash += #reward pl_g',
        'scoreboard players add @a[tag=pl_jobowner] pl_jobsdone 1',
        'execute as @a[tag=pl_jobowner] at @s run playsound minecraft:ui.toast.challenge_complete player @s',
        'title @a[tag=pl_jobowner] title {"text":"JOB COMPLETE","color":"gold","bold":true}',
        'title @a[tag=pl_jobowner] subtitle [{"text":"+$","color":"green"},{"score":{"name":"#reward","objective":"pl_g"},"color":"green"}]',
        'function palmera:job/reset'])
    fn('job/fail', ['tellraw @a[tag=pl_jobowner] {"text":"Job failed.","color":"red"}',
                    'execute as @e[tag=job_enemy] at @s run tp @s ~ -350 ~', 'kill @e[tag=job_enemy]', 'function palmera:job/reset'])
    fn('job/reset', ['clear @a[tag=pl_jobowner] compass[custom_data~{jobgps:1b}]', 'tag @a remove pl_jobowner',
                     'scoreboard players set #job pl_g 0', 'scoreboard players set #jobsp pl_g 0'])

    for path, content in F.items():
        full = os.path.join(root, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, 'w', encoding='utf-8') as f:
            f.write(content)
    return jobs


def build(world_dir, P):
    dp = os.path.join(world_dir, 'datapacks', 'palmera_life')
    jobs = build_datapack(dp, P)
    build_resource_pack(os.path.join(world_dir, 'resources.zip'))
    return jobs
