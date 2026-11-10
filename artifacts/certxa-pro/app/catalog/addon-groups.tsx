/**
 * Catalog → Add-on Groups (owner, 2026-11-05): reusable sets of existing add-ons, given to services from the
 * service's edit screen, as on the Certxa website (server: routes/addonGroups.ts). A group only points at
 * add-ons: price and time stay on each add-on. Duplicate makes a separate copy with the same add-ons and no
 * services.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { CatalogScreen, Checklist, Empty, ErrorLine, Field, Label, List, Loading, QuietButton, Row, SaveButton, errorText, minutesLabel, money } from '@/components/catalog/CatalogKit';
import { useBookingData } from '@/contexts/BookingContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

type Group = { id: number; name: string; addonIds: number[]; serviceIds: number[] };
type Addon = { id: number; name: string; duration: number; price: number; active: boolean };
type Draft = { id: number; name: string; addonIds: number[] };

export default function AddonGroupsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { refresh } = useBookingData();
  const [groups, setGroups] = useState<Group[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copyName, setCopyName] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, addonRows] = await Promise.all([api.get<any[]>('/api/addon-groups'), api.get<any[]>('/api/addons')]);
      setGroups((Array.isArray(list) ? list : []).map((row) => ({
        id: Number(row.id), name: String(row.name ?? ''), addonIds: (row.addonIds ?? []).map(Number), serviceIds: (row.serviceIds ?? []).map(Number),
      })));
      setAddons((Array.isArray(addonRows) ? addonRows : []).map((row) => ({
        id: Number(row.id), name: String(row.name ?? ''), duration: Number(row.duration) || 0, price: Number(row.price) || 0, active: row.isActive !== false,
      })).sort((a, b) => a.name.localeCompare(b.name)));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your add-on groups.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    if (!name) return setError('Enter the name of the group.');
    setSaving(true); setError('');
    try {
      if (draft.id > 0) await api.patch(`/api/addon-groups/${draft.id}`, { name, addonIds: draft.addonIds });
      else await api.post('/api/addon-groups', { name, addonIds: draft.addonIds });
      setDraft(null);
      await load();
      // Services that use the group now offer different add-ons.
      void refresh();
    } catch (cause) { setError(errorText(cause, 'Could not save the group.')); }
    finally { setSaving(false); }
  };

  const remove = (group: Group) => {
    Alert.alert('Delete this group?', `Services that use ${group.name} lose its add-ons. Add-ons you linked to a service yourself stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await api.del(`/api/addon-groups/${group.id}`); setDraft(null); await load(); void refresh(); }
        catch (cause) { setError(errorText(cause, 'Could not delete the group.')); }
      } },
    ]);
  };

  const duplicate = async () => {
    if (!draft || copyName === null || saving) return;
    const name = copyName.trim();
    if (!name) return setCopyError('Enter the name of the group.');
    setSaving(true); setCopyError('');
    try {
      await api.post(`/api/addon-groups/${draft.id}/duplicate`, { name });
      setCopyName(null);
      setDraft(null);
      await load();
    } catch (cause) { setCopyError(errorText(cause, 'Could not duplicate the group.')); }
    finally { setSaving(false); }
  };

  const editing = draft && draft.id > 0 ? groups.find((group) => group.id === draft.id) : undefined;
  // Active add-ons, plus any inactive one already in the group so saving doesn't drop it unseen.
  const choices = addons.filter((addon) => addon.active || (draft?.addonIds.includes(addon.id) ?? false));

  return (
    <CatalogScreen
      help="catalog.addon-groups"
      title={draft ? (draft.id > 0 ? 'Edit group' : 'New group') : 'Add-on Groups'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, name: '', addonIds: [] }); }}
      addLabel="Add an add-on group"
      testID="addon-groups"
    >
      {draft ? (
        <>
          <Field label="Name" testID="addon-group-name" autoCapitalize="sentences" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Gel extras" maxLength={80} />
          <Label>Add-ons in this group</Label>
          <Checklist
            testID="addon-group-addon"
            items={choices.map((addon) => ({ id: addon.id, title: addon.active ? addon.name : `${addon.name} (inactive)`, hint: `${addon.duration ? `+${minutesLabel(addon.duration)} · ` : ''}${money(addon.price)}` }))}
            picked={draft.addonIds}
            onToggle={(id) => setDraft({ ...draft, addonIds: draft.addonIds.includes(id) ? draft.addonIds.filter((value) => value !== id) : [...draft.addonIds, id] })}
            empty="Add an add-on first (Catalog › Add-Ons)."
          />
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="addon-group-save" />
          {editing ? (
            <>
              <QuietButton disabled={saving} label="Duplicate group" onPress={() => { setCopyError(''); setCopyName(`${editing.name} Copy`); }} testID="addon-group-duplicate" />
              <QuietButton destructive disabled={saving} label="Delete group" onPress={() => remove(editing)} testID="addon-group-delete" />
            </>
          ) : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {groups.length === 0 && !error ? <Empty>You have no add-on groups yet. Tap + to put add-ons several services share in one group.</Empty> : null}
          <List>
            {groups.map((group) => {
              const services = group.serviceIds.length;
              return <Row key={group.id} testID={`addon-group-${group.id}`} title={group.name} hint={`${group.addonIds.length} add-on${group.addonIds.length === 1 ? '' : 's'} · ${services === 0 ? 'Not given to any service yet' : `With ${services} service${services === 1 ? '' : 's'}`}`} onPress={() => { setError(''); setDraft({ id: group.id, name: group.name, addonIds: group.addonIds }); }} />;
            })}
          </List>
        </>
      )}

      <Modal visible={copyName !== null} transparent animationType="slide" onRequestClose={() => setCopyName(null)}>
        <View style={styles.sheetBackdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background }]}>
            <Text style={[styles.sheetTitle, { color: colors.foreground }]}>What would you like to name this duplicate group?</Text>
            <Field label="Name" testID="addon-group-copy-name" autoCapitalize="sentences" autoFocus value={copyName ?? ''} onChangeText={setCopyName} maxLength={80} />
            <ErrorLine>{copyError}</ErrorLine>
            <SaveButton saving={saving} label="Duplicate" onPress={() => void duplicate()} testID="addon-group-copy-save" />
            <QuietButton disabled={saving} label="Cancel" onPress={() => setCopyName(null)} testID="addon-group-copy-cancel" />
          </View>
        </View>
      </Modal>
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 21, fontFamily: 'Inter_600SemiBold', marginBottom: 2 },
});
