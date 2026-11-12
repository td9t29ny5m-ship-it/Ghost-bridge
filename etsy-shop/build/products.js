'use strict'
const K = require('./kit')
const { header: H, table: T, box: B, lines: L, checks: C, labelled: LB, row: R, grid: G, MONTHS, MON3, DAYS, DAY3 } = K

const P = (title, inner) => ({ title, html: `<section class="page">${inner}</section>` })
const coverPage = (kicker, title, sub) => P('Cover', K.cover(kicker, title, sub))
const range = n => Array.from({ length: n }, (_, i) => i + 1)

// ---------------------------------------------------------------- 1. Christmas planner
const christmas = {
  slug: '01-christmas-planner',
  name: 'Christmas Planner',
  accent: '#9b2f2f', tint: '#f5e8e6', head: 'Playfair Display', headw: 600,
  hero: [2, 6, 5],
  pages: () => [
    coverPage('Holiday Season', 'Christmas Planner', 'Gifts · Budget · Menu · To-Do'),
    P('Holiday Overview', H('Holiday Season', 'Holiday Overview', ['Year']) +
      R([B('Holiday Budget', LB(['Gifts', 'Food', 'Decor', 'Travel', 'Cards', 'Events', 'Other', 'Total'])), B('Important Dates', L(8))]) +
      R([B('Traditions to Keep', L(7)), B('This Year I Want To', L(7))]) +
      R([B('Notes', L(6))], 'flex:.8')),
    P('Holiday Countdown', H('Six Weeks to Christmas', 'Holiday Countdown') +
      G(['6 Weeks Before', '5 Weeks Before', '4 Weeks Before', '3 Weeks Before', '2 Weeks Before', '1 Week Before'].map(t => B(t, C([], 6))), 2)),
    P('December To-Do', H('Daily Plan', 'December Countdown', ['Year']) +
      G(range(25).map(d => `<div class="box"><div class="bt">December ${d}</div><div class="bb">${L(3)}</div></div>`), 5)),
    P('Gift Tracker', H('Who To Buy For', 'Gift Tracker', ['Budget']) +
      T([['Name', 2.2], ['Gift Idea', 3.2], ['Budget', 1.3], ['Spent', 1.3], ['Bought', 1, 'check'], ['Wrapped', 1.1, 'check']], 24, { foot: 'Total' })),
    P('Christmas Card List', H('Season’s Greetings', 'Christmas Card List') +
      T([['Name', 2.4], ['Address', 5], ['Sent', 0.9, 'check'], ['Received', 1.2, 'check']], 26)),
    P('Holiday Meal Planner', H('Christmas Dinner', 'Holiday Meal Planner', ['Date', 'Guests']) +
      R([B('Appetizers', L(5)), B('Main Course', L(5))]) +
      R([B('Side Dishes', L(5)), B('Desserts', L(5))]) +
      R([B('Drinks', L(5)), B('Guest List', L(5))]) +
      R([B('Prep Timeline', LB(['2 Days Before', '1 Day Before', 'Morning Of', '2 Hours Before', 'Before Serving']))], 'flex:1.1')),
    P('Holiday Shopping List', H('Groceries & Supplies', 'Holiday Shopping List') +
      G(['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Baking Supplies', 'Drinks', 'Party & Other'].map(t => B(t, C([], 6))), 2)),
    P('Baking Plan', H('Cookies & Treats', 'Holiday Baking Plan') +
      T([['Recipe', 3], ['For', 2], ['Ingredients Needed', 4], ['Date', 1.3], ['Done', 1, 'check']], 18) +
      R([B('Cookie Exchange Notes', L(5))], 'flex:.45')),
    P('Events & Parties', H('Holiday Calendar', 'Events & Parties') +
      G(range(6).map(i => B('Event', LB(['Date / Time', 'Location', 'Hosted By', 'Bring', 'Outfit', 'Gift For Host']))), 2)),
    P('Decor & Home To-Do', H('Deck The Halls', 'Decor & Home To-Do') +
      R([B('Decorating', C(['Get tree', 'Lights on house', 'Hang wreath', 'Decorate tree', 'Stockings', 'Table setting', 'Outdoor decor'], 9)),
        B('Home Prep', C(['Deep clean kitchen', 'Guest room ready', 'Extra chairs', 'Clean oven', 'Wash table linens', 'Stock drinks', 'Gift wrap station'], 9))])),
    P('Notes', H('Holiday Season', 'Notes') + B('Notes', L(28)))
  ],
  listing: {
    title: 'Christmas Planner Printable, Holiday Planner, Gift Tracker, Christmas Budget, Card List, Holiday Meal Planner, Christmas To Do List PDF',
    price: '4.99',
    tags: ['christmas planner', 'holiday planner', 'gift tracker', 'christmas printable', 'christmas budget', 'christmas card list', 'holiday meal planner', 'christmas to do list', 'gift list printable', 'december planner', 'christmas organizer', 'holiday printable', 'xmas planner'],
    what: 'Plan the whole holiday season in one place: gifts, budget, cards, menu, baking, parties and a day-by-day December countdown.',
    gift: true
  }
}

