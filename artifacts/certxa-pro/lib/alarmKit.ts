/**
 * Real alarms on iOS 26+ (owner, 2026-11-07; native module modules/certxa-alarm). AlarmKit can't be started by a push,
 * so this phone sets one alarm per upcoming booking itself, like an alarm clock: at the start of each booking at the
 * pro's place, and before each house call by the pro's house-call alarm setting. Kept in step whenever the app opens,
 * comes back on screen, gets a booking push, and every 10 minutes while open. Older iPhones skip all of this and use the
 * full-screen page (lib/alarm.ts) — and the push still comes for a booking made online since the app last opened.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { CertxaAlarm } from '@/modules/certxa-alarm';
import { api } from '@/lib/live-api';
import { SNOOZE_MINUTES } from '@/lib/alarm';

const DAYS_AHEAD = 7;
const KEYS = 'certxa.alarmkit.keys';       // { [uuid]: appointmentId } of the alarms this app set
const ASKED = 'certxa.alarmkit.asked';      // permission asked once

type Appt = { id: number; date: string; status?: string | null; visitAt?: string | null; calendarHidden?: boolean | null;
  customer?: { name?: string | null; fullName?: string | null } | null; service?: { name?: string | null } | null };

let syncing = false;
let scheduledFor = new Set<number>();

/** A real alarm is set for this booking on this phone: the in-app page needn't ring as well. */
export const hasRealAlarm = (appointmentId: number) => scheduledFor.has(appointmentId);

/** Same booking + same time → same alarm id, so a re-sync never makes a second alarm. */
function uuidFor(key: string): string {
  const parts: string[] = [];
  for (let round = 0; round < 4; round++) {
    let h = 0x811c9dc5 ^ (round * 0x9e3779b9);
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    parts.push((h >>> 0).toString(16).padStart(8, '0'));
  }
  const hex = parts.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export async function syncRealAlarms(): Promise<void> {
  if (Platform.OS !== 'ios' || syncing || !CertxaAlarm.isAvailable()) return;
  syncing = true;
  try {
    let state = await CertxaAlarm.authorizationState();
    if (state === 'notDetermined' && !(await AsyncStorage.getItem(ASKED))) {
      await AsyncStorage.setItem(ASKED, '1');
      state = await CertxaAlarm.requestAuthorization();
    }
    if (state !== 'authorized') return;

    const now = Date.now();
    const [appointments, places] = await Promise.all([
      api.get<Appt[]>(`/api/appointments?from=${encodeURIComponent(new Date(now).toISOString())}&to=${encodeURIComponent(new Date(now + DAYS_AHEAD * 86_400_000).toISOString())}`),
      api.get<{ houseCalls?: boolean; houseCallAlarmMinutes?: number }>('/api/work-places').catch(() => null),
    ]);
    const leadMinutes = places?.houseCalls ? Number(places.houseCallAlarmMinutes ?? 0) : 0;

    // What should ring: uuid → alarm.
    const wanted = new Map<string, { appointmentId: number; at: number; title: string; sound: string }>();
    for (const a of Array.isArray(appointments) ? appointments : []) {
      if (!['pending', 'confirmed'].includes(String(a.status ?? '')) || a.calendarHidden) continue;
      const start = new Date(a.date).getTime();
      const houseCall = a.visitAt === 'client';
      if (houseCall && leadMinutes <= 0) continue;
      const at = houseCall ? start - leadMinutes * 60_000 : start;
      if (at <= now + 30_000) continue;
      const who = [a.customer?.name ?? a.customer?.fullName ?? 'Your client', a.service?.name].filter(Boolean).join(' · ');
      const title = houseCall ? `Leave for your house call: ${who} at ${timeLabel(a.date)}` : `Booking now: ${who}`;
      wanted.set(uuidFor(`${a.id}@${at}`), { appointmentId: a.id, at, title, sound: houseCall ? 'alarm.wav' : 'reminder.wav' });
    }

    const mine: Record<string, number> = JSON.parse((await AsyncStorage.getItem(KEYS)) ?? '{}');
    const onPhone = new Set((await CertxaAlarm.scheduledIds()).map((id: string) => id.toUpperCase()));
    // Ours that no longer match a booking (cancelled, moved, done): take them off.
    for (const id of Object.keys(mine)) {
      if (!wanted.has(id)) { await CertxaAlarm.cancel(id); delete mine[id]; }
    }
    for (const [id, alarm] of wanted) {
      if (onPhone.has(id)) { mine[id] = alarm.appointmentId; continue; }
      if (await CertxaAlarm.schedule(id, alarm.at, alarm.title, alarm.sound, SNOOZE_MINUTES * 60)) mine[id] = alarm.appointmentId;
    }
    await AsyncStorage.setItem(KEYS, JSON.stringify(mine));
    scheduledFor = new Set(Object.values(mine));
  } catch { /* the push and the in-app page still work */ } finally {
    syncing = false;
  }
}
