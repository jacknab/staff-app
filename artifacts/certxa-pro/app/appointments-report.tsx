/**
 * Appointments report (owner, 2026-11-17, from GlossGenius "view past or canceled appointments"): every booking in a
 * period, with a status filter, on screen; the same list as a CSV the owner can save or share (opened in the browser,
 * which offers Share / Save to Files) or have e-mailed. Server: GET/POST /api/pro/reports/appointments(/link|/email).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { businessToday } from '@/lib/businessTime';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Period = 'today' | 'week' | 'lastweek' | 'month' | 'lastmonth' | 'last30' | 'year' | 'custom';
type Status = 'all' | 'booked' | 'completed' | 'paid' | 'cancelled' | 'no_show';
type Row = { id: number; day: string; time: string; client: string; service: string; addons: string; status: string; price: number | null; paid: number | null };

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' }, { value: 'week', label: 'This week' }, { value: 'lastweek', label: 'Last week' },
  { value: 'month', label: 'This month' }, { value: 'lastmonth', label: 'Last month' }, { value: 'last30', label: 'Last 30 days' },
  { value: 'year', label: 'This year' }, { value: 'custom', label: 'Custom dates' },
];
const STATUSES: { value: Status; label: string }[] = [
  { value: 'all', label: 'All appointments' }, { value: 'booked', label: 'Booked' }, { value: 'completed', label: 'Completed (not paid)' },
  { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'no_show', label: 'No-shows' },
];
const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(new Date(`${s}T12:00:00`).getTime());
const money = (n: number | null) => (n == null ? '' : `$${n.toFixed(2)}`);

/** The period's first and last business day (a week starts on Monday, as on Money). */
function periodRange(period: Period, tz: string): { from: string; to: string } {
  const today = businessToday(tz);
  const d = (y: number, m: number, day: number) => dateKey(new Date(y, m, day));
  const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  if (period === 'week') return { from: dateKey(monday), to: dateKey(today) };
  if (period === 'lastweek') { const s = new Date(monday); s.setDate(s.getDate() - 7); const e = new Date(monday); e.setDate(e.getDate() - 1); return { from: dateKey(s), to: dateKey(e) }; }
  if (period === 'month') return { from: d(today.getFullYear(), today.getMonth(), 1), to: dateKey(today) };
  if (period === 'lastmonth') return { from: d(today.getFullYear(), today.getMonth() - 1, 1), to: d(today.getFullYear(), today.getMonth(), 0) };
  if (period === 'last30') { const s = new Date(today); s.setDate(s.getDate() - 29); return { from: dateKey(s), to: dateKey(today) }; }
  if (period === 'year') return { from: d(today.getFullYear(), 0, 1), to: dateKey(today) };
  return { from: dateKey(today), to: dateKey(today) };
}

