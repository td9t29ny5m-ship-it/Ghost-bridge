"""
Native Bedrock Edition world writer: LevelDB (Mojang raw-deflate compression), v9 sub-chunks,
3D biomes, sign block entities, level.dat, and .mcworld packaging with embedded packs.
"""
import heapq
import json
import os
import pickle
import struct
import time
import zipfile
import zlib

import numpy as np

try:
    import crc32c as _crc

    def crc32c(b):
        return _crc.crc32c(b)
except ImportError:  # slow fallback
    _T = []
    for i in range(256):
        c = i
        for _ in range(8):
            c = (c >> 1) ^ 0x82F63B78 if c & 1 else c >> 1
        _T.append(c)

    def crc32c(b):
        c = 0xFFFFFFFF
        for x in b:
            c = _T[(c ^ x) & 0xFF] ^ (c >> 8)
        return c ^ 0xFFFFFFFF

HERE = os.path.dirname(os.path.abspath(__file__))
BIOME_IDS = {'minecraft:warm_ocean': 40, 'minecraft:beach': 16, 'minecraft:sparse_jungle': 23,
             'minecraft:plains': 1, 'minecraft:mangrove_swamp': 191, 'minecraft:river': 7}


# --------------------------------------------------------------------------- little-endian NBT
def _s(out, s):
    b = s.encode('utf-8')
    out += struct.pack('<H', len(b))
    out += b


def _tag(out, name, typ, val):
    tid = {'byte': 1, 'short': 2, 'int': 3, 'long': 4, 'float': 5, 'double': 6, 'string': 8, 'compound': 10,
           'list': 9, 'intlist': 9}[typ]
    out.append(tid)
    _s(out, name)
    if typ == 'byte':
        out += struct.pack('<b', val)
    elif typ == 'short':
        out += struct.pack('<h', val)
    elif typ == 'int':
        out += struct.pack('<i', val)
    elif typ == 'long':
        out += struct.pack('<q', val)
    elif typ == 'float':
        out += struct.pack('<f', val)
    elif typ == 'double':
        out += struct.pack('<d', val)
    elif typ == 'string':
        _s(out, val)
    elif typ == 'compound':
        for k, (t, v) in val.items():
            _tag(out, k, t, v)
        out.append(0)
    elif typ == 'intlist':
        out.append(3)
        out += struct.pack('<i', len(val))
        for x in val:
            out += struct.pack('<i', x)
    elif typ == 'list':     # list of compounds
        out.append(10)
        out += struct.pack('<i', len(val))
        for comp in val:
            for k, (t, v) in comp.items():
                _tag(out, k, t, v)
            out.append(0)


def nbt_root(comp):
    out = bytearray()
    _tag(out, '', 'compound', comp)
    return bytes(out)


# --------------------------------------------------------------------------- block palette
class Palette:
    def __init__(self, blocks):
        m = json.load(open(os.path.join(HERE, 'bedrock_blocks.json')))
        self.version = m['version']
        self.raw = []
        self.water_layer = set()
        for name, props in blocks:
            if name.startswith('palmera:'):
                self.raw.append(nbt_root({'name': ('string', name), 'states': ('compound', {k: ('string', v) for k, v in props}),
                                          'version': ('int', self.version)}))
                continue
            key = name + ('[' + ','.join('%s=%s' % kv for kv in props) + ']' if props else '')
            e = m['blocks'].get(key)
            if e is None:
                raise KeyError('No Bedrock mapping for %s - rerun bedrock_map.py' % key)
            states = {k: (t, v) for k, (t, v) in e['states'].items()}
            self.raw.append(nbt_root({'name': ('string', e['name']), 'states': ('compound', states),
                                      'version': ('int', self.version)}))
            if e['name'] in ('minecraft:seagrass', 'minecraft:kelp'):
                self.water_layer.add(len(self.raw) - 1)
        self.water = nbt_root({'name': ('string', 'minecraft:water'),
                               'states': ('compound', {'liquid_depth': ('int', 0)}), 'version': ('int', self.version)})
        self.air = nbt_root({'name': ('string', 'minecraft:air'), 'states': ('compound', {}), 'version': ('int', self.version)})


ALLOWED_BITS = (1, 2, 3, 4, 5, 6, 8, 16)


