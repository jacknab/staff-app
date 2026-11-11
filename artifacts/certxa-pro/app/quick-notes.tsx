/**
 * Quick Notes (owner, 2026-11-11): one screen after checkout, so next time the pro remembers how the client likes it.
 * The fields follow the business type (the server's template: nail, haircut, or a short one for everything else);
 * the services come from the visit and are only shown. Certxa writes the note in plain sentences and keeps it with
 * the client's notes.
 *   GET /api/quick-notes/appointment/:id · POST /api/quick-notes { appointmentId, choices, extra }
 */
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { SelectField } from '@/components/SelectField';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Field = { key: string; label: string; options: string[]; multi?: boolean };
type Visit = {
  available: boolean; template: { id: string; fields: Field[] }; clientName: string | null; staffName: string | null;
  services: string[]; saved: { choices: Record<string, string | string[]>; extra: string; text: string } | null;
};
const MAX_EXTRA = 1000;

/** Several choices in one dropdown: the sheet ticks each one, Done closes it. */
function MultiSelectField({ value, options, onChange, title, testID }: { value: string[]; options: string[]; onChange: (v: string[]) => void; title: string; testID: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={`${title}: ${value.join(', ') || 'Choose'}`} onPress={() => setOpen(true)}
        style={[styles.field, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text numberOfLines={1} style={[styles.fieldText, { color: value.length ? colors.foreground : colors.mutedForeground }]}>{value.join(', ') || 'Choose'}</Text>
        <Feather name="chevron-down" size={18} color={colors.mutedForeground} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={styles.backdrop} accessibilityLabel="Close">
          <TouchableOpacity activeOpacity={1} style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{title}</Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {options.map((o, index) => {
                const picked = value.includes(o);
                return (
                  <TouchableOpacity key={o} testID={`${testID}-${o}`} onPress={() => onChange(picked ? value.filter((v) => v !== o) : [...value, o])}
                    style={[styles.option, index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                    <Text style={[styles.optionText, { color: colors.foreground, fontFamily: picked ? 'Inter_600SemiBold' : 'Inter_400Regular' }]}>{o}</Text>
                    {picked ? <Feather name="check" size={20} color={colors.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity testID={`${testID}-done`} onPress={() => setOpen(false)} style={[styles.save, { backgroundColor: colors.primary, marginTop: 10 }]}>
              <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

export default function QuickNotesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ appointmentId?: string }>();
  const appointmentId = Number(params.appointmentId);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [choices, setChoices] = useState<Record<string, string | string[]>>({});
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedText, setSavedText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isInteger(appointmentId) || appointmentId <= 0) { setError('This visit could not be found.'); return; }
    api.get<Visit>(`/api/quick-notes/appointment/${appointmentId}`).then((v) => {
      setVisit(v);
      if (v.saved) { setChoices(v.saved.choices ?? {}); setExtra(v.saved.extra ?? ''); }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load Quick Notes.'));
  }, [appointmentId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const picked = Object.values(choices).some((v) => (Array.isArray(v) ? v.length > 0 : !!v));
  const canSave = !!visit?.available && (picked || !!extra.trim()) && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true); setError('');
    try {
      const done = await api.post<{ text: string }>('/api/quick-notes', { appointmentId, choices, extra: extra.trim() });
      setSavedText(done.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="quick-notes-back" onPress={close} style={styles.back} accessibilityLabel="Back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <HelpTitle help="quick-notes" style={[styles.title, { color: colors.foreground }]}>Quick Notes</HelpTitle>
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 20, gap: 8 }}>
        {!visit ? (error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} />) : (
          <>
            <View testID="quick-notes-visit" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text numberOfLines={1} style={[styles.client, { color: colors.foreground }]}>{visit.clientName ?? 'Client'}</Text>
              <Text numberOfLines={2} style={[styles.services, { color: colors.mutedForeground }]}>{[visit.services.join(', '), visit.staffName ? `with ${visit.staffName}` : ''].filter(Boolean).join(' · ')}</Text>
            </View>
            {!visit.available ? (
              <Text style={[styles.empty, { color: colors.mutedForeground }]}>This visit has no client to keep notes for.</Text>
            ) : savedText ? (
              <>
                <View testID="quick-notes-saved" style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 0 }]}>Saved to the client’s notes</Text>
                  <Text style={[styles.savedText, { color: colors.foreground }]}>{savedText}</Text>
                </View>
                <TouchableOpacity testID="quick-notes-done" onPress={close} style={[styles.save, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {visit.template.fields.map((f) => (
                  <View key={f.key}>
                    <Text style={[styles.label, { color: colors.foreground }]}>{f.label}</Text>
                    {f.multi ? (
                      <MultiSelectField testID={`quick-notes-${f.key}`} title={f.label} options={f.options}
                        value={Array.isArray(choices[f.key]) ? (choices[f.key] as string[]) : []} onChange={(v) => setChoices((c) => ({ ...c, [f.key]: v }))} />
                    ) : (
                      <SelectField testID={`quick-notes-${f.key}`} title={f.label} placeholder="Choose"
                        value={typeof choices[f.key] === 'string' ? (choices[f.key] as string) : ''}
                        options={[{ value: '', label: 'Not set' }, ...f.options.map((o) => ({ value: o, label: o }))]}
                        onChange={(v) => setChoices((c) => ({ ...c, [f.key]: v }))} />
                    )}
                  </View>
                ))}
                <Text style={[styles.label, { color: colors.foreground }]}>Additional Note</Text>
                <TextInput testID="quick-notes-extra" value={extra} onChangeText={(v) => setExtra(v.slice(0, MAX_EXTRA))} multiline
                  placeholder="Optional" placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
                {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
                <TouchableOpacity testID="quick-notes-save" disabled={!canSave} onPress={() => void save()}
                  style={[styles.save, { marginTop: 6, backgroundColor: canSave ? colors.primary : colors.muted }]}>
                  {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.saveText, { color: canSave ? colors.primaryForeground : colors.mutedForeground }]}>Save Notes</Text>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, gap: 4 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 3, ...cardShadow },
  client: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  services: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 4, marginBottom: 5 },
  field: { minHeight: 50, borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldText: { flex: 1, fontSize: 17, fontFamily: 'Inter_500Medium' },
  input: { minHeight: 56, maxHeight: 110, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, textAlignVertical: 'top', fontFamily: 'Inter_400Regular' },
  save: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  savedText: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  empty: { textAlign: 'center', marginTop: 20, fontSize: 17, paddingHorizontal: 20 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 22, paddingTop: 16 },
  sheetTitle: { fontSize: 19, fontFamily: 'Inter_600SemiBold', textAlign: 'center', marginBottom: 8 },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  optionText: { flex: 1, fontSize: 18 },
});
