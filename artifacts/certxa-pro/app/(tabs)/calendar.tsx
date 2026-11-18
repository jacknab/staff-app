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
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppBackground } from '@/components/look/AppBackground';
import { MenuCard } from '@/components/look/MenuCard';
import { SectionHeader } from '@/components/look/SectionHeader';
import { APP_MAX_WIDTH } from '@/components/TabletFrame';
import { useIsTablet } from '@/components/TabletLauncher';
import { look } from '@/components/look/tokens';
type TimeBlock = { id: number; startsAt: string; endsAt: string; allDay: boolean; note: string | null };

type ViewMode = 'Month' | 'Week' | 'Day';

const BOOKING_COLORS = ['#ECE5FD', '#F9E1BC', '#F3D4DE', '#DEE4F4'];
/** The Week view's status tags, as the website's week view shows them (booking WeeklyAgendaView.tsx). */
const WEEK_STATUS: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#EFF6FF', text: '#3B82F6', label: 'Booked' },
  confirmed: { bg: '#ECFDF5', text: '#0D9488', label: 'Confirmed' },
  started: { bg: '#FEFCE8', text: '#A16207', label: 'In Progress' },
  completed: { bg: '#F3F4F6', text: '#6B7280', label: 'Done' },
  paid: { bg: '#F3F4F6', text: '#6B7280', label: 'Paid' },
  no_show: { bg: '#FFF1F2', text: '#E11D48', label: 'No Show' },
  late: { bg: '#FFF7ED', text: '#C2410C', label: 'Late' },
};
/** A booking with no start time is drawn here (the day view itself shows all 24 hours). */
const DEFAULT_START = 6 * 60;
/** How long a booking has to be held before it can be dragged. */
const LONG_PRESS_MS = 300;
/** Room under the timeline so its last hour can scroll clear of the tab bar. */
const TIMELINE_BOTTOM_PADDING = 110;
// Room for a label at every quarter hour (owner, 2026-11-11: 11am, 15, 30, 45 down the side, well spaced).
const HOUR_HEIGHT = 160;
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
          item.processing ? { justifyContent: 'flex-start' } : null,
        ]}
      >
        {/* Processing time (2026-11-18): the part where the client waits, lighter, so another booking can sit beside it. */}
        {item.processing && item.processingStart ? (
          <View pointerEvents="none" style={[styles.processingBand, { top: (item.processingStart / 60) * HOUR_HEIGHT, height: (item.processing / 60) * HOUR_HEIGHT }]}>
            {(item.processing / 60) * HOUR_HEIGHT >= 22 ? <Text numberOfLines={1} style={styles.processingText}>Processing</Text> : null}
          </View>
        ) : null}
        <Text numberOfLines={1} style={styles.timelineClient}>{isDragging ? `${dragLabel} · ${item.name}` : item.name}</Text>
        {/* A short appointment only has room for the name, then the service; the length is shown when all three fit. */}
        {height >= 40 && <Text numberOfLines={1} style={styles.timelineService}>{item.status === 'paid' ? `PAID · ${item.service}` : item.status === 'no_show' ? `NO-SHOW · ${item.service}` : item.depositDue ? `DEPOSIT DUE · ${item.service}` : item.clientConfirmed ? `CONFIRMED · ${item.service}` : item.service}</Text>}
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
  // The Day view's time grid (owner, 2026-11-18, GlossGenius): a line and a label every 10, 15, 30 or 60 minutes. Kept
  // on this phone.
  const [gridMinutes, setGridMinutes] = useState(15);
  useEffect(() => { AsyncStorage.getItem('calendar.gridMinutes').then((v) => { if ([10, 15, 30, 60].includes(Number(v))) setGridMinutes(Number(v)); }).catch(() => undefined); }, []);
  // Time grid (owner, 2026-11-19): a setting in the + overlay; kept on this phone.
  const pickGrid = (m: number) => { setGridMinutes(m); void AsyncStorage.setItem('calendar.gridMinutes', String(m)).catch(() => undefined); };
  const chooseGrid = () => Alert.alert('Time grid', 'How often the Day view draws a line and a time label.', [
    ...[10, 15, 30, 60].map((m) => ({ text: `Every ${m} minutes${m === gridMinutes ? ' (now)' : ''}`, onPress: () => { setAddOpen(false); pickGrid(m); } })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
  const steps = Array.from({ length: 60 / gridMinutes }, (_, q) => q);
  const stepPx = HOUR_HEIGHT / steps.length;
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
  // The + button (owner, 2026-11-18): an overlay in the More page's style with what to add and the calendar views.
  const [addOpen, setAddOpen] = useState(false);
  // Tablets (owner, 2026-11-19): a bigger + and a taller sheet that opens over the calendar's own side of the screen
  // (the right half next to Home), not the middle.
  const isTablet = useIsTablet();
  // Bigger buttons, dates and booking cards on tablets (owner, 2026-11-19: easy to tap and read).
  const tb: Partial<typeof tabletStyles> = isTablet ? tabletStyles : {};
  const rootRef = useRef<View>(null);
  const [sheetSpot, setSheetSpot] = useState<{ x: number; width: number } | null>(null);
  const addSomething = () => {
    if (isTablet) rootRef.current?.measureInWindow((x, _y, width) => setSheetSpot({ x, width }));
    setAddOpen(true);
  };
  const goAdd = (pathname: '/booking' | '/block-time') => { setAddOpen(false); router.push({ pathname, params: { day: selectedKey } }); };
  const pickView = (mode: ViewMode) => { setAddOpen(false); setViewMode(mode); setMonthDay(null); };
  // Month view (owner, 2026-11-19): the month grid with the month's bookings listed as the Week view lists them; a tapped
  // day narrows the list to that day, tapping it again shows the whole month. Side by side when the calendar is wide
  // enough (tablets), the list under the grid when it isn't (phones).
  const [monthDay, setMonthDay] = useState<string | null>(null);
  const [rootWidth, setRootWidth] = useState(0);
  const monthSideBySide = rootWidth >= 700;
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
    if (viewMode === 'Month') { next.setMonth(next.getMonth() + amount); setMonthDay(null); }
    else if (viewMode === 'Week') next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCalendarDate(next);
  };

  const pickMonthDay = (date: Date) => {
    if (monthDay === dateKey(date)) { setMonthDay(null); return; }
    setCalendarDate(date);
    setMonthDay(dateKey(date));
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
  // One day as the Week view shows it: a date badge, the day's name and count, then its bookings as cards.
  const dayGroup = (day: Date, index: number) => {
    const dayAppointments = bookingsByDay[dateKey(day)] ?? [];
    const isToday = dateKey(day) === todayKey;
    const isPast = dateKey(day) < todayKey;
    return (
      <View key={dateKey(day)} style={[styles.weekDay, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
        <TouchableOpacity onPress={() => selectDate(day, true)} style={[styles.weekDayHeader, tb.weekDayHeader, { backgroundColor: isToday ? `${colors.primary}0D` : isPast ? colors.muted : colors.card }]}>
          <View style={[styles.weekBadge, tb.weekBadge, { backgroundColor: isToday ? colors.primary : colors.muted }]}>
            <Text style={[styles.weekBadgeDay, tb.weekBadgeDay, { color: isToday ? colors.primaryForeground : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</Text>
            <Text style={[styles.weekBadgeNumber, tb.weekBadgeNumber, { color: isToday ? colors.primaryForeground : isPast ? colors.mutedForeground : colors.foreground }]}>{day.getDate()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.weekDayTitle, tb.weekDayTitle, { color: isToday ? colors.primary : isPast ? colors.mutedForeground : colors.foreground }]}>
              {isToday ? 'Today' : day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </Text>
            <Text style={[styles.weekDayCount, tb.weekDayCount, { color: colors.mutedForeground }]}>{dayAppointments.length === 0 ? 'No appointments' : `${dayAppointments.length} appointment${dayAppointments.length === 1 ? '' : 's'}`}</Text>
          </View>
          {isToday ? <View style={[styles.todayPill, { backgroundColor: colors.primary }]}><Text style={[styles.todayPillText, tb.todayPillText, { color: colors.primaryForeground }]}>Today</Text></View> : null}
        </TouchableOpacity>
        {dayAppointments.length === 0 ? (
          <View style={styles.weekEmpty}>
            <View style={[styles.weekEmptyBar, { backgroundColor: colors.border }]} />
            <Text style={[styles.weekEmptyText, tb.weekEmptyText, { color: colors.mutedForeground }]}>No bookings</Text>
          </View>
        ) : (
          <View style={styles.weekCards}>
            {dayAppointments.map((item) => {
              const minutes = Number(String(item.duration).match(/\d+/)?.[0] ?? 60);
              const status = item.status === 'pending' && item.clientConfirmed ? WEEK_STATUS.confirmed : WEEK_STATUS[item.status] ?? WEEK_STATUS.pending;
              return (
                <TouchableOpacity key={item.id} onPress={() => openAppointment(item)} style={[styles.weekCard, tb.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`week-appt-${item.appointmentId}`}>
                  <View style={[styles.weekStripe, tb.weekStripe, { backgroundColor: item.serviceColor ?? colors.primary }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.weekCardTop}>
                      <View style={[styles.weekTime, tb.weekTime, tb.weekTime]}>
                        <Feather name="clock" size={isTablet ? 15 : 12} color={colors.mutedForeground} />
                        <Text style={[styles.weekTimeText, tb.weekTimeText, { color: colors.mutedForeground }]}>{formatClock(item.startMinutes)} – {formatClock(item.startMinutes + minutes)}</Text>
                      </View>
                      <View style={[styles.weekStatus, tb.weekStatus, { backgroundColor: status.bg }]}><Text style={[styles.weekStatusText, tb.weekStatusText, { color: status.text }]}>{status.label}</Text></View>
                    </View>
                    <Text numberOfLines={1} style={[styles.weekName, tb.weekName, { color: colors.foreground }]}>{item.name.split(' ')[0] || item.name}</Text>
                    <Text numberOfLines={1} style={[styles.weekService, tb.weekService, { color: colors.mutedForeground }]}>{item.service}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  return (
    <View ref={rootRef} onLayout={(e) => setRootWidth(e.nativeEvent.layout.width)} style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setAddOpen(false)} style={styles.overlayBackdrop} accessibilityLabel="Close">
          <TouchableOpacity activeOpacity={1} onPress={() => undefined} testID="calendar-add-overlay" style={[styles.overlayPanel, { backgroundColor: look.pageTop, paddingBottom: Math.max(insets.bottom, 18) }, isTablet && styles.overlayPanelTablet,
            isTablet && sheetSpot ? { alignSelf: 'flex-start', marginLeft: sheetSpot.x, width: sheetSpot.width, maxWidth: sheetSpot.width } : null]}>
            <View style={styles.overlayHead}>
              <Text style={[styles.overlayTitle, { color: look.heading }]}>Calendar</Text>
              <TouchableOpacity testID="calendar-add-close" accessibilityLabel="Close" onPress={() => setAddOpen(false)} style={[styles.iconButton, tb.iconButton, tb.iconButton]}>
                <Feather name="x" size={24} color={look.heading} />
              </TouchableOpacity>
            </View>
            <RNScrollView contentContainerStyle={{ paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
              <SectionHeader title="Add" />
              <View style={styles.overlayGroup}>
                <MenuCard testID="calendar-add-booking" icon={{ feather: 'calendar' }} title="New booking" subtitle="Book a client on this day" onPress={() => goAdd('/booking')} />
                <MenuCard testID="calendar-add-block" icon={{ feather: 'slash' }} title="Block time" subtitle="Time off, breaks or personal time" onPress={() => goAdd('/block-time')} />
              </View>
              <SectionHeader title="Calendar view" />
              <View style={styles.overlayGroup}>
                {([['Day', 'clock', 'One day, hour by hour'], ['Week', 'columns', 'Seven days, with every booking'], ['Month', 'grid', 'The whole month at a glance']] as const).map(([mode, icon, line]) => (
                  <MenuCard key={mode} testID={`calendar-view-${mode.toLowerCase()}`} icon={{ feather: icon }} title={mode}
                    subtitle={viewMode === mode ? `Showing now · ${line}` : line} onPress={() => pickView(mode)} />
                ))}
              </View>
              <SectionHeader title="Settings" />
              <View style={styles.overlayGroup}>
                <MenuCard testID="calendar-time-grid" icon={{ feather: 'align-justify' }} title="Time grid" subtitle={`Every ${gridMinutes} minutes · the Day view’s lines and labels`} onPress={chooseGrid} />
              </View>
            </RNScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* Fixed header: it never scrolls. */}
      <View style={styles.fixedHeader}>
        {/* The Clients page's heading style (owner, 2026-11-18): a small purple line above the big title. */}
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR SCHEDULE</Text>
            <HelpTitle help="calendar" style={[styles.pageTitle, { color: colors.foreground }]}>Calendar</HelpTitle>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity testID="calendar-refresh" accessibilityLabel="Refresh calendar" onPress={() => void refresh()} style={[styles.iconButton, tb.iconButton, tb.iconButton]}>
              <Feather name="refresh-cw" size={isTablet ? 25 : 19} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity testID="add-appointment" accessibilityLabel="Add or change the view" onPress={addSomething} style={[styles.addButton, isTablet && styles.addButtonTablet, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={isTablet ? 32 : 24} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>
        {openRequests > 0 ? (
          <TouchableOpacity testID="calendar-requests-banner" onPress={() => router.push('/requests')} style={[styles.requestsBanner, { backgroundColor: colors.card, borderColor: colors.primary }]}>
            <Text style={[styles.requestsText, { color: colors.foreground }]}>{openRequests === 1 ? '1 booking request is waiting for you' : `${openRequests} booking requests are waiting for you`}</Text>
            <Feather name="chevron-right" size={19} color={colors.foreground} />
          </TouchableOpacity>
        ) : null}
        {/* The chosen day where the view tabs were (the views are in the + overlay now). */}
        <Text testID="calendar-day-summary" style={[styles.scheduleCount, styles.daySummary, { color: colors.mutedForeground }]}>
          {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })} · {appointments.length} {appointments.length === 1 ? 'appointment' : 'appointments'}
        </Text>

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
                  <TouchableOpacity key={dateKey(day)} testID={`calendar-day-${day.getDate()}`} onPress={() => selectDate(day)} style={[styles.dayCell, tb.dayCell, active && { backgroundColor: colors.primary }]}>
                    <Text style={[styles.dayName, tb.dayName, { color: active ? colors.primaryForeground : today ? colors.primary : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</Text>
                    <Text style={[styles.dayNumber, tb.dayNumber, { color: active ? colors.primaryForeground : today ? colors.primary : colors.foreground }]}>{day.getDate()}</Text>
                    <View style={[styles.dayDot, { backgroundColor: !booked ? 'transparent' : active ? colors.primaryForeground : colors.primary }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
        {error ? <View style={[styles.syncNotice, { backgroundColor: colors.secondary }]}><Feather name="info" size={16} color={colors.primary} /><Text style={[styles.syncText, { color: colors.secondaryForeground }]}>Could not load your calendar from Certxa. Tap refresh to try again.</Text></View> : null}
      </View>

      {/* Scrolling body. */}
      {viewMode === 'Month' ? (() => {
        const grid = (
    <View style={[styles.monthGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.weekdayRow}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((weekday, index) => <Text key={`${weekday}-${index}`} style={[styles.weekdayLabel, tb.weekdayLabel, { color: colors.mutedForeground }]}>{weekday}</Text>)}
      </View>
      <View style={styles.monthCells}>
        {cells.map((day) => {
          const inMonth = day.getMonth() === selectedDate.getMonth();
          const active = dateKey(day) === monthDay;
          const isToday = dateKey(day) === todayKey;
          const hasBookings = (bookingsByDay[dateKey(day)]?.length ?? 0) > 0;
          return (
            <TouchableOpacity key={dateKey(day)} testID={`month-day-${dateKey(day)}`} onPress={() => pickMonthDay(day)} style={[styles.monthCell, tb.monthCell, tb.monthCell]}>
              <View style={[styles.monthNumber, tb.monthNumber, active && { backgroundColor: colors.primary }]}>
                <Text style={[styles.monthNumberText, tb.monthNumberText, { color: active ? colors.primaryForeground : isToday ? colors.primary : inMonth ? colors.foreground : colors.mutedForeground }]}>{day.getDate()}</Text>
              </View>
              <View style={[styles.monthDot, { backgroundColor: !hasBookings ? 'transparent' : active ? colors.primary : colors.primary }]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
        );
        const monthDays = monthDay ? [selectedDate] : cells.filter((day) => day.getMonth() === selectedDate.getMonth() && (bookingsByDay[dateKey(day)]?.length ?? 0) > 0);
        const total = monthDays.reduce((sum, day) => sum + (bookingsByDay[dateKey(day)]?.length ?? 0), 0);
        const list = (
          <>
            <View style={[styles.weekSummary, tb.weekSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.weekSummaryTitle, tb.weekSummaryTitle, { color: colors.foreground }]}>
                {monthDay ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <Text style={[styles.weekSummaryCount, tb.weekSummaryCount, { color: colors.mutedForeground }]}>
                {total === 0 ? `No appointments ${monthDay ? 'this day' : 'this month'}` : `${total} appointment${total === 1 ? '' : 's'} ${monthDay ? 'this day' : 'this month'}`}
              </Text>
            </View>
            {monthDays.length ? <View testID="calendar-month-list" style={[styles.weekList, { backgroundColor: colors.card, borderColor: colors.border }]}>{monthDays.map((day, index) => dayGroup(day, index))}</View> : null}
          </>
        );
        return monthSideBySide ? (
          <View style={styles.monthSplit}>
            <RNScrollView style={styles.monthSplitGrid} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>{grid}</RNScrollView>
            <RNScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingLeft: 0 }]} showsVerticalScrollIndicator={false}>{list}</RNScrollView>
          </View>
        ) : (
          <RNScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false}>
            {grid}
            <View style={{ height: 14 }} />
            {list}
          </RNScrollView>
        );
      })() : viewMode === 'Week' ? (
        // The week as the website's /calendar shows it (owner, 2026-11-11; booking WeeklyAgendaView.tsx): a summary line,
        // then each day with its date badge and its bookings as cards (time, status, client, service).
        <RNScrollView style={styles.body} contentContainerStyle={styles.bodyContent} showsVerticalScrollIndicator={false} testID="calendar-week">
          {(() => {
            const total = days.reduce((sum, day) => sum + (bookingsByDay[dateKey(day)]?.length ?? 0), 0);
            const short = (d: Date, year = false) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) });
            return (
              <View style={[styles.weekSummary, tb.weekSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.weekSummaryTitle, tb.weekSummaryTitle, { color: colors.foreground }]}>{short(days[0])} – {short(days[6], true)}</Text>
                <Text style={[styles.weekSummaryCount, tb.weekSummaryCount, { color: colors.mutedForeground }]}>{total === 0 ? 'No appointments this week' : `${total} appointment${total === 1 ? '' : 's'} this week`}</Text>
              </View>
            );
          })()}
          <View style={[styles.weekList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {days.map((day, index) => dayGroup(day, index))}
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
              <View style={[styles.timelineLabels, { backgroundColor: colors.card }]}>
                {/* A label on every grid line: the hour as "11am", then the minutes (15, 30, 45 on a 15-minute grid). */}
                {timelineHours.flatMap((time, index) => steps.map((q) => (
                  // A label under the time-now pill is left out.
                  todayIsSelected && Math.abs(index * HOUR_HEIGHT + q * stepPx - nowTop) < 18 ? null : <Text key={`${time}-${q}`} style={[styles.timelineLabel, q === 0 ? styles.timelineHourLabel : { color: colors.mutedForeground }, { top: Math.max(0, index * HOUR_HEIGHT + q * stepPx - 8) }]}>
                    {q === 0 ? `${time / 60 % 12 || 12}${time / 60 >= 12 ? 'pm' : 'am'}` : String(q * gridMinutes)}
                  </Text>
                )))}
                {/* The time now, on the left end of the now line (owner, 2026-11-11). */}
                {todayIsSelected && nowTop >= 0 && nowTop <= timelineHeight ? (
                  <View pointerEvents="none" testID="calendar-now-time" style={[styles.nowPill, { top: nowTop - 11, backgroundColor: colors.primary }]}>
                    <Text style={[styles.nowPillText, { color: colors.primaryForeground }]}>{formatClock(zonedMinutes(now, timeZone)).replace(/ [AP]M$/, '')}</Text>
                  </View>
                ) : null}
              </View>
              <View style={[styles.timelineTrack, { backgroundColor: colors.card }]}>
                {timelineHours.flatMap((time, index) => steps.map((q) => <View key={`${time}-${q}`} style={[styles.timelineLine, q > 0 && styles.timelineQuarterLine, { top: index * HOUR_HEIGHT + q * stepPx, backgroundColor: colors.border }]} />))}
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
                      backgroundColor={item.serviceColor ?? BOOKING_COLORS[index % BOOKING_COLORS.length]}
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
  addButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  addButtonTablet: { width: 58, height: 58, borderRadius: 20 },
  todayHint: { fontSize: 15, fontFamily: 'Inter_500Medium', marginRight: 2 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chevronButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 38, fontFamily: 'Inter_700Bold', letterSpacing: -0.8, marginTop: 2 },
  eyebrow: { fontSize: 13, letterSpacing: 1.4, fontFamily: 'Inter_700Bold', paddingTop: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  daySummary: { fontSize: 16, fontFamily: 'Inter_400Regular', marginTop: 7, marginBottom: 12 },
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(17, 12, 34, 0.45)', justifyContent: 'flex-end' },
  overlayPanel: { width: '100%', maxWidth: APP_MAX_WIDTH, alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 14, maxHeight: '88%' },
  overlayPanelTablet: { maxHeight: '97%' },
  overlayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  overlayTitle: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  overlayGroup: { gap: 12 },
  monthTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.35 },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 },
  dayCell: { width: 42, alignItems: 'center', paddingVertical: 6, borderRadius: 14, gap: 5 },
  dayName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  dayNumber: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  monthSplit: { flex: 1, flexDirection: 'row' },
  monthSplitGrid: { flexGrow: 0, width: '48%', maxWidth: 480 },
  monthGrid: { borderWidth: 1, borderRadius: 18, padding: 11, overflow: 'hidden' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 5 },
  weekdayLabel: { width: '14.28%', textAlign: 'center', fontSize: 13, fontFamily: 'Inter_700Bold' },
  monthCells: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '14.28%', height: 58, alignItems: 'center', paddingTop: 7 },
  monthNumber: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monthNumberText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  monthDot: { width: 4, height: 4, borderRadius: 2, marginTop: 5 },
  weekAgenda: { gap: 9 },
  weekSummary: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  weekSummaryTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  weekSummaryCount: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 },
  weekList: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  weekDay: {},
  weekDayHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  weekBadge: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  weekBadgeDay: { fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 },
  weekBadgeNumber: { fontSize: 15, fontFamily: 'Inter_700Bold', lineHeight: 17 },
  weekDayTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  weekDayCount: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  todayPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  todayPillText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  weekEmpty: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  weekEmptyBar: { width: 1, height: 28, borderRadius: 1 },
  weekEmptyText: { fontSize: 13, fontStyle: 'italic', fontFamily: 'Inter_400Regular' },
  weekCards: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  weekCard: { flexDirection: 'row', gap: 11, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10 },
  weekStripe: { width: 4, borderRadius: 2, alignSelf: 'stretch', minHeight: 34 },
  weekCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  weekTime: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  weekTimeText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  weekStatus: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  weekStatusText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  weekName: { fontSize: 16, fontFamily: 'Inter_700Bold', marginTop: 5 },
  weekService: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 1 },
  weekDayRow: { minHeight: 69, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  weekDayLabel: { width: 44, alignItems: 'center' },
  weekDayName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  weekDayNumber: { fontSize: 21, fontFamily: 'Inter_700Bold', marginTop: 2 },
  weekDayEvents: { flex: 1, gap: 4 },
  miniEvent: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 7 },
  miniEventText: { color: '#1E2240', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  noEvents: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  // The hint drops under the date when both don't fit (they ran together on a phone, 2026-11-11).
  scheduleCount: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  syncNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  syncText: { fontSize: 13, fontFamily: 'Inter_500Medium', flex: 1 },
  timeline: { flexDirection: 'row' },
  timelineLabels: { width: 54, position: 'relative' },
  timelineLabel: { position: 'absolute', left: 0, right: 0, height: 16, lineHeight: 16, paddingRight: 8, textAlign: 'right', fontSize: 13, fontFamily: 'Inter_400Regular' },
  timelineHourLabel: { color: '#3D4160', fontFamily: 'Inter_600SemiBold' },
  timelineTrack: { flex: 1, position: 'relative' },
  timelineLine: { height: 1, left: 0, right: 0, position: 'absolute' },
  // Quarter-hour lines start a little in from the hour lines.
  timelineQuarterLine: { left: 12, height: StyleSheet.hairlineWidth },
  timelineAppointment: { position: 'absolute', borderRadius: 8, borderWidth: 2, borderColor: '#FFFFFF', paddingHorizontal: 9, paddingVertical: 3, justifyContent: 'center', overflow: 'hidden' },
  timelineAppointmentDragging: { shadowColor: '#2E1065', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  processingBand: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.6)', justifyContent: 'center', paddingHorizontal: 9 },
  processingText: { color: '#5A5F7A', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  timelineClient: { color: '#1E2240', fontSize: 15, lineHeight: 19, fontFamily: 'Inter_700Bold' },
  timelineService: { color: '#1E2240', fontSize: 14, lineHeight: 18, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  timelineDuration: { color: '#5B5F78', fontSize: 13, lineHeight: 17, fontFamily: 'Inter_500Medium', marginTop: 2 },
  timelineEmpty: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', gap: 8 },
  timelineEmptyText: { color: '#A9ACC0', fontSize: 15, fontFamily: 'Inter_500Medium' },
  currentTime: { position: 'absolute', left: 0, right: 0, height: 2 },
  nowPill: { position: 'absolute', left: 4, right: 0, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  nowPillText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
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

const tabletStyles = StyleSheet.create({
  iconButton: { width: 52, height: 52, borderRadius: 26 },
  dayCell: { width: 56, paddingVertical: 8 },
  dayName: { fontSize: 15 },
  dayNumber: { fontSize: 21 },
  weekdayLabel: { fontSize: 15 },
  monthCell: { height: 72 },
  monthNumber: { width: 40, height: 40, borderRadius: 20 },
  monthNumberText: { fontSize: 20 },
  weekSummary: { paddingHorizontal: 16, paddingVertical: 13 },
  weekSummaryTitle: { fontSize: 18 },
  weekSummaryCount: { fontSize: 15 },
  weekBadge: { width: 50, height: 50, borderRadius: 25 },
  weekBadgeDay: { fontSize: 12 },
  weekBadgeNumber: { fontSize: 19, lineHeight: 21 },
  weekDayHeader: { paddingVertical: 12 },
  weekDayTitle: { fontSize: 18 },
  weekDayCount: { fontSize: 15 },
  weekCard: { paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16 },
  weekTime: { gap: 6 },
  weekTimeText: { fontSize: 16 },
  weekStatus: { paddingHorizontal: 10, paddingVertical: 4 },
  weekStatusText: { fontSize: 14 },
  weekName: { fontSize: 20, marginTop: 6 },
  weekService: { fontSize: 17, marginTop: 2 },
  weekStripe: { width: 5 },
  weekEmptyText: { fontSize: 15 },
  todayPillText: { fontSize: 14 },
});