// ---------------------------------------------------------------- 2. 2027 calendar
const calendarPages = monStart => () => [
  P('2027 Year at a Glance', H('Year at a Glance', '2027 Calendar') +
    `<div class="gridbox" style="grid-template-columns:repeat(3,1fr);grid-auto-rows:auto;align-content:space-evenly">${MONTHS.map((m, i) =>
      `<div><div class="kicker" style="text-align:center;margin-bottom:1.5mm">${m}</div>${K.monthGrid(2027, i, monStart, true)}</div>`).join('')}</div>`),
  ...MONTHS.map((m, i) => P(m + ' 2027', H('2027', m) +
    `<div class="grow" style="flex:5">${K.monthGrid(2027, i, monStart)}</div>` +
    R([B('Goals', L(4)), B('Notes', L(4))], 'flex:1.05')))
]
const calendar = {
  slug: '02-2027-calendar',
  name: '2027 Calendar',
  accent: '#3d5a6c', tint: '#e7eef2', head: 'Playfair Display', headw: 600,
  hero: [1, 0, 2],
  variants: [{ id: 'sunday-start', label: 'Sunday Start', pages: calendarPages(false) }, { id: 'monday-start', label: 'Monday Start', pages: calendarPages(true) }],
  listing: {
    title: '2027 Calendar Printable, Monthly Calendar 2027, Minimalist Wall Calendar, Year at a Glance, Sunday & Monday Start, Letter & A4 PDF',
    price: '3.50',
    tags: ['2027 calendar', 'printable calendar', 'monthly calendar', '2027 planner', 'minimalist calendar', 'wall calendar', 'year at a glance', 'desk calendar', 'calendar printable', '2027 monthly', 'family calendar', 'simple calendar', 'calendar pdf'],
    what: 'A clean, minimalist 2027 calendar: a year-at-a-glance page plus 12 full monthly pages with room for goals and notes. Comes in both Sunday-start and Monday-start versions.'
  }
}

