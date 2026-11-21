#!/usr/bin/env python3
"""Build bedrock_blocks.json: exact Bedrock (1.21.50) block states for every Java block the generator uses.
Needs amulet-core (PyMCTranslate). Run:  <python-with-amulet> bedrock_map.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import PyMCTranslate
import amulet_nbt
from amulet.api.block import Block
import generate as g

TARGET = (1, 21, 50)
tm = PyMCTranslate.new_translation_manager()
jv = tm.get_version('java', (1, 21, 0))
bv = tm.get_version('bedrock', TARGET)
out = {}
for i, (name, props) in enumerate(g.BLOCKS):
    if name.startswith('palmera:'):
        continue
    ns, base = name.split(':')
    b = Block(ns, base, {k: amulet_nbt.TAG_String(v) for k, v in props})
    uni = jv.block.to_universal(b)[0]
    bb = bv.block.from_universal(uni)[0]
    states = {}
    for k, val in bb.properties.items():
        t = type(val).__name__
        typ = 'byte' if t == 'ByteTag' else 'int' if t == 'IntTag' else 'string'
        states[k] = [typ, val.py_data if hasattr(val, 'py_data') else str(val)]
    key = name + ('[' + ','.join('%s=%s' % kv for kv in props) + ']' if props else '')
    out[key] = {'name': bb.namespaced_name, 'states': states}
    if bb.namespaced_name in ('minecraft:air', 'universal_minecraft:air') and base != 'air' or 'universal' in bb.namespaced_name:
        print('WARN', key, '->', bb.namespaced_name, file=sys.stderr)
ver = (TARGET[0] << 24) | (TARGET[1] << 16) | (TARGET[2] << 8)
json.dump({'version': ver, 'target': TARGET, 'blocks': out}, open(os.path.join(os.path.dirname(__file__), 'bedrock_blocks.json'), 'w'), indent=0)
print(len(out), 'blocks mapped, version', ver)
