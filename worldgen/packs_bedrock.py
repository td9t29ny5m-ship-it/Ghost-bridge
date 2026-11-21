"""
Palmera Life v2 for Bedrock Edition: behavior pack (Script API, stable modules, no experiments) + resource pack.

Entities : civilians (16 skins), police, SWAT, two gangs, police cars with light bars, police helicopter,
           AI traffic you can carjack, player cars (sedan / sports), alligators, flamingos, bullets.
Gameplay : 10-mission original story, side jobs, store robberies, bank-vault heists, street races,
           wanted level 1-5 with escalating response, hospitals, safehouses with income, bank account,
           lawyer, GPS waypoints, social feed, 9 weapons, cash drops.
"""
import io
import json
import math
import random
import uuid
import zipfile

from PIL import Image

import packs as javapacks

MIN_ENGINE = [1, 21, 0]
SERVER_VER = '1.11.0'
UI_VER = '1.2.0'


def U(name):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'palmera-life/' + name))


def J(o):
    return json.dumps(o, indent=1, ensure_ascii=False)


def png(im):
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


# --------------------------------------------------------------------------- items
SPRITES = dict(javapacks.SPRITES)
SPRITES['sniper'] = [
    '................', '................', '.....KKK........', '....K...K.......',
    '#DDDDDDDDDDDDDDD', '##SSSSSSSSSSS...', '###DDDD.........', '.##..K..........',
    '.....KK.........', '................', '................', '................',
    '................', '................', '................', '................']
SPRITES['minigun'] = [
    '................', '................', '................', '..DDDDDDDDDDDDD.',
    '.DDSSSSSSSSSSSSS', '.DDDDDDDDDDDDDD.', '.DDSSSSSSSSSSSSS', '..DDDDDDDDDDDDD.',
    '...YY.K.........', '...YY.KK........', '................', '................',
    '................', '................', '................', '................']
ITEMS = {
    'pistol': ('Pistol', 1, True), 'smg': ('SMG', 1, True), 'shotgun': ('Pump Shotgun', 1, True),
    'rifle': ('Assault Rifle', 1, True), 'sniper': ('Sniper Rifle', 1, True), 'minigun': ('Minigun', 1, True),
    'rocket': ('Rocket Launcher', 1, True), 'phone': ('Phone', 1, False), 'grenade': ('Grenade', 16, False),
    'cash': ('Cash', 64, False), 'bat': ('Baseball Bat', 1, True),
}
GUNS = {
    #           dmg  cd  range pellets ammo spread  sound                pitch explode
    'pistol': (6, 5, 45, 1, 1, 0.01, 'firework.blast', 1.6, 0),
    'smg': (4, 2, 40, 1, 1, 0.04, 'firework.blast', 2.0, 0),
    'shotgun': (4, 16, 16, 6, 1, 0.12, 'random.explode', 1.8, 0),
    'rifle': (7, 3, 70, 1, 1, 0.015, 'firework.large_blast', 1.5, 0),
    'sniper': (20, 30, 140, 1, 1, 0.0, 'firework.large_blast', 0.8, 0),
    'minigun': (3, 1, 50, 2, 1, 0.07, 'firework.blast', 2.2, 0),
    'rocket': (0, 30, 90, 1, 5, 0.0, 'firework.launch', 0.6, 4),
}
#            mag  reload  auto   recoil
GUN_EXTRA = {'pistol': (12, 25, False, 0.08), 'smg': (30, 35, True, 0.05), 'shotgun': (6, 45, False, 0.25),
             'rifle': (30, 40, True, 0.08), 'sniper': (5, 50, False, 0.3), 'minigun': (200, 80, True, 0.04),
             'rocket': (1, 60, False, 0.4)}
SHOP = [
    ('pistol', 'Pistol', 500, 'arms'), ('smg', 'SMG', 2500, 'arms'), ('shotgun', 'Pump Shotgun', 3500, 'arms'),
    ('rifle', 'Assault Rifle', 7500, 'arms'), ('sniper', 'Sniper Rifle', 12000, 'arms'),
    ('minigun', 'Minigun', 45000, 'arms'), ('rocket', 'Rocket Launcher', 25000, 'arms'),
    ('ammo', 'Ammo x60', 150, 'arms'), ('ammo300', 'Ammo x300', 650, 'arms'), ('grenade', 'Grenades x4', 600, 'arms'),
    ('armor', 'Body Armor', 1500, 'arms'), ('medkit', 'Medkits x3', 300, 'arms'), ('bat', 'Baseball Bat', 100, 'arms'),
    ('car_sedan', 'Sedan', 4000, 'cars'), ('car_sports', 'Sports Car', 15000, 'cars'),
]


