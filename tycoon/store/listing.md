# Store listing kit — Yum Empire: Food Tycoon

## Names
- **App name** (both stores, ≤30 chars): `Yum Empire: Food Tycoon`
- **iOS subtitle** (≤30): `Build a 3D Food Empire`
- **Play short description** (≤80): `Buy land, build shops and grow a food empire in a living 3D miniature world!`
- **iOS keywords** (≤100, comma-separated, no spaces): `idle,tycoon,clicker,restaurant,cooking,food,business,money,empire,incremental,manager,chef,cafe`
- **Category:** Games → Simulation (secondary: Casual)

## Full description (≤4000)

Your food empire starts with one tiny noodle cart in a quiet suburb. Only a few customers stop by at first. Serve them, save up, buy land, and watch a whole miniature world come alive around your shops! 🍜

🏙️ A LIVING 3D MINIATURE WORLD
A charming tilt-shift toy town with walking customers, busy traffic, trains, hot-air balloons, day and night, and a skyline that grows with your success. Drag, pinch and rotate to explore.

📜 BUY LAND, CHOOSE WHAT TO BUILD
Plots come in four sizes. Bigger land costs more but holds grander, more profitable shops. Pick from 10 kinds of food business: noodles, dumplings, bubble tea, tacos, pizza, sushi, burgers, food courts, snack factories and global cuisine. Every new shop opens as a little stall and grows into a restaurant tower.

🗺️ FROM SUBURB TO METROPOLIS
Expand from Maple Suburb to Riverside Town, Downtown City and the Neon Metropolis. Every district is a new map with more land and bigger profits.

👩‍🍳 HIRE CHEFS AND MANAGERS
Recruit Common, Rare, Epic and Legendary chefs, train them and put them in their favourite kitchens. Managers keep your shops running even while you're away.

💎 QUESTS, CRATES AND REWARDS
Endless quests, free reward crates, player levels, daily rewards and 74 awards, all paying gems you can spend on chefs, boosts and time warps.

🔬 RESEARCH AND FRANCHISE
Discover 62 upgrades, hit empire milestones, then franchise for Golden Stars that make every new empire grow faster.

✨ PLAYER-FRIENDLY
• No forced ads. Watch videos only when you want a bonus.
• Plays offline
• No account needed

Start small, dream big, and become the greatest food tycoon in the world!

## What's new (v2.0.0)
The big expansion! 🎉 Buy land in four sizes and choose what to build, four districts from the suburbs to the Neon Metropolis, chefs with rarities, gems, player levels, endless quests, reward crates, research and a brand-new look.

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
