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
import { Animated, Easing, Platform, StatusBar, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/AppText';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';

type TipCheckoutProps = {
  baseCents: number;
  /** What the client owes before the tip (the tablet shows it under the tips); the visit price when not given. */
  dueCents?: number;
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
function BeatingHeart({ children, style }: { children: string; style?: object }) {
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
  return <Animated.Text style={[styles.face, style, { transform: [{ scale }] }]}>{children}</Animated.Text>;
}

const wholeDollars = (cents: number) => `$${Math.round(Math.max(0, cents) / 100).toLocaleString('en-US')}`;
const dollars = (cents: number) => `$${(Math.max(0, cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "$55", or "$55.40" when there are cents. */
const owed = (cents: number) => {
  const c = Math.max(0, Math.round(cents));
  return c % 100 === 0 ? wholeDollars(c) : dollars(c);
};

export function TipCheckout({ baseCents, dueCents, presets, onConfirmTip, onBack }: TipCheckoutProps) {
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
  // The owner's design (mock-ups, 2026-11-20): glowing gold-and-violet tip cards with the face inside each, a wide SKIP,
  // and what's owed before the tip. A tablet adds lavender waves and larger sizes; a phone keeps the owed amount at the
  // bottom edge.
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const t = tablet ? styles : phone;

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: 'none' } });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const pressKey = (key: string) => {
    if (key === 'clear') { setCustomDigits('0'); return; }
    if (key === 'backspace') { setCustomDigits((current) => (current.length > 1 ? current.slice(0, -1) : '0')); return; }
    setCustomDigits((current) => (current === '0' ? key : `${current}${key}`).slice(0, 7));
  };

  if (screen === 'select') {
    return (
      <View style={[styles.root, { paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" />
        <LinearGradient colors={tablet ? ['#FFFFFF', '#F6F2FE', '#EFE9FC'] : ['#FFFFFF', '#F7F7F9']} style={StyleSheet.absoluteFill} />
        {tablet ? <View pointerEvents="none" style={styles.waveBack} /> : null}
        {tablet ? <View pointerEvents="none" style={styles.waveFront} /> : null}
        <View style={[styles.header, { maxWidth: undefined, paddingHorizontal: tablet ? 28 : 16 }]}>
          {onBack ? (
            <TouchableOpacity testID="tip-back" onPress={onBack} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="chevron-left" size={tablet ? 40 : 30} color={INK} />
            </TouchableOpacity>
          ) : <View style={styles.headerSide} />}
          <TouchableOpacity testID="custom-tip" onPress={() => setScreen('custom')} style={[styles.headerSide, { alignItems: 'flex-end' }]} accessibilityRole="button">
            <Text style={t.tCustomLink}>Custom Tip</Text>
          </TouchableOpacity>
        </View>
        <View style={t.tBody}>
          <Text style={t.tTitle}>{proName ? `Say thanks to\n${proName}\nwith a tip` : 'Say thanks\nwith a tip'}</Text>
          <View style={t.tCards}>
            {percents.map((percent, i) => {
              const tip = roundedTipCents(safeBaseCents, percent);
              return (
                <TouchableOpacity key={percent} testID={`tip-${percent}`} onPress={() => onConfirmTip(tip)} activeOpacity={0.8} style={t.tCardGlow}
                  accessibilityRole="button" accessibilityLabel={`Tip ${wholeDollars(tip)}`}>
                  <LinearGradient colors={['#C4A3FF', '#F3D27A', '#B88A2F', '#8B5CF6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={t.tCardFrame}>
                    <LinearGradient colors={['#FFFFFF', '#F1EFF6']} style={t.tCardInner}>
                      <Text style={t.tCardAmount}>{wholeDollars(tip)}</Text>
                      {i === 2 ? <BeatingHeart style={t.tFace}>{FACES[2]}</BeatingHeart> : <Text style={[styles.face, t.tFace]}>{FACES[i] ?? FACES[FACES.length - 1]}</Text>}
                    </LinearGradient>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity testID="tip-no-tip" onPress={() => onConfirmTip(0)} style={t.tSkip} accessibilityRole="button">
            <Text style={t.tSkipText}>SKIP</Text>
          </TouchableOpacity>
          {tablet ? <View style={t.tOwed} testID="tip-owed">
            <Text style={t.tOwedLabel}>Amount Owed before tip:</Text>
            <Text style={t.tOwedValue}>{owed(dueCents ?? safeBaseCents)}</Text>
          </View> : null}
        </View>
        {tablet ? null : <View style={[t.tOwed, { paddingBottom: insets.bottom + 18 }]} testID="tip-owed">
          <Text style={t.tOwedLabel}>Amount Owed before tip:</Text>
          <Text style={t.tOwedValue}>{owed(dueCents ?? safeBaseCents)}</Text>
        </View>}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      {/* Custom tip: type the amount, then Confirm tip. Back returns to the tips. */}
      <View style={styles.header}>
        <TouchableOpacity testID="tip-back" onPress={() => setScreen('select')} style={styles.headerSide} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="chevron-left" size={30} color={INK} />
        </TouchableOpacity>
        <View style={styles.headerSide} />
      </View>

      {(
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
  body: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, justifyContent: 'center', paddingBottom: 60 },
  title: { fontSize: 36, lineHeight: 42, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', color: INK, textAlign: 'center' },
  face: { fontSize: 30, marginTop: -20, lineHeight: 38 },
  customAmount: { fontSize: 46, letterSpacing: -1, fontFamily: 'Inter_600SemiBold', color: INK, textAlign: 'center', marginTop: 18 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  key: { width: '31.5%', height: 58, borderRadius: 16, borderWidth: 1, borderColor: '#E3E3E6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  keyQuiet: { backgroundColor: '#F4F4F5' },
  keyText: { fontSize: 24, fontFamily: 'Inter_500Medium', color: INK },
  confirm: { height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  confirmText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  // The tablet's design.
  waveBack: { position: 'absolute', left: '-20%', right: '-20%', bottom: -260, height: 420, borderRadius: 600, backgroundColor: '#E6DCFB' },
  waveFront: { position: 'absolute', left: '-10%', right: '30%', bottom: -300, height: 420, borderRadius: 600, backgroundColor: '#D9C9FA', opacity: 0.7 },
  tCustomLink: { fontSize: 22, fontFamily: 'Inter_700Bold', color: INK },
  tBody: { flex: 1, width: '100%', maxWidth: 900, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingBottom: 24, gap: 26 },
  tTitle: { fontSize: 64, lineHeight: 70, letterSpacing: -1.6, fontFamily: 'Inter_700Bold', color: INK, textAlign: 'center' },
  tCards: { flexDirection: 'row', gap: 26, width: '100%', maxWidth: 820 },
  tCardGlow: { flex: 1, borderRadius: 46, shadowColor: '#8B5CF6', shadowOpacity: 0.45, shadowRadius: 22, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  tCardFrame: { borderRadius: 46, padding: 7 },
  tCardInner: { aspectRatio: 1, borderRadius: 40, alignItems: 'center', justifyContent: 'center', gap: 6 },
  tCardAmount: { fontSize: 64, letterSpacing: -1.5, fontFamily: 'Inter_700Bold', color: INK },
  tFace: { fontSize: 54, lineHeight: 64, marginTop: 0 },
  tSkip: { width: '100%', maxWidth: 820, height: 76, borderRadius: 38, borderWidth: 3, borderColor: INK, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.6)' },
  tSkipText: { fontSize: 34, fontFamily: 'Inter_700Bold', color: INK, letterSpacing: 0.5 },
  tOwed: { width: '100%', maxWidth: 900, borderRadius: 36, backgroundColor: '#FFFFFF', alignItems: 'center', paddingVertical: 18,
    shadowColor: '#5B21B6', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  tOwedLabel: { fontSize: 28, fontFamily: 'Inter_600SemiBold', color: INK },
  tOwedValue: { fontSize: 72, letterSpacing: -1.5, lineHeight: 82, fontFamily: 'Inter_700Bold', color: INK },
});

// The phone's sizes of the same design.
const phone = StyleSheet.create({
  ...styles,
  tCustomLink: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: INK },
  tBody: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 22 },
  tTitle: { fontSize: 38, lineHeight: 44, letterSpacing: -1, fontFamily: 'Inter_700Bold', color: INK, textAlign: 'center' },
  tCards: { flexDirection: 'row', gap: 12, width: '100%' },
  tCardGlow: { flex: 1, borderRadius: 26, shadowColor: '#8B5CF6', shadowOpacity: 0.45, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  tCardFrame: { borderRadius: 26, padding: 4 },
  tCardInner: { aspectRatio: 0.88, borderRadius: 22, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tCardAmount: { fontSize: 32, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', color: INK },
  tFace: { fontSize: 32, lineHeight: 40, marginTop: 0 },
  tSkip: { width: '100%', height: 56, borderRadius: 28, borderWidth: 2, borderColor: INK, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  tSkipText: { fontSize: 22, fontFamily: 'Inter_700Bold', color: INK, letterSpacing: 0.5 },
  tOwed: { width: '100%', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: '#FFFFFF', alignItems: 'center', paddingTop: 26,
    shadowColor: '#000000', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: -4 }, elevation: 8 },
  tOwedLabel: { fontSize: 20, fontFamily: 'Inter_500Medium', color: INK },
  tOwedValue: { fontSize: 58, letterSpacing: -1.2, lineHeight: 66, fontFamily: 'Inter_700Bold', color: INK },
});
