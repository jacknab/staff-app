/**
 * A clean dropdown (owner, 2026-11-03: no rows of pill buttons anywhere in the app). The field shows the current choice
 * with a chevron; tapping it opens a sheet with a plain list and a tick on the current one.
 */
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export type SelectOption<T> = { value: T; label: string; hint?: string };

export function SelectField<T extends string | number | boolean>({ value, options, onChange, title, placeholder = 'Choose', testID, compact = false }: {
  value: T | null | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** The sheet's heading. */
  title?: string;
  placeholder?: string;
  testID?: string;
  /** A smaller field, e.g. a list filter. */
  compact?: boolean;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={`${title ?? 'Choose'}: ${current?.label ?? placeholder}`} onPress={() => setOpen(true)}
        style={[compact ? styles.compact : styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text numberOfLines={1} style={[compact ? styles.compactText : styles.fieldText, { color: current ? colors.foreground : colors.mutedForeground }]}>{current?.label ?? placeholder}</Text>
        <Feather name="chevron-down" size={compact ? 16 : 18} color={colors.mutedForeground} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={styles.backdrop} accessibilityLabel="Close">
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            {title ? <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text> : null}
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {options.map((o, index) => {
                const picked = o.value === value;
                return (
                  <TouchableOpacity key={String(o.value)} testID={testID ? `${testID}-${String(o.value)}` : undefined} onPress={() => { onChange(o.value); setOpen(false); }}
                    style={[styles.option, index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, { color: colors.foreground, fontFamily: picked ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>{o.label}</Text>
                      {o.hint ? <Text style={[styles.optionHint, { color: colors.mutedForeground }]}>{o.hint}</Text> : null}
                    </View>
                    {picked ? <Feather name="check" size={20} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldText: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  compact: { minHeight: 40, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
  compactText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 22, paddingTop: 10 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginBottom: 8 },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionText: { fontSize: 16 },
  optionHint: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
});
