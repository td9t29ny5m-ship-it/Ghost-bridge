#!/usr/bin/env python3
"""Isometric close-up render of part of the world straight from the generator (for previews).
usage: render_iso.py OUT.png X0 Z0 W D [--size 2048]"""
import argparse
import numpy as np
from PIL import Image
import generate as g

ap = argparse.ArgumentParser()
ap.add_argument('out'); ap.add_argument('x0', type=int); ap.add_argument('z0', type=int)
ap.add_argument('w', type=int); ap.add_argument('d', type=int)
ap.add_argument('--size', type=int, default=2048); ap.add_argument('--seed', type=int, default=20261121)
a = ap.parse_args()
P = g.plan_world(a.size, a.seed)
rx, rz = a.x0 // g.RS, a.z0 // g.RS
vox, _ = g.render_region(P, rx, rz)
lx, lz = a.x0 - rx * g.RS, a.z0 - rz * g.RS
y0 = 50 - g.YMIN
v = vox[y0:, lz:lz + a.d, lx:lx + a.w]                      # (y, z, x)
solid = v != g.AIR
# exposed voxels only (top, +x or +z face visible)
exp = solid.copy()
inner = solid[:-1] & solid[1:].copy()
exp[:-1] &= ~(solid[1:] & np.pad(solid, ((0, 0), (0, 0), (0, 1)))[:-1, :, 1:] & np.pad(solid, ((0, 0), (0, 1), (0, 0)))[:-1, 1:, :])
Y, Z, X = np.nonzero(exp)
ids = v[Y, Z, X]
lut = np.array([g.block_rgb(i) for i in range(len(g.BLOCKS))] + [(0, 0, 0)] * (256 - len(g.BLOCKS)), np.float32)
col = lut[ids]
water = ids == g.WATER
S = 3                                                       # pixels per half-block
sx = (X - Z) * S * 2
sy = (X + Z) * S - Y * S * 2
sx -= sx.min(); sy -= sy.min()
Wd, Ht = sx.max() + 4 * S + 1, sy.max() + 4 * S + 1
img = np.zeros((Ht, Wd, 3), np.float32); img[:] = (150, 200, 235)
depth = np.full((Ht, Wd), -1e9, np.float32)
dep = (X + Z + Y).astype(np.float32)
sprite = []
for py in range(4 * S):
    for px in range(4 * S):
        if py < 2 * S:
            sh = 1.0                                         # top face
        else:
            sh = 0.72 if px < 2 * S else 0.86                # left / right faces
        sprite.append((px, py, sh, py * 0.001))
for px, py, sh, dd in sprite:
    xs, ys = sx + px, sy + py
    dv = dep + dd
    order = np.argsort(dv)
    xs, ys, dv2 = xs[order], ys[order], dv[order]
    c = col[order] * sh
    m = dv2 > depth[ys, xs]
    # later (nearer) entries win because of sort order
    img[ys[m], xs[m]] = c[m]
    depth[ys[m], xs[m]] = dv2[m]
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(a.out)
print('saved', a.out, img.shape)
