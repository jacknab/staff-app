/**
 * Shared pieces for the Catalog screens (MORE → Catalog: categories, add-ons, packages, deals, products), so every
 * list and editor looks and behaves the same as the Services screen: a header with back and +, a list of rows, and
 * an editor that replaces the list while one item is open.
 */
import type { ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ActivityIndicator, Image, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function money(value: number | string | null | undefined) {
  return `$${(Number(value) || 0).toFixed(2)}`;
}

export function minutesLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}

export function errorText(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

/** Pick a photo from the library as a data: address; the server stores it in R2 when the item is saved. */
export async function pickImageDataUri(aspect: [number, number] = [1, 1]): Promise<string | null> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7, base64: true });
  const asset = picked.canceled ? null : picked.assets?.[0];
  if (!asset) return null;
  if (!asset.base64) throw new Error('That photo could not be read. Try another one.');
  return `data:${asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'};base64,${asset.base64}`;
}

export function PhotoField({ label, uri, onPick, onRemove, testID }: { label: string; uri: string | null | undefined; onPick: () => void; onRemove: () => void; testID: string }) {
  const colors = useColors();
  return (
    <>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View style={styles.photoRow}>
        <TouchableOpacity testID={testID} onPress={onPick} style={[styles.photo, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          {uri ? <Image source={{ uri }} style={styles.photo} /> : <Feather name="image" size={22} color={colors.mutedForeground} />}
        </TouchableOpacity>
        <View style={{ flex: 1, gap: 8 }}>
          <TouchableOpacity onPress={onPick}><Text style={[styles.rowTitle, { color: colors.primary }]}>{uri ? 'Change photo' : 'Choose a photo'}</Text></TouchableOpacity>
          {uri ? <TouchableOpacity onPress={onRemove}><Text style={[styles.rowHint, { color: colors.mutedForeground }]}>Remove</Text></TouchableOpacity> : null}
        </View>
      </View>
    </>
  );
}

export function CatalogScreen({ title, onBack, onAdd, addLabel, testID, children }: {
  title: string; onBack: () => void; onAdd?: () => void; addLabel?: string; testID: string; children: ReactNode;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID={`${testID}-back`} accessibilityLabel="Back" onPress={onBack} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>
        {onAdd ? (
          <TouchableOpacity testID={`${testID}-add`} accessibilityLabel={addLabel ?? 'Add'} onPress={onAdd} style={styles.headerButton}><Feather name="plus" size={22} color={colors.primary} /></TouchableOpacity>
        ) : <View style={styles.headerButton} />}
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Loading() {
  const colors = useColors();
  return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
}

export function Empty({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.empty, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function ErrorLine({ children }: { children: string }) {
  const colors = useColors();
  return children ? <Text style={[styles.error, { color: colors.destructive }]}>{children}</Text> : null;
}

export function SectionTitle({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.section, { color: colors.mutedForeground }]}>{children}</Text>;
}

export function Row({ title, hint, right, onPress, testID, dim }: { title: string; hint?: string; right?: string; onPress: () => void; testID: string; dim?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity testID={testID} onPress={onPress} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: dim ? 0.6 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        {hint ? <Text numberOfLines={2} style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
      {right ? <Text style={[styles.rowTitle, { color: colors.foreground }]}>{right}</Text> : null}
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <View style={styles.list}>{children}</View>;
}

export function Field({ label, multiline, ...props }: TextInputProps & { label: string }) {
  const colors = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        multiline={multiline}
        {...props}
        style={[styles.input, multiline ? styles.textArea : null, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
      />
    </View>
  );
}

export function Pair({ children }: { children: ReactNode }) {
  return <View style={styles.pair}>{children}</View>;
}

export function Label({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={[styles.label, { color: colors.foreground }]}>{children}</Text>;
}

/** One choice out of a few (e.g. 30 / 60 / 90 days). */
export function Choice<T extends string | number>({ options, value, onChange, testID }: { options: Array<[T, string]>; value: T; onChange: (value: T) => void; testID: string }) {
  const colors = useColors();
  return (
    <View style={styles.pair}>
      {options.map(([option, text]) => {
        const picked = option === value;
        return (
          <TouchableOpacity key={String(option)} testID={`${testID}-${option}`} onPress={() => onChange(option)} style={[styles.chip, { backgroundColor: picked ? colors.primary : colors.card, borderColor: picked ? colors.primary : colors.border }]}>
            <Text style={[styles.chipText, { color: picked ? colors.primaryForeground : colors.foreground }]}>{text}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Tick any number of items (services an add-on belongs to, what a package holds). */
export function Checklist({ items, picked, onToggle, testID, empty }: { items: Array<{ id: number; title: string; hint?: string }>; picked: number[]; onToggle: (id: number) => void; testID: string; empty: string }) {
  const colors = useColors();
  if (items.length === 0) return <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{empty}</Text>;
  return (
    <View style={styles.list}>
      {items.map((item) => {
        const on = picked.includes(item.id);
        return (
          <TouchableOpacity key={item.id} testID={`${testID}-${item.id}`} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => onToggle(item.id)} style={[styles.checkRow, { backgroundColor: colors.card, borderColor: on ? colors.primary : colors.border }]}>
            <View style={[styles.box, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }]}>
              {on ? <Feather name="check" size={13} color={colors.primaryForeground} /> : null}
            </View>
            <Text numberOfLines={1} style={[styles.rowTitle, { flex: 1, color: colors.foreground }]}>{item.title}</Text>
            {item.hint ? <Text style={[styles.rowHint, { marginTop: 0, color: colors.mutedForeground }]}>{item.hint}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Toggle({ title, hint, value, onChange, testID }: { title: string; hint?: string; value: boolean; onChange: (value: boolean) => void; testID: string }) {
  const colors = useColors();
  return (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 18 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{hint}</Text> : null}
      </View>
      <Switch testID={testID} value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={colors.card} />
    </View>
  );
}

export function SaveButton({ saving, onPress, testID, label = 'Save' }: { saving: boolean; onPress: () => void; testID: string; label?: string }) {
  const colors = useColors();
  return (
    <TouchableOpacity testID={testID} disabled={saving} onPress={onPress} style={[styles.button, { backgroundColor: saving ? colors.muted : colors.primary }]}>
      <Text style={[styles.buttonText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : label}</Text>
    </TouchableOpacity>
  );
}

export function QuietButton({ label, onPress, testID, destructive, disabled }: { label: string; onPress: () => void; testID: string; destructive?: boolean; disabled?: boolean }) {
  const colors = useColors();
  return (
    <TouchableOpacity testID={testID} disabled={disabled} onPress={onPress} style={styles.quiet}>
      <Text style={[styles.buttonText, { color: destructive ? colors.destructive : colors.primary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  list: { gap: 8 },
  section: { fontSize: 11, letterSpacing: 0.8, fontFamily: 'Inter_700Bold', marginTop: 18, marginBottom: 8 },
  row: { borderWidth: 1, borderRadius: 15, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  checkRow: { borderWidth: 1, borderRadius: 13, minHeight: 50, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  textArea: { height: 100, paddingTop: 12, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderWidth: 1, borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', marginTop: 14 },
  empty: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 24, textAlign: 'center' },
  button: { height: 53, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 72, height: 72, borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  quiet: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
