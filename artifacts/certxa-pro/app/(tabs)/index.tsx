import { useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { useAuth } from '@/contexts/AuthContext';

function dateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function timeValue(time: string) {
  const [hourText, minuteText = '0'] = time.split(':');
  const hour = Number(hourText);
  const normalizedHour = hour % 12 + (time.toUpperCase().includes('PM') ? 12 : 0);
  return normalizedHour * 60 + Number(minuteText.slice(0, 2));
}

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { bookings, loading, error, refresh, calendarDate: selectedDate, setCalendarDate } = useBookingData();
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const days = useMemo(() => {
    const monday = new Date(selectedDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      return day;
    });
  }, [selectedDate]);
  const todayIsSelected = dateKey(selectedDate) === dateKey(new Date());
  const appointments = bookings.filter((booking) => booking.dateKey === dateKey(selectedDate)).sort((a, b) => timeValue(a.time) - timeValue(b.time));
  const serviceTotal = appointments.reduce((sum, appointment) => sum + appointment.amountCents, 0);
  const displayName = String(user?.name ?? user?.email ?? 'Certxa Pro');
  const profileInitials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'CP';
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const shiftWeek = (amount: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount * 7);
    setCalendarDate(next);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.topBar}>
              <View>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>CERTXA PRO</Text>
                <Text style={[styles.brandTitle, { color: colors.foreground }]}>{displayName}</Text>
              </View>
              <View testID="calendar-profile" style={[styles.profileButton, { backgroundColor: colors.secondary }]}><Text style={[styles.profileInitials, { color: colors.primary }]}>{profileInitials}</Text></View>
            </View>
            <View style={styles.monthRow}>
              <View><Text style={[styles.monthTitle, { color: colors.foreground }]}>{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Your schedule at a glance</Text></View>
              <View style={styles.monthActions}>
                <TouchableOpacity testID="previous-week" onPress={() => shiftWeek(-1)} style={styles.arrowButton}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
                <TouchableOpacity testID="next-week" onPress={() => shiftWeek(1)} style={styles.arrowButton}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
              </View>
            </View>
            <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {days.map((day) => {
                const active = dateKey(day) === dateKey(selectedDate);
                const today = dateKey(day) === dateKey(new Date());
                return <TouchableOpacity key={dateKey(day)} testID={`calendar-day-${day.getDate()}`} onPress={() => setCalendarDate(day)} style={[styles.dayCell, active && { backgroundColor: colors.primary }]}><Text style={[styles.dayName, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text><Text style={[styles.dayNumber, { color: active ? colors.primaryForeground : colors.foreground }]}>{day.getDate()}</Text><View style={[styles.dayDot, { backgroundColor: active ? colors.primaryForeground : today ? colors.primary : colors.border }]} /></TouchableOpacity>;
              })}
            </View>
            <View style={styles.agendaHeading}>
              <View><Text style={[styles.agendaTitle, { color: colors.foreground }]}>{todayIsSelected ? 'Today' : selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} · {todayIsSelected ? `${appointments.length} appointments` : 'Your day'}</Text></View>
              <View testID="availability-shortcut" style={styles.availabilityButton}><Feather name="clock" size={15} color={colors.mutedForeground} /><Text style={[styles.availabilityLabel, { color: colors.mutedForeground }]}>Hours in web</Text></View>
            </View>
            {error ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.accent, borderColor: colors.border }]}><Feather name="alert-circle" size={19} color={colors.accentForeground} /><Text style={[styles.emptyTitle, { color: colors.accentForeground }]}>{error}</Text></View>
            ) : appointments.length > 0 ? (
              <View style={styles.agendaList}>
                {appointments.map((item, index) => (
                  <TouchableOpacity key={`${item.time}-${index}`} onPress={() => router.push({ pathname: '/appointment/[id]', params: { id: String(item.appointmentId), clientName: item.name, serviceName: item.service, serviceId: String(item.serviceId ?? ''), amountCents: String(item.amountCents), dateIso: item.dateIso, duration: item.duration, status: item.status, note: item.note ?? '' } })} style={styles.appointmentRow}>
                    <View style={styles.timeColumn}><Text style={[styles.appointmentTime, { color: colors.foreground }]}>{item.time}</Text><Text style={[styles.duration, { color: colors.mutedForeground }]}>{item.duration}</Text></View>
                    <View style={[styles.appointmentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={[styles.appointmentAccent, { backgroundColor: index === 1 ? colors.accentForeground : colors.primary }]} />
                      <View style={styles.appointmentDetails}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.service}</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{item.name}{item.note ? ` · ${item.note}` : ''}</Text></View>
                      <Text style={[styles.priceText, { color: colors.foreground }]}>{item.price}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}><Feather name="sun" size={19} color={colors.primary} /></View><Text style={[styles.emptyTitle, { color: colors.foreground }]}>A little breathing room</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>No appointments on this day yet.</Text></View>
            )}
            <View style={[styles.summaryCard, { backgroundColor: colors.secondary }]}>
              <View style={[styles.summaryIcon, { backgroundColor: colors.card }]}><Feather name="trending-up" size={16} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={[styles.summaryTitle, { color: colors.foreground }]}>Today's service total</Text><Text style={[styles.rowSub, { color: colors.mutedForeground }]}>Before tips and add-ons</Text></View>
              <Text style={[styles.summaryAmount, { color: colors.primary }]}>{loading ? '…' : `$${(serviceTotal / 100).toFixed(2)}`}</Text>
            </View>
          </ScrollView>
          <TouchableOpacity testID="add-appointment" onPress={() => router.push({ pathname: '/booking', params: { day: dateKey(selectedDate) } })} style={[styles.fab, { backgroundColor: colors.primary }]}><Feather name="plus" size={25} color={colors.primaryForeground} /></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 112 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  eyebrow: { fontSize: 10, letterSpacing: 1.45, fontFamily: 'Inter_700Bold' },
  brandTitle: { fontSize: 26, letterSpacing: -0.6, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  profileButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  profileInitials: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  monthTitle: { fontSize: 22, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold' },
  subtitle: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 },
  monthActions: { flexDirection: 'row', gap: 8 },
  arrowButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weekCard: { borderWidth: 1, borderRadius: 19, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12, marginBottom: 26 },
  dayCell: { width: 39, alignItems: 'center', paddingVertical: 7, borderRadius: 14, gap: 7 },
  dayName: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  dayNumber: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  agendaHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  agendaTitle: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  availabilityButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  availabilityLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  agendaList: { gap: 12 },
  appointmentRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minHeight: 76 },
  timeColumn: { width: 60, paddingTop: 15 },
  appointmentTime: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  duration: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
  appointmentCard: { flex: 1, borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  appointmentAccent: { width: 3, height: 35, borderRadius: 3 },
  appointmentDetails: { flex: 1 },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 16 },
  priceText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  emptyCard: { minHeight: 155, borderWidth: 1, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  emptyIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emptyTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
  summaryCard: { marginTop: 21, padding: 15, borderRadius: 17, flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 33, height: 33, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  summaryAmount: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  fab: { position: 'absolute', right: 22, bottom: Platform.OS === 'web' ? 104 : 28, width: 55, height: 55, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4 },
});
