/**
 * How this device takes card payments (owner, 2026-11-20): Tap to Pay on the phone itself, or the Stripe M2 card reader.
 * Chosen per device under Settings › Card payments (a pro's phone and tablet can differ); a tablet always uses the M2.
 * Checkout's Card goes to the tip, and the tip starts this one (app/(tabs)/checkout.native.tsx).
 *
 * Whether this device can do Tap to Pay at all (Android needs NFC) is Stripe's answer, kept here once known
 * (lib/tapToPaySupport): an Android phone without NFC can't choose it.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CardMethod = 'tap_to_pay' | 'm2';
const METHOD_KEY = 'checkout.cardMethod';
const SUPPORT_KEY = 'checkout.tapToPaySupported';

let method: CardMethod | null | undefined;
let tapSupported: boolean | null | undefined;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

async function load() {
  if (method !== undefined && tapSupported !== undefined) return;
  try {
    const [m, t] = await Promise.all([AsyncStorage.getItem(METHOD_KEY), AsyncStorage.getItem(SUPPORT_KEY)]);
    method = m === 'tap_to_pay' || m === 'm2' ? m : null;
    tapSupported = t === '1' ? true : t === '0' ? false : null;
  } catch { method = method ?? null; tapSupported = tapSupported ?? null; }
  changed();
}

export function setCardMethod(next: CardMethod) {
  method = next; changed();
  void AsyncStorage.setItem(METHOD_KEY, next).catch(() => undefined);
}

/** Stripe's answer to "can this device do Tap to Pay"; without it, Tap to Pay can't be the card method. */
export function setTapToPaySupported(ok: boolean) {
  tapSupported = ok;
  if (!ok && method === 'tap_to_pay') { method = null; void AsyncStorage.removeItem(METHOD_KEY).catch(() => undefined); }
  changed();
  void AsyncStorage.setItem(SUPPORT_KEY, ok ? '1' : '0').catch(() => undefined);
}

/** [the chosen method or null, Tap to Pay support (null = not known yet)]. */
export function useCardMethod(): [CardMethod | null, boolean | null] {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick((n) => n + 1);
    listeners.add(l);
    void load();
    return () => { listeners.delete(l); };
  }, []);
  return [method ?? null, tapSupported ?? null];
}
