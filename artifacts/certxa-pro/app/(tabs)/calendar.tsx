import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Alert, Modal, Platform, ScrollView as RNScrollView, StatusBar, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { AppointmentRecord, appointmentParams, useBookingData } from '@/contexts/BookingContext';
import { businessToday, zonedMinutes, zonedMoment } from '@/lib/businessTime';
import { listBookingRequests } from '@/lib/bookingRequests';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { look } from '@/components/look/tokens';
type TimeBlock = { id: number; startsAt: string; endsAt: string; allDay: boolean; note: string | null };

type ViewMode = 'Month' | 'Week' | 'Day';

const BOOKING_COLORS = ['#ECE5FD', '#F9E1BC', '#F3D4DE', '#DEE4F4'];
/** A booking with no start time is drawn here (the day view itself shows all 24 hours). */
const DEFAULT_START = 6 * 60;
/** How long a booking has to be held before it can be dragged. */
const LONG_PRESS_MS = 300;
/** Room under the timeline so its last hour can scroll clear of the tab bar. */
const TIMELINE_BOTTOM_PADDING = 110;
const HOUR_HEIGHT = 64;
const SNAP_MINUTES = 5;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Minutes after midnight an appointment starts, in business time (worked out once in BookingContext). */
function startMinutes(item: AppointmentRecord) {
  return Number.isFinite(item.startMinutes) ? item.startMinutes : DEFAULT_START;
}

/** Appointments that share any time are drawn side by side instead of on top of each other. Returns, for each
 *  appointment id, which column it sits in and how many columns its group of overlapping appointments needs. */
function overlapColumns(items: AppointmentRecord[]) {
  const layout: Record<string, { column: number; columns: number }> = {};
  let group: { id: string; column: number }[] = [];
  let columnEnds: number[] = [];
  let groupEnd = -1;
  const closeGroup = () => { for (const entry of group) layout[entry.id] = { column: entry.column, columns: columnEnds.length }; group = []; columnEnds = []; };
  for (const item of items) {
    const start = startMinutes(item);
    const end = start + durationMinutes(item.duration);
    if (group.length > 0 && start >= groupEnd) closeGroup();
    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) { column = columnEnds.length; columnEnds.push(end); } else columnEnds[column] = end;
    group.push({ id: item.id, column });
    groupEnd = Math.max(groupEnd, end);
  }
  closeGroup();
  return layout;
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function timelineTop(minutes: number, timelineStart: number) {
  return ((minutes - timelineStart) / 60) * HOUR_HEIGHT;
}

function clampDropMinutes(minutes: number, duration: number, timelineStart: number, timelineEnd: number) {
  const latestStart = Math.max(timelineStart, timelineEnd - duration);
  const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.min(latestStart, Math.max(timelineStart, snapped));
}


function durationMinutes(duration: string) {
  const minutes = Number.parseInt(duration, 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}


function monthCells(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const cell = new Date(first);
    cell.setDate(1 - offset + index);
    return cell;
  });
}


/**
 * One booking on the day timeline. A quick tap opens it. Press and hold (about a third of a second) picks it up,
 * and it then follows the finger; a normal swipe is left to the calendar, which scrolls.
 */
