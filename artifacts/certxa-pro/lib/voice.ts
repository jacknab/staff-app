/**
 * Business Phone calls (owner, 2026-11-04): the Twilio Voice SDK, iPhone only for now. Certxa gives this phone a
 * one-hour voice token (POST /api/pro/phone/token); no Twilio key ever lives in the app. Incoming calls arrive as
 * VoIP pushes and ring through CallKit like any phone call; calls out always show the business number (the server
 * sets it). Plus pros without a Business Phone number call their clients (from their profile only) and take their
 * clients' calls on Certxa's shared Plus number (GET /api/pro/phone/calling). The call in progress is kept here so the in-call screen can show it (useActiveCall).
 */
import { useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';
import type { Call, CallInvite, Voice } from '@twilio/voice-react-native-sdk';
import { api } from '@/lib/live-api';
import { certxaRequest } from '@/lib/certxa-api';

export type ActiveCall = { call: Call; number: string; incoming: boolean; state: 'calling' | 'ringing' | 'connected'; connectedAt: number | null; muted: boolean; speaker: boolean;
  /** The call screen is set aside (e.g. to look at the client's profile); a bar at the top brings it back. */
  minimized: boolean };

export const voiceSupported = Platform.OS === 'ios';
// Loaded only on iPhone: the native module isn't in the web preview.
const twilioSdk = () => require('@twilio/voice-react-native-sdk') as typeof import('@twilio/voice-react-native-sdk');
let voice: Voice | null = null;
let active: ActiveCall | null = null;
/** Whether this phone makes and takes calls: Business Phone ('line') or Plus calling ('plus'). */
let canCall: boolean | null = null;
const callingMode = async () => (await api.get<{ mode: 'line' | 'plus' | null }>('/api/pro/phone/calling')).mode;
const listeners = new Set<() => void>();
const set = (next: ActiveCall | null) => { active = next; listeners.forEach((l) => l()); };
const patch = (p: Partial<ActiveCall>) => { if (active) set({ ...active, ...p }); };

function sdk(): Voice {
  if (!voice) {
    const { Voice: VoiceSdk, CallInvite: Invite } = twilioSdk();
    voice = new VoiceSdk();
    voice.on(VoiceSdk.Event.CallInvite, (invite: CallInvite) => {
      invite.on(Invite.Event.Accepted, (call: Call) => track(call, invite.getFrom(), true));
    });
  }
  return voice;
}

function track(call: Call, number: string, incoming: boolean) {
  set({ call, number: number.replace(/^client:/, ''), incoming, state: incoming ? 'connected' : 'calling', connectedAt: incoming ? Date.now() : null, muted: false, speaker: false, minimized: false });
  const { Call: CallSdk } = twilioSdk();
  call.on(CallSdk.Event.Ringing, () => patch({ state: 'ringing' }));
  call.on(CallSdk.Event.Connected, () => patch({ state: 'connected', connectedAt: Date.now() }));
  call.on(CallSdk.Event.Disconnected, () => { if (active?.call === call) set(null); });
  call.on(CallSdk.Event.ConnectFailure, () => { if (active?.call === call) set(null); });
}

// Which Apple push service this build's VoIP token belongs to (eas.json: preview-dev is signed with a development
// profile, the others with distribution ones); the server picks the matching Twilio push credential, or calls never ring.
const APNS = process.env.EXPO_PUBLIC_APNS_ENV === 'production' ? 'production' : 'development';

async function voiceToken(authToken?: string): Promise<string> {
  const r = authToken
    ? await certxaRequest<{ token: string }>('/api/pro/phone/token', { method: 'POST', body: JSON.stringify({ apns: APNS }) }, authToken)
    : await api.post<{ token: string }>('/api/pro/phone/token', { apns: APNS });
  return r.token;
}

/**
 * At launch: let iOS hand incoming-call pushes to the SDK (it must happen on every launch, before any push), and
 * pick up a call that was answered from the lock screen before the app had started.
 */
export async function prepareVoice(): Promise<void> {
  if (!voiceSupported) return;
  try {
    await sdk().initializePushRegistry();
    // The incoming-call screen (Apple's own, CallKit) shows the caller line Certxa sends with the call, e.g.
    // "Client: Jane Smith · Regular" (routes/businessPhone.ts callerLine), instead of the bare number.
    await sdk().setIncomingCallContactHandleTemplate('${DisplayName}');
    for (const call of (await sdk().getCalls()).values()) if (!active) track(call, call.getFrom() ?? '', true);
  } catch { /* calls still work once registered */ }
}

/** Signed in with a business number or Plus: ring this phone for calls. Safe to call on every launch. */
export async function registerBusinessPhone(): Promise<boolean> {
  if (!voiceSupported) return false;
  try {
    canCall = !!(await callingMode());
    if (!canCall) return false;
    await sdk().register(await voiceToken());
    return true;
  } catch {
    return false;
  }
}

/** At sign-out: stop ringing this phone. `authToken` is the session being closed. */
export async function unregisterBusinessPhone(authToken: string | null): Promise<void> {
  canCall = null;
  if (!voiceSupported || !authToken) return;
  try { await sdk().unregister(await voiceToken(authToken)); } catch { /* no number, or offline */ }
}

/** Call a number from the business number. */
export async function placeCall(number: string): Promise<void> {
  if (!voiceSupported) throw new Error('Calls from your business number work on iPhone.');
  const digits = number.replace(/\D/g, '');
  const call = await sdk().connect(await voiceToken(), { params: { To: digits }, contactHandle: number, notificationDisplayName: number });
  track(call, number, false);
}

/**
 * Call a client: from the business number, or the Plus number (iPhone), otherwise the phone's own dialer.
 */
export async function callClient(number: string): Promise<void> {
  if (voiceSupported) {
    if (canCall === null) {
      try { canCall = !!(await callingMode()); } catch { canCall = false; }
    }
    if (canCall) return placeCall(number);
  }
  await Linking.openURL(`tel:${number.replace(/[^\d+]/g, '')}`);
}

export async function hangUp() { await active?.call.disconnect(); }
export async function toggleMute() {
  if (!active) return;
  patch({ muted: await active.call.mute(!active.muted) });
}
export async function toggleSpeaker() {
  if (!active) return;
  const { audioDevices } = await sdk().getAudioDevices();
  const { AudioDevice } = twilioSdk();
  const want = active.speaker ? AudioDevice.Type.Earpiece : AudioDevice.Type.Speaker;
  const device = audioDevices.find((d) => d.type === want);
  if (!device) return;
  await device.select();
  patch({ speaker: !active.speaker });
}
export function setCallMinimized(minimized: boolean) { patch({ minimized }); }
export async function sendDigits(digits: string) { await active?.call.sendDigits(digits); }

export function useActiveCall(): ActiveCall | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => active);
}
