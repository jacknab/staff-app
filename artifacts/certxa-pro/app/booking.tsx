import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData, type ClientProfile } from '@/contexts/BookingContext';

const availableTimes = ['9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '3:30 PM', '4:00 PM'];

function formatPhone(value: string) {
  const area = value.slice(0, 3);
  const middle = value.slice(3, 6);
  const last = value.slice(6, 10);
  if (value.length < 4) return value;
  if (value.length < 7) return `(${area}) ${middle}`;
  return `(${area}) ${middle}-${last}`;
}

function keyForDate(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateFromKey(key?: string) {
  if (!key) return new Date();
  const [year, month, day] = key.split('-').map(Number);
  if (!year || month === undefined || !day) return new Date();
  return new Date(year, month, day);
}

export default function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ day?: string; phone?: string }>();
  const { clients, services, addClient, addBooking, calendarDate, setCalendarDate } = useBookingData();
  const initialPhone = (params.phone ?? '').replace(/\D/g, '').slice(0, 10);
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<'client' | 'details'>('client');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [ticketClient, setTicketClient] = useState<ClientProfile | null>(null);
  const [serviceIndex, setServiceIndex] = useState(0);
  const [selectedTime, setSelectedTime] = useState('3:30 PM');
  const [selectedDate, setSelectedDate] = useState(() => params.day ? dateFromKey(params.day) : calendarDate);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const weekDays = useMemo(() => {
    const monday = new Date(selectedDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      return day;
    });
  }, [selectedDate]);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const phoneDigits = phone.replace(/\D/g, '').slice(0, 10);
  const matches = phoneDigits.length >= 4
    ? clients.filter((client) => client.phone.replace(/\D/g, '').startsWith(phoneDigits))
    : [];
  const service = services[serviceIndex] ?? services[0];
  const clientCanContinue = selectedClient !== null || (phoneDigits.length === 10 && name.trim().length > 0);
  const shiftWeek = (amount: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount * 7);
    setSelectedDate(next);
  };

  const pressNumber = (key: string) => {
    if (key === 'clear') {
      setPhone('');
      setSelectedClient(null);
      setName('');
      return;
    }
    if (key === 'delete') {
      setPhone((current) => current.slice(0, -1));
      setSelectedClient(null);
      return;
    }
    if (phoneDigits.length < 10) {
      setPhone((current) => `${current}${key}`);
      setSelectedClient(null);
    }
  };

  const chooseClient = (client: ClientProfile) => {
    setSelectedClient(client);
    setName('');
  };

  const continueToDetails = () => {
    if (selectedClient) {
      setTicketClient(selectedClient);
    } else if (phoneDigits.length === 10 && name.trim()) {
      const cleanName = name.trim();
      const initials = cleanName.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
      setTicketClient({
        id: `draft-${phoneDigits}`,
        customerId: 0,
        name: cleanName,
        initials: initials || 'NC',
        phone: phoneDigits,
        lastVisit: 'New client',
        service: 'No visits yet',
        visits: 0,
        spend: '$0',
        color: 'green',
      });
    } else {
      return;
    }
    setStage('details');
  };

  const saveBooking = async () => {
    if (!ticketClient || !service || saving) return;
    setSaving(true); setSaveError('');
    try {
    const client = ticketClient.id.startsWith('draft-')
      ? await addClient({
          name: ticketClient.name,
          initials: ticketClient.initials,
          phone: ticketClient.phone,
          lastVisit: 'Upcoming · Today',
          service: service.name,
          visits: 0,
          spend: '$0',
          color: 'green',
        })
      : ticketClient;
    const dateIso = new Date(selectedDate);
    const match = selectedTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match) { let hour = Number(match[1]) % 12; if (match[3].toUpperCase() === 'PM') hour += 12; dateIso.setHours(hour, Number(match[2]), 0, 0); }
    await addBooking({
      customerId: client.customerId,
      dateKey: keyForDate(selectedDate),
      dateIso: dateIso.toISOString(),
      time: selectedTime,
      name: client.name,
      service: service.name,
      serviceId: service.id,
      duration: `${service.durationMinutes} min`,
      price: service.price,
      amountCents: Math.round(service.priceValue * 100),
      status: 'pending',
    });
    setCalendarDate(selectedDate);
    router.replace('/(tabs)');
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not create appointment.'); }
    finally { setSaving(false); }
  };

  const titleDate = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} behavior="padding" keyboardVerticalOffset={0}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.navbar}>
        {stage === 'client' ? (
          <>
            <View><Text style={[styles.wordmark, { color: colors.foreground }]}>Certxa<Text style={{ color: colors.primary }}>.</Text></Text><Text style={[styles.navSub, { color: colors.mutedForeground }]}>NEW BOOKING</Text></View>
            <TouchableOpacity testID="close-booking" accessibilityLabel="Close booking" onPress={() => router.back()} style={styles.navButton}><Feather name="x" size={21} color={colors.foreground} /></TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity testID="booking-back-to-client" accessibilityLabel="Back to client" onPress={() => setStage('client')} style={styles.backLink}><Feather name="arrow-left" size={19} color={colors.foreground} /><Text style={[styles.backLabel, { color: colors.foreground }]}>Client</Text></TouchableOpacity>
            <Text style={[styles.navSub, { color: colors.mutedForeground }]}>STEP 2 OF 2</Text>
          </>
        )}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: stage === 'client' ? '45%' : '100%' }]} /></View>

      {stage === 'client' ? (
        <>
          <ScrollView contentContainerStyle={styles.clientContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 1 · CLIENT</Text>
              <Text style={[styles.heading, { color: colors.foreground }]}>Who are we booking?</Text>
              <Text style={[styles.subheading, { color: colors.mutedForeground }]}>Look up a familiar face or add someone new.</Text>
            </View>
            <View style={[styles.phonePanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.phoneLabel, { color: colors.mutedForeground }]}>PHONE NUMBER</Text>
              <Text testID="booking-phone" style={[styles.phoneValue, { color: phoneDigits ? colors.foreground : colors.mutedForeground }]}>{phoneDigits ? formatPhone(phoneDigits) : 'Enter Phone Number'}</Text>
              {phoneDigits.length > 0 && <TouchableOpacity testID="clear-phone" onPress={() => pressNumber('clear')} style={styles.phoneClear}><Feather name="x" size={15} color={colors.mutedForeground} /></TouchableOpacity>}
            </View>
            <View style={styles.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'delete'].map((key) => (
                key === 'clear' ? (
                  <TouchableOpacity key={key} testID="key-clear" onPress={() => pressNumber(key)} style={[styles.keyButton, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.clearLabel, { color: colors.mutedForeground }]}>Clear</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity key={key} testID={`phone-key-${key}`} accessibilityLabel={key === 'delete' ? 'Delete last digit' : `Enter ${key}`} onPress={() => pressNumber(key)} style={[styles.keyButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {key === 'delete' ? <Feather name="delete" size={21} color={colors.foreground} /> : <Text style={[styles.keyDigit, { color: colors.foreground }]}>{key}</Text>}
                  </TouchableOpacity>
                )
              ))}
            </View>

            {matches.length > 0 && phoneDigits.length >= 7 ? (
              <View style={styles.lookupSection}>
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{phoneDigits.length === 10 ? 'CLIENT FOUND' : 'POSSIBLE MATCHES'}</Text>
                {matches.slice(0, 3).map((client) => {
                  const isSelected = selectedClient?.id === client.id;
                  return <TouchableOpacity key={client.id} testID={`booking-match-${client.id}`} onPress={() => chooseClient(client)} style={[styles.matchCard, { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border }]}>
                    <View style={[styles.avatar, { backgroundColor: client.color === 'sand' ? colors.accent : colors.secondary }]}><Text style={[styles.avatarText, { color: client.color === 'sand' ? colors.accentForeground : colors.primary }]}>{client.initials}</Text></View>
                    <View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>{client.name}</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{formatPhone(client.phone)}</Text></View>
                    <Feather name={isSelected ? 'check-circle' : 'chevron-right'} size={19} color={isSelected ? colors.primary : colors.mutedForeground} />
                  </TouchableOpacity>;
                })}
              </View>
            ) : phoneDigits.length === 10 ? (
              <View style={[styles.newClientPanel, { backgroundColor: colors.secondary }]}>
                <View style={styles.newClientHeading}><View style={[styles.newClientIcon, { backgroundColor: colors.card }]}><Feather name="user-plus" size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>New client</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{formatPhone(phoneDigits)} isn’t in your list yet.</Text></View></View>
                <TextInput testID="booking-new-client-name" autoCapitalize="words" value={name} onChangeText={(value) => { setName(value); setSelectedClient(null); }} placeholder="Client’s first and last name" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} returnKeyType="done" />
              </View>
            ) : (
              <View style={[styles.lookupHint, { backgroundColor: colors.secondary }]}><Feather name="search" size={15} color={colors.primary} /><Text style={[styles.hintText, { color: colors.primary }]}>Enter a phone number to find a client.</Text></View>
            )}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            <TouchableOpacity testID="continue-booking" disabled={!clientCanContinue} onPress={continueToDetails} style={[styles.primaryButton, { backgroundColor: clientCanContinue ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: clientCanContinue ? colors.primaryForeground : colors.mutedForeground }]}>{selectedClient ? `Continue with ${selectedClient.name.split(' ')[0]}` : 'Add client to booking'}</Text><Feather name="arrow-right" size={17} color={clientCanContinue ? colors.primaryForeground : colors.mutedForeground} /></TouchableOpacity>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>Client records are loaded from and saved to Certxa.</Text>
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.detailsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 2 · APPOINTMENT</Text>
              <Text style={[styles.heading, { color: colors.foreground }]}>Add to the ticket</Text>
              <Text style={[styles.subheading, { color: colors.mutedForeground }]}>Choose a service and time for {ticketClient?.name.split(' ')[0]}.</Text>
            </View>
            <View style={[styles.ticketClient, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{ticketClient?.initials}</Text></View>
              <View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>{ticketClient?.name}</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{ticketClient ? formatPhone(ticketClient.phone) : ''}</Text></View>
              <TouchableOpacity testID="change-booking-client" onPress={() => setStage('client')}><Text style={[styles.changeLabel, { color: colors.primary }]}>Change</Text></TouchableOpacity>
            </View>
            <View style={styles.monthRow}>
              <View>
                <Text style={[styles.monthTitle, { color: colors.foreground }]}>{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                <Text style={[styles.monthSubtitle, { color: colors.mutedForeground }]}>Choose an appointment date</Text>
              </View>
              <View style={styles.monthActions}>
                <TouchableOpacity testID="booking-previous-week" accessibilityLabel="Previous week" onPress={() => shiftWeek(-1)} style={styles.arrowButton}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
                <TouchableOpacity testID="booking-next-week" accessibilityLabel="Next week" onPress={() => shiftWeek(1)} style={styles.arrowButton}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
              </View>
            </View>
            <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {weekDays.map((day) => {
                const active = keyForDate(day) === keyForDate(selectedDate);
                const today = keyForDate(day) === keyForDate(new Date());
                return (
                  <TouchableOpacity key={keyForDate(day)} testID={`booking-day-${day.getDate()}`} accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => setSelectedDate(day)} style={[styles.dayCell, active && { backgroundColor: colors.primary }]}>
                    <Text style={[styles.dayName, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                    <Text style={[styles.dayNumber, { color: active ? colors.primaryForeground : colors.foreground }]}>{day.getDate()}</Text>
                    <View style={[styles.dayDot, { backgroundColor: active ? colors.primaryForeground : today ? colors.primary : colors.border }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: colors.foreground }]}>SERVICE</Text><Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>Choose one</Text></View>
            <View style={styles.serviceList}>
              {services.map((item, index) => <TouchableOpacity key={item.id} testID={`booking-service-${item.name}`} onPress={() => setServiceIndex(index)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: serviceIndex === index ? colors.primary : colors.border }]}><View style={[styles.serviceIcon, { backgroundColor: colors.secondary }]}><Feather name={item.icon} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{item.duration}</Text></View><Text style={[styles.price, { color: colors.foreground }]}>{item.price}</Text><Feather name={serviceIndex === index ? 'check-circle' : 'circle'} size={18} color={serviceIndex === index ? colors.primary : colors.border} /></TouchableOpacity>)}
            </View>
            <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: colors.foreground }]}>AVAILABLE TIMES</Text><Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{titleDate}</Text></View>
            <View style={styles.timeGrid}>
              {availableTimes.map((time) => <TouchableOpacity key={time} testID={`booking-time-${time}`} onPress={() => setSelectedTime(time)} style={[styles.timeChip, { backgroundColor: selectedTime === time ? colors.primary : colors.card, borderColor: selectedTime === time ? colors.primary : colors.border }]}><Text style={[styles.timeText, { color: selectedTime === time ? colors.primaryForeground : colors.foreground }]}>{time}</Text></TouchableOpacity>)}
            </View>
            <View style={[styles.summary, { backgroundColor: colors.accent }]}><Text style={[styles.summaryLabel, { color: colors.accentForeground }]}>BOOKING TOTAL</Text><Text style={[styles.summaryValue, { color: colors.accentForeground }]}>{service.price}</Text></View>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            {saveError ? <Text style={[styles.footerNote, { color: colors.destructive }]}>{saveError}</Text> : null}
            <TouchableOpacity disabled={saving || !service} testID="confirm-booking" onPress={saveBooking} style={[styles.primaryButton, { backgroundColor: service ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Add appointment'}</Text><Feather name="check" size={17} color={colors.primaryForeground} /></TouchableOpacity>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>This appointment will be saved to Certxa.</Text>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  navbar: { minHeight: 55, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontSize: 20, letterSpacing: -0.7, fontFamily: 'Inter_700Bold' },
  navSub: { fontSize: 9, letterSpacing: 1.25, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { height: 3, marginHorizontal: 20, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  clientContent: { paddingHorizontal: 20, paddingTop: 23, paddingBottom: 22 },
  detailsContent: { paddingHorizontal: 20, paddingTop: 23, paddingBottom: 24 },
  intro: { marginBottom: 19 },
  eyebrow: { fontSize: 10, letterSpacing: 1.3, fontFamily: 'Inter_700Bold' },
  heading: { fontSize: 23, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 7 },
  subheading: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 5 },
  phonePanel: { minHeight: 66, borderWidth: 1, borderRadius: 15, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 42, marginBottom: 13 },
  phoneLabel: { fontSize: 8, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  phoneValue: { fontSize: 18, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.1, marginTop: 5 },
  phoneClear: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 },
  keyButton: { width: '31.5%', height: 59, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyDigit: { fontSize: 22, fontFamily: 'Inter_600SemiBold' },
  clearLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  lookupHint: { marginTop: 14, minHeight: 41, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  lookupSection: { marginTop: 16, gap: 8 },
  sectionLabel: { fontSize: 10, letterSpacing: 1.15, fontFamily: 'Inter_700Bold' },
  matchCard: { borderWidth: 1, borderRadius: 15, padding: 10, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  matchName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  matchPhone: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 3 },
  newClientPanel: { marginTop: 14, borderRadius: 15, padding: 12 },
  newClientHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  newClientIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nameInput: { height: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 11 },
  primaryButton: { minHeight: 49, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { flex: 1, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  footerNote: { textAlign: 'center', fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 8 },
  ticketClient: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  changeLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 4, paddingVertical: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 13 },
  monthTitle: { fontSize: 20, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold' },
  monthSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  monthActions: { flexDirection: 'row', gap: 8 },
  arrowButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  weekCard: { borderWidth: 1, borderRadius: 19, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 12 },
  dayCell: { width: 39, alignItems: 'center', paddingVertical: 7, borderRadius: 14, gap: 7 },
  dayName: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  dayNumber: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19, marginBottom: 9 },
  sectionHint: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  serviceList: { gap: 7 },
  serviceRow: { borderWidth: 1, borderRadius: 14, minHeight: 59, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9 },
  serviceIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  price: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { width: '31.5%', minHeight: 39, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  summary: { borderRadius: 13, minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  summaryLabel: { fontSize: 9, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  summaryValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
