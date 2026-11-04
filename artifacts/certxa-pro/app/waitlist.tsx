/**
 * Waitlist (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): clients who want in on a day that's full. Each
 * entry: who, what, which day and roughly when. Tap one to book them, text them or take them off (/api/waitlist).
 * When a client cancels online on a day someone is waiting for, the pro gets a push (lib/publicCancel.ts).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { SelectField } from '@/components/SelectField';
import { businessToday } from '@/lib/businessTime';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

type Entry = { id: number; customerName: string; customerPhone: string | null; customerId: number | null; serviceId: number | null;
  preferredDate: string | null; preferredTimeStart: string | null; preferredTimeEnd: string | null; notes: string | null; status: string };
const WHEN = [
  { value: 'any', label: 'Any time', start: null, end: null },
  { value: 'morning', label: 'Morning', start: '08:00', end: '12:00' },
  { value: 'afternoon', label: 'Afternoon', start: '12:00', end: '17:00' },
  { value: 'evening', label: 'Evening', start: '17:00', end: '21:00' },
] as const;
const whenLabel = (e: Entry) => WHEN.find((w) => w.start === e.preferredTimeStart)?.label ?? 'Any time';
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function WaitlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clients, services, timeZone } = useBookingData();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [day, setDay] = useState(() => businessToday(timeZone));
  const [when, setWhen] = useState<(typeof WHEN)[number]['value']>('any');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setEntries((await api.get<Entry[]>('/api/waitlist')).filter((e) => e.status === 'waiting')); } catch { setEntries([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const serviceName = useMemo(() => new Map(services.map((s) => [s.id, s.name])), [services]);

  const save = async () => {
    const client = clients.find((c) => c.customerId === clientId);
    if (!client) { setError('Choose the client.'); return; }
    setSaving(true); setError('');
    try {
      const w = WHEN.find((x) => x.value === when)!;
      const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12);
      await api.post('/api/waitlist', { customerId: client.customerId, customerName: client.name, customerPhone: client.phone || null,
        serviceId, preferredDate: date.toISOString(), preferredTimeStart: w.start, preferredTimeEnd: w.end, notes: note.trim() || null });
      setAdding(false); setClientId(null); setServiceId(null); setNote(''); setWhen('any');
      await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'They could not be added.'); }
    finally { setSaving(false); }
  };
  const act = (e: Entry) => {
    const d = e.preferredDate ? new Date(e.preferredDate) : null;
    Alert.alert(e.customerName, [e.serviceId ? serviceName.get(e.serviceId) : null, d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null, whenLabel(e)].filter(Boolean).join(' · '), [
      { text: 'Book now', onPress: () => router.push({ pathname: '/booking', params: { phone: e.customerPhone ?? '', ...(e.serviceId ? { serviceIds: String(e.serviceId) } : {}), ...(d ? { day: dayKey(d) } : {}) } }) },
      ...(e.customerPhone ? [{ text: 'Text them', onPress: () => router.push({ pathname: '/messages', params: { phone: e.customerPhone!, name: e.customerName } }) }] : []),
      { text: 'Take off the waitlist', style: 'destructive' as const, onPress: () => { void api.del(`/api/waitlist/${e.id}`).then(load).catch(() => undefined); } },
      { text: 'Close', style: 'cancel' as const },
    ]);
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const box = { borderColor: colors.border, backgroundColor: colors.card };
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="waitlist">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => (adding ? setAdding(false) : router.back())} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="waitlist" style={[styles.navTitle, { color: colors.foreground }]}>{adding ? 'Add to waitlist' : 'Waitlist'}</HelpTitle>
        {!adding ? <TouchableOpacity onPress={() => setAdding(true)} style={[styles.navSide, { alignItems: 'flex-end' }]} accessibilityLabel="Add to waitlist" testID="waitlist-add"><Feather name="plus" size={24} color={colors.primary} /></TouchableOpacity> : <View style={styles.navSide} />}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={!adding ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} /> : undefined}>
        {adding ? (
          <>
            <SelectField testID="waitlist-client" title="Client" placeholder="Choose the client" value={clientId} onChange={setClientId}
              options={clients.map((c) => ({ value: c.customerId, label: c.name, hint: c.phone || undefined }))} />
            <SelectField testID="waitlist-service" title="Service" placeholder="Service (optional)" value={serviceId} onChange={setServiceId}
              options={services.map((s) => ({ value: s.id, label: s.name }))} />
            <View style={[styles.dayRow, box]}>
              <TouchableOpacity onPress={() => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; })} style={styles.arrow} accessibilityLabel="Previous day"><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
              <Text style={[styles.dayText, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
              <TouchableOpacity onPress={() => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; })} style={styles.arrow} accessibilityLabel="Next day"><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
            </View>
            <SelectField testID="waitlist-when" title="When" value={when} onChange={setWhen} options={WHEN.map((w) => ({ value: w.value, label: w.label }))} />
            <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={colors.mutedForeground} maxLength={200}
              style={[styles.input, box, { color: colors.foreground }]} testID="waitlist-note" />
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
            <TouchableOpacity onPress={() => void save()} disabled={saving || clientId == null} testID="waitlist-save"
              style={[styles.button, { backgroundColor: clientId == null ? colors.muted : colors.primary }]}>
              <Text style={[styles.buttonText, { color: clientId == null ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Add to waitlist'}</Text>
            </TouchableOpacity>
          </>
        ) : entries == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
          : entries.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>Nobody is waiting. Add a client who wants in on a full day; you'll hear when a booking that day is cancelled.</Text>
          : (
            <View style={[styles.list, box]}>
              {entries.map((e, i) => {
                const d = e.preferredDate ? new Date(e.preferredDate) : null;
                return (
                  <TouchableOpacity key={e.id} onPress={() => act(e)} testID={`waitlist-entry-${e.id}`} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{e.customerName}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {[e.serviceId ? serviceName.get(e.serviceId) : null, d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null, whenLabel(e)].filter(Boolean).join(' · ')}
                      </Text>
                      {e.notes ? <Text style={[styles.muted, { color: colors.mutedForeground }]} numberOfLines={1}>{e.notes}</Text> : null}
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 18, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12, paddingTop: 6 },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  dayRow: { borderWidth: 1, borderRadius: 14, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 14, height: 54, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
