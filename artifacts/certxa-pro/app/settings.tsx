/**
 * Settings (opened from More). Every screen here reads from and saves to Certxa — nothing is kept
 * only on the phone. The endpoints are the same ones the Certxa web app's settings pages use:
 *
 *   Business details, Location   GET /api/stores · PATCH /api/stores/:id
 *   Business hours               GET · PUT /api/business-hours
 *   Booking rules                GET · PUT /api/booking-policies, GET · PUT /api/calendar-settings
 *   Cancellation policy          GET · PUT /api/booking-policies
 *   Blocked clients              GET · POST · DELETE /api/booking-ban-list
 *   Client messages              GET · PUT /api/sms-settings/:storeId and /api/mail-settings/:storeId
 *   Stripe account               GET /api/payments/stripe/status
 *   Card readers                 GET /api/payments/terminal/reader/list · POST …/reader/register
 *   Sales tax                    GET · PATCH /api/pos-settings/:storeId
 *   Account                      POST /api/auth/forgot-password · DELETE /api/user/delete-account
 *                                (the password is checked first with POST /api/solo/login)
 */
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Linking, ScrollView, Share, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/live-api';
import { CERTXA_API_BASE_URL, certxaRequest, getStoredToken, login as checkPassword, registerTerminalReader } from '@/lib/certxa-api';

type Screen = 'menu' | 'business' | 'location' | 'hours' | 'rules' | 'policy' | 'blocked' | 'website' | 'messages' | 'stripe' | 'readers' | 'tax' | 'account';
type Store = { id: number; name?: string | null; phone?: string | null; email?: string | null; category?: string | null; address?: string | null; city?: string | null; state?: string | null; postcode?: string | null; bookingSlug?: string | null };
type Hours = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };
type FeatherName = ComponentProps<typeof Feather>['name'];

