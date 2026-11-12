# 🍜 Yum Empire: Food Tycoon

A 3D tycoon game for **iOS (App Store)** and **Android (Google Play)**. Start with one tiny noodle cart in a quiet suburb, buy land, choose what to build, hire chefs and grow a food empire across four districts.

The game is plain HTML/CSS/JS with no framework and no build step. The city is drawn with [Three.js](https://threejs.org) (bundled in `www/vendor/`, MIT licence), and every model is generated in code, so there are no art files to manage. [Capacitor](https://capacitorjs.com) wraps it as native iOS and Android apps.

## The game

You start with one noodle cart on a free plot in a quiet suburb, with only a trickle of customers. From there you buy land, choose what to build on it, hire managers and chefs, and expand through four districts.

| Feature | What it does |
|---|---|
| **Land** | Every district has plots for sale in four sizes: Small, Medium, Large and Huge. Bigger land costs more, earns more (up to ×3.2) and holds a grander building. A shop on Small land never grows beyond a small shop. |
| **Choose what to build** | 10 kinds of shop, from Noodle Cart to Global Cuisine. Bigger shops need bigger land or a later district. Building a second shop of the same kind costs 5× more. Every new shop opens as a small stall at level 1. |
| **4 districts** | 🏡 Maple Suburb (6 plots) → 🏘️ Riverside Town (8) → 🏙️ Downtown City (10) → 🌃 Neon Metropolis (12). Each is its own 3D map with its own look, and gives every shop there a profit bonus (×1.5, ×2.5, ×4). |
| **Shops grow** | Level a shop up and its building is rebuilt with confetti: stall → shop → restaurant → big restaurant → flagship tower (as far as the land allows). Levels 25–500 double speed, 600–1000 quadruple profit. |
| **Managers** | Run a shop automatically, including while the app is closed (up to 8 hours). |
| **Chefs** | Recruit chefs (free every 8 hours, or with gems) in four rarities: Common, Rare, Epic, Legendary. Each boosts the shop they work in, +50% more in their favourite kind of shop. Train them up to level 10 with gems. |
| **Currencies** | 💵 Cash for land, shops and upgrades. 💎 Gems for chefs, crates, boosts and time warps. ⭐ Golden Stars from franchising. ✨ XP for player levels. |
| **Player level** | Almost everything earns XP. Each level pays 5 💎 and adds +2% profit. |
| **Quests** | 11 endless quest lines (serve customers, own shops, buy land, recruit chefs…) that pay gems and XP. |
| **Research** | 62 discoveries, each tripling profit for one kind of shop or for all of them. |
| **Empire milestones** | Every time your total shop levels pass a milestone (100, 300, 700 …), all profit doubles. |
| **Reward crate** | Free every 4 hours (or for gems): cash, gems, a 2-hour boost or a new chef. |
| **Boosts** | 2× profit for 4 hours (video or gems, stacks to 24h) and a time warp that pays 2 hours of income instantly. |
| **Franchise (prestige)** | Sell the empire for Golden Stars (+4% profit each, forever). Keeps gems, chefs, level and awards. |
| **VIP visitor** | A golden character with a light beam walks through town. Tap them for a big tip or a ×7 frenzy, sometimes with gems. |
| **Daily rewards** | A 7-day streak of cash and gems. Day 7 adds a free 4-hour boost. |
| **74 awards** | Each one pays 5 💎 and adds +2% profit. |

### The 3D world

| Feature | What it does |
|---|---|
| **Tilt-shift miniature look** | Steep telephoto camera, a sharp band across the middle with blurred top and bottom, saturated toy colours and long soft shadows. The blur can be switched off in the profile settings. |
| **A living town** | People with hats, backpacks and balloons walk the sidewalks and use the crosswalks. Customers queue at your shops and leave with a take-away bag. Cars, taxis, vans and buses stop for pedestrians and queue at junctions with traffic lights. |
| **Every district looks different** | The suburb has houses with gardens, driveways and mailboxes, farm fields, a barn and a silo. The town has a river with sailboats. The city and metropolis have towers with water tanks, antennas, billboards and neon, bus stops, parked cars and a passing train. Parks have fountains, benches and flower beds. Hot-air balloons drift overhead. |
| **Detailed shops** | Stalls have produce crates, stools, lanterns, string lights and a chef. Buildings have awnings, lit signs, planters, menu boards, café tables, balconies and a rooftop mascot for each kind of food. Empty land shows a construction site; land for sale shows a FOR SALE sign with its size and price. |
| **Grows with you** | Towers rise, and crowds and traffic grow, as you build up each district. |
| **Day and night** | A five-minute cycle. At night windows, signs, string lights, headlights and street lamps glow. |
| **Controls** | Drag to move, pinch to zoom, twist to rotate (mouse: drag, wheel, right-drag). Tap a shop to serve or select it; tap a FOR SALE sign twice to buy; tap empty land twice to build. |
| **Performance** | Thousands of small details are drawn in a handful of batches. Detail drops automatically on slow devices, and without WebGL the game still plays through its menus. |

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
│   ├── js/engine.js      ← pure game logic (economy, saves, prestige) — no DOM
│   ├── js/world.js       ← the 3D world: districts, buildings, customers, traffic, camera, tilt-shift lens
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
    ├── shot3d.js         ← quick screenshots of the city at different stages
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
npm test               # 25 engine unit tests
npm run simulate -- 2 8     # bot plays 8 franchise runs of 2h each and prints pacing
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

All numbers live at the top of `www/js/engine.js`: shop costs and revenues, land sizes and prices, district costs and bonuses, milestones, research costs, chef rarities, quest goals and the star formula. After changing them, run `npm run simulate` to check pacing. The current tuning: second plot within the first minutes, Riverside Town after about 15–20 minutes, a first franchise worth about 100 stars after two hours, then steadily bigger franchises with each run.
