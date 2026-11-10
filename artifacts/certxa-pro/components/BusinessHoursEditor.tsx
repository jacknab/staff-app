/**
 * Business hours, the sign-up design (owner, 2026-11-03), used by the sign-up step and Settings › Business hours:
 * Monday first, a check box per day to open or close it, and a tap on the day opens a sheet with Start and Ends on a
 * time wheel. Days are stored by day of week (0 = Sunday), as /api/business-hours keeps them.
 */
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { clockLabel, TimeWheel } from '@/components/TimeWheel';

export type DayHours = { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean };
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const minutesOf = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** The week. `hours` holds one row per day of week, in any order. */
export function BusinessHoursEditor({ hours, onChange, testPrefix = 'signup' }: {
  hours: DayHours[]; onChange: (next: DayHours[]) => void; testPrefix?: string;
}) {
  const colors = useColors();
  const [editDay, setEditDay] = useState<number | null>(null);
  const dayOf = (dow: number) => hours.find((d) => d.dayOfWeek === dow);
  const update = (dow: number, patch: Partial<DayHours>) => onChange(hours.map((d) => (d.dayOfWeek === dow ? { ...d, ...patch } : d)));
  const editing = editDay != null ? dayOf(editDay) : undefined;
  return (
    <>
      {WEEK_ORDER.map((dow) => {
        const day = dayOf(dow);
        if (!day) return null;
        return (
          <View key={dow} style={styles.dayRow}>
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: !day.isClosed }} accessibilityLabel={`Open on ${DAY_NAMES[dow]}`}
              onPress={() => update(dow, { isClosed: !day.isClosed })} style={[styles.dayCheck, { backgroundColor: day.isClosed ? colors.card : colors.foreground, borderColor: day.isClosed ? colors.border : colors.foreground }]} testID={`${testPrefix}-day-${dow}`}>
              {!day.isClosed ? <Feather name="check" size={20} color={colors.background} /> : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditDay(dow)} style={styles.dayBody} testID={`${testPrefix}-day-edit-${dow}`}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.dayName, { color: colors.foreground }]}>{DAY_NAMES[dow]}</Text>
                <Text style={[styles.dayTimes, { color: colors.mutedForeground }]}>{day.isClosed ? 'Closed' : `${clockLabel(day.openTime)} - ${clockLabel(day.closeTime)}`}</Text>
              </View>
              <Feather name="chevron-right" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>
        );
      })}
      {editDay != null && editing ? (
        <HoursSheet day={editing} name={DAY_NAMES[editDay]!} onClose={() => setEditDay(null)}
          onSave={(openTime, closeTime) => { update(editDay, { openTime, closeTime, isClosed: false }); setEditDay(null); }} />
      ) : null}
    </>
  );
}

/** One day's hours: Start and Ends, each on a time wheel (owner, 2026-11-03). Saving also opens a closed day. */
function HoursSheet({ day, name, onClose, onSave }: {
  day: DayHours; name: string; onClose: () => void; onSave: (openTime: string, closeTime: string) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [which, setWhich] = useState<'start' | 'end'>('start');
  const [openTime, setOpenTime] = useState(day.openTime);
  const [closeTime, setCloseTime] = useState(day.closeTime);
  const [error, setError] = useState('');
  const save = () => {
    if (minutesOf(closeTime) <= minutesOf(openTime)) { setError('The end time has to be after the start time.'); setWhich('end'); return; }
    onSave(openTime, closeTime);
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* The backdrop is a sibling behind the sheet, not a wrapper around it: a touchable around the sheet took the
          touches from the time wheels, so they couldn't be turned on iPhone (found 2026-11-04). */}
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 18 }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{name}</Text>
          <View style={[styles.segment, { backgroundColor: colors.muted }]}>
            {(['start', 'end'] as const).map((key) => (
              <TouchableOpacity key={key} onPress={() => { setWhich(key); setError(''); }} testID={`hours-${key}`}
                style={[styles.segmentItem, which === key ? { backgroundColor: colors.background, borderColor: colors.foreground } : null]}>
                <Text style={[styles.segmentText, { color: which === key ? colors.foreground : colors.mutedForeground }]}>
                  {key === 'start' ? 'Start' : 'Ends'}
                </Text>
                <Text style={[styles.segmentTime, { color: which === key ? colors.foreground : colors.mutedForeground }]}>{clockLabel(key === 'start' ? openTime : closeTime)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TimeWheel value={which === 'start' ? openTime : closeTime} onChange={(v) => { setError(''); (which === 'start' ? setOpenTime : setCloseTime)(v); }}
            color={colors.foreground} mutedColor={colors.mutedForeground} bandColor={colors.muted} />
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity onPress={save} style={[styles.button, { backgroundColor: colors.foreground, marginTop: 14 }]} testID="hours-save">
            <Text style={[styles.buttonText, { color: colors.background }]}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 78 },
  dayCheck: { width: 28, height: 28, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dayBody: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 70 },
  dayName: { fontSize: 21, fontFamily: 'Inter_500Medium' },
  dayTimes: { fontSize: 19, fontFamily: 'Inter_400Regular', marginTop: 6 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 24, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 14 },
  sheetTitle: { fontSize: 21, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginBottom: 14 },
  segment: { flexDirection: 'row', borderRadius: 28, padding: 3, marginBottom: 12 },
  segmentItem: { flex: 1, borderRadius: 26, borderWidth: 1.5, borderColor: 'transparent', alignItems: 'center', paddingVertical: 8 },
  segmentText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  segmentTime: { fontSize: 15, fontFamily: 'Inter_400Regular', marginTop: 2 },
  error: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 4 },
  button: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 19, fontFamily: 'Inter_600SemiBold' },
});
