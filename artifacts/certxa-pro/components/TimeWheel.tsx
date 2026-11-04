/**
 * A time picker of three spinning columns — hour, minute (quarter hours) and AM/PM — with the chosen row in a band
 * across the middle, like the iOS one (sign-up business hours, owner 2026-11-03). Plain scroll views: no native module.
 * The value is "HH:MM" on the 24-hour clock.
 */
import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

const ROW = 44;
const VISIBLE = 5; // rows shown; the middle one is the choice
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = ['00', '15', '30', '45'];
const HALVES = ['AM', 'PM'];

function parts(value: string) {
  const [h, m] = value.split(':').map(Number);
  const hour24 = Number.isFinite(h) ? h : 9;
  const minute = Number.isFinite(m) ? m : 0;
  return { hour: ((hour24 + 11) % 12) + 1, minuteIndex: Math.min(3, Math.round(minute / 15)), pm: hour24 >= 12 };
}
const join = (hour12: number, minuteIndex: number, pm: boolean) =>
  `${String((hour12 % 12) + (pm ? 12 : 0)).padStart(2, '0')}:${MINUTES[minuteIndex]}`;

function Column({ items, index, onPick, color, mutedColor, width, testID }: {
  items: string[]; index: number; onPick: (i: number) => void; color: string; mutedColor: string; width: number; testID: string;
}) {
  const ref = useRef<ScrollView>(null);
  // Scroll to the value when it changes (Start/Ends switched, or a row tapped).
  useEffect(() => { ref.current?.scrollTo({ y: index * ROW, animated: false }); }, [index]);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
    if (i !== index) onPick(i);
  };
  // A flick keeps spinning after the finger lifts: wait for it to stop (onMomentumScrollEnd). Picking where the finger
  // lifted moved the wheel back there mid-spin (found 2026-11-04).
  const dragEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => { if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e); };
  return (
    <ScrollView ref={ref} style={{ width, height: ROW * VISIBLE }} showsVerticalScrollIndicator={false} snapToInterval={ROW}
      decelerationRate="fast" onMomentumScrollEnd={settle} onScrollEndDrag={dragEnd} testID={testID}
      // Starts on the value: a scrollTo before the first layout is ignored, which left the wheel on the first row.
      contentOffset={{ x: 0, y: index * ROW }}
      contentContainerStyle={{ paddingVertical: ROW * Math.floor(VISIBLE / 2) }}>
      {items.map((item, i) => (
        <TouchableOpacity key={item} style={styles.row} activeOpacity={0.6} onPress={() => { if (i !== index) onPick(i); }} accessibilityLabel={item}>
          <Text style={[styles.item, { color: i === index ? color : mutedColor, fontSize: i === index ? 26 : 21 }]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function TimeWheel({ value, onChange, color, mutedColor, bandColor }: {
  value: string; onChange: (value: string) => void; color: string; mutedColor: string; bandColor: string;
}) {
  const p = parts(value);
  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={[styles.band, { backgroundColor: bandColor }]} />
      <Column items={HOURS} index={p.hour - 1} onPick={(i) => onChange(join(i + 1, p.minuteIndex, p.pm))} color={color} mutedColor={mutedColor} width={70} testID="time-wheel-hour" />
      <Column items={MINUTES} index={p.minuteIndex} onPick={(i) => onChange(join(p.hour, i, p.pm))} color={color} mutedColor={mutedColor} width={70} testID="time-wheel-minute" />
      <Column items={HALVES} index={p.pm ? 1 : 0} onPick={(i) => onChange(join(p.hour, p.minuteIndex, i === 1))} color={color} mutedColor={mutedColor} width={70} testID="time-wheel-half" />
    </View>
  );
}

/** "9:00AM" from "09:00". */
export function clockLabel(value: string): string {
  const p = parts(value);
  return `${p.hour}:${MINUTES[p.minuteIndex]}${p.pm ? 'PM' : 'AM'}`;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 18, height: ROW * VISIBLE },
  band: { position: 'absolute', left: 24, right: 24, top: ROW * Math.floor(VISIBLE / 2), height: ROW, borderRadius: 12 },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  item: { fontFamily: 'Inter_500Medium' },
});
