# scenes.js — the film description

`window.FILM = { duration, accent, musicGain, stations: [...] }`. The engine in `index.html` turns it into the video: one desk, a camera that flies from station to station, items that land, draw, slam or pop at their time, captions from `words.js`.

- **duration** — film length in seconds (voice end + ~1.5 s).
- **accent** — the one accent colour (default `#ec5626`). Use ONE.
- **musicGain** — music level under the voice in dB (default −16; the mixer also ducks it while the voice speaks).

## Stations
A station is a place on the desk the camera visits. The camera centres `(x, y)` on the frame point (540, 820) — slightly above the middle, so the captions below stay clear.

| key | meaning | default |
|---|---|---|
| `t` | arrival time (s). The flight starts `flight` s earlier. | required |
| `x`, `y` | desk point to centre | required |
| `zoom` | 1 = desk pixels are frame pixels; 0.6 = wider; 1.3 = closer | 1 |
| `flight` | seconds the camera takes to fly here from the previous station | 0.9 |
| `hop` | crane lift on the flight (0–0.3): the camera rises and lands | 0.18 |
| `rot` | tilt in degrees | 0 |
| `push`, `dx`, `dy` | slow push-in while on the station (zoom factor, drift px) | 1.03, 6, 4 |
| `ay` | frame y where the station centre sits | 820 |
| `items` | the things on this station | [] |

Rules of thumb: lay stations out in 2D (right, down, diagonal), not in a column. 2–5 s per station. A wide overview station (`zoom: 0.25–0.35`, `items: []`) is a good "look at everything we made" beat. The frame at zoom 1 shows 1080×1920 desk pixels: keep a station's items inside roughly `x ± 480`, `y − 760 … y + 600` (captions cover the bottom).

## Items
Every item: `type`, `x`, `y` (top-left in desk px), `at` (time, default = station `t`), `rot` (deg), optional `until` (fade-out time), `anim` (override), `dur`.

| type | fields | default anim | looks like |
|---|---|---|---|
| `card` | `num` ("01"), `title` ("THE BRIEF"), `wide: true`, `prop` (image for the left) | land | ruled index card, orange number |
| `print` | `src`, `w`, `h`, `caption` (handwritten under the photo) | land | photo print with a white border / polaroid |
| `page` | `title`, `lines: [...]`, `w`, `h`, `size`, `lh` | land, then the lines type | typewriter page |
| `note` | `text`, `color: yellow\|pink\|green`, `size` | land | sticky note, handwriting |
| `hand` | `text`, `size`, `color` | draw | handwritten words in the accent colour |
| `text` | `text`, `size`, `font` | pop | big heading |
| `label` | `text`, `size` | land | white tag with an accent edge ("SKILL.md") |
| `cutout` | `src` (transparent PNG), `w`, `h` | land | paper cut-out with a white sticker edge and shadow |
| `image` | `src`, `w`, `h` | land | flat image with a shadow (no edge) |
| `marker` | `kind: ring\|ring2\|ring3\|underline\|line\|under2\|under3\|arrow\|slash`, `w`, `h`, `flip` | draw | orange marker stroke drawn left→right |
| `stamp` | `text` ("COMMENT\nSKILL"), `w`, `h`, `size`, `color: red` | slam | ink rubber stamp |
| `box` | `w`, `h`, `tag` | show | design-tool selection box with handles and a tag |
| `cursor` | `name`, `path: [[t, x, y], ...]`, `clicks: [t, ...]` | path | a named pointer moving and clicking |

Animations: `land` (drop + settle, 0.34 s), `slide` (from `fx`, `fy` px away), `pop` (scale up with a bounce), `slam` (stamp, 0.08 s), `draw` (reveal left→right), `show` (fade), `type` (page lines).

## Timing to the voice
Put each item's `at` on the word it illustrates (`words.js` has every word's start). One thing moves at a time: space items ≥ 0.3 s apart. The camera flight to the next station starts `flight` s before that station's `t`, so set `t` ≈ 0.2 s before the first word of the next sentence.

## Sounds (scripts/mix.mjs)
If `assets/sfx/*.wav` exist they are placed automatically: `whoosh` on each flight, `thud` on each land, `marker` on each draw, `stamp` on each slam, `pop`, `slide`. Music: drop any `assets/audio/music.mp3` (or .wav) — it sits under the voice and ducks while the voice speaks.
