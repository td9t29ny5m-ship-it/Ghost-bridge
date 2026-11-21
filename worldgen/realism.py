"""
Procedural high-resolution textures that replace the vanilla blocks Palmera is built from, so the city reads as
asphalt, paving stones, glass curtain walls, stucco, clay roof tiles and marble instead of flat Minecraft colours.
Returns {resource-pack path: png bytes}. Bedrock vanilla texture names.
"""
import io

import numpy as np
from PIL import Image, ImageFilter

N = 64


def _png(arr):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA' if arr.shape[2] == 4 else 'RGB')
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


def _noise(seed, scale=1.0, blur=0):
    r = np.random.default_rng(seed)
    a = r.normal(0, 1, (N, N)).astype(np.float32)
    if blur:
        im = Image.fromarray(((a - a.min()) / (np.ptp(a) + 1e-6) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur))
        a = (np.asarray(im).astype(np.float32) / 255 - 0.5) * 2
    return a * scale


def _rgba(base, var, seed, blur=0, alpha=255):
    n = _noise(seed, 1.0, blur)
    out = np.zeros((N, N, 4), np.float32)
    for c in range(3):
        out[..., c] = base[c] + n * var
    out[..., 3] = alpha
    return out


def asphalt(seed, base=(56, 57, 61)):
    a = _rgba(base, 9, seed) + _rgba((0, 0, 0), 6, seed + 1, blur=3)
    a[..., 3] = 255
    r = np.random.default_rng(seed)
    for _ in range(70):                                   # light aggregate specks
        x, y = r.integers(0, N, 2)
        a[y, x, :3] += 28
    for _ in range(2):                                    # hairline cracks
        x, y = r.integers(0, N, 2)
        for _ in range(r.integers(10, 26)):
            a[y % N, x % N, :3] -= 22
            x += r.integers(-1, 2)
            y += 1
    return a


def paint(seed, base):
    a = _rgba(base, 5, seed, blur=1)
    r = np.random.default_rng(seed)
    wear = _noise(seed + 9, 1.0, blur=2) > 0.55
    a[wear, :3] = a[wear, :3] * 0.88
    for _ in range(25):
        x, y = r.integers(0, N, 2)
        a[y, x, :3] -= 20
    return a


def paving(seed):
    a = _rgba((176, 172, 164), 6, seed, blur=1)
    half = N // 2
    for k in (0, half):
        a[k:k + 1, :, :3] = (128, 124, 118)
        a[:, k:k + 1, :3] = (128, 124, 118)
    r = np.random.default_rng(seed)
    for i in range(2):
        for j in range(2):
            a[i * half + 1:(i + 1) * half, j * half + 1:(j + 1) * half, :3] += r.normal(0, 5)
    return a


def concrete_panel(seed, base):
    a = _rgba(base, 4, seed, blur=1)
    a[0, :, :3] -= 18
    a[:, 0, :3] -= 18
    return a


def stucco(seed, base):
    a = _rgba(base, 6, seed, blur=0.6)
    a += _rgba((0, 0, 0), 4, seed + 3, blur=4)
    a[..., 3] = 255
    return a


def glass(seed, tint, alpha=190):
    y = np.linspace(0, 1, N)[:, None]
    x = np.linspace(0, 1, N)[None, :]
    refl = 0.35 + 0.65 * np.clip(1.2 - y - 0.25 * x, 0, 1)
    streak = (np.abs((x * 0.8 + y) % 0.5 - 0.25) < 0.035) * 0.18
    a = np.zeros((N, N, 4), np.float32)
    for c in range(3):
        a[..., c] = tint[c] * (0.55 + 0.45 * refl) + 255 * streak
    a[..., 3] = alpha
    frame = (np.arange(N) < 2) | (np.arange(N) >= N - 2)
    a[frame, :, :3] = (175, 180, 188)
    a[:, frame, :3] = (175, 180, 188)
    a[frame, :, 3] = 255
    a[:, frame, 3] = 255
    return a


def marble(seed):
    a = _rgba((236, 232, 226), 3, seed, blur=1)
    v = _noise(seed + 5, 1.0, blur=3)
    veins = np.abs(np.sin((np.arange(N)[None, :] * 0.18 + np.arange(N)[:, None] * 0.07) + v * 3)) < 0.06
    a[veins, :3] -= 38
    return a


