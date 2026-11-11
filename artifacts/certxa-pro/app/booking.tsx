import { useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Animated, PanResponder, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { useBookingData, type ClientProfile, type ServiceProfile } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { businessToday, zonedTimeLabel } from '@/lib/businessTime';
import { HelpTitle } from '@/components/HelpTitle';
import { ClientAvatar } from '@/components/ClientAvatar';

import { AppBackground } from '@/components/look/AppBackground';
import { usePaymentsReady } from '@/lib/usePaymentsReady';
import { look, cardShadow } from '@/components/look/tokens';
type AddonOption = { id: number; name: string; priceValue: number; minutes: number; serviceIds: number[] };
type Slot = { time: string; staffId: number; staffName: string };
type Stage = 'client' | 'services' | 'addons' | 'calendar' | 'times' | 'payment-choice';
type PaymentChoice = 'request' | 'skip';

function money(value: number) { return `$${value.toFixed(2)}`; }
function minutesLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}
function isoDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function PaymentChoiceSlider({ choice, onChoice, colors }: {
  choice: PaymentChoice | null;
  onChoice: (choice: PaymentChoice) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const startOffset = useRef(0);
  const maxTravel = useRef(0);
  const animateTo = (next: PaymentChoice) => Animated.spring(offset, {
    toValue: next === 'request' ? -maxTravel.current : maxTravel.current,
    useNativeDriver: true, speed: 22, bounciness: 5,
  }).start();
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => offset.stopAnimation((value) => { startOffset.current = value; }),
    onPanResponderMove: (_, gesture) => {
      const limit = maxTravel.current;
      offset.setValue(Math.max(-limit, Math.min(limit, startOffset.current + gesture.dx)));
    },
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) < 12) {
        if (choice) animateTo(choice); else offset.setValue(0);
        return;
      }
      const next: PaymentChoice = startOffset.current + gesture.dx < 0 ? 'request' : 'skip';
      onChoice(next);
      animateTo(next);
    },
    onPanResponderTerminate: () => { if (choice) animateTo(choice); else offset.setValue(0); },
  }), [choice, offset, onChoice]);

  return (
    <View style={[styles.choiceSlider, { backgroundColor: colors.muted, borderColor: colors.border }]} onLayout={(event) => { maxTravel.current = Math.max(0, event.nativeEvent.layout.width / 2 - 31); }}>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: choice === 'request' }} onPress={() => { onChoice('request'); animateTo('request'); }} style={styles.sliderSide}>
        <Text style={[styles.sliderLabel, { color: choice === 'request' ? colors.primary : colors.mutedForeground }]}>YES</Text>
      </TouchableOpacity>
      <View style={styles.sliderCenter} pointerEvents="none">
        <View style={[styles.sliderRail, { backgroundColor: choice === 'request' ? colors.primary : choice === 'skip' ? colors.accentForeground : colors.border }]} />
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: choice === 'skip' }} onPress={() => { onChoice('skip'); animateTo('skip'); }} style={styles.sliderSide}>
        <Text style={[styles.sliderLabel, { color: choice === 'skip' ? colors.accentForeground : colors.mutedForeground }]}>NO</Text>
      </TouchableOpacity>
      <Animated.View
        {...responder.panHandlers}
        accessibilityRole="switch"
        accessibilityLabel="Payment request choice"
        accessibilityHint="Slide left for yes, send a payment request. Slide right for no, confirm without a request."
        accessibilityState={{ checked: choice === 'request', disabled: false }}
        style={[styles.sliderThumb, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ translateX: offset }] }]}
      >
        <Feather name="shuffle" size={19} color={colors.primary} />
      </Animated.View>
    </View>
  );
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

function dateFromKey(key?: string) {
  if (!key) return new Date();
  const [year, month, day] = key.split('-').map(Number);
  if (!year || month === undefined || !day) return new Date();
  return new Date(year, month, day);
}

