# Store listing kit — Yum Empire: Food Tycoon

## Names
- **App name** (both stores, ≤30 chars): `Yum Empire: Food Tycoon`
- **iOS subtitle** (≤30): `Run a Street Food Business`
- **Play short description** (≤80): `Hire staff, grow ingredients and turn one noodle cart into a 3D food empire!`
- **iOS keywords** (≤100, comma-separated, no spaces): `tycoon,business,farm,restaurant,food,cooking,street,market,empire,staff,manager,city,simulation`
- **Category:** Games → Simulation (secondary: Casual)

## Full description (≤4000)

It starts with one noodle cart, $400 and a few bags of flour and vegetables. Hire your first cook, and grow it into the biggest street-food business in the country!

RUN A REAL BUSINESS
Every dish has a real price and real ingredients. Customers come and go through the day, with a lunch rush and a dinner peak. Pay wages, sales tax, supplies and rent, and watch your profit in the daily report.

HIRE YOUR TEAM
Choose cooks, farmers and fishers from the hiring board. Each has their own skills, personality and wage. Train them up, move them around and build the perfect team.

GROW YOUR OWN FOOD
Plant wheat fields, veggie gardens and fruit orchards, flood rice paddies, raise animals in the barn and dig fish ponds. Your farmers grow everything your stalls need, or buy the rest at the market.

BUILD AND EXPAND
Noodle carts, dumpling stands, bubble tea bars, taco trucks, pizza parlors, sushi bars, burger joints, food courts and a global kitchen. Buy the land next door to make room, and upgrade your Market Hall to unlock more.

A LIVING MINIATURE TOWN
A tilt-shift toy town where customers queue and eat at your tables, cows wander the paddock, fish jump in the ponds, kitchens smoke, and rain and snow roll in. Day turns to night with glowing lights.

GOALS EVERYWHERE
A story of missions, orders from around town, festivals and food critics, skill trees, research, reward cards and a leaderboard of rival tycoons to beat.

PLAYER-FRIENDLY
- No forced ads; videos are optional
- Plays offline, and your staff keep working while you're away
- No account needed

## What's new (v4.0.0)
A real business! Hire cooks, farmers and fishers, grow your own ingredients on farms and fish ponds, pay wages and tax, and follow your profit in the daily report. New 3D farms, animals, weather and music.

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
> Yum Empire is a business tycoon game. No login is required. Rewarded video ads are optional and appear only when the player taps "Watch". The two in-app purchases are non-consumable: "Premium Business" (yum_premium_2x, +50% customers) and "VIP Pass" (yum_vip_pass, which grants ad rewards without watching). They can be restored under Store → Restore purchases.

## Release checklist
- [ ] Final app ID / bundle ID chosen
- [ ] Real AdMob app IDs + rewarded unit IDs, `testing: false`
- [ ] IAP products created in both stores and linked in RevenueCat; keys set in `platform.js`
- [ ] `privacy.html` placeholders filled in and hosted at a public URL
- [ ] Version numbers bumped
- [ ] Tested on a real phone: hire, build, farms, market, offline progress, rewarded ad, purchase + restore
- [ ] Screenshots + feature graphic uploaded
