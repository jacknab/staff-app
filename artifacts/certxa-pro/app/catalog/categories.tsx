/**
 * Catalog → Categories: the groups services are listed under, as on the Certxa website (name, calendar colour,
 * photo, shown on the booking site, order). Removing a category leaves its services as "Uncategorized".
 */
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CatalogScreen, Empty, ErrorLine, Field, Label, List, Loading, PhotoField, QuietButton, Row, SaveButton, Toggle, errorText, pickImageDataUri } from '@/components/catalog/CatalogKit';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

type Category = { id: number; name: string; color: string | null; imageUrl: string | null; hiddenFromPublic: boolean; sortOrder: number };
type Draft = { id: number; name: string; color: string | null; imageUrl: string | null; hiddenFromPublic: boolean };

// The calendar card colours the website offers (components/services/CategoryManager.tsx).
const PALETTE: Array<[string, string]> = [
  ['lavender', '#c4b5fd'], ['periwinkle', '#a5b4fc'], ['sky', '#93c5fd'], ['teal', '#5eead4'], ['mint', '#6ee7b7'], ['lemon', '#fde047'], ['peach', '#fdba74'],
];

export default function CategoriesScreen() {
  const router = useRouter();
  const colors = useColors();
  const [rows, setRows] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const list = await api.get<any[]>('/api/service-categories');
      setRows((Array.isArray(list) ? list : []).map((row) => ({
        id: Number(row.id), name: String(row.name ?? ''), color: row.color ?? null, imageUrl: row.imageUrl ?? null,
        hiddenFromPublic: Boolean(row.hiddenFromPublic), sortOrder: Number(row.sortOrder) || 0,
      })).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your categories.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    if (!name) return setError('Enter the name of the category.');
    setSaving(true); setError('');
    try {
      const body = { name, color: draft.color, imageUrl: draft.imageUrl, hiddenFromPublic: draft.hiddenFromPublic };
      if (draft.id > 0) await api.patch(`/api/service-categories/${draft.id}`, body);
      else await api.post('/api/service-categories', { ...body, sortOrder: rows.length });
      setDraft(null);
      await load();
    } catch (cause) { setError(errorText(cause, 'Could not save the category.')); }
    finally { setSaving(false); }
  };

  const remove = (row: Category) => {
    Alert.alert('Remove this category?', `Services in ${row.name} are kept and shown as Uncategorized.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.del(`/api/service-categories/${row.id}`); setDraft(null); await load(); }
        catch (cause) { setError(errorText(cause, 'Could not remove the category.')); }
      } },
    ]);
  };

  const move = async (index: number, by: -1 | 1) => {
    const next = [...rows];
    const [moved] = next.splice(index, 1);
    next.splice(index + by, 0, moved);
    setRows(next);
    try { await api.post('/api/service-categories/reorder', { orderedIds: next.map((row) => row.id) }); }
    catch (cause) { setError(errorText(cause, 'Could not change the order.')); void load(); }
  };

  const pick = async () => {
    if (!draft) return;
    try { const uri = await pickImageDataUri(); if (uri) setDraft({ ...draft, imageUrl: uri }); }
    catch (cause) { setError(errorText(cause, 'Could not open your photos.')); }
  };

  const editing = draft && draft.id > 0 ? rows.find((row) => row.id === draft.id) : undefined;

  return (
    <CatalogScreen
      help="catalog.categories"
      title={draft ? (draft.id > 0 ? 'Edit category' : 'New category') : 'Categories'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, name: '', color: null, imageUrl: null, hiddenFromPublic: false }); }}
      addLabel="Add a category"
      testID="categories"
    >
      {draft ? (
        <>
          <Field label="Name" testID="category-name" autoCapitalize="words" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Manicures" />
          <Label>Calendar colour</Label>
          <View style={styles.swatches}>
            <TouchableOpacity testID="category-colour-none" accessibilityLabel="No colour" onPress={() => setDraft({ ...draft, color: null })} style={[styles.swatch, { backgroundColor: colors.card, borderColor: !draft.color ? colors.foreground : colors.border, borderWidth: !draft.color ? 2 : 1 }]}>
              <Text style={[styles.none, { color: colors.mutedForeground }]}>None</Text>
            </TouchableOpacity>
            {PALETTE.map(([key, swatch]) => (
              <TouchableOpacity key={key} testID={`category-colour-${key}`} accessibilityLabel={key} onPress={() => setDraft({ ...draft, color: key })} style={[styles.swatch, { backgroundColor: swatch, borderColor: draft.color === key ? colors.foreground : 'transparent', borderWidth: 3 }]} />
            ))}
          </View>
          <PhotoField label="Photo" uri={draft.imageUrl} onPick={() => void pick()} onRemove={() => setDraft({ ...draft, imageUrl: null })} testID="category-photo" />
          <Toggle title="Show on my booking site" value={!draft.hiddenFromPublic} onChange={(show) => setDraft({ ...draft, hiddenFromPublic: !show })} testID="category-public" />
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="category-save" />
          {editing ? <QuietButton destructive disabled={saving} label="Remove category" onPress={() => remove(editing)} testID="category-remove" /> : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {rows.length === 0 && !error ? <Empty>You have no categories yet. Tap + to add the first one.</Empty> : null}
          <List>
            {rows.map((row, index) => (
              <View key={row.id} style={styles.orderRow}>
                <View style={{ flex: 1 }}>
                  <Row testID={`category-${row.id}`} title={row.name} hint={row.hiddenFromPublic ? 'Hidden from your booking site' : undefined} onPress={() => { setError(''); setDraft({ id: row.id, name: row.name, color: row.color, imageUrl: row.imageUrl, hiddenFromPublic: row.hiddenFromPublic }); }} />
                </View>
                <View>
                  <TouchableOpacity testID={`category-up-${row.id}`} accessibilityLabel={`Move ${row.name} up`} disabled={index === 0} onPress={() => void move(index, -1)} style={styles.arrow}><Feather name="chevron-up" size={18} color={index === 0 ? colors.border : colors.mutedForeground} /></TouchableOpacity>
                  <TouchableOpacity testID={`category-down-${row.id}`} accessibilityLabel={`Move ${row.name} down`} disabled={index === rows.length - 1} onPress={() => void move(index, 1)} style={styles.arrow}><Feather name="chevron-down" size={18} color={index === rows.length - 1 ? colors.border : colors.mutedForeground} /></TouchableOpacity>
                </View>
              </View>
            ))}
          </List>
        </>
      )}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  none: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: { width: 34, height: 30, alignItems: 'center', justifyContent: 'center' },
});
