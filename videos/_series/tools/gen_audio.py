"""Synthesize the channel's sound kit: a soft lo-fi music bed + foley SFX. No downloads needed.
Usage: python3 gen_audio.py <projectDir> [seconds] [seed]
Writes assets/audio/music.wav and assets/sfx/{whoosh,thud,marker,stamp,pop,slide}.wav"""
import sys, os, numpy as np, soundfile as sf
SR = 48000
d = sys.argv[1]; dur = float(sys.argv[2]) if len(sys.argv) > 2 else 60; rng = np.random.default_rng(int(sys.argv[3]) if len(sys.argv) > 3 else 7)
os.makedirs(f"{d}/assets/sfx", exist_ok=True); os.makedirs(f"{d}/assets/audio", exist_ok=True)
t_ = lambda s: np.arange(int(s * SR)) / SR
def lp(x, a):  # one-pole lowpass, a in (0,1): smaller = darker
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x): acc += a * (v - acc); y[i] = acc
    return y
def norm(x, peak=0.9): return x / (np.max(np.abs(x)) + 1e-9) * peak
def save(name, x): x = norm(x); sf.write(f"{d}/assets/sfx/{name}.wav", np.stack([x, x], 1), SR)
def bp_noise(n, lo, hi):
    X = np.fft.rfft(rng.standard_normal(n)); f = np.fft.rfftfreq(n, 1 / SR); X[(f < lo) | (f > hi)] = 0; return np.fft.irfft(X, n)
# whoosh: band-passed noise whose band sweeps up then down, swelling and fading
t = t_(0.55); n = len(t); env = np.sin(np.pi * np.clip(t / 0.55, 0, 1)) ** 2
a = bp_noise(n, 300, 900); b = bp_noise(n, 900, 3500); mix = np.sin(np.pi * t / 0.55)
save("whoosh", (a * (1 - mix) + b * mix) * env)
# thud: paper card landing = low sine knock + soft noise tap
t = t_(0.22); save("thud", np.sin(2 * np.pi * (95 - 40 * t / 0.22) * t) * np.exp(-t * 28) + 0.35 * bp_noise(len(t), 200, 2500) * np.exp(-t * 90))
# marker: scratchy felt-tip stroke
t = t_(0.42); save("marker", bp_noise(len(t), 2500, 7000) * (0.6 + 0.4 * np.sin(2 * np.pi * 22 * t)) * np.minimum(1, t / 0.03) * np.exp(-t * 3))
# stamp: heavy low knock + slap
t = t_(0.35); save("stamp", np.sin(2 * np.pi * (70 - 25 * t) * t) * np.exp(-t * 14) + 0.6 * bp_noise(len(t), 150, 3000) * np.exp(-t * 45))
# pop: short upward blip
t = t_(0.12); save("pop", np.sin(2 * np.pi * (380 * t + 2600 * t * t)) * np.exp(-t * 32))
# slide: paper sliding
t = t_(0.45); save("slide", bp_noise(len(t), 600, 4000) * np.sin(np.pi * t / 0.45) ** 1.5)

# music: 84 bpm lo-fi — warm Rhodes-ish chords (Am9 Fmaj7 Cmaj7 G6), soft kick, brushed hats, vinyl crackle
bpm = 84; beat = 60 / bpm; bar = 4 * beat; N = int(dur * SR); T = np.arange(N) / SR; out = np.zeros(N)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
chords = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 69], [48, 55, 59, 64, 67], [55, 59, 62, 64, 71]]
for k in range(int(dur / bar) + 1):
    s0 = int(k * bar * SR); L = min(int(bar * SR), N - s0)
    if L <= 0: break
    t = np.arange(L) / SR; env = np.minimum(1, t / 0.08) * np.exp(-t * 0.55)
    for m in chords[k % 4]:
        f = hz(m) * (1 + rng.uniform(-0.002, 0.002))
        out[s0:s0 + L] += 0.12 * env * (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t) * np.exp(-t * 2)) * (1 + 0.08 * np.sin(2 * np.pi * 4.5 * t))
    bass = hz(chords[k % 4][0] - 12); out[s0:s0 + L] += 0.22 * np.sin(2 * np.pi * bass * t) * np.minimum(1, t / 0.02) * np.exp(-t * 0.9)
for i in range(int(dur / beat) + 1):  # drums
    s0 = int(i * beat * SR)
    if s0 >= N: break
    if i % 4 in (0, 2) or (i % 8 == 7):  # kick
        t = np.arange(min(int(0.3 * SR), N - s0)) / SR; out[s0:s0 + len(t)] += 0.45 * np.sin(2 * np.pi * (52 + 70 * np.exp(-t * 30)) * t) * np.exp(-t * 11)
    if i % 4 in (1, 3):  # soft snare/rim
        t = np.arange(min(int(0.18 * SR), N - s0)) / SR; out[s0:s0 + len(t)] += 0.16 * bp_noise(len(t), 900, 5000) * np.exp(-t * 25)
    for h in (0, 0.5):  # hats on 8ths, swung
        s1 = s0 + int((h * beat + (0.06 if h else 0)) * SR)
        if s1 < N: t = np.arange(min(int(0.05 * SR), N - s1)) / SR; out[s1:s1 + len(t)] += 0.05 * bp_noise(len(t), 6000, 12000) * np.exp(-t * 80)
crackle = np.zeros(N); idx = rng.integers(0, N, int(dur * 9)); crackle[idx] = rng.uniform(-1, 1, len(idx)) * 0.08
out = lp(out + crackle + 0.004 * rng.standard_normal(N), 0.35)
out = norm(out, 0.7); sf.write(f"{d}/assets/audio/music.wav", np.stack([out, out], 1), SR)
print("sound kit written to", d)
