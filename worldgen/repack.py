#!/usr/bin/env python3
"""Swap the latest Palmera Life add-on into an existing .mcworld without re-rendering the map.
usage: repack.py WORLD.mcworld NEW_ADDON.mcaddon OUT.mcworld
Keeps the world's own map data (job/store/bank coordinates, minimap) embedded in its script."""
import sys
import zipfile


def data_of(js):
    a = js.index('const D = ') + len('const D = ')
    b = js.index(';\nconst GUNS', a)
    return js[a:b]


world, addon, out = sys.argv[1:4]
zw, za = zipfile.ZipFile(world), zipfile.ZipFile(addon)
old_js = zw.read('behavior_packs/Palmera_Life_BP/scripts/main.js').decode()
new_js = za.read('Palmera_Life_BP/scripts/main.js').decode()
new_js = new_js.replace(data_of(new_js), data_of(old_js), 1)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as zo:
    for n in zw.namelist():
        if not (n.startswith('behavior_packs/') or n.startswith('resource_packs/')):
            zo.writestr(n, zw.read(n))
    for n in za.namelist():
        if n.endswith('/'):
            continue
        dest = ('behavior_packs/' if n.startswith('Palmera_Life_BP/') else 'resource_packs/') + n
        zo.writestr(dest, new_js if n == 'Palmera_Life_BP/scripts/main.js' else za.read(n))
print('repacked', out)
