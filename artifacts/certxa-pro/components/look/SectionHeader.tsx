import { StyleSheet, Text, View } from 'react-native';
import { look } from './tokens';

/** A section title with the short violet bar in front of it. */
export function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      <View style={styles.bar} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 12 },
  bar: { width: 4, height: 22, borderRadius: 2, backgroundColor: look.violet },
  title: { fontSize: 21, fontFamily: 'Inter_600SemiBold', color: look.heading },
});

/** The same heading without its own spacing, for a row that also holds a link or button. */
export function SectionTitle({ children, style }: { children: string; style?: import('react-native').StyleProp<import('react-native').ViewStyle> }) {
  return (
    <View style={[inline.row, style]} accessibilityRole="header">
      <View style={styles.bar} />
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}

const inline = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: 10 } });
