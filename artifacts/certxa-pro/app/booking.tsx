import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData, type ClientProfile, type ServiceProfile } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';

type AddonOption = { id: number; name: string; priceValue: number; minutes: number; serviceIds: number[] };
type Slot = { time: string; staffId: number; staffName: string };
type Stage = 'client' | 'services' | 'addons' | 'schedule';
/** Extra time a slot must have free after the services and add-ons, to cover running over. */
const BUFFER_MINUTES = 15;

function money(value: number) { return `$${value.toFixed(2)}`; }
function minutesLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}
function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The ten digits of a US phone number, however it was typed or stored: "(720) 243-1234", "+1 720…", "7202431234". */
function phoneDigitsOf(value: string) {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits.slice(0, 10);
}

function formatPhone(raw: string) {
  // Certxa stores some numbers already formatted - always start again from the bare digits.
  const value = phoneDigitsOf(raw);
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
  const { clients, services, addClient, refresh, calendarDate, setCalendarDate } = useBookingData();
  const initialPhone = (params.phone ?? '').replace(/\D/g, '').slice(0, 10);
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>('client');
  // Step 1 finds the client either by phone number (and can add a new one) or by name / e-mail.
  const [lookupTab, setLookupTab] = useState<'phone' | 'name'>('phone');
  const [query, setQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(null);
  const [ticketClient, setTicketClient] = useState<ClientProfile | null>(null);
  // Step 2: one or more services. Step 3: optional add-ons for those services. Step 4: date + time.
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  const [serviceQuery, setServiceQuery] = useState('');
  const [addonOptions, setAddonOptions] = useState<AddonOption[]>([]);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [addonQuery, setAddonQuery] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsState, setSlotsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [slot, setSlot] = useState<Slot | null>(null);
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
    ? clients.filter((client) => phoneDigitsOf(client.phone).startsWith(phoneDigits))
    : [];
  const queryText = query.trim().toLowerCase();
  const nameMatches = queryText.length >= 2
    ? clients.filter((client) => client.name.toLowerCase().includes(queryText) || (client.email ?? '').toLowerCase().includes(queryText))
    : [];

  // Add-ons, which services each one belongs to, and the store's booking address (used to ask
  // Certxa for open times) are loaded once when the screen opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [addonRows, linkRows, storeRows] = await Promise.all([
          api.get<any[]>('/api/addons'), api.get<any[]>('/api/service-addons'), api.get<any[]>('/api/stores'),
        ]);
        if (cancelled) return;
        const links = Array.isArray(linkRows) ? linkRows : [];
        setAddonOptions((Array.isArray(addonRows) ? addonRows : []).filter((a) => a && a.isActive !== false).map((a) => ({
          id: Number(a.id), name: String(a.name ?? 'Add-on'), priceValue: Number(a.price ?? 0) || 0, minutes: Number(a.duration ?? 0) || 0,
          serviceIds: links.filter((l) => Number(l?.addonId) === Number(a.id)).map((l) => Number(l.serviceId)),
        })));
        setStoreSlug(String((Array.isArray(storeRows) ? storeRows[0]?.bookingSlug : '') ?? ''));
      } catch { /* no add-ons are offered, and the schedule step says times could not be loaded */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const chosenServices = serviceIds.map((id) => services.find((item) => item.id === id)).filter((item): item is ServiceProfile => !!item);
  const serviceFilter = serviceQuery.trim().toLowerCase();
  const visibleServices = serviceFilter ? services.filter((item) => item.name.toLowerCase().includes(serviceFilter)) : services;
  // An add-on linked to no service at all is offered with every service (same rule as the kiosk).
  const applicableAddons = addonOptions.filter((item) => item.serviceIds.length === 0 || item.serviceIds.some((id) => serviceIds.includes(id)));
  const addonFilter = addonQuery.trim().toLowerCase();
  const visibleAddons = addonFilter ? applicableAddons.filter((item) => item.name.toLowerCase().includes(addonFilter)) : applicableAddons;
  const chosenAddons = applicableAddons.filter((item) => addonIds.includes(item.id));
  const totalMinutes = chosenServices.reduce((sum, item) => sum + item.durationMinutes, 0) + chosenAddons.reduce((sum, item) => sum + item.minutes, 0);
  const totalPrice = chosenServices.reduce((sum, item) => sum + item.priceValue, 0) + chosenAddons.reduce((sum, item) => sum + item.priceValue, 0);
  const primaryServiceId = serviceIds[0];
  const dayParam = isoDay(selectedDate);

  // Open times for the chosen date: Certxa works them out from business hours, each technician's
  // bookings and who can do the service. The whole visit plus the buffer has to fit.
  useEffect(() => {
    if (stage !== 'schedule' || !primaryServiceId || totalMinutes <= 0) return;
    setSlot(null);
    if (!storeSlug) { setSlots([]); setSlotsState('error'); return; }
    let cancelled = false;
    setSlotsState('loading');
    api.get<Slot[]>(`/api/public/store/${encodeURIComponent(storeSlug)}/availability?serviceId=${primaryServiceId}&date=${dayParam}&duration=${totalMinutes + BUFFER_MINUTES}`)
      .then((rows) => {
        if (cancelled) return;
        const seen = new Set<string>();
        const unique = (Array.isArray(rows) ? rows : []).filter((row) => {
          if (!row?.time || seen.has(row.time)) return false;
          seen.add(row.time);
          return true;
        });
        unique.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        setSlots(unique);
        setSlotsState('ready');
      })
      .catch(() => { if (!cancelled) { setSlots([]); setSlotsState('error'); } });
    return () => { cancelled = true; };
  }, [dayParam, primaryServiceId, stage, storeSlug, totalMinutes]);

  const toggleItem = (id: number) => {
    const toggle = (current: number[]) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    if (stage === 'services') setServiceIds(toggle); else setAddonIds(toggle);
  };
  const goBack = () => {
    setSaveError('');
    if (stage === 'schedule') setStage(applicableAddons.length > 0 ? 'addons' : 'services');
    else if (stage === 'addons') setStage('services');
    else setStage('client');
  };
  const goNext = () => {
    if (stage === 'services') {
      if (serviceIds.length === 0) return;
      // Drop add-ons that no longer belong to any chosen service.
      setAddonIds((current) => current.filter((id) => applicableAddons.some((item) => item.id === id)));
      setStage(applicableAddons.length > 0 ? 'addons' : 'schedule');
    } else if (stage === 'addons') {
      setStage('schedule');
    }
  };
  const stepNumber = stage === 'client' ? 1 : stage === 'services' ? 2 : stage === 'addons' ? 3 : 4;
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
    setStage('services');
  };

  const saveBooking = async () => {
    const primary = chosenServices[0];
    if (!ticketClient || !primary || !slot || saving) return;
    setSaving(true); setSaveError('');
    try {
      const client = ticketClient.id.startsWith('draft-')
        ? await addClient({
            name: ticketClient.name,
            initials: ticketClient.initials,
            phone: ticketClient.phone,
            lastVisit: 'Upcoming · Today',
            service: primary.name,
            visits: 0,
            spend: '$0',
            color: 'green',
          })
        : ticketClient;
      // Certxa keeps one main service per appointment. The first service chosen is that one; any
      // others are added as their own priced lines on the same ticket, and the appointment's
      // length covers everything. The technician is the one Certxa offered for the chosen time.
      const extras = chosenServices.slice(1);
      const created = await api.post<{ id?: number }>('/api/appointments', {
        customerId: client.customerId,
        serviceId: primary.id,
        staffId: slot.staffId,
        duration: totalMinutes,
        date: slot.time,
        ...(extras.length > 0 ? { customLines: extras.map((item) => ({ label: item.name, price: item.priceValue })) } : {}),
      });
      const newId = Number(created?.id);
      if (chosenAddons.length > 0 && Number.isInteger(newId) && newId > 0) {
        await api.post(`/api/appointments/${newId}/addons`, { addonIds: chosenAddons.map((item) => item.id), force: true });
        // Keep the full length (all services + add-ons) on the calendar.
        await api.patch(`/api/appointments/${newId}`, { duration: totalMinutes });
      }
      setCalendarDate(selectedDate);
      await refresh();
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
            <TouchableOpacity testID="booking-back-to-client" accessibilityLabel="Back to client" onPress={goBack} style={styles.backLink}><Feather name="arrow-left" size={19} color={colors.foreground} /><Text style={[styles.backLabel, { color: colors.foreground }]}>Client</Text></TouchableOpacity>
            <Text style={[styles.navSub, { color: colors.mutedForeground }]}>{`STEP ${stepNumber} OF 4`}</Text>
          </>
        )}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${stepNumber * 25}%` }]} /></View>

      {stage === 'client' ? (
        <>
          <ScrollView contentContainerStyle={styles.clientContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 1 · CLIENT</Text>
              <Text style={[styles.heading, { color: colors.foreground }]}>Who are we booking?</Text>
              <Text style={[styles.subheading, { color: colors.mutedForeground }]}>Look up a familiar face or add someone new.</Text>
            </View>
            <View style={{ flexDirection: 'row', borderWidth: 1, borderRadius: 13, padding: 3, marginBottom: 13, backgroundColor: colors.card, borderColor: colors.border }}>
              {(['phone', 'name'] as const).map((tab) => (
                <TouchableOpacity key={tab} testID={`booking-tab-${tab}`} accessibilityRole="tab" accessibilityState={{ selected: lookupTab === tab }} onPress={() => setLookupTab(tab)} style={{ flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: lookupTab === tab ? colors.primary : 'transparent' }}>
                  <Text style={[styles.sectionLabel, { letterSpacing: 0.4, color: lookupTab === tab ? colors.primaryForeground : colors.mutedForeground }]}>{tab === 'phone' ? 'PHONE NUMBER' : 'NAME OR E-MAIL'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {lookupTab === 'phone' ? (<>
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
            </>) : (<>
              <TextInput testID="booking-name-search" autoCapitalize="none" autoCorrect={false} value={query} onChangeText={(value) => { setQuery(value); setSelectedClient(null); }} placeholder="Client name or e-mail" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { height: 50, fontSize: 14, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
              {nameMatches.length > 0 ? (
                <View style={styles.lookupSection}>
                  <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{nameMatches.length === 1 ? 'CLIENT FOUND' : 'MATCHES'}</Text>
                  {nameMatches.slice(0, 8).map((client) => {
                    const isSelected = selectedClient?.id === client.id;
                    return <TouchableOpacity key={client.id} testID={`booking-name-match-${client.id}`} onPress={() => chooseClient(client)} style={[styles.matchCard, { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border }]}>
                      <View style={[styles.avatar, { backgroundColor: client.color === 'sand' ? colors.accent : colors.secondary }]}><Text style={[styles.avatarText, { color: client.color === 'sand' ? colors.accentForeground : colors.primary }]}>{client.initials}</Text></View>
                      <View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>{client.name}</Text><Text numberOfLines={1} style={[styles.matchPhone, { color: colors.mutedForeground }]}>{[client.phone ? formatPhone(client.phone.replace(/\D/g, '').slice(-10)) : '', client.email ?? ''].filter(Boolean).join(' · ') || 'No phone or e-mail on file'}</Text></View>
                      <Feather name={isSelected ? 'check-circle' : 'chevron-right'} size={19} color={isSelected ? colors.primary : colors.mutedForeground} />
                    </TouchableOpacity>;
                  })}
                </View>
              ) : (
                <View style={[styles.lookupHint, { backgroundColor: colors.secondary }]}><Feather name="search" size={15} color={colors.primary} /><Text style={[styles.hintText, { flex: 1, color: colors.primary }]}>{queryText.length < 2 ? 'Type a name or e-mail to find a client.' : 'No client found. Use the Phone number tab to add someone new.'}</Text></View>
              )}
            </>)}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            <TouchableOpacity testID="continue-booking" disabled={!clientCanContinue} onPress={continueToDetails} style={[styles.primaryButton, { backgroundColor: clientCanContinue ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: clientCanContinue ? colors.primaryForeground : colors.mutedForeground }]}>{selectedClient ? `Continue with ${selectedClient.name.split(' ')[0]}` : 'Add client to booking'}</Text><Feather name="arrow-right" size={17} color={clientCanContinue ? colors.primaryForeground : colors.mutedForeground} /></TouchableOpacity>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>Client records are loaded from and saved to Certxa.</Text>
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.detailsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {stage === 'schedule' ? (
              <>
                <View style={styles.intro}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 4 · DATE AND TIME</Text>
                  <Text style={[styles.heading, { color: colors.foreground }]}>When are they coming in?</Text>
                  <Text style={[styles.subheading, { color: colors.mutedForeground }]}>{`Times shown have room for ${minutesLabel(totalMinutes)} plus ${BUFFER_MINUTES} minutes in case it runs over.`}</Text>
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
                    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
                    const past = day.getTime() < startOfToday.getTime();
                    return (
                      <TouchableOpacity key={keyForDate(day)} testID={`booking-day-${day.getDate()}`} disabled={past} accessibilityRole="button" accessibilityState={{ selected: active, disabled: past }} onPress={() => setSelectedDate(day)} style={[styles.dayCell, active && { backgroundColor: colors.primary }, past && { opacity: 0.35 }]}>
                        <Text style={[styles.dayName, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                        <Text style={[styles.dayNumber, { color: active ? colors.primaryForeground : colors.foreground }]}>{day.getDate()}</Text>
                        <View style={[styles.dayDot, { backgroundColor: active ? colors.primaryForeground : today ? colors.primary : colors.border }]} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: colors.foreground }]}>AVAILABLE TIMES</Text><Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{titleDate}</Text></View>
                {slotsState === 'ready' && slots.length > 0 ? (
                  <View style={styles.timeGrid}>
                    {slots.map((item) => {
                      const picked = slot?.time === item.time;
                      return <TouchableOpacity key={item.time} testID={`booking-time-${item.time}`} onPress={() => setSlot(item)} style={[styles.timeChip, { backgroundColor: picked ? colors.primary : colors.card, borderColor: picked ? colors.primary : colors.border }]}><Text style={[styles.timeText, { color: picked ? colors.primaryForeground : colors.foreground }]}>{new Date(item.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</Text></TouchableOpacity>;
                    })}
                  </View>
                ) : (
                  <View style={[styles.lookupHint, { marginTop: 0, backgroundColor: colors.secondary }]}><Feather name={slotsState === 'error' ? 'alert-circle' : 'clock'} size={15} color={colors.primary} /><Text style={[styles.hintText, { flex: 1, color: colors.primary }]}>{slotsState === 'error' ? 'Could not load times from Certxa. Check the connection and pick the date again.' : slotsState === 'ready' ? 'No time on this day has room for the whole visit. Try another date.' : 'Checking available times…'}</Text></View>
                )}
                {slot ? <Text style={[styles.footerNote, { color: colors.mutedForeground, marginTop: 12 }]}>{`With ${slot.staffName}`}</Text> : null}
              </>
            ) : (
              <>
                <View style={styles.intro}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>{stage === 'services' ? 'STEP 2 · SERVICES' : 'STEP 3 · ADD-ONS'}</Text>
                  <Text style={[styles.heading, { color: colors.foreground }]}>{stage === 'services' ? 'What are we doing?' : 'Any add-ons?'}</Text>
                  <Text style={[styles.subheading, { color: colors.mutedForeground }]}>{stage === 'services' ? `Choose one or more services for ${ticketClient?.name.split(' ')[0] ?? 'this client'}.` : 'Optional extras for the services you picked.'}</Text>
                </View>
                <TextInput testID={stage === 'services' ? 'booking-service-search' : 'booking-addon-search'} autoCapitalize="none" autoCorrect={false} value={stage === 'services' ? serviceQuery : addonQuery} onChangeText={stage === 'services' ? setServiceQuery : setAddonQuery} placeholder={stage === 'services' ? 'Search services' : 'Search add-ons'} placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { height: 48, fontSize: 14, marginBottom: 12, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                <View style={styles.serviceList}>
                  {(stage === 'services' ? visibleServices.map((item) => ({ id: item.id, name: item.name, minutes: item.durationMinutes, priceValue: item.priceValue })) : visibleAddons).map((item) => {
                    const picked = (stage === 'services' ? serviceIds : addonIds).includes(item.id);
                    return (
                      <TouchableOpacity key={item.id} testID={`booking-${stage === 'services' ? 'service' : 'addon'}-${item.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} onPress={() => toggleItem(item.id)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: picked ? colors.primary : colors.border }]}>
                        <View style={[styles.serviceIcon, { backgroundColor: picked ? colors.primary : colors.secondary }]}><Feather name={picked ? 'check' : 'plus'} size={16} color={picked ? colors.primaryForeground : colors.primary} /></View>
                        <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.matchName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{minutesLabel(item.minutes)}</Text></View>
                        <Text style={[styles.price, { color: colors.foreground }]}>{money(item.priceValue)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {(stage === 'services' ? visibleServices : visibleAddons).length === 0 ? (
                  <View style={[styles.lookupHint, { marginTop: 0, backgroundColor: colors.secondary }]}><Feather name="search" size={15} color={colors.primary} /><Text style={[styles.hintText, { flex: 1, color: colors.primary }]}>{stage === 'services' ? 'No service matches that search.' : 'No add-on matches that search.'}</Text></View>
                ) : null}
              </>
            )}
            <View style={[styles.summary, { backgroundColor: colors.accent }]}><Text style={[styles.summaryLabel, { color: colors.accentForeground }]}>{`${chosenServices.length + chosenAddons.length} ${chosenServices.length + chosenAddons.length === 1 ? 'ITEM' : 'ITEMS'} · ${minutesLabel(totalMinutes)}`}</Text><Text style={[styles.summaryValue, { color: colors.accentForeground }]}>{money(totalPrice)}</Text></View>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            {saveError ? <Text style={[styles.footerNote, { color: colors.destructive, marginTop: 0, marginBottom: 8 }]}>{saveError}</Text> : null}
            {stage === 'schedule' ? (
              <TouchableOpacity disabled={saving || !slot} testID="confirm-booking" onPress={saveBooking} style={[styles.primaryButton, { backgroundColor: slot && !saving ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: slot && !saving ? colors.primaryForeground : colors.mutedForeground }]}>{saving ? 'Saving…' : slot ? `Book ${new Date(slot.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Choose a time'}</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity disabled={stage === 'services' && serviceIds.length === 0} testID="booking-next-step" onPress={goNext} style={[styles.primaryButton, { backgroundColor: stage === 'addons' || serviceIds.length > 0 ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: stage === 'addons' || serviceIds.length > 0 ? colors.primaryForeground : colors.mutedForeground }]}>{stage === 'services' ? (serviceIds.length === 0 ? 'Choose a service' : 'Continue') : chosenAddons.length === 0 ? 'Skip add-ons' : 'Continue'}</Text></TouchableOpacity>
            )}
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
