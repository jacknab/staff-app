/**
 * A page with nothing on it yet (owner's tablet mock-ups, 2026-11-20, phones too; first: Packages): three icon cards
 * (the middle one large and upright, the side ones tilted behind it, a few sparks above), a big title, a line on what
 * the page is for, the button that starts the first one and a small note under it. `compact` for phones.
 */
import { Feather } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { look } from '@/components/look/tokens';

type Icon = keyof typeof Feather.glyphMap;

export function EmptyHero({ icons, title, text, button, onPress, note, testID, compact = false }: {
  /** Left, middle and right cards. */
  icons: [Icon, Icon, Icon];
  title: string;
  text: string;
  button: string;
  onPress: () => void;
  note?: string;
  testID?: string;
  compact?: boolean;
}) {
  const styles = compact ? small : big;
  return (
    <View style={styles.root} testID={testID}>
      <View style={styles.art}>
        <View style={styles.sparks}>
          <View style={[styles.spark, { transform: [{ rotate: '-35deg' }], marginTop: 8 }]} />
          <View style={[styles.spark, { height: compact ? 20 : 26 }]} />
          <View style={[styles.spark, { transform: [{ rotate: '55deg' }], marginTop: 14 }]} />
        </View>
        <View style={styles.cards}>
          <View style={[styles.side, { transform: [{ rotate: '-10deg' }], marginRight: compact ? -18 : -26 }]}><Feather name={icons[0]} size={compact ? 32 : 44} color="#B9A2F2" /></View>
          <View style={styles.middle}><Feather name={icons[1]} size={compact ? 58 : 84} color={look.violet} /></View>
          <View style={[styles.side, { transform: [{ rotate: '10deg' }], marginLeft: compact ? -18 : -26 }]}><Feather name={icons[2]} size={compact ? 32 : 44} color="#B9A2F2" /></View>
        </View>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.text}>{text}</Text>
      <TouchableOpacity onPress={onPress} style={styles.button} accessibilityRole="button" testID={testID ? `${testID}-button` : undefined}>
        <Feather name="plus" size={compact ? 20 : 24} color="#FFFFFF" />
        <Text style={styles.buttonText}>{button}</Text>
      </TouchableOpacity>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const card = { backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, alignItems: 'center' as const, justifyContent: 'center' as const,
  shadowColor: '#5B21B6', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 };

const big = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, paddingBottom: 30 },
  art: { alignItems: 'center', marginBottom: 34 },
  sparks: { flexDirection: 'row', gap: 12, height: 34, alignItems: 'flex-start', marginBottom: 6 },
  spark: { width: 6, height: 18, borderRadius: 3, backgroundColor: look.violet },
  cards: { flexDirection: 'row', alignItems: 'center' },
  side: { ...card, width: 128, height: 140, borderRadius: 24, backgroundColor: '#F6F2FE' },
  middle: { ...card, width: 172, height: 172, borderRadius: 30, zIndex: 1 },
  title: { fontSize: 38, lineHeight: 46, letterSpacing: -0.8, fontFamily: 'Inter_700Bold', color: look.heading, textAlign: 'center' },
  text: { fontSize: 22, lineHeight: 31, fontFamily: 'Inter_400Regular', color: look.subtle, textAlign: 'center', marginTop: 12, maxWidth: 520 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 64, paddingHorizontal: 54, borderRadius: 32, backgroundColor: look.violet, marginTop: 34,
    shadowColor: '#5B21B6', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  buttonText: { fontSize: 22, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  note: { fontSize: 18, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 26, textAlign: 'center' },
});

const small = StyleSheet.create({
  ...big,
  root: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 18, paddingBottom: 20 },
  art: { alignItems: 'center', marginBottom: 22 },
  sparks: { flexDirection: 'row', gap: 9, height: 26, alignItems: 'flex-start', marginBottom: 4 },
  spark: { width: 5, height: 14, borderRadius: 3, backgroundColor: look.violet },
  side: { ...card, width: 90, height: 100, borderRadius: 18, backgroundColor: '#F6F2FE' },
  middle: { ...card, width: 120, height: 120, borderRadius: 24, zIndex: 1 },
  title: { fontSize: 28, lineHeight: 34, letterSpacing: -0.5, fontFamily: 'Inter_700Bold', color: look.heading, textAlign: 'center' },
  text: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_400Regular', color: look.subtle, textAlign: 'center', marginTop: 8 },
  button: { ...big.button, height: 54, paddingHorizontal: 34, borderRadius: 27, marginTop: 24 },
  buttonText: { fontSize: 19, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  note: { fontSize: 15, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 16, textAlign: 'center' },
});
