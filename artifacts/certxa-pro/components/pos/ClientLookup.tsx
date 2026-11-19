/**
 * The tablet POS's client lookup (owner, 2026-11-19): a large window with its own on-screen keyboard, so the tablet's
 * keyboard never opens. Type a name or a phone number; the matching clients show above what is typed, and tapping one
 * puts them on the ticket. Nobody found: Add new client takes what was typed (a name, or a mobile number) to the new
 * client's form, which the same keyboard fills in.
 */
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { look } from '@/components/look/tokens';

type ClientRow = { customerId: number; name: string; phone: string; email?: string | null };
const digitsOnly = (v: string) => v.replace(/\D/g, '');
const prettyPhone = (v: string) => { const d = digitsOnly(v).slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : v; };
const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/** Name or phone: every typed word starts a word of the name ("av" finds Ava, "th" finds Thompson, not Davis), or the
 *  typed digits (3 or more) are in the phone. Names that start with what is typed come first. */
export function matchClients<T extends ClientRow>(clients: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const digits = digitsOnly(q);
  const words = q.split(/\s+/).filter(Boolean);
  const phoneQuery = digits.length >= 3 && digits.length === q.replace(/[\s()+-]/g, '').length;
  return clients
    .filter((c) => {
      if (phoneQuery) return digitsOnly(c.phone).includes(digits);
      const nameWords = c.name.toLowerCase().split(/\s+/);
      return words.every((w) => nameWords.some((n) => n.startsWith(w)));
    })
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name))
    .slice(0, 30);
}

