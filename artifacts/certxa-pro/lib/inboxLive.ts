/**
 * Website messages, live (owner, 2026-11-07; server: lib/proMessagesLive.ts). While the pro is signed in and the app
 * is on screen it holds one WebSocket to /ws/pro-messages: that is what "online" means on the client's page. A client
 * message comes in at once with the chime and a banner (a local notification with the app's own sound, so no new
 * build); the server skips the push while the app is connected. Typing goes both ways. The socket closes when the
 * app leaves the screen, so a closed app gets the push as before.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { CERTXA_API_BASE_URL, getStoredToken } from '@/lib/certxa-api';

export type LiveMessage = { id: number; sender: 'client' | 'pro'; body: string; createdAt: string };
export type InboxEvent =
  | { type: 'message'; threadId: number; message: LiveMessage; clientName?: string; subject?: string }
  | { type: 'typing'; threadId: number; from: 'client' | 'pro'; on: boolean }
  | { type: 'read'; threadId: number };

const SOUND = 'soft_chime.wav';
const CHANNEL = 'bookings';
const listeners = new Set<(e: InboxEvent) => void>();
let ws: WebSocket | null = null;
let wanted = false;
let tries = 0;
let retry: ReturnType<typeof setTimeout> | null = null;
let appState: AppStateStatus = AppState.currentState;
/** The switch at the top of the Inbox. Off: the server pushes instead (with its own sound), so no chime here. */
let available = true;

/** The Inbox switch changed (or was read): chime here only while available. */
export function setLiveAvailable(on: boolean) { available = on; }

/** Hear every live event (new messages, typing, read elsewhere). Returns the "stop listening". */
export function onInboxEvent(fn: (e: InboxEvent) => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** "The pro is typing" for a conversation (sent at most every few seconds by the caller). */
export function sendTyping(threadId: number, on: boolean) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'typing', threadId, on }));
}

function chime(e: Extract<InboxEvent, { type: 'message' }>) {
  // Every new client message chimes (owner): a local notification plays the app's own sound, even in the app.
  void Notifications.scheduleNotificationAsync({
    content: {
      title: `Message from ${e.clientName || 'a client'}`,
      body: e.message.body.length > 140 ? `${e.message.body.slice(0, 139)}…` : e.message.body,
      sound: SOUND,
      data: { type: 'web_message', threadId: e.threadId },
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  }).catch(() => undefined);
}

async function connect() {
  if (!wanted || ws || appState !== 'active') return;
  const token = await getStoredToken().catch(() => null);
  if (!token || !wanted || ws || appState !== 'active') return;
  const url = `${CERTXA_API_BASE_URL.replace(/^http/, 'ws')}/ws/pro-messages?as=pro`;
  // React Native's WebSocket takes a third argument with headers (the browser's types don't know it): the app's
  // sign-in goes there, never in the address.
  const NativeSocket = WebSocket as unknown as new (url: string, protocols: null, options: { headers: Record<string, string> }) => WebSocket;
  const sock = new NativeSocket(url, null, { headers: { Authorization: `Bearer ${token}` } });
  ws = sock;
  sock.onopen = () => { tries = 0; };
  sock.onmessage = (ev) => {
    let e: InboxEvent & { available?: boolean }; try { e = JSON.parse(String(ev.data)); } catch { return; }
    if ((e as { type: string }).type === 'ready') { if (typeof e.available === 'boolean') available = e.available; return; }
    if (e.type !== 'message' && e.type !== 'typing' && e.type !== 'read') return;
    if (e.type === 'message' && e.message?.sender === 'client' && available) chime(e);
    for (const fn of listeners) { try { fn(e); } catch { /* a screen's handler */ } }
  };
  sock.onclose = (ev) => {
    if (ws === sock) ws = null;
    if (!wanted || appState !== 'active' || ev.code === 4003) return; // signed out, or the sign-in isn't valid
    retry = setTimeout(() => void connect(), Math.min(30_000, 1_000 * 2 ** tries++));
  };
}

function disconnect() {
  if (retry) { clearTimeout(retry); retry = null; }
  const sock = ws; ws = null;
  sock?.close();
}

AppState.addEventListener('change', (next) => {
  appState = next;
  // On screen: online. Background or closed: away (the server pushes instead).
  if (next === 'active') { tries = 0; void connect(); } else disconnect();
});

/** Signed in: be online while the app is on screen. Signed out: never. */
export function setInboxLive(signedIn: boolean) {
  wanted = signedIn;
  if (signedIn) void connect(); else disconnect();
}
