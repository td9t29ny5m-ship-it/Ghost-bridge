#!/usr/bin/env python3
"""
Palmera - generates an original, Florida-inspired tropical-state Minecraft world
(Java Edition, 1.21.1 format; newer versions upgrade it automatically on load).

What's in the world:
  * Vista Marina     - east-coast metro: glass downtown towers, waterfront condos,
                       art-deco blocks, street grid with lane markings and lamps
  * Coral Strand     - barrier island across the lagoon: pastel hotels, beach,
                       umbrellas, lifeguard towers, three causeways to the city
  * Port Solano      - container port with gantry cranes and warehouses
  * Vista Marina Intl- airport with runway, taxiway, terminal, tower, jets
  * The Sawgrass     - mangrove swamp crossed by an elevated highway
  * Sunset Keys      - island chain linked by a long overseas bridge + lighthouse
  * Gulf Harbor      - small west-coast town with a fishing pier
  * Lake Solano, northern farmland, orange groves, suburbs with backyard pools

Usage:  python3 generate.py --size 2048 --out ./out
Pure Python + numpy + scipy (+ Pillow for the map preview).
"""
import argparse
import gzip
import math
import os
import random
import shutil
import struct
import sys
import time
import zlib
from functools import partial
from multiprocessing import get_context

import numpy as np
from scipy import ndimage

SEA = 62                      # water surface block y
YMIN, YMAX = -64, 320
NY = YMAX - YMIN
RS = 512                      # region size in blocks
DATA_VERSION = 3955           # 1.21.1
VERSION_NAME = '1.21.1'
KEEP = 255                    # "leave as is" marker in structure arrays
WORLD_NAME = 'Palmera'

# --------------------------------------------------------------------------- blocks
BLOCKS = []
_IDX = {}


def B(name, **props):
    if ':' not in name:
        name = 'minecraft:' + name
    items = []
    for k, v in props.items():
        if isinstance(v, bool):
            v = 'true' if v else 'false'
        items.append((k, str(v)))
    key = (name, tuple(sorted(items)))
    if key not in _IDX:
        _IDX[key] = len(BLOCKS)
        BLOCKS.append(key)
        assert len(BLOCKS) < KEEP, 'too many block states'
    return _IDX[key]


AIR = B('air')
STONE, DEEPSLATE, BEDROCK = B('stone'), B('deepslate'), B('bedrock')
DIRT, GRASS, SAND, SANDSTONE = B('dirt'), B('grass_block'), B('sand'), B('sandstone')
MUD, CLAY, GRAVEL, WATER = B('mud'), B('clay'), B('gravel'), B('water')
ASPHALT, WHITE, YELLOW = B('gray_concrete'), B('white_concrete'), B('yellow_concrete')
SIDEWALK, RUNWAY, APRON = B('smooth_stone'), B('black_concrete'), B('light_gray_concrete')
STONE_BRICKS = B('stone_bricks')
RAIL_X = B('stone_brick_wall', east='low', west='low', up=False)
RAIL_Z = B('stone_brick_wall', north='low', south='low', up=False)
POST = B('andesite_wall')
LANTERN = B('lantern')
GLOW = B('glowstone')
SEA_LANTERN = B('sea_lantern')
NEONS = [B('pearlescent_froglight'), B('verdant_froglight'), B('sea_lantern'), B('ochre_froglight')]
FARMLAND = B('farmland', moisture=7)
CROPS = [B('wheat', age=7), B('carrots', age=7), B('potatoes', age=7)]
SHORT_GRASS, FERN = B('short_grass'), B('fern')
FLOWERS = [B('poppy'), B('dandelion'), B('cornflower'), B('allium'), B('oxeye_daisy')]
LILY, SEAGRASS = B('lily_pad'), B('seagrass')
CORALS = [B(c + '_coral_block') for c in ('brain', 'tube', 'fire', 'horn', 'bubble')]
JUNGLE_LOG = B('jungle_log')
JUNGLE_LEAVES = B('jungle_leaves', persistent=True)
OAK_LOG = B('oak_log')
OAK_LEAVES = B('oak_leaves', persistent=True)
AZALEA_LEAVES = B('flowering_azalea_leaves', persistent=True)
MANGROVE_LOG = B('mangrove_log')
MANGROVE_ROOTS = B('mangrove_roots')
MANGROVE_LEAVES = B('mangrove_leaves', persistent=True)
SPRUCE_LOG = B('spruce_log')
SPRUCE_LEAVES = B('spruce_leaves', persistent=True)
SPRUCE_PLANKS = B('spruce_planks')
OAK_PLANKS = B('oak_planks')
OAK_FENCE = B('oak_fence')
IRON = B('iron_block')
LIGHTNING_ROD = B('lightning_rod')
QUARTZ = B('smooth_quartz')
DARK_OAK = B('dark_oak_planks')
HAY = B('hay_block')
IRON_BARS = B('iron_bars')
CUT_SANDSTONE = B('cut_sandstone')
RED_TERRACOTTA = B('red_terracotta')

DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
        'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
CONCRETE = {d: B(d + '_concrete') for d in DYES}
WOOL = {d: B(d + '_wool') for d in DYES}
GLASS = B('glass')
GLASSES = [B(c + '_stained_glass') for c in ('light_blue', 'cyan', 'gray', 'black', 'blue', 'light_gray')]
FRAMES = [CONCRETE['white'], CONCRETE['light_gray'], CONCRETE['gray'], B('quartz_block'), QUARTZ]
PASTELS = [CONCRETE['pink'], CONCRETE['light_blue'], CONCRETE['white'], B('white_terracotta'),
           B('magenta_terracotta'), CONCRETE['lime'], CONCRETE['yellow'], B('pink_terracotta')]
OFFICE_WALLS = [CONCRETE['light_gray'], B('smooth_sandstone'), B('white_terracotta'),
                STONE_BRICKS, B('quartz_block'), B('cut_sandstone'), B('bricks')]
HOUSE_WALLS = [CONCRETE['white'], B('white_terracotta'), B('smooth_sandstone'), B('pink_terracotta'),
               B('light_blue_terracotta'), B('yellow_terracotta'), B('cyan_terracotta')]
ROOFS = [B('terracotta'), B('orange_terracotta'), B('brown_terracotta'), B('light_gray_terracotta'),
         B('red_terracotta')]

# road codes -> materials
R_NONE, R_ASPH, R_WHITE, R_YEL, R_SIDE, R_MED, R_RUN = range(7)
ROAD_MAT = np.array([AIR, ASPHALT, WHITE, YELLOW, SIDEWALK, GRASS, RUNWAY], np.uint8)

# zones
Z_OCEAN, Z_WILD, Z_FARM, Z_CITY, Z_SUB, Z_SWAMP, Z_BEACH, Z_KEYS, Z_AIR, Z_PORT, Z_LAKE, Z_TOWN, Z_RESORT = range(13)

BIOMES = ['minecraft:warm_ocean', 'minecraft:beach', 'minecraft:sparse_jungle', 'minecraft:plains',
          'minecraft:mangrove_swamp', 'minecraft:river']
BI_OCEAN, BI_BEACH, BI_JUNGLE, BI_PLAINS, BI_SWAMP, BI_RIVER = range(6)

# tree / small-object types
T_PALM, T_OAK, T_MANGROVE, T_BUSH, T_GROVE, T_CYPRESS, T_UMBRELLA = range(7)


# --------------------------------------------------------------------------- NBT
class T:
    __slots__ = ('tid', 'v')

    def __init__(self, tid, v):
        self.tid, self.v = tid, v


def Byte(v): return T(1, v)
def Short(v): return T(2, v)
def Int(v): return T(3, v)
def Long(v): return T(4, v)
def Float(v): return T(5, v)
def Double(v): return T(6, v)
def List(et, items): return T(9, (et, items))
def LongArray(a): return T(12, a)
def Raw(b): return T(99, b)   # pre-serialised compound payload (used in lists)


def _ws(out, s):
    b = s.encode('utf-8')
    out += struct.pack('>H', len(b))
    out += b


_FMT = {1: '>b', 2: '>h', 3: '>i', 4: '>q', 5: '>f', 6: '>d'}


def _tid(v):
    if isinstance(v, dict):
        return 10
    if isinstance(v, str):
        return 8
    return 10 if v.tid == 99 else v.tid


def _wp(out, v):
    if isinstance(v, dict):
        for k, x in v.items():
            out.append(_tid(x))
            _ws(out, k)
            _wp(out, x)
        out.append(0)
    elif isinstance(v, str):
        _ws(out, v)
    else:
        t, x = v.tid, v.v
        if t in _FMT:
            out += struct.pack(_FMT[t], x)
        elif t == 9:
            et, items = x
            out += struct.pack('>bi', et if items else 0, len(items))
            for it in items:
                _wp(out, it)
        elif t == 12:
            a = np.asarray(x).astype('>i8')
            out += struct.pack('>i', len(a))
            out += a.tobytes()
        elif t == 99:
            out += x
        else:
            raise ValueError(t)


def nbt_bytes(root):
    out = bytearray()
    out.append(10)
    _ws(out, '')
    _wp(out, root)
    return bytes(out)


def payload(v):
    out = bytearray()
    _wp(out, v)
    return bytes(out)


def _palette_entry(i):
    name, props = BLOCKS[i]
    c = {'Name': name}
    if props:
        c['Properties'] = {k: v for k, v in props}
    return Raw(payload(c))


# --------------------------------------------------------------------------- noise
def smooth_noise(S, cell, rng):
    n = S // cell + 3
    g = rng.random((n, n)).astype(np.float32) * 2 - 1
    return ndimage.zoom(g, cell, order=3, prefilter=False)[:S, :S]


def fbm(S, rng, base, octaves=5):
    out = np.zeros((S, S), np.float32)
    amp, tot, cell = 1.0, 0.0, base
    for _ in range(octaves):
        if cell < 4:
            break
        out += amp * smooth_noise(S, cell, rng)
        tot += amp
        amp *= 0.5
        cell //= 2
    return out / tot


# --------------------------------------------------------------------------- structure builders
# Every builder returns (arr[y, z, x], oy). Cells equal to KEEP are left untouched.

