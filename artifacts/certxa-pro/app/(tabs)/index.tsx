import { useCallback, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { AppointmentRecord, useBookingData } from '@/contexts/BookingContext';

type ViewMode = 'Month' | 'Week' | 'Day';

const PREVIEW_COLORS = ['#DDEAE2', '#F9E1BC', '#F3D4DE', '#DEE4F4'];
const TIMELINE_START = 8 * 60;
const HOUR_HEIGHT = 64;
const TIMELINE_HOURS = Array.from({ length: 11 }, (_, index) => TIMELINE_START + index * 60);

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function clockMinutes(value: string) {
  const [clock, period = ''] = value.toUpperCase().split(' ');
  const [hoursText, minutesText = '0'] = clock.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  return (hours % 12 + (period === 'PM' ? 12 : 0)) * 60 + minutes;
}

function formatClock(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

function durationMinutes(duration: string) {
  const minutes = Number.parseInt(duration, 10);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

function weekStarting(date: Date) {
  const monday = new Date(date);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function previewAppointments(date: Date): AppointmentRecord[] {
  const create = (id: number, hour: number, minute: number, name: string, service: string, duration: number, price: number): AppointmentRecord => {
    const appointmentDate = new Date(date);
    appointmentDate.setHours(hour, minute, 0, 0);
    return {
      id: `preview-${id}`,
      appointmentId: id,
      dateKey: dateKey(date),
      dateIso: appointmentDate.toISOString(),
      time: appointmentDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      name,
      service,
      duration: `${duration} min`,
      price: `$${price}`,
      amountCents: price * 100,
      status: 'confirmed',
    };
  };

  return [
    create(901, 9, 30, 'Maya Thompson', 'Lash lift + tint', 75, 95),
    create(902, 11, 0, 'Jordan Lee', 'Signature facial', 60, 85),
    create(903, 13, 30, 'Sofia Martinez', 'Gel manicure', 90, 68),
    create(904, 15, 45, 'Avery Wilson', 'Brow shaping', 45, 42),
  ];
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

function appointmentParams(item: AppointmentRecord) {
  return {
    pathname: '/appointment/[id]' as const,
    params: {
      id: String(item.appointmentId),
      clientName: item.name,
      serviceName: item.service,
      serviceId: String(item.serviceId ?? ''),
      amountCents: String(item.amountCents),
      dateIso: item.dateIso,
      duration: item.duration,
      status: item.status,
      note: item.note ?? '',
      preview: item.id.startsWith('preview') ? '1' : '0',
    },
  };
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { bookings, loading, error, refresh, calendarDate: selectedDate, setCalendarDate } = useBookingData();
  const [viewMode, setViewMode] = useState<ViewMode>('Day');
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const days = useMemo(() => {
    const monday = weekStarting(selectedDate);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      return day;
    });
  }, [selectedDate]);
  const cells = useMemo(() => monthCells(selectedDate), [selectedDate]);
  const preview = useMemo(() => previewAppointments(selectedDate), [selectedDate]);
  const appointments = useMemo(() => (bookings.length > 0 ? bookings : preview).sort((a, b) => clockMinutes(a.time) - clockMinutes(b.time)), [bookings, preview]);
  const isPreviewData = bookings.length === 0 && !loading;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const todayIsSelected = dateKey(selectedDate) === dateKey(new Date());

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

  const monthTitle = viewMode === 'Month'
    ? selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : viewMode === 'Week'
      ? `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const openAppointment = (item: AppointmentRecord) => {
    if (item.appointmentId > 0) router.push(appointmentParams(item));
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          <Text style={[styles.todayHint, { color: colors.mutedForeground }]}>{todayIsSelected ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity testID="calendar-refresh" accessibilityLabel="Refresh calendar" onPress={() => void refresh()} style={styles.iconButton}>
              <Feather name="refresh-cw" size={19} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity testID="add-appointment" accessibilityLabel="Add appointment" onPress={() => router.push({ pathname: '/booking', params: { day: dateKey(selectedDate) } })} style={[styles.addButton, { backgroundColor: colors.primary }]}>
              <Feather name="plus" size={24} color={colors.primaryForeground} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dateHeader}>
          <TouchableOpacity testID="previous-calendar-period" accessibilityLabel="Previous period" onPress={() => shiftDate(-1)} style={styles.chevronButton}>
            <Feather name="chevron-left" size={21} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthTitle}</Text>
          <TouchableOpacity testID="next-calendar-period" accessibilityLabel="Next period" onPress={() => shiftDate(1)} style={styles.chevronButton}>
            <Feather name="chevron-right" size={21} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {viewMode !== 'Month' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.weekStrip}>
            {days.map((day) => {
              const active = dateKey(day) === dateKey(selectedDate);
              const today = dateKey(day) === dateKey(new Date());
              return (
                <TouchableOpacity key={dateKey(day)} testID={`calendar-day-${day.getDate()}`} onPress={() => selectDate(day)} style={[styles.dayCell, active && { backgroundColor: colors.primary }]}>
                  <Text style={[styles.dayName, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</Text>
                  <Text style={[styles.dayNumber, { color: active ? colors.primaryForeground : colors.foreground }]}>{day.getDate()}</Text>
                  <View style={[styles.dayDot, { backgroundColor: active ? colors.primaryForeground : today ? colors.primary : colors.border }]} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {viewMode === 'Month' ? (
          <View style={[styles.monthGrid, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.weekdayRow}>
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((weekday, index) => <Text key={`${weekday}-${index}`} style={[styles.weekdayLabel, { color: colors.mutedForeground }]}>{weekday}</Text>)}
            </View>
            <View style={styles.monthCells}>
              {cells.map((day) => {
                const inMonth = day.getMonth() === selectedDate.getMonth();
                const active = dateKey(day) === dateKey(selectedDate);
                const isToday = dateKey(day) === dateKey(new Date());
                return (
                  <TouchableOpacity key={dateKey(day)} onPress={() => selectDate(day, true)} style={styles.monthCell}>
                    <View style={[styles.monthNumber, active && { backgroundColor: colors.primary }]}>
                      <Text style={[styles.monthNumberText, { color: active ? colors.primaryForeground : inMonth ? colors.foreground : colors.mutedForeground }]}>{day.getDate()}</Text>
                    </View>
                    <View style={[styles.monthDot, { backgroundColor: active ? colors.primaryForeground : isToday ? colors.primary : inMonth ? colors.accentForeground : colors.border }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : viewMode === 'Week' ? (
          <View style={styles.weekAgenda}>
            {days.map((day) => {
              const dayAppointments = dateKey(day) === dateKey(selectedDate) ? appointments : [];
              const active = dateKey(day) === dateKey(selectedDate);
              return (
                <TouchableOpacity key={dateKey(day)} onPress={() => selectDate(day, true)} style={[styles.weekDayRow, { borderColor: colors.border, backgroundColor: colors.card }, active && { borderColor: colors.primary }]}>
                  <View style={styles.weekDayLabel}>
                    <Text style={[styles.weekDayName, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                    <Text style={[styles.weekDayNumber, { color: active ? colors.primary : colors.foreground }]}>{day.getDate()}</Text>
                  </View>
                  <View style={styles.weekDayEvents}>
                    {dayAppointments.length > 0 ? dayAppointments.slice(0, 2).map((item, index) => <View key={item.id} style={[styles.miniEvent, { backgroundColor: PREVIEW_COLORS[index % PREVIEW_COLORS.length] }]}><Text numberOfLines={1} style={styles.miniEventText}>{item.time} · {item.name}</Text></View>) : <Text style={[styles.noEvents, { color: colors.mutedForeground }]}>Open schedule</Text>}
                  </View>
                  <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View>
            <View style={styles.scheduleMeta}>
              <Text style={[styles.scheduleCount, { color: colors.mutedForeground }]}>{selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {appointments.length} appointments</Text>
              {isPreviewData && <View style={[styles.previewPill, { backgroundColor: colors.accent }]}><Text style={[styles.previewPillText, { color: colors.accentForeground }]}>Preview schedule</Text></View>}
            </View>
            {error && <View style={[styles.syncNotice, { backgroundColor: colors.secondary }]}><Feather name="info" size={14} color={colors.primary} /><Text style={[styles.syncText, { color: colors.secondaryForeground }]}>Showing preview appointments while Certxa is offline.</Text></View>}
            <View style={[styles.timeline, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.timelineLabels, { backgroundColor: colors.muted }]}>
                {TIMELINE_HOURS.map((time) => <Text key={time} style={styles.timelineLabel}>{formatClock(time)}</Text>)}
              </View>
              <View style={[styles.timelineTrack, { backgroundColor: colors.card }]}>
                {TIMELINE_HOURS.map((time, index) => <View key={time} style={[styles.timelineLine, { top: index * HOUR_HEIGHT, backgroundColor: colors.border }]} />)}
                {appointments.map((item, index) => {
                  const top = Math.max(4, ((clockMinutes(item.time) - TIMELINE_START) / 60) * HOUR_HEIGHT);
                  const height = Math.max(54, (durationMinutes(item.duration) / 60) * HOUR_HEIGHT - 7);
                  return (
                    <TouchableOpacity key={item.id} onPress={() => openAppointment(item)} style={[styles.timelineAppointment, { top, height, backgroundColor: PREVIEW_COLORS[index % PREVIEW_COLORS.length] }]}>
                      <Text numberOfLines={1} style={styles.timelineClient}>{item.name}</Text>
                      <Text numberOfLines={1} style={styles.timelineService}>{item.service}</Text>
                      <Text numberOfLines={1} style={styles.timelineDuration}>{item.duration}</Text>
                    </TouchableOpacity>
                  );
                })}
                {appointments.length === 0 && !loading && <View style={styles.timelineEmpty}><Feather name="sun" size={18} color="#A8B2AD" /><Text style={styles.timelineEmptyText}>Your schedule is open</Text></View>}
                <View style={[styles.currentTime, { top: ((new Date().getHours() * 60 + new Date().getMinutes() - TIMELINE_START) / 60) * HOUR_HEIGHT }]} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 112 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 19 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 39, height: 39, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  addButton: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentedControl: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, padding: 2, flexShrink: 1 },
  segment: { minWidth: 48, paddingVertical: 8, paddingHorizontal: 7, borderRadius: 7, alignItems: 'center' },
  segmentText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  todayHint: { fontSize: 12, fontFamily: 'Inter_500Medium', marginRight: 2 },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  chevronButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.35 },
  weekStrip: { gap: 8, paddingBottom: 19, paddingTop: 2 },
  dayCell: { width: 43, alignItems: 'center', paddingVertical: 7, borderRadius: 14, gap: 6 },
  dayName: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dayNumber: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  monthGrid: { borderWidth: 1, borderRadius: 18, padding: 11, overflow: 'hidden' },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 5 },
  weekdayLabel: { width: '14.28%', textAlign: 'center', fontSize: 10, fontFamily: 'Inter_700Bold' },
  monthCells: { flexDirection: 'row', flexWrap: 'wrap' },
  monthCell: { width: '14.28%', height: 58, alignItems: 'center', paddingTop: 7 },
  monthNumber: { width: 29, height: 29, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  monthNumberText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  monthDot: { width: 4, height: 4, borderRadius: 2, marginTop: 5 },
  weekAgenda: { gap: 9 },
  weekDayRow: { minHeight: 69, borderWidth: 1, borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  weekDayLabel: { width: 44, alignItems: 'center' },
  weekDayName: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  weekDayNumber: { fontSize: 19, fontFamily: 'Inter_700Bold', marginTop: 2 },
  weekDayEvents: { flex: 1, gap: 4 },
  miniEvent: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 7 },
  miniEventText: { color: '#26302B', fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  noEvents: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  scheduleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  scheduleCount: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  previewPill: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  previewPillText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  syncNotice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10 },
  syncText: { fontSize: 10, fontFamily: 'Inter_500Medium', flex: 1 },
  timeline: { minHeight: HOUR_HEIGHT * 10, borderRadius: 14, borderWidth: 1, overflow: 'hidden', flexDirection: 'row' },
  timelineLabels: { width: 68, paddingTop: 7 },
  timelineLabel: { height: HOUR_HEIGHT, paddingTop: 1, paddingRight: 9, textAlign: 'right', color: '#7E8782', fontSize: 10, fontFamily: 'Inter_500Medium' },
  timelineTrack: { flex: 1, minHeight: HOUR_HEIGHT * 10, position: 'relative' },
  timelineLine: { height: 1, left: 0, right: 0, position: 'absolute' },
  timelineAppointment: { position: 'absolute', left: 7, right: 8, borderRadius: 8, paddingHorizontal: 11, paddingVertical: 6, justifyContent: 'center', overflow: 'hidden' },
  timelineClient: { color: '#26302B', fontSize: 12, lineHeight: 15, fontFamily: 'Inter_700Bold' },
  timelineService: { color: '#26302B', fontSize: 11, lineHeight: 14, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  timelineDuration: { color: '#5B665F', fontSize: 10, lineHeight: 13, fontFamily: 'Inter_500Medium', marginTop: 2 },
  timelineEmpty: { position: 'absolute', top: 250, left: 0, right: 0, alignItems: 'center', gap: 8 },
  timelineEmptyText: { color: '#A8B2AD', fontSize: 12, fontFamily: 'Inter_500Medium' },
  currentTime: { position: 'absolute', left: 0, right: 0, height: 2, backgroundColor: '#D85E8B' },
});