/**
 * The in-app alarm (owner, 2026-11-07), like a ride app's incoming-trip screen: when a "booking starting now" reminder
 * or a house-call alarm comes in, a full-screen page plays its sound on a loop until the pro taps Got it (opens the
 * booking) or Snooze 5 min (rings again in five minutes, from this phone). With the app closed or the phone locked,
 * iPhone plays the notification's sound once (apps can't loop it); tapping the notification opens this page.
 * During a Business Phone call the page shows without sound, so it never plays over the call.
 */
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { hasActiveCall } from '@/lib/voice';

export type AlarmKind = 'appointment_reminder' | 'house_call_alarm';
export type Alarm = { kind: AlarmKind; appointmentId: number; title: string; body: string };

export const isAlarmType = (type: unknown): type is AlarmKind => type === 'appointment_reminder' || type === 'house_call_alarm';
export const SNOOZE_MINUTES = 5;

const SOUNDS: Record<AlarmKind, number> = {
  appointment_reminder: require('@/assets/sounds/reminder.wav'),
  house_call_alarm: require('@/assets/sounds/alarm.wav'),
};
const FILE: Record<AlarmKind, string> = { appointment_reminder: 'reminder.wav', house_call_alarm: 'alarm.wav' };

let current: Alarm | null = null;
let player: AudioPlayer | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
/** Alarms already shown (by notification id), so a tap on one already handled doesn't ring again. */
const seen = new Set<string>();

function stopSound() {
  try { player?.pause(); player?.remove(); } catch { /* already gone */ }
  player = null;
}

async function startSound(kind: AlarmKind) {
  stopSound();
  if (hasActiveCall()) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false, interruptionMode: 'duckOthers' });
    player = createAudioPlayer(SOUNDS[kind]);
    player.loop = true;
    player.volume = 1;
    player.play();
  } catch { /* no sound, the page still shows */ }
}

/** Show the alarm page (and loop its sound). `id` is the notification's, so the same one never rings twice. */
export function showAlarm(alarm: Alarm, id?: string) {
  if (id) { if (seen.has(id)) return; seen.add(id); }
  current = alarm;
  emit();
  void startSound(alarm.kind);
}

/** Got it: stop the sound and close the page. */
export function dismissAlarm() {
  stopSound();
  current = null;
  emit();
}

/** Snooze: stop now, and ring again in five minutes (a notification from this phone, which opens the page again). */
export async function snoozeAlarm() {
  const alarm = current;
  dismissAlarm();
  if (!alarm) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: alarm.title, body: alarm.body, sound: FILE[alarm.kind], data: { type: alarm.kind, appointmentId: alarm.appointmentId, snoozed: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: SNOOZE_MINUTES * 60, ...(Platform.OS === 'android' ? { channelId: 'bookings' } : {}) },
    });
  } catch { /* couldn't schedule: nothing more to do */ }
}

export function useAlarm(): Alarm | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => current);
}
