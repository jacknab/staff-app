/**
 * In-app help (owner, 2026-11-04): one help page per screen, opened by holding the screen's title (components/HelpTitle).
 * Each page explains only the screen it belongs to: every part of it, what it's for and what it does (reviewed against
 * each screen 2026-11-10). Settings has one per section ('settings.<section>'). When a screen changes, change its page.
 */
export type HelpExample = { q: string; a: string };
export type HelpPage = { title: string; intro: string; sections: { heading: string; points: string[] }[]; examples?: HelpExample[] };

export const HELP: Record<string, HelpPage> = {
  // ── Signing in ────────────────────────────────────────────────────────────────────────────────────────────────────
  login: {
    title: 'Sign in',
    intro: 'Signing in to your Certxa Pro account.',
    sections: [
      { heading: 'On this page', points: [
        'Email and Password: the ones you chose when you made your account.',
        'Sign in: opens your account. You stay signed in on this phone until you sign out (Settings › Account).',
        'Forgot password?: type your email above first, then tap it. If that email has an account, you get a link to choose a new password.',
        'Create an account: starts sign-up for a new business.',
      ] },
    ],
  },
  signup: {
    title: 'Create your account',
    intro: 'Setting up your business in a few steps. Everything can be changed later in Settings.',
    sections: [
      { heading: 'The steps', points: [
        'Tell us about your business: your first and last name, your business name and the type of business.',
        'Where do you offer your services?: turn on Business location (your own place) and/or House call. With a business location, enter its address; tick "This is my home studio" to keep it private, so clients see only your city until they book.',
        'What are your business hours?: the days and times clients can book you online.',
        'A few details for card payments: your date of birth, your home address (a home studio’s address is used as it is; otherwise tick Same as my business address or type it), and how your business is set up (Just me for a sole proprietor, or your LLC or corporation with its legal name and EIN). Stripe, who processes card payments, needs these; Certxa passes them on when you set up payments, so Stripe’s form doesn’t ask again. Tap Why we ask under any of them for the reason. Clients never see them.',
        'Create your login: the email and password you’ll sign in with (8 characters or more).',
        'What’s your mobile number?: a mobile number (not a landline) gets a text with a code. Enter the code to finish. One number can be used for one account.',
      ] },
      { heading: 'Buttons', points: ['Next moves to the next step; Back goes to the one before.', 'Send a new code texts another code; Use a different number lets you change the number.', 'I already have an account goes to Sign in.'] },
    ],
  },

  // ── Tabs ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  home: {
    title: 'Home',
    intro: 'Your day at a glance, in your business’s time zone.',
    sections: [
      { heading: 'At the top', points: [
        'The greeting changes with the time of day.',
        'The envelope opens your Inbox (messages clients send from your website). A number on it shows how many are new.',
      ] },
      { heading: 'Taken today', points: ['What you’ve been paid today, how many visits are paid, and how many appointments are still to go.'] },
      { heading: 'Needs your attention', points: [
        'Booking requests waiting for your answer: tap one to approve it, offer other times or decline it.',
        'Texts from clients you haven’t read: tap one to open the conversation. All messages opens every conversation.',
        'Each item leaves the list once you’ve answered or read it.',
      ] },
      { heading: 'Next up and today', points: [
        'Next up: your next appointment that isn’t paid yet. Tap it to open the booking.',
        'Today’s appointments: everything booked today with its status: Booked, In progress, Paid, No-show or Cancelled. Tap one to open it.',
        'Calendar opens the calendar to see other days.',
      ] },
      { heading: 'Tip', points: ['Pull down to refresh.'] },
    ],
  },
  calendar: {
    title: 'Calendar',
    intro: 'Your bookings and blocked time, on a 24-hour calendar.',
    sections: [
      { heading: 'Moving around', points: [
        'Day, Week and Month switch the view.',
        'The arrows go to the previous or next day, week or month. Today jumps back to today.',
        'Day: tap a day in the strip at the top to see it. Week: each day lists its first bookings, or Open schedule when nothing is booked. Month: tap a day to open it.',
        'The refresh button reloads your calendar from Certxa.',
      ] },
      { heading: 'Bookings', points: [
        'Tap a booking to open it: edit it, check out, mark it paid, cancel it or mark a no-show.',
        'A label on a booking shows when it’s PAID, a NO-SHOW or has a DEPOSIT DUE.',
        'To move a booking, press and hold it, then drag it to the new time. You’re shown the new time and choose whether to text the client about it (Notify client), or Cancel to leave it where it was.',
      ] },
      { heading: 'Adding', points: [
        'The + button: New booking books a client; Block time takes time off.',
        'Blocked time shows as Blocked (or Day off for a whole day), with its note. Clients can’t book online inside it. Tap it to remove it.',
      ] },
      { heading: 'Booking requests', points: ['When you review online bookings before accepting them, a banner shows how many requests are waiting. Tap it to answer them.'] },
    ],
  },
  clients: {
    title: 'Clients',
    intro: 'Everyone who has booked with you or that you’ve added.',
    sections: [
      { heading: 'Finding a client', points: [
        'Search by name, phone number or e-mail.',
        'The filters show All, Upcoming (with a booking coming up), New, Regular, At risk, Inactive or VIP clients.',
        'Each client shows their next visit, or their last visit and service. Tap one to open their profile.',
      ] },
      { heading: 'What the statuses mean', points: [
        'New: visited recently, fewer than 3 visits.',
        'Regular: visited recently, 3 visits or more.',
        'VIP: you marked them VIP on their profile.',
        'At risk: has visited, but not back in 60 days or more.',
        'Inactive: never visited (paid), or not back in 120 days or more.',
      ] },
      { heading: 'Adding clients', points: [
        'Add a client: their first and last name, and a phone number if you have it. Save client adds them.',
        'Import from your phone’s contacts: choose people from your contacts to add as clients.',
      ] },
    ],
  },
  client: {
    title: 'Client profile',
    intro: 'Everything about one client.',
    sections: [
      { heading: 'At the top', points: [
        'Their photo and name. The pencil edits their name, phone, e-mail, the name they go by, birthday and allergies; Delete Client removes them and their history for good.',
        'Text opens a text to them. Call rings them from your business number when you have Business Phone or Plus, so your own number stays private. Email opens an e-mail.',
        'Book appointment books this client straight away.',
        'Send booking link texts them a link to your website with their name, phone and e-mail already filled in (1 text credit).',
        'A note shows when their number is a landline and can’t get texts.',
      ] },
      { heading: 'Their numbers', points: [
        'Visits, lifetime spend, average visit, the last 12 months, last and next visit, and loyalty points.',
        'Prepaid packages they bought, with the visits left.',
      ] },
      { heading: 'Visits', points: ['Upcoming and Past visits, with their status. Tap one to open it. Show all lists every past visit.'] },
      { heading: 'Notes and photos', points: [
        'Notes: the newest notes, pinned ones first. Add or see all opens every note; Pin note keeps one at the top.',
        'Before and after photos: take or choose a photo and mark it Before or After. Only you see them, unless you choose to show one in the Portfolio on your website (only with the client’s OK).',
      ] },
      { heading: 'Details and tags', points: [
        'Details: phone, birthday, allergies and whether a card is on file.',
        'VIP client marks them VIP (the VIP filter on Clients).',
        'Tags: short labels like “Gel” or “Prefers mornings”. Add tag picks one of your tags or makes a new one; tap × to remove one.',
      ] },
      { heading: 'Texts this client gets', points: [
        'Marketing texts: offers, win-back and rebooking reminders. Turn off for clients who don’t want them.',
        'Review requests: the text asking for a review after a visit.',
      ] },
    ],
  },
  appointment: {
    title: 'Booking details',
    intro: 'One booking and everything you can do with it.',
    sections: [
      { heading: 'What you see', points: [
        'The client, with Text, Call and Email buttons.',
        'The services, add-ons, date, time and total, and any deposit: paid, due (a link was texted), kept or refunded.',
        'For a house call: the client’s address (Open in Maps), when to leave, the drive, setup and pack-up time, and the travel fee.',
      ] },
      { heading: 'Before the visit', points: [
        'Edit: change the services, add-ons, date or time.',
        'Text a payment link: the client pays from their phone.',
        'CANCEL: choose Cancel and text the client, Cancel without a text, or Keep the booking. A late-cancel fee can apply under your cancellation policy.',
        'Delete booking removes it completely, as if it was never booked.',
      ] },
      { heading: 'Getting paid', points: [
        'CHECKOUT opens checkout for this visit, with tip and discount.',
        'MARK AS PAID records a payment you took another way (cash, for example). When the client already paid in full online, it says MARK AS DONE.',
        'USE A PACKAGE VISIT pays with one visit from a package the client bought (it shows how many are left).',
        'NO-SHOW marks a missed visit. If your policy has a no-show fee and the client saved a card, you can charge it.',
      ] },
      { heading: 'After', points: [
        'REBOOK books their next visit with the same services.',
        'Refund gives back all of a card payment, or part of it.',
        'Notes opens this client’s notes.',
      ] },
    ],
  },
  booking: {
    title: 'Book an appointment',
    intro: 'Booking a client yourself, step by step.',
    sections: [
      { heading: 'The steps', points: [
        'Client: type a phone number on the keypad to find the client, or add them as a new client with their name. The Name or e-mail tab finds a client by name or e-mail instead.',
        'Services: choose one or more. Search finds one quickly.',
        'Add-ons: optional extras for those services; Skip add-ons goes on without any.',
        'Date and time: if you do house calls, choose At my place or House call (and enter the client’s address). Then pick a day and one of the open times.',
      ] },
      { heading: 'Repeat', points: ['Repeat books the same visit every 1, 2, 3 or 4 weeks; choose how many times. Dates that are already taken are skipped.'] },
      { heading: 'Deposits and cards', points: [
        'If you ask for deposits or a card on file, you choose: slide to Yes to text the client a secure link (the time is held until they finish), or No to confirm without it.',
        'Choosing No never charges anything.',
      ] },
      { heading: 'Good to know', points: [
        'Only times you’re open and free are offered, with room for the whole visit and your padded time. House-call times leave room to drive, set up and pack up.',
        'You can book a client even if they’re blocked from booking online.',
      ] },
    ],
  },
  'block-time': {
    title: 'Block time',
    intro: 'Time off on your calendar: a break, an errand, or a day off.',
    sections: [{ heading: 'On this page', points: [
      'The arrows change the day.',
      'Starts and Ends set the time; All day blocks the whole day.',
      'Note (optional): a word like “Lunch”. It shows on your calendar.',
      'Clients can’t book online inside blocked time. To remove a block, tap it on the calendar.',
    ] }],
  },
  checkout: {
    title: 'Checkout',
    intro: 'Taking payment for a visit or a quick sale.',
    sections: [
      { heading: 'The amount', points: [
        'The amount due comes from the booking; for a quick sale you key it in.',
        'Discount: 10%, 15%, 20% or 25% off, or a custom amount off. Tax is worked out after the discount, never on the tip.',
        'A deposit the client already paid comes off; sales tax is added if you charge it (Settings › Checkout).',
        'The client chooses a tip, or enters their own, or no tip.',
      ] },
      { heading: 'How the client pays', points: [
        'Card: tap Stripe M2 to take the card on the M2 card reader. Tap to Pay on iPhone switches on here once Apple has approved it.',
        'Gift card: records a gift-card payment; add the card’s code for the receipt.',
        'When it’s done, send a receipt by text or e-mail. New sale starts the next one.',
      ] },
      { heading: 'Card reader', points: ['New Stripe M2 setup (one time): enter the code shown on the reader and tap Register. After that, checkout finds it on its own.'] },
      { heading: 'If something goes wrong', points: ['If a card payment is approved but not finished, tap Retry capture before leaving, so the payment is completed.', 'Recent payments lists the last payments taken here.'] },
    ],
  },
  pos: {
    title: 'POS',
    intro: 'Take a payment that isn’t a booking, like a product or a gift.',
    sections: [{ heading: 'How it works', points: [
      'Key in the amount, then tap Next.',
      'What is this for?: an optional description for the receipt and your reports.',
      'Who is this sale for?: search for a client, or add a new one with a name, phone number or e-mail. Choose a different client changes it.',
      'Begin transaction goes to checkout: tip, card reader, receipt.',
      'Quick sales stay off your calendar but count in your takings and Money.',
    ] }],
  },
  more: {
    title: 'More',
    intro: 'Everything else in the app.',
    sections: [
      { heading: 'Cards at the top', points: [
        'Accept Payments: set up card payments, paid to your bank.',
        'Business Phone: your own business number for calls and texts ($10/month).',
        'Plus Plan: unlimited notification texts and calling your clients on Certxa’s Plus number ($5/month).',
        'The cards share one spot and change every 15 seconds; swipe to see the next one. A card disappears once you have that plan, and comes back if it ends.',
      ] },
      { heading: 'Menu', points: [
        'Business: Money (sales, payouts and payments) and Business Phone.',
        'Client Growth: Waitlist, Campaigns, Reviews and Portfolio.',
        'Account: Business AI, Gift Cards & Packages, Credit balance and Settings.',
        'The person button at the top opens About you.',
      ] },
    ],
  },
  ai: {
    title: 'Business AI',
    intro: 'Your own assistant. Ask in your own words; it answers from your real numbers and says where each number comes from.',
    sections: [
      { heading: 'On this page', points: ['Type a question at the bottom and tap send, or tap one of the suggested questions.', 'More shows more suggestions.'] },
      { heading: 'What it can look up', points: [
        'Earnings and reports for any dates: sales, payments, tips, sales tax collected, no-shows, busy times, top clients, clients who haven’t been back, client retention, loyalty, services, reviews and texts sent.',
        'Your schedule for any day or week.',
        'Any client and their history: visits, spend, last service.',
        'Booking requests waiting for you, your services and prices, text credits and Plus, card payments, your booking link, business hours, sales tax, tip choices and deposits.',
      ] },
      { heading: 'What it can change (only when you tap Confirm)', points: ['Your business hours.', 'Sales tax.', 'Tip choices at checkout.', 'Booking approval: accept online bookings automatically, or review each one.', 'Your About text, written from a few questions.', 'You see exactly what will change first; nothing changes until you tap Confirm, and you can tap Cancel.'] },
      { heading: 'Texting clients', points: ['It drafts a text to a client (a thank you, a reminder, an invitation back). Tap Open in Messages to send it yourself from your phone; no credits are used.', 'Clients it mentions get a Profile button that opens them.'] },
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

  // ── Business ──────────────────────────────────────────────────────────────────────────────────────────────────────
  messages: {
    title: 'Messages',
    intro: 'Texting with your clients.',
    sections: [{ heading: 'How it works', points: [
      'Your conversations, newest first; unread ones are marked. Tap one to read it.',
      'Type in Text message and tap Send to reply. Replies come from Certxa’s number for your business; on Plus they come from the Plus number your clients can call and text.',
      'A reply uses one text credit, like any text to a client.',
      'Clients who texted STOP don’t get texts from you.',
      'Pull down to check for new texts.',
    ] }],
  },
  money: {
    title: 'Money',
    intro: 'What you’ve taken and where it is.',
    sections: [
      { heading: 'Period', points: ['Today, This week, This month or Last month at the top picks the time the page shows.'] },
      { heading: 'What you see', points: [
        'Taken: everything clients paid in that time.',
        'How you were paid: the total for each way clients paid: cash, card, Tap to Pay, card reader (M2), gift card, package visit or split payment.',
        'On its way to your bank: card money Stripe hasn’t paid out yet, and the next payout with its date.',
        'Payouts: money sent to your bank, with its status (Paid, Pending, On the way, Failed, Cancelled).',
        'Payments: each payment in that time.',
      ] },
      { heading: 'Good to know', points: ['Stripe pays card sales to your bank automatically, on its schedule; there’s nothing to start here.', 'Without card payments set up, Set up card payments starts it.'] },
    ],
  },
  sell: {
    title: 'Gift Cards & Packages',
    intro: 'What clients can buy ahead of a visit.',
    sections: [{ heading: 'On this page', points: [
      'Gift cards: sell one, take one as payment and check a balance, in the app or on your website.',
      'Packages: prepaid visits clients buy on your website, like 6 manicures for one price.',
    ] }],
  },
  'website-designer': {
    title: 'Website designer',
    intro: 'Design your booking website with AI, from what Certxa and the web know about your business. Each step shows its price in AI credits; every account starts with 200 free, and a step that fails gives its credits back.',
    sections: [
      { heading: 'Here’s your business as I know it', points: [
        'What Certxa already has: your services and prices, hours, team, reviews and photos.',
        'Worth adding first: what’s missing that would make your site stronger, and where to add it.',
      ] },
      { heading: 'Look me up online', points: [
        'The designer looks you up the way a client would: your Google listing, salons nearby, your old website and other sites.',
        'What I found: cards with what was found (where you are, what guests say, your old site…), each naming its source.',
        'I need you for a moment: where sources disagree (like two phone numbers), pick the right one, type it, or Skip for now. A phone number you pick becomes your business phone. Change opens an answer again.',
      ] },
      { heading: 'Ideas', points: [
        'Show me 6 ideas sketches six different directions for your site.',
        'Mark each Love it or Not this. Say what you love or what isn’t working, and tick what it’s about: Colours, Letters, Layout or Words.',
        'More ideas makes six new ones from what you said.',
      ] },
      { heading: 'Your site', points: [
        'Build my site builds the whole site from the ideas you loved. Your services, prices, booking, hours and reviews always come from your Certxa details.',
        'Preview my site opens it; only you can see the preview.',
        'Put it online makes it your website at your link. Use my old design switches back at any time.',
        'Describe a change: type what you want (“make it pink”, “add a short FAQ about parking”) and the designer makes a new version. A change that isn’t needed costs nothing.',
        'Versions: every version you’ve made. Preview any of them, or Put online to go back to one.',
      ] },
    ],
  },
  inbox: {
    title: 'Inbox',
    intro: 'Messages clients send you from your website.',
    sections: [{ heading: 'How it works', points: [
      'A dot marks a conversation you haven’t read yet. The line at the bottom says when it last checked and how many are unread.',
      'Tap one to read it and reply.',
      'Swipe a conversation left and tap Trash to delete it.',
      'New messages also come to your phone as notifications. Pull down to check for new ones.',
    ] }],
  },
  'inbox.thread': {
    title: 'Message',
    intro: 'One conversation with a client from your website.',
    sections: [{ heading: 'On this page', points: [
      'At the top: who it’s from, their e-mail and phone, and the subject. Tap their name to open their client profile.',
      'Every message in the conversation, oldest first.',
      'Reply opens your answer. Write it and tap Send: it’s e-mailed to the client with a link to write back. Cancel lets you keep editing or delete the draft.',
      'The trash button deletes the conversation for good, for spam or messages you no longer need.',
    ] }],
  },
  requests: {
    title: 'Booking requests',
    intro: 'Online bookings waiting for your answer (when you review each booking before it’s accepted).',
    sections: [{ heading: 'How it works', points: [
      'Each request shows the client, what they asked for and its status: Waiting for you, or Offered (you sent other times; the link is open until the date shown).',
      'Tap a request to answer it: approve it, offer other times, or decline it.',
      'Turn reviewing on or off in Settings › Booking approval.',
    ] }],
  },
  request: {
    title: 'Booking request',
    intro: 'One client asking for a time.',
    sections: [
      { heading: 'What you see', points: ['The client (Text and Call), the service, the time they asked for, any note, and for a house call their address and travel fee.', 'Its status, and the date by which you need to answer.'] },
      { heading: 'Your choices', points: [
        'Approve: the time is booked and the client gets the usual confirmation. If you ask for deposits, they’re texted a link to pay it first.',
        'Offer other times: pick a day and up to a few times that suit you, then send them. The client gets a link to choose one, and it’s booked straight away. The link stays open for the days set in Settings › Booking approval. Change the times offered sends new ones.',
        'Decline: the client is told.',
      ] },
    ],
  },
  reviews: {
    title: 'Reviews',
    intro: 'What your clients said about you.',
    sections: [{ heading: 'How it works', points: [
      'At the top: your average rating and how many reviews have each number of stars.',
      'Each review shows the stars, the comment and any photo the client added. View booking opens the visit it was for.',
      'Reply: write an answer your clients will see on your website and tap Post reply. Edit your reply or Remove reply changes it later.',
      'Reviews come from the review request clients get after a visit (Settings › Client notifications). They can’t be edited or removed.',
    ] }, { heading: 'Google reviews', points: [
      'When your Google Business Profile is connected (Settings › Google), your Google reviews show first, under GOOGLE REVIEWS, with the date and “Posted on Google”.',
      'Reply opens a box; Post on Google publishes your answer on Google for everyone to see, and it shows under the review as YOUR REPLY ON GOOGLE. Edit your reply changes it.',
      'Your earlier Certxa reviews stay below, under CERTXA REVIEWS, and you can still reply to them.',
      'While Google is connected, clients you ask for a review are sent to Google.',
    ] }],
  },
  'google-business': {
    title: 'Google Business Profile',
    intro: 'Connecting your Google Business Profile, or creating one if you don’t have it yet.',
    sections: [
      { heading: 'Not connected yet', points: [
        'The first page shows what a Google Business Profile does for you. Set Up Google Business Profile walks you through creating one on Google; Connect My Existing Profile signs in to Google and connects the profile you already have. The back arrow returns to Settings.',
        'Connect My Existing Profile opens Google’s sign-in on a Certxa page. Sign in with the Google account that manages your profile and allow Certxa access. If the account has more than one business, tap yours. Then you’re back in the app. Closing that page before you finish brings you back to the first page.',
        'If connecting fails, the reason shows with Connect Google Business Profile to try again, or I don’t have one yet for the steps to create a profile.',
      ] },
      { heading: 'Creating a profile', points: [
        'The numbered steps explain what Google asks for: your business name and category, where you work (a home studio can hide its street address; house calls add the areas you travel to), your phone and website, and Google’s check that the business is yours.',
        'Open Google Business Profile opens Google’s page to create it.',
        'I’ve created it — connect now connects it once you’re done; sign in with the same Google account.',
      ] },
      { heading: 'Connected', points: [
        'The card shows the business you connected and when your Google reviews were last updated.',
        'Open Reviews shows your Google reviews, where you can reply; replies are posted on Google.',
        'Update reviews now fetches your latest Google reviews right away (they also update on their own).',
        'Your portfolio photos are shared to your Google Business Profile, a few a day, while Share my portfolio to Google is on in Portfolio. Photos of clients you put on your website are never sent to Google.',
        'Disconnect Google stops showing your Google reviews; your Certxa reviews show again. If Google asks you to sign in again, a button for it appears here.',
      ] },
    ],
  },
  credits: {
    title: 'Credit balance',
    intro: 'Text message credits: one credit sends one text to a client.',
    sections: [{ heading: 'How it works', points: [
      'The big number is how many credits you have left.',
      'Reminders, confirmations, review requests, replies and campaigns each use a credit. On Plus, notification texts are free.',
      'Buy more credits: tap a package. With a card on file it’s bought in one tap after you confirm; the first time, a certxa.com page opens to pay and saves your card.',
      'With no credits left, texts to clients aren’t sent.',
    ] }],
  },
  'gift-cards': {
    title: 'Gift cards',
    intro: 'Selling gift cards and taking them as payment.',
    sections: [{ heading: 'How it works', points: [
      'Sell on my website: turn it on and clients can buy a gift card online and get the code by e-mail. Card payments must be set up.',
      'Sell: take the payment as usual, then enter the amount and who it’s for, and tap Make gift card. Share the code sends it to the client.',
      'Use a card: enter the code and tap Check the code to see what’s left on it, then enter an amount and tap Take it off the card.',
      'The list shows every card and what’s left on it.',
    ] }],
  },
  waitlist: {
    title: 'Waitlist',
    intro: 'Clients who want in on a day that’s full.',
    sections: [{ heading: 'How it works', points: [
      'Add to waitlist: choose the client, the service (optional), the day, roughly when (Any time, Morning, Afternoon or Evening) and a note.',
      'When a booking that day is cancelled, you get a notification, so you can offer the time.',
      'Tap someone to Book now, Text them, or Take off the waitlist.',
    ] }],
  },
  campaigns: {
    title: 'Campaigns',
    intro: 'One text to many clients: a special, an opening, a reminder to book.',
    sections: [
      { heading: 'Making one', points: [
        'New campaign, then choose Who gets it: all your clients, or those who haven’t been in for 60 or 90 days.',
        'Write the message. + Their first name and + Your booking link put those in for each client.',
        'End with “Reply STOP to opt out”: carriers require it.',
        'Send asks you to confirm. Only clients who accept marketing texts get it, and each text uses one credit.',
      ] },
      { heading: 'Your campaigns', points: ['Each shows its status: Draft, Being checked (Certxa checks every message before it goes), Scheduled, Sending, Sent or Not sent, and how many clients it went to.'] },
    ],
  },
  portfolio: {
    title: 'Portfolio',
    intro: 'Photos of your work in the Portfolio on your booking website.',
    sections: [{ heading: 'How it works', points: [
      'Add a photo: Take a photo or Choose from library.',
      'Tap a photo to choose the service it shows (Service shown); clients can then tap Book this look on your website.',
      'Take off my website removes the photo.',
      'Before and after photos from a client’s profile can be shown here too, with the client’s OK.',
      'Share my portfolio to Google shows once your Google Business Profile is connected (Settings › Google Business Profile). On, your photos go to your Google profile on their own, a few a day; off, nothing more is sent. Client photos are never sent to Google.',
    ] }],
  },
  packages: {
    title: 'Packages',
    intro: 'Prepaid visits clients buy on your website, like 6 Gel Manicures for $150.',
    sections: [{ heading: 'How it works', points: [
      'New package: a name, the service, how many visits (2 to 50), the price and a description. Save package adds it.',
      'The switch puts a package on sale on your website or takes it off. Card payments must be set up so clients can buy.',
      'A client buys online and the visits are saved on their client record, matched by phone number.',
      'When they come in, open the booking and tap Use a package visit.',
      'Bought by clients: who bought each package and how many visits they have left.',
    ] }],
  },
  'import-contacts': {
    title: 'Import contacts',
    intro: 'Adding clients from your phone’s contacts.',
    sections: [{ heading: 'How it works', points: [
      'The first time, allow Certxa Pro to see your contacts (Open Settings if you said no).',
      'Search contacts finds someone; tap the people who are your clients, then tap Add.',
      'Contacts already in Clients (same number) aren’t shown.',
      'Only the people you choose leave your phone.',
    ] }],
  },
  notes: {
    title: 'Notes',
    intro: 'Notes about this client.',
    sections: [{ heading: 'How it works', points: ['Write a note and tap Save note; it’s tied to this visit.', 'Every note on the client is below, newest first. They’re on the client’s profile too.'] }],
  },
  phone: {
    title: 'Business Phone',
    intro: 'A phone number for your business, so your own number stays private ($10/month).',
    sections: [
      { heading: 'Getting a number', points: [
        'Enter an area code to see numbers; Show 5 other numbers shows more.',
        'Tap a number and pay to make it yours. It’s charged to your card each month until you cancel.',
      ] },
      { heading: 'Calls', points: [
        'Your business number is at the top. Calls to it ring this iPhone like a normal call, with the client’s name.',
        'Call a number opens the keypad (Delete removes the last digit; hold it to clear). Calls out always show your business number.',
        'Recent calls: Missed, Incoming, Outgoing or No answer. Tap one to call back.',
        'When it rings (business hours or any time) and blocked numbers are in Settings › Business Phone.',
      ] },
      { heading: 'Texts and your plan', points: [
        'Texts opens texts sent to your business number.',
        'Change number gets a new number ($5); your old one is released.',
        'Cancel, or pay after a failed payment, in Settings › Business Phone.',
      ] },
    ],
  },
  'phone-texts': {
    title: 'Texts',
    intro: 'Texts sent to your business number, newest first.',
    sections: [{ heading: 'Good to know', points: ['Each shows who sent it and when. A photo shows as “Sent a photo”.', 'Replying from your business number is coming later.'] }],
  },

  // ── Catalog ───────────────────────────────────────────────────────────────────────────────────────────────────────
  services: {
    title: 'Services',
    intro: 'What you offer, how long it takes and the price.',
    sections: [{ heading: 'How it works', points: [
      'Tap + to add a service, or tap one to edit it.',
      'Name, Minutes and Price: the length decides which times are offered for it.',
      'Category: where it’s listed on your website.',
      'Clients choose how many: for anything priced per item; clients see − 1 + on your website, up to 10.',
      'Add-on groups: give it a group of add-ons, and every add-on in the group is offered with it.',
      'Where you offer it (if you have your own place and do house calls): your place, house calls only, or both.',
      'Remove service takes it off your menu.',
    ] }],
  },
  catalog: {
    title: 'Catalog',
    intro: 'Everything you sell, in one place. What you set here is what clients see and book.',
    sections: [{ heading: 'What’s in it', points: [
      'Categories group your services.',
      'Services are your menu, with their prices and how long they take.',
      'Add-Ons are extras clients add to a service.',
      'Add-on Groups are sets of add-ons that several services share.',
      'Packages sell services and add-ons together.',
      'Products are the retail items you sell.',
    ] }],
  },
  'catalog.categories': {
    title: 'Categories',
    intro: 'Groups for your services, like Manicures or Pedicures. Clients filter by them on your website.',
    sections: [{ heading: 'How it works', points: [
      'Tap + to add one, or tap one to change it.',
      'Each has a name, a calendar colour (bookings in it show in that colour) and an optional photo.',
      'The arrows move a category up or down; your website lists them in this order.',
      'Turn off Show on my booking site to hide a category and its services from clients.',
      'Remove category keeps its services; they show as Uncategorized.',
    ] }],
  },
  'catalog.addons': {
    title: 'Add-Ons',
    intro: 'Extras that go with a service, like French Tips with a manicure.',
    sections: [{ heading: 'How it works', points: [
      'Tap + to add one, or tap one to change it.',
      'Name, description, extra minutes and price: the price and time are added to the visit.',
      'Offered with: tick the services it goes with. When a client picks one of those on your website, it’s offered to them. Add-ons in a group are also offered through that group.',
      'Clients choose how many: for anything priced per item, like nail art per nail.',
      'Turn off Show on my booking site to keep it for your own use only.',
    ] }],
  },
  'catalog.addon-groups': {
    title: 'Add-on Groups',
    intro: 'A set of your add-ons that several services share, like Gel extras for all your gel services.',
    sections: [{ heading: 'How it works', points: [
      'Tap + to make one, give it a name, then tick its add-ons.',
      'Give it to a service from Services: open the service and add the group. Every add-on in it is offered with that service.',
      'Price and time stay on each add-on (Catalog › Add-Ons), so changing an add-on changes it in every group.',
      'Duplicate group makes a separate copy with the same add-ons. It starts with no services, and changing one group never changes the other.',
      'Delete group takes its add-ons off the services that use it; add-ons you linked to a service yourself stay.',
    ] }],
  },
  'catalog.packages': {
    title: 'Packages',
    intro: 'Services and add-ons sold together as one item.',
    sections: [{ heading: 'How it works', points: [
      'Tap + to add one: a name, description and photo, then its services and add-ons.',
      'The price is what they come to together, or turn on Set my own package price.',
      'Turn off Show on my booking site to hide it from clients.',
      'These are different from prepaid visits (More › Gift Cards & Packages), which clients pay for up front.',
    ] }],
  },
  'catalog.deals': {
    title: 'Deals',
    intro: 'Vouchers for one of your packages at a lower price, on sale for a set time.',
    sections: [{ heading: 'How it works', points: ['Make a package first, then tap + and choose it.', 'Set the title, deal price, how many vouchers are available and the dates it’s on sale.', 'Pause deal stops selling it for a while; Archive deal ends it.'] }],
  },
  'catalog.products': {
    title: 'Products',
    intro: 'The retail items you sell, like polish or aftercare.',
    sections: [{ heading: 'How it works', points: ['Tap + to add one, or tap one to change it.', 'Each has a name, brand, price and how many you have in stock.', 'Remove product takes it off your list.'] }],
  },

  // ── Setup ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  'payments-intro': {
    title: 'Set up payments',
    intro: 'Taking cards goes through your own Stripe account, so the money goes straight to you.',
    sections: [{ heading: 'How it works', points: ['Set up payments with Stripe opens Certxa’s payment setup page with Stripe’s secure form: answer its questions about you, your business and your bank. When you finish or close it, you’re back in the app.', 'Your business address needs to be complete first; you’ll be asked for it if it isn’t.', 'When it says You’re all set, you can take cards in the app and deposits on your website.'] }],
  },
  'about-me': {
    title: 'About you',
    intro: 'The text and photo on the About tab of your website, so clients get to know you before they book.',
    sections: [{ heading: 'How it works', points: [
      'Write it with AI: Business AI asks a few questions, writes it from your answers, and it goes on your website only when you tap Confirm.',
      'Or write it yourself (how long you’ve been doing this, what you love, what clients can expect) and tap Save.',
      'Tap the circle to add or change your photo; it’s saved straight away. Remove takes it off.',
    ] }],
  },
  'website-setup': {
    title: 'Your booking website',
    intro: 'Your own page where clients book you, at your-name.certxa.com.',
    sections: [
      { heading: 'The three steps', points: [
        'Choose your link: the address clients use. Letters, numbers and hyphens; shorter is easier to remember. If you change it later, the old link keeps working.',
        'Pick a design: Solo, Aspen, Simple, Mobile or Classic. Preview shows your own page in that design.',
        'Make it yours: colour (Auto uses the design’s own), cover photo, profile photo or logo, a few lines about you, Instagram and Facebook. All optional.',
      ] },
      { heading: 'Good to know', points: ['Skip this step moves on; Do this later leaves the setup.', 'At the end, Share my link sends it anywhere and See my website opens it. Everything can be changed in Settings › Website.'] },
    ],
  },
  'get-paid': {
    title: 'Get paid',
    intro: 'Setting up card payments: the M2 card reader, and Tap to Pay on iPhone.',
    sections: [{ heading: 'How it works', points: [
      'Where do you work?: Stripe needs your address first. If you work from home or only do house calls, clients never see your street address.',
      'Confirm it’s you: the last 4 digits of your Social Security number (and your date of birth if you didn’t give it at sign-up). Certxa sends them straight to Stripe and never saves the digits, so Stripe’s form doesn’t ask for them. Why we ask says why each is needed. Continue sends them and opens the setup; Later leaves the page.',
      'Set up payments opens Certxa’s payment setup page with Stripe’s secure form, for your details and bank account (about five minutes). When you finish or close it, you’re back in the app.',
      'Once it’s done, open an appointment and tap Check Out to take cards. Payouts go to your bank.',
      'If Stripe needs more details, Continue setup picks up where you left off.',
      'Stripe can also ask for more after you’ve finished (a detail that didn’t check out, a document). Then a thin yellow banner shows at the top of every screen, you get a notification and an e-mail (once a day at most), and this page says what’s needed. Tap the banner to open Stripe’s form. If it isn’t done in time, Stripe pauses card payments or payouts until it is.',
    ] }],
  },
  'tap-to-pay': {
    title: 'Tap to Pay on iPhone',
    intro: 'Taking cards with just this iPhone: clients hold their card or phone near the top of it. Needs an iPhone XS or later on iOS 16.4 or later.',
    sections: [{ heading: 'How it works', points: [
      'Turn on Tap to Pay: the first time, Apple asks you to accept its Tap to Pay terms.',
      'Check Tap to Pay confirms it’s ready on this iPhone.',
      'Card payments need your Stripe account set up first (Settings › Stripe account).',
      'To take a payment, open POS or an appointment’s checkout.',
    ] }],
  },
  notifications: {
    title: 'Client notifications',
    intro: 'The texts and e-mails Certxa sends your clients for you, before and after their appointments.',
    sections: [
      { heading: 'Before the appointment', points: [
        'Booking confirmation: sent as soon as a booking is made.',
        'Appointment reminder: sent the number of hours you choose before the appointment, so fewer clients forget.',
        'Each can go by Text, E-mail or both.',
      ] },
      { heading: 'After the appointment', points: [
        'Review request: asks clients to review their visit. How often to text: a new client is asked after their first visit; after that, only once this many visits have passed.',
        'Rebooking reminder: one text with your booking link when a client hasn’t visited for the number of days you choose. Only to clients who agreed to marketing texts.',
      ] },
      { heading: 'Replies and phone numbers', points: [
        'Cancellation replies: when a client texts something clear like “Please cancel my appointment”, Certxa cancels their next appointment and confirms. Unclear messages stay for you to read.',
        'Phone number verification: Verify phone numbers checks which client numbers are landlines, so texts aren’t wasted on them.',
      ] },
      { heading: 'Saving', points: ['Customize messages shows each text and e-mail so you can change the wording. Words in {braces}, like {customerName}, are filled in for each client.', 'Tap Save when you’re done; you’re asked before leaving with unsaved changes.'] },
    ],
  },

  // ── Settings ──────────────────────────────────────────────────────────────────────────────────────────────────────
  settings: {
    title: 'Settings',
    intro: 'How your business is set up. Everything here is saved to Certxa, so it’s the same on your website.',
    sections: [{ heading: 'Sections', points: [
      'My Business: Business details, Location, Where you see clients, Hours and Catalog.',
      'Bookings: Online booking, Booking approval, Cancellation policy and Blocked clients.',
      'Website: your link, design, look, and the AI website designer.',
      'Google: Google Business Profile — connect it to show and reply to your Google reviews, or follow the steps to create one.',
      'Client Messages: Client notifications and Business Phone.',
      'Payments: Stripe account, Connect card reader, Deposits, Checkout (tax and tips) and Enable Tap to Pay on iPhone.',
      'Account: your sign-in, and Billing (your plan and invoices on certxa.com).',
      'Hold a section’s title for its own help.',
    ] }],
  },
  'settings.business': { title: 'Business details', intro: 'Your business name, type, phone and e-mail.', sections: [{ heading: 'Good to know', points: ['Clients see these on your booking website and in the messages Certxa sends.', 'Tap Save to keep a change.'] }] },
  'settings.location': { title: 'Location', intro: 'Your business address.', sections: [{ heading: 'Good to know', points: ['Street address, city, state and ZIP code.', 'Certxa sets your time zone from it. House calls are measured from it.', 'Whether clients see it is set in Where you see clients.'] }] },
  'settings.places': {
    title: 'Where you see clients',
    intro: 'Your own place, house calls, or both.',
    sections: [
      { heading: 'Your place', points: ['Salon, suite or booth; Home studio; or None (house calls only).', 'Keep my address private: clients see only your city until they book, then get the full address.'] },
      { heading: 'House calls', points: [
        'How far you travel: driving miles from your business address. Clients further away can’t book a house call online.',
        'Travel fee: added to every house call (0 for none).',
        'Setup time and Pack-up time: kept free before and after each house call.',
        'Backup drive time: used only when a drive between two clients can’t be worked out from their addresses.',
        'House-call alarm: your phone sounds this long before each house call, so you leave on time.',
        'Open times are planned as a route, so you can fit more in without being late.',
      ] },
    ],
  },
  'settings.hours': { title: 'Hours', intro: 'Your time zone and business hours.', sections: [{ heading: 'How it works', points: ['Time zone: your calendar, booking page and client messages all use it.', 'Business hours: tick a day to open or close it, and set its start and end time. Your website shows these hours, and clients can book any time inside them.', 'House-call drives, setup and pack-up count as part of these hours; time you block on the calendar comes out of them.', 'Business Phone and Plus calls ring during business hours unless you choose Any time.'] }] },
  'settings.rules': {
    title: 'Online booking',
    intro: 'How clients book you online.',
    sections: [{ heading: 'What you can set', points: [
      'Who can book: All clients, Existing clients only (new clients are asked to contact you), or Off. Clients always see your website.',
      'Minimum notice: how far ahead clients must book (1 to 24 hours). You can still book any time yourself.',
      'Booking increments: which start times clients can pick (every 15 minutes offers 9:00, 9:15, 9:30…).',
      'Padded time: extra minutes kept free at the end of every booking. The times clients see include it.',
      'Advance booking: limit how many months ahead clients can book.',
      'Allow online cancellation: clients can cancel online up to your cancellation notice (Cancellation policy).',
    ] }],
  },
  'settings.approval': { title: 'Booking approval', intro: 'Accept online bookings automatically, or review each one first.', sections: [{ heading: 'What you can set', points: ['Approve automatically: every online booking goes straight into your calendar.', 'Review each one first: clients send a request; you approve it, offer other times, or decline it. The time is only booked once you approve.', 'Answer requests within: a request you haven’t answered by then expires, and the client is told.', 'Offered times stay open for: how many days the link with your other times works.'] }] },
  'settings.policy': { title: 'Cancellation policy', intro: 'What clients agree to when they book.', sections: [{ heading: 'What you can set', points: ['Your cancellation policy: the text shown on your website and when clients book. Clients must accept it to book makes them tick a box.', 'Cancellation notice: cancelling later than this is a late cancellation (the fee can apply and a deposit is kept). Clients can cancel online only before it.', 'No-show and late-cancel fee: a percent of the booking, charged to the card the client saved when booking. Ask for a card in Deposits.'] }] },
  'settings.blocked': { title: 'Blocked clients', intro: 'Phone numbers that can’t book online.', sections: [{ heading: 'How it works', points: ['Block a phone number: enter it, add a reason if you like, and tap Block this number. Remove unblocks it.', 'You can still book them yourself.', 'Blocking someone from calling is separate: Settings › Business Phone.'] }] },
  'settings.phone': { title: 'Business Phone settings', intro: 'Your number, your calling rules and blocked callers.', sections: [{ heading: 'What you can do', points: ['Ring my phone: During business hours, or Any time. When it doesn’t ring, or a call isn’t answered in 25 seconds, the caller is told you can’t take the call and you get a missed call.', 'Block a client or number: they hear a busy signal and you aren’t told.', 'Your plan: Cancel Business Phone (your number works to the end of the paid month, then it’s released), Keep my number to undo that, or Pay $10 now after a failed payment.', 'Change number ($5): your old number is released and can’t be had back.', 'On Plus, your clients call and text you on Certxa’s Plus number.'] }] },
  'settings.website': { title: 'Website', intro: 'Your booking website.', sections: [{ heading: 'What’s here', points: ['Design my website with AI: six ideas made for your business, then a site built from the ones you love (uses AI credits).', 'Your website and booking address: Share my booking link sends it anywhere; Open my website shows it.', 'About you: the text and photo on your About tab.', 'Edit my link, design and look: change your address, design, colour, photos and social links.'] }] },
  'settings.stripe': { title: 'Stripe account', intro: 'Where your card payments are paid out.', sections: [{ heading: 'What you see', points: ['Connected: the Stripe account your payments go to.', 'Card payments: Ready, or Not ready yet. Payouts to your bank: on Stripe’s schedule.', 'Finish payment setup appears when Stripe needs more details; Set up payments starts it when nothing is connected.'] }] },
  'settings.readers': { title: 'Connect card reader', intro: 'Adding a Stripe M2 card reader.', sections: [{ heading: 'How it works', points: ['Turn the reader on, enter the registration code it shows and tap Register a new Stripe M2.', 'Your readers lists the ones registered; checkout then offers them.'] }] },
  'settings.deposits': {
    title: 'Deposits',
    intro: 'Asking clients to pay part up front, or save a card, when they book online.',
    sections: [{ heading: 'What you can set', points: [
      'No deposit, Ask for a deposit, or Save their card (no charge): a $1 hold checks the card and is released right away; you can charge a no-show or late-cancel fee to it later.',
      'How much: the full price, a set amount, or a percent of the price.',
      'Include the house-call travel fee: on, it’s part of what the client pays when they book; off, they pay it at the visit.',
      'The deposit comes off the price at checkout. Card payments must be set up first.',
    ] }],
  },
  'settings.tax': { title: 'Checkout', intro: 'Sales tax and tips at checkout.', sections: [{ heading: 'What you can set', points: ['Sales tax rate (%), and whether to charge tax on services, on products, or both. Tax rules differ by place, so check with your tax adviser.', 'Tips: up to four tip choices clients see at checkout, as percentages. Clients can still enter their own amount or no tip.'] }] },
  'settings.account': { title: 'Account', intro: 'Your sign-in and account.', sections: [{ heading: 'What you can do', points: ['Mobile number: change it; a code is texted to the new number to confirm it.', 'Password: E-mail me a link to change it.', 'Sign out signs this phone out.', 'Delete my account: asks for your password, then deletes your business, bookings, clients and website for good.'] }] },
};
