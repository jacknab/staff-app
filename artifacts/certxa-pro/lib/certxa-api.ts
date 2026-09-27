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

export type TerminalPaymentMethod = 'tap_to_pay' | 'm2' | 'card';

export type CreateTerminalPaymentIntentRequest = {
  amountCents: number;
  currency?: 'usd';
  appointmentId: number;
  clientName?: string;
  method: TerminalPaymentMethod;
  tipCents?: number;
  discountCents?: number;
  priorTenderedCents?: number;
};

export type CreateTerminalPaymentIntentResponse = {
  paymentIntentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
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
  method: TerminalPaymentMethod,
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
