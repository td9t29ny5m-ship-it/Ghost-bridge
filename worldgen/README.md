# Palmera: an open-world crime-sandbox map for Minecraft

Palmera is an original tropical state inspired by South Florida's real geography. It's built to feel like a big-city crime sandbox, rebuilt in Minecraft. It isn't a copy of any game's map, and it uses no other game's names or assets.

![map](dist/map_preview.png)

## Downloads
- **`Palmera_Life.mcaddon`** is the Bedrock add-on: guns, cash, cops, pedestrians, cars, jobs and the phone. It's sent with the full world. Job locations match the 8192 map.
- **Full world: 8192 × 8192 blocks** (`Palmera.zip`, about 110 MB). It's too large for GitHub, so it's sent separately. You can also build it yourself (see the last section).
- **`dist/Palmera-2048.zip`** is a small 2048 × 2048 Java version with the Java packs, for a quick try. Its job locations don't match the Bedrock add-on.

## Bedrock (phone, Windows, Xbox, PlayStation, Switch)
1. **Convert the map.** Open [chunker.app](https://chunker.app) on a PC or Mac. Load `Palmera.zip`, choose the latest Bedrock version as the output, and convert. You'll get `Palmera.mcworld`.
2. **Install the add-on.** On Windows, Android or iOS, open `Palmera_Life.mcaddon` and Minecraft imports it. Then open `Palmera.mcworld` too.
3. **Turn it on.** Go to World → Edit → Behavior Packs and activate **Palmera Life**. Its resource pack is activated automatically. You don't need any experimental toggles.
4. **Consoles** can't import files. Upload the world (with the add-on active) to a **Realm** from Windows or a phone, then join the Realm from the console. You can also host it on a **Bedrock Dedicated Server**, put the two pack folders in `behavior_packs/` and `resource_packs/`, and join through Ghost Bridge.

On Bedrock the phone opens a real button menu, and the cars are proper drivable vehicles with 3D models. A GPS arrow on screen points you to your current job.

## Java
**Play on Java Edition 1.21.1.** The datapack uses 1.21.1 command and item syntax. Unzip into `.minecraft/saves/` and say yes when the game offers the world's resource pack.

## Gameplay (Palmera Life: Bedrock add-on and Java datapack)
| Feature | How it works |
|---|---|
| **Phone** | Use it to open the menu: Sunshine Arms (guns), Coastline Motors (cars), Jobs and Stats. |
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