const BUSINESS_TYPES = ['Nail Salon', 'Hair Salon', 'Barbershop', 'Lash and Brows', 'Esthetician', 'Makeup', 'Massage', 'Wax', 'Tattoo and Piercing', 'Pet Grooming', 'Other'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TITLES: Record<Screen, string> = {
  menu: 'Settings', business: 'Business details', location: 'Location', hours: 'Business hours', rules: 'Booking rules', policy: 'Cancellation policy',
  blocked: 'Blocked clients', website: 'Website', messages: 'Client messages', stripe: 'Stripe account', readers: 'Card readers', tax: 'Sales tax', account: 'Account',
};

function errorText(cause: unknown, fallback: string) { return cause instanceof Error && cause.message ? cause.message : fallback; }
function minutesOf(time: string) { const [h, m] = time.split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function timeOf(minutes: number) { const m = Math.max(0, Math.min(23 * 60 + 30, minutes)); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function clock(time: string) { const m = minutesOf(time); const h = Math.floor(m / 60); return `${h % 12 === 0 ? 12 : h % 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; }
function formatPhone(raw: string) { const d = (raw ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw; }

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [screen, setScreen] = useState<Screen>('menu');
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // One draft object per screen: loaded from Certxa when the screen opens, sent back on Save.
  const [draft, setDraft] = useState<Record<string, any>>({});
  const set = (key: string, value: unknown) => { setNotice(''); setDraft((current) => ({ ...current, [key]: value })); };

  const loadStore = useCallback(async () => {
    const rows = await api.get<Store[]>('/api/stores');
    const first = Array.isArray(rows) ? rows[0] ?? null : null;
    setStore(first);
    return first;
  }, []);

  const open = useCallback(async (next: Screen) => {
    setScreen(next); setError(''); setNotice(''); setDraft({}); setLoading(true);
    try {
      const current = store ?? await loadStore();
      if (!current) throw new Error('No business was found for this account.');
      if (next === 'business') setDraft({ name: current.name ?? '', phone: current.phone ?? '', email: current.email ?? '', category: current.category ?? '' });
      else if (next === 'location') setDraft({ address: current.address ?? '', city: current.city ?? '', state: current.state ?? '', postcode: current.postcode ?? '' });
      else if (next === 'hours') {
        const rows = await api.get<Hours[]>('/api/business-hours');
        const byDay = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.dayOfWeek, row]));
        setDraft({ hours: DAYS.map((_, dayOfWeek) => { const row = byDay.get(dayOfWeek); return { dayOfWeek, openTime: (row?.openTime ?? '09:00').slice(0, 5), closeTime: (row?.closeTime ?? '17:00').slice(0, 5), isClosed: row ? !!row.isClosed : true }; }) });
      } else if (next === 'rules' || next === 'policy') {
        const [policies, calendar] = await Promise.all([api.get<Record<string, any>>('/api/booking-policies'), api.get<Record<string, any> | null>('/api/calendar-settings')]);
        setDraft({
          onlineBookingMode: policies.onlineBookingMode ?? 'all', advanceBookingEnabled: !!policies.advanceBookingEnabled, advanceBookingMonths: Number(policies.advanceBookingMonths ?? 3),
          allowOnlineCancellation: policies.allowOnlineCancellation !== false, cancellationHoursCutoff: Number(policies.cancellationHoursCutoff ?? 24),
          cancellationPolicyText: policies.cancellationPolicyText ?? '', cancellationPolicyRequired: !!policies.cancellationPolicyRequired,
          bookingWindowHours: Number(calendar?.bookingWindowHours ?? 0), timeSlotInterval: Number(calendar?.timeSlotInterval ?? 15), bufferMinutes: Number(calendar?.bufferMinutes ?? 0),
        });
      } else if (next === 'blocked') setDraft({ list: await api.get<any[]>('/api/booking-ban-list'), phone: '', reason: '' });
      else if (next === 'messages') {
        const [sms, mail] = await Promise.all([api.get<Record<string, any> | null>(`/api/sms-settings/${current.id}`), api.get<Record<string, any> | null>(`/api/mail-settings/${current.id}`)]);
        setDraft({
          smsConfirmation: !!sms?.bookingConfirmationEnabled, smsReminder: !!sms?.reminderEnabled, smsCancellation: !!sms?.smsCancellationEnabled, smsReview: !!sms?.reviewRequestEnabled,
          mailConfirmation: !!mail?.bookingConfirmationEnabled, mailReminder: !!mail?.reminderEnabled, mailReview: !!mail?.reviewRequestEnabled,
          reminderHoursBefore: Number(sms?.reminderHoursBefore ?? mail?.reminderHoursBefore ?? 24), googleReviewUrl: sms?.googleReviewUrl ?? mail?.googleReviewUrl ?? '',
        });
      } else if (next === 'stripe') setDraft({ status: await api.get<Record<string, any>>('/api/payments/stripe/status') });
      else if (next === 'readers') { const result = await api.get<{ readers?: any[] }>('/api/payments/terminal/reader/list'); setDraft({ readers: Array.isArray(result?.readers) ? result.readers : [], code: '' }); }
      else if (next === 'tax') { const tax = await api.get<Record<string, any>>(`/api/pos-settings/${current.id}`); setDraft({ percent: String(Number((Number(tax.salesTaxRate ?? 0) * 100).toFixed(3))), services: !!tax.taxServicesTaxable, products: tax.taxProductsTaxable !== false }); }
    } catch (cause) { setError(errorText(cause, 'Could not load this from Certxa.')); }
    finally { setLoading(false); }
  }, [loadStore, store]);

  useEffect(() => { void open('menu'); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Run a save: show progress, then "Saved" or the reason Certxa gave. */
  const run = async (work: () => Promise<void>, done = 'Saved to Certxa.') => {
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try { await work(); setNotice(done); }
    catch (cause) { setError(errorText(cause, 'Could not save. Check the connection and try again.')); }
    finally { setSaving(false); }
  };

  const save = () => {
    if (!store) return;
    if (screen === 'business') return run(async () => {
      if (!String(draft.name).trim()) throw new Error('Enter your business name.');
      setStore(await api.patch<Store>(`/api/stores/${store.id}`, { name: String(draft.name).trim(), phone: String(draft.phone).trim() || null, email: String(draft.email).trim() || null, category: draft.category || null }));
    });
    if (screen === 'location') return run(async () => {
      if (!String(draft.address).trim() || !String(draft.city).trim()) throw new Error('Enter the street address and city.');
      setStore(await api.patch<Store>(`/api/stores/${store.id}`, { address: String(draft.address).trim(), city: String(draft.city).trim(), state: String(draft.state).trim().toUpperCase(), postcode: String(draft.postcode).trim() }));
    });
    if (screen === 'hours') return run(async () => {
      const hours = draft.hours as Hours[];
      if (!hours.some((day) => !day.isClosed)) throw new Error('At least one day must be open.');
      const bad = hours.find((day) => !day.isClosed && minutesOf(day.closeTime) <= minutesOf(day.openTime));
      if (bad) throw new Error(`${DAYS[bad.dayOfWeek]}: closing time must be after opening time.`);
      await api.put('/api/business-hours', { storeId: store.id, hours });
    });
    if (screen === 'rules') return run(async () => {
      await api.put('/api/booking-policies', {
        onlineBookingMode: draft.onlineBookingMode, advanceBookingEnabled: draft.advanceBookingEnabled, advanceBookingMonths: draft.advanceBookingMonths,
        allowOnlineCancellation: draft.allowOnlineCancellation, cancellationHoursCutoff: draft.cancellationHoursCutoff,
      });
      await api.put('/api/calendar-settings', { bookingWindowHours: draft.bookingWindowHours, timeSlotInterval: draft.timeSlotInterval, bufferMinutes: draft.bufferMinutes });
    });
    if (screen === 'policy') return run(async () => {
      if (draft.cancellationPolicyRequired && !String(draft.cancellationPolicyText).trim()) throw new Error('Write the policy before requiring clients to accept it.');
      await api.put('/api/booking-policies', { cancellationPolicyText: draft.cancellationPolicyText, cancellationPolicyRequired: draft.cancellationPolicyRequired });
    });
    if (screen === 'messages') return run(async () => {
      const link = String(draft.googleReviewUrl).trim() || null;
      await api.put(`/api/sms-settings/${store.id}`, { bookingConfirmationEnabled: draft.smsConfirmation, reminderEnabled: draft.smsReminder, smsCancellationEnabled: draft.smsCancellation, reviewRequestEnabled: draft.smsReview, reminderHoursBefore: draft.reminderHoursBefore, googleReviewUrl: link });
      await api.put(`/api/mail-settings/${store.id}`, { bookingConfirmationEnabled: draft.mailConfirmation, reminderEnabled: draft.mailReminder, reviewRequestEnabled: draft.mailReview, reminderHoursBefore: draft.reminderHoursBefore, googleReviewUrl: link });
    });
    if (screen === 'tax') return run(async () => {
      const percent = Number(String(draft.percent).replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(percent) || percent < 0 || percent > 30) throw new Error('Enter a tax rate between 0 and 30 percent.');
      await api.patch(`/api/pos-settings/${store.id}`, { salesTaxRate: (percent / 100).toFixed(4), taxServicesTaxable: draft.services, taxProductsTaxable: draft.products });
    });
  };

  const blockPhone = () => run(async () => {
    await api.post('/api/booking-ban-list', { phone: draft.phone, reason: String(draft.reason).trim() || undefined });
    setDraft({ list: await api.get<any[]>('/api/booking-ban-list'), phone: '', reason: '' });
  }, 'Blocked from online booking.');
  const unblock = (id: number) => run(async () => {
    await api.del(`/api/booking-ban-list/${id}`);
    setDraft((current) => ({ ...current, list: (current.list as any[]).filter((row) => row.id !== id) }));
  }, 'Removed from the list.');
  const registerReader = () => run(async () => {
    const token = await getStoredToken();
    if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
    await registerTerminalReader(token, String(draft.code).trim(), 'Certxa Pro M2');
    const result = await api.get<{ readers?: any[] }>('/api/payments/terminal/reader/list');
    setDraft({ readers: Array.isArray(result?.readers) ? result.readers : [], code: '' });
  }, 'Reader registered.');
  const sendPasswordEmail = () => run(async () => {
    if (!user?.email) throw new Error('No e-mail address is on file for this account.');
    await certxaRequest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: user.email }) });
  }, `We e-mailed a link to ${user?.email ?? 'you'} to set a new password.`);
  const deleteAccount = () => {
    Alert.alert('Delete your account?', 'Your business, bookings, clients and website are permanently deleted. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run(async () => {
        const token = await getStoredToken();
        if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
        if (!user?.email) throw new Error('No e-mail address is on file for this account.');
        // Certxa's delete endpoint asks only for a phrase, so confirm it really is the owner first.
        try { await checkPassword(user.email, String(draft.password ?? '')); }
        catch { throw new Error('That password is not correct.'); }
        await certxaRequest('/api/user/delete-account', { method: 'DELETE', body: JSON.stringify({ confirmPhrase: 'DELETE MY ACCOUNT' }) }, token);
        await logout();
      }, 'Account deleted.') },
    ]);
  };

  // ── small building blocks ─────────────────────────────────────────────────
  const Row = ({ icon, title, hint, to }: { icon: FeatherName; title: string; hint: string; to: Screen }) => (
    <TouchableOpacity testID={`settings-${to}`} onPress={() => void open(to)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name={icon} size={16} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text numberOfLines={1} style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text></View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
  const Group = ({ title, children }: { title: string; children: ReactNode }) => (<View style={styles.group}><Text style={[styles.groupTitle, { color: colors.mutedForeground }]}>{title}</Text>{children}</View>);
  const Label = ({ children }: { children: ReactNode }) => <Text style={[styles.label, { color: colors.foreground }]}>{children}</Text>;
  const Help = ({ children }: { children: ReactNode }) => <Text style={[styles.help, { color: colors.mutedForeground }]}>{children}</Text>;
  const field = (key: string, placeholder: string, extra: Partial<ComponentProps<typeof TextInput>> = {}) => (
    <TextInput testID={`settings-field-${key}`} value={String(draft[key] ?? '')} onChangeText={(value) => set(key, value)} placeholder={placeholder} placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} {...extra} />
  );
  const toggle = (key: string, title: string, hint?: string) => (
    <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>{hint ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}</View>
      <Switch testID={`settings-toggle-${key}`} value={!!draft[key]} onValueChange={(value) => set(key, value)} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
  const choices = (key: string, options: { value: string | number | boolean; label: string }[]) => (
    <View style={styles.chips}>
      {options.map((option) => {
        const selected = draft[key] === option.value;
        return <TouchableOpacity key={String(option.value)} testID={`settings-choice-${key}-${option.value}`} onPress={() => set(key, option.value)} style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.card, borderColor: selected ? colors.primary : colors.border }]}><Text style={[styles.chipText, { color: selected ? colors.primaryForeground : colors.foreground }]}>{option.label}</Text></TouchableOpacity>;
      })}
    </View>
  );
  /** Offer the usual choices, plus whatever Certxa currently holds if it is not one of them. */
  const withCurrent = (key: string, values: number[], label: (value: number) => string) => {
    const all = values.includes(Number(draft[key])) ? values : [...values, Number(draft[key])].sort((a, b) => a - b);
    return choices(key, all.map((value) => ({ value, label: label(value) })));
  };
  const saveButton = (label = 'Save') => (
    <TouchableOpacity testID="settings-save" disabled={saving} onPress={() => void save()} style={[styles.save, { backgroundColor: saving ? colors.muted : colors.primary }]}><Text style={[styles.saveText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : label}</Text></TouchableOpacity>
  );
  const slug = store?.bookingSlug ?? '';
  const website = slug ? `https://${slug}.certxa.com` : '';
  const address = [store?.address, store?.city, store?.state].filter(Boolean).join(', ');

  const body = () => {
    if (screen === 'menu') return (
      <>
        <Group title="MY BUSINESS">
          <Row icon="briefcase" title="Business details" hint={store?.name || 'Name, type, phone, e-mail'} to="business" />
          <Row icon="map-pin" title="Location" hint={address || 'Your business address'} to="location" />
          <Row icon="clock" title="Business hours" hint="The days and times you are open" to="hours" />
        </Group>
        <Group title="ONLINE BOOKING">
          <Row icon="sliders" title="Booking rules" hint="Who can book, notice, start times, cancelling" to="rules" />
          <Row icon="file-text" title="Cancellation policy" hint="What clients agree to when they book" to="policy" />
          <Row icon="slash" title="Blocked clients" hint="Phone numbers that cannot book online" to="blocked" />
        </Group>
        <Group title="WEBSITE"><Row icon="globe" title="Website" hint={website.replace('https://', '') || 'Your booking website'} to="website" /></Group>
        <Group title="CLIENT MESSAGES"><Row icon="message-square" title="Reminders and alerts" hint="Texts and e-mails Certxa sends for you" to="messages" /></Group>
        <Group title="PAYMENTS">
          <Row icon="credit-card" title="Stripe account" hint="Where your card payments are paid out" to="stripe" />
          <Row icon="smartphone" title="Card readers" hint="Register and view Stripe M2 readers" to="readers" />
          <Row icon="percent" title="Sales tax" hint="Tax added at checkout" to="tax" />
        </Group>
        <Group title="ACCOUNT"><Row icon="user" title="Account" hint={user?.email ?? 'Password, sign out, delete account'} to="account" /></Group>
      </>
    );
    if (screen === 'business') return (<>
      <Label>Business name</Label>{field('name', 'Your business name', { autoCapitalize: 'words' })}
      <Label>Type of business</Label>{choices('category', (BUSINESS_TYPES.includes(draft.category) || !draft.category ? BUSINESS_TYPES : [draft.category, ...BUSINESS_TYPES]).map((value) => ({ value, label: value })))}
      <Label>Business phone</Label>{field('phone', '(555) 555-5555', { keyboardType: 'phone-pad' })}
      <Label>Business e-mail</Label>{field('email', 'you@example.com', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false })}
      <Help>Clients see these on your booking website and in the messages Certxa sends.</Help>{saveButton()}
    </>);
    if (screen === 'location') return (<>
      <Label>Street address</Label>{field('address', '123 Main Street', { autoCapitalize: 'words' })}
      <Label>City</Label>{field('city', 'City', { autoCapitalize: 'words' })}
      <View style={styles.pair}><View style={{ flex: 1 }}><Label>State</Label>{field('state', 'CO', { autoCapitalize: 'characters', maxLength: 2 })}</View><View style={{ flex: 1 }}><Label>ZIP code</Label>{field('postcode', '80000', { keyboardType: 'number-pad', maxLength: 5 })}</View></View>
      <Help>Certxa sets your time zone from this address.</Help>{saveButton()}
    </>);
    if (screen === 'hours') return (<>
      {(draft.hours as Hours[] | undefined ?? []).map((day, index) => {
        const change = (patch: Partial<Hours>) => set('hours', (draft.hours as Hours[]).map((row, n) => (n === index ? { ...row, ...patch } : row)));
        const stepper = (key: 'openTime' | 'closeTime') => (
          <View style={styles.stepper}>
            <TouchableOpacity testID={`hours-${day.dayOfWeek}-${key}-minus`} onPress={() => change({ [key]: timeOf(minutesOf(day[key]) - 30) })} style={[styles.stepButton, { borderColor: colors.border }]}><Feather name="minus" size={14} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.stepValue, { color: colors.foreground }]}>{clock(day[key])}</Text>
            <TouchableOpacity testID={`hours-${day.dayOfWeek}-${key}-plus`} onPress={() => change({ [key]: timeOf(minutesOf(day[key]) + 30) })} style={[styles.stepButton, { borderColor: colors.border }]}><Feather name="plus" size={14} color={colors.foreground} /></TouchableOpacity>
          </View>
        );
        return (
          <View key={day.dayOfWeek} style={[styles.dayCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dayHead}><Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{DAYS[day.dayOfWeek]}</Text><Text style={[styles.rowHint, { color: colors.mutedForeground, marginRight: 8, marginTop: 0 }]}>{day.isClosed ? 'Closed' : 'Open'}</Text><Switch testID={`hours-${day.dayOfWeek}-open`} value={!day.isClosed} onValueChange={(value) => change({ isClosed: !value })} trackColor={{ true: colors.primary, false: colors.border }} /></View>
            {day.isClosed ? null : <View style={styles.dayTimes}><View><Text style={[styles.rowHint, { color: colors.mutedForeground }]}>Opens</Text>{stepper('openTime')}</View><View><Text style={[styles.rowHint, { color: colors.mutedForeground }]}>Closes</Text>{stepper('closeTime')}</View></View>}
          </View>
        );
      })}
      <Help>Clients can only book online inside these hours.</Help>{saveButton()}
    </>);
    if (screen === 'rules') return (<>
      <Label>Who can book online</Label>{choices('onlineBookingMode', [{ value: 'all', label: 'Everyone' }, { value: 'existing', label: 'Existing clients' }, { value: 'off', label: 'Nobody' }])}
      <Label>Minimum notice</Label>{withCurrent('bookingWindowHours', [0, 1, 2, 3], (value) => (value === 0 ? 'None' : `${value} hr`))}
      <Help>How soon before an appointment a client can still book it.</Help>
      <Label>How far ahead</Label>{choices('advanceBookingEnabled', [{ value: false, label: 'No limit' }, { value: true, label: 'Limit it' }])}
      {draft.advanceBookingEnabled ? withCurrent('advanceBookingMonths', [1, 3, 6, 12], (value) => `${value} mo`) : null}
      <Label>Appointment start times</Label>{withCurrent('timeSlotInterval', [15, 30, 60], (value) => `Every ${value} min`)}
      <Label>Gap between appointments</Label>{withCurrent('bufferMinutes', [0, 5, 10, 15], (value) => (value === 0 ? 'None' : `${value} min`))}
      <Label>Cancelling online</Label>{toggle('allowOnlineCancellation', 'Clients can cancel online')}
      {draft.allowOnlineCancellation ? <>{withCurrent('cancellationHoursCutoff', [12, 24, 48], (value) => `${value} hr before`)}<Help>After this point the client has to contact you to cancel.</Help></> : null}
      {saveButton()}
    </>);
    if (screen === 'policy') return (<>
      <Label>Your cancellation policy</Label>
      {field('cancellationPolicyText', 'For example: Please give 24 hours notice to cancel or reschedule.', { multiline: true, style: [styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }] })}
      {toggle('cancellationPolicyRequired', 'Clients must accept it to book', 'They tick a box agreeing to the policy before booking online.')}
      {saveButton()}
    </>);
    if (screen === 'blocked') return (<>
      <Help>Blocked phone numbers cannot book online. You can still book them yourself.</Help>
      <Label>Block a phone number</Label>{field('phone', '10-digit phone number', { keyboardType: 'phone-pad' })}{field('reason', 'Reason (optional)')}
      <TouchableOpacity testID="settings-block" disabled={saving || String(draft.phone ?? '').replace(/\D/g, '').length < 10} onPress={() => void blockPhone()} style={[styles.save, { backgroundColor: String(draft.phone ?? '').replace(/\D/g, '').length < 10 ? colors.muted : colors.primary }]}><Text style={[styles.saveText, { color: String(draft.phone ?? '').replace(/\D/g, '').length < 10 ? colors.mutedForeground : colors.primaryForeground }]}>Block this number</Text></TouchableOpacity>
      <Label>Blocked</Label>
      {(draft.list as any[] | undefined ?? []).length === 0 ? <Help>Nobody is blocked.</Help> : (draft.list as any[]).map((row) => (
        <View key={row.id} style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{formatPhone(String(row.phoneE164 ?? ''))}</Text>{row.reason ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{row.reason}</Text> : null}</View><TouchableOpacity testID={`settings-unblock-${row.id}`} onPress={() => void unblock(row.id)}><Text style={[styles.link, { color: colors.destructive }]}>Remove</Text></TouchableOpacity></View>
      ))}
    </>);
    if (screen === 'website') return (<>
      <Label>Your website and booking address</Label>
      <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{website.replace('https://', '') || 'Not set up yet'}</Text></View>
      {website ? <>
        <TouchableOpacity testID="settings-share-site" onPress={() => void Share.share({ message: website })} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Share my booking link</Text></TouchableOpacity>
        <TouchableOpacity testID="settings-open-site" onPress={() => void Linking.openURL(website)} style={styles.linkButton}><Text style={[styles.link, { color: colors.primary }]}>Open my website</Text></TouchableOpacity>
      </> : null}
      <Help>Changing the name and choosing the photo at the top of your site are not available in the app yet.</Help>
    </>);
    if (screen === 'messages') return (<>
      <Label>Text messages</Label>
      {toggle('smsConfirmation', 'Booking confirmation')}{toggle('smsReminder', 'Appointment reminder')}{toggle('smsCancellation', 'Cancellation notice')}{toggle('smsReview', 'Review request', 'Sent after the appointment.')}
      <Label>E-mails</Label>
      {toggle('mailConfirmation', 'Booking confirmation')}{toggle('mailReminder', 'Appointment reminder')}{toggle('mailReview', 'Review request', 'Sent after the appointment.')}
      <Label>Send reminders</Label>{withCurrent('reminderHoursBefore', [2, 4, 12, 24, 48], (value) => `${value} hr before`)}
      <Label>Google review link</Label>{field('googleReviewUrl', 'https://g.page/r/…', { autoCapitalize: 'none', autoCorrect: false, keyboardType: 'url' })}
      <Help>Review requests send clients to this link. Leave it empty to use your Certxa page.</Help>{saveButton()}
    </>);
    if (screen === 'stripe') {
      const status = draft.status as Record<string, any> | undefined;
      const line = (title: string, value: string) => (<View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{title}</Text><Text style={[styles.rowHint, { color: colors.mutedForeground, marginTop: 0 }]}>{value}</Text></View>);
      return (<>
        {status?.connected ? <>
          {line('Account', String(status.displayName || status.email || 'Connected'))}
          {line('Card payments', status.chargesEnabled ? 'Ready' : 'Not ready yet')}
          {line('Payouts to your bank', status.payoutsEnabled ? 'Ready' : 'Not ready yet')}
          {status.chargesEnabled && status.payoutsEnabled ? null : <Help>Stripe still needs some details from you before it can pay you. Finish them at certxa.com under Payments.</Help>}
        </> : <>
          <Help>No Stripe account is connected, so card payments, Tap to Pay and the M2 reader are switched off.</Help>
          <TouchableOpacity testID="settings-connect-stripe" onPress={() => void Linking.openURL(`${CERTXA_API_BASE_URL}/setup/payments`)} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Connect Stripe on certxa.com</Text></TouchableOpacity>
        </>}
      </>);
    }
    if (screen === 'readers') return (<>
      <Label>Register a new Stripe M2</Label>{field('code', 'Registration code shown on the reader', { autoCapitalize: 'none', autoCorrect: false })}
      <TouchableOpacity testID="settings-register-reader" disabled={saving || !String(draft.code ?? '').trim()} onPress={() => void registerReader()} style={[styles.save, { backgroundColor: String(draft.code ?? '').trim() ? colors.primary : colors.muted }]}><Text style={[styles.saveText, { color: String(draft.code ?? '').trim() ? colors.primaryForeground : colors.mutedForeground }]}>{saving ? 'Registering…' : 'Register reader'}</Text></TouchableOpacity>
      <Label>Your readers</Label>
      {(draft.readers as any[] | undefined ?? []).length === 0 ? <Help>No readers are registered yet.</Help> : (draft.readers as any[]).map((reader, index) => (
        <View key={String(reader.id ?? index)} style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{String(reader.label || reader.deviceType || reader.device_type || 'Card reader')}</Text><Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{[reader.serialNumber ?? reader.serial_number, reader.status].filter(Boolean).join(' · ')}</Text></View></View>
      ))}
    </>);
    if (screen === 'tax') return (<>
      <Label>Sales tax rate (%)</Label>{field('percent', '0', { keyboardType: 'decimal-pad' })}
      {toggle('services', 'Charge tax on services')}{toggle('products', 'Charge tax on products')}
      <Help>Tax rules differ by place. Check with your tax adviser before changing this.</Help>{saveButton()}
    </>);
    return (<>
      <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.rowHint, { color: colors.mutedForeground, marginTop: 0 }]}>Signed in as</Text><Text style={[styles.rowTitle, { color: colors.foreground }]}>{user?.email ?? 'Your Certxa account'}</Text></View></View>
      <Label>Password</Label>
      <TouchableOpacity testID="settings-change-password" disabled={saving} onPress={() => void sendPasswordEmail()} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>E-mail me a link to change it</Text></TouchableOpacity>
      <Label>This phone</Label>
      <TouchableOpacity testID="settings-sign-out" onPress={() => void logout()} style={[styles.save, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.saveText, { color: colors.foreground }]}>Sign out</Text></TouchableOpacity>
      <Label>Delete my account</Label>
      <Help>Enter your password to confirm. Your business, bookings, clients and website are permanently deleted. This cannot be undone.</Help>
      {field('password', 'Your password', { secureTextEntry: true, autoCapitalize: 'none', autoCorrect: false })}
      <TouchableOpacity testID="settings-delete-account" disabled={saving || !String(draft.password ?? '')} onPress={deleteAccount} style={styles.linkButton}><Text style={[styles.link, { color: String(draft.password ?? '') ? colors.destructive : colors.mutedForeground }]}>Delete my account</Text></TouchableOpacity>
    </>);
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="settings-back" accessibilityLabel="Back" onPress={() => (screen === 'menu' ? router.back() : void open('menu'))} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{TITLES[screen]}</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : error && Object.keys(draft).length === 0 && screen !== 'menu' && screen !== 'website' && screen !== 'account' ? null : body()}
        {error ? <View style={[styles.banner, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={15} color={colors.accentForeground} /><Text style={[styles.bannerText, { color: colors.accentForeground }]}>{error}</Text></View> : null}
        {notice ? <View style={[styles.banner, { backgroundColor: colors.secondary }]}><Feather name="check" size={15} color={colors.primary} /><Text style={[styles.bannerText, { color: colors.primary }]}>{notice}</Text></View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  group: { marginBottom: 20, gap: 8 },
  groupTitle: { fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  row: { borderWidth: 1, borderRadius: 15, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  help: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 14, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  textArea: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 10 },
  toggleRow: { borderWidth: 1, borderRadius: 15, minHeight: 54, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  dayCard: { borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center' },
  dayTimes: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  stepButton: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 72, textAlign: 'center', fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  save: { minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  banner: { marginTop: 16, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
});
