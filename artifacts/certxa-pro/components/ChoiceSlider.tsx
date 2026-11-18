import { useMemo, useRef } from 'react';
import { Feather } from '@expo/vector-icons';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/** Which side the handle sits on: left (the first choice) or right. */
export type SliderSide = 'left' | 'right';

/**
 * The two-way slider (first used for the deposit request when booking): slide the handle left or right, or tap a
 * side, to choose; the button below it then acts on the choice. Shared so every yes/no choice in the app looks the same.
 */
export function ChoiceSlider({ choice, onChoice, leftLabel, rightLabel, accessibilityLabel, accessibilityHint, testID, strong, allowMiddle }: {
  choice: SliderSide | null;
  onChoice: (choice: SliderSide | null) => void;
  leftLabel: string;
  rightLabel: string;
  accessibilityLabel: string;
  accessibilityHint: string;
  testID?: string;
  /** Larger, dark labels, for a choice the page is built around (the late-cancel fee). */
  strong?: boolean;
  /** The handle can go back to the middle (no choice yet): tap it, or slide it there (owner, 2026-11-18). */
  allowMiddle?: boolean;
}) {
  const colors = useColors();
  const offset = useRef(new Animated.Value(0)).current;
  const startOffset = useRef(0);
  const maxTravel = useRef(0);
  const animateTo = (next: SliderSide | null) => Animated.spring(offset, {
    toValue: next === 'left' ? -maxTravel.current : next === 'right' ? maxTravel.current : 0,
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
        // A tap on the handle: back to the middle when that's allowed, else it stays where it was.
        if (allowMiddle && choice) { onChoice(null); animateTo(null); return; }
        if (choice) animateTo(choice); else offset.setValue(0);
        return;
      }
      const end = startOffset.current + gesture.dx;
      // Let go near the middle: no choice yet.
      if (allowMiddle && Math.abs(end) < maxTravel.current / 3) { onChoice(null); animateTo(null); return; }
      const next: SliderSide = end < 0 ? 'left' : 'right';
      onChoice(next);
      animateTo(next);
    },
    onPanResponderTerminate: () => { if (choice) animateTo(choice); else offset.setValue(0); },
  }), [choice, offset, onChoice, allowMiddle]);

  return (
    <View testID={testID} style={[styles.choiceSlider, { backgroundColor: colors.muted, borderColor: colors.border }]} onLayout={(event) => { maxTravel.current = Math.max(0, event.nativeEvent.layout.width / 2 - 31); }}>
      <TouchableOpacity testID={testID ? `${testID}-left` : undefined} accessibilityRole="button" accessibilityState={{ selected: choice === 'left' }} onPress={() => { onChoice('left'); animateTo('left'); }} style={styles.sliderSide}>
        <Text style={[styles.sliderLabel, strong && styles.strongLabel, { color: choice === 'left' ? colors.primary : strong ? colors.foreground : colors.mutedForeground }]}>{leftLabel}</Text>
      </TouchableOpacity>
      <View style={styles.sliderCenter} pointerEvents="none">
        <View style={[styles.sliderRail, { backgroundColor: choice === 'left' ? colors.primary : choice === 'right' ? colors.accentForeground : colors.border }]} />
      </View>
      <TouchableOpacity testID={testID ? `${testID}-right` : undefined} accessibilityRole="button" accessibilityState={{ selected: choice === 'right' }} onPress={() => { onChoice('right'); animateTo('right'); }} style={styles.sliderSide}>
        <Text style={[styles.sliderLabel, strong && styles.strongLabel, { color: choice === 'right' ? colors.accentForeground : strong ? colors.foreground : colors.mutedForeground }]}>{rightLabel}</Text>
      </TouchableOpacity>
      <Animated.View
        {...responder.panHandlers}
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ checked: choice === 'left', disabled: false }}
        style={[styles.sliderThumb, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ translateX: offset }] }]}
      >
        <Feather name="shuffle" size={19} color={colors.primary} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  choiceSlider: { height: 62, borderWidth: 1, borderRadius: 31, flexDirection: 'row', alignItems: 'center', position: 'relative', overflow: 'hidden' },
  sliderSide: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center' },
  sliderLabel: { fontSize: 14, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  strongLabel: { fontSize: 18, letterSpacing: 1.4 },
  sliderCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  sliderRail: { width: 2, height: 22, borderRadius: 1 },
  sliderThumb: { position: 'absolute', left: '50%', marginLeft: -28, top: 2, width: 54, height: 56, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center', elevation: 2 },
});
