/**
 * Past 30 days (owner, 2026-11-18; Home › ⋮ menu): every booking from the last 30 days, newest first, by day, with how
 * it ended (Paid, Completed, Cancelled, No-show). Tap one to open it.
 */
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { CatalogScreen } from '@/components/catalog/CatalogKit';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { useBookingData, type ApiAppointment } from '@/contexts/BookingContext';
import { zonedDateLabel, zonedTimeLabel } from '@/lib/businessTime';
import { cardShadow } from '@/components/look/tokens';

type Ticket = ApiAppointment & { calendarHidden?: boolean | null };
const clientName = (t: Ticket) => t.customer?.fullName || t.customer?.name || [t.customer?.firstName, t.customer?.lastName].filter(Boolean).join(' ') || 'Walk-in';
// Completed is not paid (MARK AS COMPLETED records no payment): only a recorded payment says Paid.
const isPaid = (t: Ticket) => t.status === 'paid' || (t.status === 'completed' && t.totalPaid != null);
const STATUS_TEXT: Record<string, string> = { completed: 'Completed', started: 'In progress', pending: 'Booked', confirmed: 'Booked', cancelled: 'Cancelled', no_show: 'No-show' };

export default function PastBookingsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { timeZone, ownStaffId } = useBookingData();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 30 * 86_400_000);
      const rows = await api.get<Ticket[]>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${ownStaffId ? `&staffId=${ownStaffId}` : ''}`);
      setTickets((Array.isArray(rows) ? rows : []).filter((t) => !t.calendarHidden || t.status === 'cancelled').sort((a, b) => +new Date(b.date) - +new Date(a.date)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the last 30 days.');
    } finally { setLoading(false); }
  }, [ownStaffId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const days = useMemo(() => {
    const groups: { label: string; items: Ticket[] }[] = [];
    for (const t of tickets) {
      const label = zonedDateLabel(t.date, timeZone);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(t); else groups.push({ label, items: [t] });
    }
    return groups;
  }, [tickets, timeZone]);
  const card = { backgroundColor: colors.card, borderColor: colors.border };

  return (
    <CatalogScreen title="Past 30 days" help="pastBookings" onBack={() => router.back()} testID="past-bookings">
      {loading && tickets.length === 0 ? <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        : error ? <Text style={[styles.rowSub, { color: colors.destructive, marginTop: 16 }]}>{error}</Text>
        : days.length === 0 ? (
          <View style={[styles.empty, card]}><Feather name="clock" size={20} color={colors.mutedForeground} /><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>No bookings in the last 30 days.</Text></View>
        ) : days.map((group) => (
          <View key={group.label}>
            <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{group.label}</Text>
            <View style={[styles.list, card]}>
              {group.items.map((t, index) => {
                const done = isPaid(t);
                const closed = t.status === 'no_show' || t.status === 'cancelled';
                return (
                  <TouchableOpacity key={t.id} testID={`past-${t.id}`} onPress={() => router.push(`/appointment/${t.id}`)}
                    style={[styles.row, index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                    <Text style={[styles.rowTime, { color: colors.foreground }]}>{zonedTimeLabel(t.date, timeZone)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{clientName(t)}</Text>
                      <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{t.service?.name || 'Appointment'}</Text>
                    </View>
                    <View style={[styles.pill, { backgroundColor: done ? colors.secondary : closed ? colors.accent : colors.muted }]}>
                      <Text style={[styles.pillText, { color: done ? colors.secondaryForeground : closed ? colors.accentForeground : colors.mutedForeground }]}>{done ? 'Paid' : STATUS_TEXT[String(t.status)] ?? 'Booked'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  dayLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 14, marginBottom: 8 },
  list: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowTime: { width: 76, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 2 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { borderWidth: 1, borderRadius: 18, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
});