/** Open times for one business date, in the business's time zone, for the chosen service and visit shape. */
async function fetchDaySlots(args: {
  storeSlug: string; serviceId: number; date: string; duration: number;
  visitAddress: string; staffId: number | null; visitAt: 'place' | 'client';
}): Promise<Slot[]> {
  const url = `/api/public/store/${encodeURIComponent(args.storeSlug)}/availability?serviceId=${args.serviceId}&date=${args.date}&duration=${args.duration}${args.visitAddress ? `&visitAddress=${encodeURIComponent(args.visitAddress)}` : ''}${args.staffId ? `&staffId=${args.staffId}` : ''}${args.visitAt === 'client' ? '&visitAt=client' : ''}`;
  const rows = await api.get<Slot[]>(url);
  const seen = new Set<string>();
  const unique = (Array.isArray(rows) ? rows : []).filter((row) => {
    // Only the owner's own open times: this app never books another technician.
    if (args.staffId && Number(row?.staffId) !== args.staffId) return false;
    if (!row?.time || seen.has(row.time)) return false;
    seen.add(row.time);
    return true;
  });
  return unique.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

export default function BookingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Rebook (a paid booking's REBOOK): the same client's number and the same services, already chosen.
  const params = useLocalSearchParams<{ day?: string; phone?: string; serviceIds?: string; clientId?: string }>();
  const { clients, services, addClient, refresh, calendarDate, setCalendarDate, ownStaffId, timeZone } = useBookingData();
  const initialPhone = (params.phone ?? '').replace(/\D/g, '').slice(0, 10);
  // Booked from a client's profile, or Rebook: we already know who it's for, so it starts at the services.
  const presetId = Number(params.clientId) || 0;
  const presetClient = presetId ? clients.find((client) => client.customerId === presetId) ?? null : null;
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState('');
  const [stage, setStage] = useState<Stage>(presetClient ? 'services' : 'client');
  // Step 1 finds the client either by phone number (and can add a new one) or by name / e-mail.
  const [lookupTab, setLookupTab] = useState<'phone' | 'name'>('phone');
  const [query, setQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientProfile | null>(presetClient);
  const [ticketClient, setTicketClient] = useState<ClientProfile | null>(presetClient);
  // The clients may still be loading when the screen opens.
  const presetUsed = useRef(!!presetClient);
  useEffect(() => {
    if (!presetClient || presetUsed.current) return;
    presetUsed.current = true;
    setSelectedClient(presetClient);
    setTicketClient(presetClient);
    setStage('services');
  }, [presetClient]);
  // Step 2: one or more services. Step 3: optional add-ons for those services. Step 4: date + time.
  const [serviceIds, setServiceIds] = useState<number[]>(() => (params.serviceIds ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const [serviceQuery, setServiceQuery] = useState('');
  const [addonOptions, setAddonOptions] = useState<AddonOption[]>([]);
  const [addonIds, setAddonIds] = useState<number[]>([]);
  const [addonQuery, setAddonQuery] = useState('');
  const [storeSlug, setStoreSlug] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsState, setSlotsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [slot, setSlot] = useState<Slot | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => params.day ? dateFromKey(params.day) : calendarDate);
  const [monthCursor, setMonthCursor] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const [daySlots, setDaySlots] = useState<Record<string, Slot[]>>({});
  // Which month daySlots holds ("2026-10" = November, months from 0), so a month still loading is never read as closed.
  const [slotsMonth, setSlotsMonth] = useState('');
  const [monthSlotsState, setMonthSlotsState] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [saving, setSaving] = useState(false);
  const [checkingPaymentPolicy, setCheckingPaymentPolicy] = useState(false);
  const [paymentRequirement, setPaymentRequirement] = useState<'deposit' | 'card_on_file' | null>(null);
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice | null>(null);
  const paymentsReady = usePaymentsReady();
  // Repeat (owner, 2026-11-03): the same visit every 1–4 weeks, 2–12 times in all; 0 = doesn't repeat.
  const [repeatWeeks, setRepeatWeeks] = useState(0);
  const [repeatTimes, setRepeatTimes] = useState(4);
  const [saveError, setSaveError] = useState('');
  // Padded time (Settings › Booking rules): Certxa adds it to the visit when offering times and when saving the booking.
  const [padMinutes, setPadMinutes] = useState(0);
  useEffect(() => {
    api.get<{ paddedMinutes?: number } | null>('/api/calendar-settings').then((c) => setPadMinutes(Number(c?.paddedMinutes ?? 0) || 0)).catch(() => undefined);
  }, []);
  // Solo plan: where the visit happens. A house call needs the client's address; the travel fee is added.
  const [places, setPlaces] = useState<{ ownPlace: 'salon' | 'home' | 'none'; houseCalls: boolean; houseCallFee: number } | null>(null);
  const [visitAt, setVisitAt] = useState<'place' | 'client'>('place');
  const [houseAddress, setHouseAddress] = useState({ line1: '', city: '', state: '', postcode: '' });
  useEffect(() => {
    api.get<{ ownPlace: 'salon' | 'home' | 'none'; houseCalls: boolean; houseCallFee: number }>('/api/work-places')
      .then((p) => { setPlaces(p); if (p.ownPlace === 'none' && p.houseCalls) setVisitAt('client'); })
      .catch(() => undefined);
  }, []);
  const offersBoth = Boolean(places?.houseCalls && places.ownPlace !== 'none');
  // A full ZIP code fills in the city and state; they can still be changed.
  useEffect(() => {
    if (!/^\d{5}$/.test(houseAddress.postcode)) return;
    let stale = false;
    api.get<{ city: string; state: string }>(`/api/public/zip/${houseAddress.postcode}`)
      .then((place) => { if (!stale) setHouseAddress((a) => ({ ...a, city: place.city, state: place.state })); })
      .catch(() => undefined);
    return () => { stale = true; };
  }, [houseAddress.postcode]);
  const addressReady = Boolean(houseAddress.line1.trim() && houseAddress.city.trim() && /^[A-Za-z]{2}$/.test(houseAddress.state.trim()) && /^\d{5}$/.test(houseAddress.postcode.trim()));
  const monthCells = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [monthCursor]);
  const startOfToday = businessToday(timeZone);
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
  // A service done only at their place can't share a visit with one done only at the client's, so choosing one hides the other.
  const picked = services.filter((item) => serviceIds.includes(item.id));
  const usable = services.filter((item) => picked.includes(item) || !(
    (item.offeredAt === 'place' && (places?.ownPlace === 'none' || picked.some((x) => x.offeredAt === 'client')))
    || (item.offeredAt === 'client' && (places?.houseCalls === false || picked.some((x) => x.offeredAt === 'place')))));
  const visibleServices = serviceFilter ? usable.filter((item) => item.name.toLowerCase().includes(serviceFilter)) : usable;
  // An add-on linked to no service at all is offered with every service (same rule as the kiosk).
  const applicableAddons = addonOptions.filter((item) => item.serviceIds.length === 0 || item.serviceIds.some((id) => serviceIds.includes(id)));
  const addonFilter = addonQuery.trim().toLowerCase();
  const visibleAddons = addonFilter ? applicableAddons.filter((item) => item.name.toLowerCase().includes(addonFilter)) : applicableAddons;
  const chosenAddons = applicableAddons.filter((item) => addonIds.includes(item.id));
  const totalMinutes = chosenServices.reduce((sum, item) => sum + item.durationMinutes, 0) + chosenAddons.reduce((sum, item) => sum + item.minutes, 0);
  const totalPrice = chosenServices.reduce((sum, item) => sum + item.priceValue, 0) + chosenAddons.reduce((sum, item) => sum + item.priceValue, 0);
  const primaryServiceId = serviceIds[0];
  // A service done only at the client's (or only at the professional's place) decides where the visit is.
  const fixedVisit = !places?.houseCalls ? 'place' : places.ownPlace === 'none' ? 'client'
    : chosenServices.some((item) => item.offeredAt === 'client') ? 'client'
    : chosenServices.some((item) => item.offeredAt === 'place') ? 'place' : null;
  useEffect(() => { if (fixedVisit) setVisitAt(fixedVisit); }, [fixedVisit]);
  const dayParam = isoDay(selectedDate);
  // Past their maximum distance: they can still book it themselves, this only tells them.
  const [tooFar, setTooFar] = useState('');
  // The times for a house call are planned around the visits before and after it, from its address.
  const visitAddress = visitAt === 'client' && addressReady ? JSON.stringify({ line1: houseAddress.line1.trim(), city: houseAddress.city.trim(), state: houseAddress.state.trim().toUpperCase(), postcode: houseAddress.postcode.trim() }) : '';

  // Open times for the chosen date: Certxa works them out from business hours, each technician's
  // bookings and who can do the service. The whole visit plus the buffer has to fit.
  useEffect(() => {
    if (stage !== 'times' || !primaryServiceId || totalMinutes <= 0) return;
    let cancelled = false;
    setSlot(null);
    if (!storeSlug) { setSlots([]); setSlotsState('error'); return; }
    setSlotsState('loading');
    fetchDaySlots({ storeSlug, serviceId: primaryServiceId, date: dayParam, duration: totalMinutes, visitAddress, staffId: ownStaffId, visitAt })
      .then((rows) => { if (cancelled) return; setSlots(rows); setSlotsState('ready'); })
      .catch(() => { if (!cancelled) { setSlots([]); setSlotsState('error'); } });
    return () => { cancelled = true; };
  }, [dayParam, ownStaffId, primaryServiceId, stage, storeSlug, totalMinutes, visitAt, visitAddress]);

  // The calendar step asks Certxa for every day of the month on screen, so days with no room at all can be shaded out.
  useEffect(() => {
    if (stage !== 'calendar') return;
    if (!storeSlug || !primaryServiceId || totalMinutes <= 0) { setDaySlots({}); setSlotsMonth(''); setMonthSlotsState('ready'); return; }
    let cancelled = false;
    setMonthSlotsState('loading');
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    (async () => {
      const results: Record<string, Slot[]> = {};
      await Promise.all(Array.from({ length: daysInMonth }, (_, index) => {
        const day = new Date(year, month, index + 1);
        const key = isoDay(day);
        return fetchDaySlots({ storeSlug, serviceId: primaryServiceId, date: key, duration: totalMinutes, visitAddress, staffId: ownStaffId, visitAt })
          .then((rows) => { results[key] = rows; })
          .catch(() => { results[key] = []; });
      }));
      if (!cancelled) { setDaySlots(results); setSlotsMonth(`${year}-${month}`); setMonthSlotsState('ready'); }
    })();
    return () => { cancelled = true; };
  }, [stage, monthCursor, storeSlug, primaryServiceId, totalMinutes, visitAt, visitAddress, ownStaffId]);

  useEffect(() => {
    setTooFar('');
    if (!visitAddress || !storeSlug) return;
    let stale = false;
    api.post<{ ok: boolean; reason?: string; message?: string }>(`/api/public/store/${encodeURIComponent(storeSlug)}/house-call`, { address: JSON.parse(visitAddress) })
      .then((r) => { if (!stale && r.reason === 'too_far') setTooFar(`${r.message} You can still book it.`); })
      .catch(() => undefined);
    return () => { stale = true; };
  }, [visitAddress, storeSlug]);

  const toggleItem = (id: number) => {
    const toggle = (current: number[]) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
    if (stage === 'services') setServiceIds(toggle); else setAddonIds(toggle);
  };
  const goBack = () => {
    setSaveError('');
    if (stage === 'payment-choice') setStage('times');
    else if (stage === 'times') setStage('calendar');
    else if (stage === 'calendar') setStage(applicableAddons.length > 0 ? 'addons' : 'services');
    else if (stage === 'addons') setStage('services');
    else if (presetClient) router.back();
    else setStage('client');
  };
  const goNext = () => {
    if (stage === 'services') {
      if (serviceIds.length === 0) return;
      // Drop add-ons that no longer belong to any chosen service.
      setAddonIds((current) => current.filter((id) => applicableAddons.some((item) => item.id === id)));
      setStage(applicableAddons.length > 0 ? 'addons' : 'calendar');
    } else if (stage === 'addons') {
      setStage('calendar');
    } else if (stage === 'calendar') {
      if (!dayChosen) return;
      setStage('times');
    }
  };
  // Closed day (owner, 2026-11-09): when the date page opens on a day with no open times (closed, past or fully booked),
  // the next day with open times is chosen, looking up to three months ahead. Once the pro taps a day, it's theirs.
  const autoPick = useRef(false);
  const autoPickHops = useRef(0);
  useEffect(() => {
    if (stage === 'calendar') { autoPick.current = true; autoPickHops.current = 0; }
  }, [stage]);
  useEffect(() => {
    const shown = `${monthCursor.getFullYear()}-${monthCursor.getMonth()}`;
    if (stage !== 'calendar' || !autoPick.current || monthSlotsState !== 'ready' || slotsMonth !== shown) return;
    const open = (day: Date) => (daySlots[isoDay(day)]?.length ?? 0) > 0 && day.getTime() >= startOfToday.getTime();
    const inShownMonth = selectedDate.getFullYear() === monthCursor.getFullYear() && selectedDate.getMonth() === monthCursor.getMonth();
    if (inShownMonth && open(selectedDate)) { autoPick.current = false; return; }
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    for (let date = inShownMonth ? selectedDate.getDate() : 1; date <= daysInMonth; date++) {
      const day = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), date);
      if (open(day)) { setSelectedDate(day); autoPick.current = false; return; }
    }
    if (autoPickHops.current >= 3) { autoPick.current = false; return; }
    autoPickHops.current += 1;
    setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1));
  }, [stage, monthSlotsState, slotsMonth, monthCursor, daySlots, selectedDate, startOfToday.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps
  // The calendar step's Continue: only for a chosen day that isn't past and has open times.
  const dayChosen = monthSlotsState === 'ready' && (daySlots[dayParam]?.length ?? 0) > 0 && selectedDate.getTime() >= startOfToday.getTime();
  const stepNumber = stage === 'client' ? 1 : stage === 'services' ? 2 : stage === 'addons' ? 3 : stage === 'calendar' ? 4 : stage === 'times' ? 5 : 6;
  const clientCanContinue = selectedClient !== null || (phoneDigits.length === 10 && name.trim().length > 0);
  const shiftMonth = (amount: number) => {
    autoPick.current = false;
    const next = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + amount, 1);
    setMonthCursor(next);
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

  const ensureSavedClient = async () => {
    if (!ticketClient) throw new Error('Choose a client before booking.');
    if (!ticketClient.id.startsWith('draft-')) return ticketClient;
    const primary = chosenServices[0];
    const saved = await addClient({
      name: ticketClient.name, initials: ticketClient.initials, phone: ticketClient.phone,
      lastVisit: 'Upcoming · Today', service: primary?.name ?? 'Appointment', visits: 0, spend: '$0', color: 'green',
    });
    setTicketClient(saved);
    return saved;
  };

  const continueFromSchedule = async () => {
    if (!ticketClient || !chosenServices[0] || !slot || saving || checkingPaymentPolicy) return;
    if (visitAt === 'client' && !addressReady) { setSaveError('Enter the client’s street address, city, 2-letter state and ZIP code.'); return; }
    setCheckingPaymentPolicy(true);
    setSaveError('');
    try {
      const client = await ensureSavedClient();
      const policy = await api.get<{ policy: 'none' | 'deposit' | 'card_on_file'; requirement: 'deposit' | 'card_on_file' | null }>(
        `/api/booking-payment-policy?customerId=${client.customerId}`,
      );
      // Texting a payment link needs card payments: until Stripe is set up the booking is confirmed without one
      // (owner, 2026-11-11).
      if (policy.requirement && paymentsReady !== false) {
        setPaymentRequirement(policy.requirement);
        setPaymentChoice(null);
        setStage('payment-choice');
      } else {
        setPaymentRequirement(null);
        setCheckingPaymentPolicy(false);
        await saveBooking(policy.requirement ? 'skip' : undefined, client);
      }
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : 'Could not check this account’s payment requirements.');
    } finally { setCheckingPaymentPolicy(false); }
  };

  const saveBooking = async (choice?: PaymentChoice, savedClient?: ClientProfile) => {
    const primary = chosenServices[0];
    if (!ticketClient || !primary || !slot || saving) return;
    if (visitAt === 'client' && !addressReady) { setSaveError('Enter the client’s street address, city, 2-letter state and ZIP code.'); return; }
    setSaving(true); setSaveError('');
    try {
      const client = savedClient ?? await ensureSavedClient();
      // Certxa keeps one main service per appointment. The first service chosen is that one; any
      // others are added as their own priced lines on the same ticket, and the appointment's
      // length covers everything. The technician is the one Certxa offered for the chosen time.
      const extras = chosenServices.slice(1);
      const created = await api.post<{ id?: number; paymentHold?: { notificationSent?: boolean; requirement?: string } }>('/api/appointments', {
        customerId: client.customerId,
        serviceId: primary.id,
        staffId: slot.staffId,
        duration: totalMinutes,
        date: slot.time,
        ...(extras.length > 0 ? { additionalServiceIds: extras.map((item) => item.id) } : {}),
        ...(chosenAddons.length > 0 ? { addonIds: chosenAddons.map((item) => item.id) } : {}),
        ...(choice ? { paymentChoice: choice } : {}),
        ...(visitAt === 'client' ? { visitAt: 'client', clientAddress: { line1: houseAddress.line1.trim(), city: houseAddress.city.trim(), state: houseAddress.state.trim().toUpperCase(), postcode: houseAddress.postcode.trim() } } : {}),
      });
      const newId = Number(created?.id);
      let repeatNote = '';
      if (repeatWeeks > 0 && !created.paymentHold && Number.isInteger(newId) && newId > 0) {
        const r = await api.post<{ created: string[]; skipped: string[] }>(`/api/appointments/${newId}/repeat`, { everyWeeks: repeatWeeks, times: repeatTimes }).catch(() => null);
        if (r && r.skipped.length) repeatNote = `${r.created.length + 1} booked. ${r.skipped.length} date${r.skipped.length === 1 ? ' was' : 's were'} skipped because the time was taken: ${r.skipped.map((d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}.`;
      }
      setCalendarDate(selectedDate);
      await refresh();
      if (repeatNote) Alert.alert('Repeat booking', repeatNote);
      if (created.paymentHold && !created.paymentHold.notificationSent) Alert.alert('Payment link not sent', 'The appointment is on hold, but Certxa could not text the client. Contact the client before the hold expires.');
      else if (created.paymentHold && repeatWeeks > 0) Alert.alert('Payment request sent', 'The first appointment is on hold. Recurring dates were not added while payment is pending.');
      router.replace('/calendar');
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not create appointment.'); }
    finally { setSaving(false); }
  };

  const titleDate = selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} behavior="padding" keyboardVerticalOffset={0}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.navbar}>
        {stage === 'client' ? (
          <>
            <View><Text style={[styles.wordmark, { color: colors.foreground }]}>Certxa<Text style={{ color: colors.primary }}>.</Text></Text><Text style={[styles.navSub, { color: colors.mutedForeground }]}>NEW BOOKING</Text></View>
            <TouchableOpacity testID="close-booking" accessibilityLabel="Close booking" onPress={() => router.back()} style={styles.navButton}><Feather name="x" size={21} color={colors.foreground} /></TouchableOpacity>
          </>
        ) : stage === 'payment-choice' ? (
          <>
            <TouchableOpacity testID="payment-choice-back" accessibilityLabel="Back to appointment details" onPress={goBack} style={styles.backLink}><Feather name="arrow-left" size={19} color={colors.foreground} /><Text style={[styles.backLabel, { color: colors.foreground }]}>Appointment</Text></TouchableOpacity>
            <Text style={[styles.navSub, { color: colors.mutedForeground }]}>{`STEP ${stepNumber} OF ${stage === 'payment-choice' ? 6 : 5}`}</Text>
          </>
        ) : (
          <>
            <TouchableOpacity testID="booking-back-to-client" accessibilityLabel="Back to client" onPress={goBack} style={styles.backLink}><Feather name="arrow-left" size={19} color={colors.foreground} /><Text style={[styles.backLabel, { color: colors.foreground }]}>Client</Text></TouchableOpacity>
            <Text style={[styles.navSub, { color: colors.mutedForeground }]}>{`STEP ${stepNumber} OF 5`}</Text>
          </>
        )}
      </View>

      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}><View style={[styles.progressFill, { backgroundColor: colors.primary, width: stage === 'payment-choice' || stage === 'times' ? '100%' : `${stepNumber * 25}%` }]} /></View>

      {stage === 'client' ? (
        <>
          <ScrollView contentContainerStyle={styles.clientContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 1 · CLIENT</Text>
              <HelpTitle help="booking" style={[styles.heading, { color: colors.foreground }]}>Who are we booking?</HelpTitle>
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
              {phoneDigits.length > 0 && <TouchableOpacity testID="clear-phone" onPress={() => pressNumber('clear')} style={styles.phoneClear}><Feather name="x" size={17} color={colors.mutedForeground} /></TouchableOpacity>}
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
                    <ClientAvatar clientId={client.customerId} avatarUrl={client.avatarUrl} initials={client.initials} style={[styles.avatar, { backgroundColor: client.color === 'sand' ? colors.accent : colors.secondary }]} textStyle={[styles.avatarText, { color: client.color === 'sand' ? colors.accentForeground : colors.primary }]} />
                    <View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>{client.name}</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{formatPhone(client.phone)}</Text></View>
                    <Feather name={isSelected ? 'check-circle' : 'chevron-right'} size={19} color={isSelected ? colors.primary : colors.mutedForeground} />
                  </TouchableOpacity>;
                })}
              </View>
            ) : phoneDigits.length === 10 ? (
              <View style={[styles.newClientPanel, { backgroundColor: colors.secondary }]}>
                <View style={styles.newClientHeading}><View style={[styles.newClientIcon, { backgroundColor: colors.card }]}><Feather name="user-plus" size={19} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>New client</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{formatPhone(phoneDigits)} isn’t in your list yet.</Text></View></View>
                <TextInput testID="booking-new-client-name" autoCapitalize="words" value={name} onChangeText={(value) => { setName(value); setSelectedClient(null); }} placeholder="Client’s first and last name" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} returnKeyType="done" />
              </View>
            ) : (
              <View style={[styles.lookupHint, { backgroundColor: colors.secondary }]}><Feather name="search" size={17} color={colors.primary} /><Text style={[styles.hintText, { color: colors.primary }]}>Enter a phone number to find a client.</Text></View>
            )}
            </>) : (<>
              <TextInput testID="booking-name-search" autoCapitalize="none" autoCorrect={false} value={query} onChangeText={(value) => { setQuery(value); setSelectedClient(null); }} placeholder="Client name or e-mail" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { height: 50, fontSize: 17, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
              {nameMatches.length > 0 ? (
                <View style={styles.lookupSection}>
                  <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{nameMatches.length === 1 ? 'CLIENT FOUND' : 'MATCHES'}</Text>
                  {nameMatches.slice(0, 8).map((client) => {
                    const isSelected = selectedClient?.id === client.id;
                    return <TouchableOpacity key={client.id} testID={`booking-name-match-${client.id}`} onPress={() => chooseClient(client)} style={[styles.matchCard, { backgroundColor: colors.card, borderColor: isSelected ? colors.primary : colors.border }]}>
                      <ClientAvatar clientId={client.customerId} avatarUrl={client.avatarUrl} initials={client.initials} style={[styles.avatar, { backgroundColor: client.color === 'sand' ? colors.accent : colors.secondary }]} textStyle={[styles.avatarText, { color: client.color === 'sand' ? colors.accentForeground : colors.primary }]} />
                      <View style={{ flex: 1 }}><Text style={[styles.matchName, { color: colors.foreground }]}>{client.name}</Text><Text numberOfLines={1} style={[styles.matchPhone, { color: colors.mutedForeground }]}>{[client.phone ? formatPhone(client.phone.replace(/\D/g, '').slice(-10)) : '', client.email ?? ''].filter(Boolean).join(' · ') || 'No phone or e-mail on file'}</Text></View>
                      <Feather name={isSelected ? 'check-circle' : 'chevron-right'} size={19} color={isSelected ? colors.primary : colors.mutedForeground} />
                    </TouchableOpacity>;
                  })}
                </View>
              ) : (
                <View style={[styles.lookupHint, { backgroundColor: colors.secondary }]}><Feather name="search" size={17} color={colors.primary} /><Text style={[styles.hintText, { flex: 1, color: colors.primary }]}>{queryText.length < 2 ? 'Type a name or e-mail to find a client.' : 'No client found. Use the Phone number tab to add someone new.'}</Text></View>
              )}
            </>)}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            <TouchableOpacity testID="continue-booking" disabled={!clientCanContinue} onPress={continueToDetails} style={[styles.primaryButton, { backgroundColor: clientCanContinue ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: clientCanContinue ? colors.primaryForeground : colors.mutedForeground }]}>{selectedClient ? `Continue with ${selectedClient.name.split(' ')[0]}` : 'Add client to booking'}</Text><Feather name="arrow-right" size={19} color={clientCanContinue ? colors.primaryForeground : colors.mutedForeground} /></TouchableOpacity>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>Client records are loaded from and saved to Certxa.</Text>
          </View>
        </>
      ) : stage === 'payment-choice' ? (
        <>
          <ScrollView contentContainerStyle={styles.paymentContent} showsVerticalScrollIndicator={false}>
            <View style={[styles.paymentBadge, { backgroundColor: colors.secondary }]}>
              <Feather name={paymentRequirement === 'deposit' ? 'dollar-sign' : 'credit-card'} size={16} color={colors.primary} />
              <Text style={[styles.paymentBadgeText, { color: colors.primary }]}>{paymentRequirement === 'deposit' ? 'DEPOSIT' : 'CARD ON FILE'}</Text>
            </View>
            <Text style={[styles.paymentHeading, { color: colors.foreground }]}>
              {paymentRequirement === 'deposit'
                ? `Send a deposit request to ${ticketClient?.name.split(' ')[0]}?`
                : `Send ${ticketClient?.name.split(' ')[0]} a secure card link?`}
            </Text>
            <Text style={[styles.paymentSubheading, { color: colors.mutedForeground }]}>
              {paymentRequirement === 'deposit'
                ? 'They’ll get a secure text link to pay the deposit and confirm this appointment.'
                : 'They’ll get a secure text link to save a card for this appointment. They won’t be charged now.'}
            </Text>

            <View style={[styles.paymentSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <ClientAvatar clientId={ticketClient?.customerId ?? 0} avatarUrl={ticketClient?.avatarUrl} initials={ticketClient?.initials ?? '?'} style={[styles.paymentAvatar, { backgroundColor: colors.accent }]} textStyle={[styles.paymentAvatarText, { color: colors.accentForeground }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.paymentClientName, { color: colors.foreground }]}>{ticketClient?.name}</Text>
                <Text style={[styles.paymentDetail, { color: colors.mutedForeground }]}>{`${chosenServices.map((item) => item.name).join(', ')} · ${titleDate} · ${slot ? zonedTimeLabel(slot.time, timeZone) : ''}`}</Text>
              </View>
            </View>

            <View style={styles.choiceBlock}>
              <View style={styles.choiceLabels}>
                <Text style={[styles.choiceCaption, { color: paymentChoice === 'request' ? colors.primary : colors.mutedForeground }]}>YES, SEND IT</Text>
                <Text style={[styles.choiceCaption, { color: paymentChoice === 'skip' ? colors.accentForeground : colors.mutedForeground }]}>NO, CONFIRM</Text>
              </View>
              <PaymentChoiceSlider choice={paymentChoice} onChoice={setPaymentChoice} colors={colors} />
              <Text style={[styles.choiceInstruction, { color: colors.mutedForeground }]}>Slide the handle left for yes or right for no. You can also tap either side.</Text>
            </View>

            <View style={[styles.choiceOutcome, { backgroundColor: paymentChoice === 'request' ? colors.secondary : colors.accent }]}>
              <Feather name={paymentChoice === 'request' ? 'message-circle' : 'check-circle'} size={19} color={paymentChoice === 'request' ? colors.primary : colors.accentForeground} />
              <Text style={[styles.choiceOutcomeText, { color: paymentChoice === 'request' ? colors.primary : colors.accentForeground }]}>
                {paymentChoice === 'request'
                  ? 'A payment link will be texted. The time stays on hold until the client completes it.'
                  : paymentChoice === 'skip'
                    ? 'The appointment will be confirmed now, without sending a payment link.'
                    : 'Choose whether to send the payment link before confirming.'}
              </Text>
            </View>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            {saveError ? <Text style={[styles.footerNote, { color: colors.destructive, marginTop: 0, marginBottom: 8 }]}>{saveError}</Text> : null}
            <TouchableOpacity disabled={!paymentChoice || saving} testID="submit-payment-choice" onPress={() => paymentChoice && void saveBooking(paymentChoice)} style={[styles.primaryButton, { backgroundColor: paymentChoice ? colors.primary : colors.muted }]}>
              <Text style={[styles.primaryButtonText, { color: paymentChoice ? colors.primaryForeground : colors.mutedForeground }]}>
                {saving ? 'Saving…' : paymentChoice === 'request'
                  ? paymentRequirement === 'deposit' ? 'Send deposit request' : 'Send card link'
                  : paymentChoice === 'skip' ? 'Confirm appointment' : 'Choose yes or no'}
              </Text>
              <Feather name={paymentChoice === 'skip' ? 'check' : 'arrow-right'} size={19} color={paymentChoice ? colors.primaryForeground : colors.mutedForeground} />
            </TouchableOpacity>
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>{repeatWeeks > 0 && paymentChoice === 'request' ? 'Recurring dates are not added while the first appointment is awaiting payment.' : paymentChoice === 'request' ? 'The client will receive a secure payment link by text.' : 'No money is collected by choosing No.'}</Text>
          </View>
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.detailsContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {stage === 'calendar' ? (
              <>
                <View style={styles.intro}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>{visitAt === 'client' ? 'STEP 4 · ADDRESS AND TIME' : 'STEP 4 · DATE AND TIME'}</Text>
                  <HelpTitle help="booking" style={[styles.heading, { color: colors.foreground }]}>{visitAt === 'client' ? 'Where and when is the appointment?' : 'When are they coming in?'}</HelpTitle>
                  <Text style={[styles.subheading, { color: colors.mutedForeground }]}>{visitAt === 'client' ? `Times shown leave room to drive there, set up, and pack up.` : (padMinutes ? `Times shown have room for ${minutesLabel(totalMinutes)} plus ${padMinutes} minutes padded time.` : `Times shown have room for ${minutesLabel(totalMinutes)}.`)}</Text>
                </View>
                {offersBoth && !fixedVisit ? (
                  <View style={styles.placeRow}>
                    <View style={{ flex: 1 }}>
                      <SelectField testID="booking-visit" title="Where" value={visitAt} options={[{ value: 'place', label: 'At my place' }, { value: 'client', label: 'House call' }]} onChange={setVisitAt} />
                    </View>
                  </View>
                ) : null}
                {visitAt === 'client' ? (
                  <View style={styles.addressBlock}>
                    <Text style={[styles.addressLabel, { color: colors.foreground }]}>Client’s address</Text>
                    <TextInput testID="booking-house-line1" autoCapitalize="words" value={houseAddress.line1} onChangeText={(v) => setHouseAddress((a) => ({ ...a, line1: v }))} placeholder="Street address" placeholderTextColor={colors.mutedForeground} style={[styles.addressInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                    <View style={styles.placeRow}>
                      <TextInput testID="booking-house-zip" keyboardType="number-pad" maxLength={5} value={houseAddress.postcode} onChangeText={(v) => setHouseAddress((a) => ({ ...a, postcode: v }))} placeholder="ZIP" placeholderTextColor={colors.mutedForeground} style={[styles.addressInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                      <TextInput testID="booking-house-state" autoCapitalize="characters" maxLength={2} value={houseAddress.state} onChangeText={(v) => setHouseAddress((a) => ({ ...a, state: v }))} placeholder="State" placeholderTextColor={colors.mutedForeground} style={[styles.addressInput, { flex: 1, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                    </View>
                    <TextInput testID="booking-house-city" autoCapitalize="words" value={houseAddress.city} onChangeText={(v) => setHouseAddress((a) => ({ ...a, city: v }))} placeholder="City" placeholderTextColor={colors.mutedForeground} style={[styles.addressInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                    {tooFar ? <Text testID="booking-too-far" style={[styles.addressNote, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>{tooFar}</Text> : null}
                    {places?.houseCallFee ? <Text style={[styles.addressNote, { color: colors.mutedForeground }]}>{`$${Number(places.houseCallFee).toFixed(2)} travel fee is added. Times shown leave your travel time free.`}</Text>
                      : <Text style={[styles.addressNote, { color: colors.mutedForeground }]}>Times shown leave your travel time free.</Text>}
                  </View>
                ) : null}
                <View style={styles.monthRow}>
                  <View>
                    <Text style={[styles.monthTitle, { color: colors.foreground }]}>{monthCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <Text style={[styles.monthSubtitle, { color: colors.mutedForeground }]}>Choose an appointment date</Text>
                  </View>
                  <View style={styles.monthActions}>
                    <TouchableOpacity testID="booking-previous-month" accessibilityLabel="Previous month" onPress={() => shiftMonth(-1)} style={styles.arrowButton}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
                    <TouchableOpacity testID="booking-next-month" accessibilityLabel="Next month" onPress={() => shiftMonth(1)} style={styles.arrowButton}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
                  </View>
                </View>
                <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.calendarHeaderRow, { borderBottomColor: colors.border }]}>
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
                      <View key={label} style={styles.calendarHeaderCell}><Text style={[styles.dayName, { color: colors.mutedForeground }]}>{label}</Text></View>
                    ))}
                  </View>
                  {monthCells.map((row, rowIndex) => (
                    <View key={`calendar-row-${rowIndex}`} style={[styles.calendarGridRow, rowIndex === monthCells.length - 1 ? styles.calendarGridRowLast : { borderBottomColor: colors.border }]}>
                      {row.map((day, dayIndex) => {
                        if (!day) {
                          return <View key={`calendar-blank-${rowIndex}-${dayIndex}`} style={styles.dayCell} />;
                        }
                        const dayKey = isoDay(day);
                        const available = monthSlotsState === 'ready' && Boolean(daySlots[dayKey] && daySlots[dayKey].length > 0);
                        const active = dayKey === dayParam;
                        const past = day.getTime() < startOfToday.getTime();
                        const disabled = past || !available;
                        return (
                          <TouchableOpacity key={dayKey} testID={`booking-day-${day.getDate()}`} disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: active, disabled }} onPress={() => { autoPick.current = false; setSelectedDate(day); setMonthCursor(new Date(day.getFullYear(), day.getMonth(), 1)); }} style={[styles.dayCell, active && { backgroundColor: colors.primary }, disabled && { opacity: 0.35 }]}>
                            <Text style={[styles.dayName, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                            <Text style={[styles.dayNumber, { color: active ? colors.primaryForeground : disabled ? colors.mutedForeground : colors.foreground }]}>{day.getDate()}</Text>
                            <View style={[styles.dayDot, { backgroundColor: active ? colors.primaryForeground : available ? colors.primary : colors.border }]} />
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>
              </>
            ) : stage === 'times' ? (
              <>
                <View style={styles.intro}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>STEP 5 · TIME</Text>
                  <HelpTitle help="booking" style={[styles.heading, { color: colors.foreground }]}>Pick an available time.</HelpTitle>
                  <Text style={[styles.subheading, { color: colors.mutedForeground }]}>{(padMinutes ? `Times shown have room for ${minutesLabel(totalMinutes)} plus ${padMinutes} minutes padded time.` : `Times shown have room for ${minutesLabel(totalMinutes)}.`)}</Text>
                </View>
                <View style={styles.sectionHeading}><Text style={[styles.sectionLabel, { color: colors.foreground }]}>AVAILABLE TIMES</Text><Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>{titleDate}</Text></View>
                {slotsState === 'ready' && slots.length > 0 ? (
                  <View style={styles.timeGrid}>
                    {slots.map((item) => {
                      const picked = slot?.time === item.time;
                      return <TouchableOpacity key={item.time} testID={`booking-time-${item.time}`} onPress={() => setSlot(item)} style={[styles.timeChip, { backgroundColor: picked ? colors.primary : colors.card, borderColor: picked ? colors.primary : colors.border }]}><Text style={[styles.timeText, { color: picked ? colors.primaryForeground : colors.foreground }]}>{`${zonedTimeLabel(item.time, timeZone)} - ${zonedTimeLabel(new Date(new Date(item.time).getTime() + (totalMinutes + padMinutes) * 60_000).toISOString(), timeZone)}`}</Text></TouchableOpacity>;
                    })}
                  </View>
                ) : (
                  <View style={[styles.lookupHint, { marginTop: 0, backgroundColor: colors.secondary }]}><Feather name={slotsState === 'error' ? 'alert-circle' : 'clock'} size={17} color={colors.primary} /><Text style={[styles.hintText, { flex: 1, color: colors.primary }]}>{slotsState === 'error' ? 'Could not load times from Certxa. Check the connection and pick the date again.' : slotsState === 'ready' ? 'No time on this day has room for the whole visit. Try another date.' : 'Checking available times…'}</Text></View>
                )}
                {slot ? <Text style={[styles.footerNote, { color: colors.mutedForeground, marginTop: 12 }]}>{`With ${slot.staffName}`}</Text> : null}
              </>
            ) : (
              <>
                <View style={styles.intro}>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>{stage === 'services' ? 'STEP 2 · SERVICES' : 'STEP 3 · ADD-ONS'}</Text>
                  <HelpTitle help="booking" style={[styles.heading, { color: colors.foreground }]}>{stage === 'services' ? 'What are we doing?' : 'Any add-ons?'}</HelpTitle>
                  <Text style={[styles.subheading, { color: colors.mutedForeground }]}>{stage === 'services' ? `Choose one or more services for ${ticketClient?.name.split(' ')[0] ?? 'this client'}.` : 'Optional extras for the services you picked.'}</Text>
                </View>
                <TextInput testID={stage === 'services' ? 'booking-service-search' : 'booking-addon-search'} autoCapitalize="none" autoCorrect={false} value={stage === 'services' ? serviceQuery : addonQuery} onChangeText={stage === 'services' ? setServiceQuery : setAddonQuery} placeholder={stage === 'services' ? 'Search services' : 'Search add-ons'} placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { height: 48, fontSize: 17, marginBottom: 12, backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                <View style={styles.serviceList}>
                  {(stage === 'services' ? visibleServices.map((item) => ({ id: item.id, name: item.name, minutes: item.durationMinutes, priceValue: item.priceValue })) : visibleAddons).map((item) => {
                    const picked = (stage === 'services' ? serviceIds : addonIds).includes(item.id);
                    return (
                      <TouchableOpacity key={item.id} testID={`booking-${stage === 'services' ? 'service' : 'addon'}-${item.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: picked }} onPress={() => toggleItem(item.id)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: picked ? colors.primary : colors.border }]}>
                        <View style={[styles.serviceIcon, { backgroundColor: picked ? colors.primary : colors.secondary }]}><Feather name={picked ? 'check' : 'plus'} size={18} color={picked ? colors.primaryForeground : colors.primary} /></View>
                        <View style={{ flex: 1 }}><Text numberOfLines={1} style={[styles.matchName, { color: colors.foreground }]}>{item.name}</Text><Text style={[styles.matchPhone, { color: colors.mutedForeground }]}>{minutesLabel(item.minutes)}</Text></View>
                        <Text style={[styles.price, { color: colors.foreground }]}>{money(item.priceValue)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {(stage === 'services' ? visibleServices : visibleAddons).length === 0 ? (
                  <View style={[styles.lookupHint, { marginTop: 0, backgroundColor: colors.secondary }]}><Feather name="search" size={17} color={colors.primary} /><Text style={[styles.hintText, { flex: 1, color: colors.primary }]}>{stage === 'services' ? 'No service matches that search.' : 'No add-on matches that search.'}</Text></View>
                ) : null}
              </>
            )}
            {stage === 'times' ? (
              <View style={styles.placeRow}>
                <View style={{ flex: 1 }}>
                  <SelectField testID="booking-repeat" title="Repeat" value={repeatWeeks} onChange={setRepeatWeeks}
                    options={[{ value: 0, label: "Doesn't repeat" }, { value: 1, label: 'Every week' }, { value: 2, label: 'Every 2 weeks' }, { value: 3, label: 'Every 3 weeks' }, { value: 4, label: 'Every 4 weeks' }]} />
                </View>
                {repeatWeeks > 0 ? (
                  <View style={{ flex: 1 }}>
                    <SelectField testID="booking-repeat-times" title="How many times" value={repeatTimes} onChange={setRepeatTimes}
                      options={[2, 3, 4, 5, 6, 8, 10, 12].map((n) => ({ value: n, label: `${n} times in all` }))} />
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={[styles.summary, { backgroundColor: colors.accent }]}><Text style={[styles.summaryLabel, { color: colors.accentForeground }]}>{`${chosenServices.length + chosenAddons.length} ${chosenServices.length + chosenAddons.length === 1 ? 'ITEM' : 'ITEMS'} · ${minutesLabel(totalMinutes)}`}</Text><Text style={[styles.summaryValue, { color: colors.accentForeground }]}>{money(totalPrice)}</Text></View>
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 16) }]}>
            {saveError ? <Text style={[styles.footerNote, { color: colors.destructive, marginTop: 0, marginBottom: 8 }]}>{saveError}</Text> : null}
            {stage === 'calendar' ? (
              <TouchableOpacity testID="booking-next-step" disabled={!dayChosen} onPress={goNext} style={[styles.primaryButton, { backgroundColor: dayChosen ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: dayChosen ? colors.primaryForeground : colors.mutedForeground }]}>{monthSlotsState === 'loading' ? 'Checking open days…' : dayChosen ? 'Continue' : 'Choose a date'}</Text><Feather name="arrow-right" size={19} color={dayChosen ? colors.primaryForeground : colors.mutedForeground} /></TouchableOpacity>
            ) : stage === 'times' ? (
              <TouchableOpacity disabled={saving || checkingPaymentPolicy || !slot} testID="confirm-booking" onPress={() => void continueFromSchedule()} style={[styles.primaryButton, { backgroundColor: slot && !saving && !checkingPaymentPolicy ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: slot && !saving && !checkingPaymentPolicy ? colors.primaryForeground : colors.mutedForeground }]}>{checkingPaymentPolicy ? 'Checking payment settings…' : saving ? 'Saving…' : slot ? `Book ${zonedTimeLabel(slot.time, timeZone)}` : 'Choose a time'}</Text><Feather name="arrow-right" size={19} color={slot && !saving && !checkingPaymentPolicy ? colors.primaryForeground : colors.mutedForeground} /></TouchableOpacity>
            ) : (
              <TouchableOpacity disabled={stage === 'services' && serviceIds.length === 0} testID="booking-next-step" onPress={goNext} style={[styles.primaryButton, { backgroundColor: stage === 'addons' || serviceIds.length > 0 ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: stage === 'addons' || serviceIds.length > 0 ? colors.primaryForeground : colors.mutedForeground }]}>{stage === 'services' ? (serviceIds.length === 0 ? 'Choose a service' : 'Continue') : chosenAddons.length === 0 ? 'Skip add-ons' : 'Continue'}</Text><Feather name="arrow-right" size={19} color={stage === 'addons' || serviceIds.length > 0 ? colors.primaryForeground : colors.mutedForeground} /></TouchableOpacity>
            )}
            <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>This appointment will be saved to Certxa.</Text>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  placeRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  placeChip: { flex: 1, borderWidth: 1, borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  placeChipText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  addressBlock: { gap: 10, marginBottom: 18 },
  addressLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  addressInput: { borderWidth: 1, borderRadius: 12, height: 48, paddingHorizontal: 12, fontSize: 17, fontFamily: 'Inter_400Regular' },
  addressNote: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  root: { flex: 1 },
  navbar: { minHeight: 55, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wordmark: { fontSize: 22, letterSpacing: -0.7, fontFamily: 'Inter_700Bold' },
  navSub: { fontSize: 12, letterSpacing: 1.25, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  navButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  progressTrack: { height: 3, marginHorizontal: 20, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  clientContent: { paddingHorizontal: 20, paddingTop: 23, paddingBottom: 22 },
  detailsContent: { paddingHorizontal: 20, paddingTop: 23, paddingBottom: 24 },
  intro: { marginBottom: 19 },
  eyebrow: { fontSize: 13, letterSpacing: 1.3, fontFamily: 'Inter_700Bold' },
  heading: { fontSize: 24, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 7 },
  subheading: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 5 },
  phonePanel: { minHeight: 66, borderWidth: 1, borderRadius: 15, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 42, marginBottom: 13, ...cardShadow },
  phoneLabel: { fontSize: 12, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  phoneValue: { fontSize: 20, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.1, marginTop: 5 },
  phoneClear: { position: 'absolute', right: 10, top: 10, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 },
  keyButton: { width: '31.5%', height: 59, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyDigit: { fontSize: 23, fontFamily: 'Inter_600SemiBold' },
  clearLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  lookupHint: { marginTop: 14, minHeight: 41, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  lookupSection: { marginTop: 16, gap: 8 },
  sectionLabel: { fontSize: 13, letterSpacing: 1.15, fontFamily: 'Inter_700Bold' },
  matchCard: { borderWidth: 1, borderRadius: 15, padding: 10, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10, ...cardShadow },
  avatar: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  matchName: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  matchPhone: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 3 },
  newClientPanel: { marginTop: 14, borderRadius: 15, padding: 12 },
  newClientHeading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 11 },
  newClientIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nameInput: { height: 44, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 11 },
  primaryButton: { minHeight: 49, borderRadius: 15, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  footerNote: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 8 },
  paymentContent: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 26 },
  paymentBadge: { alignSelf: 'flex-start', minHeight: 28, borderRadius: 14, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  paymentBadgeText: { fontSize: 12, letterSpacing: 1.05, fontFamily: 'Inter_700Bold' },
  paymentHeading: { fontSize: 25, lineHeight: 31, letterSpacing: -0.6, fontFamily: 'Inter_700Bold', marginTop: 18 },
  paymentSubheading: { fontSize: 16, lineHeight: 25, fontFamily: 'Inter_400Regular', marginTop: 8 },
  paymentSummary: { borderWidth: 1, borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 23, ...cardShadow },
  paymentAvatar: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  paymentAvatarText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  paymentClientName: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  paymentDetail: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 4 },
  choiceBlock: { marginTop: 29 },
  choiceLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 9 },
  choiceCaption: { fontSize: 12, letterSpacing: 0.75, fontFamily: 'Inter_700Bold' },
  choiceSlider: { height: 62, borderWidth: 1, borderRadius: 31, flexDirection: 'row', alignItems: 'center', position: 'relative', overflow: 'hidden' },
  sliderSide: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  sliderLabel: { fontSize: 14, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  sliderCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  sliderRail: { width: 2, height: 22, borderRadius: 1 },
  sliderThumb: { position: 'absolute', left: '50%', marginLeft: -28, top: 2, width: 54, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  choiceInstruction: { textAlign: 'center', fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 9 },
  choiceOutcome: { minHeight: 58, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 20 },
  choiceOutcomeText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  ticketClient: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  changeLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', paddingHorizontal: 4, paddingVertical: 8 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 13 },
  monthTitle: { fontSize: 22, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold' },
  monthSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4 },
  monthActions: { flexDirection: 'row', gap: 8 },
  arrowButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayName: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  dayNumber: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  dayDot: { width: 4, height: 4, borderRadius: 2 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 19, marginBottom: 9 },
  sectionHint: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  serviceList: { gap: 7 },
  serviceRow: { borderWidth: 1, borderRadius: 14, minHeight: 59, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9, ...cardShadow },
  price: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  serviceIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  weekCard: { borderWidth: 1, borderRadius: 19, paddingHorizontal: 8, paddingVertical: 12 },
  calendarHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 5 },
  calendarHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  calendarGridRow: { flexDirection: 'row', borderBottomWidth: 1 },
  calendarGridRowLast: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 14, gap: 7 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: { width: '48.5%', minHeight: 44, borderWidth: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  summary: { borderRadius: 13, minHeight: 48, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  summaryLabel: { fontSize: 12, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  summaryValue: { fontSize: 17, fontFamily: 'Inter_700Bold' },
});