def roof_tiles(seed, base):
    a = _rgba(base, 8, seed, blur=0.8)
    rows = 8
    h = N // rows
    for i in range(rows):
        y0 = i * h
        a[y0:y0 + 1, :, :3] *= 0.6                      # shadow under each course
        off = (h if i % 2 else 0)
        for x in range(off, N + h, 2 * h):
            for yy in range(h):
                for dx in (-1, 0):
                    xx = (x + dx) % N
                    a[y0 + yy, xx, :3] *= 0.75 if yy > 1 else 1.0
        grad = np.linspace(1.08, 0.86, h)[:, None, None]
        a[y0:y0 + h, :, :3] *= grad
    return a


def sand(seed):
    a = _rgba((222, 206, 160), 10, seed)
    a += _rgba((0, 0, 0), 5, seed + 2, blur=3)
    a[..., 3] = 255
    return a


def brushed(seed, base=(196, 198, 204)):
    a = _rgba(base, 2, seed)
    streaks = _noise(seed + 4, 1.0)[:, :1] * 10
    a[..., :3] += streaks[..., None]
    return a


PASTEL = {'pink': (236, 160, 182), 'light_blue': (150, 200, 230), 'lime': (170, 214, 120), 'yellow': (240, 214, 120),
          'orange': (232, 150, 90), 'magenta': (196, 120, 190), 'cyan': (90, 170, 180), 'purple': (150, 110, 190),
          'blue': (70, 90, 170), 'green': (90, 130, 80), 'red': (180, 60, 55), 'brown': (130, 95, 70)}
STAINED_GLASS = {'light_blue': (110, 170, 215), 'cyan': (80, 160, 170), 'gray': (90, 100, 112), 'black': (40, 48, 60),
                 'blue': (60, 90, 170), 'silver': (160, 170, 182)}
CLAY_WALL = {'white': (226, 214, 196), 'pink': (220, 170, 160), 'light_blue': (170, 190, 200), 'yellow': (226, 196, 130),
             'cyan': (130, 160, 160), 'magenta': (190, 140, 160)}
CLAY_ROOF = {'': (176, 96, 64), 'orange': (190, 104, 58), 'brown': (120, 78, 56), 'red': (160, 64, 50), 'silver': (150, 140, 136)}


def textures():
    T = {}
    b = 'textures/blocks/'
    T[b + 'concrete_gray.png'] = _png(asphalt(1))
    T[b + 'concrete_black.png'] = _png(asphalt(2, (34, 35, 38)))
    T[b + 'concrete_white.png'] = _png(paint(3, (236, 236, 232)))
    T[b + 'concrete_silver.png'] = _png(concrete_panel(4, (168, 168, 164)))
    for i, (k, c) in enumerate(PASTEL.items()):
        T[b + 'concrete_%s.png' % k] = _png(stucco(10 + i, c))
    T[b + 'stone_slab_top.png'] = _png(paving(5))
    T[b + 'glass.png'] = _png(glass(6, (170, 205, 220), 150))
    for i, (k, c) in enumerate(STAINED_GLASS.items()):
        T[b + 'glass_%s.png' % k] = _png(glass(30 + i, c, 205))
    T[b + 'quartz_block_bottom.png'] = _png(marble(7))
    T[b + 'quartz_block_side.png'] = _png(marble(8))
    T[b + 'quartz_block_top.png'] = _png(marble(9))
    for i, (k, c) in enumerate(CLAY_WALL.items()):
        T[b + 'hardened_clay_stained_%s.png' % k] = _png(stucco(40 + i, c))
    for i, (k, c) in enumerate(CLAY_ROOF.items()):
        T[b + ('hardened_clay%s.png' % ('_stained_' + k if k else ''))] = _png(roof_tiles(50 + i, c))
    T[b + 'sand.png'] = _png(sand(11))
    T[b + 'sandstone_top.png'] = _png(stucco(12, (228, 214, 178)))
    T[b + 'iron_block.png'] = _png(brushed(13))
    return T
