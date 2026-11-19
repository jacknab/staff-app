/**
 * Booking a visit from the tablet POS (owner, 2026-11-19), the /nail way (pages/nail/BookingPanel.tsx) without its
 * technician step — the Certxa Pro app is one pro. In the grid's place, in the same keys: the days (Today, Tomorrow,
 * then the weekday; a day with no room says Full) with Services back to the service keys and Earlier / Later pages,
 * then that day's open times with the day key back and More pages. The ticket keeps showing the visit being booked.
 *
 * Open times are the app's New booking's (app/booking.tsx): GET /api/public/store/:slug/availability for the visit's
 * first service and its whole length, only the pro's own times.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { api } from '@/lib/live-api';
import { businessToday, zonedTimeLabel } from '@/lib/businessTime';
import { look } from '@/components/look/tokens';
import { KeyRows, PosKeyButton } from '@/components/pos/PosGrid';
import { POS_GRID_ROWS, type GridKey } from '@/lib/posGrid';

export type BookingSlot = { time: string; staffId: number; staffName: string };

/** "2026-11-20", as the availability endpoint takes it. */
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

async function openTimes(slug: string, serviceId: number, day: string, duration: number, staffId: number | null): Promise<BookingSlot[]> {
  const rows = await api.get<BookingSlot[]>(`/api/public/store/${encodeURIComponent(slug)}/availability?serviceId=${serviceId}&date=${day}&duration=${duration}${staffId ? `&staffId=${staffId}` : ''}`);
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => (!staffId || Number(r?.staffId) === staffId) && r?.time && !seen.has(r.time) && (seen.add(r.time), true))
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export function BookingGrid({ slug, timeZone, staffId, serviceId, duration, columns, startDay, slot, onSlot, onServices }: {
  slug: string; timeZone: string; staffId: number | null; serviceId: number; duration: number; columns: number;
  /** Open on this day (the calendar's chosen day), when there is one. */
  startDay?: Date | null;
  slot: BookingSlot | null; onSlot: (slot: BookingSlot | null) => void;
  /** Back to the service keys. */
  onServices: () => void;
}) {
  const keys = columns * POS_GRID_ROWS;
  const daysPerPage = keys - 3; // Services, Earlier, Later
  const timesPerPage = keys - 2; // the day key and More
  const today = useMemo(() => businessToday(timeZone), [timeZone]);
  const [pageStart, setPageStart] = useState(0);
  const [view, setView] = useState<'day' | 'time'>('day');
  const [day, setDay] = useState<Date | null>(null);
  const [timePage, setTimePage] = useState(0);
  // Each day of the page and its open times (null while loading).
  const [daySlots, setDaySlots] = useState<Record<string, BookingSlot[] | null>>({});
  const [error, setError] = useState('');

  // The calendar's day: open on its times.
  useEffect(() => {
    if (!startDay) return;
    const offset = Math.round((new Date(startDay).setHours(12) - new Date(today).setHours(12)) / 86_400_000);
    if (offset < 0) return;
    setPageStart(Math.floor(offset / daysPerPage) * daysPerPage);
    setDay(startDay); setView('time');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDay]);

  const pageDays = useMemo(() => Array.from({ length: daysPerPage }, (_, i) => addDays(today, pageStart + i)), [today, pageStart, daysPerPage]);
  // The page's days, all at once, so a day with no room shows Full.
  useEffect(() => {
    let cancelled = false;
    setError('');
    const wanted = pageDays.map(isoDay).filter((k) => daySlots[k] === undefined);
    if (!wanted.length) return;
    setDaySlots((cur) => ({ ...cur, ...Object.fromEntries(wanted.map((k) => [k, null])) }));
    void Promise.all(wanted.map((k) => openTimes(slug, serviceId, k, duration, staffId).then((rows) => [k, rows] as const).catch(() => [k, [] as BookingSlot[]] as const)))
      .then((pairs) => { if (!cancelled) setDaySlots((cur) => ({ ...cur, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageDays, slug, serviceId, duration, staffId]);
  // A different visit (services changed): look again.
  useEffect(() => { setDaySlots({}); onSlot(null); }, [serviceId, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (d: Date) => {
    const off = Math.round((new Date(d).setHours(12) - new Date(today).setHours(12)) / 86_400_000);
    return { top: off === 0 ? 'Today' : off === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short' }), sub: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
  };
  const action = (id: string, title: string, sub: string | undefined, onPress: () => void, icon?: string): Extract<GridKey, { kind: 'action' }> => ({ kind: 'action', id, title, sub, icon, onPress });
  const nav = (id: string, title: string, onPress: () => void, icon = 'arrow-left') => action(id, title, undefined, onPress, icon);

  let cells: GridKey[] = [];
  let message = error;
  let selectedId: string | null = null;
  if (view === 'day') {
    cells = [
      nav('book-services', 'Services', onServices),
      ...pageDays.map((d) => {
        const k = isoDay(d); const l = label(d); const rows = daySlots[k];
        return action(`book-day-${k}`, l.top, rows === null || rows === undefined ? l.sub : rows.length === 0 ? `${l.sub} · Full` : l.sub,
          () => { if (rows && rows.length === 0) return; setDay(d); setTimePage(0); onSlot(null); setView('time'); });
      }),
      ...(pageStart > 0 ? [nav('book-earlier', 'Earlier', () => setPageStart((s) => Math.max(0, s - daysPerPage)))] : []),
      ...(pageStart + daysPerPage < 90 ? [nav('book-later', 'Later', () => setPageStart((s) => s + daysPerPage), 'arrow-right')] : []),
    ];
    if (day && view === 'day') selectedId = `book-day-${isoDay(day)}`;
  } else if (day) {
    const rows = daySlots[isoDay(day)];
    const l = label(day);
    const page = (rows ?? []).slice(timePage * timesPerPage, timePage * timesPerPage + timesPerPage);
    cells = [
      nav('book-day-back', `${l.top} ${l.sub}`, () => setView('day')),
      ...page.map((s) => action(`book-time-${s.time}`, zonedTimeLabel(s.time, timeZone), undefined, () => onSlot(s))),
      ...((timePage + 1) * timesPerPage < (rows?.length ?? 0) ? [nav('book-times-more', 'More', () => setTimePage((n) => n + 1), 'more-horizontal')]
        : timePage > 0 ? [nav('book-times-first', 'Back', () => setTimePage(0))] : []),
    ];
    if (slot) selectedId = `book-time-${slot.time}`;
    if (!message && rows === null) message = 'Finding open times…';
    else if (!message && rows && rows.length === 0) message = 'No open time on this day. Pick another day.';
  }
  while (cells.length < keys) cells.push({ kind: 'empty' });
  cells = cells.slice(0, keys);

  return (
    <View style={{ flex: 1 }} testID="pos-booking-grid">
      <KeyRows keys={cells} columns={columns} render={(k, i) => (
        <PosKeyButton k={k} index={i} columns={columns} selected={k.kind === 'action' && k.id === selectedId}
          testID={k.kind === 'action' ? k.id : undefined} onPress={k.kind === 'action' ? k.onPress : undefined} />
      )} />
      {message ? <View style={styles.message} pointerEvents="none">
        {message === 'Finding open times…' ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.messageText}>{message}</Text>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: { position: 'absolute', left: 16, right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, backgroundColor: 'rgba(28, 22, 80, 0.88)', paddingHorizontal: 14, paddingVertical: 10 },
  messageText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
});
