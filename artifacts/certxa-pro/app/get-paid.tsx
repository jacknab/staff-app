/**
 * "Get paid": set up card payments (Tap to Pay on iPhone and the Stripe M2 reader) without leaving the app.
 * Shown right after sign-up, and from the reminders on the home and checkout screens and from Settings.
 * The setup itself is Stripe's own hosted form (lib/payments-setup.ts).
 */
import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { canTakeCards, getPaymentStatus, runPaymentsSetup, type PaymentStatus } from '@/lib/payments-setup';
import { api } from '@/lib/live-api';
import { useBookingData } from '@/contexts/BookingContext';
import { validTimeZone } from '@/lib/businessTime';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { look } from '@/components/look/tokens';
type Address = { address: string; city: string; state: string; postcode: string };
type Store = Partial<Address> & { id: number };

/** Stripe needs where the business takes payments (its Terminal location, which Tap to Pay requires). */
const addressComplete = (a: Partial<Address> | null | undefined) =>
  Boolean(a?.address?.trim() && a.city?.trim() && /^[A-Za-z]{2}$/.test(a.state?.trim() ?? '') && /^\d{5}$/.test(a.postcode?.trim() ?? ''));

type Stage = 'loading' | 'intro' | 'address' | 'working' | 'more' | 'ready' | 'error';

