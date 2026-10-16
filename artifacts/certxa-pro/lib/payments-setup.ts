/**
 * Card payment setup ("Get paid"): the business's Stripe account, opened in Stripe's own hosted setup inside
 * the app. Certxa earns from every card payment, so a business that hasn't finished this can't take cards
 * with Tap to Pay or the M2 reader.
 *
 * The server makes the account on first use, pre-filled with what Certxa knows, and returns a one-time link
 * (POST /api/payments/stripe/onboarding-link). Stripe sends the browser back through certxa.com, which opens
 * certxa-pro://payments-setup, which closes the in-app browser here.
 */
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/lib/live-api';

export type PaymentStatus = {
  connected: boolean;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  detailsSubmitted?: boolean;
};

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
  for (let attempt = 0; attempt < 3; attempt++) {
    const { url } = await api.post<{ url: string }>('/api/payments/stripe/onboarding-link');
    const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
    const expired = result.type === 'success' && result.url.includes('result=refresh');
    if (!expired) break;
  }
  return getPaymentStatus(true);
}
