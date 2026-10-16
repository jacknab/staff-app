import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';

type Service = { id: number; name: string; duration: number; price: number };
/** The service being added (id 0) or changed, as typed. */
type Draft = { id: number; name: string; minutes: string; price: string };

function minutesLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}

export default function ServicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useBookingData();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await api.get<any[]>('/api/services');
      setServices((Array.isArray(rows) ? rows : []).map((row) => ({ id: Number(row.id), name: String(row.name ?? 'Service'), duration: Number(row.duration) || 0, price: Number(row.price) || 0 })));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your services.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const minutes = Number.parseInt(draft.minutes, 10);
    const price = Number(draft.price);
    if (!name) return setError('Enter the name of the service.');
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) return setError('Enter how long it takes, in minutes (5 to 720).');
    if (!Number.isFinite(price) || price < 0) return setError('Enter the price, for example 45 or 45.50.');
    setSaving(true);
    setError('');
    try {
      const body = { name, duration: minutes, price: price.toFixed(2) };
      if (draft.id > 0) await api.patch(`/api/services/${draft.id}`, body);
      else await api.post('/api/services', { ...body, category: 'General' });
      setDraft(null);
      await load();
      // The booking screens read services from the shared list.
      void refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the service.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (service: Service) => {
    Alert.alert('Remove this service?', `${service.name} will no longer be offered. Appointments already booked for it are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.del(`/api/services/${service.id}`);
            setDraft(null);
            await load();
            void refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not remove the service.');
          }
        },
      },
    ]);
  };

  const input = { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground };
  const editing = draft && draft.id > 0 ? services.find((service) => service.id === draft.id) : undefined;

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="services-back" accessibilityLabel="Back" onPress={() => (draft ? (setDraft(null), setError('')) : router.back())} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>{draft ? (draft.id > 0 ? 'Edit service' : 'New service') : 'Services'}</Text>
        {draft ? <View style={styles.headerButton} /> : (
          <TouchableOpacity testID="services-add" accessibilityLabel="Add a service" onPress={() => { setError(''); setDraft({ id: 0, name: '', minutes: '', price: '' }); }} style={styles.headerButton}><Feather name="plus" size={22} color={colors.primary} /></TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {draft ? (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>Name</Text>
            <TextInput testID="service-name" autoCapitalize="words" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Gel manicure" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>Minutes</Text>
                <TextInput testID="service-minutes" keyboardType="number-pad" value={draft.minutes} onChangeText={(minutes) => setDraft({ ...draft, minutes: minutes.replace(/\D/g, '') })} placeholder="60" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>Price ($)</Text>
                <TextInput testID="service-price" keyboardType="decimal-pad" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^\d.]/g, '') })} placeholder="45.00" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
              </View>
            </View>
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            <TouchableOpacity testID="service-save" disabled={saving} onPress={() => void save()} style={[styles.button, { backgroundColor: saving ? colors.muted : colors.primary }]}>
              <Text style={[styles.buttonText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
            {editing ? (
              <TouchableOpacity testID="service-remove" disabled={saving} onPress={() => remove(editing)} style={styles.removeButton}>
                <Text style={[styles.buttonText, { color: colors.destructive }]}>Remove service</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <>
            {error ? <Text style={[styles.error, { color: colors.destructive, marginBottom: 12 }]}>{error}</Text> : null}
            {services.length === 0 && !error ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>You have no services yet. Tap + to add the first one.</Text> : null}
            <View style={styles.list}>
              {services.map((service) => (
                <TouchableOpacity key={service.id} testID={`service-${service.id}`} onPress={() => { setError(''); setDraft({ id: service.id, name: service.name, minutes: String(service.duration), price: service.price.toFixed(2) }); }} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{service.name}</Text>
                    <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{minutesLabel(service.duration)}</Text>
                  </View>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{`$${service.price.toFixed(2)}`}</Text>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  list: { gap: 8 },
  row: { borderWidth: 1, borderRadius: 15, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  pair: { flexDirection: 'row', gap: 10 },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', marginTop: 14 },
  empty: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 24, textAlign: 'center' },
  button: { height: 53, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  removeButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
