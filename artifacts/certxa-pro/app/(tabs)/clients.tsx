import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { zonedDateLabel } from '@/lib/businessTime';
import { clientStatusOf, STATUS_LABEL, type ClientStatus } from '@/lib/clientStatus';
import { HelpTitle } from '@/components/HelpTitle';

/**
 * Clients (owner, 2026-11-03; plans/certxa-pro-crm.md): search by name, phone or e-mail; filters by the website's
 * status rule (lib/clientStatus.ts) plus Upcoming; each row opens the client's profile (app/client/[id].tsx).
 */
type Filter = 'all' | 'upcoming' | ClientStatus;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'new', label: 'New' }, { key: 'regular', label: 'Regular' },
  { key: 'at_risk', label: 'At risk' }, { key: 'inactive', label: 'Inactive' }, { key: 'vip', label: 'VIP' },
];

export default function ClientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clients, addClient, timeZone } = useBookingData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const withStatus = useMemo(() => clients.map((client) => ({ client, status: clientStatusOf(client) })), [clients]);
  const matches = (key: Filter, row: (typeof withStatus)[number]) =>
    key === 'all' ? true : key === 'upcoming' ? !!row.client.nextAppointmentAt : row.status === key;
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.key, withStatus.filter((row) => matches(f.key, row)).length])), [withStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => {
    const words = search.trim().toLowerCase();
    const digits = search.replace(/\D/g, '');
    return withStatus.filter((row) => matches(filter, row)).filter(({ client }) => !words
      || client.name.toLowerCase().includes(words)
      || (client.email ?? '').toLowerCase().includes(words)
      || (digits.length >= 3 && client.phone.replace(/\D/g, '').includes(digits)))
      .sort((a, b) => filter === 'upcoming' ? +new Date(a.client.nextAppointmentAt ?? 0) - +new Date(b.client.nextAppointmentAt ?? 0) : 0);
  }, [withStatus, filter, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const subtitle = (client: (typeof clients)[number]) => {
    if (client.nextAppointmentAt) return `Next visit ${zonedDateLabel(client.nextAppointmentAt, timeZone)}`;
    if (client.lastVisitAt) return `Last visit ${zonedDateLabel(client.lastVisitAt, timeZone)}${client.lastService ? ` · ${client.lastService}` : ''}`;
    return 'No visits yet';
  };
  const open = (customerId: number) => router.push(`/client/${customerId}`);

  const saveClient = async () => {
    const trimmed = newName.trim();
    if (!trimmed || saving) return;
    const initials = trimmed.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
    setSaving(true); setError('');
    try {
      const client = await addClient({ name: trimmed, initials: initials || 'NC', phone: newPhone.replace(/\D/g, ''), lastVisit: 'New client', service: 'No visits yet', visits: 0, spend: '$0', color: 'green' });
      setNewName(''); setNewPhone(''); setAdding(false); open(client.customerId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save client.'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} behavior="padding" keyboardVerticalOffset={0}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}>
          <View><Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR PEOPLE</Text><HelpTitle help="clients" style={[styles.title, { color: colors.foreground }]}>Clients</HelpTitle></View>
          <TouchableOpacity testID="add-client" onPress={() => setAdding((value) => !value)} style={[styles.addButton, { backgroundColor: colors.primary }]}><Feather name={adding ? 'x' : 'plus'} size={21} color={colors.primaryForeground} /></TouchableOpacity>
        </View>
        <Text style={[styles.caption, { color: colors.mutedForeground }]}>Keep every client feeling remembered.</Text>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput testID="client-search" value={search} onChangeText={setSearch} placeholder="Name, phone or e-mail" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} returnKeyType="search" autoCapitalize="none" /></View>
        <View style={styles.filters}>
          <SelectField compact testID="client-filter" title="Show" value={filter}
            options={FILTERS.filter((f) => f.key === 'all' || counts[f.key] > 0 || f.key === filter).map((f) => ({ value: f.key, label: `${f.key === 'all' ? 'All clients' : f.label} (${counts[f.key]})` }))}
            onChange={setFilter} />
        </View>
        {adding && (
          <View style={[styles.addPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.itemTitle, { color: colors.foreground, marginBottom: 10 }]}>Add a client</Text>
            <TextInput testID="new-client-name" autoFocus value={newName} onChangeText={setNewName} placeholder="First and last name" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border }]} returnKeyType="done" onSubmitEditing={saveClient} />
            <TextInput testID="new-client-phone" value={newPhone} onChangeText={setNewPhone} placeholder="Phone number (optional)" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, marginTop: 9 }]} returnKeyType="done" onSubmitEditing={saveClient} />
            {error ? <Text style={[styles.itemSubtitle, { color: colors.destructive }]}>{error}</Text> : null}
            <TouchableOpacity testID="import-contacts-open" onPress={() => router.push('/import-contacts')} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}><Text style={[styles.itemSubtitle, { color: colors.primary }]}>Import from your phone's contacts</Text></TouchableOpacity>
            <TouchableOpacity disabled={saving} testID="save-client" onPress={saveClient} style={[styles.saveButton, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save client'}</Text></TouchableOpacity>
          </View>
        )}
        <View style={styles.countLine}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>{FILTERS.find((f) => f.key === filter)?.key === 'all' ? 'All clients' : FILTERS.find((f) => f.key === filter)?.label}</Text><Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length}</Text></View>
        <View style={styles.clientList}>
          {filtered.map(({ client, status }) => (
            <TouchableOpacity key={client.id} testID={`client-${client.customerId}`} onPress={() => open(client.customerId)} style={[styles.clientRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {client.avatarUrl
                ? <Image source={{ uri: client.avatarUrl }} style={styles.avatar} />
                : <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.initials, { color: colors.primary }]}>{client.initials}</Text></View>}
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemTitle, { color: colors.foreground }]} numberOfLines={1}>{client.name}</Text>
                <Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]} numberOfLines={1}>{subtitle(client)}</Text>
              </View>
              {status !== 'regular' ? (
                <View style={[styles.statusPill, { backgroundColor: status === 'at_risk' ? colors.accent : status === 'inactive' ? colors.muted : colors.secondary }]}>
                  <Text style={[styles.statusText, { color: status === 'at_risk' ? colors.accentForeground : status === 'inactive' ? colors.mutedForeground : colors.secondaryForeground }]}>{STATUS_LABEL[status]}</Text>
                </View>
              ) : null}
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
          {filtered.length === 0 && <View style={[styles.empty, { backgroundColor: colors.card }]}><Feather name="users" size={22} color={colors.mutedForeground} /><Text style={[styles.itemTitle, { color: colors.foreground, marginTop: 10 }]}>No clients found</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>Try another search or filter, or add a new client.</Text></View>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 120 },
  detailContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 100 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, fontFamily: 'Inter_600SemiBold', marginTop: 4, letterSpacing: -0.5 },
  caption: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 7, marginBottom: 22 },
  addButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  searchBox: { height: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, fontSize: 13, fontFamily: 'Inter_400Regular', paddingVertical: 0 },
  countLine: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 26, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  count: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  clientList: { gap: 9 },
  clientRow: { minHeight: 70, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  itemTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  itemSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 16 },
  addPanel: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 14 },
  nameInput: { borderWidth: 1, borderRadius: 12, height: 46, paddingHorizontal: 12, fontSize: 13, fontFamily: 'Inter_400Regular' },
  saveButton: { height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  empty: { borderRadius: 16, minHeight: 150, justifyContent: 'center', alignItems: 'center', padding: 20 },
  filters: { paddingTop: 14 },
  filterChip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, minHeight: 34, justifyContent: 'center' },
  filterText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  statusPill: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 26 },
  backText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  largeAvatar: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  largeInitials: { fontSize: 23, fontFamily: 'Inter_600SemiBold' },
  detailName: { fontSize: 23, textAlign: 'center', fontFamily: 'Inter_600SemiBold', marginTop: 15 },
  detailSubtitle: { fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 5 },
  bookButton: { height: 50, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 22 },
  bookText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  historyCard: { borderWidth: 1, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 13 },
  historyIcon: { width: 38, height: 38, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  noteCard: { borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 12 },
});
