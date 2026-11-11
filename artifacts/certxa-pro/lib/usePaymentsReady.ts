/**
 * Whether the business can take card payments (Stripe set up and charges on), kept fresh when setup finishes
 * (owner, 2026-11-11). null until known: callers let the person through rather than block on a slow or failed check.
 * Used to open a Stripe marketing page in place of POS and Checkout while payments aren't set up.
 */
import { useEffect, useState } from 'react';
import { canTakeCards, getPaymentStatus, onPaymentStatusChange } from '@/lib/payments-setup';

export function usePaymentsReady(): boolean | null {
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    const check = () => { getPaymentStatus().then((s) => { if (live) setReady(canTakeCards(s)); }).catch(() => undefined); };
    check();
    const stop = onPaymentStatusChange(check);
    return () => { live = false; stop(); };
  }, []);
  return ready;
}
