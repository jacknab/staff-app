/**
 * Credit balance (owner, 2026-11-03): the text message credits left, and three packages to buy more.
 * With a card on file a package is bought at once (POST /api/solo/credits/buy); without one — or when the bank wants
 * the payment confirmed — certxa.com/pro-credits opens, already signed in, to pay there (routes/soloCredits.ts).
 * The packages are fixed on the server for now; they will be set from /isAdmin later.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

type Pack = { id: string; credits: number; priceCents: number };
type Summary = { credits: number; unlimited: boolean; packs: Pack[]; card: { brand: string | null; last4: string | null } | null };

const GOLD = '#E9C85A';
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function Coin({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="star" size={size * 0.45} color="#7A6420" />
    </View>
  );
}

export default function CreditsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [buying, setBuying] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setSummary(await api.get<Summary>('/api/solo/credits')); setError(''); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Your credits could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Pay on certxa.com (no card on file, or the bank wants it confirmed), then show the new balance.
  const buyOnWeb = async (pack: Pack) => {
    const { url } = await api.post<{ url: string }>('/api/solo/credits/web-link', { packId: pack.id });
    await WebBrowser.openAuthSessionAsync(url, 'certxa-pro://credits');
    await load();
  };

  const buy = (pack: Pack) => {
    if (!summary || buying) return;
    const run = async () => {
      setBuying(pack.id);
      try {
        if (!summary.card) { await buyOnWeb(pack); return; }
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        try {
          const r = await api.post<{ credits: number; added: number }>('/api/solo/credits/buy', { packId: pack.id, idempotencyKey: key });
          setSummary((s) => (s ? { ...s, credits: r.credits } : s));
          Alert.alert('Credits added', `${r.added} credits were added. You now have ${r.credits}.`);
        } catch (cause) {
          // The card on file couldn't be charged here: pay on the website instead.
          if (cause instanceof ApiError && cause.status === 409) await buyOnWeb(pack);
          else throw cause;
        }
      } catch (cause) {
        Alert.alert('Credits', cause instanceof Error ? cause.message : 'The credits could not be bought. Please try again.');
      } finally {
        setBuying(null);
      }
    };
    if (summary.card) {
      Alert.alert(`Buy ${pack.credits} credits?`, `${money(pack.priceCents)} will be charged to your ${summary.card.brand ? `${summary.card.brand[0]!.toUpperCase()}${summary.card.brand.slice(1)} ` : 'card '}ending ${summary.card.last4 ?? '••••'}.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: `Buy · ${money(pack.priceCents)}`, onPress: () => void run() },
      ]);
    } else {
      void run();
    }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="credits-screen">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back" testID="credits-back">
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <HelpTitle help="credits" style={[styles.navTitle, { color: colors.foreground }]}>Credit balance</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!summary ? (
          error ? <Text style={[styles.note, { color: colors.destructive, textAlign: 'center', marginTop: 40 }]}>{error}</Text>
            : <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
        ) : (
          <>
            <View style={styles.balance}>
              <View style={styles.balanceRow}>
                <Coin size={46} />
                <Text style={[styles.balanceNumber, { color: colors.foreground }]} testID="credits-balance">{summary.credits}</Text>
              </View>
              <Text style={[styles.balanceLabel, { color: colors.foreground }]}>text message credits remaining</Text>
              {summary.unlimited ? <Text style={[styles.note, { color: colors.mutedForeground, textAlign: 'center' }]}>With Plus, notification texts are free; every other text uses a credit.</Text> : null}
            </View>

            <Text style={[styles.section, { color: colors.foreground }]}>Buy more credits</Text>
            {summary.packs.map((pack) => (
              <TouchableOpacity key={pack.id} onPress={() => buy(pack)} disabled={!!buying} activeOpacity={0.8} testID={`credits-pack-${pack.id}`}
                style={[styles.pack, { borderColor: colors.border, backgroundColor: colors.card, opacity: buying && buying !== pack.id ? 0.5 : 1 }]}>
                <Coin size={38} />
                <Text style={[styles.packName, { color: colors.foreground }]}>{pack.credits} credits</Text>
                {buying === pack.id ? <ActivityIndicator color={colors.foreground} /> : (
                  <View style={[styles.price, { backgroundColor: colors.primary }]}><Text style={styles.priceText}>{money(pack.priceCents)}</Text></View>
                )}
                <Feather name="chevron-right" size={22} color={colors.foreground} />
              </TouchableOpacity>
            ))}
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              {summary.card
                ? `Charged to your card ending ${summary.card.last4 ?? '••••'}. One credit sends one text to a client.`
                : 'You pay on certxa.com the first time; your card is then saved so you can buy with one tap. One credit sends one text to a client.'}
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 24, paddingBottom: 60 },
  balance: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  balanceNumber: { fontSize: 54, fontFamily: 'Inter_600SemiBold', letterSpacing: -1 },
  balanceLabel: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  section: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginTop: 14, marginBottom: 14 },
  pack: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 14, minHeight: 72, paddingHorizontal: 14, marginBottom: 14 },
  packName: { flex: 1, fontSize: 18, fontFamily: 'Inter_500Medium' },
  price: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5 },
  priceText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  note: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4 },
});
