/**
 * Home — today at a glance (owner, 2026-11-03): a greeting, what was taken today and today's appointments with the
 * next one up. Everything in the business's time zone and only the owner's own calendar (the app's owner-only rule).
 * Today's tickets are read here, not from the calendar's data, so POS quick sales (kept off the calendar) count too.
 *
 * Needs your attention (owner, 2026-11-04): booking requests waiting for an answer, and conversations with texts not
 * read yet. Opening a conversation reads it (GET /api/sms-inbox/messages marks it read), so it leaves the list.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useBookingData, type ApiAppointment } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { listBookingRequests, type BookingRequest } from '@/lib/bookingRequests';
import { onBookingPush } from '@/lib/push';
import { businessToday, zonedDateLabel, zonedMinutes, zonedMoment, zonedTimeLabel } from '@/lib/businessTime';
import { HelpTitle } from '@/components/HelpTitle';

type Ticket = ApiAppointment & { calendarHidden?: boolean | null };
type Conversation = { clientPhone: string; clientName: string | null; lastMessage: string; lastMessageAt: string; unreadCount: number };
const pretty = (n: string) => { const d = n.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clientName = (t: Ticket) => t.customer?.fullName || t.customer?.name || [t.customer?.firstName, t.customer?.lastName].filter(Boolean).join(' ') || 'Walk-in';
const STATUS_TEXT: Record<string, string> = { completed: 'Paid', paid: 'Paid', started: 'In progress', pending: 'Booked', confirmed: 'Booked', cancelled: 'Cancelled', no_show: 'No-show' };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { timeZone, ownStaffId } = useBookingData();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [unread, setUnread] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Ticks each minute so "next up" moves on and the greeting follows the time of day.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const day = businessToday(timeZone);
      const from = zonedMoment(day, 0, timeZone);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const to = new Date(zonedMoment(next, 0, timeZone).getTime() - 1);
      const rows = await api.get<Ticket[]>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${ownStaffId ? `&staffId=${ownStaffId}` : ''}`);
      setTickets(Array.isArray(rows) ? rows : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load today.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [ownStaffId, timeZone]);
  const loadAttention = useCallback(async () => {
    const [reqs, convs] = await Promise.all([
      listBookingRequests().catch(() => [] as BookingRequest[]),
      api.get<Conversation[]>('/api/sms-inbox/conversations').catch(() => [] as Conversation[]),
    ]);
    setRequests((Array.isArray(reqs) ? reqs : []).filter((r) => r.status === 'requested').sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)));
    setUnread((Array.isArray(convs) ? convs : []).filter((c) => c.unreadCount > 0).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)));
  }, []);
  useFocusEffect(useCallback(() => { void load(); void loadAttention(); }, [load, loadAttention]));
  // A new request or text while Home is open shows straight away.
  useEffect(() => onBookingPush(() => { void loadAttention(); }), [loadAttention]);

  const nowMinutes = zonedMinutes(now, timeZone);
  const hour = Math.floor(nowMinutes / 60);
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = typeof user?.firstName === 'string' && user.firstName.trim() ? user.firstName.trim() : '';

  const paid = tickets.filter((t) => t.status === 'completed' || t.status === 'paid');
  const takenCents = paid.reduce((sum, t) => sum + Math.round(Number(t.totalPaid ?? 0) * 100) - Number(t.refundedCents ?? 0), 0);
  const appointments = useMemo(() => tickets
    .filter((t) => !t.calendarHidden && t.status !== 'cancelled')
    .sort((a, b) => +new Date(a.date) - +new Date(b.date)), [tickets]);
  // Next up: the first visit not paid yet that hasn't ended.
  const nextUp = appointments.find((t) => !['completed', 'paid', 'no_show'].includes(String(t.status))
    && zonedMinutes(t.date, timeZone) + Number(t.duration ?? 60) > nowMinutes);
  const left = appointments.filter((t) => !['completed', 'paid', 'no_show'].includes(String(t.status))).length;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const card = { backgroundColor: colors.card, borderColor: colors.border };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: topInset + 12 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); void loadAttention(); }} tintColor={colors.primary} />}>
      <Text style={[styles.date, { color: colors.primary }]}>{zonedDateLabel(now, timeZone).toUpperCase()}</Text>
      <HelpTitle help="home" style={[styles.title, { color: colors.foreground }]}>{greeting}{firstName ? `, ${firstName}` : ''}</HelpTitle>

      <View style={[styles.takings, { backgroundColor: colors.primary }]} testID="home-takings">
        <Text style={[styles.takingsLabel, { color: colors.primaryForeground }]}>Taken today</Text>
        <Text style={[styles.takingsValue, { color: colors.primaryForeground }]}>{loading ? '—' : money(takenCents)}</Text>
        <Text style={[styles.takingsSub, { color: colors.primaryForeground }]}>
          {paid.length} paid {paid.length === 1 ? 'visit' : 'visits'} · {left} {left === 1 ? 'appointment' : 'appointments'} still to go
        </Text>
      </View>

      {requests.length + unread.length > 0 ? (<>
        <View style={styles.sectionLine}>
          <Text style={[styles.section, { color: colors.foreground }]}>Needs your attention</Text>
        </View>
        <View style={[styles.list, card]} testID="home-attention">
          {[
            ...requests.slice(0, 5).map((r) => ({
              key: `r${r.id}`, title: `Booking request · ${r.clientName}`,
              sub: `${r.serviceName} · ${zonedDateLabel(r.startsAt, timeZone)}, ${zonedTimeLabel(r.startsAt, timeZone)}`,
              open: () => router.push({ pathname: '/request/[id]', params: { id: String(r.id) } }), testID: `home-request-${r.id}`,
            })),
            ...unread.slice(0, 5).map((c) => ({
              key: `t${c.clientPhone}`, title: `${c.unreadCount > 1 ? `${c.unreadCount} texts` : 'Text'} from ${c.clientName || pretty(c.clientPhone)}`,
              sub: c.lastMessage,
              open: () => router.push({ pathname: '/messages', params: { phone: c.clientPhone, name: c.clientName ?? '' } }), testID: `home-text-${c.clientPhone}`,
            })),
          ].map((item, index) => (
            <TouchableOpacity key={item.key} testID={item.testID} onPress={item.open}
              style={[styles.row, index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{item.sub}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
        {requests.length > 5 || unread.length > 5 ? (
          <View style={styles.moreLinks}>
            {requests.length > 5 ? <TouchableOpacity onPress={() => router.push('/requests')}><Text style={[styles.link, { color: colors.primary }]}>All {requests.length} requests</Text></TouchableOpacity> : null}
            {unread.length > 5 ? <TouchableOpacity onPress={() => router.push('/messages')}><Text style={[styles.link, { color: colors.primary }]}>All messages</Text></TouchableOpacity> : null}
          </View>
        ) : null}
      </>) : null}

      {nextUp ? (
        <TouchableOpacity testID="home-next-up" onPress={() => router.push(`/appointment/${nextUp.id}`)} style={[styles.next, card]}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>NEXT UP</Text>
          <Text style={[styles.nextTime, { color: colors.foreground }]}>{zonedTimeLabel(nextUp.date, timeZone)}</Text>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{clientName(nextUp)}</Text>
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{nextUp.service?.name || 'Appointment'} · {Number(nextUp.duration ?? 60)} min</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.sectionLine}>
        <Text style={[styles.section, { color: colors.foreground }]}>Today's appointments</Text>
        <TouchableOpacity testID="home-open-calendar" onPress={() => router.push('/calendar')}><Text style={[styles.link, { color: colors.primary }]}>Calendar</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} /> : error ? (
        <Text style={[styles.rowSub, { color: colors.destructive }]}>{error}</Text>
      ) : appointments.length === 0 ? (
        <View style={[styles.empty, card]}><Feather name="sun" size={20} color={colors.mutedForeground} /><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Nothing booked today.</Text></View>
      ) : (
        <View style={[styles.list, card]}>
          {appointments.map((t, index) => {
            const done = t.status === 'completed' || t.status === 'paid';
            const isNext = nextUp?.id === t.id;
            return (
              <TouchableOpacity key={t.id} testID={`home-appointment-${t.id}`} onPress={() => router.push(`/appointment/${t.id}`)}
                style={[styles.row, index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null]}>
                <Text style={[styles.rowTime, { color: isNext ? colors.primary : colors.foreground }]}>{zonedTimeLabel(t.date, timeZone)}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{clientName(t)}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{t.service?.name || 'Appointment'}</Text>
                </View>
                <View style={[styles.pill, { backgroundColor: done ? colors.secondary : t.status === 'no_show' ? colors.accent : colors.muted }]}>
                  <Text style={[styles.pillText, { color: done ? colors.secondaryForeground : t.status === 'no_show' ? colors.accentForeground : colors.mutedForeground }]}>{STATUS_TEXT[String(t.status)] ?? 'Booked'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  date: { fontSize: 11, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5, marginTop: 4 },
  takings: { borderRadius: 20, padding: 18, marginTop: 20 },
  takingsLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold', opacity: 0.85 },
  takingsValue: { fontSize: 32, fontFamily: 'Inter_700Bold', marginTop: 4, letterSpacing: -0.5 },
  takingsSub: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 6, opacity: 0.85 },
  next: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  nextTime: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 6, marginBottom: 4 },
  sectionLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 10 },
  section: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  moreLinks: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 8 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowTime: { width: 70, fontSize: 13, fontFamily: 'Inter_700Bold' },
  rowTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 },
  pill: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  empty: { borderWidth: 1, borderRadius: 16, minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
});
