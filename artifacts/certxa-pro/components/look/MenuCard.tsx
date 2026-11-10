import type { ComponentProps } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { cardShadow, look } from './tokens';

type Icon = { feather: ComponentProps<typeof Feather>['name'] } | { mci: ComponentProps<typeof MaterialCommunityIcons>['name'] };

/** One menu row: lavender icon tile, title and a line under it, chevron. */
export function MenuCard({ icon, title, subtitle, onPress, testID }: { icon: Icon; title: string; subtitle?: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={title} style={styles.card}>
      <View style={styles.tile}>
        {'feather' in icon
          ? <Feather name={icon.feather} size={26} color={look.violetDeep} />
          : <MaterialCommunityIcons name={icon.mci} size={28} color={look.violetDeep} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Feather name="chevron-right" size={24} color={look.subtle} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: look.card, borderRadius: 18, borderWidth: 1, borderColor: look.cardBorder, paddingHorizontal: 14, paddingVertical: 12, minHeight: 74, ...cardShadow },
  tile: { width: 54, height: 54, borderRadius: 15, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold', color: look.heading },
  subtitle: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 3 },
});
