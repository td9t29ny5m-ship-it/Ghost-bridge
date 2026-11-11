# 🍜 Yum Empire: Food Tycoon

An idle tycoon game for **iOS (App Store)** and **Android (Google Play)**. Start with one noodle cart and grow a global food empire.

The game is plain HTML/CSS/JS with no framework and no build step. [Capacitor](https://capacitorjs.com) wraps it as native iOS and Android apps.

## Gameplay

| Feature | What it does |
|---|---|
| **10 businesses** | Noodle Cart → Dumpling Stand → Bubble Tea Bar → Taco Truck → Pizza Parlor → Sushi Lounge → Burger Chain → Food Court → Snack Factory → Global Cuisine. |
| **Tap to cook** | Each business cooks one meal per tap until you hire its manager. |
| **Managers** | Run a business automatically, including while the app is closed. |
| **Level milestones** | Levels 25/50/100/200/300/400/500 double speed. Levels 600–1000 quadruple profit. |
| **Global milestones** | When every business reaches a milestone level, all profits double. |
| **62 upgrades** | Each one triples profit for a single business or for all of them. |
| **Buy modes** | ×1, ×10, ×100, "Next" (up to the next milestone) and "Max". |
| **Franchise (prestige)** | Reset your empire for Golden Stars. Each star gives a permanent +4% profit. |
| **VIP customers** | A random visitor you can tap for a big cash tip or a ×7 "frenzy" lasting 30s. |
| **Offline earnings** | Up to 8 hours, with an option to double them by watching an ad. |
| **Daily rewards** | A 7-day streak. Day 7 includes a free 4h boost. |
| **59 achievements** | Each one adds +2% profit. |
| **Polish** | Synthesized sound effects (no audio files), haptics, toasts, floating coins, a tutorial, safe-area support and reduced-motion support. |

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
npm test               # 19 engine unit tests
npm run simulate -- 1.5 6   # bot plays 6 franchise runs of 1.5h each and prints pacing
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

All numbers live at the top of `www/js/engine.js`: business costs and revenues, milestone levels, upgrade cost curves, the star bonus and the offline cap. After changing them, run `npm run simulate` to check that pacing still feels right. The current tuning gives a first franchise worth roughly 20 stars after 1–1.5 hours of active play. After that, each franchise run gives noticeably more stars than the last.