# --------------------------------------------------------------------------- HUD glyphs + app icons
def glyph_sheet():
    """font/glyph_E1.png: 16x16 cells. 00-05 map tiles, 08-0F player arrows, 10 cop, 11 target, 13 gang, 14 void,
    20 cash, 21 star, 22 star-off, 23 ammo, 24 heart, 25 speed, 26 phone, 27 hitmarker, 28 skull."""
    from PIL import ImageDraw
    im = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    def cell(i):
        return (i % 16) * 16, (i // 16) * 16
    tiles = [(76, 140, 60), (40, 110, 200), (70, 70, 78), (200, 200, 205), (225, 210, 150), (70, 80, 55)]
    for i, c in enumerate(tiles):
        x, y = cell(i)
        d.rectangle([x, y, x + 15, y + 15], fill=c + (230,))
        if i == 2:
            d.line([x, y + 8, x + 15, y + 8], fill=(240, 220, 80, 255))
        if i == 3:
            for k in range(2, 14, 4):
                d.rectangle([x + k, y + 3, x + k + 1, y + 12], fill=(150, 190, 220, 255))
    import math as _m
    for k in range(8):
        x, y = cell(8 + k)
        d.rectangle([x, y, x + 15, y + 15], fill=(20, 20, 25, 230))
        ang = _m.radians(90 + 45 * k)             # 0 = down (south)
        cx, cy = x + 7.5, y + 7.5
        tip = (cx + 7 * _m.cos(ang), cy + 7 * _m.sin(ang))
        l = (cx + 6 * _m.cos(ang + 2.5), cy + 6 * _m.sin(ang + 2.5))
        r = (cx + 6 * _m.cos(ang - 2.5), cy + 6 * _m.sin(ang - 2.5))
        d.polygon([tip, l, (cx, cy), r], fill=(255, 255, 255, 255))
    for i, c in ((0x10, (255, 40, 40)), (0x13, (190, 60, 220))):
        x, y = cell(i)
        d.rectangle([x, y, x + 15, y + 15], fill=(20, 20, 25, 200))
        d.ellipse([x + 3, y + 3, x + 12, y + 12], fill=c + (255,))
        if i == 0x10:
            d.ellipse([x + 7, y + 3, x + 12, y + 12], fill=(40, 90, 255, 255))
    x, y = cell(0x11)
    d.rectangle([x, y, x + 15, y + 15], fill=(20, 20, 25, 200))
    d.polygon([(x + 8, y + 1), (x + 10, y + 6), (x + 15, y + 6), (x + 11, y + 9), (x + 13, y + 15), (x + 8, y + 11),
               (x + 3, y + 15), (x + 5, y + 9), (x + 1, y + 6), (x + 6, y + 6)], fill=(255, 220, 40, 255))
    x, y = cell(0x14)
    d.rectangle([x, y, x + 15, y + 15], fill=(15, 30, 60, 220))
    def star(i, col):
        x, y = cell(i)
        d.polygon([(x + 8, y + 1), (x + 10, y + 6), (x + 15, y + 6), (x + 11, y + 9), (x + 13, y + 15), (x + 8, y + 11),
                   (x + 3, y + 15), (x + 5, y + 9), (x + 1, y + 6), (x + 6, y + 6)], fill=col)
    star(0x21, (255, 215, 40, 255))
    star(0x22, (90, 90, 90, 200))
    x, y = cell(0x20)
    d.rectangle([x + 1, y + 4, x + 14, y + 11], fill=(60, 160, 60, 255), outline=(30, 90, 30, 255))
    d.ellipse([x + 5, y + 5, x + 10, y + 10], fill=(200, 240, 200, 255))
    x, y = cell(0x23)
    for k in range(3):
        d.rectangle([x + 2 + k * 4, y + 5, x + 4 + k * 4, y + 14], fill=(220, 180, 60, 255))
        d.rectangle([x + 2 + k * 4, y + 3, x + 4 + k * 4, y + 5], fill=(180, 120, 50, 255))
    x, y = cell(0x24)
    d.polygon([(x + 8, y + 14), (x + 1, y + 6), (x + 4, y + 2), (x + 8, y + 5), (x + 12, y + 2), (x + 15, y + 6)], fill=(230, 40, 60, 255))
    x, y = cell(0x25)
    d.arc([x + 1, y + 2, x + 15, y + 16], 180, 360, fill=(255, 255, 255, 255), width=2)
    d.line([x + 8, y + 9, x + 12, y + 4], fill=(255, 80, 60, 255), width=2)
    x, y = cell(0x26)
    d.rectangle([x + 4, y + 1, x + 11, y + 14], fill=(30, 30, 35, 255))
    d.rectangle([x + 5, y + 3, x + 10, y + 11], fill=(90, 200, 240, 255))
    x, y = cell(0x27)
    for a_, b_ in (((x + 1, y + 1), (x + 5, y + 5)), ((x + 14, y + 1), (x + 10, y + 5)), ((x + 1, y + 14), (x + 5, y + 10)), ((x + 14, y + 14), (x + 10, y + 10))):
        d.line([a_, b_], fill=(255, 255, 255, 255), width=2)
    x, y = cell(0x28)
    d.ellipse([x + 2, y + 1, x + 13, y + 11], fill=(240, 240, 240, 255))
    d.rectangle([x + 5, y + 10, x + 10, y + 14], fill=(240, 240, 240, 255))
    d.ellipse([x + 4, y + 4, x + 6, y + 7], fill=(20, 20, 20, 255))
    d.ellipse([x + 9, y + 4, x + 11, y + 7], fill=(20, 20, 20, 255))
    return im


APPS = {'story': ((200, 60, 180), 'S'), 'jobs': ((220, 60, 60), '$'), 'arms': ((230, 150, 30), 'G'),
        'cars': ((40, 150, 230), 'C'), 'estate': ((60, 170, 80), 'H'), 'bank': ((30, 120, 130), 'B'),
        'gps': ((240, 240, 240), 'N'), 'lawyer': ((40, 60, 160), 'L'), 'feed': ((150, 60, 220), 'F'),
        'stats': ((110, 110, 120), 'i'), 'settings': ((90, 90, 95), '*')}


def app_icon(col, letter):
    from PIL import ImageDraw
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([1, 1, 30, 30], radius=7, fill=col + (255,))
    d.rounded_rectangle([1, 1, 30, 15], radius=7, fill=tuple(min(255, c + 35) for c in col) + (255,))
    fg = (30, 30, 30, 255) if sum(col) > 600 else (255, 255, 255, 255)
    d.text((10, 6), letter, fill=fg, font_size=20) if hasattr(d, 'text') else None
    return im


# --------------------------------------------------------------------------- skins (64x64 humanoid layout)
def skin(skin_c, hair, shirt, pants, shoes, extra=None, hat=None):
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    def r(x0, y0, x1, y1, c):
        for x in range(x0, x1):
            for y in range(y0, y1):
                im.putpixel((x, y), tuple(c) + (255,))
    r(0, 0, 32, 16, skin_c)
    r(8, 0, 16, 8, hair)
    r(0, 8, 32, 10, hair)
    r(24, 8, 32, 14, hair)
    for ex in (9, 13):
        r(ex, 12, ex + 2, 13, (245, 245, 245))
        r(ex + (1 if ex == 9 else 0), 12, ex + (2 if ex == 9 else 1), 13, (40, 30, 30))
    r(11, 14, 13, 15, tuple(max(0, c - 50) for c in skin_c))
    r(16, 16, 40, 32, shirt)
    for (x0, y0) in ((40, 16), (32, 48)):
        r(x0, y0, x0 + 16, y0 + 16, skin_c)
        r(x0 + 4, y0, x0 + 8, y0 + 4, shirt)
        r(x0, y0 + 4, x0 + 16, y0 + 8, shirt)
    for (x0, y0) in ((0, 16), (16, 48)):
        r(x0, y0, x0 + 16, y0 + 16, pants)
        r(x0, y0 + 13, x0 + 16, y0 + 16, shoes)
        r(x0 + 8, y0, x0 + 12, y0 + 4, shoes)
    if extra == 'badge':
        r(22, 22, 24, 24, (240, 200, 40))
        r(20, 20, 28, 21, (20, 20, 30))
    if extra == 'vest':
        r(20, 21, 28, 30, (60, 60, 60))
        r(32, 21, 40, 30, (60, 60, 60))
    if extra == 'stripe':
        r(20, 24, 28, 26, (255, 255, 255))
    if hat:
        r(8, 0, 16, 8, hat)
        r(0, 8, 32, 10, hat)
        r(8, 8, 16, 9, (10, 10, 10))
    return im


SKINS_T = [(255, 220, 185), (240, 195, 150), (200, 150, 105), (160, 110, 70), (110, 75, 50), (80, 55, 40)]
HAIR = [(30, 25, 20), (90, 60, 30), (200, 170, 90), (150, 60, 30), (220, 220, 220), (20, 20, 20)]
SHIRTS = [(230, 80, 120), (60, 170, 220), (255, 255, 255), (250, 210, 60), (90, 200, 120), (240, 140, 50),
          (150, 90, 200), (40, 40, 45), (220, 60, 60), (60, 200, 200), (255, 180, 200), (120, 160, 90)]
PANTS = [(40, 60, 120), (30, 30, 35), (200, 180, 140), (90, 90, 95), (60, 90, 160), (240, 240, 240)]


def civilian_skins(n=16):
    r = random.Random(7)
    return [skin(r.choice(SKINS_T), r.choice(HAIR), r.choice(SHIRTS), r.choice(PANTS),
                 r.choice([(250, 250, 250), (30, 30, 30), (180, 60, 40)]), r.choice([None, None, 'stripe'])) for _ in range(n)]


def cop_skins():
    return [skin(SKINS_T[i], HAIR[i], (30, 45, 110), (25, 30, 60), (15, 15, 15), 'badge', hat=(25, 35, 90)) for i in (0, 3, 1)]


def swat_skins():
    return [skin(SKINS_T[2], HAIR[0], (30, 30, 32), (30, 30, 32), (15, 15, 15), 'vest', hat=(20, 20, 22))]


def gang_skins():
    r = random.Random(9)
    saints = [skin(r.choice(SKINS_T), r.choice(HAIR), (200, 40, 180), (30, 30, 35), (240, 240, 240), hat=(200, 40, 180)) for _ in range(3)]
    kings = [skin(r.choice(SKINS_T), r.choice(HAIR), (60, 120, 40), (90, 80, 50), (60, 40, 20), hat=(60, 120, 40)) for _ in range(3)]
    return saints + kings


# --------------------------------------------------------------------------- geometry
def box(o, s, uv, inflate=0):
    c = {'origin': o, 'size': s, 'uv': uv}
    if inflate:
        c['inflate'] = inflate
    return c


HUMANOID_GEO = {'format_version': '1.12.0', 'minecraft:geometry': [{
    'description': {'identifier': 'geometry.palmera_npc', 'texture_width': 64, 'texture_height': 64,
                    'visible_bounds_width': 2, 'visible_bounds_height': 3, 'visible_bounds_offset': [0, 1.5, 0]},
    'bones': [
        {'name': 'root', 'pivot': [0, 0, 0]},
        {'name': 'body', 'parent': 'root', 'pivot': [0, 24, 0], 'cubes': [box([-4, 12, -2], [8, 12, 4], [16, 16])]},
        {'name': 'head', 'parent': 'body', 'pivot': [0, 24, 0], 'cubes': [box([-4, 24, -4], [8, 8, 8], [0, 0]), box([-4, 24, -4], [8, 8, 8], [32, 0], 0.5)]},
        {'name': 'rightArm', 'parent': 'body', 'pivot': [-5, 22, 0], 'cubes': [box([-8, 12, -2], [4, 12, 4], [40, 16])]},
        {'name': 'rightItem', 'parent': 'rightArm', 'pivot': [-6, 15, 1]},
        {'name': 'leftArm', 'parent': 'body', 'pivot': [5, 22, 0], 'cubes': [box([4, 12, -2], [4, 12, 4], [32, 48])]},
        {'name': 'rightLeg', 'parent': 'root', 'pivot': [-1.9, 12, 0], 'cubes': [box([-3.9, 0, -2], [4, 12, 4], [0, 16])]},
        {'name': 'leftLeg', 'parent': 'root', 'pivot': [1.9, 12, 0], 'cubes': [box([-0.1, 0, -2], [4, 12, 4], [16, 48])]},
    ]}]}

SW = {'body': (0, 0), 'glass': (8, 0), 'tire': (16, 0), 'light': (24, 0), 'tail': (0, 8), 'chrome': (8, 8),
      'red': (16, 8), 'blue': (24, 8), 'black': (0, 16), 'white': (8, 16), 'pink': (16, 16), 'green': (24, 16),
      'dark': (0, 24), 'yellow': (8, 24)}


def face_uv(key):
    u, v = SW[key]
    return {f: {'uv': [u, v], 'uv_size': [4, 4]} for f in ('north', 'south', 'east', 'west', 'up', 'down')}


def cube(o, s, key, pivot=None, rot=None):
    c = {'origin': o, 'size': s, 'uv': face_uv(key)}
    if rot:
        c['pivot'], c['rotation'] = pivot, rot
    return c


def geo(ident, bones, w=6, h=3):
    return {'format_version': '1.12.0', 'minecraft:geometry': [{
        'description': {'identifier': ident, 'texture_width': 32, 'texture_height': 32,
                        'visible_bounds_width': w, 'visible_bounds_height': h, 'visible_bounds_offset': [0, 1, 0]},
        'bones': bones}]}


def car_cubes(kind):
    if kind == 'sports':
        cubes = [cube([-16, 2, -36], [32, 8, 72], 'body'), cube([-13, 10, -6], [26, 7, 24], 'glass'),
                 cube([-16, 14, 30], [32, 1, 6], 'body'), cube([-12, 10, 32], [2, 4, 2], 'tire'),
                 cube([10, 10, 32], [2, 4, 2], 'tire'), cube([-16, 2, -37], [32, 2, 1], 'chrome'),
                 cube([-14, 6, -37], [8, 2, 1], 'light'), cube([6, 6, -37], [8, 2, 1], 'light'),
                 cube([-14, 6, 36], [8, 2, 1], 'tail'), cube([6, 6, 36], [8, 2, 1], 'tail')]
    else:
        cubes = [cube([-16, 3, -34], [32, 11, 68], 'body'), cube([-14, 14, -12], [28, 11, 32], 'glass'),
                 cube([-14, 25, -12], [28, 1, 32], 'body'), cube([-16, 3, -35], [32, 3, 1], 'chrome'),
                 cube([-16, 3, 34], [32, 3, 1], 'chrome'),
                 cube([-13, 8, -35], [7, 3, 1], 'light'), cube([6, 8, -35], [7, 3, 1], 'light'),
                 cube([-13, 9, 34], [7, 2, 1], 'tail'), cube([6, 9, 34], [7, 2, 1], 'tail')]
    for x in (-17, 13):
        for z in (-26, 17):
            cubes.append(cube([x, 0, z], [4, 9, 9], 'tire'))
    return cubes


CAR_GEO = geo('geometry.palmera_car', [{'name': 'body', 'pivot': [0, 0, 0], 'cubes': car_cubes('car')}])
SPORTS_GEO = geo('geometry.palmera_sports', [{'name': 'body', 'pivot': [0, 0, 0], 'cubes': car_cubes('sports')}])
POLICE_GEO = geo('geometry.palmera_police_car', [
    {'name': 'body', 'pivot': [0, 0, 0], 'cubes': car_cubes('car') + [cube([-16.1, 8, -10], [32.2, 4, 22], 'black')]},
    {'name': 'bar', 'pivot': [0, 26, 0], 'cubes': [cube([-10, 26, -3], [20, 2, 5], 'black')]},
    {'name': 'red_light', 'parent': 'bar', 'pivot': [-5, 28, 0], 'cubes': [cube([-9, 28, -2], [8, 2, 3], 'red')]},
    {'name': 'blue_light', 'parent': 'bar', 'pivot': [5, 28, 0], 'cubes': [cube([1, 28, -2], [8, 2, 3], 'blue')]},
])
HELI_GEO = geo('geometry.palmera_heli', [
    {'name': 'body', 'pivot': [0, 0, 0], 'cubes': [
        cube([-14, 10, -24], [28, 26, 40], 'body'), cube([-12, 16, -26], [24, 18, 2], 'glass'),
        cube([-4, 24, 16], [8, 8, 52], 'body'), cube([-1, 24, 64], [2, 22, 8], 'white'),
        cube([-18, 0, -20], [3, 3, 36], 'black'), cube([15, 0, -20], [3, 3, 36], 'black'),
        cube([-17, 3, -12], [2, 8, 2], 'black'), cube([15, 3, -12], [2, 8, 2], 'black'),
        cube([-17, 3, 8], [2, 8, 2], 'black'), cube([15, 3, 8], [2, 8, 2], 'black'),
        cube([-14.1, 18, -10], [28.2, 4, 24], 'white'), cube([-2, 36, -2], [4, 4, 4], 'dark')]},
    {'name': 'rotor', 'parent': 'body', 'pivot': [0, 41, 0], 'cubes': [
        cube([-60, 40, -2], [120, 1, 4], 'dark'), cube([-2, 40, -60], [4, 1, 120], 'dark')]},
    {'name': 'tail_rotor', 'parent': 'body', 'pivot': [2, 40, 68], 'cubes': [cube([2, 32, 67], [1, 16, 2], 'dark')]},
], w=10, h=5)
GATOR_GEO = geo('geometry.palmera_gator', [
    {'name': 'body', 'pivot': [0, 4, 0], 'cubes': [cube([-6, 2, -14], [12, 6, 26], 'green'),
                                                    cube([-5, 8, -12], [10, 1, 22], 'dark')]},
    {'name': 'head', 'parent': 'body', 'pivot': [0, 5, -14], 'cubes': [
        cube([-4, 3, -30], [8, 4, 16], 'green'), cube([-4, 2, -30], [8, 1, 16], 'yellow'),
        cube([-3, 7, -17], [2, 2, 2], 'yellow'), cube([1, 7, -17], [2, 2, 2], 'yellow')]},
    {'name': 'tail', 'parent': 'body', 'pivot': [0, 5, 12], 'cubes': [cube([-4, 3, 12], [8, 4, 14], 'green'),
                                                                     cube([-2, 3, 26], [4, 3, 12], 'green')]},
    {'name': 'leg0', 'parent': 'body', 'pivot': [-6, 3, -9], 'cubes': [cube([-9, 0, -11], [3, 3, 4], 'green')]},
    {'name': 'leg1', 'parent': 'body', 'pivot': [6, 3, -9], 'cubes': [cube([6, 0, -11], [3, 3, 4], 'green')]},
    {'name': 'leg2', 'parent': 'body', 'pivot': [-6, 3, 8], 'cubes': [cube([-9, 0, 6], [3, 3, 4], 'green')]},
    {'name': 'leg3', 'parent': 'body', 'pivot': [6, 3, 8], 'cubes': [cube([6, 0, 6], [3, 3, 4], 'green')]},
], w=3, h=2)
FLAMINGO_GEO = geo('geometry.palmera_flamingo', [
    {'name': 'body', 'pivot': [0, 18, 0], 'cubes': [cube([-3, 16, -5], [6, 6, 10], 'pink')]},
    {'name': 'neck', 'parent': 'body', 'pivot': [0, 20, -4], 'cubes': [cube([-1, 20, -6], [2, 10, 2], 'pink')]},
    {'name': 'head', 'parent': 'neck', 'pivot': [0, 30, -5], 'cubes': [cube([-1.5, 29, -7], [3, 3, 4], 'pink'),
                                                                    cube([-0.5, 28, -10], [1, 2, 3], 'black')]},
    {'name': 'leg0', 'parent': 'body', 'pivot': [-1, 16, 0], 'cubes': [cube([-1.5, 0, -0.5], [1, 16, 1], 'pink')]},
    {'name': 'leg1', 'parent': 'body', 'pivot': [1, 16, 0], 'cubes': [cube([0.5, 0, -0.5], [1, 16, 1], 'pink')]},
], w=2, h=3)


def swatch_tex(body, extra=None):
    im = Image.new('RGBA', (32, 32), (0, 0, 0, 255))
    cols = {'body': body, 'glass': (30, 40, 55), 'tire': (18, 18, 20), 'light': (255, 250, 210), 'tail': (220, 20, 20),
            'chrome': (200, 200, 205), 'red': (255, 30, 30), 'blue': (40, 90, 255), 'black': (15, 15, 18),
            'white': (240, 240, 240), 'pink': (250, 120, 170), 'green': (70, 95, 45), 'dark': (35, 40, 30),
            'yellow': (225, 215, 150)}
    if extra:
        cols.update(extra)
    for k, (u, v) in SW.items():
        for x in range(u, u + 4):
            for y in range(v, v + 4):
                im.putpixel((x, y), tuple(cols[k]) + (255,))
    return im


CAR_COLORS = [(200, 30, 30), (40, 70, 200), (235, 235, 235), (25, 25, 28), (240, 200, 30),
              (90, 200, 40), (240, 120, 20), (200, 50, 180), (30, 180, 200), (150, 150, 155)]

# --------------------------------------------------------------------------- animations
WALK = ('math.cos(query.modified_distance_moved * 38.17) * {a} * query.modified_move_speed')
ANIMS = {'format_version': '1.8.0', 'animations': {
    'animation.palmera.npc.walk': {'loop': True, 'bones': {
        'rightArm': {'rotation': [WALK.format(a=40.0), 0, 0]}, 'leftArm': {'rotation': ['-' + WALK.format(a=40.0), 0, 0]},
        'rightLeg': {'rotation': ['-' + WALK.format(a=45.0), 0, 0]}, 'leftLeg': {'rotation': [WALK.format(a=45.0), 0, 0]}}},
    'animation.palmera.npc.idle': {'loop': True, 'bones': {
        'rightArm': {'rotation': [0, 0, 'math.cos(query.life_time * 103) * 2.5 + 2.5']},
        'leftArm': {'rotation': [0, 0, '-math.cos(query.life_time * 103) * 2.5 - 2.5']},
        'body': {'scale': [1, '1 + math.sin(query.life_time * 120) * 0.006', 1]}}},
    'animation.palmera.npc.look': {'loop': True, 'bones': {'head': {'rotation': ['query.target_x_rotation', 'query.target_y_rotation', 0]}}},
    'animation.palmera.npc.aim': {'loop': True, 'bones': {'rightArm': {'rotation': ['-85.0 + query.target_x_rotation', 'query.target_y_rotation', 0]}}},
    'animation.palmera.quad.walk': {'loop': True, 'bones': {
        'leg0': {'rotation': [WALK.format(a=50.0), 0, 0]}, 'leg3': {'rotation': [WALK.format(a=50.0), 0, 0]},
        'leg1': {'rotation': ['-' + WALK.format(a=50.0), 0, 0]}, 'leg2': {'rotation': ['-' + WALK.format(a=50.0), 0, 0]},
        'tail': {'rotation': [0, 'math.sin(query.life_time * 120) * 12', 0]}}},
    'animation.palmera.flamingo.walk': {'loop': True, 'bones': {
        'leg0': {'rotation': [WALK.format(a=35.0), 0, 0]}, 'leg1': {'rotation': ['-' + WALK.format(a=35.0), 0, 0]},
        'neck': {'rotation': ['math.sin(query.life_time * 90) * 6', 0, 0]}}},
    'animation.palmera.heli.rotor': {'loop': True, 'bones': {
        'rotor': {'rotation': [0, 'query.life_time * 1440', 0]}, 'tail_rotor': {'rotation': ['query.life_time * 1440', 0, 0]}}},
    'animation.palmera.police.lights': {'loop': True, 'bones': {
        'red_light': {'scale': 'math.mod(math.floor(query.life_time * 6), 2) == 0 ? 1.0 : 0.05'},
        'blue_light': {'scale': 'math.mod(math.floor(query.life_time * 6), 2) == 1 ? 1.0 : 0.05'}}},
}}


# --------------------------------------------------------------------------- entity definitions
def variants(n, prefix='s'):
    groups = {'%s%d' % (prefix, i): {'minecraft:variant': {'value': i}} for i in range(n)}
    spawn = {'randomize': [{'weight': 1, 'add': {'component_groups': ['%s%d' % (prefix, i)]}} for i in range(n)]}
    return groups, spawn


def target_wanted(radius=40):
    return {'priority': 2, 'reselect_targets': True, 'within_radius': radius, 'must_see': False, 'entity_types': [
        {'filters': {'all_of': [{'test': 'is_family', 'subject': 'other', 'value': 'player'},
                                {'test': 'has_tag', 'subject': 'other', 'value': 'wanted'}]}, 'max_dist': radius}]}


def target_tag(tag, radius=24):
    return {'priority': 2, 'reselect_targets': True, 'within_radius': radius, 'must_see': True, 'entity_types': [
        {'filters': {'all_of': [{'test': 'is_family', 'subject': 'other', 'value': 'player'},
                                {'test': 'has_tag', 'subject': 'other', 'value': tag}]}, 'max_dist': radius}]}


def npc(ident, family, hp, speed, nskins, kind):
    groups, spawn = variants(nskins)
    c = {
        'minecraft:type_family': {'family': family + ['mob', 'palmera_npc']},
        'minecraft:collision_box': {'width': 0.6, 'height': 1.9},
        'minecraft:health': {'value': hp, 'max': hp},
        'minecraft:movement': {'value': speed}, 'minecraft:movement.basic': {},
        'minecraft:navigation.walk': {'avoid_water': True, 'can_open_doors': True, 'avoid_damage_blocks': True},
        'minecraft:jump.static': {}, 'minecraft:can_climb': {}, 'minecraft:physics': {},
        'minecraft:pushable': {'is_pushable': True, 'is_pushable_by_piston': True},
        'minecraft:breathable': {'total_supply': 15, 'suffocate_time': 0},
        'minecraft:nameable': {'always_show': False},
        'minecraft:behavior.float': {'priority': 0},
        'minecraft:behavior.random_stroll': {'priority': 7, 'speed_multiplier': 0.8},
        'minecraft:behavior.look_at_player': {'priority': 8, 'look_distance': 6, 'probability': 0.02},
        'minecraft:behavior.random_look_around': {'priority': 9},
        'minecraft:conditional_bandwidth_optimization': {},
        'minecraft:damage_sensor': {'triggers': [{'cause': 'fall', 'damage_multiplier': 0.5}]},
    }
    if kind == 'civilian':
        c['minecraft:behavior.panic'] = {'priority': 1, 'speed_multiplier': 1.7}
        c['minecraft:preferred_path'] = {'max_fall_blocks': 1, 'jump_cost': 5, 'default_block_cost': 3,
                                         'preferred_path_blocks': [{'cost': 0, 'blocks': ['smooth_stone', 'sand', 'stone_bricks', 'smooth_quartz']}]}
        groups['scared'] = {
            'minecraft:behavior.avoid_mob_type': {'priority': 1, 'entity_types': [
                {'filters': {'test': 'is_family', 'subject': 'other', 'value': 'player'}, 'max_dist': 24,
                 'walk_speed_multiplier': 1.6, 'sprint_speed_multiplier': 2.0}]},
            'minecraft:timer': {'looping': False, 'time': 10, 'time_down_event': {'event': 'palmera:calm'}}}
    else:
        c['minecraft:behavior.hurt_by_target'] = {'priority': 1, 'alert_same_type': True}
        c['minecraft:behavior.ranged_attack'] = {'priority': 3, 'attack_interval_min': 0.9, 'attack_interval_max': 1.8,
                                                 'attack_radius': 18, 'burst_shots': 2 if kind != 'swat' else 3, 'burst_interval': 0.2}
        c['minecraft:shooter'] = {'def': 'palmera:bullet'}
        c['minecraft:equipment'] = {'table': 'loot_tables/entities/palmera_armed.json',
                                    'slot_drop_chance': [{'slot': 'slot.weapon.mainhand', 'drop_chance': 0.0}]}
        if kind in ('cop', 'swat'):
            c['minecraft:behavior.nearest_attackable_target'] = target_wanted(48)
        else:
            c['minecraft:behavior.nearest_attackable_target'] = target_tag('gang_heat', 28)
    events = {'minecraft:entity_spawned': spawn}
    if kind == 'civilian':
        events['palmera:scare'] = {'add': {'component_groups': ['scared']}}
        events['palmera:calm'] = {'remove': {'component_groups': ['scared']}}
    return {'format_version': '1.21.0', 'minecraft:entity': {
        'description': {'identifier': ident, 'is_spawnable': True, 'is_summonable': True, 'is_experimental': False},
        'component_groups': groups, 'components': c, 'events': events}}


def vehicle(ident, speed, hp, seat_y, ai=None, ncolors=10):
    groups = {'c%d' % i: {'minecraft:variant': {'value': i}} for i in range(ncolors)}
    c = {
        'minecraft:type_family': {'family': ['palmera_vehicle', 'inanimate'] + ([ai] if ai else [])},
        'minecraft:collision_box': {'width': 1.9, 'height': 1.3},
        'minecraft:health': {'value': hp, 'max': hp},
        'minecraft:physics': {}, 'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': True},
        'minecraft:movement': {'value': speed}, 'minecraft:movement.basic': {},
        'minecraft:navigation.walk': {'avoid_water': True}, 'minecraft:jump.static': {},
        'minecraft:variable_max_auto_step': {'base_value': 1.0625, 'jump_prevented_value': 1.0625},
        'minecraft:knockback_resistance': {'value': 1.0},
        'minecraft:damage_sensor': {'triggers': [{'cause': 'fall', 'deals_damage': False},
                                                 {'cause': 'suffocation', 'deals_damage': False}]},
        'minecraft:nameable': {}, 'minecraft:persistent': {}, 'minecraft:conditional_bandwidth_optimization': {},
    }
    if ai is None:
        c['minecraft:input_ground_controlled'] = {}
        c['minecraft:rideable'] = {'seat_count': 2, 'crouching_skip_interact': True, 'family_types': ['player'],
                                   'interact_text': 'action.interact.ride.horse',
                                   'seats': [{'position': [0.35, seat_y, 0.1]}, {'position': [-0.35, seat_y, 0.1]}]}
    elif ai == 'traffic':
        c['minecraft:behavior.random_stroll'] = {'priority': 5, 'speed_multiplier': 1.0, 'xz_dist': 24, 'y_dist': 2}
        c['minecraft:preferred_path'] = {'max_fall_blocks': 1, 'jump_cost': 20, 'default_block_cost': 30,
                                         'preferred_path_blocks': [{'cost': 0, 'blocks': ['gray_concrete', 'white_concrete', 'yellow_concrete', 'black_concrete']}]}
    elif ai == 'police_car':
        c['minecraft:behavior.nearest_attackable_target'] = target_wanted(56)
        c['minecraft:behavior.melee_attack'] = {'priority': 2, 'speed_multiplier': 1.6, 'track_target': True, 'reach_multiplier': 1.4}
        c['minecraft:attack'] = {'damage': 5}
        c['minecraft:behavior.random_stroll'] = {'priority': 8, 'speed_multiplier': 0.6}
    return {'format_version': '1.21.0', 'minecraft:entity': {
        'description': {'identifier': ident, 'is_spawnable': True, 'is_summonable': True, 'is_experimental': False},
        'component_groups': groups, 'components': c,
        'events': dict({'palmera:c%d' % i: {'add': {'component_groups': ['c%d' % i]}} for i in range(ncolors)},
                       **{'minecraft:entity_spawned': {'randomize': [{'weight': 1, 'add': {'component_groups': ['c%d' % i]}} for i in range(ncolors)]}})}}