def pack_words(idx, n_pal):
    bits = next(b for b in ALLOWED_BITS if (1 << b) >= max(2, n_pal))
    vpw = 32 // bits
    nw = -(-4096 // vpw)
    p = np.zeros(nw * vpw, np.uint32)
    p[:4096] = idx
    p = p.reshape(nw, vpw) << (np.arange(vpw, dtype=np.uint32) * np.uint32(bits))
    words = np.bitwise_or.reduce(p, axis=1).astype('<u4')
    return bytes([bits << 1]) + words.tobytes()


def storage(sec_xzy, pal, lut):
    u = np.unique(sec_xzy)
    lut[u] = np.arange(len(u), dtype=np.uint32)
    return pack_words(lut[sec_xzy], len(u)) + struct.pack('<i', len(u)) + b''.join(pal.raw[i] for i in u)


def chunk_records(a, biome2d, cx, cz, pal, air_id, biome_names, signs, ymin=-64):
    """a: (NY,16,16) block ids indexed [y,z,x]. Returns list of (key, value)."""
    key = struct.pack('<ii', cx, cz)
    recs = [(key + b'\x2c', bytes([40])), (key + b'\x36', struct.pack('<i', 2))]
    lut = np.zeros(256, np.uint32)
    ny = a.shape[0]
    water_ids = np.array(sorted(pal.water_layer), dtype=np.uint8)
    for sy in range(ny // 16):
        sec = a[sy * 16:(sy + 1) * 16]
        if (sec == air_id).all():
            continue
        xzy = np.ascontiguousarray(sec.transpose(2, 1, 0)).ravel()
        cy = sy + ymin // 16
        layers = [storage(xzy, pal, lut)]
        if len(water_ids) and np.isin(xzy, water_ids).any():
            wm = np.isin(xzy, water_ids).astype(np.uint32)
            layers.append(pack_words(wm, 2) + struct.pack('<i', 2) + pal.air + pal.water)
        recs.append((key + b'\x2f' + struct.pack('b', cy),
                     bytes([9, len(layers)]) + struct.pack('b', cy) + b''.join(layers)))
    # Data3D: heightmap + per-subchunk 3D biomes
    solid = a != air_id
    top = np.where(solid.any(0), ny - np.argmax(solid[::-1], axis=0), 0)       # (z,x), height above ymin
    hm = top.T.astype('<i2').tobytes()                                             # index x*16+z
    bid = np.vectorize(lambda b: BIOME_IDS.get(biome_names[b], 1))(biome2d).astype(np.int32)
    u = np.unique(bid)
    if len(u) == 1:
        bsec = b'\x01' + struct.pack('<i', int(u[0]))
    else:
        blut = {int(b): i for i, b in enumerate(u)}
        col = np.vectorize(blut.get)(bid.T)                                           # (x,z)
        xzy = np.repeat(col.reshape(16, 16, 1), 16, axis=2).ravel().astype(np.uint32)
        bsec = pack_words(xzy, len(u)) + struct.pack('<i', len(u)) + u.astype('<i4').tobytes()
    recs.append((key + b'\x2b', hm + bsec * (ny // 16) + b'\xff'))
    if signs:
        be = b''.join(sign_nbt(*s_) for s_ in signs)
        recs.append((key + b'\x31', be))
    return recs


def sign_nbt(x, y, z, face, text):
    side = {'Text': ('string', text), 'TextOwner': ('string', ''), 'SignTextColor': ('int', -16777216),
            'IgnoreLighting': ('byte', 1), 'HideGlowOutline': ('byte', 0), 'PersistFormatting': ('byte', 1)}
    return nbt_root({'id': ('string', 'Sign'), 'isMovable': ('byte', 1), 'x': ('int', x), 'y': ('int', y), 'z': ('int', z),
                     'FrontText': ('compound', side), 'BackText': ('compound', dict(side, Text=('string', ''))),
                     'IsWaxed': ('byte', 1)})


# --------------------------------------------------------------------------- LevelDB writer
def varint(n):
    out = bytearray()
    while n >= 0x80:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    out.append(n)
    return bytes(out)


def mask_crc(c):
    return (((c >> 15) | (c << 17)) + 0xA282EAD8) & 0xFFFFFFFF


class _Block:
    def __init__(self, restart=16):
        self.buf = bytearray()
        self.restarts = [0]
        self.n = 0
        self.last = b''
        self.ri = restart

    def add(self, k, v):
        if self.n >= self.ri:
            self.restarts.append(len(self.buf))
            self.n = 0
            shared = 0
        else:
            shared = 0
            mx = min(len(k), len(self.last))
            while shared < mx and k[shared] == self.last[shared]:
                shared += 1
        self.buf += varint(shared) + varint(len(k) - shared) + varint(len(v)) + k[shared:] + v
        self.last = k
        self.n += 1

    def finish(self):
        for r in self.restarts:
            self.buf += struct.pack('<I', r)
        self.buf += struct.pack('<I', len(self.restarts))
        return bytes(self.buf)

    def size(self):
        return len(self.buf) + 4 * len(self.restarts) + 4


class TableWriter:
    BLOCK = 128 * 1024

    def __init__(self, path):
        self.f = open(path, 'wb')
        self.off = 0
        self.data = _Block()
        self.index = _Block(1)
        self.first = None
        self.lastk = None

    def _write(self, raw, compress=True):
        ctype = 0
        body = raw
        if compress:
            c = zlib.compressobj(6, zlib.DEFLATED, -15)
            comp = c.compress(raw) + c.flush()
            if len(comp) < len(raw):
                body, ctype = comp, 4
        crc = mask_crc(crc32c(body + bytes([ctype])))
        self.f.write(body + bytes([ctype]) + struct.pack('<I', crc))
        h = (self.off, len(body))
        self.off += len(body) + 5
        return h

    def add(self, ikey, v):
        if self.first is None:
            self.first = ikey
        self.data.add(ikey, v)
        self.lastk = ikey
        if self.data.size() >= self.BLOCK:
            self._flush()

    def _flush(self):
        if self.data.n == 0 and len(self.data.restarts) == 1:
            return
        h = self._write(self.data.finish())
        self.index.add(self.lastk, varint(h[0]) + varint(h[1]))
        self.data = _Block()

    def finish(self):
        self._flush()
        meta = self._write(_Block().finish(), compress=False)
        idx = self._write(self.index.finish(), compress=False)
        foot = varint(meta[0]) + varint(meta[1]) + varint(idx[0]) + varint(idx[1])
        foot += b'\0' * (40 - len(foot)) + struct.pack('<Q', 0xDB4775248B80FB57)
        self.f.write(foot)
        self.off += len(foot)
        self.f.close()
        return self.off


def _log_records(payload):
    """Encode one logical record into LevelDB log format (32 KiB blocks)."""
    out = bytearray()
    BS = 32768
    pos = 0
    first = True
    while True:
        left = BS - (len(out) % BS)
        if left < 7:
            out += b'\0' * left
            left = BS
        avail = left - 7
        frag = payload[pos:pos + avail]
        end = pos + len(frag) >= len(payload)
        typ = (1 if end else 2) if first else (4 if end else 3)
        crc = mask_crc(crc32c(bytes([typ]) + frag))
        out += struct.pack('<IHB', crc, len(frag), typ) + frag
        pos += len(frag)
        first = False
        if end:
            return bytes(out)


def write_leveldb(dbdir, sorted_items, table_target=8 * 1024 * 1024, level=6):
    """sorted_items: iterator of (user_key, value) in strictly increasing user_key order."""
    os.makedirs(dbdir, exist_ok=True)
    files = []
    fnum = 2
    seq = 0
    tw = None
    for k, v in sorted_items:
        seq += 1
        ik = k + struct.pack('<Q', (seq << 8) | 1)
        if tw is None:
            path = os.path.join(dbdir, '%06d.ldb' % fnum)
            tw = TableWriter(path)
        tw.add(ik, v)
        if tw.off >= table_target:
            size = tw.finish()
            files.append((fnum, size, tw.first, tw.lastk))
            fnum += 1
            tw = None
    if tw is not None:
        size = tw.finish()
        files.append((fnum, size, tw.first, tw.lastk))
        fnum += 1
    log_num = fnum
    open(os.path.join(dbdir, '%06d.log' % log_num), 'wb').close()
    lp = lambda b: varint(len(b)) + b
    edit = varint(1) + lp(b'leveldb.BytewiseComparator') + varint(2) + varint(log_num) + varint(9) + varint(0)
    edit += varint(3) + varint(log_num + 1) + varint(4) + varint(seq)
    for num, size, first, last in files:
        edit += varint(7) + varint(level) + varint(num) + varint(size) + lp(first) + lp(last)
    with open(os.path.join(dbdir, 'MANIFEST-000001'), 'wb') as f:
        f.write(_log_records(edit))
    with open(os.path.join(dbdir, 'CURRENT'), 'w') as f:
        f.write('MANIFEST-000001\n')
    return len(files), seq


# --------------------------------------------------------------------------- record spooling (workers -> merge)
def spool(path, recs):
    recs.sort()
    with open(path, 'wb') as f:
        z = zlib.compressobj(1)
        for k, v in recs:
            f.write(z.compress(struct.pack('<HI', len(k), len(v)) + k + v))
        f.write(z.flush())


def _read_spool(path):
    d = zlib.decompressobj()
    buf = b''
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(1 << 16)
            if chunk:
                buf += d.decompress(chunk)
            else:
                buf += d.flush()
            pos = 0
            while len(buf) - pos >= 6:
                kl, vl = struct.unpack_from('<HI', buf, pos)
                if len(buf) - pos < 6 + kl + vl:
                    break
                yield buf[pos + 6:pos + 6 + kl], buf[pos + 6 + kl:pos + 6 + kl + vl]
                pos += 6 + kl + vl
            buf = buf[pos:]
            if not chunk:
                return


def merged(paths):
    return heapq.merge(*[_read_spool(p) for p in paths], key=lambda kv: kv[0])


# --------------------------------------------------------------------------- level.dat + package
def write_level_dat(path, name, spawn, seed, S):
    layers = {'biome_id': 40, 'block_layers': [
        {'block_name': 'minecraft:bedrock', 'count': 1}, {'block_name': 'minecraft:deepslate', 'count': 63},
        {'block_name': 'minecraft:stone', 'count': 52}, {'block_name': 'minecraft:sand', 'count': 4},
        {'block_name': 'minecraft:water', 'count': 7}], 'encoding_version': 6, 'structure_options': None,
        'world_version': 'version.post_1_18'}
    now = int(time.time())
    b = lambda v: ('byte', v)
    i = lambda v: ('int', v)
    d = {
        'LevelName': ('string', name), 'Generator': i(2), 'FlatWorldLayers': ('string', json.dumps(layers)),
        'RandomSeed': ('long', seed), 'SpawnX': i(spawn[0]), 'SpawnY': i(spawn[1]), 'SpawnZ': i(spawn[2]),
        'GameType': i(0), 'Difficulty': i(2), 'ForceGameType': b(0), 'StorageVersion': i(10), 'NetworkVersion': i(766),
        'Platform': i(2), 'WorldVersion': i(1), 'lastOpenedWithVersion': ('intlist', [1, 21, 50, 0, 0]),
        'MinimumCompatibleClientVersion': ('intlist', [1, 21, 50, 0, 0]), 'InventoryVersion': ('string', '1.21.50'),
        'Time': ('long', 6000), 'currentTick': ('long', 0), 'LastPlayed': ('long', now), 'worldStartCount': ('long', 0),
        'commandsEnabled': b(1), 'hasBeenLoadedInCreative': b(0), 'educationFeaturesEnabled': b(0),
        'isHardcore': b(0), 'spawnMobs': b(1), 'texturePacksRequired': b(1), 'MultiplayerGame': b(1),
        'LANBroadcast': b(1), 'XBLBroadcastIntent': i(3), 'PlatformBroadcastIntent': i(3),
        'rainLevel': ('float', 0.0), 'lightningLevel': ('float', 0.0), 'rainTime': i(200000), 'lightningTime': i(200000),
        'experiments': ('compound', {'experiments_ever_used': b(0), 'saved_with_toggled_experiments': b(0)}),
        'keepinventory': b(1), 'domobspawning': b(0), 'mobgriefing': b(0), 'sendcommandfeedback': b(0),
        'doinsomnia': b(0), 'dodaylightcycle': b(1), 'doweathercycle': b(1), 'showcoordinates': b(1),
        'commandblockoutput': b(0), 'dofiretick': b(0), 'spawnradius': i(0), 'naturalregeneration': b(1),
        'falldamage': b(1), 'pvp': b(1), 'showdeathmessages': b(1),
    }
    body = nbt_root(d)
    with open(path, 'wb') as f:
        f.write(struct.pack('<ii', 10, len(body)) + body)


def package_mcworld(world_dir, out_path, bp_files=None, rp_files=None, bp_uuid=None, rp_uuid=None, icon=None):
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for root, _, files in os.walk(world_dir):
            for fn in files:
                full = os.path.join(root, fn)
                z.write(full, os.path.relpath(full, world_dir))
        if bp_files:
            for k, v in bp_files.items():
                z.writestr('behavior_packs/Palmera_Life_BP/' + k, v)
            z.writestr('world_behavior_packs.json', json.dumps([{'pack_id': bp_uuid, 'version': [1, 0, 0]}]))
        if rp_files:
            for k, v in rp_files.items():
                z.writestr('resource_packs/Palmera_Life_RP/' + k, v)
            z.writestr('world_resource_packs.json', json.dumps([{'pack_id': rp_uuid, 'version': [1, 0, 0]}]))
        if icon:
            z.writestr('world_icon.jpeg', icon)