def _faces(d, w):
    Z, X = np.mgrid[0:d, 0:w]
    per = (Z == 0) | (Z == d - 1) | (X == 0) | (X == w - 1)
    corner = ((Z == 0) | (Z == d - 1)) & ((X == 0) | (X == w - 1))
    hor = np.where((Z == 0) | (Z == d - 1), X, Z)
    return Z, X, per, corner, hor


def tower_block(w, d, h, wall, glass, floorb, roofb, style='punched', fe=4, trim=None,
                lights=True, door=True, parapet=None):
    a = np.full((h + 2, d, w), AIR, np.uint8)
    Z, X, per, corner, hor = _faces(d, w)
    Y = np.arange(h + 2)[:, None, None]
    yl = Y % fe
    if style == 'glass':
        win = (yl != 0) & (hor % 5 != 0)[None]
    elif style == 'band':
        win = (yl != 0) & np.ones((1, d, w), bool)
    else:
        win = ((yl == 1) | (yl == 2)) & (hor % 3 != 1)[None]
    win = win & (per & ~corner)[None] & (Y >= 1) & (Y < h)
    a[:h][np.broadcast_to(per[None], (h, d, w))] = wall
    a[win] = glass
    if trim is not None:
        a[:h][np.broadcast_to(corner[None], (h, d, w))] = trim
    for y in range(0, h, fe):
        a[y][~per] = floorb
    a[0] = floorb
    if lights:
        m = (~per) & (X % 6 == 3) & (Z % 6 == 3)
        for y in range(fe, h, fe):
            a[y][m] = GLOW
    a[h] = roofb
    a[h + 1][per] = parapet if parapet is not None else (trim if trim is not None else wall)
    if door and w >= 5:
        a[1:3, 0, w // 2 - 1:w // 2 + 1] = AIR
    return a


def build_glass_tower(seed, w, d, h):
    r = random.Random(seed)
    glass, frame = r.choice(GLASSES), r.choice(FRAMES)
    roofb = CONCRETE['light_gray']
    tiers = [(0, 0, h)]
    if h > 70 and min(w, d) >= 18:
        t1, t2 = int(h * 0.6), int(h * 0.85)
        tiers = [(0, 0, t1), (t1, 3, t2 - t1), (t2, 6, h - t2)]
    elif h > 45 and min(w, d) >= 14:
        t1 = int(h * 0.75)
        tiers = [(0, 0, t1), (t1, 3, h - t1)]
    a = np.full((h + 12, d, w), KEEP, np.uint8)
    for y0, ins, th in tiers:
        tw, td = w - 2 * ins, d - 2 * ins
        if tw < 5 or td < 5:
            break
        t = tower_block(tw, td, th, frame, glass, CONCRETE['white'], roofb, 'glass', 4,
                        trim=frame, door=(y0 == 0))
        a[y0:y0 + th + 2, ins:ins + td, ins:ins + tw] = t
        top, tins, tw_, td_ = y0 + th, ins, tw, td
    cx, cz = w // 2, d // 2
    k = r.random()
    if k < 0.4:
        a[top + 1:top + 5, cz, cx] = IRON
        a[top + 5:top + 9, cz, cx] = LIGHTNING_ROD
    elif k < 0.7 and min(tw_, td_) >= 11:
        hz, hx = tins + td_ // 2, tins + tw_ // 2
        a[top, hz - 3:hz + 4, hx - 2] = YELLOW
        a[top, hz - 3:hz + 4, hx + 2] = YELLOW
        a[top, hz, hx - 2:hx + 3] = YELLOW
    else:
        for _ in range(3):
            ux = r.randint(tins + 1, tins + tw_ - 4)
            uz = r.randint(tins + 1, tins + td_ - 4)
            a[top + 1, uz:uz + 2, ux:ux + 2] = IRON
    return a, None


def build_condo(seed, w, d, h):
    r = random.Random(seed)
    wall = r.choice([CONCRETE['white'], QUARTZ, CONCRETE['white']])
    glass = r.choice(GLASSES[:5])
    a = np.full((h + 2, d, w), KEEP, np.uint8)
    a[:] = tower_block(w, d, h, wall, glass, CONCRETE['white'], wall, 'band', 3)
    if r.random() < 0.6 and w >= 10 and d >= 10:   # rooftop pool
        a[h - 1, 3:d - 3, 3:w - 3] = wall
        a[h, 3:d - 3, 3:w - 3] = WATER
    return a, None


def build_deco(seed, w, d, h):
    r = random.Random(seed)
    wall = r.choice(PASTELS)
    trim = CONCRETE['white'] if wall != CONCRETE['white'] else CONCRETE['light_blue']
    neon = r.choice(NEONS)
    a = np.full((h + 6, d, w), KEEP, np.uint8)
    a[:h + 2] = tower_block(w, d, h, wall, r.choice([GLASS, GLASSES[0], GLASSES[1]]), OAK_PLANKS,
                            trim, 'punched', 4, trim=trim, parapet=trim)
    a[h - 1, 0, :] = trim
    a[h - 1, d - 1, :] = trim
    a[h - 1, :, 0] = trim
    a[h - 1, :, w - 1] = trim
    c = w // 2
    a[h + 1:h + 5, 0, max(0, c - 3):c + 4] = trim
    a[3:h + 5, 0, c] = neon
    a[1, 0, 1:w - 1] = np.where(np.arange(1, w - 1) % 2 == 0, neon, a[1, 0, 1:w - 1])
    a[1:3, 0, c - 1:c + 2] = AIR
    return a, None


def build_office(seed, w, d, h):
    r = random.Random(seed)
    wall = r.choice(OFFICE_WALLS)
    glass = r.choice([GLASS] + GLASSES)
    return tower_block(w, d, h, wall, glass, CONCRETE['white'], CONCRETE['light_gray'], 'punched', 4,
                       trim=r.choice([None, CONCRETE['white'], CONCRETE['gray']])), None


def build_shop(seed, w, d, h):
    r = random.Random(seed)
    wall = r.choice(PASTELS + HOUSE_WALLS)
    a = np.full((h + 4, d, w), KEEP, np.uint8)
    a[:h + 2] = tower_block(w, d, h, wall, GLASS, OAK_PLANKS, CONCRETE['light_gray'], 'punched', 4)
    a[1:4, 0, 1:w - 1] = GLASS
    a[1:3, 0, w // 2] = AIR
    a[4, 0, :] = WOOL[r.choice(DYES)]
    a[h + 1:h + 3, 0, 1:w - 1] = r.choice(NEONS + [CONCRETE['red'], CONCRETE['blue']])
    return a, None


def build_house_lot(seed, lw, ld, stilts=0):
    """Lot array starts one block below ground (oy = -1 relative to ground level)."""
    r = random.Random(seed)
    wh = 4
    hw = min(lw - 2, r.randint(7, 10))
    hd = min(ld - 6, r.randint(7, 9))
    hw, hd = max(hw, 5), max(hd, 5)
    roof_h = (min(hw, hd) + 1) // 2 + 1
    H = 2 + stilts + wh + roof_h + 1
    a = np.full((H, ld, lw), KEEP, np.uint8)
    x0 = (lw - hw) // 2
    front = r.random() < 0.5
    z0 = 1 if front else ld - hd - 1
    g = 1  # ground level index
    if stilts:
        for sx in (x0, x0 + hw - 1):
            for sz in (z0, z0 + hd - 1):
                a[g:g + stilts + 1, sz, sx] = OAK_LOG
    b = g + stilts  # floor index
    wall, roof = r.choice(HOUSE_WALLS), r.choice(ROOFS)
    t = tower_block(hw, hd, wh, wall, GLASS, OAK_PLANKS, wall, 'punched', 4, lights=False, door=False)
    a[b:b + wh, z0:z0 + hd, x0:x0 + hw] = t[:wh]
    a[b, z0:z0 + hd, x0:x0 + hw] = OAK_PLANKS
    a[b + 1:b + 3, z0 if front else z0 + hd - 1, x0 + hw // 2] = AIR      # door
    a[b + 1, z0 + hd // 2, x0 + hw // 2] = AIR
    a[b, z0 + hd // 2, x0 + hw // 2] = GLOW
    for k in range(roof_h):
        y = b + wh + k
        if hw - 2 * k <= 0 or hd - 2 * k <= 0:
            break
        a[y, z0 + k:z0 + hd - k, x0 + k:x0 + hw - k] = roof
    # pool in the back yard
    if not stilts and r.random() < 0.55:
        pz0 = z0 + hd + 1 if front else 1
        pz1 = ld - 1 if front else z0 - 1
        if pz1 - pz0 >= 4 and hw >= 6:
            px0, px1 = x0 + 1, x0 + hw - 1
            a[g, pz0:pz1, px0:px1] = QUARTZ
            a[g - 1:g + 1, pz0 + 1:pz1 - 1, px0 + 1:px1 - 1] = WATER
    return a, -1


def build_warehouse(seed, w, d, h):
    r = random.Random(seed)
    wall = r.choice([CONCRETE['light_gray'], CONCRETE['white'], CUT_SANDSTONE, CONCRETE['light_blue']])
    a = tower_block(w, d, h, wall, GLASS, SIDEWALK, IRON, 'band', h - 2, lights=True, door=False)
    for x in range(3, w - 5, 9):
        a[1:6, 0, x:x + 5] = CONCRETE['gray']
    return a, None


def build_container_stack(seed, w, d, h):
    """w x d footprint of containers (each 3 wide along x, 7 long along z), up to h layers."""
    r = random.Random(seed)
    a = np.full((h * 3 + 1, d, w), KEEP, np.uint8)
    for cx in range(0, w - 2, 3):
        for cz in range(0, d - 6, 8):
            n = r.randint(1, h)
            for k in range(n):
                col = CONCRETE[r.choice(['red', 'blue', 'orange', 'green', 'white', 'cyan', 'yellow', 'gray', 'brown'])]
                a[1 + 3 * k:4 + 3 * k, cz:cz + 7, cx:cx + 3] = col
                a[1 + 3 * k:4 + 3 * k, cz, cx + 1] = CONCRETE['black']
    return a, None


def build_crane(seed, w, d, h):
    """Gantry crane, boom reaching toward +z (over water). w=12, d=44, h=34."""
    r = random.Random(seed)
    c = CONCRETE[r.choice(['yellow', 'orange', 'red', 'blue'])]
    a = np.full((h, d, w), KEEP, np.uint8)
    for lx in (0, w - 2):
        for lz in (0, 10):
            a[1:h - 4, lz:lz + 2, lx:lx + 2] = c
    for y in (12, h - 5):
        a[y, 0:12, 0:w] = np.where(np.add.outer(np.arange(12), np.arange(w)) % 2 == 0, c, KEEP)
    a[h - 5:h - 3, 0:d, w // 2 - 1:w // 2 + 1] = c
    a[h - 5:h - 3, 0:12, 0:2] = c
    a[h - 5:h - 3, 0:12, w - 2:w] = c
    a[h - 9:h - 5, 10:15, w // 2 - 2:w // 2 + 2] = CONCRETE['white']
    a[h - 8, 10, w // 2 - 1:w // 2 + 1] = GLASSES[3]
    a[h - 3:h, 0:4, w // 2 - 1:w // 2 + 1] = c
    return a, None


def build_plane(seed, w, d, h):
    """Airliner along +x. w=29, d=27, h=11."""
    r = random.Random(seed)
    tail = CONCRETE[r.choice(['red', 'blue', 'cyan', 'orange', 'magenta', 'green'])]
    a = np.full((h, d, w), KEEP, np.uint8)
    cz = d // 2
    L = w
    a[2:5, cz - 1:cz + 2, 2:L - 3] = WHITE
    a[3, cz, 0:2] = WHITE
    a[2:5, cz - 1:cz + 2, 1] = WHITE
    a[4, cz - 1:cz + 2, 1:3] = GLASSES[3]
    a[2, cz - 1:cz + 2, 1] = KEEP
    a[3, cz - 1:cz + 2, 0] = KEEP
    a[3, cz, 0] = WHITE
    xs = np.arange(4, L - 4, 2)
    a[4, cz - 1, xs] = GLASSES[0]
    a[4, cz + 1, xs] = GLASSES[0]
    a[3, cz - 1, 2:L - 3] = tail
    a[3, cz + 1, 2:L - 3] = tail
    for k in range(cz - 1):
        x0 = 9 + k // 2
        x1 = max(x0 + 1, 15 - k // 3)
        a[2, cz - 2 - k, x0:x1] = WHITE
        a[2, cz + 2 + k, x0:x1] = WHITE
    for s in (-5, 5):
        a[1:3, cz + s - 0:cz + s + 1, 10:14] = CONCRETE['light_gray']
    a[0:2, cz, 5] = RUNWAY
    a[0:2, cz - 2, 13] = RUNWAY
    a[0:2, cz + 2, 13] = RUNWAY
    a[5:10, cz, L - 6:L - 2] = tail
    a[6:10, cz, L - 2] = tail
    a[4, cz - 4:cz + 5, L - 5:L - 2] = WHITE
    a[4, cz, L - 5:L - 2] = tail
    return a, None


def build_lighthouse(seed, w, d, h):
    a = np.full((h, d, w), KEEP, np.uint8)
    Z, X = np.mgrid[0:d, 0:w]
    c = w // 2
    rr = np.hypot(X - c, Z - c)
    body_h = h - 8
    ring = (rr <= 3.4) & (rr > 2.4)
    inside = rr <= 2.4
    for y in range(body_h):
        a[y][ring] = CONCRETE['red'] if (y // 4) % 2 == 0 else WHITE
        a[y][inside] = AIR
    a[0][rr <= 3.4] = STONE_BRICKS
    a[body_h][rr <= 4.4] = STONE_BRICKS
    a[body_h + 1][(rr <= 4.4) & (rr > 3.6)] = IRON_BARS
    for y in range(body_h + 1, body_h + 5):
        a[y][(rr <= 3.2) & (rr > 2.2)] = GLASS
        a[y][rr <= 2.2] = AIR
    a[body_h + 1:body_h + 4, c, c] = SEA_LANTERN
    for k, y in enumerate(range(body_h + 5, h)):
        a[y][rr <= 3.4 - k * 1.1] = CONCRETE['red']
    return a, None


def build_stadium(seed, w, d, h):
    a = np.full((h, d, w), KEEP, np.uint8)
    Z, X = np.mgrid[0:d, 0:w]
    cx, cz = w / 2, d / 2
    A, Bb = w / 2 / 1.7, d / 2 / 1.7
    e = np.hypot((X - cx) / A, (Z - cz) / Bb)
    field = e < 1.0
    a[0][field] = GRASS
    a[0][field & ((np.abs(X - cx) < 0.6) | (np.abs(np.abs(X - cx) - A * 0.85) < 0.6))] = WHITE
    a[1:h][np.broadcast_to(field[None], (h - 1, d, w))] = AIR
    stands = (e >= 1.0) & (e < 1.6)
    top = np.clip(((e - 1.0) / 0.6 * (h - 6)).astype(int) + 1, 1, h - 5)
    yy = np.arange(h)[:, None, None]
    m = stands[None] & (yy <= top[None])
    a[m] = CONCRETE['light_gray']
    seat = stands[None] & (yy == top[None])
    a[seat] = np.where(np.broadcast_to(((X + Z) % 2 == 0)[None], a.shape)[seat], CONCRETE['blue'], WHITE)
    a[stands[None] & (yy > top[None]) & (yy < h)] = AIR
    wallm = (e >= 1.6) & (e < 1.7)
    a[np.broadcast_to(wallm[None], a.shape) & (yy < h - 2)] = WHITE
    a[np.broadcast_to(wallm[None], a.shape) & (yy == h - 3)] = SEA_LANTERN
    gate = wallm & (np.abs(Z - cz) < 2)
    a[np.broadcast_to(gate[None], a.shape) & (yy >= 1) & (yy <= 3)] = AIR
    return a, 0


def build_pier(seed, w, d, h, axis='x'):
    """Wooden pier at y=SEA+1 (array starts at y=SEA-7)."""
    a = np.full((h, d, w), KEEP, np.uint8)
    top = h - 2
    a[top, :, :] = SPRUCE_PLANKS
    if axis == 'x':
        for x in range(0, w, 5):
            a[0:top, 0, x] = SPRUCE_LOG
            a[0:top, d - 1, x] = SPRUCE_LOG
        a[top + 1, 0, :] = OAK_FENCE
        a[top + 1, d - 1, :] = OAK_FENCE
        for x in range(2, w, 10):
            a[top + 1, 0, x] = LANTERN
    else:
        for z in range(0, d, 5):
            a[0:top, z, 0] = SPRUCE_LOG
            a[0:top, z, w - 1] = SPRUCE_LOG
        a[top + 1, :, 0] = OAK_FENCE
        a[top + 1, :, w - 1] = OAK_FENCE
    return a, None


def build_lifeguard(seed, w, d, h):
    r = random.Random(seed)
    c = CONCRETE[r.choice(['yellow', 'pink', 'light_blue', 'lime', 'orange', 'magenta'])]
    a = np.full((h, d, w), KEEP, np.uint8)
    for x in (0, w - 1):
        for z in (0, d - 1):
            a[1:4, z, x] = OAK_FENCE
    a[4, :, :] = OAK_PLANKS
    a[5:7, :, :] = c
    a[5:7, 1:d - 1, 1:w - 1] = AIR
    a[6, 0, 1:w - 1] = GLASS
    a[7, :, :] = WHITE
    return a, 0


def build_barn(seed, w, d, h):
    r = random.Random(seed)
    a = np.full((h, d, w), KEEP, np.uint8)
    wall = r.choice([RED_TERRACOTTA, CONCRETE['red'], SPRUCE_PLANKS])
    a[:6] = tower_block(w, d, 5, wall, GLASS, HAY, wall, 'punched', 6, lights=False, door=False)[:6]
    a[1:5, 0, w // 2 - 2:w // 2 + 2] = AIR
    for k in range(h - 6):
        if w - 2 * k <= 0:
            break
        a[6 + k, :, k:w - k] = DARK_OAK
    return a, None


def build_park(seed, w, d, h):
    a = np.full((h, d, w), KEEP, np.uint8)
    a[0, d // 2 - 1:d // 2 + 2, :] = STONE_BRICKS
    a[0, :, w // 2 - 1:w // 2 + 2] = STONE_BRICKS
    cx, cz = w // 2, d // 2
    Z, X = np.mgrid[0:d, 0:w]
    rr = np.hypot(X - cx, Z - cz)
    a[0][rr <= 4.5] = QUARTZ
    a[1][(rr <= 4.5) & (rr > 3.5)] = QUARTZ
    a[0][rr <= 3.5] = WATER
    a[1:4, cz, cx] = QUARTZ
    a[4, cz, cx] = WATER
    return a, None


BUILDERS = {
    'glass': build_glass_tower, 'condo': build_condo, 'deco': build_deco, 'office': build_office,
    'shop': build_shop, 'warehouse': build_warehouse, 'containers': build_container_stack,
    'crane': build_crane, 'plane': build_plane, 'lighthouse': build_lighthouse, 'stadium': build_stadium,
    'lifeguard': build_lifeguard, 'barn': build_barn, 'park': build_park,
}


# --------------------------------------------------------------------------- the plan
class Plan:
    pass


def plan_world(S, seed):
    t0 = time.time()
    P = Plan()
    P.S = S
    rng = np.random.default_rng(seed)
    R = random.Random(seed)
    X = lambda u: int(round(u * S))
    v, u = np.mgrid[0:S, 0:S].astype(np.float32) / S

    n1 = fbm(S, rng, max(64, S // 6))
    n2 = fbm(S, rng, max(32, S // 16))
    n3 = fbm(S, rng, max(16, S // 48), 4)

    # ---- land shape
    land = ((u - 0.46) / 0.31) ** 2 + ((v - 0.44) / 0.36) ** 2 < 1 + 0.45 * n1
    land |= ((u - 0.50) / 0.10) ** 2 + ((v - 0.78) / 0.10) ** 2 < 1 + 0.5 * n1
    metro = (u > 0.48) & (u < 0.82) & (v > 0.17 + 0.02 * n2) & (v < 0.745 + 0.015 * n2)
    land |= metro
    land &= u < 0.795 + 0.004 * n3
    airport = (u > 0.575) & (u < 0.715) & (v > 0.205) & (v < 0.295)
    land |= airport
    barrier = (u > 0.830 + 0.003 * n3) & (u < 0.872 + 0.004 * n3) & (v > 0.20) & (v < 0.74)
    ends = ((v - 0.20) / 0.02) ** 2 + ((u - 0.851) / 0.021) ** 2 < 1
    ends |= ((v - 0.74) / 0.02) ** 2 + ((u - 0.851) / 0.021) ** 2 < 1
    barrier |= ends
    land |= barrier
    # keys along the overseas highway
    keys = np.zeros((S, S), bool)
    pts = [(0.555, v_) for v_ in np.linspace(0.86, 0.92, 3)] + [(u_, 0.92) for u_ in np.linspace(0.53, 0.14, 13)]
    key_centers = []
    for i, (ku, kv) in enumerate(pts):
        if i % 2 == 1 and i < len(pts) - 1:
            continue
        ru = R.uniform(0.010, 0.022) * (1.8 if i == len(pts) - 1 else 1)
        rv = R.uniform(0.008, 0.016) * (1.6 if i == len(pts) - 1 else 1)
        ku += R.uniform(-0.01, 0.01)
        kv2 = kv + R.uniform(-0.008, 0.008)
        keys |= ((u - ku) / ru) ** 2 + ((v - kv2) / rv) ** 2 < 1 + 0.6 * n3
        key_centers.append((ku, kv2))
    keys &= ~land
    land |= keys
    lake = (((u - 0.32) / 0.065) ** 2 + ((v - 0.27) / 0.05) ** 2 < 1 + 0.35 * n2) & land & ~metro
    land &= ~lake
    # clean small specks
    land = ndimage.binary_opening(land, iterations=2) | airport | barrier

    # ---- zones
    zone = np.full((S, S), Z_OCEAN, np.uint8)
    zone[land] = Z_WILD
    farm = land & (v < 0.25) & (u < 0.56)
    zone[farm] = Z_FARM
    swamp = land & (((u - 0.33) / 0.15) ** 2 + ((v - 0.62) / 0.13) ** 2 < 1 + 0.4 * n2)
    zone[swamp] = Z_SWAMP
    town = land & (((u - 0.215) / 0.055) ** 2 + ((v - 0.385) / 0.045) ** 2 < 1)
    zone[town] = Z_TOWN
    sub = land & (u > 0.48) & (u < 0.80) & (v > 0.15) & (v < 0.75) & ~swamp
    zone[sub] = Z_SUB
    city = land & (u > 0.575) & (u < 0.80) & (v > 0.32) & (v < 0.665)
    zone[city] = Z_CITY
    zone[airport] = Z_AIR
    port = land & (u > 0.675) & (u < 0.80) & (v > 0.665)
    zone[port] = Z_PORT
    zone[keys] = Z_KEYS
    zone[barrier] = Z_RESORT
    zone[lake] = Z_LAKE

    water = ~land
    dw = ndimage.distance_transform_edt(land)          # land: distance to water
    dl = ndimage.distance_transform_edt(water)         # water: distance to land
    ocean_d = ndimage.distance_transform_edt(~(water & ~lake))  # distance to sea (not lake)
    print(f'  shape + zones   {time.time() - t0:5.1f}s', flush=True)

    # ---- heights & surface
    H = np.zeros((S, S), np.int16)
    hill = np.clip((n2 + 0.15) * 9, 0, 5) * np.clip(dw / 40, 0, 1)
    H[land] = (63 + (dw >= 4) + hill)[land].astype(np.int16)
    flat = np.isin(zone, [Z_CITY, Z_SUB, Z_AIR, Z_PORT, Z_TOWN])
    H[flat] = 64
    H[flat & (dw < 3) & ~np.isin(zone, [Z_CITY, Z_PORT, Z_AIR])] = 63
    sw = zone == Z_SWAMP
    swh = 61 + (n3 > -0.08).astype(np.int16) + (n3 > 0.12).astype(np.int16)
    H[sw] = np.minimum(swh, 63 + (dw >= 4))[sw]
    res = zone == Z_RESORT
    H[res] = (63 + (dw >= 5) + (dw >= 12))[res].astype(np.int16)
    kz = zone == Z_KEYS
    H[kz] = (63 + (dw >= 6))[kz].astype(np.int16)
    H[water] = (SEA - 1 - np.clip(dl / 4, 0, 6))[water].astype(np.int16)
    H[lake] = (SEA - 1 - np.clip(dl / 3, 0, 7))[lake].astype(np.int16)

    TOP = np.full((S, S), GRASS, np.uint8)
    SUB = np.full((S, S), DIRT, np.uint8)
    beachy = land & (ocean_d <= 7 + 3 * (n3 + 0.3)) & np.isin(zone, [Z_WILD, Z_FARM, Z_SUB, Z_TOWN, Z_KEYS, Z_RESORT])
    beachy |= res & (dw < 14)
    beachy |= kz & (dw < 9)
    TOP[beachy] = SAND
    SUB[beachy] = SAND
    TOP[sw & (H <= 62)] = MUD
    SUB[sw] = MUD
    TOP[water] = SAND
    SUB[water] = SAND
    TOP[water & (n3 > 0.35)] = GRAVEL
    near_swamp = ndimage.binary_dilation(sw, iterations=12)
    TOP[water & near_swamp] = MUD
    TOP[lake] = CLAY
    TOP[zone == Z_PORT] = APRON
    seawall = np.isin(zone, [Z_CITY, Z_PORT, Z_AIR]) & (dw < 2)
    TOP[seawall] = STONE_BRICKS
    # coral reefs around the keys
    near_keys = ndimage.distance_transform_edt(~keys) < 90
    reef = water & near_keys & (n3 > 0.15) & (H < SEA - 1)
    cor = rng.integers(0, len(CORALS), size=(S, S))
    TOP[reef] = np.array(CORALS, np.uint8)[cor[reef]]

    biome = np.full((S, S), BI_JUNGLE, np.uint8)
    biome[water] = BI_OCEAN
    biome[lake] = BI_RIVER
    biome[zone == Z_FARM] = BI_PLAINS
    biome[sw] = BI_SWAMP
    biome[beachy | kz] = BI_BEACH

    P.H, P.TOP, P.SUB, P.zone, P.biome = H, TOP, SUB, zone, biome
    P.land = land
    P.road = np.zeros((S, S), np.uint8)
    P.cov = np.zeros((S, S), np.uint8)
    P.edge = np.zeros((S, S), np.uint8)
    P.pillar = np.zeros((S, S), bool)
    P.lamp = np.zeros((S, S), bool)
    P.deco = np.zeros((S, S), np.uint8)
    P.occ = np.zeros((S, S), bool)
    P.structs = []
    P.trees = []
    print(f'  terrain         {time.time() - t0:5.1f}s', flush=True)

    # ---- roads
    HW = 'WAAwAAAMMMMAAAwAAW'                       # 18-wide divided highway with palm median
    BR = 'WAAAAYAAAAW'                              # overseas bridge
    ST = 'SSAAAAYAAAASS'                            # city street
    SB = 'SAAAyAAAS'                                # suburban street
    FR = 'AAAyAAA'                                  # farm road
    hw_rows = []

    def road(axis, c, a0, a1, spec, mask=None, lamps=False, dash=4):
        n = len(spec)
        r0 = c - n // 2
        a0, a1 = max(0, a0), min(S, a1)
        if a1 <= a0:
            return
        along = np.arange(a0, a1)
        for k, ch in enumerate(spec):
            row = r0 + k
            if row < 0 or row >= S:
                continue
            if ch == 'A':
                codes = np.full(len(along), R_ASPH)
            elif ch == 'W':
                codes = np.full(len(along), R_WHITE)
            elif ch == 'w':
                codes = np.where((along // dash) % 2 == 0, R_WHITE, R_ASPH)
            elif ch == 'Y':
                codes = np.full(len(along), R_YEL)
            elif ch == 'y':
                codes = np.where((along // dash) % 2 == 0, R_YEL, R_ASPH)
            elif ch == 'S':
                codes = np.full(len(along), R_SIDE)
            elif ch == 'M':
                codes = np.full(len(along), R_MED)
            elif ch == 'R':
                codes = np.full(len(along), R_RUN)
            elif ch == 'r':
                codes = np.where((along // 6) % 3 == 0, R_WHITE, R_RUN)
            sl = (row, slice(a0, a1)) if axis == 'x' else (slice(a0, a1), row)
            m = np.ones(len(along), bool) if mask is None else mask[sl].copy()
            P.cov[sl] += m
            P.road[sl][m] = codes[m]
            if k in (0, n - 1):
                P.edge[sl][m] = 1 if axis == 'x' else 2
            if n // 3 <= k < n - n // 3:
                P.pillar[sl][m & ((along % 24) < 2)] = True
            if lamps and k in (0, n - 1):
                P.lamp[sl][m & ((along % 24) == 12)] = True
            if ch == 'M' and spec[k - 1] == 'M' and k + 2 < n and spec[k + 2] != 'M':
                for a in along[m & (along % 14 == 7)]:
                    P.trees.append((a, row) if axis == 'x' else (row, a))
        if spec == HW:
            hw_rows.append((axis, c))

    hw_x = X(0.555)
    road('z', hw_x, X(0.12), X(0.92) + 6, HW)                       # coastal highway north-south
    road('x', X(0.40), X(0.19), X(0.797), HW)                       # route across to Gulf Harbor
    road('x', X(0.60), X(0.19), hw_x, HW)                           # Sawgrass Alley
    road('x', X(0.92), X(0.12), hw_x + 9, BR, dash=6)               # overseas highway (keys)
    road('z', hw_x, X(0.86), X(0.92), BR)
    for cv in (0.30, 0.47, 0.62):                                   # causeways
        road('x', X(cv), X(0.70), X(0.843), ST, lamps=True)
    road('z', X(0.843), X(0.195), X(0.745), ST, mask=land, lamps=True)   # beach boulevard

    def grid(zmask, x0, x1, z0, z1, step, spec, lamps):
        avoid_x = [c for ax, c in hw_rows if ax == 'z']
        avoid_z = [c for ax, c in hw_rows if ax == 'x']
        xs = [x for x in range(x0, x1, step) if all(abs(x - a) > step // 2 for a in avoid_x)]
        zs = [z for z in range(z0, z1, step) if all(abs(z - a) > step // 2 for a in avoid_z)]
        for x in xs:
            road('z', x, z0 - 6, z1 + 6, spec, mask=zmask, lamps=lamps)
        for z in zs:
            road('x', z, x0 - 6, x1 + 6, spec, mask=zmask, lamps=lamps)
        # highways crossing the area also bound the blocks
        xs += [a for a in avoid_x if x0 - step < a < x1 + step]
        zs += [a for a in avoid_z if z0 - step < a < z1 + step]
        return sorted(xs), sorted(zs)

    city_m = land & (zone == Z_CITY)
    cxs, czs = grid(city_m, X(0.585), X(0.80), X(0.325), X(0.67), 64, ST, True)
    sub_m = land & (zone == Z_SUB)
    sxs, szs = grid(sub_m, X(0.48), X(0.80), X(0.15), X(0.75), 48, SB, False)
    town_m = land & (zone == Z_TOWN)
    txs, tzs = grid(town_m, X(0.15), X(0.28), X(0.33), X(0.44), 40, SB, True)
    farm_m = land & np.isin(zone, [Z_FARM, Z_WILD])
    for fz in (0.13, 0.20):
        road('x', X(fz), X(0.12), hw_x, FR, mask=farm_m)
    for fx in (0.24, 0.42):
        road('z', X(fx), X(0.08), X(0.40), FR, mask=farm_m)
    # airport
    ax0, ax1, az0 = X(0.575), X(0.715), X(0.205)
    rw_z = az0 + 30
    road('x', rw_z, ax0 + 14, ax1 - 14, 'RWRRRRRRRRRrRRRRRRRRRWR')
    tx_z = rw_z + 32
    road('x', tx_z, ax0 + 20, ax1 - 20, 'AAAAAYAAAAA')
    for tx in (ax0 + 26, ax1 - 26, (ax0 + ax1) // 2):
        road('z', tx, rw_z, tx_z, 'AAAAAYAAAAA')
    term_z0 = tx_z + 34
    acc_z = term_z0 + 34
    road('x', acc_z, hw_x, ax1 - 10, SB, lamps=True)
    inter = (P.cov >= 2) & (P.road > 0)
    P.road[inter & (P.road != R_RUN)] = R_ASPH
    # runway threshold stripes
    for xx in (ax0 + 15, ax1 - 27):
        for k in range(-10, 11, 3):
            P.road[rw_z + k:rw_z + k + 2, xx:xx + 12] = R_WHITE
    rdm = P.road > 0
    landroad = rdm & (H >= SEA)
    H[landroad] = np.maximum(H[landroad], 64)
    TOP[landroad] = ROAD_MAT[P.road[landroad]]
    SUB[landroad & (H > 63)] = DIRT
    P.occ |= rdm
    zone_air = zone == Z_AIR
    TOP[zone_air & ~rdm & (np.abs(v * S - (tx_z + 20)) < 12)] = APRON
    print(f'  roads           {time.time() - t0:5.1f}s', flush=True)

    # ---- structures
    def add(kind, x0, z0, w, d, h, oy=None, seed_=None, mark=True, **kw):
        if x0 < 0 or z0 < 0 or x0 + w > S or z0 + d > S:
            return False
        if oy is None:
            oy = int(H[z0 + d // 2, x0 + w // 2])
        P.structs.append((x0, z0, w, d, h, oy, kind, R.randrange(1 << 30) if seed_ is None else seed_, kw))
        if mark:
            P.occ[z0:z0 + d, x0:x0 + w] = True
        return True

    def free(x0, z0, w, d, need_land=True):
        if x0 < 0 or z0 < 0 or x0 + w > S or z0 + d > S:
            return False
        if P.occ[z0:z0 + d, x0:x0 + w].any():
            return False
        if need_land and not (H[z0:z0 + d, x0:x0 + w] >= SEA).all():
            return False
        return True

    def blocks_between(xs, zs, half):
        xs, zs = sorted(xs), sorted(zs)
        for xa, xb in zip(xs, xs[1:]):
            for za, zb in zip(zs, zs[1:]):
                yield xa + half + 1, za + half + 1, xb - half - 1, zb - half - 1

    # landmarks first
    st_x, st_z = X(0.60), X(0.53)
    if free(st_x, st_z, 104, 80):
        add('stadium', st_x, st_z, 104, 80, 26, oy=64)
        H[st_z:st_z + 80, st_x:st_x + 104] = 64
    # airport buildings
    add('office', ax0 + 40, term_z0, 150, 24, 14, oy=64, style='terminal')
    add('glass', ax1 - 60, term_z0 - 2, 9, 9, 44, oy=64)
    for i, hx in enumerate(range(ax0 + 200, ax1 - 70, 42)):
        if free(hx, term_z0, 36, 26, need_land=False):
            add('warehouse', hx, term_z0, 36, 26, 14, oy=64)
    for px in range(ax0 + 45, ax0 + 170, 40):
        add('plane', px, tx_z + 7, 29, 27, 11, oy=64, mark=False)
    add('plane', ax0 + 60, rw_z - 13, 29, 27, 11, oy=64, mark=False)

    # city blocks
    dcx, dcz = 0.705, 0.47
    for bx0, bz0, bx1, bz1 in blocks_between(cxs + [X(0.797)], czs, 9):
        bw, bd = bx1 - bx0 + 1, bz1 - bz0 + 1
        if bw < 12 or bd < 12:
            continue
        split = R.random()
        lots = []
        if split < 0.45 and bw >= 40 and bd >= 40:
            hw_, hd_ = bw // 2, bd // 2
            lots = [(bx0, bz0, hw_, hd_), (bx0 + hw_, bz0, bw - hw_, hd_),
                    (bx0, bz0 + hd_, hw_, bd - hd_), (bx0 + hw_, bz0 + hd_, bw - hw_, bd - hd_)]
        elif split < 0.75 and bw >= 40:
            hw_ = bw // 2
            lots = [(bx0, bz0, hw_, bd), (bx0 + hw_, bz0, bw - hw_, bd)]
        else:
            lots = [(bx0, bz0, bw, bd)]
        for lx, lz, lw, ld in lots:
            sb = R.randint(1, 3)
            fx, fz, fw, fd = lx + sb, lz + sb, lw - 2 * sb, ld - 2 * sb
            if fw < 8 or fd < 8 or not free(fx, fz, fw, fd):
                continue
            uu, vv = (fx + fw / 2) / S, (fz + fd / 2) / S
            dd = math.hypot(uu - dcx, (vv - dcz) * 0.8)
            waterfront = uu > 0.765
            if R.random() < 0.08:
                add('park', fx, fz, fw, fd, 6)
                for _ in range(max(2, fw * fd // 120)):
                    P.trees.append((R.randrange(fx + 1, fx + fw - 1), R.randrange(fz + 1, fz + fd - 1)))
                continue
            if dd < 0.1:
                TOP[lz:lz + ld, lx:lx + lw][~P.occ[lz:lz + ld, lx:lx + lw]] = SIDEWALK
            if waterfront:
                add('condo', fx, fz, min(fw, 22), min(fd, 26), R.randint(40, 115))
            elif dd < 0.035:
                add('glass', fx, fz, fw, fd, R.randint(90, 185))
            elif dd < 0.07:
                add(R.choice(['glass', 'glass', 'office', 'condo']), fx, fz, fw, fd, R.randint(45, 110))
            elif dd < 0.11:
                add(R.choice(['office', 'condo', 'deco', 'glass']), fx, fz, fw, fd, R.randint(20, 60))
            else:
                add(R.choice(['office', 'deco', 'deco', 'shop']), fx, fz, fw, fd, R.randint(9, 28))
    print(f'  city            {time.time() - t0:5.1f}s', flush=True)

    # port
    pmask = zone == Z_PORT
    pz, px = np.nonzero(pmask)
    if len(pz):
        px0, px1, pz0, pz1 = px.min(), px.max(), pz.min(), pz.max()
        for wx in range(px0 + 4, px1 - 40, 46):
            if free(wx, pz0 + 6, 40, 24):
                add('warehouse', wx, pz0 + 6, 40, 24, R.randint(10, 16))
        for cx_ in range(px0 + 6, px1 - 30, 30):
            for cz_ in range(pz0 + 40, pz1 - 40, 36):
                if free(cx_, cz_, 24, 31):
                    add('containers', cx_, cz_, 24, 31, 3)
        # cranes at the south quay
        for cx_ in range(px0 + 10, px1 - 12, 34):
            col = pmask[:, cx_ + 6]
            zs_ = np.nonzero(col)[0]
            if len(zs_):
                qz = zs_.max() - 9
                add('crane', cx_, qz, 12, 44, 34, oy=64, mark=False)

    # barrier island: hotels + beach furniture
    bx = X(0.843) + 8
    zz = X(0.205)
    while zz < X(0.735):
        hw_ = R.randint(16, 30)
        dep = R.randint(14, 22)
        if free(bx, zz, dep, hw_) and (zone[zz:zz + hw_, bx:bx + dep] == Z_RESORT).all():
            if R.random() < 0.65:
                add('deco', bx, zz, dep, hw_, R.randint(10, 26))
            else:
                add('condo', bx, zz, dep, hw_, R.randint(30, 70))
        zz += hw_ + R.randint(3, 8)
    for zz in range(X(0.21), X(0.73), 3):
        row = np.nonzero((zone[zz] == Z_RESORT) & (TOP[zz] == SAND) & ~P.occ[zz])[0]
        row = row[row > X(0.843) + 8]
        if len(row) < 6:
            continue
        r_ = R.random()
        xb = R.choice(list(row[:-4]))
        if r_ < 0.10:
            P.trees.append((xb, zz))
        elif r_ < 0.22:
            P.trees.append((xb, zz, T_UMBRELLA))
    for zz in range(X(0.23), X(0.72), 110):
        row = np.nonzero((zone[zz] == Z_RESORT) & (TOP[zz] == SAND))[0]
        if len(row) > 10:
            x_ = int(row.max()) - 8
            if free(x_, zz, 4, 4):
                add('lifeguard', x_, zz, 4, 4, 8)
    # marina piers along the city's lagoon shore
    for zz in range(X(0.34), X(0.66), 48):
        x_ = X(0.797) + 1
        if not P.occ[zz:zz + 4, x_:x_ + 22].any() and (H[zz:zz + 4, x_ + 2:x_ + 22] < SEA).all():
            add('pier', x_, zz, 22, 4, 10, oy=SEA - 7, axis='x')

    # suburbs: houses with pools
    for bx0, bz0, bx1, bz1 in blocks_between(sxs, szs, 9):
        for lx in range(bx0, bx1 - 11, 13):
            for lz, flip in ((bz0, 0), (bz0 + (bz1 - bz0 + 1) // 2, 1)):
                ld = (bz1 - bz0 + 1) // 2
                if ld < 14 or not free(lx, lz, 12, ld):
                    continue
                if not (zone[lz:lz + ld, lx:lx + 12] == Z_SUB).all():
                    continue
                add('house', lx, lz, 12, ld, 12)
                if R.random() < 0.5:
                    P.trees.append((lx + R.choice([1, 10]), lz + R.choice([1, ld - 2])))
    # Gulf Harbor town
    for bx0, bz0, bx1, bz1 in blocks_between(txs, tzs, 9):
        for lx in range(bx0, bx1 - 9, 12):
            for lz in (bz0, bz1 - 11):
                if free(lx, lz, 11, 11) and (zone[lz:lz + 11, lx:lx + 11] == Z_TOWN).all():
                    if R.random() < 0.5:
                        add('shop', lx, lz, 11, 11, R.choice([5, 9]))
                    else:
                        add('house', lx, lz, 11, 11, 12)
    # town fishing pier into the gulf
    tz_ = X(0.385)
    tx_ = np.nonzero(land[tz_])[0].min() if land[tz_].any() else 0
    add('pier', max(0, tx_ - 70), tz_, 72, 5, 10, oy=SEA - 7, axis='x')

    # keys: stilt houses + lighthouse
    for ku, kv in key_centers:
        cx_, cz_ = X(ku), X(kv)
        for _ in range(3):
            hx, hz = cx_ + R.randint(-20, 20), cz_ + R.randint(-12, 12)
            if free(hx, hz, 11, 13) and (zone[hz:hz + 13, hx:hx + 11] == Z_KEYS).all():
                add('house', hx, hz, 11, 13, 16, stilts=2)
    lku, lkv = key_centers[-1]
    lz_ = X(lkv)
    cols = np.nonzero(land[lz_])[0]
    cols = cols[cols < X(lku)]
    if len(cols):
        lx_ = int(cols.min()) + 4
        add('lighthouse', lx_, lz_ - 5, 11, 11, 38, oy=int(H[lz_, lx_ + 5]))

    # farms: fields, barns, orange groves
    fm = (zone == Z_FARM) & ~P.occ & (H >= 63)
    for _ in range(int(S * S / 9000)):
        x0, z0 = R.randrange(S), R.randrange(int(S * 0.26))
        w_, d_ = R.randint(24, 60), R.randint(18, 40)
        if x0 + w_ >= S or z0 + d_ >= S or not fm[z0:z0 + d_, x0:x0 + w_].all():
            continue
        kind = R.random()
        if kind < 0.65:
            crop = R.choice(CROPS)
            rows = (np.arange(z0, z0 + d_) - z0) % 9 == 4
            Hf = H[z0:z0 + d_, x0:x0 + w_]
            Hf[:] = Hf.max()
            TOP[z0:z0 + d_, x0:x0 + w_] = FARMLAND
            P.deco[z0:z0 + d_, x0:x0 + w_] = crop
            TOP[z0:z0 + d_, x0:x0 + w_][rows] = WATER
            P.deco[z0:z0 + d_, x0:x0 + w_][rows] = 0
        else:
            for gz in range(z0 + 2, z0 + d_ - 2, 6):
                for gx in range(x0 + 2, x0 + w_ - 2, 6):
                    P.trees.append((gx, gz, T_GROVE))
        fm[z0:z0 + d_, x0:x0 + w_] = False
        P.occ[z0:z0 + d_, x0:x0 + w_] = True
        if R.random() < 0.35 and free(x0 + w_ + 3, z0, 13, 17):
            add('barn', x0 + w_ + 3, z0, 13, 17, 13)
    print(f'  structures      {time.time() - t0:5.1f}s ({len(P.structs)} buildings)', flush=True)

    # ---- trees & ground cover
    free_ground = ~P.occ & (H >= SEA)

    def scatter(mask, density, ttype):
        idx = np.flatnonzero(mask & (rng.random((S, S)) < density))
        zs_, xs_ = np.divmod(idx, S)
        for x_, z_ in zip(xs_, zs_):
            P.trees.append((int(x_), int(z_), ttype))

    wild = free_ground & (zone == Z_WILD)
    scatter(wild & (TOP == GRASS) & (n2 > -0.1), 0.004, T_OAK)
    scatter(wild & (TOP == GRASS), 0.003, T_PALM)
    scatter(wild & (TOP == GRASS), 0.006, T_BUSH)
    scatter(free_ground & (TOP == SAND) & np.isin(zone, [Z_WILD, Z_KEYS, Z_SUB, Z_TOWN]), 0.006, T_PALM)
    scatter(free_ground & np.isin(zone, [Z_CITY, Z_SUB, Z_TOWN]) & (TOP == GRASS), 0.004, T_PALM)
    swampm = (zone == Z_SWAMP) & ~P.occ
    scatter(swampm, 0.008, T_MANGROVE)
    scatter(swampm & (H >= 62), 0.003, T_CYPRESS)
    scatter(free_ground & (zone == Z_FARM) & (TOP == GRASS), 0.0006, T_OAK)
    gm = free_ground & (TOP == GRASS) & (P.deco == 0)
    rnd = rng.random((S, S))
    P.deco[gm & (rnd < 0.18)] = SHORT_GRASS
    P.deco[gm & (rnd < 0.03) & (zone == Z_SWAMP)] = FERN
    fl = gm & (rnd > 0.985) & ~np.isin(zone, [Z_AIR])
    P.deco[fl] = np.array(FLOWERS, np.uint8)[rng.integers(0, len(FLOWERS), (S, S))[fl]]
    shallow = (H < SEA - 1) & (H > SEA - 7) & ~lake & np.isin(TOP, [SAND, GRAVEL, MUD])
    P.deco[shallow & (rnd < 0.12)] = SEAGRASS
    lily = (zone == Z_SWAMP) & (H < SEA) & (rnd > 0.88) & (P.road == 0)
    P.deco[lily] = LILY
    P.deco[P.road > 0] = 0
    print(f'  vegetation      {time.time() - t0:5.1f}s ({len(P.trees)} trees)', flush=True)

    tr = np.array([(t[0], t[1], t[2] if len(t) > 2 else T_PALM) for t in P.trees], np.int32).reshape(-1, 3)
    P.trees = tr
    P.tree_seed = rng.integers(0, 1 << 30, len(tr))

    # spawn on Coral Strand beach next to the middle causeway
    sz_ = X(0.47) + 16
    row = np.nonzero((zone[sz_] == Z_RESORT) & (TOP[sz_] == SAND) & ~P.occ[sz_])[0]
    sx_ = int(row.max()) - 12 if len(row) else X(0.86)
    P.spawn = (sx_, int(H[sz_, sx_]) + 1, sz_)
    P.key_centers = key_centers
    return P


# --------------------------------------------------------------------------- region rendering
class Canvas:
    def __init__(self, x0, z0):
        self.x0, self.z0 = x0, z0
        self.a = np.zeros((NY, RS, RS), np.uint8)

    def set(self, x, y, z, b):
        x -= self.x0
        z -= self.z0
        if 0 <= x < RS and 0 <= z < RS and YMIN <= y < YMAX:
            self.a[y - YMIN, z, x] = b

    def blit(self, x, y, z, sub):
        h, d, w = sub.shape
        x -= self.x0
        z -= self.z0
        y -= YMIN
        sx0, sz0, sy0 = max(0, -x), max(0, -z), max(0, -y)
        sx1, sz1, sy1 = min(w, RS - x), min(d, RS - z), min(h, NY - y)
        if sx1 <= sx0 or sz1 <= sz0 or sy1 <= sy0:
            return
        s = sub[sy0:sy1, sz0:sz1, sx0:sx1]
        v = self.a[y + sy0:y + sy1, z + sz0:z + sz1, x + sx0:x + sx1]
        m = s != KEEP
        v[m] = s[m]


def draw_tree(c, x, y, z, t, seed):
    r = random.Random(seed)
    if t == T_PALM:
        h = r.randint(6, 10)
        dx, dz = r.choice([(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)])
        for k in range(h):
            off = 1 if k > h // 2 else 0
            c.set(x + dx * off, y + k, z + dz * off, JUNGLE_LOG)
        tx, ty, tz = x + dx, y + h, z + dz
        c.set(tx, ty, tz, JUNGLE_LEAVES)
        c.set(tx, ty - 1, tz, JUNGLE_LOG)
        for ax, az in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            L = 3 if ax and az else 4
            for k in range(1, L + 1):
                c.set(tx + ax * k, ty - (1 if k >= L - 1 else 0) - (1 if k == L else 0) + 0, tz + az * k, JUNGLE_LEAVES)
    elif t == T_OAK:
        h = r.randint(4, 6)
        for k in range(h):
            c.set(x, y + k, z, OAK_LOG)
        rad = r.randint(3, 4)
        for ly in range(h - 2, h + 2):
            rr = rad - (1 if ly >= h + 1 else 0) - (1 if ly == h - 2 else 0)
            for ox in range(-rr, rr + 1):
                for oz in range(-rr, rr + 1):
                    if ox * ox + oz * oz <= rr * rr + 1 and r.random() < 0.92:
                        if not (ox == 0 and oz == 0 and ly < h):
                            c.set(x + ox, y + ly, z + oz, OAK_LEAVES)
    elif t == T_BUSH:
        c.set(x, y, z, r.choice([OAK_LEAVES, AZALEA_LEAVES, JUNGLE_LEAVES]))
        if r.random() < 0.4:
            c.set(x + 1, y, z, OAK_LEAVES)
    elif t == T_GROVE:
        c.set(x, y, z, OAK_LOG)
        c.set(x, y + 1, z, OAK_LOG)
        for ox in range(-2, 3):
            for oz in range(-2, 3):
                for oy in range(1, 4):
                    if ox * ox + oz * oz + (oy - 2) ** 2 <= 4 and not (ox == 0 and oz == 0 and oy < 2):
                        c.set(x + ox, y + oy, z + oz, AZALEA_LEAVES if r.random() < 0.3 else OAK_LEAVES)
    elif t == T_MANGROVE:
        base = y
        for k in range(0, max(0, SEA + 1 - y) + 2):
            for ox, oz in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
                if k < 2 or (ox == 0 and oz == 0):
                    c.set(x + ox, base + k, z + oz, MANGROVE_ROOTS)
        top = max(y, SEA + 1) + 2
        h = r.randint(3, 5)
        for k in range(h):
            c.set(x, top + k, z, MANGROVE_LOG)
        for ox in range(-3, 4):
            for oz in range(-3, 4):
                for oy in range(h - 1, h + 2):
                    if ox * ox + oz * oz <= (9 if oy == h else 5) and r.random() < 0.9:
                        if not (ox == 0 and oz == 0 and oy < h):
                            c.set(x + ox, top + oy, z + oz, MANGROVE_LEAVES)
    elif t == T_CYPRESS:
        h = r.randint(9, 13)
        for k in range(h):
            c.set(x, y + k, z, SPRUCE_LOG)
        for k in range(h - 5, h + 1):
            rr = 1 if k > h - 2 else 2
            for ox in range(-rr, rr + 1):
                for oz in range(-rr, rr + 1):
                    if abs(ox) + abs(oz) <= rr and not (ox == 0 and oz == 0 and k < h):
                        c.set(x + ox, y + k, z + oz, SPRUCE_LEAVES)
    elif t == T_UMBRELLA:
        col = WOOL[r.choice(['red', 'yellow', 'light_blue', 'pink', 'lime', 'orange', 'white', 'cyan'])]
        for k in range(3):
            c.set(x, y + k, z, OAK_FENCE)
        for ox in range(-1, 2):
            for oz in range(-1, 2):
                c.set(x + ox, y + 3, z + oz, col)
        c.set(x + 1, y - 1, z + 2, WOOL[r.choice(DYES)])


def render_region(P, rx, rz):
    S = P.S
    x0, z0 = rx * RS, rz * RS
    sl = (slice(z0, z0 + RS), slice(x0, x0 + RS))
    H = P.H[sl].astype(np.int32)
    TOP, SUB = P.TOP[sl], P.SUB[sl]
    c = Canvas(x0, z0)
    a = c.a
    hmin, hmax = int(H.min()), int(H.max())
    for yi in range(NY):
        Y = YMIN + yi
        if Y > hmax and Y > SEA:
            break
        L = a[yi]
        if Y == YMIN:
            L[:] = BEDROCK
            continue
        if Y < hmin - 4:
            L[:] = DEEPSLATE if Y < 0 else STONE
            continue
        L[Y < H - 4] = DEEPSLATE if Y < 0 else STONE
        m = (Y >= H - 4) & (Y < H)
        L[m] = SUB[m]
        m = Y == H
        L[m] = TOP[m]
        L[(Y > H) & (Y <= SEA)] = WATER

    # bridges over water
    road = P.road[sl]
    br = (road > 0) & (H < SEA)
    zi, xi = np.nonzero(br)
    a[64 - YMIN, zi, xi] = ROAD_MAT[road[zi, xi]]
    a[63 - YMIN, zi, xi] = STONE_BRICKS
    edge = P.edge[sl]
    ez, ex = np.nonzero(br & (edge > 0))
    a[65 - YMIN, ez, ex] = np.where(edge[ez, ex] == 1, RAIL_X, RAIL_Z)
    pl = br & P.pillar[sl]
    for zz, xx in zip(*np.nonzero(pl)):
        a[H[zz, xx] + 1 - YMIN:63 - YMIN, zz, xx] = STONE_BRICKS
    # street lamps
    for zz, xx in zip(*np.nonzero(P.lamp[sl] & (H >= SEA))):
        y = H[zz, xx] + 1
        a[y - YMIN:y + 3 - YMIN, zz, xx] = POST
        a[y + 3 - YMIN, zz, xx] = LANTERN
    # ground decoration
    deco = P.deco[sl]
    dz_, dx_ = np.nonzero(deco)
    d = deco[dz_, dx_]
    dy = np.where(d == LILY, SEA + 1, H[dz_, dx_] + 1)
    a[dy - YMIN, dz_, dx_] = d

    # buildings
    for (bx, bz, w, dd, h, oy, kind, seed, kw) in P.structs:
        if bx + w <= x0 or bx >= x0 + RS or bz + dd <= z0 or bz >= z0 + RS:
            continue
        if kind == 'house':
            arr, off = build_house_lot(seed, w, dd, kw.get('stilts', 0))
        elif kind == 'pier':
            arr, off = build_pier(seed, w, dd, h, kw.get('axis', 'x'))
        elif kind == 'office' and kw.get('style') == 'terminal':
            arr = tower_block(w, dd, h, CONCRETE['white'], GLASSES[0], CONCRETE['white'], CONCRETE['light_gray'], 'band', 7)
            off = None
        else:
            arr, off = BUILDERS[kind](seed, w, dd, h)
        y0 = oy + (off or 0)
        c.blit(bx, y0, bz, arr)

    # trees
    tr = P.trees
    m = (tr[:, 0] >= x0 - 6) & (tr[:, 0] < x0 + RS + 6) & (tr[:, 1] >= z0 - 6) & (tr[:, 1] < z0 + RS + 6)
    for (tx, tz, tt), sd in zip(tr[m], P.tree_seed[m]):
        gy = int(P.H[tz, tx])
        if tt != T_MANGROVE and gy < SEA:
            continue
        draw_tree(c, int(tx), gy + 1, int(tz), int(tt), int(sd))
    return a


def pack_bits(idx, bits):
    vpl = 64 // bits
    n = idx.size
    nl = -(-n // vpl)
    p = np.zeros(nl * vpl, np.uint64)
    p[:n] = idx.ravel()
    p = p.reshape(nl, vpl) << (np.arange(vpl, dtype=np.uint64) * np.uint64(bits))
    return np.bitwise_or.reduce(p, axis=1).view(np.int64)


PALETTE_RAW = None
BIOME_NAMES = BIOMES


def encode_chunk(a, biome2d, cx, cz):
    """a: (NY,16,16) blocks for the chunk; biome2d: (16,16) biome codes."""
    lut = np.zeros(256, np.uint64)
    # biomes (same for every section in the chunk)
    bs = biome2d[2::4, 2::4]
    bu = np.unique(bs)
    if len(bu) == 1:
        bio = {'palette': List(8, [BIOME_NAMES[bu[0]]])}
    else:
        blut = np.zeros(256, np.uint64)
        blut[bu] = np.arange(len(bu))
        idx = np.tile(blut[bs].ravel(), 4)
        bio = {'palette': List(8, [BIOME_NAMES[b] for b in bu]),
               'data': LongArray(pack_bits(idx, max(1, (len(bu) - 1).bit_length())))}
    bio_raw = Raw(payload(bio))
    sections = []
    for sy in range(NY // 16):
        sec = a[sy * 16:(sy + 1) * 16]
        u = np.unique(sec)
        if len(u) == 1:
            bsd = {'palette': List(10, [PALETTE_RAW[u[0]]])}
        else:
            lut[u] = np.arange(len(u), dtype=np.uint64)
            bits = max(4, (len(u) - 1).bit_length())
            bsd = {'palette': List(10, [PALETTE_RAW[i] for i in u]),
                   'data': LongArray(pack_bits(lut[sec], bits))}
        sections.append({'Y': Byte(sy + YMIN // 16), 'block_states': bsd, 'biomes': bio_raw})
    root = {
        'DataVersion': Int(DATA_VERSION), 'xPos': Int(cx), 'zPos': Int(cz), 'yPos': Int(YMIN // 16),
        'Status': 'minecraft:full', 'LastUpdate': Long(0), 'InhabitedTime': Long(0),
        'isLightOn': Byte(0), 'sections': List(10, sections),
        'block_entities': List(10, []), 'Heightmaps': {},
        'block_ticks': List(10, []), 'fluid_ticks': List(10, []), 'PostProcessing': List(9, []),
        'structures': {'starts': {}, 'References': {}},
    }
    return zlib.compress(nbt_bytes(root), 6)


def write_region(path, chunks):
    loc = bytearray(4096)
    ts = bytearray(4096)
    body = bytearray()
    sector = 2
    now = int(time.time())
    for (lx, lz), data in chunks.items():
        blob = struct.pack('>IB', len(data) + 1, 2) + data
        n = -(-len(blob) // 4096)
        blob += b'\0' * (n * 4096 - len(blob))
        i = 4 * (lx + lz * 32)
        loc[i:i + 4] = struct.pack('>I', (sector << 8) | n)
        ts[i:i + 4] = struct.pack('>I', now)
        body += blob
        sector += n
    with open(path, 'wb') as f:
        f.write(loc)
        f.write(ts)
        f.write(body)


PLAN = None


def region_job(args):
    rx, rz, outdir = args
    P = PLAN
    a = render_region(P, rx, rz)
    bio = P.biome[rz * RS:(rz + 1) * RS, rx * RS:(rx + 1) * RS]
    chunks = {}
    for lz in range(32):
        for lx in range(32):
            ch = a[:, lz * 16:(lz + 1) * 16, lx * 16:(lx + 1) * 16]
            chunks[(lx, lz)] = encode_chunk(ch, bio[lz * 16:(lz + 1) * 16, lx * 16:(lx + 1) * 16],
                                            rx * 32 + lx, rz * 32 + lz)
    write_region(os.path.join(outdir, f'r.{rx}.{rz}.mca'), chunks)
    # top-down view for the preview map
    nz = a != AIR
    top = NY - 1 - np.argmax(nz[::-1], axis=0)
    zz, xx = np.mgrid[0:RS, 0:RS]
    return rx, rz, a[top, zz, xx], top + YMIN


# --------------------------------------------------------------------------- level.dat
def write_level(path, P, seed):
    layers = [('minecraft:bedrock', 1), ('minecraft:deepslate', 63), ('minecraft:stone', 52),
              ('minecraft:sand', 4), ('minecraft:water', 7)]
    flat = {'type': 'minecraft:flat', 'settings': {
        'biome': 'minecraft:warm_ocean', 'features': Byte(0), 'lakes': Byte(0),
        'layers': List(10, [{'block': b, 'height': Int(h)} for b, h in layers]),
        'structure_overrides': List(8, [])}}
    dims = {
        'minecraft:overworld': {'type': 'minecraft:overworld', 'generator': flat},
        'minecraft:the_nether': {'type': 'minecraft:the_nether', 'generator': {
            'type': 'minecraft:noise', 'settings': 'minecraft:nether',
            'biome_source': {'type': 'minecraft:multi_noise', 'preset': 'minecraft:nether'}}},
        'minecraft:the_end': {'type': 'minecraft:the_end', 'generator': {
            'type': 'minecraft:noise', 'settings': 'minecraft:end',
            'biome_source': {'type': 'minecraft:the_end'}}},
    }
    sx, sy, sz = P.spawn
    rules = {'doMobSpawning': 'true', 'doDaylightCycle': 'true', 'doWeatherCycle': 'true',
             'keepInventory': 'true', 'doFireTick': 'false', 'mobGriefing': 'false',
             'spawnRadius': '0'}
    data = {
        'DataVersion': Int(DATA_VERSION), 'version': Int(19133),
        'Version': {'Id': Int(DATA_VERSION), 'Name': VERSION_NAME, 'Series': 'main', 'Snapshot': Byte(0)},
        'LevelName': WORLD_NAME, 'GameType': Int(1), 'Difficulty': Byte(1), 'DifficultyLocked': Byte(0),
        'hardcore': Byte(0), 'allowCommands': Byte(1), 'initialized': Byte(1),
        'SpawnX': Int(sx), 'SpawnY': Int(sy), 'SpawnZ': Int(sz), 'SpawnAngle': Float(90.0),
        'Time': Long(1000), 'DayTime': Long(1000), 'LastPlayed': Long(int(time.time() * 1000)),
        'raining': Byte(0), 'rainTime': Int(200000), 'thundering': Byte(0), 'thunderTime': Int(200000),
        'clearWeatherTime': Int(0), 'WasModded': Byte(0), 'ServerBrands': List(8, ['vanilla']),
        'WorldGenSettings': {'seed': Long(seed), 'generate_features': Byte(0), 'bonus_chest': Byte(0),
                             'dimensions': dims},
        'DataPacks': {'Enabled': List(8, ['vanilla']), 'Disabled': List(8, [])},
        'GameRules': rules,
        'BorderCenterX': Double(P.S / 2), 'BorderCenterZ': Double(P.S / 2), 'BorderSize': Double(59999968.0),
        'BorderSafeZone': Double(5.0), 'BorderWarningBlocks': Double(5.0), 'BorderWarningTime': Double(15.0),
        'BorderDamagePerBlock': Double(0.2), 'BorderSizeLerpTarget': Double(59999968.0),
        'BorderSizeLerpTime': Long(0), 'WanderingTraderSpawnChance': Int(25),
        'WanderingTraderSpawnDelay': Int(24000), 'ScheduledEvents': List(10, []),
        'CustomBossEvents': {}, 'DragonFight': {'NeedsStateScan': Byte(1), 'DragonKilled': Byte(0),
                                                'PreviouslyKilled': Byte(0)},
    }
    with gzip.open(path, 'wb') as f:
        f.write(nbt_bytes({'Data': data}))


# --------------------------------------------------------------------------- preview
DYE_RGB = {'white': (233, 236, 236), 'orange': (240, 118, 19), 'magenta': (189, 68, 179),
           'light_blue': (58, 175, 217), 'yellow': (248, 197, 39), 'lime': (112, 185, 25),
           'pink': (237, 141, 172), 'gray': (62, 68, 71), 'light_gray': (142, 142, 134),
           'cyan': (21, 137, 145), 'purple': (121, 42, 172), 'blue': (53, 57, 157),
           'brown': (114, 71, 40), 'green': (84, 109, 27), 'red': (161, 39, 34), 'black': (20, 21, 25)}
NAMED_RGB = {'grass_block': (95, 159, 53), 'sand': (219, 207, 163), 'water': (40, 120, 200),
             'mud': (60, 57, 60), 'stone': (125, 125, 125), 'smooth_stone': (160, 160, 160),
             'stone_bricks': (122, 121, 122), 'gravel': (131, 127, 126), 'clay': (160, 166, 179),
             'farmland': (110, 75, 45), 'wheat': (200, 180, 70), 'carrots': (90, 160, 40),
             'potatoes': (90, 160, 40), 'jungle_leaves': (48, 130, 24), 'oak_leaves': (60, 120, 30),
             'flowering_azalea_leaves': (110, 130, 70), 'mangrove_leaves': (60, 110, 30),
             'spruce_leaves': (45, 75, 45), 'lily_pad': (32, 128, 48), 'seagrass': (40, 120, 200),
             'short_grass': (95, 159, 53), 'fern': (95, 159, 53), 'smooth_quartz': (235, 229, 222),
             'quartz_block': (235, 229, 222), 'glass': (200, 225, 235), 'spruce_planks': (115, 85, 49),
             'oak_planks': (162, 130, 78), 'dark_oak_planks': (66, 43, 20), 'iron_block': (220, 220, 220),
             'terracotta': (152, 94, 67), 'smooth_sandstone': (223, 214, 170), 'cut_sandstone': (217, 206, 159),
             'bricks': (150, 97, 83), 'lightning_rod': (200, 120, 90)}


def block_rgb(i):
    name = BLOCKS[i][0].split(':')[1]
    if name in NAMED_RGB:
        return NAMED_RGB[name]
    for d in sorted(DYE_RGB, key=len, reverse=True):
        if name.startswith(d + '_'):
            r, g, b = DYE_RGB[d]
            if 'terracotta' in name:
                return (int(r * .6 + 90), int(g * .6 + 70), int(b * .6 + 60))
            if 'glass' in name:
                return (int(r * .6 + 80), int(g * .6 + 90), int(b * .6 + 100))
            return (r, g, b)
    if 'coral' in name:
        return (200, 90, 120)
    if 'froglight' in name or 'lantern' in name or 'glowstone' in name:
        return (250, 230, 200)
    if 'log' in name or 'roots' in name or 'fence' in name:
        return (90, 70, 45)
    return (130, 130, 130)


def make_preview(S, tops, heights, outdir):
    from PIL import Image, ImageDraw
    lut = np.array([block_rgb(i) for i in range(len(BLOCKS))] + [(0, 0, 0)] * (256 - len(BLOCKS)), np.float32)
    img = lut[tops]
    shade = np.clip(1 + (heights.astype(np.float32) - 64) / 260, 0.85, 1.45)
    dzh = np.diff(heights.astype(np.float32), axis=0, prepend=heights[:1].astype(np.float32))
    shade *= np.clip(1 + dzh * 0.05, 0.75, 1.25)
    img = np.clip(img * shade[..., None], 0, 255).astype(np.uint8)
    im = Image.fromarray(img)
    im.save(os.path.join(outdir, 'map_full.png'))
    small = im.resize((1024, 1024), Image.LANCZOS)
    dr = ImageDraw.Draw(small)
    f = 1024 / 1
    labels = [(0.69, 0.43, 'VISTA MARINA'), (0.85, 0.18, 'CORAL STRAND'), (0.74, 0.76, 'PORT SOLANO'),
              (0.60, 0.17, 'AIRPORT'), (0.30, 0.66, 'THE SAWGRASS'), (0.30, 0.95, 'SUNSET KEYS'),
              (0.17, 0.33, 'GULF HARBOR'), (0.30, 0.25, 'LAKE SOLANO'), (0.35, 0.12, 'FARMLAND')]
    try:
        from PIL import ImageFont
        font = ImageFont.load_default(size=18)
    except Exception:
        font = None
    for lu, lv, t in labels:
        x, y = lu * f, lv * f
        dr.text((x + 1, y + 1), t, fill=(0, 0, 0), font=font, anchor='mm')
        dr.text((x, y), t, fill=(255, 255, 255), font=font, anchor='mm')
    small.save(os.path.join(outdir, 'map_preview.png'))
    im.resize((64, 64), Image.LANCZOS).save(os.path.join(outdir, 'icon.png'))


# --------------------------------------------------------------------------- main
def main():
    global PLAN, PALETTE_RAW
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', type=int, default=2048, help='map size in blocks (multiple of 512)')
    ap.add_argument('--seed', type=int, default=20261121)
    ap.add_argument('--out', default='out')
    ap.add_argument('--jobs', type=int, default=os.cpu_count() or 2)
    args = ap.parse_args()
    S = args.size
    assert S % RS == 0 and S >= 1024
    t0 = time.time()
    print(f'Planning {S}x{S} world...', flush=True)
    PLAN = plan_world(S, args.seed)
    PALETTE_RAW = [_palette_entry(i) for i in range(len(BLOCKS))]
    world = os.path.join(args.out, WORLD_NAME)
    if os.path.exists(world):
        shutil.rmtree(world)
    os.makedirs(os.path.join(world, 'region'))
    n = S // RS
    jobs = [(rx, rz, os.path.join(world, 'region')) for rz in range(n) for rx in range(n)]
    tops = np.zeros((S, S), np.uint8)
    heights = np.zeros((S, S), np.int16)
    print(f'Rendering {len(jobs)} regions with {args.jobs} workers...', flush=True)
    with get_context('fork').Pool(args.jobs) as pool:
        for k, (rx, rz, t, h) in enumerate(pool.imap_unordered(region_job, jobs), 1):
            tops[rz * RS:(rz + 1) * RS, rx * RS:(rx + 1) * RS] = t
            heights[rz * RS:(rz + 1) * RS, rx * RS:(rx + 1) * RS] = h
            print(f'  region {k}/{len(jobs)} r.{rx}.{rz}  {time.time() - t0:6.1f}s', flush=True)
    write_level(os.path.join(world, 'level.dat'), PLAN, args.seed)
    make_preview(S, tops, heights, args.out)
    shutil.copy(os.path.join(args.out, 'icon.png'), os.path.join(world, 'icon.png'))
    zpath = shutil.make_archive(os.path.join(args.out, WORLD_NAME), 'zip', args.out, WORLD_NAME)
    print(f'Done in {time.time() - t0:.0f}s. Spawn {PLAN.spawn}. World: {world}  Zip: {zpath}')


if __name__ == '__main__':
    main()
