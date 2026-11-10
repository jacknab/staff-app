/**
 * Settings (opened from More). Every screen here reads from and saves to Certxa — nothing is kept
 * only on the phone. The endpoints are the same ones the Certxa web app's settings pages use:
 *
 *   Business details, Location   GET /api/stores · PATCH /api/stores/:id
 *   Business hours               GET · PUT /api/business-hours
 *   Booking rules                GET · PUT /api/booking-policies, GET · PUT /api/calendar-settings
 *   Cancellation policy          GET · PUT /api/booking-policies
 *   Blocked clients              GET · POST · DELETE /api/booking-ban-list
 *   Client notifications         its own screen, app/notifications.tsx
 *   Business Phone               GET · PUT /api/pro/phone, GET · POST · DELETE /api/pro/phone/blocked,
 *                                POST /api/pro/phone/cancel · /resume · /pay ($10/month)
 *   Stripe account               GET /api/payments/stripe/status
 *   Card readers                 GET /api/payments/terminal/reader/list · POST …/reader/register
 *   Sales tax                    GET · PATCH /api/pos-settings/:storeId
 *   Account                      POST /api/auth/forgot-password · DELETE /api/user/delete-account
 *                                (the password is checked first with POST /api/solo/login)
 */
import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Linking, ScrollView, Share, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { BusinessHoursEditor } from '@/components/BusinessHoursEditor';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { timeZoneName, US_TIME_ZONES, validTimeZone } from '@/lib/businessTime';
import { api } from '@/lib/live-api';
import { CERTXA_API_BASE_URL, certxaRequest, getStoredToken, login as checkPassword, registerTerminalReader } from '@/lib/certxa-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { SectionHeader, SectionTitle } from '@/components/look/SectionHeader';
import { look, cardShadow } from '@/components/look/tokens';
type Screen = 'menu' | 'business' | 'location' | 'places' | 'hours' | 'rules' | 'approval' | 'policy' | 'blocked' | 'phone' | 'website' | 'stripe' | 'readers' | 'deposits' | 'tax' | 'account';
type Store = { id: number; name?: string | null; phone?: string | null; email?: string | null; category?: string | null; address?: string | null; city?: string | null; state?: string | null; postcode?: string | null; bookingSlug?: string | null; timezone?: string | null };
type Hours = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };
type FeatherName = ComponentProps<typeof Feather>['name'];

