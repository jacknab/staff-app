/**
 * Money (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): what the business has taken and where it is.
 *   • What was taken today, this week or this month (one at a time), and how clients paid: cash, card, Tap to Pay,
 *     card reader, gift card (owner, 2026-11-09: the website's Payments report)   GET /api/reports/money/payments
 *   • On its way to the bank, and the next payout     GET /api/payments/overview
 *   • On its way to the bank, and the next payout     (same)
 *   • Recent payouts                                  GET /api/payments/stripe/payouts
 *   • The period's payments, newest first             GET /api/payments/transactions
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
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { businessToday } from '@/lib/businessTime';

import { AppBackground } from '@/components/look/AppBackground';
import { SectionTitle } from '@/components/look/SectionHeader';
import { look, cardShadow } from '@/components/look/tokens';
type Overview = {
  cards: {
    today: { amount: number }; week: { amount: number }; month: { amount: number };
    pendingPayout: { amount: number; nextPayout: { amount: number; arrivalDate: string | null } | null };
  };
};
type Payout = { id: string; amount: number; status: string; arrivalDate: string | null; createdAt: string };
type Period = 'today' | 'week' | 'month' | 'lastmonth';
type Breakdown = { total: number; methods: { method: string; amount: number; count: number; share: number }[] };
const PERIODS: { value: Period; label: string }[] = [{ value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }, { value: 'lastmonth', label: 'Last month' }];
type Transaction = { id: number; customer: string; service: string; paidAtLabel: string; method: string; amount: number; tip: number };

const money = (dollars: number) => `$${dollars.toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const PAYOUT_STATUS: Record<string, string> = { paid: 'Paid', pending: 'Pending', in_transit: 'On the way', failed: 'Failed', canceled: 'Cancelled' };
// The same names as the website's Payments report.
const METHOD: Record<string, string> = { card: 'Card', tap: 'Tap to Pay', tap_to_pay: 'Tap to Pay', card_present: 'Card', m2: 'Card reader (M2)', cash: 'Cash', gift: 'Gift card', gift_card: 'Gift card', package: 'Package', split: 'Split' };
const methodName = (m: string) => METHOD[m] ?? m.charAt(0).toUpperCase() + m.slice(1).replace(/_/g, ' ');
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The period's first and last business day (a week starts on Monday, as on the website). */
function periodRange(period: Period, tz: string) {
  const today = businessToday(tz);
  const from = new Date(today);
  if (period === 'week') from.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (period === 'month') from.setDate(1);
  // Last month (owner, 2026-11-09): its 1st to its last day.
  if (period === 'lastmonth') return { from: dateKey(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: dateKey(new Date(today.getFullYear(), today.getMonth(), 0)) };
  return { from: dateKey(from), to: dateKey(today) };
}

export default function MoneyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { timeZone } = useBookingData();
  const [period, setPeriod] = useState<Period>('today');
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
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
      const range = periodRange(period, timeZone);
      const [ov, tx, po, br] = await Promise.all([
        api.get<Overview>('/api/payments/overview?period=month'),
        api.get<{ items: Transaction[] }>(`/api/payments/transactions?period=${period}&limit=50`),
        cards ? api.get<{ items: Payout[] }>('/api/payments/stripe/payouts?limit=5').catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        api.get<Breakdown>(`/api/reports/money/payments?from=${range.from}&to=${range.to}`),
      ]);
      setOverview(ov);
      setBreakdown(br);
      setTransactions(tx.items ?? []);
      setPayouts(po.items ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your money could not be loaded.');
    }
  }, [period, timeZone]);
  useEffect(() => { void load(); }, [load]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const c = overview?.cards;
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="money-screen">
      <AppBackground />
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
            {/* One period at a time, full width (owner, 2026-11-09: the three small boxes were too tight). */}
            <SelectField testID="money-period" title="Period" value={period} options={PERIODS} onChange={setPeriod} />
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID="money-taken">
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{`Taken ${PERIODS.find((p) => p.value === period)!.label.toLowerCase()}`}</Text>
              <Text style={[styles.big, { color: colors.foreground }]}>{money(breakdown?.total ?? 0)}</Text>
            </View>

            <SectionTitle style={[styles.section]}>How you were paid</SectionTitle>
            {!breakdown || breakdown.methods.length === 0 ? (
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>No payments in this period.</Text>
            ) : (
              <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]} testID="money-methods">
                {breakdown.methods.map((m, i) => (
                  <View key={m.method} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{methodName(m.method)}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>{`${m.count} ${m.count === 1 ? 'payment' : 'payments'} · ${Math.round(m.share)}%`}</Text>
                    </View>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(m.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

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
                <SectionTitle style={[styles.section]}>Payouts</SectionTitle>
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

            <SectionTitle style={[styles.section]}>Payments</SectionTitle>
            {transactions.length === 0 ? (
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>No payments in this period.</Text>
            ) : (
              <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {transactions.map((t, i) => (
                  <View key={t.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`money-tx-${t.id}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{t.customer}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]} numberOfLines={2}>{t.service} · {t.paidAtLabel}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(t.amount)}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>{methodName(t.method)}{t.tip > 0 ? ` · tip ${money(t.tip)}` : ''}</Text>
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
  navTitle: { fontSize: 22, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 6 },
  label: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14, gap: 4, ...cardShadow },
  cardTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  big: { fontSize: 30, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  section: { marginTop: 26, marginBottom: 12 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  muted: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
});