def heli():
    return {'format_version': '1.21.0', 'minecraft:entity': {
        'description': {'identifier': 'palmera:police_heli', 'is_spawnable': True, 'is_summonable': True, 'is_experimental': False},
        'components': {
            'minecraft:type_family': {'family': ['police_heli', 'mob', 'palmera_police']},
            'minecraft:collision_box': {'width': 3.0, 'height': 2.5},
            'minecraft:health': {'value': 80, 'max': 80},
            'minecraft:physics': {'has_gravity': False}, 'minecraft:can_fly': {},
            'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False},
            'minecraft:movement': {'value': 0.0}, 'minecraft:knockback_resistance': {'value': 1.0},
            'minecraft:damage_sensor': {'triggers': [{'cause': 'fall', 'deals_damage': False}]},
            'minecraft:behavior.nearest_attackable_target': target_wanted(64),
            'minecraft:behavior.ranged_attack': {'priority': 2, 'attack_interval_min': 0.6, 'attack_interval_max': 1.2,
                                                 'attack_radius': 40, 'burst_shots': 4, 'burst_interval': 0.15},
            'minecraft:shooter': {'def': 'palmera:bullet'}, 'minecraft:persistent': {}}}}


def animal(ident, family, hp, speed, hostile, swim):
    c = {
        'minecraft:type_family': {'family': family + ['mob']},
        'minecraft:collision_box': {'width': 1.2 if hostile else 0.6, 'height': 0.6 if hostile else 1.9},
        'minecraft:health': {'value': hp, 'max': hp},
        'minecraft:movement': {'value': speed}, 'minecraft:movement.basic': {},
        'minecraft:navigation.generic' if swim else 'minecraft:navigation.walk': (
            {'can_swim': True, 'can_walk': True, 'can_breach': True} if swim else {'avoid_water': True}),
        'minecraft:jump.static': {}, 'minecraft:physics': {},
        'minecraft:pushable': {'is_pushable': True, 'is_pushable_by_piston': True},
        'minecraft:behavior.random_stroll': {'priority': 6, 'speed_multiplier': 0.8},
        'minecraft:behavior.look_at_player': {'priority': 8, 'look_distance': 6},
        'minecraft:nameable': {}, 'minecraft:conditional_bandwidth_optimization': {},
    }
    if swim:
        c['minecraft:breathable'] = {'total_supply': 30, 'suffocate_time': 0, 'breathes_water': True, 'breathes_air': True}
        c['minecraft:underwater_movement'] = {'value': 0.12}
        c['minecraft:behavior.random_swim'] = {'priority': 7, 'speed_multiplier': 1.0, 'xz_dist': 10, 'y_dist': 3}
    else:
        c['minecraft:behavior.float'] = {'priority': 0}
    if hostile:
        c['minecraft:behavior.nearest_attackable_target'] = {'priority': 2, 'within_radius': 9, 'must_see': True, 'entity_types': [
            {'filters': {'any_of': [{'test': 'is_family', 'subject': 'other', 'value': 'player'},
                                    {'test': 'is_family', 'subject': 'other', 'value': 'civilian'}]}, 'max_dist': 9}]}
        c['minecraft:behavior.melee_attack'] = {'priority': 3, 'speed_multiplier': 1.5, 'track_target': True}
        c['minecraft:attack'] = {'damage': 6}
        c['minecraft:behavior.hurt_by_target'] = {'priority': 1}
    else:
        c['minecraft:behavior.panic'] = {'priority': 1, 'speed_multiplier': 1.6}
    return {'format_version': '1.21.0', 'minecraft:entity': {
        'description': {'identifier': ident, 'is_spawnable': True, 'is_summonable': True, 'is_experimental': False},
        'components': c}}


