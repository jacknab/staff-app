/**
 * Card on file (owner, 2026-11-19; client ⋮ › Card on file): the client's saved card and a search box stay at the top;
 * under them every payment received from the client, newest first. Tap one for its receipt (app/client-receipt.tsx).
 *   GET /api/pro/clients/:id/payments
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { useBookingData } from '@/contexts/BookingContext';
import { zonedDateLabel } from '@/lib/businessTime';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Card = { brand: string | null; last4: string | null; expMonth: number | null; expYear: number | null };
type Payment = { kind: 'visit' | 'fee'; appointmentId: number; dateIso: string; title: string; amount: number; method: string; refunded: number };
const money = (n: number) => `$${n.toFixed(2)}`;
const brandName = (b: string | null) => (b ? `${b[0].toUpperCase()}${b.slice(1)}` : 'Card');

export default function ClientPaymentsScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { timeZone } = useBookingData();
  const params = useLocalSearchParams<{ customerId: string; clientName?: string }>();
  const [card, setCard] = useState<Card | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ card: Card | null; payments: Payment[] }>(`/api/pro/clients/${params.customerId}/payments`);
      setCard(r.card); setPayments(Array.isArray(r.payments) ? r.payments : []); setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the payments.');
    } finally { setLoading(false); }
  }, [params.customerId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // Search by what was paid for, how, the amount or the date.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return payments;
    return payments.filter((p) => [p.title, p.method, money(p.amount), String(p.amount), zonedDateLabel(p.dateIso, timeZone)].some((v) => v.toLowerCase().includes(q)));
  }, [payments, search, timeZone]);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const exp = card?.expMonth && card?.expYear ? `Expires ${String(card.expMonth).padStart(2, '0')}/${String(card.expYear).slice(-2)}` : null;

  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      {/* Fixed at the top: the card and the search. Only the payments scroll. */}
      <View style={styles.fixed}>
        <View style={styles.header}>
          <TouchableOpacity testID="client-payments-back" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
          <HelpTitle help="clientPayments" style={[styles.headerTitle, { color: colors.foreground }]}>Card on file</HelpTitle>
          <View style={styles.headerButton} />
        </View>
        {params.clientName ? <Text style={[styles.clientName, { color: colors.mutedForeground }]}>{params.clientName}</Text> : null}
        <View testID="client-payments-card" style={[styles.cardPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.cardIcon, { backgroundColor: look.tile }]}><Feather name="credit-card" size={26} color={look.violetDeep} /></View>
          {card ? (
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: look.heading }]}>{`${brandName(card.brand)} •••• ${card.last4 ?? '????'}`}</Text>
              {exp ? <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>{exp}</Text> : null}
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: look.heading }]}>No card on file</Text>
              <Text style={[styles.cardSub, { color: colors.mutedForeground }]}>Saved when they pay by card at checkout or save one when booking online.</Text>
            </View>
          )}
        </View>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={19} color={colors.mutedForeground} />
          <TextInput testID="client-payments-search" value={search} onChangeText={setSearch} placeholder="Search payments" placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]} returnKeyType="search" autoCapitalize="none" />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
          : error ? <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text>
          : shown.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>{search.trim() ? 'No payments match.' : 'No payments yet.'}</Text>
          : shown.map((p) => (
            <TouchableOpacity key={`${p.kind}-${p.appointmentId}`} testID={`payment-${p.kind}-${p.appointmentId}`}
              onPress={() => router.push({ pathname: '/client-receipt' as any, params: { kind: p.kind, id: String(p.appointmentId) } })}
              style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{p.title}</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{`${zonedDateLabel(p.dateIso, timeZone)} · ${p.method}`}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.amount, { color: colors.foreground }]}>{money(p.amount)}</Text>
                {p.refunded > 0 ? <Text style={[styles.refunded, { color: colors.accentForeground }]}>{p.refunded >= p.amount ? 'Refunded' : `Refunded ${money(p.refunded)}`}</Text> : null}
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fixed: { paddingHorizontal: 18, paddingBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  clientName: { fontSize: 16, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 2 },
  cardPanel: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14, ...cardShadow },
  cardIcon: { width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', letterSpacing: 0.3 },
  cardSub: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 3, lineHeight: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, height: 50, marginTop: 14 },
  searchInput: { flex: 1, fontSize: 17, fontFamily: 'Inter_400Regular' },
  list: { paddingHorizontal: 18, paddingTop: 4, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, ...cardShadow },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 3 },
  amount: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  refunded: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  empty: { fontSize: 16, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 24 },
});
