/**
 * An item's Vietnamese name (owner, 2026-11-19), on its edit screen: what the app shows while it is in Vietnamese
 * (Settings › Language; lib/catalogNames.ts). Made by AI when the item is added or renamed; the pro can change it, and
 * their wording is kept from then on. GET · PUT /api/translations/:type/:id(/vi).
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { loadCatalogNames } from '@/lib/catalogNames';

export type TranslatedType = 'category' | 'service' | 'addon' | 'product' | 'package' | 'bundle';
type Row = { language: string; name: string; isEditedByUser?: boolean };

export function TranslationField({ type, id }: { type: TranslatedType; id: number }) {
  const colors = useColors();
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
  const [note, setNote] = useState('');
  useEffect(() => {
    let cancelled = false;
    api.get<Row[]>(`/api/translations/${type}/${id}`)
      .then((rows) => { if (cancelled) return; const vi = (Array.isArray(rows) ? rows : []).find((r) => r.language === 'vi')?.name ?? ''; setValue(vi); setSaved(vi); setState('ready'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [type, id]);
  const save = async () => {
    if (!value.trim() || value.trim() === saved) return;
    setState('saving'); setNote('');
    try {
      await api.put(`/api/translations/${type}/${id}/vi`, { name: value.trim() });
      setSaved(value.trim()); setNote('Saved.'); void loadCatalogNames();
    } catch (cause) { setNote(cause instanceof Error ? cause.message : 'That could not be saved.'); }
    finally { setState('ready'); }
  };
  const changed = value.trim() !== saved && value.trim().length > 0;
  return (
    <View style={styles.box} testID={`translation-${type}`}>
      <Text style={[styles.label, { color: colors.foreground }]}>Vietnamese name</Text>
      {state === 'loading' ? <ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} /> : (
        <View style={styles.row}>
          <TextInput testID={`translation-${type}-vi`} value={value} onChangeText={setValue} placeholder={state === 'error' ? 'Could not load' : 'Not translated yet'}
            placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
          <TouchableOpacity testID={`translation-${type}-save`} disabled={!changed || state === 'saving'} onPress={() => void save()}
            style={[styles.save, { backgroundColor: changed ? colors.primary : colors.muted }]}>
            <Text style={[styles.saveText, { color: changed ? colors.primaryForeground : colors.mutedForeground }]}>{state === 'saving' ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        </View>
      )}
      <Text style={[styles.help, { color: colors.mutedForeground }]}>{note || 'Shown when the app is in Vietnamese. Made by AI; change it here if it reads wrong.'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 14, gap: 8 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, fontSize: 17, fontFamily: 'Inter_400Regular' },
  save: { minWidth: 80, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  saveText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  help: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular' },
});