BULLET = {'format_version': '1.21.0', 'minecraft:entity': {
    'description': {'identifier': 'palmera:bullet', 'is_spawnable': False, 'is_summonable': True, 'is_experimental': False},
    'components': {
        'minecraft:collision_box': {'width': 0.15, 'height': 0.15},
        'minecraft:projectile': {'on_hit': {'impact_damage': {'damage': 3, 'knockback': False}, 'remove_on_hit': {}},
                                 'power': 3.0, 'gravity': 0.0, 'uncertainty_base': 5, 'uncertainty_multiplier': 0,
                                 'anchor': 1, 'offset': [0, -0.1, 0]},
        'minecraft:physics': {}, 'minecraft:pushable': {'is_pushable': False, 'is_pushable_by_piston': False},
        'minecraft:type_family': {'family': ['palmera_bullet']}}}}


def client(ident, geometry, textures, controller, animations=None, animate=None, material='entity_alphatest',
           egg=('#d02020', '#202020'), attach=False):
    d = {'identifier': ident, 'materials': {'default': material}, 'textures': textures,
         'geometry': {'default': geometry}, 'render_controllers': [controller],
         'spawn_egg': {'base_color': egg[0], 'overlay_color': egg[1]}}
    if animations:
        d['animations'] = animations
        d['scripts'] = {'animate': animate}
    if attach:
        d['enable_attachables'] = True
    return {'format_version': '1.10.0', 'minecraft:client_entity': {'description': d}}


