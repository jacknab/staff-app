/** Website messages in the app (owner, 2026-11-07): the inbox's shapes and helpers (app/inbox, Home's envelope). */
import { api } from '@/lib/live-api';

export type InboxThread = {
  id: number; clientName: string; clientEmail: string; subject: string; unread: number;
  lastMessageAt: string; lastSender: 'client' | 'pro' | null; snippet: string;
};

/** Today: the time. Before: the date. */
export const when = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Unread client messages, for the envelope's count. 0 when it can't be read. */
export async function unreadInboxCount(): Promise<number> {
  const r = await api.get<{ count?: number }>('/api/pro/messages/unread').catch(() => null);
  return Number(r?.count ?? 0) || 0;
}
