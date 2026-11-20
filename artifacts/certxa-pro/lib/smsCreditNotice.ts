/**
 * "No SMS credits" (owner, 2026-11-20): a text the app asked Certxa to send that wasn't sent because the account has no
 * text message credits. The server marks the response (X-Sms-No-Credits: phone;type, api-server lib/smsCreditNotice.ts);
 * the app says so as a plain confirmation with OK — never as an error (components/SmsCreditNoticeHost.tsx).
 */
export type NoCreditsNote = { phone: string; messageType: string };

const listeners = new Set<(note: NoCreditsNote) => void>();
let lastNoCreditsAt = 0;
/** Did a text get held back for want of credits since `since` (Date.now() before the request)? Its own "Sent" then
 *  isn't shown: the no-credits message says what happened. */
export const textHeldBack = (since: number) => lastNoCreditsAt >= since;
export const onNoSmsCredits = (l: (note: NoCreditsNote) => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** lib/certxa-api.ts: a response came back with the header. */
export function reportNoSmsCredits(header: string | null) {
  if (!header) return;
  const [phone = '', messageType = ''] = header.split(';');
  lastNoCreditsAt = Date.now();
  listeners.forEach((l) => l({ phone, messageType }));
}

/** "(720) 243-6886" from "+17202436886". */
export function phoneLabel(phone: string): string {
  const d = phone.replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : phone;
}

/** What the text was, for "…to send the booking link to…". */
const WHAT: Record<string, string> = {
  booking_link: 'the booking link', pos_receipt: 'the receipt link', pos_receipt_link: 'the receipt link', pay_link: 'the payment link', booking_payment_required: 'the payment link',
  intake_form: 'the form', membership_invite: 'the membership link', booking_request: 'the booking update', two_way_reply: 'your reply',
  campaign: 'the campaign', package_balance: 'the package update', no_show_reminder: 'the reminder', win_back: 'the message',
};
export const whatWasSent = (messageType: string) => WHAT[messageType] ?? 'the text message';

/** The words the app shows. */
export const noCreditsMessage = (what: string, phone: string) =>
  `You currently do not have any SMS credits needed to send ${what} to the client's phone, ${phoneLabel(phone)}.`;