function DraggableAppointment({
  item,
  top,
  height,
  column,
  columns,
  backgroundColor,
  dragLabel,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
}: {
  item: AppointmentRecord;
  top: number;
  height: number;
  column: number;
  columns: number;
  backgroundColor: string;
  /** The new start time while this booking is being dragged, otherwise null. */
  dragLabel: string | null;
  onTap: (item: AppointmentRecord) => void;
  onDragStart: (item: AppointmentRecord) => void;
  onDragMove: (translationY: number, absoluteY: number) => void;
  onDragEnd: (item: AppointmentRecord, completed: boolean) => void;
}) {
  const gesture = useMemo(() => {
    // A paid booking is locked to the calendar (owner, 2026-11-03): it can be opened, never dragged to another time.
    const drag = Gesture.Pan()
      .enabled(item.status !== 'paid')
      .activateAfterLongPress(LONG_PRESS_MS)
      .runOnJS(true)
      .onStart(() => onDragStart(item))
      .onUpdate((event) => onDragMove(event.translationY, event.absoluteY))
      .onEnd((_event, success) => onDragEnd(item, success))
      .onFinalize((_event, success) => { if (!success) onDragEnd(item, false); });
    const tap = Gesture.Tap().maxDuration(LONG_PRESS_MS).runOnJS(true).onEnd((_event, success) => { if (success) onTap(item); });
    // The tap only counts once the hold-to-drag has failed (the finger lifted early).
    return Gesture.Exclusive(drag, tap);
  }, [item, onDragEnd, onDragMove, onDragStart, onTap]);
  const isDragging = dragLabel !== null;

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.time}. Press and hold to move it.`}
        style={[
          styles.timelineAppointment,
          {
            top,
            height,
            left: isDragging ? 0 : `${(column / columns) * 100}%`,
            width: isDragging ? '100%' : `${100 / columns}%`,
            backgroundColor,
            zIndex: isDragging ? 5 : 1,
            transform: [{ scale: isDragging ? 1.02 : 1 }],
            opacity: isDragging ? 0.95 : 1,
          },
          isDragging && styles.timelineAppointmentDragging,
        ]}
      >
        <Text numberOfLines={1} style={styles.timelineClient}>{isDragging ? `${dragLabel} · ${item.name}` : item.name}</Text>
        {/* A short appointment only has room for the name, then the service; the length is shown when all three fit. */}
        {height >= 40 && <Text numberOfLines={1} style={styles.timelineService}>{item.status === 'paid' ? `PAID · ${item.service}` : item.status === 'no_show' ? `NO-SHOW · ${item.service}` : item.depositDue ? `DEPOSIT DUE · ${item.service}` : item.service}</Text>}
        {height >= 56 && <Text numberOfLines={1} style={styles.timelineDuration}>{item.duration}</Text>}
      </View>
    </GestureDetector>
  );
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookings, loading, error, refresh, rescheduleBooking, calendarDate: selectedDate, setCalendarDate, timeZone } = useBookingData();
  // "Today" and "now" are the business's, not the phone's. `now` ticks on every new minute so the red time line moves
  // down the day (and "today" rolls over at midnight); it was read once and stayed where the app was opened.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50); };
    timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => clearTimeout(timer);
  }, []);
  const todayKey = dateKey(businessToday(timeZone));
  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  const [pendingDrop, setPendingDrop] = useState<{ item: AppointmentRecord; minutes: number } | null>(null);
  const [notifyClient, setNotifyClient] = useState(true);
  const [savingDrop, setSavingDrop] = useState(false);
  const [dropError, setDropError] = useState('');
  // Booking requests waiting for an answer (Settings → Booking approval): shown as a banner above the calendar.
  const [openRequests, setOpenRequests] = useState(0);
  useFocusEffect(useCallback(() => {
    void refresh();
    listBookingRequests().then((rows) => setOpenRequests(rows.filter((row) => row.status === 'requested').length)).catch(() => setOpenRequests(0));
  }, [refresh]));

  // The day strip and Week view start with TODAY in the first spot (owner, 2026-11-03), not on Monday: seven days from
  // today, then the next seven, and so on — the window holding the chosen day.
  const days = useMemo(() => {
    const today = businessToday(timeZone);
    const dayNumber = (d: Date) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
    const weeksAway = Math.floor((dayNumber(selectedDate) - dayNumber(today)) / 7);
    const first = new Date(today);
    first.setDate(today.getDate() + weeksAway * 7);
    first.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [selectedDate, timeZone, todayKey]); // todayKey: the window moves on at midnight
  const cells = useMemo(() => monthCells(selectedDate), [selectedDate]);
  // Bookings are loaded for the whole month grid; each view picks out its own days.
  const bookingsByDay = useMemo(() => {
    const byDay: Record<string, AppointmentRecord[]> = {};
    // A cancelled booking leaves the calendar (its time is free again); a no-show stays, labelled.
    for (const item of [...bookings].filter((b) => b.status !== 'cancelled').sort((a, b) => new Date(a.dateIso).getTime() - new Date(b.dateIso).getTime())) (byDay[item.dateKey] ??= []).push(item);
    return byDay;
  }, [bookings]);
  const selectedKey = dateKey(selectedDate);
  // Blocked time (personal time, days off) on the chosen day, drawn behind the bookings (owner, 2026-11-03).
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const loadBlocks = useCallback(() => {
    const from = zonedMoment(selectedDate, 0, timeZone);
    const next = new Date(selectedDate); next.setDate(next.getDate() + 1);
    const to = zonedMoment(next, 0, timeZone);
    api.get<TimeBlock[]>(`/api/time-blocks?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then((rows) => setBlocks(Array.isArray(rows) ? rows : [])).catch(() => setBlocks([]));
  }, [selectedDate, timeZone]);
  useFocusEffect(loadBlocks);
  const removeBlock = (b: TimeBlock) => Alert.alert('Remove this blocked time?', b.note ?? undefined, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { void api.del(`/api/time-blocks/${b.id}`).then(loadBlocks).catch(() => undefined); } },
  ]);
  // + : a booking, or blocked time.
  const addSomething = () => Alert.alert('Add to your calendar', undefined, [
    { text: 'New booking', onPress: () => router.push({ pathname: '/booking', params: { day: selectedKey } }) },
    { text: 'Block time', onPress: () => router.push({ pathname: '/block-time', params: { day: selectedKey } }) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const appointments = useMemo(() => bookingsByDay[selectedKey] ?? [], [bookingsByDay, selectedKey]);
  const columnsById = useMemo(() => overlapColumns(appointments), [appointments]);
  // The whole day, midnight to midnight (owner, 2026-11-03); opening a day scrolls to now / the first booking / 9 AM.
  const { timelineStart, timelineEnd, timelineHours } = useMemo(() => {
    const start = 0;
    const end = 24 * 60;
    return { timelineStart: start, timelineEnd: end, timelineHours: Array.from({ length: (end - start) / 60 }, (_, index) => start + index * 60) };
  }, []);
  const timelineHeight = ((timelineEnd - timelineStart) / 60) * HOUR_HEIGHT;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const todayIsSelected = selectedKey === todayKey;

  // ── The day timeline's own scroll ───────────────────────────────────────────────────────────────────
  // Only the timeline scrolls; the header above it stays put. While a booking is dragged the timeline stops
  // scrolling by hand and instead scrolls itself when the finger nears its top or bottom edge.
  const scrollRef = useRef<RNScrollView>(null);
  const scrollY = useRef(0);
  const viewport = useRef({ pageY: 0, height: 0 });
  const viewportView = useRef<View>(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const measureViewport = useCallback(() => {
    viewportView.current?.measureInWindow((_x, y, _w, h) => { viewport.current = { pageY: y, height: h }; });
  }, []);

  // Opening a day scrolls it to where the action is: now (today), else the first booking, else 9 AM.
  const scrolledFor = useRef('');
  useEffect(() => {
    if (viewMode !== 'Day' || loading || scrolledFor.current === selectedKey) return;
    scrolledFor.current = selectedKey;
    const nowMinutes = zonedMinutes(new Date(), timeZone);
    const target = todayIsSelected ? nowMinutes - 60 : appointments.length > 0 ? startMinutes(appointments[0]) - 30 : 9 * 60;
    const y = Math.max(0, timelineTop(target, timelineStart));
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
  }, [appointments, loading, selectedKey, timeZone, timelineStart, todayIsSelected, viewMode]);
  useEffect(() => { if (viewMode !== 'Day') scrolledFor.current = ''; }, [viewMode]);

  // ── Dragging ────────────────────────────────────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<{ id: string; minutes: number } | null>(null);
  const dragState = useRef<{ item: AppointmentRecord; startTop: number; startScroll: number; translationY: number; absoluteY: number; minutes: number } | null>(null);
  const autoScroll = useRef<ReturnType<typeof setInterval> | null>(null);

  const placeDrag = useCallback(() => {
    const state = dragState.current;
    if (!state) return;
    const offset = state.startTop + state.translationY + (scrollY.current - state.startScroll);
    const minutes = clampDropMinutes(timelineStart + (offset / HOUR_HEIGHT) * 60, durationMinutes(state.item.duration), timelineStart, timelineEnd);
    if (minutes !== state.minutes) {
      state.minutes = minutes;
      setDrag({ id: state.item.id, minutes });
      if (minutes % 15 === 0) void Haptics.selectionAsync().catch(() => undefined);
    }
  }, [timelineEnd, timelineStart]);

  const stopAutoScroll = () => { if (autoScroll.current) { clearInterval(autoScroll.current); autoScroll.current = null; } };

  const startDrag = useCallback((item: AppointmentRecord) => {
    measureViewport();
    const minutes = startMinutes(item);
    dragState.current = { item, startTop: timelineTop(minutes, timelineStart), startScroll: scrollY.current, translationY: 0, absoluteY: 0, minutes };
    setDrag({ id: item.id, minutes });
    setScrollEnabled(false);
    setDropError('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    stopAutoScroll();
    autoScroll.current = setInterval(() => {
      const state = dragState.current;
      const { pageY, height } = viewport.current;
      if (!state || height <= 0 || state.absoluteY <= 0) return;
      const edge = 56;
      // The tab bar covers the bottom of the timeline, so the lower edge is measured above it.
      const visibleBottom = pageY + height - (insets.bottom + 50);
      const step = state.absoluteY < pageY + edge ? -8 : state.absoluteY > visibleBottom - edge ? 8 : 0;
      if (step === 0) return;
      const maxY = Math.max(0, timelineHeight + TIMELINE_BOTTOM_PADDING - height);
      const next = Math.min(maxY, Math.max(0, scrollY.current + step));
      if (next === scrollY.current) return;
      scrollY.current = next;
      scrollRef.current?.scrollTo({ y: next, animated: false });
      placeDrag();
    }, 16);
  }, [insets.bottom, measureViewport, placeDrag, timelineHeight, timelineStart]);

  const moveDrag = useCallback((translationY: number, absoluteY: number) => {
    const state = dragState.current;
    if (!state) return;
    state.translationY = translationY;
    state.absoluteY = absoluteY;
    placeDrag();
  }, [placeDrag]);

  const endDrag = useCallback((item: AppointmentRecord, completed: boolean) => {
    const state = dragState.current;
    if (!state || state.item.id !== item.id) return;
    dragState.current = null;
    stopAutoScroll();
    setScrollEnabled(true);
    setDrag(null);
    if (completed && state.minutes !== startMinutes(item)) {
      setPendingDrop({ item, minutes: state.minutes });
      setNotifyClient(true);
      setDropError('');
    }
  }, []);
  useEffect(() => () => stopAutoScroll(), []);

  const shiftDate = (amount: number) => {
    const next = new Date(selectedDate);
    if (viewMode === 'Month') next.setMonth(next.getMonth() + amount);
    else if (viewMode === 'Week') next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCalendarDate(next);
  };

  const selectDate = (date: Date, openDay = false) => {
    setCalendarDate(date);
    if (openDay) setViewMode('Day');
  };

  const monthTitle = viewMode === 'Week'
    ? `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const openAppointment = useCallback((item: AppointmentRecord) => {
    if (item.appointmentId > 0) router.push(appointmentParams(item));
  }, [router]);

  const confirmDrop = async () => {
    if (!pendingDrop) return;
    setSavingDrop(true);
    setDropError('');
    const nextDate = zonedMoment(selectedDate, pendingDrop.minutes, timeZone);
    try {
      await rescheduleBooking(pendingDrop.item.appointmentId, nextDate.toISOString(), durationMinutes(pendingDrop.item.duration), notifyClient);
      setPendingDrop(null);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : 'Could not reschedule appointment.');
    } finally {
      setSavingDrop(false);
    }
  };

  const nowTop = timelineTop(zonedMinutes(now, timeZone), timelineStart);

  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      {/* Fixed header: it never scrolls. */}
      <View style={styles.fixedHeader}>
        <HelpTitle help="calendar" style={[styles.pageTitle, { color: colors.foreground }]}>Calendar</HelpTitle>
        {openRequests > 0 ? (
          <TouchableOpacity testID="calendar-requests-banner" onPress={() => router.push('/requests')} style={[styles.requestsBanner, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <Text style={[styles.requestsText, { color: colors.foreground }]}>{openRequests === 1 ? '1 booking request is waiting for you' : `${openRequests} booking requests are waiting for you`}</Text>
            <Feather name="chevron-right" size={19} color={colors.foreground} />
          </TouchableOpacity>
        ) : null}
        <View style={styles.header}>
          <View style={[styles.segmentedControl, { borderColor: colors.border, backgroundColor: colors.card }]}>
            {(['Month', 'Week', 'Day'] as ViewMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                testID={`calendar-view-${mode.toLowerCase()}`}
                accessibilityRole="button"
                accessibilityState={{ selected: viewMode === mode }}
                onPress={() => setViewMode(mode)}
                style={[styles.segment, viewMode === mode && { backgroundColor: colors.primary }]}
              >
                <Text style={[styles.segmentText, { color: viewMode === mode ? colors.primaryForeground : colors.mutedForeground }]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity testID="calendar-refresh" accessibilityLabel="Refresh calendar" onPress={() => void refresh()} style={styles.iconButton}>
              <Feather name="refresh-cw" size={19} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity testID="add-appointment" accessibilityLabel="Add appointment" onPress={addSomething} style={[styles.addButton, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={24} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dateHeader}>
          <TouchableOpacity testID="previous-calendar-period" accessibilityLabel="Previous period" onPress={() => shiftDate(-1)} style={styles.chevronButton}>
            <Feather name="chevron-left" size={21} color={colors.foreground} />
          </TouchableOpacity>
          <HelpTitle help="calendar" style={[styles.monthTitle, { color: colors.foreground }]}>{monthTitle}</HelpTitle>
          <TouchableOpacity testID="next-calendar-period" accessibilityLabel="Next period" onPress={() => shiftDate(1)} style={styles.chevronButton}>
            <Feather name="chevron-right" size={21} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {viewMode === 'Day' && (
          <>
            <View style={styles.weekStrip}>
              {days.map((day) => {
                const active = dateKey(day) === selectedKey;
                const today = dateKey(day) === todayKey;
                const booked = (bookingsByDay[dateKey(day)]?.length ?? 0) > 0;
                return (
                  <TouchableOpacity key={dateKey(day)} testID={`calendar-day-${day.getDate()}`} onPress={() => selectDate(day)} style={[styles.dayCell, active && { backgroundColor: colors.primary }]}>
                    <Text style={[styles.dayName, { color: active ? colors.primaryForeground : today ? colors.primary : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</Text>
                    <Text style={[styles.dayNumber, { color: active ? colors.primaryForeground : today ? colors.primary : colors.foreground }]}>{day.getDate()}</Text>
                    <View style={[styles.dayDot, { backgroundColor: !booked ? 'transparent' : active ? colors.primaryForeground : colors.primary }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.scheduleMeta}>
              <Text style={[styles.scheduleCount, { color: colors.mutedForeground }]}>
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · {appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}
              </Text>
              {appointments.length > 0 ? <Text style={[styles.scheduleHint, { color: colors.mutedForeground }]}>Hold a booking to move it</Text> : null}
            </View>
          </>
        )}
        {error ? <View style={[styles.syncNotice, { backgroundColor: colors.secondary }]}><Feather name="info" size={16} color={colors.primary} /><Text style={[styles.syncText, { color: colors.secondaryForeground }]}>Could not load your calendar from Certxa. Tap refresh to try again.</Text></View> : null}
      </View>

      {/* Scrolling body. */}
      {viewMode === 'Month' ? (
        <RNScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.monthGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.weekdayRow}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((weekday, index) => <Text key={`${weekday}-${index}`} style={[styles.weekdayLabel, { color: colors.mutedForeground }]}>{weekday}</Text>)}
            </View>
            <View style={styles.monthCells}>
              {cells.map((day) => {
                const inMonth = day.getMonth() === selectedDate.getMonth();
                const active = dateKey(day) === selectedKey;
                const isToday = dateKey(day) === todayKey;
                const hasBookings = (bookingsByDay[dateKey(day)]?.length ?? 0) > 0;
                return (
                  <TouchableOpacity key={dateKey(day)} onPress={() => selectDate(day, true)} style={styles.monthCell}>
                    <View style={[styles.monthNumber, active && { backgroundColor: colors.primary }]}>
                      <Text style={[styles.monthNumberText, { color: active ? colors.primaryForeground : isToday ? colors.primary : inMonth ? colors.foreground : colors.mutedForeground }]}>{day.getDate()}</Text>
                    </View>
                    <View style={[styles.monthDot, { backgroundColor: !hasBookings ? 'transparent' : active ? colors.primary : colors.primary }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </RNScrollView>
      ) : viewMode === 'Week' ? (
        <RNScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
          <View style={styles.weekAgenda}>
            {days.map((day) => {
              const dayAppointments = bookingsByDay[dateKey(day)] ?? [];
              const active = dateKey(day) === selectedKey;
              return (
                <TouchableOpacity key={dateKey(day)} onPress={() => selectDate(day, true)} style={[styles.weekDayRow, { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.card }]}>
                  <View style={styles.weekDayLabel}>
                    <Text style={[styles.weekDayName, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                    <Text style={[styles.weekDayNumber, { color: active ? colors.primary : colors.foreground }]}>{day.getDate()}</Text>
                  </View>
                  <View style={styles.weekDayEvents}>
                    {dayAppointments.length > 0 ? dayAppointments.slice(0, 3).map((item, index) => <View key={item.id} style={[styles.miniEvent, { backgroundColor: BOOKING_COLORS[index % BOOKING_COLORS.length] }]}><Text numberOfLines={1} style={styles.miniEventText}>{item.time} · {item.name}</Text></View>) : <Text style={[styles.noEvents, { color: colors.mutedForeground }]}>Open schedule</Text>}
                    {dayAppointments.length > 3 ? <Text style={[styles.noEvents, { color: colors.mutedForeground }]}>{`+${dayAppointments.length - 3} more`}</Text> : null}
                  </View>
                  <Feather name="chevron-right" size={19} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </View>
        </RNScrollView>
      ) : (
        <View ref={viewportView} onLayout={measureViewport} style={[styles.body, styles.dayBody, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <ScrollView
            ref={scrollRef}
            scrollEnabled={scrollEnabled}
            onScroll={(event) => { if (!dragState.current) scrollY.current = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: TIMELINE_BOTTOM_PADDING }}
          >
            <View style={[styles.timeline, { height: timelineHeight }]}>
              <View style={[styles.timelineLabels, { backgroundColor: colors.muted }]}>
                {timelineHours.map((time) => <Text key={time} style={styles.timelineLabel}>{formatClock(time)}</Text>)}
              </View>
              <View style={[styles.timelineTrack, { backgroundColor: colors.card }]}>
                {timelineHours.map((time, index) => <View key={time} style={[styles.timelineLine, { top: index * HOUR_HEIGHT, backgroundColor: colors.border }]} />)}
                {timelineHours.map((time, index) => <View key={`half-${time}`} style={[styles.timelineHalfLine, { top: index * HOUR_HEIGHT + HOUR_HEIGHT / 2, backgroundColor: colors.border }]} />)}
                {blocks.map((b) => {
                  // The part of the block on this day, in business minutes.
                  const dayStart = zonedMoment(selectedDate, 0, timeZone).getTime();
                  const startMin = Math.max(0, (new Date(b.startsAt).getTime() - dayStart) / 60000);
                  const endMin = Math.min(24 * 60, (new Date(b.endsAt).getTime() - dayStart) / 60000);
                  if (endMin <= startMin) return null;
                  return (
                    <TouchableOpacity key={`block-${b.id}`} onPress={() => removeBlock(b)} activeOpacity={0.8} testID={`time-block-${b.id}`}
                      style={[styles.timeBlock, { top: timelineTop(startMin, timelineStart), height: Math.max(22, ((endMin - startMin) / 60) * HOUR_HEIGHT - 3), backgroundColor: colors.muted, borderColor: colors.border }]}>
                      <Text numberOfLines={1} style={[styles.timeBlockText, { color: colors.mutedForeground }]}>{b.allDay ? 'Day off' : 'Blocked'}{b.note ? ` · ${b.note}` : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
                {appointments.map((item, index) => {
                  const isDragged = drag?.id === item.id;
                  const top = timelineTop(isDragged ? drag.minutes : startMinutes(item), timelineStart);
                  // The box is as tall as the appointment is long, so one never runs over the next unless they really overlap.
                  const height = Math.max(26, (durationMinutes(item.duration) / 60) * HOUR_HEIGHT - 3);
                  const place = columnsById[item.id] ?? { column: 0, columns: 1 };
                  return (
                    <DraggableAppointment
                      key={item.id}
                      item={item}
                      top={top}
                      height={height}
                      column={place.column}
                      columns={place.columns}
                      backgroundColor={BOOKING_COLORS[index % BOOKING_COLORS.length]}
                      dragLabel={isDragged ? formatClock(drag.minutes) : null}
                      onTap={openAppointment}
                      onDragStart={startDrag}
                      onDragMove={moveDrag}
                      onDragEnd={endDrag}
                    />
                  );
                })}
                {todayIsSelected && nowTop >= 0 && nowTop <= timelineHeight && <View pointerEvents="none" style={[styles.currentTime, { top: nowTop, backgroundColor: colors.primary }]} />}
              </View>
            </View>
          </ScrollView>
          {appointments.length === 0 && !loading && <View pointerEvents="none" style={styles.timelineEmpty}><Feather name="sun" size={20} color="#A9ACC0" /><Text style={styles.timelineEmptyText}>Your schedule is open</Text></View>}
        </View>
      )}
      <Modal transparent animationType="fade" visible={Boolean(pendingDrop)} onRequestClose={() => !savingDrop && setPendingDrop(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.rescheduleModal, { backgroundColor: colors.card }]}>
            <View style={styles.modalIcon}><Feather name="calendar" size={20} color={colors.primary} /></View>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Reschedule appointment?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              {pendingDrop?.item.name} · {pendingDrop ? formatClock(pendingDrop.minutes) : ''}
            </Text>
            <View style={[styles.newTimeCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.newTimeLabel, { color: colors.mutedForeground }]}>NEW TIME</Text>
              <Text style={[styles.newTimeValue, { color: colors.foreground }]}>{pendingDrop ? formatClock(pendingDrop.minutes) : ''}</Text>
            </View>
            <View style={styles.notifyRow}>
              <View style={styles.notifyCopy}>
                <Text style={[styles.notifyTitle, { color: colors.foreground }]}>Notify client</Text>
                <Text style={[styles.notifySubtitle, { color: colors.mutedForeground }]}>Choose whether to send an update.</Text>
              </View>
              <Switch value={notifyClient} onValueChange={setNotifyClient} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" />
            </View>
            {dropError ? <Text style={[styles.dropError, { color: colors.destructive }]}>{dropError}</Text> : null}
            <TouchableOpacity disabled={savingDrop} onPress={() => void confirmDrop()} style={[styles.confirmDropButton, { backgroundColor: colors.primary, opacity: savingDrop ? 0.65 : 1 }]}>
              <Text style={[styles.confirmDropText, { color: colors.primaryForeground }]}>{savingDrop ? 'Saving…' : 'Reschedule appointment'}</Text>
              <Feather name="arrow-right" size={19} color={colors.primaryForeground} />
            </TouchableOpacity>
            <TouchableOpacity disabled={savingDrop} onPress={() => setPendingDrop(null)} style={styles.cancelDropButton}>
              <Text style={[styles.cancelDropText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  timeBlock: { position: 'absolute', left: 4, right: 4, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 10, paddingTop: 4 },
  timeBlockText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  root: { flex: 1 },
  fixedHeader: { paddingHorizontal: 18, paddingTop: 4 },
  requestsBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 10 },
  requestsText: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 18, paddingBottom: 112 },
  dayBody: { marginHorizontal: 18, borderWidth: 1, borderBottomWidth: 0, borderTopLeftRadius: 14, borderTopRightRadius: 14, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  iconButton: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentedControl: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, padding: 2, flexShrink: 1 },
  segment: { minWidth: 48, paddingVertical: 8, paddingHorizontal: 7, borderRadius: 7, alignItems: 'center' },
  segmentText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  todayHint: { fontSize: 15, fontFamily: 'Inter_500Medium', marginRight: 2 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chevronButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 38, fontFamily: 'Inter_700Bold', letterSpacing: -0.8, paddingTop: 6, paddingBottom: 10 },
  monthTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.35 },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 },
  dayCell: { width: 42, alignItems: 'center', paddingVertical: 6, borderRadius: 14, gap: 5 },
  dayName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dayNumber: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  monthGrid: { borderWidth: 1, borderRadius: 18, padding: 11, overflow: 'hidden' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 5 },
  weekdayLabel: { width: '14.28%', textAlign: 'center', fontSize: 13, fontFamily: 'Inter_700Bold' },
  monthCells: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '14.28%', height: 58, alignItems: 'center', paddingTop: 7 },
  monthNumber: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monthNumberText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  monthDot: { width: 4, height: 4, borderRadius: 2, marginTop: 5 },
  weekAgenda: { gap: 9 },
  weekDayRow: { minHeight: 69, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  weekDayLabel: { width: 44, alignItems: 'center' },
  weekDayName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  weekDayNumber: { fontSize: 21, fontFamily: 'Inter_700Bold', marginTop: 2 },
  weekDayEvents: { flex: 1, gap: 4 },
  miniEvent: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 7 },
  miniEventText: { color: '#1E2240', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  noEvents: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  // The hint drops under the date when both don't fit (they ran together on a phone, 2026-11-11).
  scheduleMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 2, marginBottom: 8 },
  scheduleHint: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  scheduleCount: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  syncNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  syncText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  timeline: { flexDirection: 'row' },
  timelineLabels: { width: 88 },
  timelineLabel: { height: HOUR_HEIGHT, paddingTop: 2, paddingRight: 9, textAlign: 'right', color: '#3D4160', fontSize: 15, fontFamily: 'Inter_700Bold' },
  timelineTrack: { flex: 1, position: 'relative' },
  timelineLine: { height: 1, left: 0, right: 0, position: 'absolute' },
  timelineHalfLine: { height: StyleSheet.hairlineWidth, left: 0, right: 0, position: 'absolute', opacity: 0.6 },
  timelineAppointment: { position: 'absolute', borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 9, paddingVertical: 3, justifyContent: 'center', overflow: 'hidden' },
  timelineAppointmentDragging: { shadowColor: '#2E1065', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  timelineClient: { color: '#1E2240', fontSize: 15, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  timelineService: { color: '#1E2240', fontSize: 14, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  timelineDuration: { color: '#5B5F78', fontSize: 13, lineHeight: 17, fontFamily: 'Inter_500Medium', marginTop: 2 },
  timelineEmpty: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', gap: 8 },
  timelineEmptyText: { color: '#A9ACC0', fontSize: 15, fontFamily: 'Inter_500Medium' },
  currentTime: { position: 'absolute', left: 0, right: 0, height: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(17, 21, 46, 0.42)', justifyContent: 'center', padding: 20 },
  rescheduleModal: { borderRadius: 22, padding: 20, shadowColor: '#2E1065', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  modalIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#ECE5FD', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.3 },
  modalSubtitle: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 5 },
  newTimeCard: { borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 18, marginBottom: 16 },
  newTimeLabel: { fontSize: 12, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  newTimeValue: { fontSize: 22, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 5 },
  notifyCopy: { flex: 1 },
  notifyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  notifySubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 3 },
  dropError: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 10 },
  confirmDropButton: { minHeight: 48, borderRadius: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 19 },
  confirmDropText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  cancelDropButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  cancelDropText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});