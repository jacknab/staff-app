/**
 * Services › Add from list (owner, 2026-11-20): the sign-up's catalog builder for an account that already has a menu.
 * The business type's categories as tiles, then each category's common services on the keypad (price, then minutes;
 * ENTER on an empty price skips it). Services already on the menu are left out. What was priced is added through the
 * usual endpoints (POST /api/service-categories when the category is new, POST /api/services), so each goes on the
 * pro's calendar and gets its translation like any service made by hand.
 */
import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Alert } from '@/lib/appAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { HelpTitle } from '@/components/HelpTitle';
import { SelectField } from '@/components/SelectField';
import { AppBackground } from '@/components/look/AppBackground';
import { look } from '@/components/look/tokens';
import { CatalogBuilder, entryKey, type CatalogCategory, type CatalogEntries } from '@/components/signup/CatalogBuilder';
import { CategoryTiles } from '@/components/signup/CategoryTiles';
import { CATALOG_TYPE, loadCatalog } from '@/lib/serviceCatalog';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';

type Category = { id: number; name: string };

export default function AddFromListScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useBookingData();
  // The list to pick from: the business's own type, or one chosen here when its type has no list.
  const [listType, setListType] = useState<string | null>(null);
  const [needsType, setNeedsType] = useState(false);
  const [have, setHave] = useState<{ names: Set<string>; categories: Category[] } | null>(null);
  const [catalog, setCatalog] = useState<CatalogCategory[] | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [entries, setEntries] = useState<CatalogEntries>({});
  const [step, setStep] = useState<'tiles' | 'prices'>('tiles');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [stores, services, categories] = await Promise.all([
          api.get<{ category?: string | null }[]>('/api/stores'),
          api.get<{ name: string }[]>('/api/services'),
          api.get<Category[]>('/api/service-categories'),
        ]);
        setHave({ names: new Set((Array.isArray(services) ? services : []).map((s) => s.name.trim().toLowerCase())), categories: Array.isArray(categories) ? categories : [] });
        const type = String((Array.isArray(stores) ? stores[0]?.category : '') ?? '');
        if (CATALOG_TYPE[type]) setListType(type); else setNeedsType(true);
      } catch { setError('The list could not be loaded. Check your connection and try again.'); }
    })();
  }, []);
  useEffect(() => {
    if (!listType) return;
    setCatalog(null); setChosen([]); setEntries({});
    loadCatalog(listType).then(setCatalog).catch(() => setError('The list could not be loaded. Check your connection and try again.'));
  }, [listType]);

  // Only services not on the menu yet; a category with none left isn't offered.
  const open = (catalog ?? [])
    .map((c) => ({ ...c, services: c.services.filter((s) => !have?.names.has(s.name.trim().toLowerCase())) }))
    .filter((c) => c.services.length > 0);
  const picked = open.filter((c) => chosen.includes(c.name));

  const finish = async () => {
    const toAdd = picked.map((c) => ({ category: c.name, services: c.services.flatMap((s) => { const e = entries[entryKey(c.name, s.name)]; return e ? [{ name: s.name, ...e }] : []; }) }))
      .filter((c) => c.services.length > 0);
    if (toAdd.length === 0) { router.back(); return; }
    setSaving(true); setError('');
    let added = 0;
    try {
      const cats = [...(have?.categories ?? [])];
      for (const group of toAdd) {
        let cat = cats.find((c) => c.name.trim().toLowerCase() === group.category.toLowerCase());
        if (!cat) {
          cat = await api.post<Category>('/api/service-categories', { name: group.category, sortOrder: cats.length });
          cats.push(cat);
        }
        for (const s of group.services) {
          await api.post('/api/services', { name: s.name, duration: s.duration, price: s.price.toFixed(2), categoryId: cat.id, category: cat.name });
          added += 1;
        }
      }
      await refresh().catch(() => undefined);
      Alert.alert('Services added', `${added} ${added === 1 ? 'service was' : 'services were'} added to your menu.`, [{ text: 'OK', onPress: () => router.back() }]);
    } catch {
      setError(added > 0 ? `${added} added, then the rest could not be saved. Check your connection and try again.` : 'The services could not be saved. Check your connection and try again.');
      setStep('tiles');
    } finally { setSaving(false); }
  };

  const topInset = Platform.OS === 'web' ? 24 : insets.top;
  const nav = (
    <View style={styles.nav}>
      <TouchableOpacity onPress={() => (step === 'prices' ? setStep('tiles') : router.back())} style={styles.navSide} accessibilityLabel="Back" testID="add-from-list-back">
        <Feather name="arrow-left" size={24} color={colors.foreground} />
      </TouchableOpacity>
      <HelpTitle help="add-from-list" style={[styles.navTitle, { color: colors.foreground }]}>Add from list</HelpTitle>
      <View style={styles.navSide} />
    </View>
  );

  if (step === 'prices' && picked.length > 0) {
    return (
      <View style={[styles.root, { paddingTop: topInset, paddingBottom: insets.bottom + 12 }]} testID="add-from-list">
        <AppBackground />
        {nav}
        <View style={{ flex: 1, paddingHorizontal: 18, marginTop: 8 }}>
          {saving ? <ActivityIndicator style={{ marginTop: 80 }} color={colors.mutedForeground} /> : (
            <CatalogBuilder key={chosen.join('|')} categories={picked} entries={entries} onChange={setEntries}
              onDone={() => void finish()} onBack={() => setStep('tiles')} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: topInset }]} testID="add-from-list">
      <AppBackground />
      {nav}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}>
        <Text style={styles.title}>What do you offer?</Text>
        <Text style={styles.hint}>Tap every kind of service you do. Next, you'll price each one. Services already on your menu aren't shown.</Text>
        {needsType ? (
          <View style={{ marginTop: 18 }}>
            <SelectField testID="add-from-list-type" title="Which list?" placeholder="Choose a list" value={listType}
              options={Object.keys(CATALOG_TYPE).map((t) => ({ value: t, label: t }))} onChange={setListType} />
          </View>
        ) : null}
        {listType && (catalog == null || have == null) && !error ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.mutedForeground} /> : null}
        {catalog && have ? (open.length > 0
          ? <CategoryTiles names={open.map((c) => c.name)} chosen={chosen} onChange={setChosen} />
          : <Text style={[styles.hint, { marginTop: 30, textAlign: 'center' }]}>Every service on this list is already on your menu.</Text>) : null}
        {error ? <Text style={[styles.hint, { color: colors.destructive, marginTop: 16 }]}>{error}</Text> : null}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <TouchableOpacity disabled={chosen.length === 0} onPress={() => setStep('prices')} testID="add-from-list-next"
          style={[styles.button, { backgroundColor: chosen.length ? look.violet : colors.muted }]}>
          <Text style={[styles.buttonText, { color: chosen.length ? '#FFFFFF' : colors.mutedForeground }]}>Next</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: look.pageTop },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 20, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 22, paddingTop: 8 },
  title: { fontSize: 30, lineHeight: 36, letterSpacing: -0.6, fontFamily: 'Inter_600SemiBold', color: look.heading },
  hint: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 10 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 22, paddingTop: 12, backgroundColor: look.pageBottom, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: look.cardBorder },
  button: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 19, fontFamily: 'Inter_600SemiBold' },
});