// ---------------------------------------------------------------- 3. Budget planner
const budget = {
  slug: '03-budget-planner',
  name: 'Budget Planner',
  accent: '#4f6b4a', tint: '#e9efe6', head: 'Playfair Display', headw: 600,
  hero: [2, 3, 6],
  pages: () => [
    coverPage('Personal Finance', 'Budget Planner', 'Income · Expenses · Savings · Debt'),
    P('Annual Overview', H('Personal Finance', 'Annual Overview', ['Year']) +
      T([['Month', 1.6], ['Income', 1.5], ['Expenses', 1.5], ['Savings', 1.5], ['Debt Paid', 1.5], ['Notes', 2.6]], 12, { cell: (r, i) => i === 0 ? MONTHS[r] : null, foot: 'Total' })),
    P('Monthly Budget', H('Personal Finance', 'Monthly Budget', ['Month']) +
      R([B('Income', T([['Source', 2], ['Expected', 1.2], ['Actual', 1.2]], 5)), B('Summary', LB(['Total Income', 'Total Expenses', 'Savings', 'Debt Payments', 'Left Over']))], 'flex:.9') +
      R([B('Fixed Expenses', T([['Bill', 2], ['Budget', 1.1], ['Actual', 1.1], ['Paid', .8, 'check']], 12)), B('Variable Expenses', T([['Category', 2], ['Budget', 1.1], ['Actual', 1.1]], 12))], 'flex:1.8')),
    P('Expense Tracker', H('Where It Goes', 'Expense Tracker', ['Month']) +
      T([['Date', 1.1], ['Description', 3.4], ['Category', 2], ['Payment', 1.5], ['Amount', 1.4]], 28, { foot: 'Total' })),
    P('Bill Tracker', H('Never Miss A Payment', 'Bill Tracker', ['Year']) +
      T([['Bill', 2.6], ['Due', 1], ['Amount', 1.3], ...MON3.map(m => [m, .62, 'check'])], 20, { cls: 'dense' })),
    P('Savings Tracker', H('Watch It Grow', 'Savings Tracker') +
      R([B('Goal', LB(['Saving For', 'Target Amount', 'Each Circle =', 'Start Date', 'Goal Date']))], 'flex:.55') +
      `<div class="note">Color in one circle every time you save. Fill all 100 to reach your goal.</div>` + K.numbered(100, 10) +
      R([B('Deposits', T([['Date', 1], ['Amount', 1], ['Balance', 1], ['Date', 1], ['Amount', 1], ['Balance', 1]], 5))], 'flex:.65')),
    P('Debt Payoff Tracker', H('Debt Free Journey', 'Debt Payoff Tracker') +
      R([B('Debt Details', LB(['Creditor', 'Starting Balance', 'Interest Rate', 'Minimum Payment', 'Target Payoff Date'])),
        B('Progress', `<div class="note" style="margin-top:1.5mm">Shade each block as you pay it down.</div>` + `<div class="gridbox" style="grid-template-columns:repeat(5,1fr);gap:2mm;margin:1.5mm 0 .5mm">${range(10).map(n => `<div style="border:.8pt solid #9a9a9a;border-radius:1.5mm;display:flex;align-items:center;justify-content:center;font-size:7.5pt;font-weight:600;color:#888">${n * 10}%</div>`).join('')}</div>`)], 'flex:.75') +
      T([['Date', 1.2], ['Payment', 1.4], ['Interest', 1.2], ['Balance', 1.4], ['Date', 1.2], ['Payment', 1.4], ['Interest', 1.2], ['Balance', 1.4]], 16)),
    P('Sinking Funds', H('Save Ahead', 'Sinking Funds') +
      G(range(6).map(() => B('Fund ________ &nbsp; Goal ________', T([['Date', 1], ['Amount', 1], ['Total', 1]], 7))), 2)),
    P('Subscription Tracker', H('Recurring Payments', 'Subscription Tracker') +
      T([['Service', 2.5], ['Cost', 1.1], ['Billing Date', 1.4], ['Frequency', 1.4], ['Account', 1.8], ['Keep', .8, 'check'], ['Cancel', .9, 'check']], 22, { foot: 'Monthly Total' })),
    P('Financial Goals', H('Dream Big', 'Financial Goals', ['Year']) +
      R([B('Short-Term Goals (This Year)', C([], 7)), B('Long-Term Goals (1–5 Years)', C([], 7))]) +
      R([B('Why These Goals Matter', L(7)), B('Habits That Will Get Me There', C([], 7))]) +
      R([B('Rewards When I Hit My Goals', L(5))], 'flex:.7')),
    P('No-Spend Challenge', H('30 Days', 'No-Spend Challenge', ['Start Date']) +
      `<div class="note">Color in each day you don’t spend on non-essentials.</div>` + K.numbered(30, 6) +
      R([B('My Rules: Allowed', C([], 5)), B('My Rules: Not Allowed', C([], 5)), B('Money Saved', LB(['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Total']))], 'flex:.8'))
  ],
  listing: {
    title: 'Budget Planner Printable, Monthly Budget Template, Expense Tracker, Bill Tracker, Savings Tracker, Debt Payoff, Finance Planner PDF',
    price: '5.99',
    tags: ['budget planner', 'monthly budget', 'expense tracker', 'bill tracker', 'savings tracker', 'debt payoff tracker', 'finance planner', 'budget printable', 'budget template', 'sinking funds', 'no spend challenge', 'money planner', 'budget binder'],
    what: 'Everything you need to take control of your money: monthly budget, expense and bill tracking, savings and debt payoff trackers, sinking funds, subscriptions and a no-spend challenge.'
  }
}

