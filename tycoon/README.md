# 🍜 Yum Empire: Food Tycoon

A 3D street-food business tycoon for **iOS (App Store)** and **Android (Google Play)**. Start with one noodle cart, hire cooks, farmers and fishers, grow your own ingredients, pay wages and tax, expand your land and grow a food empire.

The game is plain HTML/CSS/JS with no framework and no build step. The city is drawn with [Three.js](https://threejs.org) (bundled in `www/vendor/`, MIT licence), and every model is generated in code, so there are no art files to manage. [Capacitor](https://capacitorjs.com) wraps it as native iOS and Android apps.

## The game

You start with **one noodle cart, $400 and a few bags of wheat and vegetables**. Nobody is cooking yet, so the first thing the tutorial asks is to **hire a cook**. From then on the business runs itself: cooks sell, farmers grow, and you manage. There is no tapping for coins.

| Feature | What it does |
|---|---|
| **A real business** | Every stall sells dishes at real prices ($4 noodles up to $32 world-kitchen platters). Each dish uses ingredients from your stock. Sales per hour are the lowest of: how many customers want to eat there, how fast the staff can cook, and how many dishes your ingredients allow. |
| **Never broke** | Every dish is priced so it still makes money when the manager buys its ingredients at the market, and the manager restocks automatically (you can switch that off). Shops close from 23:00 to 6:00, and staff are not paid while closed. There is no rent during the tutorial, and if cash ever runs out the town council pays a small-business grant. |
| **The books** | Sales tax (10%), supplies (8% for packaging and gas), hourly wages and land rent are paid automatically. The HUD shows profit per hour, and the **Daily Report** has the full books and a 7-day chart. |
| **Game clock** | One real minute is half an hour in the park, so a full trading day takes 48 minutes: quiet mornings, a lunch rush, a dinner peak and a calm night. Day and night in the 3D world follow the clock. |
| **Staff** | A hiring board of 5 candidates refreshes every 4 hours. Cooks, farmers and fishers have a skill (1–5 stars), a trait (Fast hands, Thrifty, Charming, Green thumb, Steady) and an hourly wage. Pay a signing fee, give them a building, train them to level 10. Bigger buildings hold more staff. |
| **Farms and ponds** | Wheat fields, veggie gardens, fruit orchards, rice paddies, spice gardens, a livestock barn, fish ponds and greenhouses grow ingredients, but only while a farmer or fisher works there. |
| **Stock and market** | Each ingredient has its own storage (Warehouses add more). The market sells anything you don't grow at a 60% mark-up and buys spare stock back. |
| **Your own land** | Each park is a 24 × 24 grid of 4 × 4 plots. Buy the plot next to your land to expand it. Each plot costs more than the last and adds rent. |
| **Market Hall** | Levels 1–20, each with a growing build timer. It unlocks buildings, how many you can own, building levels, staff numbers and land. The **unlock tree** shows what every level brings. |
| **Currencies** | Cash, Food Tokens (from orders, events and goals; needed for research, skills and high upgrades), gems and reputation. |
| **Reputation and cleanliness** | Every dish earns reputation, which brings more customers and unlocks the Food Court and Global Kitchen. Trash bins keep the park clean; litter puts customers off. |
| **Orders** | Cafés, hotels and the football club order ingredients for cash, tokens and reputation. |
| **Events and weather** | Lunch rushes, food festivals, critics and tour buses. Sun, cloud, rain and winter snow change how many people come out. |
| **Cards, skills, research** | Rush Hour, Instant Build, Bumper Harvest and Job Fair cards; 3-tier skill trees for every kind of stall; 10 research upgrades. |
| **Guided tutorial** | The first missions show an arrow on the exact button for every tap, with a short instruction: tap the cart, tap the empty slot, hire the recommended beginner, open Build, pick the field, and so on. 18 story missions in all. |
| **Top Tycoons** | A leaderboard of eight rival tycoons who grow over time, ranked by net worth. Everything runs offline. |
| **4 locations** | Riverside Town (Hall 8), Downtown City (Hall 13) and Neon Metropolis (Hall 17), where customers spend more. |

### The 3D world

| Feature | What it does |
|---|---|
| **Original art, no emoji** | Every icon is drawn in code (`www/js/icons.js`): over 80 icons in a glossy cartoon style, plus generated staff portraits with a hat for each job. Every model and texture (grass, asphalt, pavers, brick, plaster, gravel, soil, wood, water) is made in code too. |
| **Tilt-shift miniature look** | A steep telephoto camera, a sharp band in the middle with blurred top and bottom, toy colours and soft shadows. It can be turned off in the profile settings. |
| **A living town** | Sidewalks, a ring road with traffic (cars, taxis, vans and buses) that stops at the crossings, houses or towers depending on the location, parks, a river with boats, a train, hot-air balloons, and a day-night cycle in which windows, signs, lamps and headlights light up. |
| **Farms that work** | Wheat sways in the fields, cows and pigs wander the barn's paddock, fish jump in the ponds, and farmers and fishers walk around working. Cooks appear behind the counter only once you hire them, customers arrive as often as a stall really sells, and busy kitchens smoke. A red bubble marks buildings with no staff; an orange one marks stalls running out of ingredients. |
| **Weather and a living town** | Rain and snow fall over the park and darken the sky. The streets get busier as your reputation grows and quieter at night. |
| **Music** | A gentle market tune composed in code with Web Audio (no audio files). It is brighter by day and turns into a slow music box at night. |
| **Buildings that grow** | Stalls gain menu boards, lanterns and roof signs. Restaurants add floors, café tables and banners. Gardens' crops grow. The Market Hall turns into a palace. Construction shows scaffolding, a crane, a worker and a progress bar. |
| **Performance** | Repeated details are drawn in batches. Detail drops automatically on slow devices, and without WebGL the game still plays through its menus. |

### Monetization (player-friendly)
- **Rewarded ads only**: the game never forces an interstitial. Players choose to watch a video for a 4-hour boost that doubles customers.
- **In-app purchases** (non-consumable):
  - `yum_premium_2x` brings 50% more customers permanently.
  - `yum_vip_pass` gives every ad reward instantly, with no ads.

## Project layout

```
tycoon/
├── www/                  ← the game (this is what ships inside the apps)
│   ├── index.html
│   ├── css/style.css
│   ├── js/engine.js      ← game rules: economy, staff, farms, land, timers, saves — no DOM
│   ├── js/icons.js       ← all icon art, drawn as SVG in code
│   ├── js/world.js       ← the 3D park and town: buildings, placement, customers, traffic, camera, tilt-shift lens
│   ├── fonts/            ← Lilita One + Nunito (SIL Open Font License)
│   ├── vendor/three.min.js ← Three.js r159 (MIT)
│   ├── js/platform.js    ← storage, sound, music, haptics, ads, purchases (native or web fallback)
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
npm test               # 38 rule tests
npm run simulate -- 120     # a bot runs the business for 5 days and prints Market Hall levels and the books
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

All numbers live at the top of `www/js/engine.js`: dish prices and recipes, customers and cooking speed, farm output, wages, tax, supplies, rent, building costs and timers, land prices, Market Hall costs, research and missions. After changing them, run `npm run simulate`. With the current tuning, a player who checks in every few minutes (and sleeps 8 hours a night) reaches Hall 3 in under an hour, Hall 5 in about 4–5 hours, Hall 8 in about a day, Hall 10 in about 2 days and Hall 12 in about 4 days. From Hall 9, each Hall upgrade takes a full day to build.
