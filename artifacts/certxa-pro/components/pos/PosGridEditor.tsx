/**
 * The tablet POS's key grid editor (owner, 2026-11-19): /nail's (pages/nail/GridEditor.tsx) in the app's look. Choose a
 * grid on the left, tap a position in the middle, and say on the right what that key is — a category (opens its
 * services), one service, an add-on, another grid, a function or Back — with an optional name and band colour. Nothing
 * reaches the POS until Save. Choices are drop-downs (the app's rule: no rows of pill buttons).
 */
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SelectField } from '@/components/SelectField';
import { look, cardShadow } from '@/components/look/tokens';
import { KeyRows, PosKeyButton } from '@/components/pos/PosGrid';
import {
  APP_POS_FNS, POS_FN_LABELS, POS_GRID_MAIN, POS_GRID_MAX_GRIDS, POS_GRID_ROWS, ROW_BANDS, arrangedKeys, autoPlacedSlots, automaticLayout,
  posGridColumns, posGridSlots, type CatalogAddon, type CatalogGroup, type PosAfter, type PosFn, type PosGrid, type PosGridConfig, type PosKey,
} from '@/lib/posGrid';

type KeyType = 'empty' | PosKey['type'];
const KEY_TYPES: { value: KeyType; label: string }[] = [
  { value: 'empty', label: 'Empty' }, { value: 'category', label: 'Category' }, { value: 'service', label: 'Service' }, { value: 'addon', label: 'Add-on' },
  { value: 'grid', label: 'Grid' }, { value: 'fn', label: 'Function' }, { value: 'back', label: 'Back' },
];