// ---------------------------------------------------------------- 4. Habit tracker
const habits = {
  slug: '04-habit-tracker',
  name: 'Habit Tracker',
  accent: '#7a5c8c', tint: '#efe8f3', head: 'Playfair Display', headw: 600,
  hero: [0, 1, 3],
  pages: () => [
    P('Monthly Habit Tracker', H('Small Steps Daily', 'Monthly Habit Tracker', ['Month', 'Year']) +
      T([['Habit', 5.2], ...range(31).map(d => [d, 1, 'mini']), ['Goal', 1.6, 'mini']], 22, { cls: 'dense' }) +
      R([B('Reflection: What Worked?', L(3)), B('What Will I Change?', L(3))], 'flex:.25')),
    P('Weekly Habit Tracker', H('One Week At A Time', 'Weekly Habit Tracker', ['Week Of']) +
      T([['Habit', 4], ...DAY3.map(d => [d, 1, 'circle']), ['Done', 1, 'mini']], 18) +
      R([B('Wins This Week', L(4)), B('Focus For Next Week', L(4))], 'flex:.32')),
    P('Year in Pixels', H('Track One Thing All Year', 'Year in Pixels', ['Year']) +
      R([`<div class="grow" style="flex:4">${T([['', .9, 'mini'], ...MON3.map(m => [m, 1, 'mini'])], 31, { cls: 'dense', grow: false, cell: (r, i) => i === 0 ? String(r + 1) : null })}</div>`,
        B('Color Key', LB(['', '', '', '', '', '']).replace(/<b><\/b>/g, '<i class="cb" style="width:5mm;height:5mm"></i>') + '<div class="note" style="margin:2mm 0">Pick a color for each mood or level and fill one square per day.</div>', 'flex:1.2')])),
    P('Habit Planning', H('Build Habits That Stick', 'Habit Planning') +
      G(range(4).map(i => B('Habit ' + i, LB(['The Habit', 'Why It Matters', 'When / Where', 'Cue', 'Reward', 'Obstacle', 'My Plan B']))), 2)),
    P('30-Day Challenge', H('Show Up For 30 Days', '30-Day Challenge', ['Start Date']) +
      R([B('My Challenge', L(3))], 'flex:.32') + K.numbered(30, 6) +
      R([B('How I Felt At The Start', L(4)), B('How I Feel At The End', L(4))], 'flex:.5'))
  ],
  listing: {
    title: 'Habit Tracker Printable, Monthly Habit Tracker, Weekly Habit Tracker, Year in Pixels, 30 Day Challenge, Undated Daily Tracker PDF',
    price: '3.50',
    tags: ['habit tracker', 'monthly habit', 'weekly habit tracker', 'year in pixels', 'daily tracker', '30 day challenge', 'habit printable', 'goal tracker', 'mood tracker', 'self care planner', 'undated planner', 'routine tracker', 'productivity'],
    what: 'Undated habit tracker you can reuse every month, forever: monthly (31-day) and weekly trackers, a year-in-pixels page, habit planning worksheets and a 30-day challenge.'
  }
}

// ---------------------------------------------------------------- 5. Meal planner
const meals = {
  slug: '05-meal-planner',
  name: 'Meal Planner',
  accent: '#b0663a', tint: '#f6ebe3', head: 'Playfair Display', headw: 600,
  hero: [0, 1, 3],
  pages: () => [
    P('Weekly Meal Planner', H('Eat Well', 'Weekly Meal Planner', ['Week Of']) +
      T([['', 1.4], ['Breakfast', 2], ['Lunch', 2], ['Dinner', 2], ['Snacks', 1.6]], 7, { cell: (r, i) => i === 0 ? DAYS[r] : null }) +
      R([B('Prep Ahead', C([], 5)), B('Notes', L(5))], 'flex:.32')),
    P('Grocery List', H('Shopping Day', 'Grocery List', ['Date', 'Budget']) +
      G(['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery', 'Pantry', 'Frozen', 'Drinks & Snacks', 'Household'].map(t => B(t, C([], 7))), 2)),
    P('Monthly Meal Plan', H('Dinner Every Night', 'Monthly Meal Plan', ['Month']) + `<div class="grow">${K.blankMonth()}</div>`),
    P('Recipe Cards', H('Family Favorites', 'Recipe Cards') +
      [1, 2].map(() => B('Recipe ____________________ &nbsp; Serves ____ &nbsp; Prep ____ &nbsp; Cook ____',
        R([`<div style="flex:1;display:flex;flex-direction:column"><div class="kicker" style="margin:2mm 0 0">Ingredients</div>${C([], 9)}</div>`,
          `<div style="flex:1.6;display:flex;flex-direction:column"><div class="kicker" style="margin:2mm 0 0">Directions</div>${L(9)}</div>`]))).join('')),
    P('Pantry Inventory', H('What’s In Stock', 'Pantry & Freezer Inventory') +
      R([B('Pantry', T([['Item', 2.6], ['Qty', .8], ['Expires', 1.2], ['Buy', .7, 'check']], 22)), B('Freezer', T([['Item', 2.6], ['Qty', .8], ['Frozen', 1.2], ['Buy', .7, 'check']], 22))]))
  ],
  listing: {
    title: 'Meal Planner Printable, Weekly Meal Plan, Grocery List, Monthly Meal Planner, Recipe Cards, Pantry Inventory, Menu Planner PDF',
    price: '3.25',
    tags: ['meal planner', 'weekly meal plan', 'grocery list', 'menu planner', 'meal plan printable', 'recipe card', 'pantry inventory', 'food planner', 'monthly meal plan', 'shopping list', 'dinner planner', 'kitchen printable', 'family meal plan'],
    what: 'Plan meals, shop faster and waste less: weekly and monthly meal planners, a categorized grocery list, recipe cards and pantry/freezer inventory.'
  }
}

