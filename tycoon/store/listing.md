# Store listing kit — Yum Empire: Food Tycoon

## Names
- **App name** (both stores, ≤30 chars): `Yum Empire: Food Tycoon`
- **iOS subtitle** (≤30): `Street Food Park Builder`
- **Play short description** (≤80): `Build your own street-food park, expand your land and grow a 3D food empire!`
- **iOS keywords** (≤100, comma-separated, no spaces): `tycoon,builder,city,park,food,restaurant,cooking,street,market,empire,idle,chef,simulation`
- **Category:** Games → Simulation (secondary: Casual)

## Full description (≤4000)

It starts with one little plot, a Market Hall and a single noodle cart. Build it into the biggest street-food park in town! 🍜

🏗️ BUILD YOUR OWN STREET-FOOD PARK
Place noodle carts, dumpling stands, bubble tea bars, taco trucks, pizza parlors, sushi bars, burger joints and giant food courts wherever you like. Drag them around until your park is just right.

📜 EXPAND YOUR LAND
Buy the plot next door to make your park bigger. Every expansion opens up room for more stalls, gardens and decorations.

🏛️ UPGRADE YOUR MARKET HALL
The heart of your park unlocks new buildings, bigger upgrades and more land. Watch it grow from a little hall into a palace with a golden dome.

🥕 GROW INGREDIENTS
Gardens, spice stalls, fish markets and greenhouses supply the ingredients you need for every upgrade.

🌳 DESIGN FOR PROFIT
Tables, lamps, flower planters, trees, fountains and a music stage boost every stall around them. Plan your layout for the biggest bonuses!

🏙️ A LIVING MINIATURE TOWN
A tilt-shift toy town with customers who queue and eat at your tables, traffic, trains, hot-air balloons, and a day-night cycle with glowing lights. Open new parks in Riverside Town, Downtown City and the Neon Metropolis.

👩‍🍳 CHEFS, QUESTS AND REWARDS
Recruit and train chefs, complete endless quests, open reward crates, welcome VIP visitors and collect 75 awards.

✨ PLAYER-FRIENDLY
• No forced ads; videos are optional
• Plays offline, and your park keeps earning while you're away
• No account needed

## What's new (v3.0.0)
A whole new game! Build your own street-food park on a grid, expand your land, upgrade the Market Hall, grow ingredients, and design your layout for bonuses. All-new hand-drawn art.

## Screenshots
Run `npm run serve` in one terminal, then `node tools/screenshots.js` in another. It takes several minutes, because the 3D city is rendered in software. The script writes the sizes each store needs to `store/screenshots/`:
- `ios-6.9/`: 1320×2868 (iPhone 6.9", required)
- `ios-ipad-13/`: 2064×2752 (required, because the iOS project supports iPad)
- `android-phone/`: 1080×1920
- Play also needs a **feature graphic** (1024×500), written to `store/screenshots/feature-graphic.png`. The 512×512 icon is `www/icons/icon-512.png`.

## Content rating
- **Google Play (IARC questionnaire):** no violence, no fear, no sexuality, no gambling, no user interaction or chat, and no location sharing. Answer **Yes** to "contains ads" and **Yes** to "digital purchases". Expected rating: Everyone / PEGI 3.
- **Apple age rating:** None on every content descriptor. Expected rating: 4+.
- **Target audience (Play):** 13+. Choosing under 13 brings you under the Families policy, which requires child-directed AdMob settings.

## Google Play — Data safety form
- **Does your app collect or share user data?** Yes, through the AdMob SDK.
  - **Device or other IDs** (advertising ID): collected and shared. Purposes: Advertising, Analytics, Fraud prevention.
  - **App activity → App interactions:** collected. Purposes: Advertising, Analytics.
  - **Diagnostics** (crash logs): collected. Purpose: Analytics.
  - **Approximate location:** collected (derived from IP address). Purpose: Advertising.
- **Is data encrypted in transit?** Yes.
- **Can users request deletion?** Game data lives only on the device. Uninstalling the app or using Settings → "Delete save" removes it.
- **Purchases:** handled by Google Play. RevenueCat receives an anonymous user ID and purchase history; declare **Purchase history**, collected for App functionality.

## Apple — App Privacy ("nutrition label")
- **Data used to track you:** Device ID (Identifier for Advertisers). This is shown only after the user allows tracking at the App Tracking Transparency prompt.
- **Data linked to you:** Purchases (purchase history, through RevenueCat), for App Functionality.
- **Data not linked to you:** Usage Data (advertising data, product interaction) and Diagnostics (crash data), for Third-Party Advertising and Analytics.

## Review notes (paste into App Review / Play review)
> Yum Empire is an idle tycoon game. No login is required. Rewarded video ads are optional and appear only when the player taps "Watch". The two in-app purchases are non-consumable: "Permanent 2× Profit" (yum_premium_2x) and "VIP Pass" (yum_vip_pass, which grants ad rewards without watching). They can be restored under More → Shop → Restore purchases.

## Release checklist
- [ ] Final app ID / bundle ID chosen
- [ ] Real AdMob app IDs + rewarded unit IDs, `testing: false`
- [ ] IAP products created in both stores and linked in RevenueCat; keys set in `platform.js`
- [ ] `privacy.html` placeholders filled in and hosted at a public URL
- [ ] Version numbers bumped
- [ ] Tested on a real phone: tap, buy, manager, offline earnings, rewarded ad, purchase + restore
- [ ] Screenshots + feature graphic uploaded