export function PosGridEditor({ visible, groups: allGroups, addons, config, saving, onSave, onClose }: {
  visible: boolean; groups: CatalogGroup[]; addons: CatalogAddon[];
  /** The saved layout, or null while the POS is on the automatic one. */
  config: PosGridConfig | null; saving: boolean;
  /** null = go back to the automatic layout. */
  onSave: (config: PosGridConfig | null) => void; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<PosGridConfig>(() => config ?? automaticLayout(allGroups));
  const groups = useMemo(() => (draft.hideAddonsKey ? allGroups.filter((g) => g.key !== 'addons') : allGroups), [allGroups, draft.hideAddonsKey]);
  const [gridId, setGridId] = useState<string>(POS_GRID_MAIN);
  const [slot, setSlot] = useState<number | null>(null);
  const grid = draft.grids.find((g) => g.id === gridId) ?? draft.grids[0];
  const isMain = grid.id === POS_GRID_MAIN;
  const keys = useMemo(() => arrangedKeys(grid, draft, groups, addons), [grid, draft, groups, addons]);
  const autoSlots = useMemo(() => (isMain ? autoPlacedSlots(draft, groups, addons) : new Set<number>()), [isMain, draft, groups, addons]);
  const current = slot != null ? grid.keys[slot] ?? null : null;
  const otherGrids = draft.grids.filter((g) => g.id !== POS_GRID_MAIN && g.id !== grid.id);
  const columns = posGridColumns(draft);
  const services = groups.flatMap((g) => g.services.map((s) => ({ ...s, group: g.name })));

  const changeGrid = (id: string, change: (g: PosGrid) => PosGrid) => setDraft((d) => ({ ...d, grids: d.grids.map((g) => (g.id === id ? change(g) : g)) }));
  const setKey = (key: PosKey | null) => { if (slot != null) changeGrid(grid.id, (g) => ({ ...g, keys: g.keys.map((k, i) => (i === slot ? key : k)) })); };
  // Changing what a key is keeps the name and colour the manager gave it.
  const setType = (type: KeyType) => {
    const lookOf = current ? { ...(current.label ? { label: current.label } : {}), ...(current.color ? { color: current.color } : {}) } : {};
    if (type === 'empty') return setKey(null);
    if (type === 'category') return groups[0] ? setKey({ type, groupKey: groups[0].key, ...lookOf }) : undefined;
    if (type === 'service') return services[0] ? setKey({ type, serviceId: services[0].id, ...lookOf }) : undefined;
    if (type === 'grid') return otherGrids[0] ? setKey({ type, gridId: otherGrids[0].id, ...lookOf }) : undefined;
    if (type === 'addon') return addons[0] ? setKey({ type, addonId: addons[0].id, ...lookOf }) : undefined;
    if (type === 'fn') return setKey({ type, fn: APP_POS_FNS[0], ...lookOf });
    return setKey({ type: 'back', ...lookOf });
  };
  const patch = (change: Partial<PosKey>) => { if (current) setKey({ ...current, ...change } as PosKey); };
  const addGrid = () => {
    if (draft.grids.length >= POS_GRID_MAX_GRIDS) return;
    const id = `g${Date.now().toString(36)}`;
    setDraft((d) => ({ ...d, grids: [...d.grids, { id, name: 'New grid', keys: Array.from({ length: posGridSlots(d) }, () => null) }] }));
    setGridId(id); setSlot(null);
  };
  const deleteGrid = () => Alert.alert(`Delete the grid "${grid.name}"?`, 'Keys that open it become empty.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => {
      setDraft((d) => ({ ...d, grids: d.grids.filter((g) => g.id !== grid.id).map((g) => ({ ...g, keys: g.keys.map((k) => (k?.type === 'grid' && k.gridId === grid.id ? null : k)) })) }));
      setGridId(POS_GRID_MAIN); setSlot(null);
    } },
  ]);
  // Grid size: 2 or 3 across, 6 rows. Going down to 2 drops the third column's keys, after a warning.
  const applyColumns = (next: 2 | 3) => {
    const slots = next * POS_GRID_ROWS;
    setDraft((d) => {
      const { columns: _old, ...rest } = d;
      const grids = d.grids.map((g) => ({ ...g, keys: Array.from({ length: slots }, (_, i) => g.keys[i] ?? null) }));
      return next === 3 ? { ...rest, grids, columns: 3 } : { ...rest, grids };
    });
    setSlot(null);
  };
  const setColumns = (next: 2 | 3) => {
    if (next === columns) return;
    if (next === 2 && draft.grids.some((g) => g.keys.slice(2 * POS_GRID_ROWS).some((k) => k != null))) {
      Alert.alert('Go to 2 across?', 'Keys in positions 13–18 are taken off.', [{ text: 'Cancel', style: 'cancel' }, { text: '2 across', onPress: () => applyColumns(2) }]);
      return;
    }
    applyColumns(next);
  };
  const jumpTargets = draft.grids.filter((g) => g.id !== POS_GRID_MAIN);
  const setAfter = (target: 'grid' | 'categories', next: PosAfter) => {
    const clean = next.to === 'stay' ? undefined : next;
    if (target === 'categories') setDraft((d) => { const { afterService: _old, ...rest } = d; return clean ? { ...rest, afterService: clean } : rest; });
    else changeGrid(grid.id, (g) => { const { after: _old, ...rest } = g; return clean ? { ...rest, after: clean } : rest; });
  };
  const afterPicker = (target: 'grid' | 'categories', value: PosAfter | undefined, self: string | null) => {
    const targets = jumpTargets.filter((g) => g.id !== self);
    const v = value ?? { to: 'stay' as const };
    const options = [
      { value: 'stay', label: 'Stay here' },
      ...(self !== POS_GRID_MAIN ? [{ value: 'main', label: 'Back to main' }] : []),
      ...targets.map((g) => ({ value: `grid:${g.id}`, label: `Open ${g.name}` })),
    ];
    return <SelectField testID={`pos-grid-after-${target}`} title="After a pick" value={v.to === 'grid' ? `grid:${v.gridId}` : v.to} options={options}
      onChange={(next) => setAfter(target, String(next).startsWith('grid:') ? { to: 'grid', gridId: String(next).slice(5) } : { to: next as 'stay' | 'main' })} />;
  };
  const defaultName = !current ? ''
    : current.type === 'category' ? groups.find((g) => g.key === current.groupKey)?.name ?? 'Category'
    : current.type === 'service' ? services.find((s) => s.id === current.serviceId)?.name ?? 'Service'
    : current.type === 'grid' ? draft.grids.find((g) => g.id === current.gridId)?.name ?? 'Grid'
    : current.type === 'addon' ? addons.find((a) => a.id === current.addonId)?.name ?? 'Add-on'
    : current.type === 'fn' ? POS_FN_LABELS[current.fn] : 'Back';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={[styles.root, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }]} testID="pos-grid-editor">
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Key grid</Text>
            <Text style={styles.subtle}>Choose a grid, tap a position, then say what that key is. Nothing changes on the POS until you save.</Text>
          </View>
          <TouchableOpacity testID="pos-grid-auto" disabled={saving} style={styles.secondary}
            onPress={() => Alert.alert('Go back to the automatic layout?', 'The POS shows a key for every category again, and this arrangement is deleted.', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Automatic layout', style: 'destructive', onPress: () => onSave(null) }])}>
            <Text style={styles.secondaryText}>Automatic layout</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="pos-grid-cancel" disabled={saving} onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity testID="pos-grid-save" disabled={saving} onPress={() => onSave(draft)} style={styles.primary}><Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text></TouchableOpacity>
        </View>

        <View style={styles.body}>
          <ScrollView style={[styles.panel, styles.side]} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            <Text style={styles.label}>GRIDS</Text>
            {draft.grids.map((g) => (
              <TouchableOpacity key={g.id} testID={`pos-grid-pick-${g.id}`} onPress={() => { setGridId(g.id); setSlot(null); }} style={[styles.gridRow, g.id === grid.id && styles.gridRowOn]}>
                <Text style={[styles.gridName, g.id === grid.id && { color: look.violetDeep }]} numberOfLines={1}>{g.name}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity testID="pos-grid-new" onPress={addGrid} disabled={draft.grids.length >= POS_GRID_MAX_GRIDS} style={styles.addRow}>
              <Feather name="plus" size={18} color={look.violetDeep} /><Text style={styles.secondaryText}>New grid</Text>
            </TouchableOpacity>
            {!isMain ? <>
              <Text style={styles.label}>GRID NAME</Text>
              <TextInput testID="pos-grid-name" value={grid.name} maxLength={28} onChangeText={(v) => changeGrid(grid.id, (g) => ({ ...g, name: v }))} style={styles.input} />
              <TouchableOpacity testID="pos-grid-delete" onPress={deleteGrid} style={styles.addRow}><Feather name="trash-2" size={17} color="#B42318" /><Text style={[styles.secondaryText, { color: '#B42318' }]}>Delete grid</Text></TouchableOpacity>
            </> : null}
            <Text style={styles.label}>GRID SIZE</Text>
            <SelectField testID="pos-grid-cols" title="Grid size" value={columns} options={[{ value: 2, label: '2 × 6' }, { value: 3, label: '3 × 6' }]} onChange={(v) => setColumns(v === 3 ? 3 : 2)} />
            <Text style={styles.label}>ADD-ONS KEY</Text>
            <SelectField testID="pos-grid-addons" title="Add-ons key" value={draft.hideAddonsKey ? 'hide' : 'show'} options={[{ value: 'show', label: 'Show' }, { value: 'hide', label: 'Hide' }]}
              onChange={(v) => setDraft((d) => { const { hideAddonsKey: _h, ...rest } = d; return v === 'hide' ? { ...rest, hideAddonsKey: true } : rest; })} />
            <Text style={styles.label}>AFTER A PICK ON THIS GRID</Text>
            {afterPicker('grid', grid.after, grid.id)}
            <Text style={styles.label}>AFTER A SERVICE IN A CATEGORY</Text>
            {afterPicker('categories', draft.afterService, null)}
          </ScrollView>

          <View style={[styles.panel, styles.preview]}>
            <KeyRows keys={keys} columns={columns} render={(k, i) => (
              <PosKeyButton k={k} index={i} columns={columns} selected={slot === i} onPress={() => setSlot(i)} testID={`pos-grid-slot-${i}`} />
            )} />
          </View>

          <ScrollView style={[styles.panel, styles.side]} contentContainerStyle={{ gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
            {slot == null ? <Text style={styles.subtle}>Tap a position in the grid to set its key.</Text> : <>
              <View style={styles.formHead}>
                <Text style={styles.label}>POSITION {slot + 1}</Text>
                <TouchableOpacity accessibilityLabel="Close" onPress={() => setSlot(null)}><Feather name="x" size={20} color={look.subtle} /></TouchableOpacity>
              </View>
              <SelectField testID="pos-grid-type" title="Key" value={current?.type ?? 'empty'}
                options={KEY_TYPES.filter((t) => (t.value !== 'back' || !isMain) && (t.value !== 'grid' || otherGrids.length > 0) && (t.value !== 'category' || groups.length > 0) && (t.value !== 'addon' || addons.length > 0) && (t.value !== 'service' || services.length > 0))}
                onChange={(v) => setType(v as KeyType)} />
              {current?.type === 'category' ? <SelectField testID="pos-grid-target" title="Category" value={current.groupKey} options={groups.map((g) => ({ value: g.key, label: g.name }))} onChange={(v) => patch({ groupKey: String(v) } as Partial<PosKey>)} /> : null}
              {current?.type === 'service' ? <SelectField testID="pos-grid-target" title="Service" value={current.serviceId} options={services.map((s) => ({ value: s.id, label: `${s.name} · $${Number(s.price).toFixed(2)} · ${s.group}` }))} onChange={(v) => patch({ serviceId: Number(v) } as Partial<PosKey>)} /> : null}
              {current?.type === 'grid' ? <SelectField testID="pos-grid-target" title="Opens" value={current.gridId} options={otherGrids.map((g) => ({ value: g.id, label: g.name }))} onChange={(v) => patch({ gridId: String(v) } as Partial<PosKey>)} /> : null}
              {current?.type === 'addon' ? <SelectField testID="pos-grid-target" title="Add-on" value={current.addonId} options={addons.map((a) => ({ value: a.id, label: `${a.name} · +$${Number(a.price).toFixed(2)}` }))} onChange={(v) => patch({ addonId: Number(v) } as Partial<PosKey>)} /> : null}
              {current?.type === 'fn' ? <SelectField testID="pos-grid-target" title="Function" value={current.fn} options={APP_POS_FNS.map((f) => ({ value: f, label: POS_FN_LABELS[f] }))} onChange={(v) => patch({ fn: v as PosFn } as Partial<PosKey>)} /> : null}
              {current ? <>
                <Text style={styles.label}>NAME ON THE KEY</Text>
                <TextInput testID="pos-grid-label" value={current.label ?? ''} maxLength={28} placeholder={defaultName} placeholderTextColor={look.subtle} onChangeText={(v) => patch({ label: v || undefined })} style={styles.input} />
                <Text style={styles.label}>BAND COLOUR</Text>
                <View style={styles.swatches}>
                  <TouchableOpacity testID="pos-grid-color-row" onPress={() => patch({ color: undefined })} style={[styles.rowColour, !current.color && styles.swatchOn]}><Text style={styles.small}>Row colour</Text></TouchableOpacity>
                  {ROW_BANDS.map((c) => (
                    <TouchableOpacity key={c} testID={`pos-grid-color-${c.slice(1)}`} accessibilityLabel={`Band colour ${c}`} onPress={() => patch({ color: c })} style={[styles.swatch, { backgroundColor: c }, current.color === c && styles.swatchOn]} />
                  ))}
                </View>
              </> : autoSlots.has(slot) ? <Text style={styles.subtle}>This position is empty, so the POS shows a category that isn't on any grid here. Choose a key to put something else here.</Text>
                : <Text style={styles.subtle}>This position is empty. Choose what the key is above.</Text>}
              {!isMain ? <Text style={styles.subtle}>A grid with no Back key gets one in its last position on the POS.</Text> : null}
            </>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: look.pageTop, paddingHorizontal: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  title: { fontSize: 26, fontFamily: 'Inter_700Bold', color: look.heading },
  subtle: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', color: look.subtle },
  small: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: look.heading },
  label: { fontSize: 13, letterSpacing: 1, fontFamily: 'Inter_700Bold', color: look.subtle, marginTop: 8 },
  body: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 14 },
  panel: { backgroundColor: look.card, borderRadius: 22, borderWidth: 1, borderColor: look.cardBorder, padding: 14, ...cardShadow },
  side: { width: 270, flexGrow: 0 },
  preview: { flex: 1, minHeight: 0 },
  gridRow: { minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: look.cardBorder, paddingHorizontal: 12, justifyContent: 'center' },
  gridRowOn: { borderColor: look.violet, borderWidth: 2, backgroundColor: look.tile },
  gridName: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.heading },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: look.cardBorder, backgroundColor: look.card, paddingHorizontal: 12, fontSize: 16, color: look.heading, fontFamily: 'Inter_400Regular' },
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  rowColour: { height: 36, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: look.cardBorder, justifyContent: 'center' },
  swatch: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: look.cardBorder },
  swatchOn: { borderColor: look.violet, borderWidth: 3 },
  secondary: { height: 48, paddingHorizontal: 16, borderRadius: 14, backgroundColor: look.tile, borderWidth: 1, borderColor: look.cardBorder, justifyContent: 'center' },
  secondaryText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  primary: { height: 48, paddingHorizontal: 22, borderRadius: 14, backgroundColor: look.violet, justifyContent: 'center' },
  primaryText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
});