// ---------------------------------------------------------------- 6. Kids chore chart
const AGES = [
  ['Ages 2–3', ['Put toys in bin', 'Put clothes in hamper', 'Wipe up spills', 'Feed pets (with help)', 'Help make bed']],
  ['Ages 4–5', ['Make bed', 'Set the table', 'Water plants', 'Match socks', 'Clear own dishes']],
  ['Ages 6–7', ['Sort laundry', 'Sweep floors', 'Pack school bag', 'Put away groceries', 'Dust furniture']],
  ['Ages 8–9', ['Load dishwasher', 'Fold laundry', 'Take out trash', 'Vacuum rooms', 'Make simple snacks']],
  ['Ages 10–12', ['Clean bathroom sink', 'Mop floors', 'Help cook dinner', 'Do own laundry', 'Mow lawn (with help)']],
  ['Ages 13+', ['Cook a simple meal', 'Clean bathroom', 'Wash the car', 'Babysit siblings', 'Grocery shopping']]
]
const chores = {
  slug: '06-kids-chore-chart',
  name: 'Kids Chore Chart',
  accent: '#2a8c82', tint: '#e2f2f0', head: 'Fredoka', headw: 600,
  hero: [0, 2, 1],
  pages: () => [
    P('Weekly Chore Chart', H('Super Helper', 'My Chore Chart', ['Name', 'Week Of']) +
      T([['Chore', 3.2], ...DAY3.map(d => [d, 1, 'circle'])], 12) +
      R([B('Stars Earned This Week', `<div style="flex:1;display:flex;align-items:center;justify-content:center;font-size:30pt;color:#ccc">☆ ______</div>`), B('My Reward', L(3))], 'flex:.3')),
    P('Morning & Evening Routine', H('Every Day', 'My Daily Routine', ['Name']) +
      B('Morning', T([['Task', 3.2], ...DAY3.map(d => [d, 1, 'circle'])], 8, { cell: (r, i) => i === 0 ? ['Get dressed', 'Make my bed', 'Eat breakfast', 'Brush teeth', 'Brush hair', 'Pack school bag', 'Shoes & coat on', ''][r] : null })) +
      B('Evening', T([['Task', 3.2], ...DAY3.map(d => [d, 1, 'circle'])], 8, { cell: (r, i) => i === 0 ? ['Homework', 'Tidy my room', 'Bath / shower', 'Pajamas on', 'Brush teeth', 'Pick tomorrow’s clothes', 'Read a book', ''][r] : null }))),
    P('Reward Chart', H('You Can Do It!', 'Reward Chart', ['Name']) +
      R([B('My Goal', L(2)), B('My Reward', L(2))], 'flex:.28') +
      `<div class="note">Add a sticker or color a star each time you do it!</div>` + K.numbered(30, 5).replace(/<span>(\d+)<\/span>/g, '<span style="font-size:20pt;color:#c9c9c9">☆</span>')),
    P('Allowance Tracker', H('Earn · Save · Spend', 'Allowance Tracker', ['Name']) +
      T([['Week', 1.2], ['Chores Done', 1.4], ['Earned', 1.2], ['Save', 1.1], ['Spend', 1.1], ['Give', 1.1], ['Total Saved', 1.4]], 16) +
      R([B('I’m Saving Up For', L(3)), B('It Costs', L(3))], 'flex:.28')),
    P('Chore Ideas by Age', H('For Parents', 'Chore Ideas by Age') +
      G(AGES.map(([t, items]) => B(t, C(items))), 2) +
      '<div class="note">Tip: start with 2–3 chores, praise effort over perfection, and add a new chore once a routine feels easy.</div>')
  ],
  listing: {
    title: 'Kids Chore Chart Printable, Reward Chart, Daily Routine Chart, Allowance Tracker, Responsibility Chart for Kids, Chores by Age PDF',
    price: '3.25',
    tags: ['chore chart', 'kids chore chart', 'reward chart', 'routine chart', 'responsibility chart', 'allowance tracker', 'kids printable', 'chore list', 'morning routine', 'sticker chart', 'behavior chart', 'chores for kids', 'family chore chart'],
    what: 'Make chores fun and routines easy: a weekly chore chart, morning and evening routine charts, a sticker reward chart, an allowance tracker and a parent guide of chore ideas by age.'
  }
}

