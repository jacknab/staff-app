import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const CERTXA_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || 'https://certxa.com';

export const CERTXA_TOKEN_KEY = 'certxa.mobile.bearer-token';
export const CERTXA_USER_KEY = 'certxa.mobile.user';
export const CERTXA_PENDING_CAPTURE_KEY = 'certxa.mobile.pending-capture';

export type CertxaUser = {
  id: string;
  email?: string;
  role?: string;
  staffId?: number | null;
  [key: string]: unknown;
};

export type LoginResponse = {
  token: string;
  user: CertxaUser;
};

/** card_on_file: the client's saved card; keyed: a card typed in on certxa.com/card-entry (2026-11-17). */
export type TerminalPaymentMethod = 'tap_to_pay' | 'm2' | 'card' | 'card_on_file' | 'keyed';

export type CreateTerminalPaymentIntentRequest = {
  amountCents: number;
  currency?: 'usd';
  appointmentId: number;
  clientName?: string;
  method: TerminalPaymentMethod;
  tipCents?: number;
  discountCents?: number;
  priorTenderedCents?: number;
  /** The client's card fee (Settings › Card reader & Checkout), part of amountCents. */
  clientFeeCents?: number;
  /** Keep this card on the client for later (Save card on file at checkout). */
  saveCard?: boolean;
};

export type CreateTerminalPaymentIntentResponse = {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  status?: string;
  /** keyed only: for the card-entry page, which takes the card on the business's own Stripe account. */
  publishableKey?: string | null;
  stripeAccount?: string | null;
};

export type CaptureTerminalPaymentIntentResponse = {
  success: true;
  paymentIntentId: string;
  status: string;
  amount: number;
};

export type PendingTerminalCapture = {
  paymentIntentId: string;
  amountCents: number;
  clientName?: string;
  method?: TerminalPaymentMethod;
};

export class CertxaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = 'CertxaApiError';
  }
}

const storage = {
  getItem: (key: string) => Platform.OS === 'web' ? AsyncStorage.getItem(key) : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => Platform.OS === 'web' ? AsyncStorage.setItem(key, value) : SecureStore.setItemAsync(key, value),
  deleteItem: (key: string) => Platform.OS === 'web' ? AsyncStorage.removeItem(key) : SecureStore.deleteItemAsync(key),
};

export async function certxaRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${CERTXA_API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message =
      (typeof payload?.error === 'string' && payload.error) ||
      (typeof payload?.message === 'string' && payload.message) ||
      `Certxa API request failed (${response.status})`;
    throw new CertxaApiError(message, response.status, payload);
  }

  return payload as T;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return certxaRequest<LoginResponse>('/api/solo/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export type RegisterRequest = {
  firstName: string;
  lastName: string;
  businessName: string;
  businessType: string;
  email: string;
  password: string;
  /** 10 digits, proved by the texted code. */
  phone: string;
  /** From verifySignupPhoneCode. */
  phoneToken: string;
  timezone?: string;
  /** Where they see clients: their own place (salon/suite or a private home studio, or none) and house calls. */
  ownPlace?: 'salon' | 'home' | 'none';
  houseCalls?: boolean;
  /** The services priced in the sign-up's catalog builder; with any, they are the menu instead of the starter list. */
  catalog?: { category: string; services: { name: string; price: number; duration: number }[] }[];
};

/** Texts a sign-up code to a mobile number no Certxa account has had (landline and VoIP numbers are refused). */
export function sendSignupPhoneCode(phone: string): Promise<{ sent: true }> {
  return certxaRequest('/api/solo/phone/send-code', { method: 'POST', body: JSON.stringify({ phone }) });
}

/** Checks the texted code; the token goes with the sign-up. */
export function verifySignupPhoneCode(phone: string, code: string): Promise<{ phoneToken: string }> {
  return certxaRequest('/api/solo/phone/verify', { method: 'POST', body: JSON.stringify({ phone, code }) });
}

