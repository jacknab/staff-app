/**
 * Client notes (owner, 2026-10-30): opened from an appointment's Notes card. A field to write a note and Save,
 * and every note on this client below it, each in its own card, newest first. These are the client's notes on
 * the website too (client profile). A note written here is tied to the visit it was written on.
 *   GET /api/clients/:id/notes · POST /api/clients/:id/notes { noteContent, appointmentId }
 */
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { zonedTimeLabel } from '@/lib/businessTime';

type Note = { id: number; noteContent: string; createdAt: string; appointmentId?: number | null; pinned?: boolean };
const MAX = 5000;

export default function NotesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { timeZone } = useBookingData();
  const params = useLocalSearchParams<{ customerId?: string; clientName?: string; appointmentId?: string }>();
  const customerId = Number(params.customerId);
  const appointmentId = Number(params.appointmentId);
  const hasClient = Number.isInteger(customerId) && customerId > 0;
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(hasClient);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!hasClient) return;
    setLoading(true); setError('');
    try {
      const rows = await api.get<Note[]>(`/api/clients/${customerId}/notes`);
      setNotes(Array.isArray(rows) ? rows : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load the notes.');
    } finally {
      setLoading(false);
    }
  }, [customerId, hasClient]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const content = text.trim();
    if (!content || saving) return;
    setSaving(true); setError('');
    try {
      const created = await api.post<Note>(`/api/clients/${customerId}/notes`, {
        noteContent: content, ...(Number.isInteger(appointmentId) && appointmentId > 0 ? { appointmentId } : {}),
      });
      setNotes((current) => [{ ...created, appointmentId: appointmentId > 0 ? appointmentId : null }, ...current]);
      setText('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  };

  const when = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const day = date.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric', year: 'numeric' });
    return `${day} · ${zonedTimeLabel(date, timeZone)}`;
  };

  const canSave = hasClient && !!text.trim() && !saving;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="notes-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.back} accessibilityLabel="Back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Notes</Text>
          {params.clientName ? <Text numberOfLines={1} style={[styles.subtitle, { color: colors.mutedForeground }]}>{params.clientName}</Text> : null}
        </View>
      </View>

      {!hasClient ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>This appointment has no client, so notes can't be saved.</Text>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={(n) => String(n.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: insets.bottom + 30 }}
          ListHeaderComponent={
            <View style={styles.compose}>
              <TextInput testID="notes-input" value={text} onChangeText={(v) => setText(v.slice(0, MAX))} multiline
                placeholder="Write a note about this client" placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} />
              {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
              <TouchableOpacity testID="notes-save" disabled={!canSave} onPress={() => void save()}
                style={[styles.save, { backgroundColor: canSave ? colors.primary : colors.muted }]}>
                {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.saveText, { color: canSave ? colors.primaryForeground : colors.mutedForeground }]}>Save note</Text>}
              </TouchableOpacity>
              {loading ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} /> : null}
            </View>
          }
          ListEmptyComponent={loading ? null : <Text style={[styles.empty, { color: colors.mutedForeground }]}>No notes yet.</Text>}
          renderItem={({ item }) => (
            <View testID={`note-${item.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.noteText, { color: colors.foreground }]}>{item.noteContent}</Text>
              <Text style={[styles.noteMeta, { color: colors.mutedForeground }]}>
                {when(item.createdAt)}{item.appointmentId && item.appointmentId === appointmentId ? ' · This appointment' : ''}
              </Text>
            </View>
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 },
  compose: { gap: 10, paddingTop: 8, paddingBottom: 16 },
  input: { minHeight: 110, maxHeight: 220, borderWidth: 1, borderRadius: 16, padding: 14, fontSize: 15, lineHeight: 21, textAlignVertical: 'top', fontFamily: 'Inter_400Regular' },
  save: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, gap: 8 },
  noteText: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  noteMeta: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  empty: { textAlign: 'center', marginTop: 24, fontSize: 14, paddingHorizontal: 24 },
});
