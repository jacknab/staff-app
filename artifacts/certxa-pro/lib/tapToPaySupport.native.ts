/**
 * Asks Stripe once whether this device can take Tap to Pay (Android: NFC and a recent enough phone; iPhone: XS or
 * later) and keeps the answer (lib/cardMethod.ts). Inside the app's Stripe Terminal provider.
 */
import { useEffect } from 'react';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { setTapToPaySupported, useCardMethod } from '@/lib/cardMethod';

let asking = false;

export function useTapToPaySupport(): boolean | null {
  const [, supported] = useCardMethod();
  const { initialize, supportsReadersOfType } = useStripeTerminal();
  useEffect(() => {
    if (supported != null || asking) return;
    asking = true;
    void (async () => {
      try {
        await initialize();
        const r = await supportsReadersOfType({ deviceType: 'tapToPay', discoveryMethod: 'tapToPay', simulated: false });
        // An error means Stripe couldn't tell yet (not signed in, no network): ask again next time.
        if (!r.error) setTapToPaySupported(!!r.readerSupportResult);
      } catch { /* unknown for now */ }
      finally { asking = false; }
    })();
  }, [supported]); // eslint-disable-line react-hooks/exhaustive-deps
  return supported;
}
