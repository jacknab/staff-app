/**
 * Home — today at a glance (owner, 2026-11-03): a greeting, what was taken today and today's appointments with the
 * next one up. Everything in the business's time zone and only the owner's own calendar (the app's owner-only rule).
 * Today's tickets are read here, not from the calendar's data, so POS quick sales (kept off the calendar) count too.
 *
 * Needs your attention (owner, 2026-11-04): booking requests waiting for an answer, and conversations with texts not
 * read yet. Opening a conversation reads it (GET /api/sms-inbox/messages marks it read), so it leaves the list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Animated, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData, type ApiAppointment } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { listBookingRequests, type BookingRequest } from '@/lib/bookingRequests';
import { onBookingPush } from '@/lib/push';
import { unreadInboxCount } from '@/lib/inbox';
import { onInboxEvent } from '@/lib/inboxLive';
import { businessToday, zonedDateLabel, zonedMinutes, zonedMoment, zonedTimeLabel } from '@/lib/businessTime';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { SectionTitle } from '@/components/look/SectionHeader';
import { APP_MAX_WIDTH } from '@/components/TabletFrame';
import { look, cardShadow } from '@/components/look/tokens';
type Ticket = ApiAppointment & { calendarHidden?: boolean | null };
type Conversation = { clientPhone: string; clientName: string | null; lastMessage: string; lastMessageAt: string; unreadCount: number };
const pretty = (n: string) => { const d = n.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const clientName = (t: Ticket) => t.customer?.fullName || t.customer?.name || [t.customer?.firstName, t.customer?.lastName].filter(Boolean).join(' ') || 'Walk-in';
// Completed is not paid (MARK AS COMPLETED records no payment; owner, 2026-11-17): only a recorded payment says Paid.
const isPaid = (t: Ticket) => t.status === 'paid' || (t.status === 'completed' && t.totalPaid != null);
const STATUS_TEXT: Record<string, string> = { completed: 'Completed', paid: 'Paid', started: 'In progress', pending: 'Booked', confirmed: 'Booked', cancelled: 'Cancelled', no_show: 'No-show' };

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { timeZone, ownStaffId } = useBookingData();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [unread, setUnread] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  // Ticks each minute so "next up" moves on.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The ⋮ menu at the top right (owner, 2026-11-18): quick links, starting with Past 30 days.
  const [menuOpen, setMenuOpen] = useState(false);
  const quickLinks: { key: string; label: string; href: Href }[] = [
    { key: 'past', label: 'Past 30 days', href: '/past-bookings' as Href },
  ];

  const load = useCallback(async () => {
    setError('');
    try {
      const day = businessToday(timeZone);
      const from = zonedMoment(day, 0, timeZone);
      // Today and the next 6 days (owner, 2026-11-18): the list shows the week; the takings and Next up stay today's.
      const next = new Date(day); next.setDate(next.getDate() + 7);
      const to = new Date(zonedMoment(next, 0, timeZone).getTime() - 1);
      const rows = await api.get<Ticket[]>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${ownStaffId ? `&staffId=${ownStaffId}` : ''}`);
      setTickets(Array.isArray(rows) ? rows : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load today.');
    } finally { setLoading(false); setRefreshing(false); }
  }, [ownStaffId, timeZone]);
  // Website messages not read yet: the envelope's count (owner, 2026-11-07).
  const [inboxUnread, setInboxUnread] = useState(0);
  // Late cancellations (client or pro, inside the cancellation policy, card on file) waiting for the fee choice (2026-11-18).
  const [cancels, setCancels] = useState<Ticket[]>([]);
  // The weekly revenue goal (owner, 2026-11-18, GlossGenius; app/revenue-goal.tsx).
  const [goal, setGoal] = useState<{ goalCents: number; week: { cents: number } } | null>(null);
  const loadAttention = useCallback(async () => {
    void api.get<{ goalCents: number; week: { cents: number } }>('/api/pro/revenue-goal').then(setGoal).catch(() => undefined);
    void unreadInboxCount().then(setInboxUnread);
    void api.get<{ cancellations: Ticket[] }>('/api/pro/cancellations').then((r) => setCancels(Array.isArray(r?.cancellations) ? r.cancellations : [])).catch(() => undefined);
    const [reqs, convs] = await Promise.all([
      listBookingRequests().catch(() => [] as BookingRequest[]),
      api.get<Conversation[]>('/api/sms-inbox/conversations').catch(() => [] as Conversation[]),
    ]);
    setRequests((Array.isArray(reqs) ? reqs : []).filter((r) => r.status === 'requested').sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt)));
    setUnread((Array.isArray(convs) ? convs : []).filter((c) => c.unreadCount > 0).sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)));
  }, []);
  useFocusEffect(useCallback(() => { void load(); void loadAttention(); }, [load, loadAttention]));
  // The envelope's count follows new website messages and ones read on another phone.
  useEffect(() => onInboxEvent((e) => { if (e.type === 'message' || e.type === 'read') void unreadInboxCount().then(setInboxUnread); }), []);
  // A new request or text while Home is open shows straight away.
  useEffect(() => onBookingPush(() => { void loadAttention(); }), [loadAttention]);

  const nowMinutes = zonedMinutes(now, timeZone);

  const todayLabel = zonedDateLabel(now, timeZone);
  const week = useMemo(() => tickets
    .filter((t) => (!t.calendarHidden || t.paymentStatus === 'awaiting_payment') && t.status !== 'cancelled')
    .sort((a, b) => +new Date(a.date) - +new Date(b.date)), [tickets]);
  const todayTickets = tickets.filter((t) => zonedDateLabel(t.date, timeZone) === todayLabel);
  const paid = todayTickets.filter(isPaid);
  const takenCents = paid.reduce((sum, t) => sum + Math.round(Number(t.totalPaid ?? 0) * 100) - Number(t.refundedCents ?? 0), 0);
  const appointments = week.filter((t) => zonedDateLabel(t.date, timeZone) === todayLabel);
  // The week's appointments by day: today first, then each day that has something booked.
  const days = useMemo(() => {
    const groups: { label: string; items: Ticket[] }[] = [];
    for (const t of week) {
      const label = zonedDateLabel(t.date, timeZone);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(t); else groups.push({ label, items: [t] });
    }
    return groups;
  }, [week, timeZone]);
  // Next up: the first visit not paid yet that hasn't ended.
  const nextUp = appointments.find((t) => !['completed', 'paid', 'no_show'].includes(String(t.status))
    && zonedMinutes(t.date, timeZone) + Number(t.duration ?? 60) > nowMinutes);
  const left = appointments.filter((t) => !['completed', 'paid', 'no_show'].includes(String(t.status))).length;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const card = { backgroundColor: colors.card, borderColor: colors.border };

  return (
    <View style={{ flex: 1, backgroundColor: look.pageTop }}>
      <AppBackground />
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setMenuOpen(false)} style={styles.menuBackdrop} accessibilityLabel="Close menu">
          <View pointerEvents="box-none" style={styles.menuColumn}>
            <View testID="home-menu-list" style={[styles.menu, { top: topInset + 50, backgroundColor: colors.card, borderColor: colors.border }]}>
            {quickLinks.map((link) => (
              <TouchableOpacity key={link.key} testID={`home-menu-${link.key}`} onPress={() => { setMenuOpen(false); router.push(link.href); }} style={styles.menuItem}>
                <Text style={[styles.menuText, { color: colors.foreground }]}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          </View>
        </TouchableOpacity>
      </Modal>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: topInset + 12 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); void loadAttention(); }} tintColor={colors.primary} />}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <HelpTitle help="home" style={[styles.date, { color: colors.primary }]}>{zonedDateLabel(now, timeZone).toUpperCase()}</HelpTitle>
        </View>
        {/* Inbox: messages clients send from the website, with the count not read yet (app/inbox). */}
        <TouchableOpacity onPress={() => router.push('/inbox' as Href)} style={styles.inboxButton} testID="home-inbox"
          accessibilityLabel={inboxUnread > 0 ? `Inbox, ${inboxUnread} new ${inboxUnread === 1 ? 'message' : 'messages'}` : 'Inbox'}>
          <Feather name="mail" size={24} color={colors.foreground} />
          {inboxUnread > 0 ? (
            <View style={[styles.inboxBadge, { backgroundColor: colors.primary, borderColor: colors.background }]} testID="home-inbox-count">
              <Text style={styles.inboxBadgeText}>{inboxUnread > 99 ? '99+' : inboxUnread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={styles.inboxButton} testID="home-menu" accessibilityLabel="More">
          <Feather name="more-vertical" size={24} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {/* Taken today on a light purple card (owner, 2026-11-18), with Set a goal in its corner. */}
      <View style={[styles.takings, { backgroundColor: look.tile, borderColor: look.cardBorder }]} testID="home-takings">
        <View style={styles.takingsTop}>
          <Text style={[styles.takingsLabel, { color: colors.primary }]}>Taken today</Text>
          <TouchableOpacity testID="home-set-goal" onPress={() => router.push('/revenue-goal' as Href)} style={[styles.goalButton, { backgroundColor: colors.card, borderColor: look.cardBorder }]}>
            <Text style={[styles.goalButtonText, { color: colors.primary }]}>Set a goal</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.takingsValue, { color: look.heading }]}>{loading ? '—' : money(takenCents)}</Text>
        <Text style={[styles.takingsSub, { color: colors.mutedForeground }]}>
          {paid.length} paid {paid.length === 1 ? 'visit' : 'visits'} · {left} {left === 1 ? 'appointment' : 'appointments'} still to go
        </Text>
      </View>

      {/* The weekly goal's progress, once one is set (set or change it with Set a goal). */}
      {goal && goal.goalCents > 0 ? (
        <TouchableOpacity testID="home-goal" onPress={() => router.push('/revenue-goal' as Href)} style={[styles.next, card]}>
          <Text style={[styles.goalTitle, { color: colors.foreground }]}>{`Weekly goal · ${money(goal.week.cents)} of ${money(goal.goalCents)}`}</Text>
          <View style={[styles.goalTrack, { backgroundColor: colors.muted }]}><View style={[styles.goalFill, { backgroundColor: colors.primary, width: `${Math.min(100, Math.round((goal.week.cents / goal.goalCents) * 100))}%` }]} /></View>
        </TouchableOpacity>
      ) : null}

      {requests.length + unread.length + cancels.length > 0 ? (<>
        <View style={styles.sectionLine}>
          <Text style={[styles.section, { color: colors.foreground }]}>Needs your attention</Text>
        </View>
        <View style={[styles.list, card]} testID="home-attention">
          {[
            ...cancels.map((t) => ({
              key: `c${t.id}`, title: `Late cancellation · ${clientName(t)}`,
              sub: `${t.service?.name || 'Appointment'} · was ${zonedDateLabel(t.date, timeZone)}, ${zonedTimeLabel(t.date, timeZone)} · charge the fee?`,
              open: () => router.push(`/appointment/${t.id}`), testID: `home-cancel-${t.id}`,
            })),
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
              <BlinkingDot />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>{item.sub}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
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
          {/* NEXT UP and the time on the left, the client and service on the right (owner, 2026-11-18). */}
          <View style={styles.nextRow}>
            <View>
              <Text style={[styles.nextLabel, { color: colors.primary }]}>NEXT UP</Text>
              <Text style={[styles.nextTime, { color: colors.foreground }]}>{zonedTimeLabel(nextUp.date, timeZone)}</Text>
            </View>
            <View style={styles.nextWho}>
              <Text style={[styles.rowTitle, { color: colors.foreground, textAlign: 'right' }]} numberOfLines={1}>{clientName(nextUp)}</Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground, textAlign: 'right' }]} numberOfLines={2}>{nextUp.service?.name || 'Appointment'} · {Number(nextUp.duration ?? 60)} min</Text>
            </View>
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.sectionLine}>
        <SectionTitle style={[styles.section]}>Today's Appointments</SectionTitle>
        <TouchableOpacity testID="home-open-calendar" onPress={() => router.push('/calendar')}><Text style={[styles.link, { color: colors.primary }]}>Calendar</Text></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} /> : error ? (
        <Text style={[styles.rowSub, { color: colors.destructive }]}>{error}</Text>
      ) : days.length === 0 ? (
        <View style={[styles.empty, card]}><Feather name="sun" size={20} color={colors.mutedForeground} /><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Nothing booked in the next 7 days.</Text></View>
      ) : days.map((group) => (
        <View key={group.label} testID={`home-day-${group.label}`}>
          <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{group.label === todayLabel ? 'Today' : group.label}</Text>
          <View style={[styles.list, card]}>
          {group.items.map((t, index) => {
            const done = isPaid(t);
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
                  <Text style={[styles.pillText, { color: done ? colors.secondaryForeground : t.status === 'no_show' ? colors.accentForeground : colors.mutedForeground }]}>{done ? 'Paid' : STATUS_TEXT[String(t.status)] ?? 'Booked'}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          </View>
        </View>
      ))}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 120 },
  dayLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 14, marginBottom: 8 },
  date: { fontSize: 14, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.08)' },
  // Tablets: the menu stays inside the app's column (components/TabletFrame.tsx), under its button.
  menuColumn: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center' },
  menu: { position: 'absolute', right: 14, minWidth: 240, maxWidth: 320, borderWidth: 1, borderRadius: 14, paddingVertical: 6, ...cardShadow },
  menuItem: { paddingHorizontal: 16, paddingVertical: 13 },
  menuText: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  inboxButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  inboxBadge: { position: 'absolute', top: 2, right: 0, minWidth: 20, height: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  inboxBadgeText: { color: '#FFFFFF', fontSize: 13, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 34, fontFamily: 'Inter_700Bold', letterSpacing: -0.7, marginTop: 4 },
  takings: { borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 20 },
  takingsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  goalButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  goalButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  nextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  nextWho: { flex: 1, alignItems: 'flex-end' },
  nextLabel: { fontSize: 15, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  takingsLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  takingsValue: { fontSize: 32, fontFamily: 'Inter_700Bold', marginTop: 4, letterSpacing: -0.5 },
  takingsSub: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 6 },
  next: { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 14 },
  goalTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  goalTrack: { height: 8, borderRadius: 4, marginTop: 10, overflow: 'hidden' },
  goalFill: { height: 8, borderRadius: 4 },
  eyebrow: { fontSize: 13, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  nextTime: { fontSize: 23, fontFamily: 'Inter_700Bold', marginTop: 6, marginBottom: 4 },
  sectionLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 26, marginBottom: 10 },
  section: {},
  dot: { width: 11, height: 11, borderRadius: 6 },
  moreLinks: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, marginTop: 8 },
  link: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 16, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowTime: { width: 70, fontSize: 16, fontFamily: 'Inter_700Bold' },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 3 },
  pill: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 },
  pillText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { borderWidth: 1, borderRadius: 16, minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
});

/** The attention dot: pink, blinking on and off so it catches the eye (owner, 2026-11-18). */
function BlinkingDot() {
  const on = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(on, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.delay(420),
      Animated.timing(on, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.delay(520),
    ]));
    loop.start();
    return () => loop.stop();
  }, [on]);
  return <Animated.View style={[styles.dot, { backgroundColor: '#EC4899', opacity: on }]} />;
}
