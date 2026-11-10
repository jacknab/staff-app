/**
 * Card payment setup ("Get paid"): the business's Stripe account, set up on Certxa's own page with Stripe's
 * embedded onboarding, the same form as the website (owner, 2026-11-10), opened in the in-app browser. Certxa earns from every card payment, so a business that hasn't finished this can't take cards
 * with Tap to Pay or the M2 reader.
 *
 * POST /api/payments/stripe/app-setup-link gives a one-time link to certxa.com/pro-payments-setup, signed in for that
 * page only (server: routes/proPaymentsSetup.ts). The account is made on first use, pre-filled with what Certxa
 * knows. When the owner is done the page opens certxa-pro://payments-setup, which closes the in-app browser here.
 * A server without that link yet gets Stripe's hosted setup (POST /api/payments/stripe/onboarding-link) as before.
 */
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/lib/live-api';

export type PaymentStatus = {
  connected: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
  /** Stripe asking for more after setup (server: lib/paymentsAttention.ts): the banner on every page. */
  attention?: { needed: boolean; paused: boolean; deadline: string | null };
};

/** What Certxa already has for Stripe (never the values): GET /api/payments/stripe/owner-details. */
export type OwnerDetailsSummary = { hasDateOfBirth: boolean; hasHomeAddress: boolean; legalEntityType: string | null; isCompany: boolean; hasEin: boolean; ssnSent: boolean };

export const getOwnerDetails = () => api.get<OwnerDetailsSummary>('/api/payments/stripe/owner-details');

/**
 * The last 4 digits of the SSN (and the date of birth, if Certxa doesn't have it), sent straight to Stripe. Certxa
 * never saves the SSN digits.
 */
export const sendIdentity = (body: { ssnLast4: string; dateOfBirth?: string }) => api.post('/api/payments/stripe/identity', body);

// Anything that changes the payment status (setup finished) tells the banner to look again.
const listeners = new Set<() => void>();
export function onPaymentStatusChange(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
const changed = () => listeners.forEach((listener) => listener());

const RETURN_URL = 'certxa-pro://payments-setup';

/** True once the business can take card payments. */
export function canTakeCards(status: PaymentStatus | null | undefined): boolean {
  return Boolean(status?.connected && status.chargesEnabled);
}

/**
 * The business's payment status. `fresh` asks Stripe first (right after setup, before Stripe's own update
 * has reached Certxa); otherwise it's Certxa's copy.
 */
export async function getPaymentStatus(fresh = false): Promise<PaymentStatus> {
  if (fresh) await api.post('/api/payments/stripe/sync').catch(() => undefined);
  return api.get<PaymentStatus>('/api/payments/stripe/status');
}

/**
 * Opens Stripe's setup in an in-app browser and waits until the person comes back (or closes it), then
 * returns the fresh status. A link Stripe reports as expired is replaced with a new one, up to twice.
 */
export async function runPaymentsSetup(): Promise<PaymentStatus> {
  const embedded = await api.post<{ url: string }>('/api/payments/stripe/app-setup-link').catch(() => null);
  if (embedded?.url) {
    await WebBrowser.openAuthSessionAsync(embedded.url, RETURN_URL);
    const status = await getPaymentStatus(true);
    changed();
    return status;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const { url } = await api.post<{ url: string }>('/api/payments/stripe/onboarding-link');
    const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
    const expired = result.type === 'success' && result.url.includes('result=refresh');
    if (!expired) break;
  }
  const status = await getPaymentStatus(true);
  changed();
  return status;
}
