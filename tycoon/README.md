# 🍜 Yum Empire: Food Tycoon

A 3D street-food park builder for **iOS (App Store)** and **Android (Google Play)**. Start on a tiny plot with one noodle cart, expand your land, lay out stalls, restaurants and decorations, and upgrade your Market Hall into the heart of a food empire.

The game is plain HTML/CSS/JS with no framework and no build step. The city is drawn with [Three.js](https://threejs.org) (bundled in `www/vendor/`, MIT licence), and every model is generated in code, so there are no art files to manage. [Capacitor](https://capacitorjs.com) wraps it as native iOS and Android apps.

## The game

You own a small plot in the middle of a town: a **Market Hall**, a noodle cart and a picnic table. Build your own street-food park on it, buy the land next door to make it bigger, and grow from a quiet suburb all the way to the Neon Metropolis.

| Feature | What it does |
|---|---|
| **Your own land** | Each park is a 24 × 24 grid split into 4 × 4 plots. You start with two plots. Buying a plot next to your land expands it, and each one costs more than the last. |
| **Build anywhere** | Open Build, pick something, and drag it into place. The footprint turns green where it fits and red where it doesn't. Buildings can be moved later. |
| **21 buildings** | 9 food stalls and restaurants (1×1 carts up to 3×3 food courts), 4 supply buildings (gardens, spice stall, fish market, greenhouse) and 7 decorations (tables, lamps, planters, trees, umbrella tables, fountains, a music stage). |
| **Market Hall** | The heart of the park, from level 1 to 20. Its level unlocks new buildings, raises how many of each you may own, caps every other building's level, and decides how much land you can own. It gets grander as it levels up: clock tower, turrets, then a golden dome. |
| **Builders and timers** | Building and upgrading take real time (seconds early on, up to a day) and need a free builder. You get a second builder at Hall 4, and can hire a third for gems. Gems finish jobs early; anything under a minute finishes free. |
| **Two resources** | Stalls earn 💵 cash. Supply buildings grow 🥕 ingredients. Upgrades cost both. |
| **Collect** | Buildings store what they make (2 hours or more) and show a bubble when there is something to collect. Tap it and the coins fly into your bank. Collect all unlocks at Hall 3. |
| **Layout matters** | Decorations boost every food stall within their radius: tables +6%, umbrella tables +18%, fountains +30% (radius 2), the stage +50% (radius 3). The placement ghost shows each decoration's reach. |
| **Customers** | People walk in from the street, queue at your stalls, eat at your tables and sometimes drop a tip coin you can tap. A golden VIP visitor pays out big. |
| **4 locations** | Riverside Town (Hall 8), Downtown City (Hall 13) and Neon Metropolis (Hall 17) are new maps with their own land, and every stall there earns ×1.6, ×2.6 or ×4. |
| **Gems, chefs and more** | Gems, player levels, 11 endless quest lines, 38 research upgrades, chefs in four rarities, reward crates, boosts, time warp, daily rewards and 75 awards. |

### The 3D world

| Feature | What it does |
|---|---|
| **Original art, no emoji** | Every icon is drawn in code (`www/js/icons.js`): 64 icons in a glossy cartoon style, plus generated chef portraits. Every model and texture (grass, asphalt, pavers, brick, plaster, gravel, soil, wood, water) is made in code too. |
| **Tilt-shift miniature look** | A steep telephoto camera, a sharp band in the middle with blurred top and bottom, toy colours and soft shadows. It can be turned off in the profile settings. |
| **A living town** | Sidewalks, a ring road with traffic (cars, taxis, vans and buses) that stops at the crossings, houses or towers depending on the location, parks, a river with boats, a train, hot-air balloons, and a day-night cycle in which windows, signs, lamps and headlights light up. |
| **Buildings that grow** | Stalls gain menu boards, lanterns and roof signs. Restaurants add floors, café tables and banners. Gardens' crops grow. The Market Hall turns into a palace. Construction shows scaffolding, a crane, a worker and a progress bar. |
| **Performance** | Repeated details are drawn in batches. Detail drops automatically on slow devices, and without WebGL the game still plays through its menus. |

### Monetization (player-friendly)
- **Rewarded ads only**: the game never forces an interstitial. Players choose to watch a video for a 4h ×2 boost or for double offline earnings.
- **In-app purchases** (non-consumable):
  - `yum_premium_2x` doubles profit permanently.
  - `yum_vip_pass` gives every ad reward instantly, with no ads.

## Project layout

```
tycoon/
├── www/                  ← the game (this is what ships inside the apps)
│   ├── index.html
│   ├── css/style.css
│   ├── js/engine.js      ← game rules: land, buildings, timers, economy, saves — no DOM
│   ├── js/icons.js       ← all icon art, drawn as SVG in code
│   ├── js/world.js       ← the 3D park and town: buildings, placement, customers, traffic, camera, tilt-shift lens
│   ├── fonts/            ← Lilita One + Nunito (SIL Open Font License)
│   ├── vendor/three.min.js ← Three.js r159 (MIT)
│   ├── js/platform.js    ← storage, sound, haptics, ads, purchases (native or web fallback)
│   ├── js/game.js        ← UI controller
│   ├── privacy.html      ← privacy policy (host it publicly for the stores)
│   └── manifest.webmanifest, sw.js, icons/
├── android/              ← generated Android Studio project (Capacitor 8)
├── ios/                  ← generated Xcode project (Capacitor 8, Swift Package Manager)
├── assets/               ← source icon + splash used to generate native assets
├── store/listing.md      ← ready-to-paste store descriptions and checklist
└── tools/
    ├── test-engine.js    ← unit tests (npm test)
    ├── simulate.js       ← balance simulator: a bot plays for N hours
    ├── playtest.js       ← end-to-end browser test (Playwright)
    ├── shot3d.js         ← quick screenshots of the park at different stages
    ├── demo-save.js      ← builds realistic saves for screenshots
    ├── screenshots.js    ← store screenshots at App Store / Play sizes
    ├── render-icons.js   ← renders icon.svg → PNGs
    └── configure-native.js ← AdMob IDs, portrait lock, iOS privacy keys
```

## Play it now (browser)

```bash
cd tycoon
npm install
npm run serve          # then open http://localhost:8765
```

Ads are simulated in the browser (a 3-second placeholder). Purchases show "In app", because they only work in the native builds.

## Tests

```bash
npm test               # 25 rule tests
npm run simulate -- 72      # a bot plays for 3 days and prints when each Market Hall level is reached
npm run serve & npm run playtest   # full UI playthrough in headless Chromium
```

## Build the apps

Requirements: Node 22+, **Android Studio** (JDK 21) for Android, and **Xcode 16+ on a Mac** for iOS.

```bash
cd tycoon
npm install
npx cap sync           # copies www/ into both native projects
npm run android        # opens Android Studio → Run ▶ on a device/emulator
npm run ios            # opens Xcode → pick your Team under Signing → Run ▶
```

After you edit anything in `www/`, run `npx cap sync` again.

**No Mac or Android Studio?** Every push that touches `tycoon/` runs the GitHub Actions workflow `.github/workflows/yum-empire.yml`. It runs the tests and builds a **debug APK** you can download from the run's *Artifacts* and install on an Android phone. To compile-check iOS on a macOS runner, start the workflow manually with "Also build iOS" ticked.

## Before you publish: replace the test IDs

| What | Where |
|---|---|
| App ID (`com.yumempire.tycoon`) | `capacitor.config.json`, plus the Android `namespace`/`applicationId` and the iOS bundle ID. Choose this **before** your first upload, because it can never change afterwards. |
| AdMob **app** IDs | Create the apps at admob.google.com, then run `ADMOB_ANDROID_APP_ID=… ADMOB_IOS_APP_ID=… node tools/configure-native.js`. In CI, set the repository variables `ADMOB_ANDROID_APP_ID` and `ADMOB_IOS_APP_ID`. |
| AdMob **rewarded ad unit** IDs | `www/js/platform.js` → `CONFIG.admob`, and set `testing: false`. |
| In-app purchases | Create `yum_premium_2x` and `yum_vip_pass` as non-consumables in App Store Connect and in Play Console. Connect both stores to a free [RevenueCat](https://www.revenuecat.com) project, then put its public SDK keys in `CONFIG.revenuecat`. |
| Privacy policy | Fill in the placeholders in `www/privacy.html` and host it at a public URL (GitHub Pages works). |
| Version | `CONFIG.version` in `platform.js`, `versionName` in `android/app/build.gradle`, and the version in Xcode. |

The game is fully playable before any of this is done: ads fall back to Google's test ads and purchases stay hidden.

## Publish to Google Play

1. Create a signing key once and **back it up**: if you lose it, you can't update the app.
   `keytool -genkey -v -keystore release.jks -alias yum -keyalg RSA -keysize 2048 -validity 10000`
2. Build the bundle using either option:
   - **Locally:** `ANDROID_KEYSTORE_PATH=… ANDROID_KEYSTORE_PASSWORD=… ANDROID_KEY_ALIAS=yum ANDROID_KEY_PASSWORD=… VERSION_CODE=1 ./gradlew bundleRelease` (run inside `android/`).
   - **In CI:** add the repository secrets `ANDROID_KEYSTORE_BASE64` (`base64 -w0 release.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD`. The workflow then uploads a signed `.aab`. Each run number becomes the version code automatically.
3. In Play Console:
   1. Create the app.
   2. Fill in the store listing using `store/listing.md`.
   3. Complete the content rating questionnaire, the Data safety form (also covered in `store/listing.md`) and the ads declaration (answer **Yes**).
   4. Upload the `.aab` to **Internal testing**, then Closed testing, then Production.

   New personal developer accounts must run a closed test with at least 12 testers for 14 days before they can publish to Production.

## Publish to the App Store

1. You need an Apple Developer Program membership ($99/year).
2. In Xcode, open *Signing & Capabilities*, then select your Team and set a unique Bundle ID. Add the **In-App Purchase** capability.
3. In App Store Connect:
   1. Create the app with the same Bundle ID.
   2. Fill in the listing from `store/listing.md`.
   3. Complete the App Privacy answers, which are in `store/listing.md`.
   4. Create the two IAPs.
4. In Xcode, run *Product → Archive*, then *Distribute App → App Store Connect*. Test the build with TestFlight, then submit it for review.

## Tuning the economy

All numbers live at the top of `www/js/engine.js`: building costs, build times, output, how many of each you may own, decoration bonuses, land prices, Market Hall costs, research and quests. After changing them, run `npm run simulate`. With the current tuning, a player who checks in every few minutes reaches Hall 2 in about 6 minutes, Hall 5 in about 2 hours, Hall 10 in about 9 hours and Hall 15 in about 4–5 days.