// ---------------------------------------------------------------- 7. Cleaning schedule
const cleaning = {
  slug: '07-cleaning-schedule',
  name: 'Cleaning Schedule',
  accent: '#3f7a9e', tint: '#e5f0f6', head: 'Playfair Display', headw: 600,
  hero: [1, 0, 4],
  pages: () => [
    P('Daily Cleaning Checklist', H('Little & Often', 'Daily Cleaning Checklist', ['Week Of']) +
      T([['Task', 3.4], ...DAY3.map(d => [d, 1, 'check'])], 16, { cell: (r, i) => i === 0 ? ['Make beds', 'Wash dishes / load dishwasher', 'Wipe kitchen counters', '10-minute tidy', 'Sweep kitchen floor', 'Run a load of laundry', 'Wipe bathroom sink', 'Take out trash', 'Sort mail', ''][r] ?? '' : null })),
    P('Weekly Cleaning Schedule', H('One Zone A Day', 'Weekly Cleaning Schedule') +
      G([['Monday — Bathrooms', ['Scrub toilet', 'Clean shower / tub', 'Wipe mirrors', 'Mop floor']], ['Tuesday — Dusting', ['Dust surfaces', 'Dust shelves', 'Wipe light switches', 'Dust electronics']],
        ['Wednesday — Floors', ['Vacuum all rooms', 'Mop hard floors', 'Shake out rugs', 'Vacuum stairs']], ['Thursday — Kitchen', ['Wipe appliances', 'Clean microwave', 'Clean out fridge', 'Scrub sink']],
        ['Friday — Bedrooms', ['Change bed sheets', 'Declutter surfaces', 'Put away laundry', 'Empty bins']], ['Saturday — Errands', ['Grocery shop', 'Restock supplies', 'Water plants', 'Meal prep']],
        ['Sunday — Reset', ['Plan the week', 'Laundry catch-up', 'Tidy entryway', 'Rest!']], ['Notes', null]].map(([t, it]) => B(t, it ? C(it, 2) : L(6))), 2)),
    P('Monthly Cleaning Checklist', H('Deeper Clean', 'Monthly Cleaning Checklist', ['Year']) +
      T([['Task', 3], ...MON3.map(m => [m, .62, 'check'])], 18, { cls: 'dense', cell: (r, i) => i === 0 ? ['Clean oven', 'Clean fridge shelves', 'Wipe baseboards', 'Wash windows', 'Clean light fixtures', 'Vacuum upholstery', 'Wash pillows', 'Dust blinds', 'Clean vents & filters', 'Descale kettle / coffee maker', 'Clean dishwasher filter', 'Flip / rotate mattress', 'Wipe cabinet fronts', 'Clean trash cans', ''][r] ?? '' : null })),
    P('Seasonal Deep Clean', H('Four Times A Year', 'Seasonal Deep Clean', ['Year']) +
      G([['Spring', ['Wash windows inside & out', 'Clean patio furniture', 'Switch wardrobe', 'Wash curtains', 'Clean gutters']], ['Summer', ['Clean grill', 'Wash outdoor cushions', 'Clean ceiling fans', 'Declutter garage', 'Clean car inside']],
        ['Fall', ['Service heating', 'Clean fireplace', 'Wash duvets & blankets', 'Clean behind appliances', 'Test smoke alarms']], ['Winter', ['Declutter toys', 'Clean light fixtures', 'Organize pantry', 'Wash walls & doors', 'Shampoo carpets']]].map(([t, it]) => B(t, C(it, 4))), 2)),
    P('Room by Room Checklist', H('Top To Bottom', 'Room by Room Checklist') +
      G([['Kitchen', ['Counters & backsplash', 'Appliances', 'Sink & faucet', 'Cabinet fronts', 'Floor']], ['Bathroom', ['Toilet', 'Shower & tub', 'Sink & mirror', 'Towels', 'Floor']],
        ['Bedroom', ['Change sheets', 'Dust surfaces', 'Declutter', 'Under bed', 'Floor']], ['Living Room', ['Dust & polish', 'Cushions & throws', 'Electronics', 'Windowsills', 'Floor']],
        ['Entryway', ['Shoes & coats', 'Door & handle', 'Mat', 'Mail spot', 'Floor']], ['Laundry Room', ['Washer seal & drawer', 'Dryer lint trap', 'Shelves', 'Sink', 'Floor']]].map(([t, it]) => B(t, C(it, 2))), 2))
  ],
  listing: {
    title: 'Cleaning Schedule Printable, Weekly Cleaning Checklist, Daily Monthly Cleaning Planner, Room by Room Checklist, House Chore List PDF',
    price: '3.50',
    tags: ['cleaning schedule', 'cleaning checklist', 'cleaning planner', 'weekly cleaning', 'house cleaning', 'chore list', 'cleaning printable', 'home organization', 'deep clean checklist', 'household planner', 'adhd cleaning', 'cleaning routine', 'home binder'],
    what: 'A simple system to keep the whole house clean without burning out: daily, weekly (one zone a day), monthly and seasonal checklists plus a room-by-room guide.'
  }
}

