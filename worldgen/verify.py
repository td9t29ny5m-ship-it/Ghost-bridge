#!/usr/bin/env python3
"""Independent check of a generated world: parses level.dat and every chunk with nbtlib."""
import gzip, io, os, sys, struct, zlib, collections
import nbtlib

world = sys.argv[1]
lv = nbtlib.File.parse(gzip.open(os.path.join(world, 'level.dat')))
d = lv['Data']
print('level:', d['LevelName'], 'DataVersion', int(d['DataVersion']), 'spawn',
      int(d['SpawnX']), int(d['SpawnY']), int(d['SpawnZ']))
counts = collections.Counter()
nchunks = 0
for fn in sorted(os.listdir(os.path.join(world, 'region'))):
    raw = open(os.path.join(world, 'region', fn), 'rb').read()
    for i in range(1024):
        off, n = struct.unpack('>I', raw[4 * i:4 * i + 4])[0] >> 8, raw[4 * i + 3]
        assert off >= 2 and n > 0, (fn, i)
        ln, comp = struct.unpack('>IB', raw[off * 4096:off * 4096 + 5])
        assert comp == 2 and ln <= n * 4096
        c = nbtlib.File.parse(io.BytesIO(zlib.decompress(raw[off * 4096 + 5:off * 4096 + 4 + ln])))
        assert int(c['xPos']) % 32 == i % 32 and int(c['zPos']) % 32 == i // 32
        assert len(c['sections']) == 24
        for s in c['sections']:
            pal = s['block_states']['palette']
            data = s['block_states'].get('data')
            if data is None:
                assert len(pal) == 1
                counts[str(pal[0]['Name'])] += 4096
                continue
            bits = max(4, (len(pal) - 1).bit_length())
            vpl = 64 // bits
            assert len(data) == -(-4096 // vpl)
            mask = (1 << bits) - 1
            for L in data:
                L = int(L) & ((1 << 64) - 1)
                for k in range(vpl):
                    pass
            # decode fully and count
            arr = [ (int(L) & ((1<<64)-1)) for L in data ]
            idx = [(arr[j // vpl] >> ((j % vpl) * bits)) & mask for j in range(4096)]
            assert max(idx) < len(pal)
            for j in idx:
                counts[str(pal[j]['Name'])] += 1
        nchunks += 1
    print('ok', fn, flush=True)
print(nchunks, 'chunks valid')
for k, v in counts.most_common(40):
    print(f'{v:>12}  {k}')
