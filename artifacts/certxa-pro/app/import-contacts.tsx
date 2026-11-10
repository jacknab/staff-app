/**
 * Import from your phone's contacts (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): pick the people who are
 * clients and add them, with their phone number and e-mail. Contacts already in Clients (same number) are left out.
 * Nothing leaves the phone except the people chosen.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { look } from '@/components/look/tokens';
type Person = { id: string; name: string; phone: string; email: string | null };
const digits = (p: string) => p.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

export default function ImportContactsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clients, refresh } = useBookingData();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      const perm = await Contacts.requestPermissionsAsync();
      if (perm.status !== 'granted') { setDenied(true); setPeople([]); return; }
      const { data } = await Contacts.getContactsAsync({ fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails, Contacts.Fields.Name] });
      const known = new Set(clients.map((c) => digits(c.phone ?? '')).filter((d) => d.length === 10));
      const list: Person[] = [];
      for (const c of data) {
        const phone = c.phoneNumbers?.map((p) => digits(p.number ?? '')).find((d) => d.length === 10);
        if (!phone || known.has(phone) || !c.name?.trim()) continue;
        list.push({ id: c.id ?? phone, name: c.name.trim(), phone, email: c.emails?.[0]?.email ?? null });
      }
      list.sort((a, b) => a.name.localeCompare(b.name));
      setPeople(list);
    })().catch(() => setPeople([]));
  }, [clients]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (people ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q.replace(/\D/g, '') || '\u0000'));
  }, [people, search]);
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const importNow = async () => {
    const chosen = (people ?? []).filter((p) => picked.has(p.id));
    if (!chosen.length) return;
    setImporting(true);
    let added = 0, failed = 0;
    for (const p of chosen) {
      try { await api.post('/api/customers', { name: p.name, phone: p.phone, ...(p.email ? { email: p.email } : {}) }); added++; }
      catch { failed++; }
    }
    await refresh();
    setImporting(false);
    Alert.alert('Clients added', `${added} added${failed ? ` · ${failed} could not be added (they may already be a client)` : ''}.`, [{ text: 'OK', onPress: () => router.back() }]);
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="import-contacts">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="import-contacts" style={[styles.navTitle, { color: colors.foreground }]}>Import contacts</HelpTitle>
        <View style={styles.navSide} />
      </View>
      {people == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
        : denied ? (
          <View style={styles.center}>
            <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center' }]}>Certxa Pro needs access to your contacts to import them.</Text>
            <TouchableOpacity onPress={() => void Linking.openSettings()} style={[styles.button, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}>
              <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={{ paddingHorizontal: 20 }}>
              <TextInput value={search} onChangeText={setSearch} placeholder="Search contacts" placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} testID="import-search" />
              <Text style={[styles.muted, { color: colors.mutedForeground, marginTop: 8 }]}>
                {people.length === 0 ? 'Everyone with a phone number is already a client.' : 'Tap the people who are your clients. Contacts already in Clients aren\'t shown.'}
              </Text>
            </View>
            <FlatList data={shown} keyExtractor={(p) => p.id} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, paddingTop: 8 }}
              renderItem={({ item }) => {
                const on = picked.has(item.id);
                return (
                  <TouchableOpacity onPress={() => toggle(item.id)} style={[styles.row, { borderBottomColor: colors.border }]} testID={`import-contact-${item.id}`}>
                    <Feather name={on ? 'check-square' : 'square'} size={20} color={on ? colors.primary : colors.mutedForeground} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{item.name}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>({item.phone.slice(0, 3)}) {item.phone.slice(3, 6)}-{item.phone.slice(6)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }} />
            <View style={[styles.footer, { paddingBottom: insets.bottom + 14, backgroundColor: colors.background, borderTopColor: colors.border }]}>
              <TouchableOpacity onPress={() => void importNow()} disabled={!picked.size || importing} testID="import-go"
                style={[styles.button, { backgroundColor: picked.size ? colors.primary : colors.muted }]}>
                {importing ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: picked.size ? colors.primaryForeground : colors.mutedForeground }]}>
                  {picked.size ? `Add ${picked.size} ${picked.size === 1 ? 'client' : 'clients'}` : 'Choose people'}</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  center: { padding: 24, gap: 16, alignItems: 'center' },
  muted: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  input: { borderWidth: 1, borderRadius: 14, height: 48, paddingHorizontal: 14, fontSize: 17, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
});