def rc(name, n):
    if n == 1:
        return {'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}], 'textures': ['Texture.default']}
    return {'arrays': {'textures': {'Array.skins': ['Texture.s%d' % i for i in range(n)]}},
            'geometry': 'Geometry.default', 'materials': [{'*': 'Material.default'}],
            'textures': ['Array.skins[query.variant]']}




# --------------------------------------------------------------------------- custom blocks (v3)
BSW = {'a': (0, 0), 'b': (4, 0), 'c': (8, 0), 'd': (12, 0), 'e': (0, 4), 'f': (4, 4), 'g': (8, 4), 'h': (12, 4)}


def bcube(o, s, key):
    u, v = BSW[key]
    return {'origin': o, 'size': s, 'uv': {f: {'uv': [u, v], 'uv_size': [4, 4]} for f in ('north', 'south', 'east', 'west', 'up', 'down')}}


#  id: (palette a..h colours, cubes, light, collision)
CUSTOM_BLOCKS = {
    'atm': ({'a': (70, 72, 80), 'b': (40, 140, 220), 'c': (25, 25, 28), 'd': (200, 200, 205), 'e': (60, 170, 80)},
            [bcube([-6, 0, -4], [12, 16, 8], 'a'), bcube([-4, 9, -4.2], [8, 5, 0.2], 'b'), bcube([-4, 5, -5], [8, 2, 1], 'c'),
             bcube([-3, 3, -4.2], [6, 1, 0.2], 'd'), bcube([-6, 15, -4], [12, 1, 8], 'e')], 3, [[-6, 0, -4], [12, 16, 8]]),
    'vending_machine': ({'a': (200, 30, 40), 'b': (170, 210, 230), 'c': (240, 240, 240), 'd': (30, 30, 30), 'e': (250, 200, 40)},
                        [bcube([-7, 0, -6], [14, 16, 12], 'a'), bcube([-6, 4, -6.2], [8, 11, 0.2], 'b'), bcube([3, 6, -6.2], [3, 6, 0.2], 'd'),
                         bcube([-6, 1, -6.2], [8, 2, 0.2], 'd'), bcube([-6, 12, -6.3], [8, 2, 0.1], 'e')], 6, [[-7, 0, -6], [14, 16, 12]]),
    'hydrant': ({'a': (200, 30, 30), 'b': (230, 230, 230), 'c': (150, 20, 20)},
                [bcube([-3, 0, -3], [6, 9, 6], 'a'), bcube([-2, 9, -2], [4, 2, 4], 'c'), bcube([-1, 11, -1], [2, 1, 2], 'b'),
                 bcube([-5, 5, -1], [2, 2, 2], 'b'), bcube([3, 5, -1], [2, 2, 2], 'b'), bcube([-4, 0, -4], [8, 1, 8], 'c')], 0, [[-3, 0, -3], [6, 12, 6]]),
    'trash_bin': ({'a': (40, 90, 60), 'b': (30, 30, 32), 'c': (200, 200, 200)},
                  [bcube([-4, 0, -4], [8, 11, 8], 'a'), bcube([-4.5, 11, -4.5], [9, 1, 9], 'b'), bcube([-1, 6, -4.2], [2, 2, 0.2], 'c')], 0,
                  [[-4, 0, -4], [8, 12, 8]]),
    'bench': ({'a': (150, 100, 55), 'b': (40, 40, 45)},
              [bcube([-8, 5, -3], [16, 1, 6], 'a'), bcube([-8, 7, 3], [16, 4, 1], 'a'), bcube([-7, 0, -3], [1, 5, 6], 'b'),
               bcube([6, 0, -3], [1, 5, 6], 'b'), bcube([-7, 5, 3], [1, 6, 1], 'b'), bcube([6, 5, 3], [1, 6, 1], 'b')], 0, [[-8, 0, -3], [16, 8, 7]]),
    'parking_meter': ({'a': (60, 60, 65), 'b': (200, 200, 205), 'c': (40, 200, 90)},
                      [bcube([-1, 0, -1], [2, 10, 2], 'a'), bcube([-2.5, 10, -2], [5, 5, 4], 'b'), bcube([-1.5, 12, -2.2], [3, 2, 0.2], 'c')], 0,
                      [[-2, 0, -2], [4, 15, 4]]),
    'traffic_signal': ({'a': (25, 25, 28), 'b': (255, 40, 30), 'c': (250, 200, 30), 'd': (60, 230, 90), 'e': (60, 60, 60)},
                       [bcube([-3, 0, -3], [6, 16, 6], 'a'), bcube([-2, 11, -3.3], [4, 4, 0.3], 'b'), bcube([-2, 6, -3.3], [4, 4, 0.3], 'e'),
                        bcube([-2, 1, -3.3], [4, 4, 0.3], 'd'), bcube([-2, 11, 3], [4, 4, 0.3], 'b'), bcube([-2, 1, 3], [4, 4, 0.3], 'd')], 7,
                       [[-3, 0, -3], [6, 16, 6]]),
    'street_light': ({'a': (90, 92, 98), 'b': (255, 245, 210)},
                     [bcube([-1, 0, -1], [2, 10, 2], 'a'), bcube([-3, 10, -7], [6, 2, 14], 'a'), bcube([-2, 9.8, -6], [4, 0.2, 12], 'b')], 15,
                     [[-1, 0, -1], [2, 12, 2]]),
}
ROT = {'north': 0, 'east': 270, 'south': 180, 'west': 90}


def block_texture(cols):
    im = Image.new('RGBA', (16, 16), (128, 128, 128, 255))
    for k, (u, v) in BSW.items():
        c = cols.get(k, (128, 128, 128))
        for x in range(u, u + 4):
            for y in range(v, v + 4):
                im.putpixel((x, y), tuple(c) + (255,))
    return im


def add_custom_blocks(bp, rp):
    terrain = {}
    for name, (cols, cubes, light, coll) in CUSTOM_BLOCKS.items():
        ident = 'palmera:' + name
        comps = {
            'minecraft:geometry': 'geometry.palmera_block_' + name,
            'minecraft:material_instances': {'*': {'texture': 'palmera_' + name, 'render_method': 'alpha_test'}},
            'minecraft:collision_box': {'origin': coll[0], 'size': coll[1]},
            'minecraft:selection_box': {'origin': coll[0], 'size': coll[1]},
            'minecraft:destructible_by_mining': {'seconds_to_destroy': 1.0},
            'minecraft:destructible_by_explosion': {'explosion_resistance': 30},
            'minecraft:light_dampening': 0,
            'minecraft:map_color': '#%02x%02x%02x' % tuple(cols['a']),
        }
        if light:
            comps['minecraft:light_emission'] = light
        bp['blocks/%s.json' % name] = J({'format_version': '1.21.0', 'minecraft:block': {
            'description': {'identifier': ident, 'menu_category': {'category': 'items'},
                            'traits': {'minecraft:placement_direction': {'enabled_states': ['minecraft:cardinal_direction']}}},
            'components': comps,
            'permutations': [{'condition': "q.block_state('minecraft:cardinal_direction') == '%s'" % f,
                              'components': {'minecraft:transformation': {'rotation': [0, r, 0]}}} for f, r in ROT.items()]}})
        rp['models/blocks/palmera_%s.geo.json' % name] = J({'format_version': '1.12.0', 'minecraft:geometry': [{
            'description': {'identifier': 'geometry.palmera_block_' + name, 'texture_width': 16, 'texture_height': 16,
                            'visible_bounds_width': 2, 'visible_bounds_height': 2, 'visible_bounds_offset': [0, 0.5, 0]},
            'bones': [{'name': 'root', 'pivot': [0, 0, 0], 'cubes': cubes}]}]})
        rp['textures/blocks/palmera_%s.png' % name] = png(block_texture(cols))
        terrain['palmera_' + name] = {'textures': 'textures/blocks/palmera_' + name}
    rp['textures/terrain_texture.json'] = J({'resource_pack_name': 'palmera', 'texture_name': 'atlas.terrain',
                                             'padding': 8, 'num_mip_levels': 4, 'texture_data': terrain})
    names = {'atm': 'ATM', 'vending_machine': 'Vending Machine', 'hydrant': 'Fire Hydrant', 'trash_bin': 'Trash Bin',
             'bench': 'Bench', 'parking_meter': 'Parking Meter', 'traffic_signal': 'Traffic Signal', 'street_light': 'Street Light'}
    return ''.join('tile.palmera:%s.name=%s\n' % kv for kv in names.items())


# --------------------------------------------------------------------------- detailed people (v3)
def skin_v3(r, outfit):
    """64x64 skin with shading, outfit details, hair styles and an overlay hat layer."""
    from PIL import ImageDraw
    sk = r.choice(SKINS_T)
    hair = r.choice(HAIR)
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    def R(x0, y0, x1, y1, c):
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=tuple(c) + (255,))
    def shade(c, k):
        return tuple(max(0, min(255, int(v * k))) for v in c)
    # head + face
    R(0, 0, 32, 16, sk)
    R(8, 8, 16, 16, sk)
    style = r.choice(['short', 'long', 'bald', 'buzz', 'bun'])
    if style != 'bald':
        R(8, 0, 16, 8, hair)
        R(0, 8, 32, 9 if style == 'buzz' else 10, hair)
        R(24, 8, 32, 14 if style == 'long' else 12, hair)
        if style == 'long':
            R(0, 8, 2, 15, hair); R(22, 8, 24, 15, hair); R(16, 8, 18, 15, hair); R(6, 8, 8, 15, hair)
    for ex in (9, 13):
        R(ex, 12, ex + 2, 13, (250, 250, 250))
        R(ex + (1 if ex == 9 else 0), 12, ex + (2 if ex == 9 else 1), 13, r.choice([(60, 40, 20), (40, 80, 140), (30, 90, 40)]))
    R(9, 11, 11, 12, shade(hair, 0.8)); R(13, 11, 15, 12, shade(hair, 0.8))
    R(11, 13, 13, 14, shade(sk, 0.85))
    R(10, 14, 14, 15, shade(sk, 0.7))
    if r.random() < 0.25 and outfit != 'suit':
        R(8, 14, 16, 16, shade(hair, 0.9))           # beard
    # outfits
    O = {'suit': ((35, 40, 55), (35, 40, 55), (20, 20, 20)), 'beach': (r.choice(SHIRTS), (60, 130, 200), (240, 220, 180)),
         'jogger': (r.choice([(250, 80, 80), (80, 220, 120), (250, 200, 40)]), (30, 30, 35), (240, 240, 240)),
         'tourist': ((250, 150, 60), (200, 180, 140), (120, 80, 50)), 'worker': ((250, 140, 20), (40, 60, 110), (90, 60, 30)),
         'casual': (r.choice(SHIRTS), r.choice(PANTS), r.choice([(250, 250, 250), (30, 30, 30)]))}[outfit]
    shirt, pants, shoes = O
    R(16, 16, 40, 32, shirt)
    R(16, 20, 20, 32, shade(shirt, 0.8)); R(28, 20, 32, 32, shade(shirt, 0.8))
    if outfit == 'suit':
        R(22, 20, 26, 32, (240, 240, 240)); R(23, 20, 25, 28, r.choice([(180, 30, 40), (30, 60, 150), (30, 30, 30)]))
    if outfit == 'tourist':
        for _ in range(14):
            x, y = r.randrange(16, 40), r.randrange(20, 32)
            R(x, y, x + 1, y + 1, r.choice([(250, 240, 80), (240, 60, 120), (60, 200, 120)]))
    if outfit == 'worker':
        R(20, 26, 28, 28, (230, 230, 230)); R(32, 26, 40, 28, (230, 230, 230))
    R(20, 30, 28, 31, shade(pants, 0.6))                                       # belt
    short_sleeves = outfit in ('beach', 'jogger', 'tourist', 'casual')
    for (x0, y0) in ((40, 16), (32, 48)):
        R(x0, y0, x0 + 16, y0 + 16, shirt if not short_sleeves else sk)
        R(x0 + 4, y0, x0 + 8, y0 + 4, shirt)
        R(x0, y0 + 4, x0 + 16, y0 + 8 if short_sleeves else y0 + 16, shirt)
        R(x0, y0 + 14, x0 + 16, y0 + 16, sk if outfit != 'suit' else (240, 240, 240))
    shorts = outfit in ('beach', 'jogger')
    for (x0, y0) in ((0, 16), (16, 48)):
        R(x0, y0, x0 + 16, y0 + 16, pants if not shorts else sk)
        R(x0, y0 + 4, x0 + 16, y0 + (9 if shorts else 16), pants)
        R(x0 + 4, y0, x0 + 8, y0 + 4, pants)
        R(x0, y0 + 13, x0 + 16, y0 + 16, shoes)
        R(x0 + 8, y0, x0 + 12, y0 + 4, shoes)
    # overlay hat layer (32,0)
    if outfit in ('tourist', 'worker') or r.random() < 0.2:
        hc = {'tourist': (240, 230, 190), 'worker': (250, 220, 40)}.get(outfit, r.choice(SHIRTS))
        R(40, 0, 48, 8, hc); R(32, 8, 64, 10, hc)
    if outfit in ('beach', 'tourist') and r.random() < 0.6:
        R(41, 11, 47, 13, (20, 20, 25))                                       # sunglasses on hat layer front
    return im


