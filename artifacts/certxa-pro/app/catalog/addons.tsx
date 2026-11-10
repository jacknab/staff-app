/**
 * Catalog → Add-Ons: extras a client can add to a service (name, description, time, price, which services they go
 * with, shown on the booking site), as on the Certxa website. Removing one stops it being offered; past
 * appointments keep it.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Text } from 'react-native';
import { CatalogScreen, Checklist, Empty, ErrorLine, Field, Label, List, Loading, Pair, QuietButton, Row, SaveButton, Toggle, errorText, minutesLabel, money } from '@/components/catalog/CatalogKit';
import { useBookingData } from '@/contexts/BookingContext';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

type Addon = { id: number; name: string; description: string; duration: number; price: number; hiddenFromPublic: boolean; allowQuantity: boolean };
type Draft = { id: number; name: string; description: string; minutes: string; price: string; hiddenFromPublic: boolean; allowQuantity: boolean; serviceIds: number[] };
type Service = { id: number; name: string };

export default function AddonsScreen() {
  const router = useRouter();
  const { refresh } = useBookingData();
  const [rows, setRows] = useState<Addon[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [links, setLinks] = useState<Array<{ addonId: number; serviceId: number }>>([]);
  // Groups (Catalog › Add-on Groups) given to at least one service, by add-on: a quiet note, since "Offered with"
  // lists only the services linked here by hand.
  const [viaGroups, setViaGroups] = useState<Record<number, string[]>>({});
  const colors = useColors();
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, serviceRows, mappings] = await Promise.all([
        api.get<any[]>('/api/addons'), api.get<any[]>('/api/services'), api.get<any[]>('/api/service-addon-mappings'),
      ]);
      setRows((Array.isArray(list) ? list : []).filter((row) => row.isActive !== false).map((row) => ({
        id: Number(row.id), name: String(row.name ?? ''), description: String(row.description ?? ''), duration: Number(row.duration) || 0,
        price: Number(row.price) || 0, hiddenFromPublic: Boolean(row.hiddenFromPublic), allowQuantity: Boolean(row.allowQuantity),
      })).sort((a, b) => a.name.localeCompare(b.name)));
      setServices((Array.isArray(serviceRows) ? serviceRows : []).map((row) => ({ id: Number(row.id), name: String(row.name ?? '') })));
      setLinks((Array.isArray(mappings) ? mappings : []).map((row) => ({ addonId: Number(row.addonId), serviceId: Number(row.serviceId) })));
      const groups = await api.get<any[]>('/api/addon-groups').catch(() => []);
      const byAddon: Record<number, string[]> = {};
      (Array.isArray(groups) ? groups : []).filter((g) => (g.serviceIds ?? []).length > 0).forEach((g) => {
        (g.addonIds ?? []).forEach((id: number) => { (byAddon[Number(id)] ||= []).push(String(g.name ?? '')); });
      });
      setViaGroups(byAddon);
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your add-ons.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const minutes = Number.parseInt(draft.minutes || '0', 10);
    const price = Number(draft.price);
    if (!name) return setError('Enter the name of the add-on.');
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 480) return setError('Enter the extra time in minutes (0 to 480).');
    if (!draft.price || !Number.isFinite(price) || price < 0) return setError('Enter the price, for example 10 or 10.50.');
    setSaving(true); setError('');
    try {
      const body = { name, description: draft.description.trim() || null, duration: minutes, price: price.toFixed(2), hiddenFromPublic: draft.hiddenFromPublic, allowQuantity: draft.allowQuantity };
      const saved = draft.id > 0 ? await api.patch<{ id: number }>(`/api/addons/${draft.id}`, body) : await api.post<{ id: number }>('/api/addons', body);
      await api.post(`/api/addons/${saved?.id ?? draft.id}/services`, { serviceIds: draft.serviceIds });
      setDraft(null);
      await load();
      void refresh();
    } catch (cause) { setError(errorText(cause, 'Could not save the add-on.')); }
    finally { setSaving(false); }
  };

  const remove = (row: Addon) => {
    Alert.alert('Remove this add-on?', `${row.name} will no longer be offered. Appointments that already have it keep it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.del(`/api/addons/${row.id}`); setDraft(null); await load(); void refresh(); }
        catch (cause) { setError(errorText(cause, 'Could not remove the add-on.')); }
      } },
    ]);
  };

  const open = (row: Addon) => {
    setError('');
    setDraft({ id: row.id, name: row.name, description: row.description, minutes: String(row.duration), price: row.price.toFixed(2), hiddenFromPublic: row.hiddenFromPublic, allowQuantity: row.allowQuantity, serviceIds: links.filter((link) => link.addonId === row.id).map((link) => link.serviceId) });
  };
  const editing = draft && draft.id > 0 ? rows.find((row) => row.id === draft.id) : undefined;
  const serviceCount = (id: number) => links.filter((link) => link.addonId === id && services.some((service) => service.id === link.serviceId)).length;

  return (
    <CatalogScreen
      help="catalog.addons"
      title={draft ? (draft.id > 0 ? 'Edit add-on' : 'New add-on') : 'Add-Ons'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, name: '', description: '', minutes: '', price: '', hiddenFromPublic: false, allowQuantity: false, serviceIds: [] }); }}
      addLabel="Add an add-on"
      testID="addons"
    >
      {draft ? (
        <>
          <Field label="Name" testID="addon-name" autoCapitalize="sentences" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, French tips" />
          <Field label="Description" testID="addon-description" multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="Optional" />
          <Pair>
            <Field label="Extra minutes" testID="addon-minutes" keyboardType="number-pad" value={draft.minutes} onChangeText={(minutes) => setDraft({ ...draft, minutes: minutes.replace(/\D/g, '') })} placeholder="15" />
            <Field label="Price ($)" testID="addon-price" keyboardType="decimal-pad" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^\d.]/g, '') })} placeholder="10.00" />
          </Pair>
          <Label>Offered with</Label>
          {draft.id > 0 && viaGroups[draft.id] ? (
            <Text testID="addon-groups-note" style={{ fontSize: 14, fontFamily: 'Inter_400Regular', color: colors.mutedForeground, marginTop: -2, marginBottom: 8 }}>
              {`Also offered through ${viaGroups[draft.id].length === 1 ? 'group' : 'groups'}: ${viaGroups[draft.id].join(', ')}`}
            </Text>
          ) : null}
          <Checklist
            testID="addon-service"
            items={services.map((service) => ({ id: service.id, title: service.name }))}
            picked={draft.serviceIds}
            onToggle={(id) => setDraft({ ...draft, serviceIds: draft.serviceIds.includes(id) ? draft.serviceIds.filter((value) => value !== id) : [...draft.serviceIds, id] })}
            empty="Add a service first."
          />
          <Toggle title="Show on my booking site" value={!draft.hiddenFromPublic} onChange={(show) => setDraft({ ...draft, hiddenFromPublic: !show })} testID="addon-public" />
          <Toggle title="Clients choose how many" hint="For anything priced per item, like nail art per nail. Clients see − 1 + on your website, up to 10." value={draft.allowQuantity} onChange={(allowQuantity) => setDraft({ ...draft, allowQuantity })} testID="addon-quantity" />
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="addon-save" />
          {editing ? <QuietButton destructive disabled={saving} label="Remove add-on" onPress={() => remove(editing)} testID="addon-remove" /> : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {rows.length === 0 && !error ? <Empty>You have no add-ons yet. Tap + to add the first one.</Empty> : null}
          <List>
            {rows.map((row) => {
              const count = serviceCount(row.id);
              const groupNote = viaGroups[row.id] ? ` · Also through ${viaGroups[row.id].join(', ')}` : '';
              return <Row key={row.id} testID={`addon-${row.id}`} title={row.name} hint={`${row.duration ? `+${minutesLabel(row.duration)} · ` : ''}${count === 0 ? (groupNote ? 'No services linked here' : 'Not offered with any service yet') : `With ${count} service${count === 1 ? '' : 's'}`}${groupNote}`} right={money(row.price)} onPress={() => open(row)} />;
            })}
          </List>
        </>
      )}
    </CatalogScreen>
  );
}
