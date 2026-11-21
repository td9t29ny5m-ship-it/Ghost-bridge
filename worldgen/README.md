# Palmera: an open-world crime-sandbox map for Minecraft

Palmera is an original tropical state inspired by South Florida's real geography. It's built to feel like a big-city crime sandbox, rebuilt in Minecraft. It isn't a copy of any game's map, and it uses no other game's names or assets.

![map](dist/map_preview.png)

## Downloads
- **Full world: 8192 × 8192 blocks.** It's about 110 MB, too large for GitHub, so it's sent separately. You can also build it yourself (see the last section).
- **`dist/Palmera-2048.zip`** is the same world at 2048 × 2048 with all the gameplay packs. Use it for a quick try.

**Play on Java Edition 1.21.1.** The gameplay datapack uses 1.21.1 command and item syntax. Newer versions open the map, but the guns, shops and NPCs may break. Unzip the world into `.minecraft/saves/`. When the game asks to use the world's resource pack, say yes, because that's what gives the guns, phone and cash their textures.

**Bedrock:** [Chunker](https://chunker.app) can convert the *map* to Bedrock. Datapacks don't exist on Bedrock, so you'd get the world without the gameplay.

## Gameplay (Palmera Life datapack)
| Feature | How it works |
|---|---|
| **Phone** | Right-click it to open the menu: Sunshine Arms (guns), Coastline Motors (cars), Jobs and Stats. You can also type `/trigger pl_menu set 1`. |
| **Guns** | Pistol, SMG, Pump Shotgun, Assault Rifle and Rocket Launcher. Shots are hitscan with tracers, and bullets shatter glass. |
| **Other gear** | Grenades (explode on impact without breaking blocks), Baseball Bat, Body Armor, Medkits. |
| **Cash** | Shown in the HUD. Defeated enemies drop green cash bundles that you collect by walking over them. Jobs pay $1,500 to $12,000. |
| **Wanted level ★★★★★** | Killing civilians or police, or firing near people, raises your stars. Police come at 1★, SWAT at 3★ and a police chopper at 5★. Get away from the cops to lose stars. |
| **Pedestrians** | Named civilians walk the sidewalks and beaches around you and despawn when you leave. |
| **Cars** | Sedans and sports cars in random colours. Right-click to drive. Each player gets one car at a time. |
| **Jobs** | Beach Brawl, Dockside Shakedown, Swamp Runners, Hangar Deal, Launch Day and Isle Heist. Each gives you a GPS compass to the location. |
| **Death** | You keep your inventory and pay a $500 hospital bill, and your wanted level resets. |

You start in Survival with $2,500, a pistol, 60 ammo and a phone. Cheats stay on so you can switch to creative to explore.

## Map
| Area | Highlights |
|---|---|
| Vista Marina | Huge downtown with glass, round and art-deco skyscrapers up to ~240 tall, condos with rooftop pools, garages, a stadium and parked cars |
| Coral Strand | Barrier-island hotel strip, beach, umbrellas, lifeguard towers, a Ferris wheel pier |
| Millionaire Isles | Lagoon islands with modern mansions and yachts |
| Port Solano | Containers, gantry cranes, cargo ships |
| Intl Airport | Two runways, terminal, tower, parked jets, hangars |
| Spaceport | Rocket launch pads and a giant assembly building |
| Port Isla | Second city on the gulf coast |
| Towns | Citrus Grove, Palmetto, Okee Junction, Mangrove Point (with trailer parks) |
| The Sawgrass | Mangrove swamp crossed by an elevated highway |
| Sunset Keys | Island chain on an overseas bridge, lighthouse, coral reefs |
| Everywhere | Divided highways with palm medians, gas stations, motels, strip malls, billboards, golf courses, farms and orange groves |

## Build it yourself
```
pip install numpy scipy pillow nbtlib
python3 generate.py --size 8192 --out out     # ~5 min, ~6 GB RAM, 4 cores
python3 verify.py out/Palmera                  # NBT check of every chunk
```
`--size` takes a multiple of 512. `--seed` changes the coastline and building layout. The datapack and resource pack are made by `packs.py`, which sets each job's coordinates to match the generated map.
