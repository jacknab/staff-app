/**
 * Money (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): what the business has taken and where it is.
 *   • Sales today, this week and this month          GET /api/payments/overview
 *   • On its way to the bank, and the next payout     (same)
 *   • Recent payouts                                  GET /api/payments/stripe/payouts
 *   • This month's payments, newest first             GET /api/payments/transactions
 * Payouts run on Stripe's own schedule, so there is nothing to start here. Without card payments set up, the screen
 * offers to set them up.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { canTakeCards, getPaymentStatus } from '@/lib/payments-setup';
import { HelpTitle } from '@/components/HelpTitle';

type Overview = {
  cards: {
    today: { amount: number }; week: { amount: number }; month: { amount: number };
    pendingPayout: { amount: number; nextPayout: { amount: number; arrivalDate: string | null } | null };
  };
};
type Payout = { id: string; amount: number; status: string; arrivalDate: string | null; createdAt: string };
type Transaction = { id: number; customer: string; service: string; paidAtLabel: string; method: string; amount: number; tip: number };

const money = (dollars: number) => `$${dollars.toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const PAYOUT_STATUS: Record<string, string> = { paid: 'Paid', pending: 'Pending', in_transit: 'On the way', failed: 'Failed', canceled: 'Cancelled' };
const METHOD: Record<string, string> = { card: 'Card', tap_to_pay: 'Tap to Pay', card_present: 'Card', cash: 'Cash', split: 'Split' };

export default function MoneyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const status = await getPaymentStatus().catch(() => null);
      const cards = canTakeCards(status);
      setReady(cards);
      const [ov, tx, po] = await Promise.all([
        api.get<Overview>('/api/payments/overview?period=month'),
        api.get<{ items: Transaction[] }>('/api/payments/transactions?period=month&limit=50'),
        cards ? api.get<{ items: Payout[] }>('/api/payments/stripe/payouts?limit=5').catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
      ]);
      setOverview(ov);
      setTransactions(tx.items ?? []);
      setPayouts(po.items ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your money could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const c = overview?.cards;
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="money-screen">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back" testID="money-back">
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <HelpTitle help="money" style={[styles.navTitle, { color: colors.foreground }]}>Money</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {!overview ? (
          error ? <Text style={[styles.muted, { color: colors.destructive, textAlign: 'center', marginTop: 40 }]}>{error}</Text>
            : <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
        ) : (
          <>
            <View style={styles.salesRow}>
              {([['Today', c!.today.amount], ['This week', c!.week.amount], ['This month', c!.month.amount]] as const).map(([label, amount]) => (
                <View key={label} style={[styles.salesCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
                  <Text style={[styles.salesAmount, { color: colors.foreground }]} numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</Text>
                </View>
              ))}
            </View>

            {ready ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>On its way to your bank</Text>
                <Text style={[styles.big, { color: colors.foreground }]} testID="money-pending">{money(c!.pendingPayout.amount)}</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                  {c!.pendingPayout.nextPayout
                    ? `Next payout ${money(c!.pendingPayout.nextPayout.amount)}${c!.pendingPayout.nextPayout.arrivalDate ? ` · arrives ${day(c!.pendingPayout.nextPayout.arrivalDate)}` : ''}`
                    : 'Stripe pays card sales to your bank automatically.'}
                </Text>
              </View>
            ) : (
              <TouchableOpacity onPress={() => router.push('/payments-intro')} style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.secondary }]} testID="money-setup">
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>Set up card payments</Text>
                <Text style={[styles.muted, { color: colors.mutedForeground }]}>Take cards with Tap to Pay and get paid to your bank.</Text>
              </TouchableOpacity>
            )}

            {payouts.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.foreground }]}>Payouts</Text>
                <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  {payouts.map((p, i) => (
                    <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(p.amount / 100)}</Text>
                        <Text style={[styles.muted, { color: colors.mutedForeground }]}>{PAYOUT_STATUS[p.status] ?? p.status}{p.arrivalDate ? ` · ${day(p.arrivalDate)}` : ''}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={[styles.section, { color: colors.foreground }]}>Payments this month</Text>
            {transactions.length === 0 ? (
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>No payments yet this month.</Text>
            ) : (
              <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {transactions.map((t, i) => (
                  <View key={t.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`money-tx-${t.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{t.customer}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]} numberOfLines={1}>{t.service} · {t.paidAtLabel}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(t.amount)}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>{METHOD[t.method] ?? t.method}{t.tip > 0 ? ` · tip ${money(t.tip)}` : ''}</Text>
                    </View>
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
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 6 },
  salesRow: { flexDirection: 'row', gap: 10 },
  salesCard: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
  salesAmount: { fontSize: 19, fontFamily: 'Inter_600SemiBold', marginTop: 6 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  big: { fontSize: 30, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  section: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 24, marginBottom: 10 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
});
