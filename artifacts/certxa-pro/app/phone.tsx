/**
 * Business Phone (owner, 2026-11-04): a phone number for the business, on Certxa's Twilio account.
 * Setup: Business Phone is paid first (owner, 2026-11-11): the first month of the $10/month is charged to the card on
 * file (POST /api/pro/phone/subscribe); only then are five local numbers shown (the circle arrows show five others),
 * and tapping one buys it with that paid month and wires it up (GET /api/pro/phone/available, POST /api/pro/phone/claim). After that: the number, a dialer, texts received, and
 * recent calls. When it rings and blocked numbers are in Settings › Business Phone.
 * Changing the number (?change=1, from Settings after its warning) uses the same picker: $5 is charged to the card on
 * file, the new number is bought and wired, and the old one is released (POST /api/pro/phone/change). A missed call is tapped to call back. Calls work on iPhone (lib/voice.ts).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Keypad } from '@/components/Keypad';
import { api, ApiError } from '@/lib/live-api';
import { placeCall, registerBusinessPhone } from '@/lib/voice';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { SectionTitle } from '@/components/look/SectionHeader';
import { look, cardShadow } from '@/components/look/tokens';
type Line = { phoneNumber: string; ring: 'hours' | 'always'; billing?: { status: string; retryAt: string | null; heldUntil: string | null } };
type Card = { brand: string | null; last4: string | null };
const cardName = (c: Card) => (c.last4 ? `your ${c.brand ? c.brand[0].toUpperCase() + c.brand.slice(1) : 'card'} ending ${c.last4}` : 'your card on file');
const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
type Offer = { phoneNumber: string; display: string; place: string };
type CallRow = { id: number; direction: 'incoming' | 'outgoing'; number: string; display: string; clientName: string | null; status: string; durationSeconds: number | null; at: string };
const pretty = (n: string) => { const d = n.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };

export default function PhoneScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [changing, setChanging] = useState(useLocalSearchParams<{ change?: string }>().change === '1');
  const [line, setLine] = useState<Line | null | undefined>(undefined);
  /** No number yet: whether the first month is paid, so the numbers can be shown. */
  const [prepaid, setPrepaid] = useState<boolean | undefined>(undefined);
  const [paying, setPaying] = useState(false);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [textCount, setTextCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Setup
  const [areaCode, setAreaCode] = useState('');
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const seen = useRef<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState('');
  // Dialer
  const [dialing, setDialing] = useState(false);
  const [digits, setDigits] = useState('');

  const load = useCallback(async () => {
    try {
      const l = await api.get<Line | null>('/api/pro/phone');
      setLine(l);
      if (!l) setPrepaid((await api.get<{ prepaid?: boolean }>('/api/pro/phone/pricing')).prepaid === true);
      if (l) {
        const [c, t] = await Promise.all([api.get<CallRow[]>('/api/pro/phone/calls'), api.get<unknown[]>('/api/pro/phone/texts')]);
        setCalls(c); setTextCount(t.length);
      }
    } catch { setLine((l) => (l === undefined ? null : l)); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const search = useCallback(async (code: string, others: boolean) => {
    setSearching(true); setError('');
    if (!others) seen.current = [];
    try {
      const q = new URLSearchParams({ ...(code.length === 3 ? { areaCode: code } : {}), ...(seen.current.length ? { exclude: seen.current.join(',') } : {}) });
      const r = await api.get<{ areaCode: string | null; numbers: Offer[] }>(`/api/pro/phone/available?${q}`);
      if (r.areaCode && !code) setAreaCode(r.areaCode);
      seen.current = [...seen.current, ...r.numbers.map((n) => n.phoneNumber)];
      setOffers(r.numbers);
      if (!r.numbers.length) setError(others ? 'No other numbers here right now. Try another area code.' : 'No numbers in that area code right now. Try another one.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Numbers could not be loaded. Try again.');
    } finally { setSearching(false); }
  }, []);
  useEffect(() => { if (((line === null && prepaid) || (line && changing)) && offers === null) void search('', false); }, [line, prepaid, changing, offers, search]);

  /** The card on file for a charge, or null; with none, offer certxa.com's Add a card page first. */
  const cardFor = async (why: string): Promise<{ card: Card; monthlyCents: number; changeFeeCents: number } | null> => {
    type Pricing = { monthlyCents: number; changeFeeCents: number; card: Card | null };
    let info = await api.get<Pricing>('/api/pro/phone/pricing');
    if (!info.card) {
      const add = await new Promise<boolean>((resolve) => Alert.alert('Add a card', `${why} Add a card to pay for it, then choose your number again.`, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Add a card', onPress: () => resolve(true) }]));
      if (!add) return null;
      const { url } = await api.post<{ url: string }>('/api/solo/credits/web-link', { card: true });
      await WebBrowser.openAuthSessionAsync(url, 'certxa-pro://phone');
      info = await api.get<Pricing>('/api/pro/phone/pricing');
      if (!info.card) return null;
    }
    return { card: info.card, monthlyCents: info.monthlyCents, changeFeeCents: info.changeFeeCents };
  };

  /** Changing the number: the card on file pays the $5. */
  const change = async (offer: Offer) => {
    const got = await cardFor('Changing your number costs $5.');
    if (!got) return;
    const info = { feeCents: got.changeFeeCents, card: got.card };
    const fee = `$${(info.feeCents / 100).toFixed(0)}`;
    const card = cardName(info.card);
    Alert.alert(`Make ${offer.display} your new number?`, `${fee} will be charged to ${card}, and ${line ? pretty(line.phoneNumber) : 'your old number'} will be released.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: `Pay ${fee}`, onPress: async () => {
        setClaiming(offer.phoneNumber); setError('');
        try {
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const r = await api.post<{ phoneNumber: string }>('/api/pro/phone/change', { phoneNumber: offer.phoneNumber, idempotencyKey: key });
          setChanging(false); setOffers(null);
          await load();
          Alert.alert('Number changed', `Your business number is now ${pretty(r.phoneNumber)}.`);
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'Your number could not be changed. Try again.');
          void search(areaCode, true);
        } finally { setClaiming(null); }
      } },
    ]);
  };

  /** Getting Business Phone: $10/month, the first month charged now to the card on file, before the numbers show. */
  const pay = async () => {
    const got = await cardFor('Business Phone is $10/month.');
    if (!got) return;
    const price = `$${(got.monthlyCents / 100).toFixed(0)}`;
    Alert.alert(`Get Business Phone for ${price}/month?`, `${price} will be charged today to ${cardName(got.card)}, then every month. Then you choose your number. Cancel any time in Settings.`, [
      { text: 'Not now', style: 'cancel' },
      { text: `Pay ${price}`, onPress: async () => {
        setPaying(true); setError('');
        try {
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          await api.post('/api/pro/phone/subscribe', { idempotencyKey: key });
          setPrepaid(true);
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'The payment could not be made. Try again.');
        } finally { setPaying(false); }
      } },
    ]);
  };

  /** Paid but no number chosen yet: cancel and get the $10 back. */
  const cancelPaid = () => Alert.alert('Cancel Business Phone?', 'Your $10 will be refunded to your card. It can take 5–10 days to show.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Cancel and refund', style: 'destructive', onPress: async () => {
      setPaying(true); setError('');
      try {
        await api.post('/api/pro/phone/subscribe/cancel', {});
        setPrepaid(false); setOffers(null);
        Alert.alert('Refunded', 'Business Phone is cancelled and your $10 is on its way back to your card.');
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'The refund could not be made. Try again.');
      } finally { setPaying(false); }
    } },
  ]);

  /** Choosing the number, with the month already paid. */
  const subscribe = async (offer: Offer) => {
    Alert.alert(`Make ${offer.display} your business number?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Choose', onPress: async () => {
        setClaiming(offer.phoneNumber); setError('');
        try {
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          setLine(await api.post<Line>('/api/pro/phone/claim', { phoneNumber: offer.phoneNumber, idempotencyKey: key }));
          void registerBusinessPhone();
          await load();
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'That number could not be set up. Try again.');
          void search(areaCode, true);
        } finally { setClaiming(null); }
      } },
    ]);
  };
  const claim = (offer: Offer) => void (changing ? change(offer) : subscribe(offer)).catch(() => setError('Something went wrong. Try again.'));

  const call = (number: string, label?: string) => Alert.alert(`Call ${label ?? pretty(number)}?`, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Call', onPress: () => { placeCall(number).catch((cause) => Alert.alert('Call', cause instanceof Error ? cause.message : 'The call could not be made.')); } },
  ]);


  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const box = { borderColor: colors.border, backgroundColor: colors.card };
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="phone">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => (dialing ? setDialing(false) : changing ? (setChanging(false), setOffers(null)) : router.back())} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="phone" style={[styles.navTitle, { color: colors.foreground }]}>{dialing ? 'Call a number' : changing ? 'Change number' : 'Business Phone'}</HelpTitle>
        <View style={styles.navSide} />
      </View>

      {line === undefined || (line === null && prepaid === undefined) ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
        : line === null && !prepaid ? (
          <ScrollView contentContainerStyle={styles.content}>
            <HelpTitle help="phone" style={[styles.title, { color: colors.foreground }]}>Get Business Phone</HelpTitle>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>A phone number for your business. Clients call and text this number, and your calls out show it, so your own number stays private.</Text>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>Business Phone is $10/month. After you pay, you choose your number.</Text>
            <TouchableOpacity onPress={() => void pay().catch(() => setError('Something went wrong. Try again.'))} disabled={paying} style={[styles.button, { backgroundColor: colors.primary }]} testID="phone-pay">
              {paying ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Pay $10/month</Text>}
            </TouchableOpacity>
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
          </ScrollView>
        ) : line === null || changing ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <HelpTitle help="phone" style={[styles.title, { color: colors.foreground }]}>{changing ? 'Choose your new number' : 'Choose your business number'}</HelpTitle>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>{changing && line ? `Your new number replaces ${pretty(line.phoneNumber)}. Changing costs $5.` : 'Your first month is paid. Choose the number clients will call and text.'}</Text>
            <TextInput value={areaCode} onChangeText={(t) => { const code = t.replace(/\D/g, '').slice(0, 3); setAreaCode(code); if (code.length === 3) void search(code, false); }}
              keyboardType="number-pad" maxLength={3} placeholder="Area code" placeholderTextColor={colors.mutedForeground}
              style={[styles.input, box, { color: colors.foreground }]} testID="phone-area-code" />
            <View style={styles.listHead}>
              <SectionTitle style={styles.section}>Numbers</SectionTitle>
              <TouchableOpacity onPress={() => void search(areaCode, true)} disabled={searching} style={styles.recycle} accessibilityLabel="Show 5 other numbers" testID="phone-more-numbers">
                {searching ? <ActivityIndicator color={colors.primary} /> : <Feather name="refresh-cw" size={20} color={colors.primary} />}
              </TouchableOpacity>
            </View>
            {offers == null ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.mutedForeground} /> : offers.length ? (
              <View style={[styles.list, box]}>
                {offers.map((o, i) => (
                  <TouchableOpacity key={o.phoneNumber} onPress={() => claim(o)} disabled={claiming != null} testID={`phone-offer-${i}`}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.number, { color: colors.foreground }]}>{o.display}</Text>
                      {o.place ? <Text style={[styles.muted, { color: colors.mutedForeground }]}>{o.place}</Text> : null}
                    </View>
                    {claiming === o.phoneNumber ? <ActivityIndicator color={colors.primary} /> : <Feather name="chevron-right" size={20} color={colors.mutedForeground} />}
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
            {line === null && !changing ? (
              <TouchableOpacity onPress={cancelPaid} disabled={paying || claiming != null} style={styles.cancelPaid} testID="phone-cancel-paid">
                {paying ? <ActivityIndicator color={colors.mutedForeground} /> : <Text style={[styles.muted, { color: colors.mutedForeground }]}>Cancel and refund my $10</Text>}
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        ) : dialing ? (
          <View style={[styles.dialer, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.dialDisplay}>
              <Text style={styles.dialNumber} numberOfLines={1} adjustsFontSizeToFit>{digits ? pretty(digits) : ' '}</Text>
            </View>
            <View style={{ gap: 16 }}>
              <Keypad onPress={(k) => setDigits((d) => (d.length < 15 ? d + k : d))} />
              <View style={styles.dialBottom}>
                <View style={styles.dialSide} />
                <TouchableOpacity testID="phone-dial-call" disabled={digits.replace(/\D/g, '').length < 10} activeOpacity={0.7}
                  onPress={() => { placeCall(digits).then(() => { setDialing(false); setDigits(''); }).catch((cause) => Alert.alert('Call', cause instanceof Error ? cause.message : 'The call could not be made.')); }}
                  style={styles.callButton} accessibilityLabel="Call">
                  <MaterialCommunityIcons name="phone" size={38} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.dialSide}>
                  {digits ? <TouchableOpacity onPress={() => setDigits((d) => d.slice(0, -1))} onLongPress={() => setDigits('')} accessibilityLabel="Delete" style={styles.backspace}>
                    <MaterialCommunityIcons name="backspace" size={30} color="#C7C7CC" />
                  </TouchableOpacity> : null}
                </View>
              </View>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
            <View style={[styles.card, box]}>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>Your business number</Text>
              <Text style={[styles.bigNumber, { color: colors.foreground }]} selectable>{pretty(line.phoneNumber)}</Text>
              {line.billing?.status === 'held' ? <Text style={[styles.muted, { color: colors.destructive }]}>Paused: the payment didn't go through. Pay in Settings › Business Phone by {dateOf(line.billing.heldUntil)} to keep this number.</Text>
                : line.billing?.status === 'past_due' ? <Text style={[styles.muted, { color: colors.destructive }]}>The payment didn't go through. We'll try again {dateOf(line.billing.retryAt)}, or pay in Settings › Business Phone.</Text> : null}
            </View>
            <TouchableOpacity onPress={() => setDialing(true)} style={[styles.button, { backgroundColor: colors.primary }]} testID="phone-dial">
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Call a number</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/phone-texts')} style={[styles.row, styles.list, box]} testID="phone-texts">
              <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Texts</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>{textCount ? `${textCount} received` : 'Texts to your business number show here'}</Text></View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <SectionTitle style={styles.section}>Recent calls</SectionTitle>
            {calls.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground }]}>No calls yet.</Text> : (
              <View style={[styles.list, box]}>
                {calls.map((c, i) => {
                  const missed = c.status === 'missed';
                  const what = missed ? 'Missed' : c.direction === 'incoming' ? 'Incoming' : c.status === 'answered' ? 'Outgoing' : 'No answer';
                  const length = c.status === 'answered' && c.durationSeconds ? ` · ${Math.max(1, Math.round(c.durationSeconds / 60))} min` : '';
                  return (
                    <TouchableOpacity key={c.id} onPress={() => call(c.number, c.clientName ?? c.display)} testID={`phone-call-${c.id}`}
                      style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <Feather name={missed ? 'phone-missed' : c.direction === 'incoming' ? 'phone-incoming' : 'phone-outgoing'} size={20} color={colors.mutedForeground} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: missed ? colors.destructive : colors.foreground }]}>{c.clientName ?? c.display}</Text>
                        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                          {what}{length} · {new Date(c.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </ScrollView>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12, paddingTop: 6 },
  title: { fontSize: 23, fontFamily: 'Inter_600SemiBold' },
  muted: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  section: { marginTop: 14, marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 14, height: 54, paddingHorizontal: 16, fontSize: 18, fontFamily: 'Inter_400Regular' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recycle: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  number: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 4, ...cardShadow },
  bigNumber: { fontSize: 26, fontFamily: 'Inter_600SemiBold' },
  cancelPaid: { alignSelf: 'center', paddingVertical: 14, paddingHorizontal: 12, marginTop: 8 },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  dialer: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  dialDisplay: { minHeight: 90, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  dialNumber: { fontSize: 40, fontWeight: '400', color: '#000000' },
  dialBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  dialSide: { width: 80, alignItems: 'center' },
  backspace: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  callButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' },
});
