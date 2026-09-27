import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';

export default function ClientsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clients, addClient } = useBookingData();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<(typeof clients)[number] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const filtered = useMemo(() => clients.filter((client) => client.name.toLowerCase().includes(search.toLowerCase())), [clients, search]);

  const saveClient = async () => {
    const trimmed = newName.trim();
    if (!trimmed || saving) return;
    const initials = trimmed.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
    setSaving(true); setError('');
    try {
      const client = await addClient({ name: trimmed, initials: initials || 'NC', phone: newPhone.replace(/\D/g, ''), lastVisit: 'New client', service: 'No visits yet', visits: 0, spend: '$0', color: 'green' });
      setNewName(''); setNewPhone(''); setAdding(false); setSelected(client);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save client.'); }
    finally { setSaving(false); }
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} behavior="padding" keyboardVerticalOffset={0}>
      {selected ? (
        <ScrollView contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity testID="client-back" onPress={() => { setSelected(null); setAdding(false); }} style={styles.backButton}><Feather name="arrow-left" size={20} color={colors.foreground} /><Text style={[styles.backText, { color: colors.foreground }]}>All clients</Text></TouchableOpacity>
          <View style={[styles.largeAvatar, { backgroundColor: colors.secondary }]}><Text style={[styles.largeInitials, { color: colors.primary }]}>{selected.initials}</Text></View>
          <Text style={[styles.detailName, { color: colors.foreground }]}>{selected.name}</Text>
          <Text style={[styles.detailSubtitle, { color: colors.mutedForeground }]}>{selected.visits} visits · {selected.spend} lifetime spend</Text>
          <TouchableOpacity testID="book-client" style={[styles.bookButton, { backgroundColor: colors.primary }]} onPress={() => router.push({ pathname: '/booking', params: { phone: selected.phone } })}><Feather name="calendar" size={17} color={colors.primaryForeground} /><Text style={[styles.bookText, { color: colors.primaryForeground }]}>Book appointment</Text></TouchableOpacity>
          <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 31 }]}>Recent activity</Text>
          <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.historyIcon, { backgroundColor: colors.secondary }]}><Feather name="star" size={16} color={colors.primary} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{selected.service}</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>{selected.lastVisit}</Text></View>
          </View>
          <View style={[styles.noteCard, { backgroundColor: colors.accent }]}><Feather name="file-text" size={16} color={colors.accentForeground} /><View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.accentForeground }]}>Client notes</Text><Text style={[styles.itemSubtitle, { color: colors.accentForeground }]}>{selected.notes || 'No client notes saved.'}</Text></View></View>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.topLine}>
            <View><Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR PEOPLE</Text><Text style={[styles.title, { color: colors.foreground }]}>Clients</Text></View>
            <TouchableOpacity testID="add-client" onPress={() => { setAdding((value) => !value); setSelected(null); }} style={[styles.addButton, { backgroundColor: colors.primary }]}><Feather name={adding ? 'x' : 'plus'} size={21} color={colors.primaryForeground} /></TouchableOpacity>
          </View>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>Keep every client feeling remembered.</Text>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Feather name="search" size={17} color={colors.mutedForeground} /><TextInput testID="client-search" value={search} onChangeText={setSearch} placeholder="Search clients" placeholderTextColor={colors.mutedForeground} style={[styles.searchInput, { color: colors.foreground }]} returnKeyType="search" /></View>
          {adding && (
            <View style={[styles.addPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.itemTitle, { color: colors.foreground, marginBottom: 10 }]}>Add a client</Text>
              <TextInput testID="new-client-name" autoFocus value={newName} onChangeText={setNewName} placeholder="First and last name" placeholderTextColor={colors.mutedForeground} style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border }]} returnKeyType="done" onSubmitEditing={saveClient} />
              <TextInput testID="new-client-phone" value={newPhone} onChangeText={setNewPhone} placeholder="Phone number (optional)" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" style={[styles.nameInput, { color: colors.foreground, borderColor: colors.border, marginTop: 9 }]} returnKeyType="done" onSubmitEditing={saveClient} />
              {error ? <Text style={[styles.itemSubtitle, { color: colors.destructive }]}>{error}</Text> : null}
              <TouchableOpacity disabled={saving} testID="save-client" onPress={saveClient} style={[styles.saveButton, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save client'}</Text></TouchableOpacity>
            </View>
          )}
          <View style={styles.countLine}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>All clients</Text><Text style={[styles.count, { color: colors.mutedForeground }]}>{filtered.length}</Text></View>
          <View style={styles.clientList}>
            {filtered.map((client) => (
              <TouchableOpacity key={client.name} testID={`client-${client.initials}`} onPress={() => setSelected(client)} style={[styles.clientRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.avatar, { backgroundColor: client.color === 'green' ? colors.secondary : client.color === 'sand' ? colors.accent : colors.muted }]}><Text style={[styles.initials, { color: client.color === 'sand' ? colors.accentForeground : colors.primary }]}>{client.initials}</Text></View>
                <View style={{ flex: 1 }}><Text style={[styles.itemTitle, { color: colors.foreground }]}>{client.name}</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>{client.lastVisit} · {client.service}</Text></View>
                <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
            {filtered.length === 0 && <View style={[styles.empty, { backgroundColor: colors.card }]}><Feather name="users" size={22} color={colors.mutedForeground} /><Text style={[styles.itemTitle, { color: colors.foreground, marginTop: 10 }]}>No clients found</Text><Text style={[styles.itemSubtitle, { color: colors.mutedForeground }]}>Try another name or add a new client.</Text></View>}
          </View>
        </ScrollView>
      )}
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
