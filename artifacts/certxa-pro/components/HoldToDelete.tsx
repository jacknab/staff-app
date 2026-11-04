/**
 * Delete by holding (owner, 2026-11-04): a black outline with the label in the middle. Holding fills it with light
 * purple from the bottom up, and after 2 seconds the action runs. Letting go early empties it. The hold is the
 * confirmation, so there is no pop-up after it.
 */
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

const HOLD_MS = 2000;

export function HoldToDelete({ label, busy, onDone, testID }: { label: string; busy?: boolean; onDone: () => void; testID?: string }) {
  const [fill] = useState(() => new Animated.Value(0));
  // The action failed and the page is still here: empty again.
  useEffect(() => { if (!busy) fill.setValue(0); }, [busy, fill]);

  const start = () => {
    if (busy) return;
    Animated.timing(fill, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false }).start(({ finished }) => { if (finished) onDone(); });
  };
  const stop = () => {
    if (busy) return;
    Animated.timing(fill, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityHint="Press and hold for 2 seconds" disabled={busy} onPressIn={start} onPressOut={stop} style={styles.button}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View style={[styles.fill, { height: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { height: 54, borderWidth: 1.5, borderColor: '#000000', borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#D9C9F7' },
  label: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#000000' },
});
