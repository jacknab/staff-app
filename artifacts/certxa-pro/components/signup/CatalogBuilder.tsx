/**
 * The sign-up's catalog builder (owner, 2026-11-20): one service at a time, on a keypad like the POS. The pro types the
 * whole-dollar price and taps ENTER (ENTER on an empty price = they don't offer it, so on to the next service), then
 * the minutes, already filled in with the usual length (ENTER keeps it, typing replaces it). PREV goes back one screen,
 * NEXT CATEGORY skips the rest of a category, EXIT keeps what was entered and moves on with the sign-up. The services
 * are each category's common ones (GET /api/public/service-catalog/:type). On a tablet the category's list fills in
 * beside the keypad.
 */
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/AppText';
import { look } from '@/components/look/tokens';

export type CatalogCategory = { name: string; services: { name: string; duration: number }[] };
/** What the pro entered, by `${category}|${service}`. */
export type CatalogEntries = Record<string, { price: number; duration: number }>;

export const entryKey = (category: string, service: string) => `${category}|${service}`;

const KEYS = ['7', '8', '9', '⌫', '4', '5', '6', 'EXIT', '1', '2', '3', 'NEXT CATEGORY', 'PREV', '0', 'ENTER'];
const KEY_GAP = 10;
const MAX_PRICE = 9999;

