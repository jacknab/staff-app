/**
 * Google Business Profile (owner, 2026-11-11): connecting it from Settings, and its Google reviews in the app.
 *
 * Connecting opens Certxa's page in the in-app browser through a one-time link (server routes/proGoogleConnect.ts):
 * Google's sign-in, choosing the business, then certxa-pro://google-business closes it here. Once connected, the
 * business's Google reviews show on its website (lib/reviewLinks.ts on the server) and here, where the owner replies;
 * a reply is published to Google.
 */
import * as WebBrowser from 'expo-web-browser';
import { api } from '@/lib/live-api';

export type GoogleProfile = {
  businessName: string | null;
  locationAddress: string | null;
  locationId: string | null;
  isConnected: boolean;
  lastSyncedAt: string | null;
  reconnectRequired?: boolean | null;
} | null;

export type GoogleReview = {
  id: number;
  customerName: string | null;
  rating: number;
  reviewText: string | null;
  reviewCreateTime: string | null;
  reviewerPhotoUrl: string | null;
  ownerReply: { comment?: string; updateTime?: string } | null;
};

export async function myStoreId(): Promise<number | null> {
  const stores = await api.get<{ id: number }[]>('/api/stores');
  return Array.isArray(stores) && stores[0] ? Number(stores[0].id) : null;
}

export async function getGoogleProfile(storeId: number): Promise<GoogleProfile> {
  const r = await api.get<{ profile: GoogleProfile }>(`/api/google-business/profile/${storeId}`);
  return r?.profile ?? null;
}

/** Connected: Google sign-in done and a business chosen. */
export const googleConnected = (p: GoogleProfile) => Boolean(p?.isConnected && p.locationId);

/** Opens Google's sign-in on Certxa's page and waits until the owner comes back. */
export async function runGoogleConnect(): Promise<void> {
  const { url } = await api.post<{ url: string }>('/api/google-business/app-connect-link');
  await WebBrowser.openAuthSessionAsync(url, 'certxa-pro://google-business');
}

export const disconnectGoogle = (storeId: number) => api.del(`/api/google-business/profile/${storeId}`);
export const syncGoogleReviews = (storeId: number) => api.post(`/api/google-business/sync-reviews/${storeId}`);

export async function googleReviews(storeId: number): Promise<GoogleReview[]> {
  const r = await api.get<{ reviews: GoogleReview[] }>(`/api/google-business/reviews/${storeId}?limit=50`);
  return Array.isArray(r?.reviews) ? r.reviews : [];
}

/** Saves the reply and publishes it on Google. */
export async function replyOnGoogle(storeId: number, reviewId: number, text: string): Promise<void> {
  const saved = await api.post<{ id: number }>('/api/google-business/review-response', { googleReviewId: reviewId, storeId, responseText: text });
  await api.post(`/api/google-business/review-response/${saved.id}/publish`);
}

/** Google's page to create a Business Profile. */
export const CREATE_PROFILE_URL = 'https://business.google.com/create';
export const openCreateProfile = () => WebBrowser.openBrowserAsync(CREATE_PROFILE_URL);
