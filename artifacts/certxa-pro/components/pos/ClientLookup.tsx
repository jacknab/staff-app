/**
 * The tablet POS's client lookup (owner, 2026-11-19): a large window with its own on-screen keyboard, so the tablet's
 * keyboard never opens. Type a name or a phone number; the matching clients show above what is typed, and tapping one
 * puts them on the ticket. Nobody found: Add new client takes what was typed (a name, or a mobile number) to the new
 * client's form, which the same keyboard fills in.
 *
 * ENTER (owner, 2026-11-20): in the search it means a new client (nobody was picked from the matches), so it opens the
 * form with the typed name and the cursor in Mobile; in the form it goes from Name to Mobile, then adds the client.
 * "Numeric keyboard" swaps the letters for a number pad laid out like the POS keypad (the Mobile box opens it by itself).
 */
import { isValidUsPhone, refusedDigit, usPhoneProblem } from '@/lib/phoneCheck';
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
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
  const [numeric, setNumeric] = useState(false);
  // Why the last digit typed in Mobile was refused (lib/phoneCheck.ts).
  const [phoneNote, setPhoneNote] = useState('');
  const chooseField = (f: 'name' | 'phone') => { setField(f); setNumeric(f === 'phone'); };
  const results = useMemo(() => matchClients(clients, query), [clients, query]);

  const reset = () => { setMode('search'); setQuery(''); setName(''); setPhone(''); setField('name'); setNumeric(false); setPhoneNote(''); };
  const close = () => { reset(); onClose(); };
  const startNew = () => {
    // What was typed goes to the form: digits to Mobile, anything else to Name.
    const typed = query.trim();
    if (typed && digitsOnly(typed).length === typed.replace(/[\s()+-]/g, '').length) { setPhone(digitsOnly(typed).slice(0, 10)); setName(''); chooseField('name'); }
    else { setName(typed); setPhone(''); chooseField(typed ? 'phone' : 'name'); }
    setMode('new');
  };
  const enter = () => {
    if (mode === 'search') {
      if (query.trim()) startNew();
      return;
    }
    if (field === 'name') { chooseField('phone'); return; }
    if (canAdd) onAdd(name.trim(), phone);
  };
  // Typing: letters in Name start each word with a capital; Mobile takes digits only.
  const press = (key: string) => {
    if (key === 'ENTER') { enter(); return; }
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
      // As /nail's keypads (owner, 2026-11-20): a digit that can't lead to a real US number is refused, with why.
      else if (/^\d$/.test(key)) {
        const next = (phone + key).slice(0, 10);
        const refused = next === phone ? null : refusedDigit(next);
        setPhoneNote(refused ?? '');
        if (!refused) setPhone(next);
      }
      return;
    }
    if (key === '⌫') setName((v) => v.slice(0, -1));
    else if (key === 'CLEAR') setName('');
    else if (key === 'SPACE') setName((v) => (v && !v.endsWith(' ') ? `${v} ` : v));
    else setName((v) => (v + (v === '' || v.endsWith(' ') ? key.toUpperCase() : key.toLowerCase())).slice(0, 60));
  };
  const canAdd = !busy && (name.trim().length > 0 || isValidUsPhone(digitsOnly(phone))) && (phone === '' || isValidUsPhone(digitsOnly(phone)));

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
              <TouchableOpacity testID="client-lookup-numeric" onPress={() => setNumeric((n) => !n)} style={styles.linkButton}>
                <Text style={styles.linkText}>{numeric ? 'Letter keyboard' : 'Numeric keyboard'}</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="client-lookup-new-any" onPress={startNew} style={styles.newSmall}><Feather name="user-plus" size={20} color={look.violetDeep} /><Text style={styles.newSmallText}>New client</Text></TouchableOpacity>
            </View>
          </> : <>
            <View style={styles.formRow}>
              {(['name', 'phone'] as const).map((f) => (
                <TouchableOpacity key={f} testID={`client-lookup-field-${f}`} onPress={() => chooseField(f)} style={[styles.formField, field === f && styles.fieldOn]}>
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
              {phoneNote || (digitsOnly(phone).length === 10 && usPhoneProblem(digitsOnly(phone))) ? <Text style={styles.error} testID="client-lookup-phone-note">{phoneNote || `${usPhoneProblem(digitsOnly(phone))}.`}</Text> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity testID="tablet-pos-new-add" disabled={!canAdd} onPress={() => onAdd(name.trim(), phone)} style={[styles.addButton, styles.addWide, !canAdd && { opacity: 0.5 }]}>
                {busy ? <ActivityIndicator color="#FFFFFF" /> : <><Feather name="user-plus" size={22} color="#FFFFFF" /><Text style={styles.addText}>ADD CLIENT</Text></>}
              </TouchableOpacity>
            </View>
          </>}

          {/* The keyboard: letters, or the number pad. */}
          {numeric ? (
            <View style={styles.pad} testID="client-lookup-numpad">
              {PAD_KEYS.map((k) => (
                <TouchableOpacity key={k} testID={`kb-${k === '⌫' ? 'back' : k.toLowerCase()}`} accessibilityLabel={k === '⌫' ? 'Delete' : k} activeOpacity={0.7}
                  onPress={() => (k === 'CLOSE' ? close() : press(k))}
                  style={[styles.padKey, (k === '0' || k === 'ENTER') && styles.padWide, k === 'ENTER' && styles.enterKey, (k === 'CLEAR' || k === 'CLOSE') && styles.kbDark]}>
                  {k === '⌫' ? <Feather name="delete" size={28} color={look.heading} />
                    : <Text style={k === 'ENTER' ? styles.enterText : k.length > 1 ? styles.kbSmall : styles.padText}>{k}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
          <View style={styles.keyboard} testID="client-lookup-keyboard">
            {ROWS.map((row, r) => (
              <View key={row} style={styles.kbRow}>
                {r === 2 ? <View style={{ flex: 0.5 }} /> : null}
                {row.split('').map((k) => (
                  <TouchableOpacity key={k} testID={`kb-${k}`} onPress={() => press(k)} activeOpacity={0.7} style={styles.kbKey}><Text style={styles.kbText}>{k}</Text></TouchableOpacity>
                ))}
                {r === 2 ? <TouchableOpacity testID="kb-enter" onPress={() => press('ENTER')} style={[styles.kbKey, styles.enterKey, { flex: 1.5 }]}><Text style={styles.enterText}>ENTER</Text></TouchableOpacity> : null}
                {r === 3 ? <TouchableOpacity testID="kb-back" accessibilityLabel="Delete" onPress={() => press('⌫')} style={[styles.kbKey, styles.kbWide, styles.kbDark]}><Feather name="delete" size={28} color={look.heading} /></TouchableOpacity> : null}
              </View>
            ))}
            <View style={styles.kbRow}>
              <TouchableOpacity testID="kb-clear" onPress={() => press('CLEAR')} style={[styles.kbKey, styles.kbWide, styles.kbDark]}><Text style={styles.kbSmall}>CLEAR</Text></TouchableOpacity>
              <TouchableOpacity testID="kb-space" onPress={() => press('SPACE')} style={[styles.kbKey, { flex: 6 }]}><Text style={styles.kbSmall}>SPACE</Text></TouchableOpacity>
              <TouchableOpacity testID="kb-done" onPress={close} style={[styles.kbKey, styles.kbWide, styles.kbDark]}><Text style={styles.kbSmall}>CLOSE</Text></TouchableOpacity>
            </View>
          </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

// The number pad, laid out like the POS keypad (owner, 2026-11-20): 0 and ENTER are two keys wide.
const PAD_KEYS = ['7', '8', '9', '⌫', '4', '5', '6', 'CLEAR', '1', '2', '3', 'CLOSE', '0', 'ENTER'];
const PAD_KEY = 92;
const PAD_GAP = 10;

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
  // Raised square keys, as the POS keypad.
  pad: { width: PAD_KEY * 4 + PAD_GAP * 3, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: PAD_GAP },
  padKey: { width: PAD_KEY, height: PAD_KEY, borderRadius: 16, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 5, borderBottomColor: '#D8CEF6',
    alignItems: 'center', justifyContent: 'center', shadowColor: '#2E1065', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  padWide: { width: PAD_KEY * 2 + PAD_GAP },
  padText: { fontSize: 32, fontFamily: 'Inter_600SemiBold', color: look.heading },
  enterKey: { backgroundColor: look.violet, borderColor: look.violet, borderBottomColor: look.violetDeep },
  enterText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 1 },
  linkButton: { height: 64, paddingHorizontal: 10, justifyContent: 'center' },
  linkText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: look.violetDeep, textDecorationLine: 'underline' },
  kbKey: { flex: 1, height: 64, borderRadius: 14, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 4, borderBottomColor: '#D8CEF6',
    alignItems: 'center', justifyContent: 'center', ...depth },
  kbWide: { flex: 1.6 },
  kbDark: { backgroundColor: look.tile },
  kbText: { fontSize: 26, fontFamily: 'Inter_600SemiBold', color: look.heading },
  kbSmall: { fontSize: 16, fontFamily: 'Inter_700Bold', color: look.violetDeep, letterSpacing: 1 },
});
