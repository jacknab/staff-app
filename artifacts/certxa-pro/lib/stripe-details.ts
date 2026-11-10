/**
 * The details Stripe needs for card payments that Certxa asks for itself (owner, 2026-11-10), at sign-up and on Get
 * paid, and hands to Stripe so its setup form doesn't ask again (server: lib/ownerPaymentDetails.ts). Each one shows
 * why it is asked (components/WhyWeAsk).
 */

/** The same structures as Business Settings on the website. */
export const BUSINESS_STRUCTURES = [
  { value: 'Sole proprietorship', label: 'Just me (sole proprietor)' },
  { value: 'Single-member LLC', label: 'Single-member LLC' },
  { value: 'Multi-member LLC', label: 'Multi-member LLC' },
  { value: 'Partnership', label: 'Partnership' },
  { value: 'S corporation', label: 'S corporation' },
  { value: 'C corporation', label: 'C corporation' },
  { value: 'Nonprofit', label: 'Nonprofit' },
];
export const isCompany = (structure: string) => Boolean(structure) && structure !== 'Sole proprietorship';

export const WHY = {
  dateOfBirth: 'Stripe, who processes your card payments, must confirm the identity of everyone it pays out to (US law). Your date of birth is one of the details it checks. Certxa passes it to Stripe so you don’t type it twice. Clients never see it.',
  homeAddress: 'Stripe checks your identity against your home address, which can be different from where you work. Certxa passes it to Stripe so you don’t type it twice. Clients never see it.',
  structure: 'Stripe sets up your account either for you as a person or for your registered business. If you haven’t registered an LLC or corporation, choose Just me: most independent professionals are sole proprietors.',
  ein: 'Stripe verifies an LLC or corporation by its federal tax ID (EIN), and uses it on the tax form it sends you each year. You can leave it empty and Stripe asks for it later.',
  legalName: 'The name your LLC or corporation is registered under, which can differ from the name clients know. Stripe matches it with your EIN.',
  ssn: 'Stripe must confirm the identity of everyone it pays out to (US law), and these 4 digits are how it checks your name and date of birth. Certxa sends them straight to Stripe and never saves them. Clients never see them.',
};

/** "MM", "DD", "YYYY" → "YYYY-MM-DD", or null while it isn't a real date at least 13 years ago. */
export function dateOfBirthIso(month: string, day: string, year: string): string | null {
  const [m, d, y] = [Number(month), Number(day), Number(year)];
  if (!/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day) || !/^\d{4}$/.test(year)) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const age = (Date.now() - date.getTime()) / (365.25 * 86_400_000);
  if (age < 13 || age > 120) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
