/**
 * The website's one rule for a client's status (shared/clientStatus.ts on the server, owner 2026-10-29), so the app's
 * Clients filters and badges mean the same as the website's.
 *   VIP       — set by hand on the client; always wins
 *   Inactive  — never visited, or not back for 120 days or more
 *   At risk   — has visited, not back for 60 days or more
 *   New       — visited recently, fewer than 3 visits
 *   Regular   — visited recently, 3 visits or more
 */
export const AT_RISK_DAYS = 60;
export const INACTIVE_DAYS = 120;
export const REGULAR_VISITS = 3;

export type ClientStatus = 'new' | 'regular' | 'vip' | 'at_risk' | 'inactive';

export const STATUS_LABEL: Record<ClientStatus, string> = { new: 'New', regular: 'Regular', vip: 'VIP', at_risk: 'At risk', inactive: 'Inactive' };

export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 86_400_000)) : null;
}

export function clientStatusOf(c: { isVip?: boolean; visits: number; lastVisitAt?: string | null }): ClientStatus {
  if (c.isVip) return 'vip';
  const days = daysSince(c.lastVisitAt);
  if (days == null || c.visits === 0 || days >= INACTIVE_DAYS) return 'inactive';
  if (days >= AT_RISK_DAYS) return 'at_risk';
  return c.visits < REGULAR_VISITS ? 'new' : 'regular';
}