export default function GetPaidScreen() {
  const { setTimeZone, refresh: refreshCalendar } = useBookingData();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // from=signup: the person just made their account, so "Not now" goes on to the app, not back.
  const { from } = useLocalSearchParams<{ from?: string }>();
  const [stage, setStage] = useState<Stage>('loading');
  const [error, setError] = useState('');
  const [store, setStore] = useState<Store | null>(null);
  const [draft, setDraft] = useState<Address>({ address: '', city: '', state: '', postcode: '' });
  // A home studio's address, or a house-calls-only professional's base address, is never shown to clients.
  const [ownPlace, setOwnPlace] = useState<'salon' | 'home' | 'none'>('salon');

  const show = (status: PaymentStatus) => setStage(canTakeCards(status) ? 'ready' : status.connected ? 'more' : 'intro');

  useEffect(() => {
    getPaymentStatus().then(show).catch(() => setStage('intro'));
    api.get<{ ownPlace?: 'salon' | 'home' | 'none' }>('/api/work-places').then((p) => { if (p?.ownPlace) setOwnPlace(p.ownPlace); }).catch(() => undefined);
    api.get<Store[]>('/api/stores').then((rows) => {
      const first = Array.isArray(rows) ? rows[0] ?? null : null;
      setStore(first);
      if (first) setDraft({ address: first.address ?? '', city: first.city ?? '', state: first.state ?? '', postcode: first.postcode ?? '' });
    }).catch(() => undefined);
  }, []);

  const openStripe = useCallback(async () => {
    setError('');
    setStage('working');
    try {
      show(await runPaymentsSetup());
    } catch (cause: any) {
      setError(cause?.message ?? 'We couldn’t open payment setup. Check your connection and try again.');
      setStage('error');
    }
  }, []);

  // The business address comes first when it's missing: Stripe's account and its Tap to Pay location are
  // made with it, and a business with no address would otherwise get a placeholder one.
  const start = useCallback(async () => {
    // The business may not have loaded yet (slow connection): load it now rather than skip the address.
    let current = store;
    if (!current) {
      const rows = await api.get<Store[]>('/api/stores').catch(() => null);
      current = Array.isArray(rows) ? rows[0] ?? null : null;
      if (current) {
        setStore(current);
        setDraft({ address: current.address ?? '', city: current.city ?? '', state: current.state ?? '', postcode: current.postcode ?? '' });
      }
    }
    if (current && !addressComplete(current)) { setError(''); setStage('address'); return; }
    void openStripe();
  }, [store, openStripe]);

  const saveAddress = useCallback(async () => {
    const next = { address: draft.address.trim(), city: draft.city.trim(), state: draft.state.trim().toUpperCase(), postcode: draft.postcode.trim() };
    if (!addressComplete(next)) { setError('Enter the street address, city, 2-letter state and 5-digit ZIP code.'); return; }
    if (!store) return;
    setError('');
    setStage('working');
    try {
      const updated = await api.patch<Store & { timezone?: string | null }>(`/api/stores/${store.id}`, next);
      setStore(updated);
      // Certxa sets the time zone from the address; the calendar follows it.
      if (updated.timezone) { setTimeZone(validTimeZone(updated.timezone)); void refreshCalendar(); }
      await openStripe();
    } catch (cause: any) {
      setError(cause?.message ?? 'We couldn’t save your address. Check your connection and try again.');
      setStage('address');
    }
  }, [draft, store, openStripe]);

  const leave = () => (from === 'signup' || !router.canGoBack() ? router.replace('/(tabs)') : router.back());
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const text = { color: colors.foreground };
  const muted = { color: colors.mutedForeground };

  const primary = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity onPress={onPress} style={[styles.button, { backgroundColor: colors.primary }]} testID={testID}>
      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
  const secondary = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity onPress={onPress} style={styles.secondary} testID={testID}>
      <Text style={[styles.secondaryText, muted]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: look.pageTop }}>
      <AppBackground />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: topInset + 18, paddingBottom: insets.bottom + 28 }]}>
      {from !== 'signup' && (
        <TouchableOpacity accessibilityLabel="Back" onPress={leave} style={styles.back} testID="get-paid-back">
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
      )}
      <Text style={[styles.eyebrow, { color: colors.primary }]}>GET PAID</Text>

      {stage === 'loading' || stage === 'working' ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.body, muted, { marginTop: 14 }]}>{stage === 'working' ? 'Opening Stripe…' : 'Checking your payments…'}</Text>
        </View>
      ) : stage === 'address' ? (
        <>
          <HelpTitle help="get-paid" style={[styles.title, text]}>{ownPlace === 'salon' ? 'Where do you work?' : 'Your base address'}</HelpTitle>
          <Text style={[styles.body, muted]}>{ownPlace === 'home'
            ? 'Stripe needs your address to set up card payments and Tap to Pay. It stays private: clients see your city only, and get the full address once they have booked.'
            : ownPlace === 'none'
              ? 'Stripe needs your address to set up card payments and Tap to Pay. Clients never see it. House calls are measured from it.'
              : 'Stripe needs your business address to set up card payments and Tap to Pay. Clients see it on your booking website.'}</Text>
          <View style={styles.form}>
            {([['address', 'Street address', '123 Main Street'], ['city', 'City', 'City']] as const).map(([key, label, placeholder]) => (
              <View key={key}>
                <Text style={[styles.label, text]}>{label}</Text>
                <TextInput autoCapitalize="words" onChangeText={(v) => setDraft((d) => ({ ...d, [key]: v }))} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID={`get-paid-${key}`} value={draft[key]} />
              </View>
            ))}
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, text]}>State</Text>
                <TextInput autoCapitalize="characters" maxLength={2} onChangeText={(v) => setDraft((d) => ({ ...d, state: v }))} placeholder="CA" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="get-paid-state" value={draft.state} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, text]}>ZIP code</Text>
                <TextInput keyboardType="number-pad" maxLength={5} onChangeText={(v) => setDraft((d) => ({ ...d, postcode: v }))} placeholder="90001" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="get-paid-postcode" value={draft.postcode} />
              </View>
            </View>
          </View>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <View style={styles.actions}>
            {primary('Continue', () => void saveAddress(), 'get-paid-save-address')}
            {secondary(from === 'signup' ? 'Not now' : 'Later', leave, 'get-paid-address-later')}
          </View>
        </>
      ) : stage === 'ready' ? (
        <>
          <HelpTitle help="get-paid" style={[styles.title, text]}>You’re ready to take cards</HelpTitle>
          <Text style={[styles.body, muted]}>When a client is done, open their appointment and tap Check Out to take payment with Tap to Pay on your iPhone or the Stripe M2 reader. Your money is paid out to your bank account.</Text>
          <View style={styles.actions}>
            {/* Checkout is reached only from an appointment's Check Out (owner's rule, 2026-10-13), never a shortcut. */}
            {primary('Go to my calendar', () => router.replace('/calendar'), 'get-paid-done')}
          </View>
        </>
      ) : stage === 'more' ? (
        <>
          <HelpTitle help="get-paid" style={[styles.title, text]}>Stripe needs a few more details</HelpTitle>
          <Text style={[styles.body, muted]}>Finish setting up with Stripe to start taking cards. It picks up where you left off.</Text>
          <View style={styles.actions}>
            {primary('Continue setup', () => void start(), 'get-paid-continue')}
            {secondary(from === 'signup' ? 'Not now' : 'Later', leave, 'get-paid-later')}
          </View>
        </>
      ) : (
        <>
          <HelpTitle help="get-paid" style={[styles.title, text]}>Take card payments</HelpTitle>
          <Text style={[styles.body, muted]}>Set up payments once and take cards from your clients right in the app.</Text>
          <View style={styles.points}>
            {[
              ['Tap to Pay on iPhone', 'Clients tap their card or phone on your iPhone. No extra hardware.'],
              ['Paid to your bank', 'Card payments are paid out to your bank account.'],
              ['About five minutes', 'Stripe asks for your details and bank account once.'],
            ].map(([title, line]) => (
              <View key={title} style={[styles.point, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.pointTitle, text]}>{title}</Text>
                <Text style={[styles.pointLine, muted]}>{line}</Text>
              </View>
            ))}
          </View>
          {stage === 'error' && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
          <View style={styles.actions}>
            {primary('Set up payments', () => void start(), 'get-paid-start')}
            {secondary('Not now', leave, 'get-paid-not-now')}
          </View>
          <Text style={[styles.fine, muted]}>Payments are processed by Stripe for Certxa.</Text>
        </>
      )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: { width: 42, height: 42, justifyContent: 'center', marginLeft: -8, marginBottom: 10 },
  eyebrow: { fontSize: 13, letterSpacing: 1.6, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 30, letterSpacing: -0.9, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  body: { fontSize: 17, lineHeight: 26, fontFamily: 'Inter_400Regular', marginTop: 10 },
  center: { alignItems: 'center', marginTop: 80 },
  points: { gap: 10, marginTop: 24 },
  point: { borderWidth: 1, borderRadius: 14, padding: 14 },
  pointTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  pointLine: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 4 },
  error: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium', marginTop: 16 },
  form: { gap: 16, marginTop: 24 },
  pair: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontSize: 17, fontFamily: 'Inter_400Regular' },
  actions: { gap: 6, marginTop: 28 },
  button: { height: 53, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  secondary: { height: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  fine: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 18, textAlign: 'center' },
});