export function ClientLookup<T extends ClientRow>({ visible, clients, busy, error, onPick, onAdd, onClose }: {
  visible: boolean; clients: T[]; busy: boolean; error: string;
  onPick: (client: T) => void; onAdd: (name: string, phone: string) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'search' | 'new'>('search');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [field, setField] = useState<'name' | 'phone'>('name');
  const results = useMemo(() => matchClients(clients, query), [clients, query]);

  const reset = () => { setMode('search'); setQuery(''); setName(''); setPhone(''); setField('name'); };
  const close = () => { reset(); onClose(); };
  const startNew = () => {
    // What was typed goes to the form: digits to Mobile, anything else to Name.
    const typed = query.trim();
    if (typed && digitsOnly(typed).length === typed.replace(/[\s()+-]/g, '').length) { setPhone(digitsOnly(typed).slice(0, 10)); setName(''); setField('name'); }
    else { setName(typed); setPhone(''); setField(typed ? 'phone' : 'name'); }
    setMode('new');
  };
  // Typing: letters in Name start each word with a capital; Mobile takes digits only.
  const press = (key: string) => {
    if (mode === 'search') {
      if (key === '⌫') setQuery((v) => v.slice(0, -1));
      else if (key === 'CLEAR') setQuery('');
      else if (key === 'SPACE') setQuery((v) => (v && !v.endsWith(' ') ? `${v} ` : v));
      else setQuery((v) => (v + key.toLowerCase()).slice(0, 40));
      return;
    }
    if (field === 'phone') {
      if (key === '⌫') setPhone((v) => v.slice(0, -1));
      else if (key === 'CLEAR') setPhone('');
      else if (/^\d$/.test(key)) setPhone((v) => (v + key).slice(0, 10));
      return;
    }
    if (key === '⌫') setName((v) => v.slice(0, -1));
    else if (key === 'CLEAR') setName('');
    else if (key === 'SPACE') setName((v) => (v && !v.endsWith(' ') ? `${v} ` : v));
    else setName((v) => (v + (v === '' || v.endsWith(' ') ? key.toUpperCase() : key.toLowerCase())).slice(0, 60));
  };
  const canAdd = !busy && (name.trim().length > 0 || digitsOnly(phone).length === 10) && (phone === '' || digitsOnly(phone).length === 10);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} supportedOrientations={['portrait', 'landscape']}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheet} testID="tablet-pos-client-sheet">
          <View style={styles.head}>
            {mode === 'new'
              ? <TouchableOpacity testID="client-lookup-back" accessibilityLabel="Back to search" onPress={() => setMode('search')} style={styles.round}><Feather name="arrow-left" size={24} color={look.heading} /></TouchableOpacity>
              : null}
            <Text style={styles.title}>{mode === 'new' ? 'New client' : 'Find a client'}</Text>
            <TouchableOpacity testID="client-lookup-close" accessibilityLabel="Close" onPress={close} style={styles.round}><Feather name="x" size={26} color={look.heading} /></TouchableOpacity>
          </View>

          {mode === 'search' ? <>
            {/* The matches, above what is typed. */}
            <ScrollView style={styles.results} contentContainerStyle={{ gap: 8 }} testID="client-lookup-results">
              {!query.trim() ? <Text style={styles.hint}>Type a name or a phone number.</Text>
                : results.length === 0 ? (
                  <View style={styles.noneRow}>
                    <Text style={styles.hint}>No client matches “{query.trim()}”.</Text>
                    <TouchableOpacity testID="client-lookup-new" onPress={startNew} style={styles.addButton}><Feather name="user-plus" size={20} color="#FFFFFF" /><Text style={styles.addText}>ADD NEW CLIENT</Text></TouchableOpacity>
                  </View>
                ) : results.map((c) => (
                  <TouchableOpacity key={c.customerId} testID={`tablet-pos-client-${c.customerId}`} onPress={() => { reset(); onPick(c); }} style={styles.result}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{c.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')}</Text></View>
                    <Text style={styles.resultName} numberOfLines={1}>{c.name}</Text>
                    <Text style={styles.resultPhone}>{c.phone ? prettyPhone(c.phone) : c.email ?? ''}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <View style={styles.inputRow}>
              <View style={[styles.field, styles.fieldOn, { flex: 1 }]} testID="tablet-pos-client-search">
                <Feather name="search" size={22} color={look.subtle} />
                <Text style={[styles.fieldText, !query && styles.placeholder]} numberOfLines={1}>{query || 'Name or phone number'}</Text>
                <View style={styles.caret} />
              </View>
              <TouchableOpacity testID="client-lookup-new-any" onPress={startNew} style={styles.newSmall}><Feather name="user-plus" size={20} color={look.violetDeep} /><Text style={styles.newSmallText}>New client</Text></TouchableOpacity>
            </View>
          </> : <>
            <View style={styles.formRow}>
              {(['name', 'phone'] as const).map((f) => (
                <TouchableOpacity key={f} testID={`client-lookup-field-${f}`} onPress={() => setField(f)} style={[styles.formField, field === f && styles.fieldOn]}>
                  <Text style={styles.formLabel}>{f === 'name' ? 'NAME' : 'MOBILE'}</Text>
                  <View style={styles.formValueRow}>
                    <Text style={[styles.fieldText, !(f === 'name' ? name : phone) && styles.placeholder]} numberOfLines={1}>
                      {f === 'name' ? name || 'First and last name' : phone ? prettyPhone(phone) : '10-digit mobile'}
                    </Text>
                    {field === f ? <View style={styles.caret} /> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flex: 1 }}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity testID="tablet-pos-new-add" disabled={!canAdd} onPress={() => onAdd(name.trim(), phone)} style={[styles.addButton, styles.addWide, !canAdd && { opacity: 0.5 }]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="user-plus" size={22} color="#FFFFFF" /><Text style={styles.addText}>ADD CLIENT</Text></>}
              </TouchableOpacity>
            </View>
          </>}

          {/* The keyboard. */}
          <View style={styles.keyboard} testID="client-lookup-keyboard">
            {ROWS.map((row, r) => (
              <View key={row} style={styles.kbRow}>
                {r === 2 ? <View style={{ flex: 0.5 }} /> : null}
                {row.split('').map((k) => (
                  <TouchableOpacity key={k} testID={`kb-${k}`} onPress={() => press(k)} activeOpacity={0.7} style={styles.kbKey}><Text style={styles.kbText}>{k}</Text></TouchableOpacity>
                ))}
                {r === 2 ? <View style={{ flex: 0.5 }} /> : null}
                {r === 3 ? <TouchableOpacity testID="kb-back" accessibilityLabel="Delete" onPress={() => press('⌫')} style={[styles.kbKey, styles.kbWide, styles.kbDark]}><Feather name="delete" size={28} color={look.heading} /></TouchableOpacity> : null}
              </View>
            ))}
            <View style={styles.kbRow}>
              <TouchableOpacity testID="kb-clear" onPress={() => press('CLEAR')} style={[styles.kbKey, styles.kbWide, styles.kbDark]}><Text style={styles.kbSmall}>CLEAR</Text></TouchableOpacity>
              <TouchableOpacity testID="kb-space" onPress={() => press('SPACE')} style={[styles.kbKey, { flex: 6 }]}><Text style={styles.kbSmall}>SPACE</Text></TouchableOpacity>
              <TouchableOpacity testID="kb-done" onPress={close} style={[styles.kbKey, styles.kbWide, styles.kbDark]}><Text style={styles.kbSmall}>CLOSE</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const depth = { shadowColor: '#2E1065', shadowOpacity: 0.16, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 3 };
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 12, 34, 0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  sheet: { width: '96%', maxWidth: 1200, flex: 1, backgroundColor: look.pageTop, borderRadius: 28, padding: 18, gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, fontSize: 26, fontFamily: 'Inter_700Bold', color: look.heading },
  round: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: look.card },
  results: { flex: 1, minHeight: 0 },
  hint: { fontSize: 18, fontFamily: 'Inter_500Medium', color: look.subtle, paddingVertical: 8 },
  noneRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  result: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, borderRadius: 16, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, paddingHorizontal: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  resultName: { flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold', color: look.heading },
  resultPhone: { fontSize: 18, fontFamily: 'Inter_500Medium', color: look.subtle },
  inputRow: { flexDirection: 'row', gap: 10 },
  field: { height: 64, borderRadius: 16, borderWidth: 2, borderColor: look.cardBorder, backgroundColor: look.card, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  fieldOn: { borderColor: look.violet },
  fieldText: { flexShrink: 1, fontSize: 24, fontFamily: 'Inter_600SemiBold', color: look.heading },
  placeholder: { color: look.subtle, fontFamily: 'Inter_400Regular' },
  caret: { width: 2, height: 30, backgroundColor: look.violet },
  newSmall: { height: 64, paddingHorizontal: 16, borderRadius: 16, backgroundColor: look.tile, borderWidth: 1, borderColor: look.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 },
  newSmallText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  formRow: { flexDirection: 'row', gap: 12 },
  formField: { flex: 1, minHeight: 84, borderRadius: 16, borderWidth: 2, borderColor: look.cardBorder, backgroundColor: look.card, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', gap: 4 },
  formLabel: { fontSize: 13, letterSpacing: 1, fontFamily: 'Inter_700Bold', color: look.subtle },
  formValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  error: { color: '#B42318', fontSize: 16, fontFamily: 'Inter_500Medium', marginBottom: 8 },
  addButton: { height: 56, paddingHorizontal: 20, borderRadius: 16, backgroundColor: look.violet, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, ...depth },
  addWide: { alignSelf: 'flex-start', minWidth: 260 },
  addText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.5 },
  keyboard: { gap: 8 },
  kbRow: { flexDirection: 'row', gap: 8 },
  kbKey: { flex: 1, height: 64, borderRadius: 14, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 4, borderBottomColor: '#D8CEF6',
    alignItems: 'center', justifyContent: 'center', ...depth },
  kbWide: { flex: 1.6 },
  kbDark: { backgroundColor: look.tile },
  kbText: { fontSize: 26, fontFamily: 'Inter_600SemiBold', color: look.heading },
  kbSmall: { fontSize: 16, fontFamily: 'Inter_700Bold', color: look.violetDeep, letterSpacing: 1 },
});
