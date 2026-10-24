/**
 * Catalog → Packages: services and add-ons sold as one item, as on the Certxa website. The time is always the sum of
 * what's inside; the price is that sum unless a fixed package price is set.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { CatalogScreen, Checklist, Empty, ErrorLine, Field, Label, List, Loading, PhotoField, QuietButton, Row, SaveButton, Toggle, errorText, minutesLabel, money, pickImageDataUri } from '@/components/catalog/CatalogKit';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';

type Item = { id: number; name: string; price: number; duration: number };
type Pkg = { id: number; name: string; description: string; imageUrl: string | null; fixed: boolean; fixedPrice: string; hiddenFromPublic: boolean; price: number; duration: number; serviceIds: number[]; addonIds: number[] };
type Draft = Omit<Pkg, 'price' | 'duration'>;

export default function PackagesScreen() {
  const router = useRouter();
  const { refresh } = useBookingData();
  const [rows, setRows] = useState<Pkg[]>([]);
  const [services, setServices] = useState<Item[]>([]);
  const [addons, setAddons] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, serviceRows, addonRows] = await Promise.all([api.get<any[]>('/api/packages'), api.get<any[]>('/api/services'), api.get<any[]>('/api/addons')]);
      const item = (row: any): Item => ({ id: Number(row.id), name: String(row.name ?? ''), price: Number(row.price) || 0, duration: Number(row.duration) || 0 });
      setServices((Array.isArray(serviceRows) ? serviceRows : []).map(item));
      setAddons((Array.isArray(addonRows) ? addonRows : []).filter((row) => row.isActive !== false).map(item));
      setRows((Array.isArray(list) ? list : []).map((row) => {
        const items: any[] = Array.isArray(row.items) ? row.items : [];
        return {
          id: Number(row.id), name: String(row.name ?? ''), description: String(row.description ?? ''), imageUrl: row.imageUrl ?? null,
          fixed: row.pricingMode === 'fixed', fixedPrice: row.fixedPrice != null ? Number(row.fixedPrice).toFixed(2) : '', hiddenFromPublic: Boolean(row.hiddenFromPublic),
          price: Number(row.price) || 0, duration: Number(row.duration) || 0,
          serviceIds: items.filter((it) => it.itemType === 'service').map((it) => Number(it.serviceId)),
          addonIds: items.filter((it) => it.itemType === 'addon').map((it) => Number(it.addonId)),
        };
      }));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your packages.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sumOf = (d: Draft) => [...d.serviceIds.map((id) => services.find((s) => s.id === id)), ...d.addonIds.map((id) => addons.find((a) => a.id === id))]
    .reduce((total, it) => ({ price: total.price + (it?.price ?? 0), duration: total.duration + (it?.duration ?? 0) }), { price: 0, duration: 0 });

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const fixed = Number(draft.fixedPrice);
    if (!name) return setError('Enter the name of the package.');
    if (draft.serviceIds.length === 0) return setError('A package needs at least one service.');
    if (draft.fixed && (!draft.fixedPrice || !Number.isFinite(fixed) || fixed < 0)) return setError('Enter the package price, for example 80 or 79.50.');
    setSaving(true); setError('');
    try {
      const body = {
        name, description: draft.description.trim() || null, imageUrl: draft.imageUrl, hiddenFromPublic: draft.hiddenFromPublic,
        pricingMode: draft.fixed ? 'fixed' : 'sum', fixedPrice: draft.fixed ? fixed.toFixed(2) : null,
        items: [...draft.serviceIds.map((serviceId) => ({ itemType: 'service', serviceId })), ...draft.addonIds.map((addonId) => ({ itemType: 'addon', addonId }))],
      };
      if (draft.id > 0) await api.patch(`/api/packages/${draft.id}`, body);
      else await api.post('/api/packages', { ...body, sortOrder: rows.length });
      setDraft(null);
      await load();
      void refresh();
    } catch (cause) { setError(errorText(cause, 'Could not save the package.')); }
    finally { setSaving(false); }
  };

  const remove = (row: Pkg) => {
    Alert.alert('Remove this package?', `${row.name} will no longer be offered. Appointments already booked keep it.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await api.del(`/api/packages/${row.id}`); setDraft(null); await load(); void refresh(); }
        catch (cause) { setError(errorText(cause, 'Could not remove the package.')); }
      } },
    ]);
  };

  const pick = async () => {
    if (!draft) return;
    try { const uri = await pickImageDataUri([16, 9]); if (uri) setDraft({ ...draft, imageUrl: uri }); }
    catch (cause) { setError(errorText(cause, 'Could not open your photos.')); }
  };

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((value) => value !== id) : [...list, id]);
  const editing = draft && draft.id > 0 ? rows.find((row) => row.id === draft.id) : undefined;
  const sum = draft ? sumOf(draft) : null;

  return (
    <CatalogScreen
      title={draft ? (draft.id > 0 ? 'Edit package' : 'New package') : 'Packages'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, name: '', description: '', imageUrl: null, fixed: false, fixedPrice: '', hiddenFromPublic: false, serviceIds: [], addonIds: [] }); }}
      addLabel="Add a package"
      testID="packages"
    >
      {draft && sum ? (
        <>
          <Field label="Name" testID="package-name" autoCapitalize="words" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Mani + pedi" />
          <Field label="Description" testID="package-description" multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="Optional" />
          <Label>Services</Label>
          <Checklist testID="package-service" items={services.map((s) => ({ id: s.id, title: s.name, hint: money(s.price) }))} picked={draft.serviceIds} onToggle={(id) => setDraft({ ...draft, serviceIds: toggle(draft.serviceIds, id) })} empty="Add a service first." />
          <Label>Add-ons</Label>
          <Checklist testID="package-addon" items={addons.map((a) => ({ id: a.id, title: a.name, hint: money(a.price) }))} picked={draft.addonIds} onToggle={(id) => setDraft({ ...draft, addonIds: toggle(draft.addonIds, id) })} empty="No add-ons yet." />
          <Toggle title="Set my own package price" hint={`Together they are ${money(sum.price)} · ${minutesLabel(sum.duration)}`} value={draft.fixed} onChange={(fixed) => setDraft({ ...draft, fixed })} testID="package-fixed" />
          {draft.fixed ? <Field label="Package price ($)" testID="package-price" keyboardType="decimal-pad" value={draft.fixedPrice} onChangeText={(fixedPrice) => setDraft({ ...draft, fixedPrice: fixedPrice.replace(/[^\d.]/g, '') })} placeholder="0.00" /> : null}
          <PhotoField label="Photo" uri={draft.imageUrl} onPick={() => void pick()} onRemove={() => setDraft({ ...draft, imageUrl: null })} testID="package-photo" />
          <Toggle title="Show on my booking site" value={!draft.hiddenFromPublic} onChange={(show) => setDraft({ ...draft, hiddenFromPublic: !show })} testID="package-public" />
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="package-save" />
          {editing ? <QuietButton destructive disabled={saving} label="Remove package" onPress={() => remove(editing)} testID="package-remove" /> : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {rows.length === 0 && !error ? <Empty>You have no packages yet. Tap + to put services together.</Empty> : null}
          <List>
            {rows.map((row) => (
              <Row key={row.id} testID={`package-${row.id}`} title={row.name} hint={`${minutesLabel(row.duration)} · ${row.serviceIds.length + row.addonIds.length} item${row.serviceIds.length + row.addonIds.length === 1 ? '' : 's'}${row.hiddenFromPublic ? ' · hidden' : ''}`} right={money(row.price)} onPress={() => { setError(''); const { price: _p, duration: _d, ...rest } = row; setDraft(rest); }} />
            ))}
          </List>
        </>
      )}
    </CatalogScreen>
  );
}
