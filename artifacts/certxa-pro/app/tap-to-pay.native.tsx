/**
 * Settings › Enable Tap to Pay on iPhone (owner, 2026-10-30).
 *
 * Turns on Tap to Pay for this iPhone ahead of the first sale: connects to Tap to Pay once, which is when Apple
 * shows its Tap to Pay terms to accept (the first time only). After that the checkout connects without asking.
 * The connection is closed again when this screen closes, so the checkout always starts its own.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { getStoredToken, getTerminalLocation } from '@/lib/certxa-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
const ENABLED_KEY = 'certxa.tapToPay.enabled';
type State = 'idle' | 'connecting' | 'ready' | 'error';

export default function TapToPayScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');
  const [enabledBefore, setEnabledBefore] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const connecting = useRef(false);

  const { initialize, discoverReaders, connectReader, disconnectReader, cancelDiscovering, discoveredReaders, connectedReader } = useStripeTerminal({
    onUpdateDiscoveredReaders: () => undefined,
  });

  useEffect(() => {
    AsyncStorage.getItem(ENABLED_KEY).then((v) => setEnabledBefore(v === '1')).catch(() => undefined);
    api.get<Array<{ name?: string | null }>>('/api/stores').then((rows) => { if (rows?.[0]?.name) setBusinessName(String(rows[0].name)); }).catch(() => undefined);
  }, []);

  // Leaving the screen: stop looking and close the connection, so the checkout starts cleanly.
  const disconnectRef = useRef({ disconnectReader, cancelDiscovering });
  disconnectRef.current = { disconnectReader, cancelDiscovering };
  useEffect(() => () => {
    void disconnectRef.current.cancelDiscovering().catch(() => undefined);
    void disconnectRef.current.disconnectReader().catch(() => undefined);
  }, []);

  // Tap to Pay found on this iPhone: connect to it (Apple shows its terms here the first time).
  useEffect(() => {
    if (state !== 'connecting' || !locationId || connectedReader || !discoveredReaders[0] || connecting.current) return;
    connecting.current = true;
    connectReader({
      discoveryMethod: 'tapToPay',
      reader: discoveredReaders[0],
      locationId,
      merchantDisplayName: businessName.trim() || 'Certxa Pro',
      tosAcceptancePermitted: true,
    }).then(async (result) => {
      if (result.error) throw new Error(result.error.message);
      await AsyncStorage.setItem(ENABLED_KEY, '1').catch(() => undefined);
      setEnabledBefore(true);
      setState('ready');
      setMessage('Tap to Pay is ready on this iPhone.');
    }).catch((cause) => {
      setState('error');
      setMessage(cause instanceof Error ? cause.message : 'Tap to Pay could not be turned on.');
    }).finally(() => { connecting.current = false; });
  }, [businessName, connectReader, connectedReader, discoveredReaders, locationId, state]);

  const enable = useCallback(async () => {
    setState('connecting');
    setMessage('Connecting…');
    try {
      const init = await initialize();
      if (init.error) throw new Error(init.error.message);
      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
      const location = await getTerminalLocation(token);
      setLocationId(location.locationId);
      const found = await discoverReaders({ discoveryMethod: 'tapToPay', simulated: false });
      if (found.error) throw new Error(found.error.message);
    } catch (cause) {
      setState('error');
      setMessage(cause instanceof Error ? cause.message : 'Tap to Pay could not be turned on.');
    }
  }, [discoverReaders, initialize]);

  const busy = state === 'connecting';
  const ready = state === 'ready';
  const status = ready ? 'Ready' : busy ? 'Connecting…' : state === 'error' ? message : enabledBefore ? 'Turned on for this iPhone' : 'Not turned on yet';

  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="tap-to-pay-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          style={[styles.back, { backgroundColor: colors.card }]} accessibilityLabel="Back">
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          Accept contactless payments with only an iPhone. Tap to Pay on iPhone requires an iPhone XS or later and iOS 16.4 or later.
        </Text>
        <View testID="tap-to-pay-card" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardTop}>
            <HelpTitle help="tap-to-pay" style={[styles.cardTitle, { color: colors.foreground }]}>Tap to Pay on iPhone</HelpTitle>
            {busy ? <ActivityIndicator size="small" color={colors.primary} /> : ready || (enabledBefore && state === 'idle') ? <Feather name="check-circle" size={20} color={colors.primary} /> : null}
          </View>
          <Text testID="tap-to-pay-status" style={[styles.status, { color: state === 'error' ? colors.destructive : colors.mutedForeground }]}>{status}</Text>
        </View>
        {!ready ? (
          <TouchableOpacity testID="tap-to-pay-enable" disabled={busy} onPress={() => void enable()}
            style={[styles.button, { backgroundColor: busy ? colors.muted : colors.primary }]}>
            <Text style={[styles.buttonText, { color: busy ? colors.mutedForeground : colors.primaryForeground }]}>
              {busy ? 'Connecting…' : enabledBefore ? 'Check Tap to Pay' : 'Turn on Tap to Pay'}
            </Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.help, { color: colors.mutedForeground }]}>
          To take a payment, open POS, enter the amount and choose the client, then ask the client to hold their card or phone near the top of your iPhone.
        </Text>
        <Text style={[styles.help, { color: colors.mutedForeground }]}>
          Card payments need your payment account set up first (Settings › Stripe account).
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 14, paddingVertical: 6 },
  back: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 40, gap: 16 },
  intro: { fontSize: 17, lineHeight: 24, textAlign: 'center', fontFamily: 'Inter_400Regular', paddingHorizontal: 8 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, gap: 6, ...cardShadow },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  status: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  help: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular' },
});
