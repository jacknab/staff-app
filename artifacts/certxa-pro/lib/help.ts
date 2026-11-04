/**
 * In-app help (owner, 2026-11-04): one help page per screen, opened by holding the screen's title (components/HelpTitle).
 * Each page explains only the screen it belongs to. Settings has one per section ('settings.<section>').
 */
export type HelpExample = { q: string; a: string };
export type HelpPage = { title: string; intro: string; sections: { heading: string; points: string[] }[]; examples?: HelpExample[] };

export const HELP: Record<string, HelpPage> = {
  home: {
    title: 'Home',
    intro: 'Your day at a glance, in your business’s time zone.',
    sections: [
      { heading: 'What you see', points: [
        'Taken today: what you’ve been paid today, the number of paid visits and how many appointments are still to go.',
        'Needs your attention: booking requests waiting for your answer, and texts from clients you haven’t read yet. Tap one to open it; it leaves the list once you’ve answered or read it.',
        'Next up: your next appointment that hasn’t been paid. Tap it to open the booking.',
        'Today’s appointments: everything booked today, with its status (Booked, In progress, Paid, No-show).',
      ] },
      { heading: 'Tips', points: ['Pull down to refresh.', 'Tap Calendar to see other days.'] },
    ],
  },
  calendar: {
    title: 'Calendar',
    intro: 'Your bookings, day by day, on a 24-hour calendar.',
    sections: [
      { heading: 'Moving around', points: ['Switch between Day, Week and Month.', 'Tap a day in the strip at the top to see it; the strip starts with today.', 'The arrows move to the next or previous day, week or month.', 'In Month, tap a day to open it.'] },
      { heading: 'Bookings', points: [
        'Tap a booking to open it: edit it, check out, mark it paid, cancel it or mark a no-show.',
        'Press and hold a booking, then drag it to a new time. You’ll be asked to confirm, and you can choose to text the client the new time.',
        'Tap + to book an appointment or block time off.',
        'Blocked time shows on the calendar; tap it to remove it. Clients can’t book online inside it.',
      ] },
      { heading: 'Booking requests', points: ['If you review online bookings before accepting them, a banner shows how many requests are waiting. Tap it to answer them.'] },
    ],
  },
  clients: {
    title: 'Clients',
    intro: 'Everyone who has booked with you or that you’ve added.',
    sections: [
      { heading: 'Finding a client', points: ['Search by name, phone number or e-mail.', 'Use the filters to see New, Regular, VIP, At risk or Inactive clients, or those with an upcoming booking.'] },
      { heading: 'What the statuses mean', points: [
        'New: visited recently, fewer than 3 visits.',
        'Regular: visited recently, 3 visits or more.',
        'VIP: you marked them VIP on their profile.',
        'At risk: has visited, but not back in 60 days or more.',
        'Inactive: never visited (paid), or not back in 120 days or more.',
      ] },
      { heading: 'Adding clients', points: ['Tap + to add a client from just a name, a phone number or an e-mail.', 'Import contacts (from More) adds people from your phone’s contacts.'] },
    ],
  },
  client: {
    title: 'Client profile',
    intro: 'Everything about one client.',
    sections: [
      { heading: 'At the top', points: ['Text, Call and Email buttons. Call uses your business number when you have Business Phone or Plus, so your own number stays private.', 'Book appointment books this client straight away.'] },
      { heading: 'Their numbers', points: ['Visits, lifetime spend, average visit, the last 12 months, last and next visit, no-shows and loyalty points.', 'How often they usually come, and when they’re expected back.'] },
      { heading: 'Also here', points: ['Upcoming and past visits; tap one to open it.', 'Notes (pinned notes first), before and after photos, tags, and their details.', 'The pencil at the top edits their name, phone and e-mail.', 'Switches for whether they get marketing texts and e-mails.'] },
    ],
  },
  appointment: {
    title: 'Booking details',
    intro: 'One booking and everything you can do with it.',
    sections: [
      { heading: 'Before the visit', points: ['Edit to change the services, add-ons, date or time.', 'Cancel it; you can text the client, and a late-cancel fee applies if your policy and their saved card allow it.', 'Text or call the client from here.'] },
      { heading: 'Getting paid', points: ['Checkout takes a card payment with Tap to Pay or the M2 reader, with a tip.', 'Mark as paid records a payment you took another way (cash, for example). The client gets a review request.', 'Send a payment link to let the client pay from their phone.'] },
      { heading: 'After', points: ['Rebook books their next visit.', 'Refund all or part of a card payment.', 'No-show marks a missed visit; a no-show fee applies if your policy allows it.', 'Notes and before/after photos are kept on the client’s profile.'] },
    ],
  },
  booking: {
    title: 'Book an appointment',
    intro: 'Booking a client yourself, step by step.',
    sections: [
      { heading: 'Steps', points: ['Who: pick a client, or add a new one.', 'What: choose the service, then any add-ons.', 'Where and when: at your place or a house call (if you offer them), then the day and an open time.'] },
      { heading: 'Good to know', points: ['Only times you’re open and free are offered; blocked time is left out.', 'You can book a client even if they’re blocked from booking online.'] },
    ],
  },
  'block-time': {
    title: 'Block time',
    intro: 'Time off on your calendar: a break, an errand, or a day off.',
    sections: [{ heading: 'How it works', points: ['Choose the day and the start and end time, or the whole day.', 'Clients can’t book online inside blocked time.', 'To remove a block, tap it on the calendar.'] }],
  },
  checkout: {
    title: 'Checkout',
    intro: 'Taking a card payment for a visit.',
    sections: [
      { heading: 'Paying', points: ['Check the amount, then the client chooses a tip.', 'Pay with Tap to Pay on this iPhone (the client taps their card or phone), or with the M2 card reader.', 'The client can get a receipt by text or e-mail.'] },
      { heading: 'Before your first payment', points: ['Card payments need your Stripe account set up (More › Payments).', 'Tap to Pay asks you to accept Apple’s terms the first time.'] },
    ],
  },
  pos: {
    title: 'POS',
    intro: 'Take a card payment that isn’t a booking, like a product or a gift.',
    sections: [{ heading: 'How it works', points: ['Choose who the sale is for: an existing client or a new one from a name, phone or e-mail.', 'Key in the amount and an optional description.', 'It continues to the usual checkout: tip, Tap to Pay or M2, receipt.', 'Quick sales stay off your calendar but count in your takings and reports.'] }],
  },
  more: {
    title: 'More',
    intro: 'Everything else in the app.',
    sections: [
      { heading: 'Cards at the top', points: ['Tap to Pay: set up card payments.', 'Business Phone: a business number for calls and texts ($10/month).', 'Plus: unlimited notification texts and calling your clients on Certxa’s Plus number ($5/month).', 'A card disappears once you have that plan, and comes back if it ends.'] },
      { heading: 'Manage', points: ['Money, Booking requests, Reviews, Credit balance, Messages, Gift cards, Waitlist, Campaigns, Portfolio, Business Phone, Import contacts, Business AI and Settings.'] },
    ],
  },
  ai: {
    title: 'Business AI',
    intro: 'Your own assistant. Ask in your own words; it answers from your real numbers and says where each number comes from.',
    sections: [
      { heading: 'What it can look up', points: [
        'Earnings and reports for any dates: sales, payments, tips, sales tax collected, no-shows, busy times, top clients, clients who haven’t been back, client retention, loyalty, services, reviews and texts sent.',
        'Your schedule for any day or week.',
        'Any client and their history: visits, spend, last service.',
        'Booking requests waiting for you, your services and prices, text credits and Plus, card payments, your booking link, business hours, sales tax, tip choices and deposits.',
      ] },
      { heading: 'What it can change (only when you tap Confirm)', points: ['Your business hours.', 'Sales tax.', 'Tip choices at checkout.', 'Booking approval: accept online bookings automatically, or review each one.', 'You see exactly what will change first; nothing changes until you tap Confirm, and you can tap Cancel.'] },
      { heading: 'Texting clients', points: ['It drafts a text to a client (a thank you, a reminder, an invitation back). Tap the draft to open it in your phone’s Messages and send it yourself; no credits are used.', 'Clients it mentions get a button that opens their profile.'] },
      { heading: 'What it won’t do', points: ['Make, move or cancel bookings, take payments, refund or change prices. It tells you where in the app to do it instead.'] },
    ],
    examples: [
      { q: 'How much did I make this week?', a: 'You’ve made $110 in net sales this week so far, from your Sales report for November 2–3. You’ve collected $125 including $15 in tax.' },
      { q: 'Who haven’t I seen in a while?', a: 'No clients are showing as not back in 60 days or more, from your Clients not back report for January 1 through November 3.' },
      { q: 'Draft a text to Linda Parker inviting her back for a fill next week', a: 'Drafted a text to Linda Parker inviting her back for a fill next week, with your booking link. It’s ready to open in Messages and send from your phone.' },
      { q: 'Close me on Saturdays from now on', a: 'I’ve proposed closing on Saturdays. Your current Saturday hours are 9:00 AM–6:00 PM, from your business settings. Tap Confirm to apply the change.' },
      { q: 'Move Linda’s 2pm today to 4pm', a: 'I can’t move bookings here. You can do that in Calendar: tap Linda Parker’s appointment, choose Schedule, and change the time to 4:00 PM.' },
      { q: 'How do I ask clients for a deposit?', a: 'Go to More → Settings → Payments → Deposits.' },
      { q: 'What’s on my schedule tomorrow?', a: 'Your appointments for tomorrow with times, clients and services, from your calendar.' },
      { q: 'Who are my top clients this year?', a: 'Your top clients by spend for the year, each with a button to open their profile.' },
      { q: 'Do I have any booking requests waiting?', a: 'The requests waiting for your answer, with the client, service and time asked for.' },
      { q: 'Turn on booking approval so I review new bookings first', a: 'A proposal to review each online booking before it’s accepted. Tap Confirm to apply it.' },
      { q: 'How many text credits do I have left?', a: 'Your credit balance, and whether Plus is on (notification texts are free on Plus).' },
    ],
  },
  messages: {
    title: 'Messages',
    intro: 'Texting with your clients.',
    sections: [{ heading: 'How it works', points: [
      'Your conversations, newest first; unread ones are marked. Tap one to read it and reply.',
      'Replies come from Certxa’s number for your business; on Plus they come from the Plus number your clients can call and text.',
      'A reply uses one text credit, like any text to a client.',
      'Clients who texted STOP don’t get texts from you.',
    ] }],
  },
  money: {
    title: 'Money',
    intro: 'What you’ve taken and where it is.',
    sections: [{ heading: 'What you see', points: ['Sales today, this week and this month.', 'Money on its way to your bank, and the next payout.', 'Recent payouts, and this month’s payments.', 'Payouts run on Stripe’s schedule; there’s nothing to start here.'] }],
  },
  requests: {
    title: 'Booking requests',
    intro: 'Online bookings waiting for your answer (when you review each booking before it’s accepted).',
    sections: [{ heading: 'How it works', points: ['Tap a request to answer it: approve it, offer other times, or decline it.', 'Turn reviewing on or off in Settings › Booking approval.'] }],
  },
  request: {
    title: 'Booking request',
    intro: 'One client asking for a time.',
    sections: [{ heading: 'Your choices', points: ['Approve: the time is booked and the client gets the usual confirmation.', 'Offer other times: the client is texted a link showing only the times you chose. It stays open for the days set in Settings › Booking approval.', 'Decline: the client is told.'] }],
  },
  reviews: {
    title: 'Reviews',
    intro: 'What your clients said about you.',
    sections: [{ heading: 'How it works', points: ['Reviews come from the review request clients get after a paid visit.', 'They show on your booking website.', 'You can post a reply to any review; reviews themselves can’t be edited or removed.'] }],
  },
  credits: {
    title: 'Credit balance',
    intro: 'Text message credits: one credit sends one text to a client.',
    sections: [{ heading: 'How it works', points: ['Reminders, confirmations and replies each use a credit. On Plus, notification texts are free.', 'Buy a package with the card you have on file in one tap; without one, a certxa.com page opens to pay.', 'With no credits left, texts to clients aren’t sent.'] }],
  },
  'gift-cards': {
    title: 'Gift cards',
    intro: 'Selling gift cards and taking them as payment.',
    sections: [{ heading: 'How it works', points: ['Sell on my website: clients buy a gift card online and get the code by e-mail. It shows in your website’s menu.', 'Sell: the client pays you as usual, and you hand over the code.', 'Use: look up a code and take an amount off it.', 'The list shows every card and what’s left on it.'] }],
  },
  waitlist: {
    title: 'Waitlist',
    intro: 'Clients who want in on a day that’s full.',
    sections: [{ heading: 'How it works', points: ['Tap + to add a client, the day, roughly when, and the service.', 'When a client cancels online on a day someone is waiting for, you get a notification.', 'Tap someone to book them, text them, or take them off the list.'] }],
  },
  campaigns: {
    title: 'Campaigns',
    intro: 'One text to many clients: a special, an opening, a reminder to book.',
    sections: [{ heading: 'How it works', points: ['Choose who gets it: all clients, or those who haven’t been in for 60 or 90 days.', 'Add their first name and your booking link with the buttons under the message.', 'Only clients who accept marketing texts get it; each text uses one credit.', 'End with “Reply STOP to opt out”: carriers require it. Certxa checks the message before it goes.'] }],
  },
  portfolio: {
    title: 'Portfolio',
    intro: 'Photos of your work in the Portfolio on your booking website.',
    sections: [{ heading: 'How it works', points: ['Tap + to take a photo or choose one from your library.', 'Tap a photo to choose the service it shows; clients can then tap Book this look on your website.', 'Tap a photo to take it off your website.', 'Before and after photos on a client’s profile can be added here too.'] }],
  },
  packages: {
    title: 'Packages',
    intro: 'Prepaid visits clients buy on your website, like 6 Gel Manicures for $150.',
    sections: [{ heading: 'How it works', points: ['Tap + to make one: a service, how many visits, and the price.', 'The switch puts a package on sale or takes it off. Packages show in your website’s menu.', 'A client buys online and the visits are saved on their client record, matched by phone number.', 'When they come in, open the booking and tap Use a package visit.', 'Clients who bought are listed here with their visits left. Card payments must be set up.'] }],
  },
  'import-contacts': {
    title: 'Import contacts',
    intro: 'Adding clients from your phone’s contacts.',
    sections: [{ heading: 'How it works', points: ['Tick the people who are your clients, then tap Add.', 'Contacts already in Clients (same number) aren’t shown.', 'Only the people you choose leave your phone.'] }],
  },
  notes: {
    title: 'Notes',
    intro: 'Notes about this client.',
    sections: [{ heading: 'How it works', points: ['Write a note and tap Save; it’s tied to this visit.', 'Every note on the client is below, newest first. They’re on the client’s profile too.'] }],
  },
  phone: {
    title: 'Business Phone',
    intro: 'A phone number for your business, so your own number stays private ($10/month).',
    sections: [
      { heading: 'Calls', points: ['Calls to your business number ring this iPhone like a normal call; when a client calls, you see their name.', 'Call a number uses the keypad; calls out always show your business number.', 'A call you don’t answer is a missed call: tap it in Recent calls to call back.', 'When it rings (business hours or any time) and blocked numbers are in Settings › Business Phone.'] },
      { heading: 'Texts', points: ['Texts to your business number are under Texts.'] },
      { heading: 'Your plan', points: ['Change your number, cancel, or pay after a failed payment in Settings › Business Phone.'] },
    ],
  },
  'phone-texts': {
    title: 'Texts',
    intro: 'Texts sent to your business number, newest first.',
    sections: [{ heading: 'Good to know', points: ['Replying from your business number is coming later.', 'A photo shows as “Sent a photo”.'] }],
  },
  services: {
    title: 'Services',
    intro: 'What you offer, how long it takes and the price.',
    sections: [{ heading: 'How it works', points: ['Tap + to add a service, or tap one to edit it.', 'The length decides which times are offered for it.', 'Services show on your booking website and when you book.'] }],
  },
  catalog: {
    title: 'Catalog',
    intro: 'Everything you sell, in one place. What you set here is what clients see and book.',
    sections: [{ heading: 'What’s in it', points: [
      'Categories group your services.',
      'Services are your menu, with their prices and how long they take.',
      'Add-Ons are extras clients add to a service.',
      'Packages sell services and add-ons together.',
      'Deals sell a package as a voucher at a lower price.',
      'Products are the retail items you sell.',
    ] }],
  },
  'catalog.categories': {
    title: 'Categories',
    intro: 'Groups for your services, like Manicures or Pedicures. Clients filter by them on your website.',
    sections: [{ heading: 'How it works', points: ['Tap + to add one, or tap one to change it.', 'Each has a name, a calendar colour and an optional photo.', 'Turn off Show on my booking site to hide a category and its services from clients.'] }],
  },
  'catalog.addons': {
    title: 'Add-Ons',
    intro: 'Extras that go with a service, like French Tips with a manicure.',
    sections: [{ heading: 'How it works', points: ['Tap + to add one, or tap one to change it.', 'Link it to the services it goes with. When a client picks one of those on your website, it’s offered to them.', 'Its price and time are added to the visit.', 'Turn off Show on my booking site to keep it for your own use only.'] }],
  },
  'catalog.packages': {
    title: 'Packages',
    intro: 'Services and add-ons sold together as one item.',
    sections: [{ heading: 'How it works', points: ['Tap + to add one, then choose its services and add-ons.', 'The price is what they come to together, or turn on Set my own package price.', 'Turn off Show on my booking site to hide it from clients.', 'Packages here are different from prepaid visits (More › Packages), which clients pay for up front.'] }],
  },
  'catalog.deals': {
    title: 'Deals',
    intro: 'Vouchers for one of your packages at a lower price, on sale for a set time.',
    sections: [{ heading: 'How it works', points: ['Make a package first, then tap + and choose it.', 'Set the deal price, how many vouchers are available and the dates it’s on sale.', 'Pause a deal to stop selling it for a while.'] }],
  },
  'catalog.products': {
    title: 'Products',
    intro: 'The retail items you sell, like polish or aftercare.',
    sections: [{ heading: 'How it works', points: ['Tap + to add one, or tap one to change it.', 'Each has a name, brand, price and how many you have in stock.'] }],
  },
  'payments-intro': {
    title: 'Set up payments',
    intro: 'Taking cards goes through your own Stripe account, so the money goes straight to you.',
    sections: [{ heading: 'How it works', points: ['Tap Set up payments and answer Stripe’s questions about you and your business.', 'Your business address needs to be complete first; you’ll be asked for it if it isn’t.', 'After that you can take cards in the app and deposits on your website.'] }],
  },
  'about-me': {
    title: 'About you',
    intro: 'The text and photo on the About tab of your website, so clients get to know you before they book.',
    sections: [{ heading: 'How it works', points: ['Tap Write it with AI: Business AI asks a few questions, writes it from your answers, and it goes on your website only when you tap Confirm.', 'Or type it yourself and tap Save.', 'Tap the circle to add your photo. It’s saved straight away.'] }],
  },
  'website-setup': {
    title: 'Your booking website',
    intro: 'Your own page where clients book you, at your-name.certxa.com.',
    sections: [{ heading: 'Three steps', points: ['Your link: the address clients use.', 'A design for the page.', 'Your look: colour, cover photo, profile photo or logo, about text, Instagram and Facebook.', 'Every step can be skipped and changed later in Settings › Website.'] }],
  },
  'get-paid': {
    title: 'Get paid',
    intro: 'Setting up card payments: Tap to Pay on iPhone and the M2 card reader.',
    sections: [{ heading: 'How it works', points: ['Stripe’s own secure form asks for your details and bank account.', 'Once it’s done, you can take cards at checkout and payouts go to your bank.', 'If Stripe needs more details, you’re told here.'] }],
  },
  'tap-to-pay': {
    title: 'Tap to Pay on iPhone',
    intro: 'Getting this iPhone ready to take cards.',
    sections: [{ heading: 'How it works', points: ['The first time, Apple asks you to accept its Tap to Pay terms.', 'After that, checkout connects without asking.'] }],
  },
  notifications: {
    title: 'Client notifications',
    intro: 'The texts and e-mails your clients get automatically.',
    sections: [{ heading: 'What you can set', points: ['Appointment reminders, booking confirmations and review requests: by text, e-mail or both, each with its own wording.', 'Replies to clients who cancel by text.', 'Check which client numbers can receive texts (a landline can’t).'] }],
  },
  settings: {
    title: 'Settings',
    intro: 'How your business is set up. Everything here is saved to Certxa, so it’s the same on the website.',
    sections: [{ heading: 'Sections', points: ['Business: details, location, where you see clients, business hours and catalog.', 'Online booking: rules, approval, cancellation policy, blocked clients.', 'Website, client notifications, Business Phone.', 'Payments: Stripe account, card reader, deposits, sales tax. And your account.'] }],
  },
  'settings.business': { title: 'Business details', intro: 'Your business name, type, phone and e-mail.', sections: [{ heading: 'Good to know', points: ['These show on your booking website and in texts to clients.'] }] },
  'settings.location': { title: 'Location', intro: 'Your business address.', sections: [{ heading: 'Good to know', points: ['It sets your time zone, and shows on your booking website.'] }] },
  'settings.places': { title: 'Where you see clients', intro: 'Your own place (a salon, suite or private home studio), house calls, or both.', sections: [{ heading: 'Good to know', points: ['With house calls, clients give their address when they book, and you can add a travel fee.'] }] },
  'settings.hours': { title: 'Business hours', intro: 'The days and times you’re open, and your time zone.', sections: [{ heading: 'How it works', points: ['Tick a day to open or close it; tap the day to set the start and end time.', 'Online booking only offers times inside these hours.', 'Business Phone and Plus calls ring during these hours unless you choose Any time.'] }] },
  'settings.rules': { title: 'Booking rules', intro: 'How clients book you online.', sections: [{ heading: 'What you can set', points: ['Who can book online, how far ahead, and how much notice you need.', 'The start times offered (every 15 minutes, for example) and a gap between bookings.', 'Whether clients can cancel online, and up to how long before.'] }] },
  'settings.approval': { title: 'Booking approval', intro: 'Accept online bookings automatically, or review each one first.', sections: [{ heading: 'When you review them', points: ['Each booking arrives as a request: approve it, offer other times, or decline it.', 'You choose how long a request waits, and how long offered times stay open.'] }] },
  'settings.policy': { title: 'Cancellation policy', intro: 'What clients agree to when they book.', sections: [{ heading: 'What you can set', points: ['Your policy text, and whether clients must accept it to book.', 'A late-cancel or no-show fee, charged to the card the client saved when booking.'] }] },
  'settings.blocked': { title: 'Blocked clients', intro: 'Phone numbers that can’t book online.', sections: [{ heading: 'Good to know', points: ['You can still book them yourself.', 'Blocking someone from calling is separate: Settings › Business Phone.'] }] },
  'settings.phone': { title: 'Business Phone settings', intro: 'Your number, your calling rules and blocked callers.', sections: [{ heading: 'What you can do', points: ['Ring my phone: during business hours, or any time. Outside it, callers hear a message and you get a missed call.', 'Block a client or number: they hear a busy signal and you aren’t told.', 'Your plan: cancel (your number works to the end of the paid month, then it’s released), or pay after a failed payment.', 'Change number ($5): your old number is released and can’t be had back.', 'On Plus, your clients call and text you on Certxa’s Plus number.'] }] },
  'settings.website': { title: 'Website', intro: 'Your booking website: link, design and look.', sections: [{ heading: 'Good to know', points: ['Share the link anywhere: Instagram, your card, texts.'] }] },
  'settings.stripe': { title: 'Stripe account', intro: 'Where your card payments are paid out.', sections: [{ heading: 'Good to know', points: ['Payouts go to the bank account on your Stripe account, on Stripe’s schedule.'] }] },
  'settings.readers': { title: 'Connect card reader', intro: 'Adding a Stripe M2 card reader.', sections: [{ heading: 'How it works', points: ['Enter the code from the reader to register it; checkout then offers it.'] }] },
  'settings.deposits': { title: 'Deposits', intro: 'Asking clients to pay part up front when they book online.', sections: [{ heading: 'Good to know', points: ['A fixed amount or a percentage.', 'Needs card payments set up.'] }] },
  'settings.tax': { title: 'Sales tax', intro: 'The tax added at checkout.', sections: [{ heading: 'What you can set', points: ['The rate, and whether services and products are taxed.'] }] },
  'settings.account': { title: 'Account', intro: 'Your sign-in and account.', sections: [{ heading: 'What you can do', points: ['Your mobile number, a new password, and deleting your account.'] }] },
};
