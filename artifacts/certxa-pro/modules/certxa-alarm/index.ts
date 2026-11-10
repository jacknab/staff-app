/**
 * Real alarms for bookings on iOS 26+ (native: ios/CertxaAlarmModule.swift). Everything answers "not available" on
 * older iPhones, Android and the web preview, so callers needn't check the OS.
 */
import { requireOptionalNativeModule } from 'expo';

type Native = {
  isAvailable(): boolean;
  authorizationState(): Promise<string>;
  requestAuthorization(): Promise<string>;
  schedule(id: string, timestampMs: number, title: string, sound: string, snoozeSeconds: number): Promise<boolean>;
  cancel(id: string): Promise<void>;
  scheduledIds(): Promise<string[]>;
};

const native = requireOptionalNativeModule<Native>('CertxaAlarm');

export const CertxaAlarm = {
  isAvailable: () => { try { return !!native?.isAvailable(); } catch { return false; } },
  authorizationState: async () => (native ? native.authorizationState() : 'unavailable'),
  requestAuthorization: async () => (native ? native.requestAuthorization() : 'unavailable'),
  schedule: async (id: string, timestampMs: number, title: string, sound: string, snoozeSeconds: number) =>
    (native ? native.schedule(id, timestampMs, title, sound, snoozeSeconds) : false),
  cancel: async (id: string) => { if (native) await native.cancel(id); },
  scheduledIds: async () => (native ? native.scheduledIds() : []),
};