const BUSINESS_TYPES = ['Nail Salon', 'Hair Salon', 'Barbershop', 'Lash and Brows', 'Esthetician', 'Makeup', 'Massage', 'Wax', 'Tattoo and Piercing', 'Pet Grooming', 'Other'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TITLES: Record<Screen, string> = {
  menu: 'Settings', business: 'Business details', location: 'Location', places: 'Where you see clients', hours: 'Hours', rules: 'Online booking', policy: 'Cancellation policy',
  approval: 'Booking approval', blocked: 'Blocked clients', phone: 'Business Phone', website: 'Website', stripe: 'Stripe account', readers: 'Connect card reader', deposits: 'Deposits', tax: 'Checkout', account: 'Account',
};

function errorText(cause: unknown, fallback: string) { return cause instanceof Error && cause.message ? cause.message : fallback; }
function minutesOf(time: string) { const [h, m] = time.split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function formatPhone(raw: string) { const d = (raw ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw; }

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { setTimeZone, refresh: refreshCalendar, clients } = useBookingData();
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

  // Coming back from website setup (or anywhere else): load the business again, so a new link shows straight away.
  // Done in website setup brings the pro back to the Settings menu (?done=<time>).
  const { done } = useLocalSearchParams<{ done?: string }>();
  useFocusEffect(useCallback(() => { void loadStore().catch(() => undefined); }, [loadStore]));
  useEffect(() => { if (done) { setScreen('menu'); setError(''); setNotice(''); } }, [done]);

  const open = useCallback(async (next: Screen) => {
    setScreen(next); setError(''); setNotice(''); setDraft({}); setLoading(true);
    try {
      const current = store ?? await loadStore();
      if (!current) throw new Error('No business was found for this account.');
      if (next === 'business') setDraft({ name: current.name ?? '', phone: current.phone ?? '', email: current.email ?? '', category: current.category ?? '' });
      else if (next === 'location') setDraft({ address: current.address ?? '', city: current.city ?? '', state: current.state ?? '', postcode: current.postcode ?? '' });
      else if (next === 'places') {
        const places = await api.get<Record<string, any>>('/api/work-places');
        setDraft({ ...places, houseCallFee: String(places.houseCallFee ?? 0) });
      }
      else if (next === 'hours') {
        const rows = await api.get<Hours[]>('/api/business-hours');
        const byDay = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.dayOfWeek, row]));
        setDraft({ timezone: validTimeZone(current.timezone), hours: DAYS.map((_, dayOfWeek) => { const row = byDay.get(dayOfWeek); return { dayOfWeek, openTime: (row?.openTime ?? '09:00').slice(0, 5), closeTime: (row?.closeTime ?? '17:00').slice(0, 5), isClosed: row ? !!row.isClosed : true }; }) });
      } else if (next === 'deposits') {
        const [policies, status, places] = await Promise.all([
          api.get<Record<string, any>>('/api/booking-policies'),
          api.get<Record<string, any>>('/api/payments/stripe/status').catch(() => null),
          api.get<Record<string, any>>('/api/work-places').catch(() => null),
        ]);
        setDraft({
          policy: policies.bookingPaymentPolicy ?? 'none', depositType: policies.depositType === 'percentage' || policies.depositType === 'full' ? policies.depositType : 'fixed',
          depositValue: policies.depositValue != null ? String(Number(policies.depositValue)) : '',
          cardsReady: Boolean(status?.chargesEnabled), approval: places?.bookingApproval ?? 'auto',
          includeTravelFee: policies.depositIncludeTravelFee === true, houseCalls: places?.houseCalls === true,
        });
      } else if (next === 'approval') {
        const places = await api.get<Record<string, any>>('/api/work-places');
        setDraft({ eligible: places.eligible, bookingApproval: places.bookingApproval ?? 'auto', bookingRequestExpiryHours: Number(places.bookingRequestExpiryHours ?? 48), bookingOfferValidDays: Number(places.bookingOfferValidDays ?? 3) });
      } else if (next === 'rules' || next === 'policy') {
        const [policies, calendar] = await Promise.all([api.get<Record<string, any>>('/api/booking-policies'), api.get<Record<string, any> | null>('/api/calendar-settings')]);
        setDraft({
          onlineBookingMode: policies.onlineBookingMode ?? 'all', advanceBookingEnabled: !!policies.advanceBookingEnabled, advanceBookingMonths: Number(policies.advanceBookingMonths ?? 3),
          allowOnlineCancellation: policies.allowOnlineCancellation !== false, cancellationHoursCutoff: Number(policies.cancellationHoursCutoff ?? 24),
          cancellationPolicyText: policies.cancellationPolicyText ?? '', cancellationPolicyRequired: !!policies.cancellationPolicyRequired,
          feePercent: policies.cancellationFeeValue != null ? String(Number(policies.cancellationFeeValue)) : '',
          bookingWindowHours: Math.max(1, Number(calendar?.bookingWindowHours ?? 1) || 1), timeSlotInterval: Number(calendar?.timeSlotInterval ?? 15), bufferMinutes: Number(calendar?.bufferMinutes ?? 0), paddedMinutes: Number(calendar?.paddedMinutes ?? 0),
        });
      } else if (next === 'blocked') setDraft({ list: await api.get<any[]>('/api/booking-ban-list'), phone: '', reason: '' });
      else if (next === 'phone') {
        const [line, calling] = await Promise.all([
          api.get<{ phoneNumber: string; ring: string } | null>('/api/pro/phone'),
          api.get<{ mode: string | null; ring: string | null; plusNumber: string | null }>('/api/pro/phone/calling').catch(() => null),
        ]);
        // Plus calling without a number of its own (Certxa's shared Plus number) has the same calling rule and blocks.
        const plus = !line && calling?.mode === 'plus';
        setDraft({ line, plus, plusNumber: calling?.plusNumber ?? null, ring: line?.ring ?? calling?.ring ?? 'hours',
          list: line || plus ? await api.get<any[]>('/api/pro/phone/blocked') : [], clientId: null, phone: '', reason: '' });
      }
      else if (next === 'stripe') setDraft({ status: await api.get<Record<string, any>>('/api/payments/stripe/status') });
      else if (next === 'readers') { const result = await api.get<{ readers?: any[] }>('/api/payments/terminal/reader/list'); setDraft({ readers: Array.isArray(result?.readers) ? result.readers : [], code: '' }); }
      else if (next === 'account') {
        const overview = await api.get<{ user?: { phone?: string | null } }>('/api/manage/overview');
        setDraft({ mobile: overview?.user?.phone ?? '', mobileNow: overview?.user?.phone ?? '', code: '', codeSent: false });
      }
      else if (next === 'tax') {
        // Checkout (owner, 2026-11-09; after GlossGenius's Checkout settings): sales tax, and the tip options clients see.
        const [tax, tips] = await Promise.all([api.get<Record<string, any>>(`/api/pos-settings/${current.id}`), api.get<{ presets?: number[] }>('/api/tip-presets').catch(() => null)]);
        const presets = Array.isArray(tips?.presets) && tips!.presets.length ? tips!.presets : [18, 20, 25];
        setDraft({ percent: String(Number((Number(tax.salesTaxRate ?? 0) * 100).toFixed(3))), services: !!tax.taxServicesTaxable, products: tax.taxProductsTaxable !== false,
          tips: Array.from({ length: 4 }, (_, i) => (presets[i] != null ? String(presets[i]) : '')) });
      }
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
    if (screen === 'places') return run(async () => {
      if (draft.ownPlace === 'none' && !draft.houseCalls) throw new Error('Choose where you see clients: your own place, house calls, or both.');
      const fee = Number(String(draft.houseCallFee ?? '0').replace(/[^0-9.]/g, '') || 0);
      if (!Number.isFinite(fee) || fee > 500) throw new Error('Enter a travel fee from $0 to $500.');
      const saved = await api.put<Record<string, any>>('/api/work-places', {
        ownPlace: draft.ownPlace, addressPrivate: !!draft.addressPrivate, houseCalls: !!draft.houseCalls, houseCallRadiusMiles: Number(draft.houseCallRadiusMiles),
        houseCallFee: fee, houseCallTravelMinutes: Number(draft.houseCallTravelMinutes), houseCallAlarmMinutes: Number(draft.houseCallAlarmMinutes ?? 0), houseCallSetupMinutes: Number(draft.houseCallSetupMinutes ?? 15), houseCallPackupMinutes: Number(draft.houseCallPackupMinutes ?? 15),
      });
      setDraft({ ...saved, houseCallFee: String(saved.houseCallFee ?? 0) });
    });
    if (screen === 'location') return run(async () => {
      if (!String(draft.address).trim() || !String(draft.city).trim()) throw new Error('Enter the street address and city.');
      const updated = await api.patch<Store>(`/api/stores/${store.id}`, { address: String(draft.address).trim(), city: String(draft.city).trim(), state: String(draft.state).trim().toUpperCase(), postcode: String(draft.postcode).trim() });
      setStore(updated);
      // Certxa sets the time zone from the address.
      if (updated.timezone && updated.timezone !== store.timezone) { setTimeZone(validTimeZone(updated.timezone)); void refreshCalendar(); }
    });
    if (screen === 'hours') return run(async () => {
      const hours = draft.hours as Hours[];
      if (!hours.some((day) => !day.isClosed)) throw new Error('At least one day must be open.');
      const bad = hours.find((day) => !day.isClosed && minutesOf(day.closeTime) <= minutesOf(day.openTime));
      if (bad) throw new Error(`${DAYS[bad.dayOfWeek]}: closing time must be after opening time.`);
      await api.put('/api/business-hours', { storeId: store.id, hours });
      // The time zone the calendar, the booking page and client messages all use.
      if (draft.timezone && draft.timezone !== store.timezone) {
        const updated = await api.patch<Store>(`/api/stores/${store.id}`, { timezone: draft.timezone });
        setStore(updated);
        setTimeZone(validTimeZone(updated.timezone));
        void refreshCalendar();
      }
    });
    if (screen === 'deposits') return run(async () => {
      if (draft.policy === 'card_on_file' && !draft.cardsReady) throw new Error('Set up card payments first (Settings → Stripe account).');
      if (draft.policy !== 'deposit') {
        await api.put('/api/booking-policies', { bookingPaymentPolicy: draft.policy === 'card_on_file' ? 'card_on_file' : 'none' });
        return;
      }
      if (!draft.cardsReady) throw new Error('Set up card payments first (Settings → Stripe account).');
      const full = draft.depositType === 'full';
      const value = Number(String(draft.depositValue ?? '').replace(/[^0-9.]/g, ''));
      if (!full && (draft.depositType === 'percentage' ? !(value >= 1 && value <= 100) : !(value >= 1 && value <= 999))) {
        throw new Error(draft.depositType === 'percentage' ? 'Enter a percentage from 1 to 100.' : 'Enter an amount from $1 to $999.');
      }
      await api.put('/api/booking-policies', { bookingPaymentPolicy: 'deposit', depositType: draft.depositType, depositValue: full ? null : value, depositIncludeTravelFee: !!draft.includeTravelFee });
    });
    if (screen === 'approval') return run(async () => {
      const saved = await api.put<Record<string, any>>('/api/work-places', {
        bookingApproval: draft.bookingApproval, bookingRequestExpiryHours: Number(draft.bookingRequestExpiryHours), bookingOfferValidDays: Number(draft.bookingOfferValidDays),
      });
      setDraft({ eligible: saved.eligible, bookingApproval: saved.bookingApproval, bookingRequestExpiryHours: Number(saved.bookingRequestExpiryHours), bookingOfferValidDays: Number(saved.bookingOfferValidDays) });
    });
    if (screen === 'rules') return run(async () => {
      await api.put('/api/booking-policies', {
        onlineBookingMode: draft.onlineBookingMode, advanceBookingEnabled: draft.advanceBookingEnabled, advanceBookingMonths: draft.advanceBookingMonths,
        allowOnlineCancellation: draft.allowOnlineCancellation,
      });
      await api.put('/api/calendar-settings', { bookingWindowHours: draft.bookingWindowHours, timeSlotInterval: draft.timeSlotInterval, paddedMinutes: draft.paddedMinutes });
    });
    if (screen === 'policy') return run(async () => {
      if (draft.cancellationPolicyRequired && !String(draft.cancellationPolicyText).trim()) throw new Error('Write the policy before requiring clients to accept it.');
      // The no-show / late-cancel fee: a % of the booking, charged to the client's card on file only when the pro taps it.
      const fee = String(draft.feePercent ?? '').trim() === '' ? 0 : Number(String(draft.feePercent).replace(/[^0-9.]/g, ''));
      if (!(fee >= 0 && fee <= 100)) throw new Error('Enter a fee from 0 to 100 percent.');
      await api.put('/api/booking-policies', { cancellationPolicyText: draft.cancellationPolicyText, cancellationPolicyRequired: draft.cancellationPolicyRequired,
        cancellationHoursCutoff: draft.cancellationHoursCutoff,
        cancellationFeeType: fee > 0 ? 'percentage' : null, cancellationFeeValue: fee > 0 ? fee : null });
    });
    if (screen === 'tax') return run(async () => {
      const percent = Number(String(draft.percent).replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(percent) || percent < 0 || percent > 30) throw new Error('Enter a tax rate between 0 and 30 percent.');
      const tips = (draft.tips as string[] | undefined ?? []).map((t) => t.trim()).filter(Boolean).map(Number);
      if (tips.length === 0) throw new Error('Enter at least one tip option.');
      if (tips.some((t) => !Number.isInteger(t) || t < 1 || t > 100)) throw new Error('Tip options are whole percentages from 1 to 100.');
      await api.patch(`/api/pos-settings/${store.id}`, { salesTaxRate: (percent / 100).toFixed(4), taxServicesTaxable: draft.services, taxProductsTaxable: draft.products });
      const saved = await api.put<{ presets: number[] }>('/api/tip-presets', { presets: tips });
      setDraft((d) => ({ ...d, tips: Array.from({ length: 4 }, (_, i) => (saved.presets[i] != null ? String(saved.presets[i]) : '')) }));
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
  // Business Phone: when it rings, and numbers that can't call it (routes/businessPhone.ts).
  const setRing = (ring: string) => run(async () => {
    set('ring', ring);
    await api.put('/api/pro/phone', { ring });
  });
  // The $10/month: cancel (ends with the paid month), keep it, or pay after a failed payment.
  const phoneBilling = (path: 'cancel' | 'resume' | 'pay', done: string) => run(async () => {
    const line = await api.post<any>(`/api/pro/phone/${path}`, path === 'pay' ? { idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` } : {});
    setDraft((current) => ({ ...current, line }));
  }, done);
  const blockCaller = () => run(async () => {
    await api.post('/api/pro/phone/blocked', { phone: draft.phone, reason: String(draft.reason).trim() || undefined });
    setDraft((current) => ({ ...current, clientId: null, phone: '', reason: '' }));
    const list = await api.get<any[]>('/api/pro/phone/blocked');
    setDraft((current) => ({ ...current, list }));
  }, 'Blocked from calling.');
  const unblockCaller = (id: number) => run(async () => {
    await api.del(`/api/pro/phone/blocked/${id}`);
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
  // Mobile number (owner, 2026-11-03): a new number is proved by a texted code; one this account had before switches
  // back with no code; a number any other account ever had is refused (server: lib/proPhoneVerification.ts).
  const mobileDigits = String(draft.mobile ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const changeMobile = async () => {
    if (saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await api.post<{ changed?: boolean; phone?: string }>('/api/account/phone/send-code', { phone: mobileDigits });
      if (result?.changed) {
        setDraft((d) => ({ ...d, mobile: result.phone ?? mobileDigits, mobileNow: result.phone ?? mobileDigits, codeSent: false, code: '' }));
        setNotice('Mobile number changed.');
      } else {
        setDraft((d) => ({ ...d, codeSent: true, code: '' }));
      }
    } catch (cause) { setError(errorText(cause, 'Could not send the code. Check the connection and try again.')); }
    finally { setSaving(false); }
  };
  const confirmMobile = () => run(async () => {
    const result = await api.post<{ phone?: string }>('/api/account/phone/verify', { phone: mobileDigits, code: String(draft.code ?? '') });
    setDraft((d) => ({ ...d, mobile: result?.phone ?? mobileDigits, mobileNow: result?.phone ?? mobileDigits, codeSent: false, code: '' }));
  }, 'Mobile number changed.');
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
      <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name={icon} size={26} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text><Text numberOfLines={2} style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text></View>
      <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
  // Sections in the More design (owner, 2026-11-09): a violet bar and a title-case heading.
  const Group = ({ title, children }: { title: string; children: ReactNode }) => (<View style={styles.group}><SectionHeader title={title} />{children}</View>);
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
  // A dropdown, never a row of pill buttons (owner, 2026-11-03).
  const choices = (key: string, options: { value: string | number | boolean; label: string }[], onPick?: (value: string | number | boolean) => void) => (
    <SelectField testID={`settings-choice-${key}`} value={draft[key] as string | number | boolean | undefined} options={options}
      onChange={(value) => (onPick ? onPick(value) : set(key, value))} />
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

  const [openingBilling, setOpeningBilling] = useState(false);
  const openBilling = async () => {
    setOpeningBilling(true);
    try {
      const { url } = await api.post<{ url: string }>('/api/solo/billing/web-link');
      await WebBrowser.openBrowserAsync(url);
    } catch (cause) {
      Alert.alert('Billing', cause instanceof Error ? cause.message : 'Could not open the billing page. Please try again.');
    } finally {
      setOpeningBilling(false);
    }
  };

  const body = () => {
    if (screen === 'menu') return (
      <>
        <Group title="My Business">
          <Row icon="briefcase" title="Business details" hint={store?.name || 'Name, type, phone, e-mail'} to="business" />
          <Row icon="map-pin" title="Location" hint={address || 'Your business address'} to="location" />
          <Row icon="navigation" title="Where you see clients" hint="Your place, house calls, or both" to="places" />
          <Row icon="clock" title="Hours" hint="Business hours and your time zone" to="hours" />
          {/* Catalog moved here from More (owner, 2026-11-03). */}
          <TouchableOpacity testID="settings-catalog" onPress={() => router.push('/catalog')} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name="scissors" size={26} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Catalog</Text><Text numberOfLines={2} style={[styles.rowHint, { color: colors.mutedForeground }]}>Categories, services, add-ons, packages, products</Text></View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </Group>
        <Group title="Bookings">
          <Row icon="sliders" title="Online booking" hint="Who can book, notice, start times, how far ahead" to="rules" />
          <Row icon="check-square" title="Booking approval" hint="Accept bookings automatically, or review each one" to="approval" />
          <Row icon="file-text" title="Cancellation policy" hint="Your policy, cancellation notice and no-show fee" to="policy" />
          <Row icon="slash" title="Blocked clients" hint="Phone numbers that cannot book online" to="blocked" />
        </Group>
        <Group title="Website"><Row icon="globe" title="Website" hint={website.replace('https://', '') || 'Your booking website'} to="website" /></Group>
        <Group title="Client Messages">
          {/* Its own screen, like the website's Settings › Client Notifications (app/notifications.tsx). */}
          <TouchableOpacity testID="settings-notifications" onPress={() => router.push('/notifications')} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name="bell" size={26} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Client notifications</Text><Text numberOfLines={2} style={[styles.rowHint, { color: colors.mutedForeground }]}>Reminders, confirmations and review requests</Text></View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        </Group>
        <Group title="Business Phone"><Row icon="phone" title="Business Phone" hint="When your phone rings, and numbers you've blocked" to="phone" /></Group>
        <Group title="Payments">
          <Row icon="credit-card" title="Stripe account" hint="Where your card payments are paid out" to="stripe" />
          <TouchableOpacity testID="settings-tap-to-pay" onPress={() => router.push('/tap-to-pay')} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name="smartphone" size={26} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Enable Tap to Pay on iPhone</Text><Text numberOfLines={2} style={[styles.rowHint, { color: colors.mutedForeground }]}>Take cards with just this iPhone</Text></View>
            <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Row icon="radio" title="Connect card reader" hint="Register and view Stripe M2 readers" to="readers" />
          <Row icon="dollar-sign" title="Deposits" hint="Ask clients for a deposit when they book" to="deposits" />
          <Row icon="percent" title="Checkout" hint="Sales tax and the tip choices clients see" to="tax" />
        </Group>
        <Group title="Account">
          <Row icon="user" title="Account" hint={user?.email ?? 'Password, sign out, delete account'} to="account" />
          {/* The website's billing page, already signed in through a one-time link (owner, 2026-11-05). */}
          <TouchableOpacity testID="settings-billing" disabled={openingBilling} onPress={() => void openBilling()} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}><Feather name="file-text" size={26} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>Billing</Text><Text numberOfLines={2} style={[styles.rowHint, { color: colors.mutedForeground }]}>Your plan, payments and invoices on certxa.com</Text></View>
            {openingBilling ? <ActivityIndicator size="small" color={colors.mutedForeground} /> : <Feather name="external-link" size={18} color={colors.mutedForeground} />}
          </TouchableOpacity>
        </Group>
      </>
    );
    if (screen === 'business') return (<>
      <Label>Business name</Label>{field('name', 'Your business name', { autoCapitalize: 'words' })}
      <Label>Type of business</Label>{choices('category', (BUSINESS_TYPES.includes(draft.category) || !draft.category ? BUSINESS_TYPES : [draft.category, ...BUSINESS_TYPES]).map((value) => ({ value, label: value })))}
      <Label>Business phone</Label>{field('phone', '(555) 555-5555', { keyboardType: 'phone-pad' })}
      <Label>Business e-mail</Label>{field('email', 'you@example.com', { keyboardType: 'email-address', autoCapitalize: 'none', autoCorrect: false })}
      <Help>Clients see these on your booking website and in the messages Certxa sends.</Help>{saveButton()}
    </>);
    if (screen === 'places') return draft.eligible === false ? (
      <Help>Where you see clients is part of the Solo plan.</Help>
    ) : (<>
      <Label>Your place</Label>
      {/* Picking a place sets its usual privacy: a home studio starts private, a salon or suite public. */}
      {choices('ownPlace', [{ value: 'salon', label: 'Salon, suite or booth' }, { value: 'home', label: 'Home studio' }, { value: 'none', label: 'None' }],
        (value) => { set('ownPlace', value); set('addressPrivate', value === 'home'); })}
      {draft.ownPlace === 'none'
        ? <Help>You only see clients at their place, so your address is never shown to clients.</Help>
        : <>
          {toggle('addressPrivate', 'Keep my address private', 'Clients see your city only, and get the full address once they have booked.')}
          <Help>{draft.addressPrivate ? 'Your booking website, search listings and Autumn show your city only.' : 'Clients see your full address on your booking website.'}</Help>
        </>}
      {toggle('houseCalls', 'House calls', 'You go to your clients.')}
      {draft.houseCalls ? <>
        <Label>How far you travel</Label>
        {withCurrent('houseCallRadiusMiles', [5, 10, 15, 25, 40], (miles) => `${miles} miles`)}
        <Help>Driving miles from your business address. Clients further away can't book a house call online.</Help>
        <Label>Travel fee</Label>{field('houseCallFee', '0', { keyboardType: 'decimal-pad' })}
        <Help>Added to every house call. Leave it at 0 for no fee.</Help>
        <Label>Setup time</Label>
        {withCurrent('houseCallSetupMinutes', [0, 10, 15, 20, 30, 45], (minutes) => minutes ? `${minutes} min` : 'None')}
        <Help>Getting your things in and set up at the client's, so you can start on time.</Help>
        <Label>Pack-up time</Label>
        {withCurrent('houseCallPackupMinutes', [0, 10, 15, 20, 30, 45], (minutes) => minutes ? `${minutes} min` : 'None')}
        <Help>Packing up after each house call, before you drive to the next one.</Help>
        <Label>Backup drive time</Label>
        {withCurrent('houseCallTravelMinutes', [0, 10, 15, 30, 45], (minutes) => minutes ? `${minutes} min` : 'None')}
        <Help>Your drive between clients is worked out from their addresses. This is only used if a drive can't be worked out.</Help>
        <Label>House-call alarm</Label>
        {withCurrent('houseCallAlarmMinutes', [0, 30, 45, 60, 90, 120, 180], (minutes) => (!minutes ? 'Off' : minutes < 60 ? `${minutes} min before` : `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'} before`))}
        <Help>Your phone sounds this long before each house call. Allow time to load your car, drive there and set up, so you can start on time.</Help>
      </> : null}
      {saveButton()}
    </>);
    if (screen === 'location') return (<>
      <Label>Street address</Label>{field('address', '123 Main Street', { autoCapitalize: 'words' })}
      <Label>City</Label>{field('city', 'City', { autoCapitalize: 'words' })}
      <View style={styles.pair}><View style={{ flex: 1 }}><Label>State</Label>{field('state', 'CO', { autoCapitalize: 'characters', maxLength: 2 })}</View><View style={{ flex: 1 }}><Label>ZIP code</Label>{field('postcode', '80000', { keyboardType: 'number-pad', maxLength: 5 })}</View></View>
      <Help>Certxa sets your time zone from this address.</Help>{saveButton()}
    </>);
    if (screen === 'hours') return (<>
      <Label>Time zone</Label>
      {choices('timezone', [...US_TIME_ZONES, ...(US_TIME_ZONES.some((zone) => zone.value === draft.timezone) || !draft.timezone ? [] : [{ value: String(draft.timezone), label: timeZoneName(String(draft.timezone)) }])])}
      <Help>Your calendar, your booking page and the messages clients get all use this time zone.</Help>
      <Label>Business hours</Label>
      {/* The sign-up design (owner, 2026-11-03): a check box per day, tap a day for the time wheel. */}
      <BusinessHoursEditor hours={(draft.hours as Hours[] | undefined) ?? []} onChange={(next) => set('hours', next)} testPrefix="hours" />
      <Help>Your website shows these hours, and clients can book any time inside them.</Help>
      {saveButton()}
    </>);
    if (screen === 'deposits') return (<>
      <Label>Deposit when clients book online</Label>
      {choices('policy', [{ value: 'none', label: 'No deposit' }, { value: 'deposit', label: 'Ask for a deposit' }, { value: 'card_on_file', label: 'Save their card (no charge)' }])}
      {draft.policy === 'card_on_file' ? <Help>Clients add a card when they book or send a request online. A $1 hold checks the card and is released right away, so nothing is charged. You can charge a no-show or late-cancel fee to it (Settings › Cancellation policy).</Help> : null}
      {draft.policy === 'deposit' ? <>
        <Label>How much</Label>
        {choices('depositType', [{ value: 'full', label: 'The full price' }, { value: 'fixed', label: 'A set amount' }, { value: 'percentage', label: 'A percent of the price' }])}
        {draft.depositType !== 'full' ? field('depositValue', draft.depositType === 'percentage' ? 'Percent, e.g. 20' : 'Dollars, e.g. 25', { keyboardType: 'decimal-pad' }) : null}
        {draft.houseCalls ? toggle('includeTravelFee', 'Include the house-call travel fee', 'On: the fee is part of what the client pays when they book. Off: they pay it at the visit.') : null}
        <Help>{draft.approval === 'manual'
          ? 'You review each booking first, so the deposit is asked for after you approve: the client gets a text with a payment link and has 30 minutes to pay. The time is only confirmed once it is paid; if not, it is released and the client is told.'
          : 'Clients pay by card on your booking page as they book. If they leave without paying, the time is held for an hour and they get a text with a link to pay.'}</Help>
        <Help>{draft.depositType === 'full' ? 'Nothing is left to pay at the visit: tap Mark as done when you finish.' : 'The deposit comes off the price at checkout.'} Payments go to your Stripe account.</Help>
        {!draft.cardsReady ? <>
          <Help>Card payments aren't set up yet, so clients can't pay a deposit.</Help>
          <TouchableOpacity testID="settings-deposits-get-paid" onPress={() => router.push('/get-paid')} style={[styles.save, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.saveText, { color: colors.foreground }]}>Set up card payments</Text></TouchableOpacity>
        </> : null}
      </> : null}
      {saveButton()}
    </>);
    if (screen === 'approval') return draft.eligible === false ? (
      <Help>Booking approval is part of the Solo plan.</Help>
    ) : (<>
      <Label>New online bookings</Label>
      {choices('bookingApproval', [{ value: 'auto', label: 'Approve automatically' }, { value: 'manual', label: 'Review each one first' }])}
      <Help>{draft.bookingApproval === 'manual'
        ? 'Clients send a request. You approve it, offer other times, or decline it. The time is only booked once you approve.'
        : 'Every online booking goes straight into your calendar, no approval needed.'}</Help>
      {draft.bookingApproval === 'manual' ? <>
        <Label>Answer requests within</Label>
        {withCurrent('bookingRequestExpiryHours', [12, 24, 48, 72], (value) => (value % 24 === 0 ? `${value / 24} ${value === 24 ? 'day' : 'days'}` : `${value} hours`))}
        <Help>A request you haven't answered by then expires, and the client is told by text.</Help>
        <Label>Offered times stay open for</Label>
        {withCurrent('bookingOfferValidDays', [2, 3, 4, 5, 6, 7], (value) => `${value} ${value === 1 ? 'day' : 'days'}`)}
        <Help>When you offer a client other times, the link in their text works for this many days.</Help>
      </> : null}
      {saveButton()}
    </>);
    if (screen === 'rules') return (<>
      {/* Online booking (owner, 2026-11-09; organised after GlossGenius's Online Booking settings, in our own words):
          who can book, booking controls, how far ahead, cancelling. */}
      <SectionTitle style={styles.section}>Who can book</SectionTitle>
      {choices('onlineBookingMode', [{ value: 'all', label: 'All clients' }, { value: 'existing', label: 'Existing clients only' }, { value: 'off', label: 'Off' }])}
      <Help>{draft.onlineBookingMode === 'existing' ? 'Only clients already in your client list can book online. New clients still see your website, but are asked to contact you.'
        : draft.onlineBookingMode === 'off' ? 'Clients still see your website, but can\'t book online. You can still book them yourself.'
        : 'New and existing clients can book you online.'}</Help>

      <SectionTitle style={styles.section}>Booking controls</SectionTitle>
      {/* Owner, 2026-11-09: no "None" (a client could book a time that's already starting); 1 to 24 hours. */}
      <Label>Minimum notice</Label>{withCurrent('bookingWindowHours', Array.from({ length: 24 }, (_, i) => i + 1), (value) => `${value} ${value === 1 ? 'hour' : 'hours'}`)}
      <Help>How far ahead clients must book online. With 2 hours, a client booking at 1 PM can choose 3 PM or later. You can still book any time yourself.</Help>
      <Label>Booking increments</Label>{withCurrent('timeSlotInterval', [15, 30, 60], (value) => `Every ${value} min`)}
      <Help>The start times clients can pick online. Every 15 min offers 9:00, 9:15, 9:30 and so on; every 30 min offers 9:00, 9:30, 10:00.</Help>
      {/* Gap between appointments removed (owner, 2026-11-09): Padded time does that job for a solo pro. */}
      {/* Padded time (owner, 2026-11-09): extra time saved on the end of every booking, online and in the app. */}
      <Label>Padded time</Label>{withCurrent('paddedMinutes', [0, 15, 30, 45, 60], (value) => (value === 0 ? 'Off' : `${value} min`))}
      <Help>Extra time added to the end of every booking, so you can offer extras. The times clients see include it.</Help>

      <SectionTitle style={styles.section}>Advance booking</SectionTitle>
      {toggle('advanceBookingEnabled', 'Limit how far ahead clients can book', 'Clients can only book online up to the time you choose, counted from today.')}
      {draft.advanceBookingEnabled ? withCurrent('advanceBookingMonths', [1, 3, 6, 12], (value) => `Up to ${value} ${value === 1 ? 'month' : 'months'} ahead`) : null}

      <SectionTitle style={styles.section}>Cancelling</SectionTitle>
      {toggle('allowOnlineCancellation', 'Allow online cancellation', 'Clients can cancel their appointment online, up to your cancellation notice (Settings › Cancellation policy). After that, they have to contact you.')}
      {saveButton()}
    </>);
    if (screen === 'policy') return (<>
      <Label>Your cancellation policy</Label>
      {field('cancellationPolicyText', 'For example: I charge 30% of the visit for no-shows or cancellations within 24 hours of the appointment.', { multiline: true, style: [styles.input, styles.textArea, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }] })}
      <Help>Shown on the About tab of your website, and when clients book.</Help>
      {toggle('cancellationPolicyRequired', 'Clients must accept it to book', 'Clients tick a box saying they\'ve read your policy before they can book online.')}
      {/* Moved from Booking rules (owner, 2026-11-09): this one number decides online cancelling, the late-cancel fee
          and whether a deposit is refunded. */}
      <Label>Cancellation notice</Label>{withCurrent('cancellationHoursCutoff', [12, 24, 48], (value) => `${value} hours before`)}
      <Help>Cancelling later than this is a late cancellation: the late-cancel fee can apply and a deposit is kept. Clients can cancel online only before it.</Help>
      <Label>No-show and late-cancel fee</Label>
      {field('feePercent', 'Percent of the booking, e.g. 50 (empty = no fee)', { keyboardType: 'decimal-pad' })}
      <Help>Protects your time from no-shows. Most pros set 20–30% of the appointment price. It's charged to the client's card on file, only when you tap Charge fee on a no-show or cancelled booking. Ask for a card on file in Settings › Deposits.</Help>
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
    if (screen === 'phone') {
      const line = draft.line as { phoneNumber: string } | null;
      if (!line && !draft.plus) return (<>
        <Help>You don't have a business number yet. Choose one, and clients can call and text it.</Help>
        <TouchableOpacity testID="settings-phone-setup" onPress={() => router.push('/phone')} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Choose a number</Text></TouchableOpacity>
      </>);
      const digits = String(draft.phone ?? '').replace(/\D/g, '');
      const withPhone = clients.filter((c) => (c.phone ?? '').replace(/\D/g, '').length >= 10);
      return (<>
        {!line ? (<>
          <Label>Plus calling</Label>
          <Help>{`Your clients call and text you at ${formatPhone(String(draft.plusNumber ?? ''))}, Certxa's Plus number. You call them from their profile.`}</Help>
        </>) : null}
        {line ? (<>
        <Label>Your business number</Label>
        <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]} selectable>{formatPhone(line.phoneNumber)}</Text>
          <TouchableOpacity testID="settings-phone-change" onPress={() => Alert.alert('Change your business number?',
            `This can't be undone. By continuing, ${formatPhone(line.phoneNumber)} will be released back into the number pool and you won't be able to get it back. Changing your number costs $5.`,
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', style: 'destructive', onPress: () => router.push({ pathname: '/phone', params: { change: '1' } }) }])}>
            <Text style={[styles.link, { color: colors.primary }]}>Change number</Text>
          </TouchableOpacity>
        </View>
        {(() => {
          const b = (draft.line as any)?.billing as { status: string; paidUntil: string | null; cancelAtPeriodEnd: boolean; retryAt: string | null; heldUntil: string | null } | undefined;
          if (!b) return null;
          const on = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
          const text = b.status === 'free' ? 'No charge for this number.'
            : b.status === 'held' ? `Paused: the payment didn't go through, so calls and texts are stopped. Pay by ${on(b.heldUntil)} to keep this number; after that it is released.`
            : b.status === 'past_due' ? `The last payment didn't go through. We'll try again ${on(b.retryAt)}.`
            : b.cancelAtPeriodEnd ? `Cancelled. Your number works until ${on(b.paidUntil)}, then it is released.`
            : `$10/month · Renews ${on(b.paidUntil)}`;
          const button = (label: string, onPress: () => void, testID: string, danger = false) => (
            <TouchableOpacity testID={testID} disabled={saving} onPress={onPress} style={[styles.save, danger ? { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border } : { backgroundColor: colors.primary }]}>
              <Text style={[styles.saveText, { color: danger ? colors.destructive : colors.primaryForeground }]}>{label}</Text>
            </TouchableOpacity>
          );
          return (<>
            <Label>Plan</Label>
            <Help>{text}</Help>
            {b.status === 'held' || b.status === 'past_due' ? button('Pay $10 now', () => void phoneBilling('pay', 'Paid. Your Business Phone is on.'), 'settings-phone-pay') : null}
            {b.status !== 'free' && b.status !== 'held' && b.cancelAtPeriodEnd ? button('Keep my number', () => void phoneBilling('resume', 'Your Business Phone will keep going.'), 'settings-phone-resume') : null}
            {b.status !== 'free' && b.status !== 'held' && !b.cancelAtPeriodEnd ? button('Cancel Business Phone', () => Alert.alert('Cancel Business Phone?',
              `Your number keeps working until ${on(b.paidUntil)}. Then ${formatPhone(line.phoneNumber)} is released back into the number pool and you won't be able to get it back.`,
              [{ text: 'Keep it', style: 'cancel' }, { text: 'Cancel Business Phone', style: 'destructive', onPress: () => void phoneBilling('cancel', 'Cancelled. It ends with your paid month.') }]), 'settings-phone-cancel', true) : null}
          </>);
        })()}
        </>) : null}
        <Label>Calling rules</Label>
        <SelectField testID="settings-phone-ring" title="Ring my phone" value={String(draft.ring)} onChange={(value) => void setRing(value)}
          options={[{ value: 'hours', label: 'During business hours' }, { value: 'always', label: 'Any time' }]} />
        <Help>When your phone doesn't ring, or a call isn't answered in 25 seconds, the caller is told you can't take the call and it shows as a missed call.</Help>
        <Label>Block a client or number</Label>
        <Help>A blocked number hears a busy signal when it calls your business number. You aren't told about these calls.</Help>
        {withPhone.length ? <SelectField testID="settings-phone-block-client" title="Choose a client" placeholder="Choose a client" value={draft.clientId as number | null}
          onChange={(id) => { const c = withPhone.find((x) => x.customerId === id); setDraft((current) => ({ ...current, clientId: id, phone: c?.phone ?? '' })); }}
          options={withPhone.map((c) => ({ value: c.customerId, label: c.name, hint: formatPhone(c.phone ?? '') }))} /> : null}
        {field('phone', '10-digit phone number', { keyboardType: 'phone-pad', onChangeText: (value) => setDraft((current) => ({ ...current, phone: value, clientId: null })) })}
        {field('reason', 'Reason (optional)')}
        <TouchableOpacity testID="settings-phone-block" disabled={saving || digits.length < 10} onPress={() => void blockCaller()} style={[styles.save, { backgroundColor: digits.length < 10 ? colors.muted : colors.primary }]}><Text style={[styles.saveText, { color: digits.length < 10 ? colors.mutedForeground : colors.primaryForeground }]}>Block this number</Text></TouchableOpacity>
        <Label>Blocked from calling</Label>
        {(draft.list as any[] | undefined ?? []).length === 0 ? <Help>Nobody is blocked.</Help> : (draft.list as any[]).map((row) => (
          <View key={row.id} style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>{row.clientName ?? formatPhone(String(row.phoneE164 ?? ''))}</Text><Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{[row.clientName ? formatPhone(String(row.phoneE164 ?? '')) : null, row.reason].filter(Boolean).join(' · ') || ' '}</Text></View><TouchableOpacity testID={`settings-phone-unblock-${row.id}`} onPress={() => void unblockCaller(row.id)}><Text style={[styles.link, { color: colors.destructive }]}>Remove</Text></TouchableOpacity></View>
        ))}
      </>);
    }
    if (screen === 'website') return (<>
      {/* AI Website Builder (owner, 2026-11-09; app/website-designer.tsx): ideas first, the full site next. */}
      <TouchableOpacity testID="settings-ai-designer" onPress={() => router.push('/website-designer')} style={[styles.save, { backgroundColor: colors.primary, marginTop: 4 }]}>
        <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Design my website with AI</Text>
      </TouchableOpacity>
      <Help>Six ideas based on your business. Mark what you love, and the designer builds from that. Uses AI credits; every account starts with 200 free.</Help>
      <Label>Your website and booking address</Label>
      <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{website.replace('https://', '') || 'Not set up yet'}</Text></View>
      {website ? <>
        <TouchableOpacity testID="settings-share-site" onPress={() => void Share.share({ message: website })} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Share my booking link</Text></TouchableOpacity>
        <TouchableOpacity testID="settings-open-site" onPress={() => void Linking.openURL(website)} style={styles.linkButton}><Text style={[styles.link, { color: colors.primary }]}>Open my website</Text></TouchableOpacity>
      </> : null}
      <TouchableOpacity testID="settings-about" onPress={() => router.push('/about-me')} style={[styles.save, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.saveText, { color: colors.foreground }]}>About you</Text></TouchableOpacity>
      <TouchableOpacity testID="settings-edit-site" onPress={() => router.push('/website-setup')} style={[styles.save, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.saveText, { color: colors.foreground }]}>Edit my link, design and look</Text></TouchableOpacity>
    </>);
    if (screen === 'stripe') {
      const status = draft.status as Record<string, any> | undefined;
      const line = (title: string, value: string) => (<View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{title}</Text><Text style={[styles.rowHint, { color: colors.mutedForeground, marginTop: 0 }]}>{value}</Text></View>);
      return (<>
        {status?.connected ? <>
          {line('Account', String(status.displayName || status.email || 'Connected'))}
          {line('Card payments', status.chargesEnabled ? 'Ready' : 'Not ready yet')}
          {line('Payouts to your bank', status.payoutsEnabled ? 'Ready' : 'Not ready yet')}
          {status.chargesEnabled && status.payoutsEnabled ? null : <>
            <Help>Stripe still needs some details from you before it can pay you.</Help>
            <TouchableOpacity testID="settings-finish-stripe" onPress={() => router.push('/get-paid')} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Finish payment setup</Text></TouchableOpacity>
          </>}
        </> : <>
          <Help>No Stripe account is connected, so card payments, Tap to Pay and the M2 reader are switched off.</Help>
          <TouchableOpacity testID="settings-connect-stripe" onPress={() => router.push('/get-paid')} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Set up payments</Text></TouchableOpacity>
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
      <SectionTitle style={styles.section}>Sales tax</SectionTitle>
      <Help>Tax rules differ by place, so check with your tax adviser before changing these.</Help>
      <Label>Sales tax rate (%)</Label>{field('percent', '0', { keyboardType: 'decimal-pad' })}
      {toggle('services', 'Charge tax on services')}{toggle('products', 'Charge tax on products')}
      <SectionTitle style={styles.section}>Tips</SectionTitle>
      <Help>The tip choices clients see at checkout, as a percentage of the visit. They can still enter their own amount or choose no tip.</Help>
      {(draft.tips as string[] | undefined ?? []).map((value, i) => (
        <View key={i}>
          <Label>{`Tip ${i + 1} (%)`}</Label>
          <TextInput testID={`settings-tip-${i}`} value={value} onChangeText={(v) => set('tips', (draft.tips as string[]).map((t, j) => (j === i ? v.replace(/[^0-9]/g, '').slice(0, 3) : t)))}
            placeholder={i === 0 ? '20' : 'Optional'} placeholderTextColor={colors.mutedForeground} keyboardType="number-pad"
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
        </View>
      ))}
      {saveButton()}
    </>);
    return (<>
      <View style={[styles.toggleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.rowHint, { color: colors.mutedForeground, marginTop: 0 }]}>Signed in as</Text><Text style={[styles.rowTitle, { color: colors.foreground }]}>{user?.email ?? 'Your Certxa account'}</Text></View></View>
      <Label>Mobile number</Label>
      {field('mobile', 'Mobile number', { keyboardType: 'phone-pad', autoComplete: 'tel', editable: !draft.codeSent })}
      {draft.codeSent ? (<>
        <Help>Enter the 6-digit code we texted to this number.</Help>
        {field('code', '6-digit code', { keyboardType: 'number-pad', maxLength: 6, autoComplete: 'sms-otp', textContentType: 'oneTimeCode' })}
        <TouchableOpacity testID="settings-mobile-confirm" disabled={saving || String(draft.code ?? '').length !== 6} onPress={() => void confirmMobile()} style={[styles.save, { backgroundColor: String(draft.code ?? '').length === 6 ? colors.primary : colors.muted }]}><Text style={[styles.saveText, { color: String(draft.code ?? '').length === 6 ? colors.primaryForeground : colors.mutedForeground }]}>Confirm</Text></TouchableOpacity>
        <TouchableOpacity testID="settings-mobile-cancel" onPress={() => setDraft((d) => ({ ...d, mobile: d.mobileNow, codeSent: false, code: '' }))} style={styles.linkButton}><Text style={[styles.link, { color: colors.foreground }]}>Cancel</Text></TouchableOpacity>
      </>) : mobileDigits.length === 10 && mobileDigits !== String(draft.mobileNow ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') ? (
        <TouchableOpacity testID="settings-mobile-change" disabled={saving} onPress={() => void changeMobile()} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Change number</Text></TouchableOpacity>
      ) : null}
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
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="settings-back" accessibilityLabel="Back" onPress={() => (screen === 'menu' ? router.back() : void open('menu'))} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help={screen === 'menu' ? 'settings' : `settings.${screen}`} style={[styles.headerTitle, { color: colors.foreground }]}>{TITLES[screen]}</HelpTitle>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : error && Object.keys(draft).length === 0 && screen !== 'menu' && screen !== 'website' && screen !== 'account' ? null : body()}
        {error ? <View style={[styles.banner, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={17} color={colors.accentForeground} /><Text style={[styles.bannerText, { color: colors.accentForeground }]}>{error}</Text></View> : null}
        {notice ? <View style={[styles.banner, { backgroundColor: colors.secondary }]}><Feather name="check" size={17} color={colors.primary} /><Text style={[styles.bannerText, { color: colors.primary }]}>{notice}</Text></View> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  group: { marginBottom: 4, gap: 10 },
  section: { marginTop: 24, marginBottom: 4 },
  groupTitle: { fontSize: 13, letterSpacing: 1.2, fontFamily: 'Inter_700Bold', marginBottom: 2 },
  row: { borderWidth: 1, borderRadius: 18, minHeight: 74, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 14, ...cardShadow },
  rowIcon: { width: 54, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 3 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  help: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 8 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 17, fontFamily: 'Inter_400Regular', marginBottom: 8 },
  textArea: { minHeight: 120, paddingTop: 12, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 10 },
  toggleRow: { borderWidth: 1, borderRadius: 15, minHeight: 54, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  save: { minHeight: 49, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  saveText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  link: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  banner: { marginTop: 16, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium' },
});
