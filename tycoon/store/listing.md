# Store listing kit — Yum Empire: Food Tycoon

## Names
- **App name** (both stores, ≤30 chars): `Yum Empire: Food Tycoon`
- **iOS subtitle** (≤30): `Idle Restaurant Builder`
- **Play short description** (≤80): `Build a food empire from one noodle cart. Hire managers, franchise, get rich!`
- **iOS keywords** (≤100, comma-separated, no spaces): `idle,tycoon,clicker,restaurant,cooking,food,business,money,empire,incremental,manager,chef,cafe`
- **Category:** Games → Simulation (secondary: Casual)

## Full description (≤4000)

Your street-food empire starts with one humble noodle cart. Cook meals, earn cash, and turn a single cart into a worldwide food brand! 🍜

🏪 OPEN 10 FOOD BUSINESSES
Go from Noodle Cart to Dumpling Stand, Bubble Tea Bar, Taco Truck, Pizza Parlor, Sushi Lounge, Burger Chain, Food Court, Snack Factory, and finally Global Cuisine.

🧑‍🍳 HIRE MANAGERS
Let your managers cook for you. They keep earning even while you're away, so collect your earnings when you come back!

⚡ UPGRADE EVERYTHING
Unlock 60+ upgrades and level milestones that double speed and multiply profits. Watch the money roll in faster and faster.

⭐ FRANCHISE FOR GOLDEN STARS
Sell your empire to investors to earn Golden Stars. Every star permanently boosts your profit, so each new empire grows faster than the last.

🤩 SERVE VIP CUSTOMERS
Tap surprise VIP visitors for huge tips or a 7× profit frenzy!

🎁 DAILY REWARDS & 59 ACHIEVEMENTS
Come back every day for growing rewards, and collect achievements that boost your profit.

✨ PLAYER-FRIENDLY
• No forced ads. Watch videos only when you want a bonus.
• Plays offline
• No account needed
• Satisfying sounds and haptics

Start cooking and become the biggest food tycoon in the world!

## What's new (v1.0.0)
Grand opening! 🎉 10 businesses, managers, franchising, VIP customers, daily rewards and 59 achievements.

## Screenshots
Run `npm run serve` in one terminal, then `node tools/screenshots.js` in another. The script writes the sizes each store needs to `store/screenshots/`:
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
