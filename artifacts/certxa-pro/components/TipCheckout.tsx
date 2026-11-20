/**
 * The client's tip page (owner's design, 2026-11-20): "Say thanks to <pro> with a tip", the pro's three tips as whole
 * dollar amounts (never the percentage, and never a "Popular" label), each with its face under the card. Tapping a
 * tip — or Skip for none — starts the card payment at once; Custom tip types an amount and confirms it.
 *
 * A tip is the percentage of the visit rounded to whole dollars, the beauty-business way: 50¢ and under rounds down,
 * 51¢ and up rounds up ($11.26 → $11, $11.51 → $12). On a tablet this fills the screen for the client, in one centered
 * column the phone's width.
 */
import { useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Animated, Easing, Platform, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

type TipCheckoutProps = {
  baseCents: number;
  serviceName?: string;
  /** The business's three tip percentages (Settings › Card reader & Checkout); 18, 20 and 25 until they load. */
  presets?: number[];
  /** Kept for callers; no tip is picked in advance now that a tap pays. */
  defaultPercent?: number | null;
  onConfirmTip: (tipCents: number) => void;
  /** Back out of checkout (to the appointment it was opened from). */
  onBack?: () => void;
};

const DEFAULT_PRESETS = [18, 20, 25];
/** The faces under the three tips, smallest to largest. */
const FACES = ['😊', '😘', '❤️'];
const INK = '#111111';

/** The tip in whole dollars, in cents: 50¢ and under rounds down, 51¢ and up rounds up. */
export function roundedTipCents(baseCents: number, percent: number): number {
  const exact = Math.round(Math.max(0, baseCents) * percent / 100);
  const whole = Math.floor(exact / 100);
  return (exact % 100 > 50 ? whole + 1 : whole) * 100;
}

/** The heart under the third tip beats, to draw the eye to that card (owner, 2026-11-20). */
function BeatingHeart({ children }: { children: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const beat = Animated.loop(Animated.sequence([
      Animated.timing(scale, { toValue: 1.3, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1.18, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.delay(700),
    ]));
    beat.start();
    return () => beat.stop();
  }, [scale]);
  return <Animated.Text style={[styles.face, { transform: [{ scale }] }]}>{children}</Animated.Text>;
}

const wholeDollars = (cents: number) => `$${Math.round(Math.max(0, cents) / 100).toLocaleString('en-US')}`;
const dollars = (cents: number) => `$${(Math.max(0, cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function TipCheckout({ baseCents, presets, onConfirmTip, onBack }: TipCheckoutProps) {
  const percents = (presets && presets.length > 0 ? presets : DEFAULT_PRESETS).slice(0, 3);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { user } = useAuth();
  const proName = String((user as { firstName?: unknown } | null)?.firstName ?? '').trim();
  const [screen, setScreen] = useState<'select' | 'custom'>('select');
  const [customDigits, setCustomDigits] = useState('0');
  const safeBaseCents = Math.max(0, Math.round(baseCents || 0));
  const customTipCents = Number(customDigits) || 0;
  const topInset = Platform.OS === 'web' ? 24 : insets.top;

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: 'none' } });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const pressKey = (key: string) => {
    if (key === 'clear') { setCustomDigits('0'); return; }
    if (key === 'backspace') { setCustomDigits((current) => (current.length > 1 ? current.slice(0, -1) : '0')); return; }
    setCustomDigits((current) => (current === '0' ? key : `${current}${key}`).slice(0, 7));
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        {screen === 'custom' || onBack ? (
          <TouchableOpacity testID="tip-back" onPress={() => (screen === 'custom' ? setScreen('select') : onBack?.())} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="chevron-left" size={30} color={INK} />
          </TouchableOpacity>
        ) : <View style={styles.headerSide} />}
        {screen === 'select' ? (
          <TouchableOpacity testID="custom-tip" onPress={() => setScreen('custom')} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityRole="button">
            <Text style={styles.customLink}>Custom tip</Text>
          </TouchableOpacity>
        ) : <View style={styles.headerSide} />}
      </View>

      {screen === 'select' ? (
        <View style={styles.body}>
          <Text style={styles.title}>{proName ? `Say thanks to ${proName} with a tip` : 'Say thanks with a tip'}</Text>
          <View style={styles.cards}>
            {percents.map((percent, i) => {
              const tip = roundedTipCents(safeBaseCents, percent);
              return (
                <View key={percent} style={styles.cardSlot}>
                  <TouchableOpacity testID={`tip-${percent}`} onPress={() => onConfirmTip(tip)} activeOpacity={0.7} style={styles.card}
                    accessibilityRole="button" accessibilityLabel={`Tip ${wholeDollars(tip)}`}>
                    <Text style={styles.cardAmount}>{wholeDollars(tip)}</Text>
                  </TouchableOpacity>
                  {i === 2 ? <BeatingHeart>{FACES[2]}</BeatingHeart> : <Text style={styles.face}>{FACES[i] ?? FACES[FACES.length - 1]}</Text>}
                </View>
              );
            })}
          </View>
          <TouchableOpacity testID="tip-no-tip" onPress={() => onConfirmTip(0)} style={styles.skip} accessibilityRole="button">
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.title}>Add a custom tip</Text>
          <Text testID="custom-tip-amount" style={styles.customAmount}>{dollars(customTipCents)}</Text>
          <View style={styles.keypad}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'].map((key) => (
              <TouchableOpacity key={key} testID={`tip-key-${key}`} onPress={() => pressKey(key)} style={[styles.key, (key === 'clear' || key === 'backspace') && styles.keyQuiet]}>
                {key === 'backspace' ? <Feather name="delete" size={22} color={INK} /> : <Text style={styles.keyText}>{key === 'clear' ? 'C' : key}</Text>}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity testID="confirm-tip" disabled={customTipCents <= 0} onPress={() => onConfirmTip(customTipCents)}
            style={[styles.confirm, { backgroundColor: customTipCents > 0 ? INK : colors.muted }]}>
            <Text style={[styles.confirmText, { color: customTipCents > 0 ? '#FFFFFF' : colors.mutedForeground }]}>Confirm tip</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { width: '100%', maxWidth: 640, alignSelf: 'center', height: 56, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSide: { minWidth: 96, height: 48, justifyContent: 'center' },
  customLink: { fontSize: 15, fontFamily: 'Inter_500Medium', color: INK },
  body: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, justifyContent: 'center', paddingBottom: 60 },
  title: { fontSize: 36, lineHeight: 42, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', color: INK, textAlign: 'center' },
  cards: { flexDirection: 'row', gap: 12, marginTop: 34 },
  cardSlot: { flex: 1, alignItems: 'center' },
  card: { width: '100%', aspectRatio: 0.95, borderRadius: 22, borderWidth: 1, borderColor: '#E3E3E6', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  cardAmount: { fontSize: 26, fontFamily: 'Inter_600SemiBold', color: INK },
  face: { fontSize: 30, marginTop: -20, lineHeight: 38 },
  skip: { alignSelf: 'center', marginTop: 34, minHeight: 48, minWidth: 140, paddingHorizontal: 28, borderRadius: 24, borderWidth: 1, borderColor: '#E3E3E6', alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: INK },
  customAmount: { fontSize: 46, letterSpacing: -1, fontFamily: 'Inter_600SemiBold', color: INK, textAlign: 'center', marginTop: 18 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  key: { width: '31.5%', height: 58, borderRadius: 16, borderWidth: 1, borderColor: '#E3E3E6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  keyQuiet: { backgroundColor: '#F4F4F5' },
  keyText: { fontSize: 24, fontFamily: 'Inter_500Medium', color: INK },
  confirm: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  confirmText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
});
