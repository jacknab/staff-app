/** "What do you offer?" — a business type's categories as big tiles, tapped on and off (sign-up, Add from list). */
import { Feather } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { look, cardShadow } from '@/components/look/tokens';

export function CategoryTiles({ names, chosen, onChange }: { names: string[]; chosen: string[]; onChange: (chosen: string[]) => void }) {
  return (
    <View style={styles.tiles}>
      {names.map((name) => {
        const on = chosen.includes(name);
        return (
          <TouchableOpacity key={name} accessibilityRole="checkbox" accessibilityState={{ checked: on }} testID={`signup-cat-${name}`}
            onPress={() => onChange(on ? chosen.filter((n) => n !== name) : [...chosen, name])}
            style={[styles.tile, on && styles.tileOn]}>
            <Text style={[styles.tileText, on && styles.tileTextOn]}>{name}</Text>
            {on ? <Feather name="check" size={20} color="#FFFFFF" /> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  tile: { flexGrow: 1, flexBasis: '45%', minHeight: 72, borderRadius: 16, borderWidth: 1, borderColor: look.cardBorder, backgroundColor: look.card,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, ...cardShadow },
  tileOn: { backgroundColor: look.violet, borderColor: look.violet },
  tileText: { flex: 1, fontSize: 18, fontFamily: 'Inter_600SemiBold', color: look.heading },
  tileTextOn: { color: '#FFFFFF' },
});
