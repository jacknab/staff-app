/**
 * Push notifications for the owner: a client (or the AI receptionist) booked, cancelled or moved an
 * appointment. Certxa sends them (api-server lib/ownerPush.ts); this file registers the phone and
 * reacts when one arrives.
 *
 * The sound is the quiet two-note chime bundled at assets/sounds/soft_chime.wav. iOS plays it only
 * when the phone is not silenced, at the notification volume.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/lib/live-api';
import { certxaRequest } from '@/lib/certxa-api';

const SOUND = 'soft_chime.wav';
const CHANNEL = 'bookings';
const TOKEN_KEY = 'certxa.pushToken';

// A notification that arrives while the app is open still shows its banner and plays the chime.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Ask permission (once — iOS remembers the answer), get this phone's push token and give it to
 * Certxa. Safe to call on every launch. Returns false when notifications are off or unavailable.
 */
export async function registerForBookingPushes(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Bookings', importance: Notifications.AndroidImportance.HIGH, sound: SOUND, vibrationPattern: [0, 120],
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return false;

    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return false;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await api.post('/api/solo/push-token', { token, platform: Platform.OS });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    // No push on this run (simulator, no network, Apple not reachable). The next launch tries again.
    return false;
  }
}

/** At sign-out: stop sending this phone the account's notifications. `authToken` is the session being closed. */
export async function unregisterBookingPushes(authToken: string | null): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token && authToken) await certxaRequest('/api/solo/push-token', { method: 'DELETE', body: JSON.stringify({ token }) }, authToken);
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch { /* Certxa also forgets a phone once Apple reports the token gone */ }
}

/** Run `onBooking` when a booking notification arrives or is tapped. Returns the unsubscribe function. */
export function onBookingPush(onBooking: (data: { type?: string; appointmentId?: number }, tapped: boolean) => void): () => void {
  const read = (notification: Notifications.Notification) => (notification.request.content.data ?? {}) as { type?: string; appointmentId?: number };
  const received = Notifications.addNotificationReceivedListener((notification) => onBooking(read(notification), false));
  const tapped = Notifications.addNotificationResponseReceivedListener((response) => onBooking(read(response.notification), true));
  return () => { received.remove(); tapped.remove(); };
}
