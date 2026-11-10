/**
 * Gift cards (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): sell one (the client pays you as usual — Mark
 * as paid / card — and you hand over the code), look up a code and take an amount off it, and see every card with
 * what is left on it (/api/gift-cards).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
type GiftCard = { id: number; code: string; originalAmount: string; remainingBalance: string; issuedToName: string | null; isActive: boolean; createdAt: string };
const money = (v: string | number) => `$${Number(v).toFixed(2)}`;

export default function GiftCardsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cards, setCards] = useState<GiftCard[] | null>(null);
  const [mode, setMode] = useState<'list' | 'sell' | 'redeem'>('list');
  const [amount, setAmount] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [found, setFound] = useState<GiftCard | null>(null);
  const [take, setTake] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setCards(await api.get<GiftCard[]>('/api/gift-cards')); } catch { setCards([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // Selling on the Solo website (routes/siteShop.ts): clients buy online and get the code by e-mail.
  const [site, setSite] = useState<{ giftCardsOn: boolean; cardsReady: boolean } | null>(null);
  useEffect(() => { api.get<{ giftCardsOn: boolean; cardsReady: boolean }>('/api/pro/shop').then(setSite).catch(() => setSite(null)); }, []);
  const setSellOnline = async (on: boolean) => {
    setSite((s) => (s ? { ...s, giftCardsOn: on } : s));
    try { await api.put('/api/pro/shop', { giftCardsOn: on }); } catch { setSite((s) => (s ? { ...s, giftCardsOn: !on } : s)); Alert.alert('Gift cards', 'That could not be saved.'); }
  };
  const reset = (next: typeof mode) => { setMode(next); setError(''); setAmount(''); setName(''); setCode(''); setFound(null); setTake(''); };

  const sell = async () => {
    const value = Number(amount.replace(/[^0-9.]/g, ''));
    if (!(value >= 1 && value <= 5000)) { setError('Enter an amount from $1 to $5,000.'); return; }
    setBusy(true); setError('');
    try {
      const card = await api.post<GiftCard>('/api/gift-cards', { amount: value, issuedToName: name.trim() || null });
      await load();
      reset('list');
      Alert.alert('Gift card ready', `Code ${card.code} · ${money(card.originalAmount)}`, [
        { text: 'Share the code', onPress: () => void Share.share({ message: `Your gift card code: ${card.code} (${money(card.originalAmount)})` }) },
        { text: 'Done' },
      ]);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The gift card could not be made.'); }
    finally { setBusy(false); }
  };
  const lookUp = async () => {
    if (!code.trim()) return;
    setBusy(true); setError(''); setFound(null);
    try { setFound(await api.get<GiftCard>(`/api/gift-cards/check/${encodeURIComponent(code.trim())}`)); }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 404 ? 'No gift card has that code.' : 'The code could not be checked.'); }
    finally { setBusy(false); }
  };
  const redeem = async () => {
    if (!found) return;
    const value = Number(take.replace(/[^0-9.]/g, ''));
    if (!(value > 0) || value > Number(found.remainingBalance)) { setError(`Enter an amount up to ${money(found.remainingBalance)}.`); return; }
    setBusy(true); setError('');
    try {
      const r = await api.post<{ remainingBalance: string }>('/api/gift-cards/redeem', { code: found.code, amount: value });
      await load();
      Alert.alert('Done', `${money(value)} taken off. ${money(r.remainingBalance)} left on the card.`);
      reset('list');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The amount could not be taken off.'); }
    finally { setBusy(false); }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const input = [styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }];
  const button = (label: string, onPress: () => void, testID: string, disabled = false) => (
    <TouchableOpacity onPress={onPress} disabled={disabled || busy} testID={testID} style={[styles.button, { backgroundColor: disabled ? colors.muted : colors.primary }]}>
      {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: disabled ? colors.mutedForeground : colors.primaryForeground }]}>{label}</Text>}
    </TouchableOpacity>
  );
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="gift-cards">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => (mode === 'list' ? router.back() : reset('list'))} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="gift-cards" style={[styles.navTitle, { color: colors.foreground }]}>{mode === 'sell' ? 'Sell a gift card' : mode === 'redeem' ? 'Use a gift card' : 'Gift cards'}</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={mode === 'list' ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} /> : undefined}>
        {mode === 'sell' ? (
          <>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>Take the payment as usual, then make the card and give the client its code.</Text>
            <TextInput value={amount} onChangeText={setAmount} placeholder="Amount, e.g. 50" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={input} testID="gift-amount" />
            <TextInput value={name} onChangeText={setName} placeholder="For (optional)" placeholderTextColor={colors.mutedForeground} style={input} testID="gift-name" />
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
            {button('Make gift card', () => void sell(), 'gift-sell', !amount.trim())}
          </>
        ) : mode === 'redeem' ? (
          <>
            <TextInput value={code} onChangeText={(v) => { setCode(v); setFound(null); }} placeholder="Gift card code" autoCapitalize="characters" placeholderTextColor={colors.mutedForeground} style={input} testID="gift-code" onSubmitEditing={() => void lookUp()} />
            {!found ? button('Check the code', () => void lookUp(), 'gift-check', !code.trim()) : (
              <>
                <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Text style={[styles.muted, { color: colors.mutedForeground }]}>{found.issuedToName ? `For ${found.issuedToName}` : 'Gift card'} · {found.code}</Text>
                  <Text style={[styles.big, { color: colors.foreground }]}>{money(found.remainingBalance)} left</Text>
                </View>
                {Number(found.remainingBalance) > 0 ? (
                  <>
                    <TextInput value={take} onChangeText={setTake} placeholder="Amount to take off" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={input} testID="gift-take" />
                    {button('Take it off the card', () => void redeem(), 'gift-redeem', !take.trim())}
                  </>
                ) : <Text style={[styles.muted, { color: colors.mutedForeground }]}>This card has been used up.</Text>}
              </>
            )}
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
          </>
        ) : (
          <>
            {site ? (
              <View style={[styles.card, styles.sellRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sellTitle, { color: colors.foreground }]}>Sell on my website</Text>
                  <Text style={[styles.muted, { color: site.cardsReady ? colors.mutedForeground : colors.destructive }]}>{site.cardsReady ? 'Clients buy online and get the code by e-mail.' : 'Set up card payments first (More › Payments).'}</Text>
                </View>
                <Switch testID="gift-sell-online" value={site.giftCardsOn} disabled={!site.cardsReady} onValueChange={(v) => void setSellOnline(v)} trackColor={{ true: colors.primary, false: colors.border }} />
              </View>
            ) : null}
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => reset('sell')} style={[styles.action, { borderColor: colors.border, backgroundColor: colors.card }]} testID="gift-open-sell">
                <Feather name="gift" size={20} color={colors.primary} /><Text style={[styles.actionText, { color: colors.foreground }]}>Sell</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => reset('redeem')} style={[styles.action, { borderColor: colors.border, backgroundColor: colors.card }]} testID="gift-open-redeem">
                <Feather name="check-circle" size={20} color={colors.primary} /><Text style={[styles.actionText, { color: colors.foreground }]}>Use a card</Text>
              </TouchableOpacity>
            </View>
            {cards == null ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.mutedForeground} />
              : cards.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center', marginTop: 30 }]}>No gift cards yet.</Text>
              : (
                <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  {cards.map((c, i) => (
                    <View key={c.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{c.code}</Text>
                        <Text style={[styles.muted, { color: colors.mutedForeground }]}>{c.issuedToName || 'Gift card'} · {money(c.originalAmount)}</Text>
                      </View>
                      <Text style={[styles.rowTitle, { color: Number(c.remainingBalance) > 0 ? colors.foreground : colors.mutedForeground }]}>{money(c.remainingBalance)}</Text>
                    </View>
                  ))}
                </View>
              )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sellRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sellTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12, paddingTop: 6 },
  muted: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  input: { borderWidth: 1, borderRadius: 14, height: 54, paddingHorizontal: 16, fontSize: 18, fontFamily: 'Inter_400Regular' },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 4, ...cardShadow },
  big: { fontSize: 26, fontFamily: 'Inter_600SemiBold' },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginTop: 4, ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
});