def civilian_skins_v3(n=24):
    r = random.Random(11)
    outfits = ['suit', 'beach', 'jogger', 'tourist', 'worker', 'casual']
    return [skin_v3(r, outfits[i % len(outfits)]) for i in range(n)]


# --------------------------------------------------------------------------- story (original)
def story(P, D):
    """Ten missions. D has resolved locations."""
    return [
        {'title': 'Welcome to Palmera', 'steps': [
            {'t': 'talk', 'lines': ['§d[Sol]§f Hey! You made it. Welcome to the sunshine state.',
                                    '§d[Sol]§f First rule here: nobody in Palmera is who they say they are.',
                                    '§d[Sol]§f Meet me at my place downtown. I\'ll mark it on your GPS.']},
            {'t': 'goto', 'pos': D['sol'], 'r': 6, 'label': "Go to Sol's apartment"},
            {'t': 'talk', 'lines': ['§d[Sol]§f Rent is due and my landlord is a shark. We need money, fast.',
                                    '§d[Sol]§f Grab a gun from Sunshine Arms on your phone. Then we work.']},
            {'t': 'cash', 'amount': 1000}]},
        {'title': 'Quick Stop', 'steps': [
            {'t': 'talk', 'lines': ['§d[Sol]§f The store on the corner keeps cash under the counter.',
                                    '§d[Sol]§f Walk up to the counter, crouch with a gun out, and hold it.']},
            {'t': 'rob', 'pos': D['first_store'], 'label': 'Rob the corner store'},
            {'t': 'talk', 'lines': ['§d[Sol]§f Cops! Lose them. Get out of their sight and lay low.']},
            {'t': 'escape', 'label': 'Lose the cops'},
            {'t': 'cash', 'amount': 1500}]},
        {'title': 'Hot Wheels', 'steps': [
            {'t': 'talk', 'lines': ['§6[Benny]§f Sol says you\'re good behind the wheel. Prove it.',
                                    '§6[Benny]§f Steal any car off the street (crouch next to one) and bring it to my garage.']},
            {'t': 'drive', 'pos': D['benny'], 'r': 8, 'label': "Drive a car to Benny's garage"},
            {'t': 'talk', 'lines': ['§6[Benny]§f Not bad, not bad. Here\'s your cut. Come see me again.']},
            {'t': 'cash', 'amount': 3000}]},
        {'title': 'Dock Work', 'steps': [
            {'t': 'talk', 'lines': ['§6[Benny]§f A crew at Port Solano owes me a container of TVs.',
                                    '§6[Benny]§f They won\'t pay. Go explain it to them. Loudly.']},
            {'t': 'kill', 'pos': D['port'], 'spawn': [['palmera:gangster', 'Dock Boss', 1, True], ['palmera:gangster', 'Dock Goon', 5, False]],
             'label': 'Take out the dock crew'},
            {'t': 'cash', 'amount': 4000}]},
        {'title': 'Swamp Thing', 'steps': [
            {'t': 'talk', 'lines': ['§d[Sol]§f The Swamp Kings are moving product through Mangrove Point.',
                                    '§d[Sol]§f Watch the water. The gators down there are hungry.']},
            {'t': 'goto', 'pos': D['mangrove'], 'r': 30, 'label': 'Head to Mangrove Point'},
            {'t': 'kill', 'pos': D['mangrove'], 'spawn': [['palmera:gangster', 'Swamp King', 1, True], ['palmera:gangster', 'Smuggler', 6, False]],
             'label': 'Beat the Swamp Kings'},
            {'t': 'cash', 'amount': 5000}]},
        {'title': 'Paper Trail', 'steps': [
            {'t': 'talk', 'lines': ['§9[Det. Hale]§f I know what you\'re doing. Port Isla. Three ledgers. Find them before I do.',
                                    '§d[Sol]§f How does she know our names?! Just get those ledgers.']},
            {'t': 'collect', 'items': D['ledgers'], 'label': 'Collect the 3 ledgers in Port Isla'},
            {'t': 'cash', 'amount': 6000}]},
        {'title': 'Hangar Deal', 'steps': [
            {'t': 'talk', 'lines': ['§6[Benny]§f Arms dealer flying in tonight. His crates, our profit.']},
            {'t': 'kill', 'pos': D['airport'], 'spawn': [['palmera:gangster', 'Arms Dealer', 1, True], ['palmera:gangster', 'Bodyguard', 6, False]],
             'label': 'Crash the deal at the hangars'},
            {'t': 'cash', 'amount': 8000}]},
        {'title': 'The Big Score', 'steps': [
            {'t': 'talk', 'lines': ['§d[Sol]§f This is it. Palm Bank, downtown. The vault is in the back.',
                                    '§d[Sol]§f Get in the vault, crouch with a gun out and keep drilling. SWAT will come.']},
            {'t': 'heist', 'pos': D['bank'], 'label': 'Crack the Palm Bank vault'},
            {'t': 'talk', 'lines': ['§d[Sol]§f WE DID IT! Now get out of there, the whole city is looking for us!']},
            {'t': 'escape', 'label': 'Escape the police'},
            {'t': 'cash', 'amount': 10000}]},
        {'title': 'Launch Day', 'steps': [
            {'t': 'talk', 'lines': ['§9[Det. Hale]§f Saboteurs at the spaceport. Help me stop them and I forget the bank. Maybe.']},
            {'t': 'kill', 'pos': D['spaceport'], 'spawn': [['palmera:gangster', 'Saboteur Chief', 1, True], ['palmera:gangster', 'Saboteur', 7, False]],
             'label': 'Stop the saboteurs at the spaceport'},
            {'t': 'cash', 'amount': 12000}]},
        {'title': 'King of the Isles', 'steps': [
            {'t': 'talk', 'lines': ['§d[Sol]§f Victor Lazaro. He owns the cops, the docks, the swamp... and he wants us gone.',
                                    '§d[Sol]§f He\'s hiding on the Millionaire Isles. Let\'s end this.']},
            {'t': 'kill', 'pos': D['isles'], 'spawn': [['palmera:swat', 'Lazaro Security', 4, False], ['palmera:gangster', 'Victor Lazaro', 1, True],
                                                      ['palmera:gangster', 'Bodyguard', 5, False]], 'label': 'Take down Victor Lazaro'},
            {'t': 'talk', 'lines': ['§d[Sol]§f It\'s over. Palmera is ours now, partner.', '§6§lTHE END §r§7(keep playing: jobs, heists, races and robberies never stop)']},
            {'t': 'cash', 'amount': 50000}]},
    ]