export function CatalogBuilder({ categories, entries, onChange, onDone, onBack }: {
  categories: CatalogCategory[];
  entries: CatalogEntries;
  onChange: (entries: CatalogEntries) => void;
  /** EXIT, or the last service answered: on with the sign-up. */
  onDone: () => void;
  /** PREV on the very first service: back to the categories. */
  onBack: () => void;
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const [cat, setCat] = useState(0);
  const [svc, setSvc] = useState(0);
  const [phase, setPhase] = useState<'price' | 'minutes'>('price');
  const firstKey = categories[0]?.services[0] ? entryKey(categories[0].name, categories[0].services[0].name) : '';
  // The number on screen. `fresh`: what is shown was filled in for them, so the first digit typed replaces it.
  const [value, setValue] = useState(() => (entries[firstKey] ? String(entries[firstKey].price) : ''));
  const [fresh, setFresh] = useState(true);
  const [note, setNote] = useState('');
  const [keyW, setKeyW] = useState(0);

  const category = categories[cat];
  const service = category?.services[svc];
  if (!category || !service) return null;
  const key = entryKey(category.name, service.name);

  // Show a service's price screen (with its price if it has one) or its minutes screen.
  const show = (c: number, s: number, p: 'price' | 'minutes') => {
    const cc = categories[c]; const ss = cc.services[s]; const e = entries[entryKey(cc.name, ss.name)];
    setCat(c); setSvc(s); setPhase(p); setFresh(true); setNote('');
    setValue(p === 'price' ? (e ? String(e.price) : '') : String(e?.duration ?? ss.duration));
  };
  const nextService = (from = { c: cat, s: svc }) => {
    if (from.s + 1 < categories[from.c].services.length) return show(from.c, from.s + 1, 'price');
    if (from.c + 1 < categories.length) return show(from.c + 1, 0, 'price');
    onDone();
  };
  const set = (next: CatalogEntries) => onChange(next);

  const enter = () => {
    const n = Number(value) || 0;
    if (phase === 'price') {
      if (!value || n === 0) {
        // Not offered: drop anything entered for it before.
        if (entries[key]) { const { [key]: _gone, ...rest } = entries; set(rest); }
        return nextService();
      }
      set({ ...entries, [key]: { price: n, duration: entries[key]?.duration ?? service.duration } });
      setPhase('minutes'); setValue(String(entries[key]?.duration ?? service.duration)); setFresh(true); setNote('');
      return;
    }
    if (n < 5 || n > 600) { setNote('Minutes must be between 5 and 600.'); return; }
    set({ ...entries, [key]: { price: entries[key]?.price ?? 1, duration: n } });
    nextService();
  };
  const prev = () => {
    if (phase === 'minutes') return show(cat, svc, 'price');
    let c = cat; let s = svc - 1;
    if (s < 0) { c -= 1; if (c < 0) return onBack(); s = categories[c].services.length - 1; }
    const e = entries[entryKey(categories[c].name, categories[c].services[s].name)];
    show(c, s, e ? 'minutes' : 'price');
  };
  const press = (k: string) => {
    if (k === 'ENTER') return enter();
    if (k === 'PREV') return prev();
    if (k === 'EXIT') return onDone();
    if (k === 'NEXT CATEGORY') return cat + 1 < categories.length ? show(cat + 1, 0, 'price') : onDone();
    setNote('');
    if (k === '⌫') { setFresh(false); setValue((v) => (fresh ? '' : v.slice(0, -1))); return; }
    const base = fresh ? '' : value;
    const next = (base + k).replace(/^0+/, '');
    const limit = phase === 'price' ? MAX_PRICE : 600;
    if (Number(next) > limit) return;
    setFresh(false); setValue(next);
  };

  const shown = phase === 'price' ? (value ? `$${value}` : '$') : value ? `${value} min` : 'min';
  const keypad = (
    <View style={[styles.pad, wide && { width: 460 }]}>
      <View style={styles.header} testID="catalog-builder-title">
        <Text style={styles.headerText} numberOfLines={2}>{service.name.toUpperCase()} - {phase === 'price' ? 'AMOUNT' : 'MINUTES'}</Text>
        <Text style={styles.headerSub}>{category.name} · {svc + 1} of {category.services.length}</Text>
      </View>
      <View style={styles.display}>
        <Text testID="catalog-builder-value" style={[styles.displayText, !value && { color: '#B9B3D6' }]} numberOfLines={1} adjustsFontSizeToFit>{shown}</Text>
        <Text style={[styles.hint, note ? { color: '#B42318' } : null]}>{note || (phase === 'price' ? "Don't offer it? Tap ENTER to skip." : 'Usual length. Tap ENTER to keep it.')}</Text>
      </View>
      <View style={styles.keys} onLayout={(e) => setKeyW(Math.floor((e.nativeEvent.layout.width - 3 * KEY_GAP) / 4))}>
        {KEYS.map((k) => {
          const action = k === 'EXIT' || k === 'NEXT CATEGORY';
          return (
            <TouchableOpacity key={k} testID={`catalog-key-${k === '⌫' ? 'back' : k.toLowerCase().replace(' ', '-')}`} onPress={() => press(k)} activeOpacity={0.7}
              accessibilityLabel={k === '⌫' ? 'Delete' : k}
              style={[styles.key, keyW > 0 && { width: k === 'ENTER' ? keyW * 2 + KEY_GAP : keyW, height: Math.round(keyW * 0.86) }, action && styles.keyAction, k === 'ENTER' && styles.keyEnter]}>
              {k === '⌫' ? <Feather name="delete" size={28} color={look.heading} />
                : <Text style={[styles.keyText, k.length > 1 && styles.keyWord, action && styles.keyActionText, k === 'ENTER' && styles.keyEnterText]}>{k}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
  if (!wide) return keypad;
  // Tablet: the category's services with what was entered, beside the keypad.
  return (
    <View style={styles.wide}>
      <ScrollView style={styles.list} contentContainerStyle={{ padding: 18, gap: 4 }}>
        <Text style={styles.listTitle}>{category.name}</Text>
        {category.services.map((s, i) => {
          const e = entries[entryKey(category.name, s.name)];
          return (
            <TouchableOpacity key={s.name} onPress={() => show(cat, i, 'price')} style={[styles.listRow, i === svc && styles.listRowOn]}>
              <Text style={styles.listName} numberOfLines={1}>{s.name}</Text>
              <Text style={styles.listValue}>{e ? `$${e.price} · ${e.duration} min` : '—'}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {keypad}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { flex: 1, alignSelf: 'center', width: '100%', gap: 12 },
  header: { backgroundColor: look.violet, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16, gap: 4 },
  headerText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.3 },
  headerSub: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#E4D9FD' },
  display: { flex: 1, minHeight: 110, maxHeight: 190, borderRadius: 18, backgroundColor: '#F7F5FE', borderWidth: 1, borderColor: look.cardBorder, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 6 },
  displayText: { fontSize: 64, fontFamily: 'Inter_700Bold', color: look.heading },
  hint: { fontSize: 15, fontFamily: 'Inter_500Medium', color: look.subtle, textAlign: 'center' },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: KEY_GAP },
  // Raised keys, as the POS keypad.
  key: { width: '22.6%', height: 76, borderRadius: 16, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 5, borderBottomColor: '#D8CEF6',
    alignItems: 'center', justifyContent: 'center', shadowColor: '#2E1065', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  keyText: { fontSize: 32, fontFamily: 'Inter_600SemiBold', color: look.heading },
  keyWord: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  keyAction: { backgroundColor: look.tile },
  keyActionText: { fontSize: 15, color: look.violetDeep, letterSpacing: 0.4 },
  keyEnter: { backgroundColor: look.violet, borderColor: look.violet, borderBottomColor: look.violetDeep },
  keyEnterText: { fontSize: 22, color: '#FFFFFF', letterSpacing: 0.6 },
  wide: { flex: 1, flexDirection: 'row', gap: 20 },
  list: { flex: 1, backgroundColor: look.card, borderRadius: 18, borderWidth: 1, borderColor: look.cardBorder },
  listTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: look.heading, marginBottom: 8 },
  listRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 48, paddingHorizontal: 12, borderRadius: 12 },
  listRowOn: { backgroundColor: look.tile },
  listName: { flex: 1, fontSize: 17, fontFamily: 'Inter_500Medium', color: look.heading },
  listValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.violetDeep },
});
