import { useCallback, useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { MenuCard } from '@/components/look/MenuCard';
import { PromoCarousel } from '@/components/look/PromoCarousel';
import { SectionHeader } from '@/components/look/SectionHeader';
import { look, cardShadow } from '@/components/look/tokens';

type DaySchedule = { day: string; short: string; enabled: boolean; hours: string };
const initialHours: DaySchedule[] = [
  { day: 'Monday', short: 'M', enabled: true, hours: '9:00 AM – 5:00 PM' },
  { day: 'Tuesday', short: 'T', enabled: true, hours: '9:00 AM – 5:00 PM' },
  { day: 'Wednesday', short: 'W', enabled: true, hours: '10:00 AM – 6:00 PM' },
  { day: 'Thursday', short: 'T', enabled: true, hours: '9:00 AM – 5:00 PM' },
  { day: 'Friday', short: 'F', enabled: true, hours: '9:00 AM – 4:00 PM' },
  { day: 'Saturday', short: 'S', enabled: true, hours: '10:00 AM – 3:00 PM' },
  { day: 'Sunday', short: 'S', enabled: false, hours: 'Closed' },
];

function availabilityDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function minutesFromClock(value: string) {
  const [clock, period] = value.split(' ');
  const [hours, minutes] = clock.split(':').map(Number);
  return (hours % 12 + (period === 'PM' ? 12 : 0)) * 60 + minutes;
}

function slotLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function slotsForDay(day: DaySchedule) {
  if (!day.enabled || day.hours === 'Closed') return [];
  const [start, end] = day.hours.split(' – ');
  const startMinutes = minutesFromClock(start);
  const endMinutes = minutesFromClock(end);
  const slots: string[] = [];
  for (let time = startMinutes; time < endMinutes; time += 15) slots.push(slotLabel(time));
  return slots;
}

function slotRows(slots: string[]) {
  const rows: string[][] = [];
  for (let index = 0; index < slots.length; index += 3) rows.push(slots.slice(index, index + 3));
  return rows;
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ screen?: string }>();
  const [stripeReady, setStripeReady] = useState(false);
  const [availability, setAvailability] = useState<DaySchedule[]>(initialHours);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [slotOverrides, setSlotOverrides] = useState<Record<string, string[]>>({});
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [showWeeklyHours, setShowWeeklyHours] = useState(false);
  const [reminders, setReminders] = useState(true);
  const [openingPlus, setOpeningPlus] = useState(false);
  // Plus and Business Phone cards show only while the account doesn't have them (owner, 2026-11-04); checked each time
  // More opens, so a card comes back when Plus or the number ends. Hidden until known, so a card never flashes.
  const [enrolled, setEnrolled] = useState<{ plus: boolean; phone: boolean } | null>(null);
  const loadEnrolled = useCallback(async () => {
    const [plus, phone] = await Promise.all([
      api.get<{ plus?: boolean }>('/api/solo/plus').catch(() => null),
      api.get<{ phoneNumber: string } | null>('/api/pro/phone').catch(() => null),
    ]);
    setEnrolled({ plus: !!plus?.plus, phone: !!phone });
  }, []);
  useFocusEffect(useCallback(() => { void loadEnrolled(); }, [loadEnrolled]));
  const openPlus = async () => {
    setOpeningPlus(true);
    try {
      const { url } = await api.post<{ url: string }>('/api/solo/plus/web-link');
      await WebBrowser.openAuthSessionAsync(url, 'certxa-pro://plus');
      await loadEnrolled();
    } catch (cause) {
      Alert.alert('Plus', cause instanceof Error ? cause.message : 'Could not open the Plus page. Please try again.');
    } finally {
      setOpeningPlus(false);
    }
  };
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const showingAvailability = params.screen === 'availability';
  // Checked each time More opens, so the Tap to Pay banner goes as soon as Stripe Connect is set up (owner, 2026-11-07).
  useFocusEffect(useCallback(() => {
    api.get<{ connected?: boolean; chargesEnabled?: boolean }>('/api/payments/stripe/status')
      .then((status) => setStripeReady(Boolean(status?.chargesEnabled && status?.connected !== false)))
      .catch(() => setStripeReady(false));
  }, []));
  const weekDays = useMemo(() => {
    const monday = new Date(selectedDate);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(monday);
      day.setDate(monday.getDate() + index);
      return day;
    });
  }, [selectedDate]);
  const visibleDays = useMemo(() => Array.from({ length: 2 }, (_, index) => {
    const day = new Date(selectedDate);
    day.setDate(day.getDate() + index);
    return day;
  }), [selectedDate]);

  const leaveAvailability = () => router.replace('/(tabs)/more');
  const shiftAvailabilityWeek = (amount: number) => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + amount * 7);
    setSelectedDate(next);
  };
  const toggleSlot = (dateKey: string, defaultSlots: string[], slot: string) => {
    setSlotOverrides((current) => {
      const activeSlots = current[dateKey] ?? defaultSlots;
      const nextSlots = activeSlots.includes(slot)
        ? activeSlots.filter((activeSlot) => activeSlot !== slot)
        : [...activeSlots, slot].sort();
      return { ...current, [dateKey]: nextSlots };
    });
  };

  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]}>
      {/* The Certxa Pro look (owner, 2026-11-09; components/look): lavender page, white cards, violet-barred sections.
          Behind the whole screen, the status bar included. */}
      {!showingAvailability && params.screen !== 'payments' ? <AppBackground /> : null}
      {showingAvailability ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.availabilityNav}>
            <TouchableOpacity testID="availability-back" onPress={leaveAvailability} style={styles.availabilityBack}><Feather name="arrow-left" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>Back</Text></TouchableOpacity>
            <Text style={[styles.availabilityNavTitle, { color: colors.foreground }]}>AVAILABILITY</Text>
            <TouchableOpacity testID="availability-weekly-hours" accessibilityLabel={showWeeklyHours ? 'Hide weekly hours' : 'Show weekly hours'} onPress={() => setShowWeeklyHours((visible) => !visible)} style={[styles.availabilityMenu, { backgroundColor: colors.primary }]}><Feather name={showWeeklyHours ? 'x' : 'menu'} size={20} color={colors.primaryForeground} /></TouchableOpacity>
          </View>
          <View style={styles.availabilityMonthRow}>
            <TouchableOpacity testID="availability-previous-week" accessibilityLabel="Previous week" onPress={() => shiftAvailabilityWeek(-1)} style={styles.availabilityArrow}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.availabilityMonth, { color: colors.foreground }]}>{selectedDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
            <TouchableOpacity testID="availability-next-week" accessibilityLabel="Next week" onPress={() => shiftAvailabilityWeek(1)} style={styles.availabilityArrow}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
          </View>
          <View style={[styles.weekStrip, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {weekDays.map((day) => {
              const active = availabilityDateKey(day) === availabilityDateKey(selectedDate);
              const today = availabilityDateKey(day) === availabilityDateKey(new Date());
              const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const past = dayStart < todayStart;
              return (
                <View key={availabilityDateKey(day)} style={styles.weekColumn}>
                  <Text style={[styles.weekdayLabel, { color: past ? colors.mutedForeground : colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                  <TouchableOpacity testID={`availability-date-${day.getDate()}`} accessibilityRole="button" accessibilityState={{ selected: active, disabled: past }} disabled={past} onPress={() => setSelectedDate(day)} style={[styles.weekDate, { backgroundColor: active ? colors.primary : past ? colors.muted : colors.secondary }]}>
                    <Text style={[styles.weekDateText, { color: active ? colors.primaryForeground : past ? colors.mutedForeground : colors.primary }]}>{day.getDate()}</Text>
                    <View style={[styles.weekDot, { backgroundColor: active ? colors.primaryForeground : today ? colors.primary : past ? colors.mutedForeground : colors.primary }]} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
          <View style={styles.availabilityHint}>
            <Text style={[styles.availabilityHintText, { color: colors.mutedForeground }]}>Tap a time to turn it on or off.</Text>
            <View style={styles.slotLegend}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendText, { color: colors.mutedForeground }]}>Available</Text></View>
          </View>
          <View style={styles.scheduleDays}>
            {visibleDays.map((day, dayIndex) => {
              const dayKey = availabilityDateKey(day);
              const weekdayIndex = (day.getDay() + 6) % 7;
              const weeklySchedule = availability[weekdayIndex];
              const defaultSlots = slotsForDay(weeklySchedule);
              const activeSlots = slotOverrides[dayKey] ?? defaultSlots;
              const blocked = blockedDates.includes(dayKey);
              const past = day < new Date(new Date().setHours(0, 0, 0, 0));
              const rows = slotRows(defaultSlots);
              return (
                <View key={dayKey} style={styles.scheduleDay}>
                  <View style={styles.scheduleDateColumn}>
                    <Text style={[styles.scheduleDateNumber, { color: colors.primary }]}>{day.getDate()}</Text>
                    <Text style={[styles.scheduleWeekday, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                  </View>
                  <View style={styles.scheduleSlots}>
                    <View style={styles.scheduleHeading}>
                      <Text style={[styles.scheduleDateTitle, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
                      <Text style={[styles.slotCount, { color: colors.mutedForeground }]}>{blocked ? 'Blocked' : weeklySchedule.enabled ? `${activeSlots.length} open` : 'Closed'}</Text>
                    </View>
                    {blocked || !weeklySchedule.enabled ? (
                      <View style={[styles.closedDay, { backgroundColor: colors.muted }]}><Text style={[styles.closedDayText, { color: colors.mutedForeground }]}>{blocked ? 'Unavailable all day' : 'No weekly hours set'}</Text></View>
                    ) : (
                      <View style={styles.slotGrid}>
                        {rows.map((row, rowIndex) => (
                          <View key={`${dayKey}-row-${rowIndex}`} style={[styles.slotRow, rowIndex < rows.length - 1 && styles.slotRowSpacing]}>
                            {row.map((slot, slotIndex) => {
                              const isAvailable = activeSlots.includes(slot);
                              return (
                                <TouchableOpacity key={slot} testID={`availability-slot-${dayKey}-${slot}`} accessibilityRole="button" accessibilityLabel={`${slot}, ${isAvailable ? 'available' : 'unavailable'}`} accessibilityState={{ selected: isAvailable, disabled: past }} disabled={past} onPress={() => toggleSlot(dayKey, defaultSlots, slot)} style={[styles.slotButton, slotIndex < row.length - 1 && styles.slotButtonSpacing, { backgroundColor: isAvailable ? colors.card : colors.muted, borderColor: colors.border }]}>
                                  <Text style={[styles.slotButtonText, { color: isAvailable ? colors.primary : colors.mutedForeground }]}>{slot}</Text>
                                </TouchableOpacity>
                              );
                            })}
                            {Array.from({ length: 3 - row.length }, (_, emptyIndex) => <View key={`${dayKey}-empty-${rowIndex}-${emptyIndex}`} style={[styles.slotButton, styles.slotButtonSpacing, { opacity: 0 }]} />)}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
          <TouchableOpacity testID="weekly-hours-toggle" onPress={() => setShowWeeklyHours((visible) => !visible)} style={[styles.weeklyHoursToggle, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.weeklyHoursIcon, { backgroundColor: colors.secondary }]}><Feather name="clock" size={18} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Weekly hours</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>Manage your regular schedule</Text></View><Feather name={showWeeklyHours ? 'chevron-up' : 'chevron-down'} size={19} color={colors.mutedForeground} /></TouchableOpacity>
          {showWeeklyHours && <View style={[styles.weeklyHoursPanel, { backgroundColor: colors.background }]}>
            <View style={styles.dayList}>
              {availability.map((day, index) => <View key={day.day} style={[styles.dayRow, { backgroundColor: colors.card, borderColor: colors.border, opacity: day.enabled ? 1 : 0.63 }]}><View style={[styles.dayCircle, { backgroundColor: day.enabled ? colors.secondary : colors.muted }]}><Text style={[styles.dayInitial, { color: day.enabled ? colors.primary : colors.mutedForeground }]}>{day.short}</Text></View><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{day.day}</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>{day.hours}</Text></View><Switch testID={`toggle-${day.day}`} value={day.enabled} onValueChange={(enabled) => setAvailability((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled, hours: enabled ? item.day === 'Sunday' ? '10:00 AM – 2:00 PM' : item.hours === 'Closed' ? '9:00 AM – 5:00 PM' : item.hours : 'Closed' } : item))} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.card} /></View>)}
            </View>
          </View>}
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 22 }]}>Time off</Text>
          <TouchableOpacity testID="block-time" onPress={() => setBlockedDates((current) => current.includes(availabilityDateKey(selectedDate)) ? current.filter((date) => date !== availabilityDateKey(selectedDate)) : [...current, availabilityDateKey(selectedDate)])} style={[styles.timeOffCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.timeOffIcon, { backgroundColor: colors.accent }]}><Feather name="calendar" size={19} color={colors.accentForeground} /></View><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{blockedDates.includes(availabilityDateKey(selectedDate)) ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'Block out this day'}</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>{blockedDates.includes(availabilityDateKey(selectedDate)) ? 'Unavailable all day · Tap to restore slots' : `Mark ${selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} unavailable`}</Text></View><Feather name={blockedDates.includes(availabilityDateKey(selectedDate)) ? 'x-circle' : 'plus'} size={20} color={colors.primary} /></TouchableOpacity>
          <Text style={[styles.previewNote, { color: colors.mutedForeground }]}>Availability changes are saved in this preview session only.</Text>
        </ScrollView>
      ) : params.screen === 'payments' ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity testID="payments-back" onPress={leaveAvailability} style={styles.backRow}><Feather name="arrow-left" size={19} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>More</Text></TouchableOpacity>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>GET PAID</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Payments</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>Your live Stripe Terminal connection.</Text>
          <View style={[styles.paymentCard, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.paymentMark, { backgroundColor: colors.secondary }]}><Feather name="credit-card" size={20} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Stripe Connect</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>{stripeReady ? 'Connected and ready for charges' : 'Needs payment setup'}</Text></View><View style={[styles.statusPill, { backgroundColor: stripeReady ? colors.secondary : colors.accent }]}><Text style={[styles.statusText, { color: stripeReady ? colors.primary : colors.accentForeground }]}>{stripeReady ? 'READY' : 'SETUP'}</Text></View></View>
          <View style={[styles.paymentInfo, { backgroundColor: colors.secondary }]}><Text style={[styles.itemTitle, { color: colors.foreground }]}>Stripe M2</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground, marginTop: 7 }]}>Bluetooth reader checkout is installed and connected through your Certxa account.</Text></View>
          <Text style={[styles.paymentDisclaimer, { color: colors.mutedForeground }]}>Payments and appointment updates are processed by Certxa.</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <HelpTitle help="more" style={styles.pageTitle}>More</HelpTitle>
            <TouchableOpacity testID="more-profile" onPress={() => router.push('/about-me')} accessibilityRole="button" accessibilityLabel="About you" style={styles.profileButton}>
              <MaterialCommunityIcons name="account" size={30} color={look.violet} />
            </TouchableOpacity>
          </View>
          {/* The three offers stacked in one place (owner, 2026-11-09): random order, a new one every 15 seconds. Each
              shows only while the account doesn't have it: Tap to Pay until Stripe is set up (2026-11-07), Business
              Phone until there's a number and Plus until it's bought (2026-11-04; checked each time More opens). */}
          <PromoCarousel promos={[
            ...(!stripeReady ? [{ key: 'tap', title: 'Accept Payments', pill: 'Tap to Pay', points: ['Powered by Stripe', 'Paid to your bank'] as [string, string], art: 'contactless-payment' as const,
              onPress: () => router.push('/payments-intro'), label: 'Accept payments with Tap to Pay, powered by Stripe' }] : []),
            ...(enrolled && !enrolled.phone ? [{ key: 'phone', title: 'Business Phone', pill: '$10/mo', points: ['Dedicated number', 'Unlimited calling'] as [string, string], art: 'phone-in-talk' as const,
              onPress: () => router.push('/phone'), label: 'Business Phone: a dedicated business number for your clients' }] : []),
            // Plus opens certxa.com/pro-plus, already signed in, to pay by card (owner, 2026-10-30; Apple allows this for a US app).
            ...(enrolled && !enrolled.plus ? [{ key: 'plus', title: 'Plus Plan', pill: '$5/mo', points: ['Unlimited SMS', 'Full App Access'] as [string, string], art: 'crown' as const,
              onPress: () => void openPlus(), busy: openingPlus, label: 'Plus Plan, $5 a month: unlimited SMS and full app access' }] : []),
          ]} />

          <SectionHeader title="Business" />
          <View style={styles.menuList}>
            <MenuCard testID="menu-money" icon={{ feather: 'dollar-sign' }} title="Money" subtitle="Sales, payouts and payments" onPress={() => router.push('/money')} />
            <MenuCard testID="menu-phone" icon={{ feather: 'phone' }} title="Business Phone" subtitle="Your business number for calls and texts" onPress={() => router.push('/phone')} />
          </View>

          <SectionHeader title="Client Growth" />
          <View style={styles.menuList}>
            <MenuCard testID="menu-waitlist" icon={{ mci: 'calendar-clock-outline' }} title="Waitlist" subtitle="Clients waiting for a time" onPress={() => router.push('/waitlist')} />
            <MenuCard testID="menu-campaigns" icon={{ mci: 'bullhorn-outline' }} title="Campaigns" subtitle="Text a special to clients" onPress={() => router.push('/campaigns')} />
            <MenuCard testID="menu-reviews" icon={{ feather: 'star' }} title="Reviews" subtitle="See what clients said and reply" onPress={() => router.push('/reviews')} />
            <MenuCard testID="menu-portfolio" icon={{ feather: 'image' }} title="Portfolio" subtitle="Photos of your work on your website" onPress={() => router.push('/portfolio')} />
          </View>

          <SectionHeader title="Account" />
          <View style={styles.menuList}>
            <MenuCard testID="menu-business-ai" icon={{ feather: 'message-square' }} title="Business AI" subtitle="AI chat; ask questions and get help" onPress={() => router.push('/ai')} />
            {/* Gift cards and packages share one row (owner, 2026-11-09); app/sell.tsx offers the two. */}
            <MenuCard testID="menu-gift-cards" icon={{ feather: 'gift' }} title="Gift Cards & Packages" subtitle="Sell gift cards and packages" onPress={() => router.push('/sell')} />
            {/* Not in the 2026-11-09 design, kept so the text credits can still be reached (app/credits.tsx). */}
            <MenuCard testID="menu-credits" icon={{ feather: 'message-circle' }} title="Credit balance" subtitle="Text message credits · buy more" onPress={() => router.push('/credits')} />
            <MenuCard testID="menu-settings" icon={{ feather: 'settings' }} title="Settings" subtitle="Account, preferences, billing" onPress={() => router.push('/settings')} />
          </View>
          <Text style={[styles.version, { color: colors.mutedForeground }]}>LIVE · {Constants.expoConfig?.version ?? ''}</Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 120 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  pageTitle: { fontSize: 40, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', color: look.heading },
  profileButton: { width: 52, height: 52, borderRadius: 16, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 13, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  caption: { fontSize: 16, fontFamily: 'Inter_400Regular', marginTop: 7, marginBottom: 22 },
  planBusy: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  planCard: { width: '100%', aspectRatio: 1200 / 594, borderRadius: 17, marginTop: 16, overflow: 'hidden' },
  planImage: { width: '100%', height: '100%' },
  profileCard: { borderWidth: 1, borderRadius: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 23, ...cardShadow },
  profileAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  profileName: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  menuList: { gap: 9 },
  menuRow: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 70, ...cardShadow },
  menuIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  itemSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 20 },
  preferenceRow: { borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11, ...cardShadow },
  certxaCard: { borderRadius: 19, padding: 18, marginTop: 22 },
  certxaBrand: { fontSize: 12, letterSpacing: 1.6, fontFamily: 'Inter_700Bold' },
  certxaTitle: { fontSize: 19, lineHeight: 26, fontFamily: 'Inter_600SemiBold', marginTop: 11, maxWidth: 260 },
  certxaSub: { fontSize: 14, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 7, opacity: 0.82 },
  version: { textAlign: 'center', fontSize: 12, letterSpacing: 1.3, fontFamily: 'Inter_600SemiBold', marginTop: 23 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 26 },
  backText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  availabilityNav: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative', marginBottom: 13 },
  availabilityBack: { flexDirection: 'row', alignItems: 'center', gap: 6, zIndex: 1, minWidth: 70 },
  availabilityNavTitle: { position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 13, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  availabilityMenu: { width: 32, height: 32, borderRadius: 6, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  availabilityMonthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 },
  availabilityMonth: { fontSize: 19, fontFamily: 'Inter_600SemiBold' },
  availabilityArrow: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  weekStrip: { borderWidth: 1, borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 7, paddingVertical: 10 },
  weekColumn: { flex: 1, alignItems: 'center', gap: 5 },
  weekdayLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  weekDate: { width: 31, height: 38, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 3 },
  weekDateText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  weekDot: { width: 3, height: 3, borderRadius: 2 },
  availabilityHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 12 },
  availabilityHintText: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  slotLegend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 6, height: 6, borderRadius: 3 },
  legendText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  scheduleDays: { gap: 14 },
  scheduleDay: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  scheduleDateColumn: { width: 34, alignItems: 'flex-start', paddingTop: 2 },
  scheduleDateNumber: { fontSize: 20, lineHeight: 25, fontFamily: 'Inter_600SemiBold' },
  scheduleWeekday: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 1 },
  scheduleSlots: { flex: 1 },
  scheduleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20, marginBottom: 7 },
  scheduleDateTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  slotCount: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  slotGrid: { gap: 7 },
  slotRow: { flexDirection: 'row', alignItems: 'center' },
  slotRowSpacing: { marginBottom: 7 },
  slotButton: { flex: 1, height: 36, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  slotButtonSpacing: { marginRight: 7 },
  slotButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  closedDay: { minHeight: 38, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 10 },
  closedDayText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  weeklyHoursToggle: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 58, marginTop: 19 },
  weeklyHoursIcon: { width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  weeklyHoursPanel: { marginTop: 9 },
  previewNote: { textAlign: 'center', fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 19, marginTop: 14 },
  availabilityIntro: { borderRadius: 16, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 5, marginBottom: 15 },
  clockIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dayList: { gap: 8 },
  dayRow: { borderWidth: 1, borderRadius: 15, minHeight: 66, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayCircle: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayInitial: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  timeOffCard: { borderWidth: 1, borderRadius: 15, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12 },
  timeOffIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  paymentCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5, ...cardShadow },
  paymentMark: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusPill: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  statusText: { fontSize: 12, letterSpacing: 0.8, fontFamily: 'Inter_700Bold' },
  paymentInfo: { borderRadius: 15, padding: 15, marginTop: 12 },
  primaryAction: { height: 50, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, marginTop: 18 },
  primaryActionText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  paymentDisclaimer: { textAlign: 'center', fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 20, marginTop: 14 },
});