FEED = [
    '@SunnyMartFan: who keeps robbing the corner store?? 3rd time this week',
    '@GatorWatch: saw a gator the size of a sedan at Mangrove Point. not ok',
    '@PalmeraPD: reminder that crouching at the register is NOT a valid payment method',
    '@CoralStrandBabe: sunset from the ferris wheel hits different',
    '@BennysGarage: no questions asked. ever.',
    '@SpaceportNews: launch delayed again due to "saboteur activity"',
    '@TikiBarDan: happy hour 4-7, no shirt no shoes no problem',
    '@IslesLiving: new mansion just listed, comes with a helipad and a moat',
    '@SpeedwayKing: who\'s racing tonight? loser buys tacos',
    '@FunlandPalmera: coaster closed for "inspection" (a gator got in)',
    '@VistaMarinaTraffic: highway jammed, someone parked a sports car in the median again',
    '@BankWatcher: Palm Bank vault totally secure, says Palm Bank',
]


# --------------------------------------------------------------------------- script
SCRIPT = open(__file__.replace('packs_bedrock.py', 'palmera_main.js')).read() if False else None


def build_addon(out_path, P):
    import generate as g
    rng = random.Random(42)
    jobs = javapacks.job_defs(P)
    sp = getattr(P, 'spots', {})
    places = getattr(P, 'places', {})
    S = P.S

    def near(lst, u, v):
        if not lst:
            return [int(u * S), 66, int(v * S)]
        x, z = u * S, v * S
        b = min(lst, key=lambda s: (s[0] - x) ** 2 + (s[2] - z) ** 2)
        return [int(b[0]), int(b[1]), int(b[2])]
    rob = [list(map(int, s[:3])) + [s[3]] for s in sp.get('rob', [])]
    banks = [list(map(int, s[:3])) for s in sp.get('bank', [])]
    hospitals = [list(map(int, s[:3])) for s in sp.get('hospital', [])]
    police = [list(map(int, s[:3])) for s in sp.get('police', [])]
    gunshops = [list(map(int, s[:3])) for s in sp.get('guns', [])]
    safe = sp.get('safehouse', [])[:10]
    isla_rob = [r for r in rob if r[0] < S * 0.3] or rob
    D = {
        'sol': near(sp.get('hospital', []) + sp.get('police', []), 0.70, 0.47) if not rob else [near(rob, 0.70, 0.47)[0] + 3, 65, near(rob, 0.70, 0.47)[2] - 8],
        'first_store': near(rob, 0.70, 0.47), 'benny': near(sp.get('dealer', []), 0.68, 0.50),
        'port': list(jobs[1]['spot']), 'mangrove': list(jobs[2]['spot']), 'airport': list(jobs[3]['spot']),
        'spaceport': list(jobs[4]['spot']), 'isles': list(jobs[5]['spot']), 'bank': near(sp.get('bank', []), 0.70, 0.47),
        'ledgers': [r[:3] for r in rng.sample(isla_rob, min(3, len(isla_rob)))] if isla_rob else [[0, 70, 0]] * 3,
    }
    ints = getattr(P, 'intersections', [])
    races = []
    for k in range(3):
        if len(ints) < 20:
            break
        r_ = random.Random(100 + k)
        start = r_.choice(ints)
        pts = [start]
        for _ in range(7):
            cur = pts[-1]
            cands = [p for p in ints if 150 < math.hypot(p[0] - cur[0], p[1] - cur[1]) < 450 and p not in pts]
            if not cands:
                break
            pts.append(r_.choice(cands))
        if len(pts) >= 5:
            total = sum(math.hypot(a[0] - b[0], a[1] - b[1]) for a, b in zip(pts, pts[1:]))
            races.append({'title': ['Downtown Dash', 'Marina Mile', 'Neon Night Run'][k], 'par': int(total / 14) + 10,
                          'reward': 2000 + k * 1500, 'cps': [[int(p[0]), 66, int(p[1])] for p in pts]})
    parked = []
    if hasattr(P, 'cars') and len(P.cars):
        sel = P.cars[:: max(1, len(P.cars) // 20000)]
        for cx_, cz_, dr, col in sel:
            parked.append([int(cx_), int(P.H[cz_, cx_]) + 1, int(cz_), int(dr)])
    named = {'Hospital (nearest)': 'hospital', 'Police Station (nearest)': 'police', 'Sunshine Arms (nearest)': 'guns',
             'Palm Bank (nearest)': 'bank'}
    landmarks = [['Funland Palmera', places.get('themepark')], ['Palmera Speedway', places.get('speedway')],
                 ['Iron Bay Correctional', places.get('prison')], ['Coral Strand (spawn)', list(P.spawn)],
                 ['Port Solano', D['port']], ['Mangrove Point', D['mangrove']], ['Intl Airport', D['airport']],
                 ['Spaceport', D['spaceport']], ['Millionaire Isles', D['isles']]]
    landmarks = [[n_, list(map(int, p))] for n_, p in landmarks if p]
    gang_zones = [{'name': 'Swamp Kings', 'pos': D['mangrove'], 'r': 140, 'skins': [3, 4, 5]},
                  {'name': 'Neon Saints', 'pos': near(rob, 0.215, 0.39), 'r': 160, 'skins': [0, 1, 2]}]
    data = {
        'guns': {'palmera:' + k: {'dmg': v[0], 'cd': v[1], 'range': v[2], 'pellets': v[3], 'ammo': v[4], 'spread': v[5],
                                  'sound': v[6], 'pitch': v[7], 'explode': v[8], 'mag': GUN_EXTRA[k][0], 'reload': GUN_EXTRA[k][1],
                                  'auto': GUN_EXTRA[k][2], 'recoil': GUN_EXTRA[k][3], 'zoom': k == 'sniper', 'name': ITEMS[k][0],
                                  'particle': 'minecraft:basic_flame_particle' if k == 'rocket' else 'minecraft:basic_crit_particle'}
                 for k, v in GUNS.items()},
        'shop': [{'key': k, 'label': l, 'price': p, 'cat': c, 'icon': 'textures/items/palmera_' + (k if k in ITEMS else 'cash')}
                 for k, l, p, c in SHOP],
        'peds': javapacks.PED_NAMES,
        'jobs': [{'title': j['title'], 'where': j['where'], 'reward': j['reward'], 'desc': j['desc'], 'spot': list(j['spot']),
                  'boss': j['boss'][1], 'goons': len(j['goons'])} for j in jobs],
        'story': story(P, D), 'rob': rob, 'banks': banks, 'hospitals': hospitals, 'police': police, 'gunshops': gunshops,
        'safehouses': [{'pos': list(map(int, s_[:3])), 'kind': s_[3], 'price': 250000 if s_[3] == 'mansion' else 30000,
                        'income': 4000 if s_[3] == 'mansion' else 600} for s_ in safe],
        'races': races, 'landmarks': landmarks, 'gangs': gang_zones, 'feed': FEED,
        'mm': [''.join(str(int(c)) for c in row) for row in P.minimap] if hasattr(P, 'minimap') else [], 'mmcell': 16,
        'parked': parked,
    }
    script = open(__import__('os').path.join(__import__('os').path.dirname(__file__), 'palmera_main.js')).read()
    script = script.replace('__DATA__', json.dumps(data))

    bp, rp = {}, {}
    bp_uuid, rp_uuid = U('bp'), U('rp')
    rp['manifest.json'] = J({'format_version': 2, 'header': {
        'name': 'Palmera Life (Resources)', 'description': 'Models, skins and items for Palmera',
        'uuid': rp_uuid, 'version': [1, 0, 0], 'min_engine_version': MIN_ENGINE},
        'modules': [{'type': 'resources', 'uuid': U('rp-mod'), 'version': [1, 0, 0]}]})
    bp['manifest.json'] = J({'format_version': 2, 'header': {
        'name': 'Palmera Life', 'description': 'Story, cops, heists, robberies, traffic, guns and more for Palmera',
        'uuid': bp_uuid, 'version': [1, 0, 0], 'min_engine_version': MIN_ENGINE},
        'modules': [{'type': 'data', 'uuid': U('bp-data'), 'version': [1, 0, 0]},
                    {'type': 'script', 'language': 'javascript', 'uuid': U('bp-script'), 'version': [1, 0, 0],
                     'entry': 'scripts/main.js'}],
        'dependencies': [{'module_name': '@minecraft/server', 'version': SERVER_VER},
                         {'module_name': '@minecraft/server-ui', 'version': UI_VER},
                         {'uuid': rp_uuid, 'version': [1, 0, 0]}]})
    bp['scripts/main.js'] = script
    icon = Image.open(io.BytesIO(javapacks.sprite_png(SPRITES['pistol']))).resize((128, 128), Image.NEAREST)
    bp['pack_icon.png'] = rp['pack_icon.png'] = png(icon)

    # items
    tex_data = {}
    for key, (label, stack, hand) in ITEMS.items():
        comps = {'minecraft:icon': {'textures': {'default': 'palmera_' + key}}, 'minecraft:display_name': {'value': label},
                 'minecraft:max_stack_size': stack, 'minecraft:hand_equipped': hand}
        if key == 'bat':
            comps['minecraft:damage'] = 7
        if key in GUNS:
            comps['minecraft:use_modifiers'] = {'use_duration': 3600, 'movement_modifier': 0.8}
            comps['minecraft:use_animation'] = 'bow'
        bp['items/%s.json' % key] = J({'format_version': '1.21.0', 'minecraft:item': {
            'description': {'identifier': 'palmera:' + key, 'menu_category': {'category': 'equipment'}}, 'components': comps}})
        rp['textures/items/palmera_%s.png' % key] = javapacks.sprite_png(SPRITES[key])
        tex_data['palmera_' + key] = {'textures': 'textures/items/palmera_' + key}
    rp['font/glyph_E1.png'] = png(glyph_sheet())
    for app, (col, letter) in APPS.items():
        rp['textures/ui/palmera_app_%s.png' % app] = png(app_icon(col, letter))
    rp['textures/item_texture.json'] = J({'resource_pack_name': 'palmera', 'texture_name': 'atlas.items', 'texture_data': tex_data})
    bp['loot_tables/entities/palmera_armed.json'] = J({'pools': [{'rolls': 1, 'entries': [
        {'type': 'item', 'name': 'palmera:pistol', 'weight': 3}, {'type': 'item', 'name': 'palmera:smg', 'weight': 1}]}]})

    # NPCs
    npcs = [('civilian', ['civilian'], 20, 0.25, civilian_skins_v3(), 'civilian', ('#f0c090', '#3070d0')),
            ('cop', ['cop', 'palmera_police'], 26, 0.3, cop_skins(), 'cop', ('#203070', '#f0d020')),
            ('swat', ['swat', 'palmera_police'], 44, 0.3, swat_skins(), 'swat', ('#202020', '#808080')),
            ('gangster', ['gangster'], 26, 0.3, gang_skins(), 'gang', ('#c030b0', '#408020'))]
    rc_all = {}
    for name, fam, hp, spd, skins, kind, egg in npcs:
        ident = 'palmera:' + name
        bp['entities/%s.json' % name] = J(npc(ident, fam, hp, spd, len(skins), kind))
        tex = {}
        for i, im in enumerate(skins):
            path = 'textures/entity/palmera_npc/%s_%d' % (name, i)
            rp[path + '.png'] = png(im)
            tex['s%d' % i] = path
        anim = {'walk': 'animation.palmera.npc.walk', 'look': 'animation.palmera.npc.look', 'aim': 'animation.palmera.npc.aim',
                'idle': 'animation.palmera.npc.idle'}
        animate = ['walk', 'look', 'idle'] + ([{'aim': 'query.has_target'}] if kind != 'civilian' else [])
        rp['entity/%s.entity.json' % name] = J(client(ident, 'geometry.palmera_npc', tex, 'controller.render.palmera_' + name,
                                                      anim, animate, egg=egg, attach=True))
        rc_all['controller.render.palmera_' + name] = rc(name, len(skins))
    rp['models/entity/palmera_npc.geo.json'] = J(HUMANOID_GEO)

    # vehicles
    for i, col in enumerate(CAR_COLORS):
        rp['textures/entity/palmera_car/c%d.png' % i] = png(swatch_tex(col))
    car_tex = {'s%d' % i: 'textures/entity/palmera_car/c%d' % i for i in range(len(CAR_COLORS))}
    for ident, speed, hp, seat, ai, geoid, label in (
            ('car', 0.38, 60, 0.55, None, 'geometry.palmera_car', 'Sedan'),
            ('sports_car', 0.55, 45, 0.35, None, 'geometry.palmera_sports', 'Sports Car'),
            ('traffic_car', 0.2, 40, 0.55, 'traffic', 'geometry.palmera_car', 'Car')):
        bp['entities/%s.json' % ident] = J(vehicle('palmera:' + ident, speed, hp, seat, ai))
        rp['entity/%s.entity.json' % ident] = J(client('palmera:' + ident, geoid, car_tex, 'controller.render.palmera_car'))
    rc_all['controller.render.palmera_car'] = rc('car', len(CAR_COLORS))
    bp['entities/police_car.json'] = J(vehicle('palmera:police_car', 0.45, 70, 0.55, 'police_car', ncolors=1))
    rp['textures/entity/palmera_police_car.png'] = png(swatch_tex((240, 240, 240)))
    rp['entity/police_car.entity.json'] = J(client('palmera:police_car', 'geometry.palmera_police_car',
                                                   {'default': 'textures/entity/palmera_police_car'}, 'controller.render.palmera_single',
                                                   {'lights': 'animation.palmera.police.lights'}, ['lights'], egg=('#ffffff', '#2040ff')))
    bp['entities/police_heli.json'] = J(heli())
    rp['textures/entity/palmera_heli.png'] = png(swatch_tex((30, 45, 110)))
    rp['entity/police_heli.entity.json'] = J(client('palmera:police_heli', 'geometry.palmera_heli',
                                                    {'default': 'textures/entity/palmera_heli'}, 'controller.render.palmera_single',
                                                    {'rotor': 'animation.palmera.heli.rotor'}, ['rotor'], egg=('#1e2d6e', '#ffffff')))
    rc_all['controller.render.palmera_single'] = rc('single', 1)
    rp['models/entity/palmera_car.geo.json'] = J(CAR_GEO)
    rp['models/entity/palmera_sports.geo.json'] = J(SPORTS_GEO)
    rp['models/entity/palmera_police_car.geo.json'] = J(POLICE_GEO)
    rp['models/entity/palmera_heli.geo.json'] = J(HELI_GEO)

    # animals
    bp['entities/gator.json'] = J(animal('palmera:gator', ['gator', 'monster'], 30, 0.22, True, True))
    bp['entities/flamingo.json'] = J(animal('palmera:flamingo', ['flamingo', 'animal'], 8, 0.22, False, False))
    rp['textures/entity/palmera_gator.png'] = png(swatch_tex((70, 95, 45)))
    rp['textures/entity/palmera_flamingo.png'] = png(swatch_tex((250, 120, 170)))
    rp['entity/gator.entity.json'] = J(client('palmera:gator', 'geometry.palmera_gator', {'default': 'textures/entity/palmera_gator'},
                                              'controller.render.palmera_single', {'walk': 'animation.palmera.quad.walk'}, ['walk'],
                                              egg=('#46602d', '#e1d796')))
    rp['entity/flamingo.entity.json'] = J(client('palmera:flamingo', 'geometry.palmera_flamingo', {'default': 'textures/entity/palmera_flamingo'},
                                                 'controller.render.palmera_single', {'walk': 'animation.palmera.flamingo.walk'}, ['walk'],
                                                 egg=('#fa78aa', '#202020')))
    rp['models/entity/palmera_gator.geo.json'] = J(GATOR_GEO)
    rp['models/entity/palmera_flamingo.geo.json'] = J(FLAMINGO_GEO)

    # bullet
    bp['entities/bullet.json'] = J(BULLET)
    bt = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for x in range(6, 10):
        for y in range(6, 10):
            bt.putpixel((x, y), (255, 210, 60, 255))
    rp['textures/entity/palmera_bullet.png'] = png(bt)
    rp['entity/bullet.entity.json'] = J({'format_version': '1.10.0', 'minecraft:client_entity': {'description': {
        'identifier': 'palmera:bullet', 'materials': {'default': 'snowball'}, 'textures': {'default': 'textures/entity/palmera_bullet'},
        'geometry': {'default': 'geometry.item_sprite'}, 'render_controllers': ['controller.render.item_sprite'],
        'animations': {'flying': 'animation.actor.billboard'}, 'scripts': {'animate': ['flying']}}}})

    block_lang = add_custom_blocks(bp, rp)
    rp['render_controllers/palmera.render_controllers.json'] = J({'format_version': '1.8.0', 'render_controllers': rc_all})
    rp['animations/palmera.animation.json'] = J(ANIMS)
    names = {'civilian': 'Civilian', 'cop': 'Police Officer', 'swat': 'SWAT', 'gangster': 'Gang Member', 'car': 'Sedan',
             'sports_car': 'Sports Car', 'traffic_car': 'Car', 'police_car': 'Police Car', 'police_heli': 'Police Helicopter',
             'gator': 'Alligator', 'flamingo': 'Flamingo', 'bullet': 'Bullet'}
    rp['texts/en_US.lang'] = ''.join('entity.palmera:%s.name=%s\nitem.spawn_egg.entity.palmera:%s.name=%s\n' % (k, v, k, v)
                                     for k, v in names.items()) + 'action.interact.steal=Steal\n' + block_lang
    rp['texts/languages.json'] = J(['en_US'])

    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in bp.items():
            z.writestr('Palmera_Life_BP/' + k, v)
        for k, v in rp.items():
            z.writestr('Palmera_Life_RP/' + k, v)
    return bp, rp
