/**
 * The tablet POS sets the Stripe M2 reader up by itself (owner, 2026-11-19: no settings for the pro to go through). When
 * the POS opens it asks for the permissions the reader needs (Android shows its own Allow box once; if they were refused,
 * it offers the settings page), then finds the M2 over Bluetooth and connects it, so CARD starts at once. Quietly gives up
 * when card payments aren't set up or no reader is near; CARD can still find one then.
 */
import { useEffect, useRef } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { requestNeededAndroidPermissions, useStripeTerminal, type Reader } from '@stripe/stripe-terminal-react-native';
import { getStoredToken, getTerminalLocation } from '@/lib/certxa-api';

const SEARCH_MS = 30_000;

export function useReaderSetup(enabled: boolean, say: (text: string, tone?: 'info' | 'ok' | 'error') => void) {
  const started = useRef(false);
  const sayRef = useRef(say);
  sayRef.current = say;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const connecting = useRef(false);
  const locationId = useRef<string | null>(null);
  const { initialize, discoverReaders, connectReader, cancelDiscovering, connectedReader } = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers: Reader.Type[]) => {
      const reader = readers[0];
      if (!reader || connecting.current || !locationId.current) return;
      connecting.current = true;
      connectReader({ discoveryMethod: 'bluetoothScan', reader, locationId: locationId.current, autoReconnectOnUnexpectedDisconnect: true })
        .then((r) => { if (!r.error) sayRef.current('CARD READER CONNECTED', 'ok'); })
        .catch(() => undefined)
        .finally(() => { connecting.current = false; void cancelDiscovering().catch(() => undefined); });
    },
  });

  useEffect(() => {
    if (!enabled || started.current || connectedReader) return;
    started.current = true;
    void (async () => {
      if (Platform.OS === 'android') {
        const allowed = await requestNeededAndroidPermissions({ accessFineLocation: {
          title: 'Location for card payments', message: 'Stripe needs your location to take card payments with the card reader.', buttonPositive: 'Allow',
        } }).catch(() => ({ error: { message: 'refused' } }));
        if (allowed.error) {
          Alert.alert('Card reader', 'To use the Stripe card reader, allow Location and Nearby devices for Certxa Pro.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open settings', onPress: () => void Linking.openSettings() },
          ]);
          return;
        }
      }
      const init = await initialize();
      if (init.error) return;
      const token = await getStoredToken();
      if (!token) return;
      // No card payments set up for this business: nothing to connect.
      const location = await getTerminalLocation(token).catch(() => null);
      if (!location?.locationId) return;
      locationId.current = location.locationId;
      timer.current = setTimeout(() => { if (!connecting.current) void cancelDiscovering().catch(() => undefined); }, SEARCH_MS);
      await discoverReaders({ discoveryMethod: 'bluetoothScan', simulated: false }).catch(() => undefined);
    })().catch(() => undefined);
    // Runs once: the search limit above is not reset by the POS redrawing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, connectedReader]);
}