export default function AppointmentsReportScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { timeZone } = useBookingData();
  const [period, setPeriod] = useState<Period>('month');
  const [status, setStatus] = useState<Status>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<null | 'email' | 'share'>(null);

  const range = period === 'custom' ? { from: customFrom.trim(), to: customTo.trim() } : periodRange(period, timeZone);
  const rangeOk = isDay(range.from) && isDay(range.to) && range.from <= range.to;

  const load = useCallback(async () => {
    if (!rangeOk) { setRows(null); return; }
    setError('');
    try {
      const r = await api.get<{ rows: Row[] }>(`/api/pro/reports/appointments?from=${range.from}&to=${range.to}&status=${status}`);
      setRows(Array.isArray(r?.rows) ? r.rows : []);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The report could not be loaded.');
    }
  }, [range.from, range.to, rangeOk, status]);
  useEffect(() => { void load(); }, [load]);

  const email = async () => {
    setBusy('email'); setError('');
    try {
      const r = await api.post<{ to: string; count: number }>('/api/pro/reports/appointments/email', { ...range, status });
      Alert.alert('Report sent', `${r.count} appointment${r.count === 1 ? '' : 's'} sent to ${r.to} as a CSV file.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The report could not be e-mailed.');
    } finally { setBusy(null); }
  };
  const share = async () => {
    setBusy('share'); setError('');
    try {
      // A link that lasts 10 minutes: the browser opens the CSV with Share and Save to Files.
      const r = await api.post<{ url: string }>('/api/pro/reports/appointments/link', { ...range, status });
      await WebBrowser.openBrowserAsync(r.url);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The report could not be opened.');
    } finally { setBusy(null); }
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="appointments-report-screen">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back" testID="report-back">
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <HelpTitle help="appointmentsReport" style={[styles.navTitle, { color: colors.foreground }]}>Appointments report</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SelectField testID="report-period" title="Period" value={period} options={PERIODS} onChange={setPeriod} />
        {period === 'custom' ? (
          <View style={styles.customRow}>
            <TextInput testID="report-from" value={customFrom} onChangeText={setCustomFrom} placeholder="From YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
              autoCorrect={false} keyboardType="numbers-and-punctuation" style={[styles.input, card, { color: colors.foreground }]} />
            <TextInput testID="report-to" value={customTo} onChangeText={setCustomTo} placeholder="To YYYY-MM-DD" placeholderTextColor={colors.mutedForeground}
              autoCorrect={false} keyboardType="numbers-and-punctuation" style={[styles.input, card, { color: colors.foreground }]} />
          </View>
        ) : null}
        <View style={{ height: 10 }} />
        <SelectField testID="report-status" title="Show" value={status} options={STATUSES} onChange={setStatus} />

        <View style={styles.actions}>
          <TouchableOpacity testID="report-share" disabled={!rangeOk || !!busy} onPress={() => void share()} style={[styles.action, { backgroundColor: rangeOk ? colors.primary : colors.muted }]}>
            <Feather name="share" size={18} color={rangeOk ? colors.primaryForeground : colors.mutedForeground} />
            <Text style={[styles.actionText, { color: rangeOk ? colors.primaryForeground : colors.mutedForeground }]}>{busy === 'share' ? 'Opening…' : 'Save or share CSV'}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="report-email" disabled={!rangeOk || !!busy} onPress={() => void email()} style={[styles.action, card, { borderWidth: 1 }]}>
            <Feather name="mail" size={18} color={colors.foreground} />
            <Text style={[styles.actionText, { color: colors.foreground }]}>{busy === 'email' ? 'Sending…' : 'E-mail CSV'}</Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={[styles.muted, { color: colors.destructive, marginTop: 12 }]}>{error}</Text> : null}
        {!rangeOk ? <Text style={[styles.muted, { color: colors.mutedForeground, marginTop: 16 }]}>Type both dates as YYYY-MM-DD, the first one not after the second.</Text>
          : rows == null ? <ActivityIndicator style={{ marginTop: 30 }} color={colors.mutedForeground} />
          : (
            <>
              <Text style={[styles.count, { color: colors.mutedForeground }]}>{`${rows.length} appointment${rows.length === 1 ? '' : 's'}`}</Text>
              {rows.length ? (
                <View style={[styles.list, card]} testID="report-rows">
                  {rows.map((r, i) => (
                    <TouchableOpacity key={r.id} testID={`report-row-${r.id}`} onPress={() => router.push(`/appointment/${r.id}`)}
                      style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{r.client}</Text>
                        <Text style={[styles.rowSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {`${new Date(`${r.day}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${r.time} · ${r.service}${r.addons ? ` + ${r.addons}` : ''}`}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.rowStatus, { color: colors.foreground }]}>{r.status}</Text>
                        <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{money(r.paid ?? r.price)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : <Text style={[styles.muted, { color: colors.mutedForeground, marginTop: 8 }]}>No appointments in this period.</Text>}
            </>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 22, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 6 },
  customRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  input: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, fontFamily: 'Inter_400Regular' },
  actions: { gap: 10, marginTop: 16 },
  action: { height: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  count: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 20, marginBottom: 10 },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  rowSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  rowStatus: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  muted: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
});
