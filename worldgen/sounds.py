"""
Procedurally synthesised sound effects for Palmera Life (all original, generated from noise and oscillators).
Returns {resource-pack path: bytes} including sounds/sound_definitions.json.
"""
import io
import json

import numpy as np
import soundfile as sf

SR = 44100
rng = np.random.default_rng(7)


def _t(sec):
    return np.arange(int(SR * sec)) / SR


def _lowpass(x, alpha):
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def _lp(x, cutoff):
    """One-pole low-pass via cumulative filtering (vectorised approximation using an IIR in chunks)."""
    a = 1 - np.exp(-2 * np.pi * cutoff / SR)
    from scipy.signal import lfilter
    return lfilter([a], [1, a - 1], x)


def _hp(x, cutoff):
    return x - _lp(x, cutoff)


def _norm(x, peak=0.62):
    m = np.max(np.abs(x)) or 1
    return (x / m * peak).astype(np.float32)


def _ogg(x):
    b = io.BytesIO()
    sf.write(b, x, SR, format='OGG', subtype='VORBIS')
    return b.getvalue()


def gunshot(body_hz, crack, tail, lp_cut, thump=1.0):
    t = _t(tail + 0.05)
    n = rng.normal(0, 1, len(t))
    env_crack = np.exp(-t * (1 / crack))
    env_tail = np.exp(-t * (1 / tail))
    crack_sig = _hp(n, 1500) * env_crack
    body = _lp(n, lp_cut) * env_tail * 1.6
    boom = np.sin(2 * np.pi * body_hz * t * np.exp(-t * 8)) * np.exp(-t * 18) * thump
    x = crack_sig * 0.9 + body + boom
    x[:int(SR * 0.002)] *= np.linspace(0, 1, int(SR * 0.002))
    return _norm(np.tanh(x * 1.5))


def explosion():
    t = _t(2.2)
    n = rng.normal(0, 1, len(t))
    rumble = _lp(n, 180) * np.exp(-t * 1.6) * 4
    blast = _lp(n, 1800) * np.exp(-t * 9) * 1.5
    sub = np.sin(2 * np.pi * 42 * t) * np.exp(-t * 3) * 0.8
    return _norm(np.tanh((rumble + blast + sub) * 1.2))


def siren():
    t = _t(4.0)
    f = 650 + 550 * (0.5 - 0.5 * np.cos(2 * np.pi * t / 2.0))       # wail sweep, loops every 2 s
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)
    return _norm(_lp(x, 3500) * 0.8, 0.7)


def engine():
    t = _t(2.0)
    f0 = 46
    ph = 2 * np.pi * f0 * t
    x = sum(np.sin(k * ph) / k for k in range(1, 9))
    x *= 0.8 + 0.2 * np.sin(2 * np.pi * 11.5 * t)
    x += _lp(rng.normal(0, 1, len(t)), 400) * 0.6
    return _norm(_lp(x, 900), 0.6)


def horn():
    t = _t(0.6)
    x = np.sign(np.sin(2 * np.pi * 415 * t)) * 0.5 + np.sign(np.sin(2 * np.pi * 495 * t)) * 0.5
    env = np.minimum(1, t * 60) * np.minimum(1, (0.6 - t) * 30)
    return _norm(_lp(x, 2500) * env, 0.7)


def cash():
    t = _t(0.9)
    click = _hp(rng.normal(0, 1, len(t)), 2000) * np.exp(-t * 80) * 0.6
    bell = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) for f, d in ((2093, 4), (2637, 5), (3136, 6), (4186, 8)))
    drawer = _lp(rng.normal(0, 1, len(t)), 600) * np.exp(-((t - 0.25) / 0.06) ** 2) * 0.8
    return _norm(click + bell * 0.5 + drawer)


def phone():
    t = _t(0.5)
    x = np.zeros_like(t)
    for start, f in ((0.0, 1318), (0.14, 1760), (0.28, 2093)):
        m = (t >= start) & (t < start + 0.12)
        tt = t[m] - start
        x[m] += np.sin(2 * np.pi * f * tt) * np.exp(-tt * 18)
    return _norm(x, 0.6)


def rotor():
    t = _t(2.0)
    n = _lp(rng.normal(0, 1, len(t)), 700)
    chop = (0.5 + 0.5 * np.sin(2 * np.pi * 13 * t)) ** 4
    thump = np.sin(2 * np.pi * 55 * t) * chop
    return _norm(n * chop * 1.5 + thump, 0.7)


def reload_click():
    t = _t(0.35)
    x = np.zeros_like(t)
    for start in (0.0, 0.18):
        m = t >= start
        tt = t[m] - start
        x[m] += _hp(rng.normal(0, 1, m.sum()), 3000) * np.exp(-tt * 120)
    return _norm(x, 0.7)


def build():
    snd = {
        'palmera.gun.pistol': [gunshot(140, 0.004, 0.18, 2500)],
        'palmera.gun.smg': [gunshot(170, 0.003, 0.10, 3200, 0.7)],
        'palmera.gun.shotgun': [gunshot(90, 0.006, 0.45, 1500, 1.4)],
        'palmera.gun.rifle': [gunshot(120, 0.004, 0.25, 2200, 1.1)],
        'palmera.gun.sniper': [gunshot(80, 0.005, 0.7, 1200, 1.6)],
        'palmera.gun.minigun': [gunshot(190, 0.002, 0.07, 3600, 0.6)],
        'palmera.gun.rocket': [_norm(_lp(rng.normal(0, 1, int(SR * 0.8)), 900) * np.exp(-_t(0.8) * 3))],
        'palmera.explosion': [explosion()],
        'palmera.siren': [siren()],
        'palmera.engine': [engine()],
        'palmera.horn': [horn()],
        'palmera.cash': [cash()],
        'palmera.phone': [phone()],
        'palmera.rotor': [rotor()],
        'palmera.reload': [reload_click()],
    }
    files, defs = {}, {}
    for name, clips in snd.items():
        paths = []
        for i, x in enumerate(clips):
            path = 'sounds/palmera/%s_%d' % (name.split('.', 1)[1].replace('.', '_'), i)
            files[path + '.ogg'] = _ogg(x)
            paths.append({'name': path, 'stream': False, 'volume': 1.0})
        cat = 'hostile' if 'siren' in name else 'player' if 'gun' in name or name in ('palmera.cash', 'palmera.phone', 'palmera.reload') else 'neutral'
        defs[name] = {'category': cat, 'min_distance': 1.0, 'max_distance': 96.0 if 'gun' in name or 'explosion' in name or 'siren' in name else 32.0,
                      'sounds': paths}
    files['sounds/sound_definitions.json'] = json.dumps({'format_version': '1.14.0', 'sound_definitions': defs}, indent=1).encode()
    return files
