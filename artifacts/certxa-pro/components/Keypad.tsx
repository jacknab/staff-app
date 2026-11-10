/**
 * A phone keypad drawn like the iPhone's: round keys, the digit with its letters underneath, system font.
 * Light on the Business Phone dialer, dark (frosted keys) during a call.
 */
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const ROWS = [
  [['1', ''], ['2', 'A B C'], ['3', 'D E F']],
  [['4', 'G H I'], ['5', 'J K L'], ['6', 'M N O']],
  [['7', 'P Q R S'], ['8', 'T U V'], ['9', 'W X Y Z']],
  [['*', ''], ['0', '+'], ['#', '']],
];

export function Keypad({ onPress, dark = false }: { onPress: (key: string) => void; dark?: boolean }) {
  return (
    <View style={styles.grid}>
      {ROWS.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map(([key, letters]) => (
            <TouchableOpacity key={key} onPress={() => onPress(key)} accessibilityLabel={key} testID={`key-${key}`} activeOpacity={0.55}
              style={[styles.key, { backgroundColor: dark ? 'rgba(255,255,255,0.16)' : '#E5E5EA' }]}>
              <Text style={[styles.digit, key === '*' && styles.star, { color: dark ? '#FFFFFF' : '#000000' }]}>{key}</Text>
              {letters ? <Text style={[styles.letters, { color: dark ? '#FFFFFF' : '#000000' }]}>{letters}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 16, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 28 },
  key: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  digit: { fontSize: 36, fontWeight: '400', lineHeight: 42 },
  star: { fontSize: 44, lineHeight: 48, marginTop: 10 },
  letters: { fontSize: 13, fontWeight: '700', letterSpacing: 1, marginTop: -3 },
});