// ---------------------------------------------------------------- 8. Baby tracker
const baby = {
  slug: '08-newborn-baby-tracker',
  name: 'Newborn Baby Tracker',
  accent: '#b07a8a', tint: '#f6ebee', head: 'Playfair Display', headw: 600,
  hero: [1, 2, 5],
  pages: () => [
    coverPage('Hello, Little One', 'Baby Tracker', 'Feeding · Sleep · Diapers · Growth'),
    P('Daily Baby Log', H('Hello, Little One', 'Daily Baby Log', ['Date']) +
      T([['Time', 1.1], ['Breast L / R / Bottle', 2], ['Amount / Mins', 1.5], ['Wet', .7, 'check'], ['Dirty', .7, 'check'], ['Sleep From – To', 1.8], ['Notes', 2]], 20) +
      R([B('Daily Totals', LB(['Feeds', 'Wet Diapers', 'Dirty Diapers', 'Total Sleep'])), B('Notes & Questions for Doctor', L(4))], 'flex:.3')),
    P('Weekly Sleep Log', H('Sweet Dreams', 'Weekly Sleep Log', ['Week Of']) +
      `<div class="note">Shade the hours baby sleeps. Use a second color for feeds to spot patterns.</div>` +
      T([['', 1.6], ...['12a', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12p', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].map(h => [h, 1, 'mini']), ['Total', 1.4, 'mini']], 7, { cls: 'dense', cell: (r, i) => i === 0 ? DAY3[r] : null }) +
      R([B('Patterns I Notice', L(4)), B('Bedtime Routine', C([], 4))], 'flex:.45')),
    P('Growth Tracker', H('Growing Every Day', 'Growth Tracker') +
      T([['Age', 1.2], ['Date', 1.2], ['Weight', 1.2], ['Length', 1.2], ['Head', 1.2], ['Notes', 2.6]], 11, { cell: (r, i) => i === 0 ? ['Birth', '2 Weeks', '1 Month', '2 Months', '4 Months', '6 Months', '9 Months', '12 Months', '15 Months', '18 Months', '2 Years'][r] : null })),
    P('Doctor Visits & Vaccines', H('Health Records', 'Doctor Visits & Vaccines') +
      B('Appointments', T([['Date', 1], ['Doctor', 1.5], ['Reason', 2], ['Weight', 1], ['Notes', 2.6]], 10)) +
      B('Vaccines', T([['Date', 1], ['Vaccine', 2.5], ['Dose', .9], ['Reaction / Notes', 3.6]], 10))),
    P('Baby’s Firsts', H('Memories', 'Baby’s Firsts') +
      G(['First Smile', 'First Laugh', 'Rolled Over', 'Sat Up', 'First Food', 'First Tooth', 'Crawled', 'First Word', 'First Steps', 'First Birthday'].map(t => B(t, LB(['Date']) + L(2))), 2)),
    P('Baby Info & Contacts', H('Keep It Handy', 'Baby Info & Contacts') +
      R([B('About Baby', LB(['Full Name', 'Date of Birth', 'Time of Birth', 'Birth Weight', 'Birth Length', 'Blood Type', 'Allergies'])), B('Doctors', LB(['Pediatrician', 'Phone', 'After-Hours Line', 'Hospital', 'Insurance #', 'Pharmacy', 'Pharmacy Phone']))]) +
      B('Emergency Contacts', T([['Name', 2], ['Relationship', 1.6], ['Phone', 1.8], ['Notes', 2]], 6)))
  ],
  listing: {
    title: 'Newborn Baby Tracker Printable, Baby Feeding Log, Sleep Log, Diaper Tracker, Baby Daily Log, Growth Chart, New Mom Gift PDF',
    price: '4.25',
    tags: ['baby tracker', 'newborn tracker', 'feeding log', 'baby sleep log', 'diaper tracker', 'baby daily log', 'breastfeeding log', 'new mom gift', 'baby printable', 'nanny log', 'baby schedule', 'baby growth chart', 'newborn printable'],
    what: 'Keep track of feeds, diapers and sleep in those foggy newborn days, plus growth, doctor visits, vaccines, milestones and all the important info in one place.',
    gift: true
  }
}

// ---------------------------------------------------------------- 9. Medication tracker
const meds = {
  slug: '09-medication-tracker',
  name: 'Medication Tracker',
  accent: '#40806f', tint: '#e5f1ed', head: 'Playfair Display', headw: 600,
  hero: [1, 0, 2],
  pages: () => [
    P('Medication List', H('Health Records', 'Medication List', ['Name']) +
      R([B('Allergies', L(2)), B('Conditions', L(2))], 'flex:.2') +
      T([['Medication', 2.2], ['Dose', 1], ['How Often', 1.3], ['Purpose', 1.8], ['Prescribed By', 1.6], ['Start', 1], ['Stop', 1]], 18)),
    P('Monthly Medication Tracker', H('Never Miss A Dose', 'Monthly Medication Tracker', ['Month', 'Year']) +
      T([['Medication', 3.4], ['Time', 1.6, 'mini'], ...range(31).map(d => [d, 1, 'mini'])], 18, { cls: 'dense' })),
    P('Weekly Medication Schedule', H('Day By Day', 'Weekly Medication Schedule', ['Week Of']) +
      T([['', 1.5], ...DAY3.map(d => [d, 1.5])], 4, { cell: (r, i) => i === 0 ? ['Morning', 'Midday', 'Evening', 'Bedtime'][r] : null }) +
      R([B('Refills Due', T([['Medication', 2], ['Date', 1], ['Ordered', .8, 'check']], 4)), B('Notes', L(5))], 'flex:.45')),
    P('Symptom Tracker', H('Spot The Pattern', 'Symptom Tracker') +
      T([['Date', 1], ['Time', .9], ['Symptom', 2.4], ['Severity 1–10', 1.3], ['Possible Trigger', 2], ['What Helped', 2]], 24)),
    P('Appointment Log', H('Doctor Visits', 'Appointment Log') +
      T([['Date', 1], ['Doctor / Clinic', 2.2], ['Reason', 2], ['Results / Notes', 3], ['Follow-Up', 1.3]], 16) +
      R([B('Questions For My Next Visit', C([], 5))], 'flex:.35')),
    P('Medical Info & Contacts', H('In Case Of Emergency', 'Medical Info & Contacts') +
      R([B('Personal', LB(['Full Name', 'Date of Birth', 'Blood Type', 'Insurance', 'Policy #', 'Primary Doctor', 'Pharmacy'])), B('Conditions & Surgeries', L(7))]) +
      B('Emergency Contacts', T([['Name', 2], ['Relationship', 1.6], ['Phone', 1.8], ['Notes', 2]], 5)) +
      B('Doctors & Specialists', T([['Name', 2], ['Specialty', 1.6], ['Phone', 1.8], ['Address', 2]], 5)))
  ],
  listing: {
    title: 'Medication Tracker Printable, Monthly Medication Log, Pill Tracker, Symptom Tracker, Medical Records Binder, Caregiver Health Planner PDF',
    price: '3.75',
    tags: ['medication tracker', 'medication log', 'pill tracker', 'symptom tracker', 'health planner', 'medical binder', 'caregiver planner', 'medication list', 'health tracker', 'chronic illness', 'medical printable', 'elderly care', 'medicine chart'],
    what: 'Stay on top of medications and health records for yourself or someone you care for: medication list, monthly and weekly dose trackers, symptom tracker, appointment log and emergency info.'
  }
}

// ---------------------------------------------------------------- 10. Password log
const entry = () => B('Account', LB(['Website', 'Username', 'Email', 'Password', 'Password', 'Notes']))
const passwords = {
  slug: '10-password-log',
  name: 'Password Log',
  accent: '#55595f', tint: '#eceef0', head: 'Playfair Display', headw: 600,
  hero: [2, 3, 1],
  pages: () => [
    coverPage('Private & Confidential', 'Password Log', 'Logins · Wi-Fi · Devices'),
    P('Wi-Fi, Devices & Email', H('Keep It Safe', 'Wi-Fi, Devices & Email') +
      B('Wi-Fi Networks', T([['Network', 2], ['Password', 2.4], ['Location', 1.6]], 5)) +
      B('Devices', T([['Device', 2], ['PIN / Passcode', 2], ['Notes', 2]], 6)) +
      B('Email Accounts', T([['Email', 2.4], ['Password', 2], ['Recovery Phone / Email', 2]], 6))),
    ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(l => P('Letter ' + l, `<header><div><div class="kicker">Password Log</div><h1>Websites &amp; Logins</h1></div><div class="big">${l}</div></header>` + G(range(4).map(entry), 2)))
  ],
  listing: {
    title: 'Password Log Printable, Password Keeper, A-Z Password Book, Internet Password Organizer, Login Tracker, Wifi Password Sheet PDF',
    price: '3.25',
    tags: ['password log', 'password keeper', 'password book', 'password tracker', 'password organizer', 'internet password', 'login tracker', 'password printable', 'home binder', 'wifi password', 'household binder', 'office printable', 'gift for parents'],
    what: 'Keep every login in one tidy place: A–Z tabbed pages with space for 104 websites, plus Wi-Fi, device passcode and email account pages.',
    gift: true
  }
}

module.exports = [christmas, calendar, budget, habits, meals, chores, cleaning, baby, meds, passwords]
