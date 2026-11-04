/**
 * Block time (owner, 2026-11-03): personal time or a day off on the pro's own calendar. Clients can't book inside it
 * online (POST /api/time-blocks; the server leaves blocked time out of open times). Opened from the calendar's +.
 * A block is removed by tapping it on the calendar.
 */
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { businessToday, zonedMoment } from '@/lib/businessTime';
import { api, ApiError } from '@/lib/live-api';
import { clockLabel, TimeWheel } from '@/components/TimeWheel';
import { HelpTitle } from '@/components/HelpTitle';

function dateFromKey(key?: string) {
  if (!key) return null;
  const [year, month, day] = key.split('-').map(Number);
  return year && month !== undefined && day ? new Date(year, month, day) : null;
}
const minutesOf = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export default function BlockTimeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { day: dayKey } = useLocalSearchParams<{ day?: string }>();
  const { timeZone, refresh } = useBookingData();
  const [day, setDay] = useState(() => dateFromKey(dayKey) ?? businessToday(timeZone));
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('13:00');
  const [editing, setEditing] = useState<'start' | 'end' | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const shiftDay = (n: number) => setDay((d) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const save = async () => {
    if (!allDay && minutesOf(end) <= minutesOf(start)) { setError('The end time has to be after the start time.'); return; }
    setSaving(true); setError('');
    try {
      const startsAt = zonedMoment(day, allDay ? 0 : minutesOf(start), timeZone);
      const next = new Date(day); next.setDate(next.getDate() + 1);
      const endsAt = allDay ? zonedMoment(next, 0, timeZone) : zonedMoment(day, minutesOf(end), timeZone);
      await api.post('/api/time-blocks', { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), allDay, ...(note.trim() ? { note: note.trim() } : {}) });
      await refresh();
      router.back();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The time could not be blocked.');
    } finally { setSaving(false); }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const row = { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="block-time">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="block-time" style={[styles.navTitle, { color: colors.foreground }]}>Block time</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>Clients can't book this time online. It shows on your calendar.</Text>
        <View style={[styles.dateCard, row]}>
          <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.arrow} accessibilityLabel="Previous day"><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.dateText, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</Text>
          <TouchableOpacity onPress={() => shiftDay(1)} style={styles.arrow} accessibilityLabel="Next day"><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
        </View>
        <View style={[styles.row, row]}>
          <Text style={[styles.rowText, { color: colors.foreground }]}>All day</Text>
          <Switch value={allDay} onValueChange={(v) => { setAllDay(v); setEditing(null); }} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" testID="block-all-day" />
        </View>
        {!allDay ? (
          <>
            {(['start', 'end'] as const).map((key) => (
              <View key={key}>
                <TouchableOpacity onPress={() => setEditing(editing === key ? null : key)} style={[styles.row, row]} testID={`block-${key}`}>
                  <Text style={[styles.rowText, { color: colors.foreground }]}>{key === 'start' ? 'Starts' : 'Ends'}</Text>
                  <Text style={[styles.rowValue, { color: editing === key ? colors.primary : colors.foreground }]}>{clockLabel(key === 'start' ? start : end)}</Text>
                </TouchableOpacity>
                {editing === key ? (
                  <TimeWheel value={key === 'start' ? start : end} onChange={(v) => { setError(''); (key === 'start' ? setStart : setEnd)(v); }}
                    color={colors.foreground} mutedColor={colors.mutedForeground} bandColor={colors.muted} />
                ) : null}
              </View>
            ))}
          </>
        ) : null}
        <TextInput value={note} onChangeText={setNote} placeholder="Note (optional), e.g. Lunch" placeholderTextColor={colors.mutedForeground} maxLength={120}
          style={[styles.input, row, { color: colors.foreground }]} testID="block-note" />
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <TouchableOpacity onPress={() => void save()} disabled={saving} style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]} testID="block-save">
          <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Block time'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12 },
  hint: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  dateCard: { borderWidth: 1, borderRadius: 14, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dateText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  row: { borderWidth: 1, borderRadius: 14, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  rowText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  rowValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 14, height: 56, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  button: { height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