/** Creates a Certxa Pro account (one calendar, free Solo plan) and signs it in. */
export function register(body: RegisterRequest): Promise<LoginResponse> {
  return certxaRequest<LoginResponse>('/api/solo/register', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getStoredToken() {
  return storage.getItem(CERTXA_TOKEN_KEY);
}

export async function getStoredUser(): Promise<CertxaUser | null> {
  const rawUser = await storage.getItem(CERTXA_USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as CertxaUser;
  } catch {
    return null;
  }
}

export async function storeSession(session: LoginResponse) {
  await Promise.all([
    storage.setItem(CERTXA_TOKEN_KEY, session.token),
    storage.setItem(CERTXA_USER_KEY, JSON.stringify(session.user)),
  ]);
}

export async function clearSession() {
  await Promise.all([
    storage.deleteItem(CERTXA_TOKEN_KEY),
    storage.deleteItem(CERTXA_USER_KEY),
  ]);
}

export async function getPendingTerminalCapture(): Promise<PendingTerminalCapture | null> {
  const rawCapture = await storage.getItem(CERTXA_PENDING_CAPTURE_KEY);
  if (!rawCapture) return null;

  try {
    const capture = JSON.parse(rawCapture) as Partial<PendingTerminalCapture>;
    if (
      typeof capture.paymentIntentId !== 'string' ||
      !capture.paymentIntentId ||
      typeof capture.amountCents !== 'number' ||
      !Number.isInteger(capture.amountCents) ||
      capture.amountCents < 50
    ) {
      return null;
    }

    return {
      paymentIntentId: capture.paymentIntentId,
      amountCents: capture.amountCents,
      clientName: typeof capture.clientName === 'string' ? capture.clientName : undefined,
      method: capture.method === 'm2' || capture.method === 'tap_to_pay' || capture.method === 'card'
        ? capture.method
        : undefined,
    };
  } catch {
    return null;
  }
}

export function storePendingTerminalCapture(capture: PendingTerminalCapture) {
  return storage.setItem(CERTXA_PENDING_CAPTURE_KEY, JSON.stringify(capture));
}

export function clearPendingTerminalCapture() {
  return storage.deleteItem(CERTXA_PENDING_CAPTURE_KEY);
}

export function createTerminalConnectionToken(token: string) {
  return certxaRequest<{ secret: string }>(
    '/api/payments/terminal/connection-token',
    { method: 'POST' },
    token,
  );
}

export function getTerminalLocation(token: string) {
  return certxaRequest<{ locationId: string }>(
    '/api/payments/terminal/location',
    { method: 'GET' },
    token,
  );
}

export function registerTerminalReader(token: string, registrationCode: string, label?: string) {
  return certxaRequest<{ readerId: string; label?: string | null; serialNumber?: string | null }>(
    '/api/payments/terminal/reader/register',
    {
      method: 'POST',
      body: JSON.stringify({ registrationCode: registrationCode.trim(), label }),
    },
    token,
  );
}

export function createTerminalPaymentIntent(
  token: string,
  body: CreateTerminalPaymentIntentRequest,
) {
  return certxaRequest<CreateTerminalPaymentIntentResponse>(
    '/api/payments/terminal/create-payment-intent',
    {
      method: 'POST',
      body: JSON.stringify({ currency: 'usd', ...body }),
    },
    token,
  );
}

export function captureTerminalPaymentIntent(
  token: string,
  paymentIntentId: string,
  /** The reader, or for a split checkout how it was paid ("gift_card:20.00,cash:10.00,m2:45.00"). */
  method: TerminalPaymentMethod | string,
) {
  return certxaRequest<CaptureTerminalPaymentIntentResponse>(
    '/api/payments/terminal/capture-payment-intent',
    {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId, method }),
    },
    token,
  );
}

export function cancelTerminalPaymentIntent(token: string, paymentIntentId: string) {
  return certxaRequest<Record<string, unknown>>(
    '/api/payments/terminal/cancel-payment-intent',
    {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId }),
    },
    token,
  );
}
