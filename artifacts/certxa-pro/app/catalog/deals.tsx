/**
 * Catalog → Deals: vouchers for one of your packages at a lower price, sold for a set time, as on the Certxa
 * website. The package can't change once a deal is made; a deal can be paused, resumed or archived.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { CatalogScreen, Checklist, Choice, Empty, ErrorLine, Field, Label, List, Loading, Pair, QuietButton, Row, SaveButton, SectionTitle, errorText, money } from '@/components/catalog/CatalogKit';
import { api } from '@/lib/live-api';

type Status = 'active' | 'paused' | 'archived';
type Deal = { id: number; packageId: number; title: string; description: string; dealPrice: number; listPrice: number; capacity: number; sold: number; startsAt: string; endsAt: string; status: Status; expiryDays: number };
type Draft = { id: number; packageId: number; title: string; description: string; dealPrice: string; capacity: string; starts: string; ends: string; expiryDays: number };
type Pkg = { id: number; name: string; price: number };

/** "10/24/2026" ↔ a date; the deal runs from the start of the first day to the start of the last. */
function dateText(value: Date) {
  return `${String(value.getMonth() + 1).padStart(2, '0')}/${String(value.getDate()).padStart(2, '0')}/${value.getFullYear()}`;
}
function parseDate(text: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const date = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return date.getMonth() === Number(m[1]) - 1 ? date : null;
}
const inDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); return d; };

export default function DealsScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<Deal[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [list, pkgs] = await Promise.all([api.get<any[]>('/api/deals'), api.get<any[]>('/api/packages')]);
      setPackages((Array.isArray(pkgs) ? pkgs : []).map((row) => ({ id: Number(row.id), name: String(row.name ?? ''), price: Number(row.price) || 0 })));
      setRows((Array.isArray(list) ? list : []).map((row) => ({
        id: Number(row.id), packageId: Number(row.packageId), title: String(row.title ?? ''), description: String(row.marketingDescription ?? ''),
        dealPrice: Number(row.dealPrice) || 0, listPrice: Number(row.listPrice) || 0, capacity: Number(row.capacity) || 0, sold: Number(row.purchasedCount) || 0,
        startsAt: String(row.startsAt), endsAt: String(row.endsAt), status: row.status === 'paused' || row.status === 'archived' ? row.status : 'active', expiryDays: Number(row.expiryDays) || 30,
      })));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your deals.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const title = draft.title.trim();
    const price = Number(draft.dealPrice);
    const capacity = Number.parseInt(draft.capacity, 10);
    const starts = parseDate(draft.starts);
    const ends = parseDate(draft.ends);
    const pkg = packages.find((p) => p.id === draft.packageId);
    if (draft.id === 0 && !pkg) return setError('Choose the package this deal is for.');
    if (!title) return setError('Give the deal a title.');
    if (!draft.dealPrice || !Number.isFinite(price) || price <= 0 || (pkg && price > pkg.price)) return setError(`Enter a deal price above $0${pkg ? ` and no more than ${money(pkg.price)}` : ''}.`);
    if (!Number.isInteger(capacity) || capacity < 1) return setError('Enter how many vouchers are available (at least 1).');
    if (!starts || !ends) return setError('Enter the dates like 10/24/2026.');
    if (starts >= ends) return setError('The end date must be after the start date.');
    setSaving(true); setError('');
    try {
      const body = { title, marketingDescription: draft.description.trim() || null, dealPrice: price.toFixed(2), capacity, startsAt: starts.toISOString(), endsAt: ends.toISOString(), expiryDays: draft.expiryDays };
      if (draft.id > 0) await api.patch(`/api/deals/${draft.id}`, body);
      else await api.post('/api/deals', { ...body, packageId: draft.packageId, status: 'active' });
      setDraft(null);
      await load();
    } catch (cause) { setError(errorText(cause, 'Could not save the deal.')); }
    finally { setSaving(false); }
  };

  const setStatus = async (status: Status) => {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try { await api.patch(`/api/deals/${draft.id}`, { status }); setDraft(null); await load(); }
    catch (cause) { setError(errorText(cause, 'Could not change the deal.')); }
    finally { setSaving(false); }
  };

  const editing = draft && draft.id > 0 ? rows.find((row) => row.id === draft.id) : undefined;
  const pkgName = (id: number) => packages.find((p) => p.id === id)?.name ?? 'Package';
  const statusText: Record<Status, string> = { active: 'On sale', paused: 'Paused', archived: 'Archived' };
  const current = rows.filter((row) => row.status !== 'archived');
  const archived = rows.filter((row) => row.status === 'archived');
  const row = (deal: Deal) => (
    <Row key={deal.id} testID={`deal-${deal.id}`} dim={deal.status !== 'active'} title={deal.title}
      hint={`${statusText[deal.status]} · ${deal.sold} of ${deal.capacity} sold · until ${dateText(new Date(deal.endsAt))}`} right={money(deal.dealPrice)}
      onPress={() => { setError(''); setDraft({ id: deal.id, packageId: deal.packageId, title: deal.title, description: deal.description, dealPrice: deal.dealPrice.toFixed(2), capacity: String(deal.capacity), starts: dateText(new Date(deal.startsAt)), ends: dateText(new Date(deal.endsAt)), expiryDays: deal.expiryDays }); }} />
  );

  return (
    <CatalogScreen
      title={draft ? (draft.id > 0 ? 'Edit deal' : 'New deal') : 'Deals'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, packageId: 0, title: '', description: '', dealPrice: '', capacity: '25', starts: dateText(new Date()), ends: dateText(inDays(30)), expiryDays: 30 }); }}
      addLabel="Add a deal"
      testID="deals"
    >
      {draft ? (
        <>
          <Label>Package</Label>
          {draft.id > 0 ? (
            <Checklist testID="deal-package" items={[{ id: draft.packageId, title: pkgName(draft.packageId), hint: editing ? `was ${money(editing.listPrice)}` : undefined }]} picked={[draft.packageId]} onToggle={() => undefined} empty="" />
          ) : (
            <Checklist testID="deal-package" items={packages.map((p) => ({ id: p.id, title: p.name, hint: money(p.price) }))} picked={[draft.packageId]} onToggle={(packageId) => setDraft({ ...draft, packageId })} empty="Make a package first (Catalog → Packages)." />
          )}
          <Field label="Title" testID="deal-title" autoCapitalize="sentences" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="For example, Spring mani + pedi" />
          <Field label="Description" testID="deal-description" multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="Optional" />
          <Pair>
            <Field label="Deal price ($)" testID="deal-price" keyboardType="decimal-pad" value={draft.dealPrice} onChangeText={(dealPrice) => setDraft({ ...draft, dealPrice: dealPrice.replace(/[^\d.]/g, '') })} placeholder="0.00" />
            <Field label="Vouchers available" testID="deal-capacity" keyboardType="number-pad" value={draft.capacity} onChangeText={(capacity) => setDraft({ ...draft, capacity: capacity.replace(/\D/g, '') })} placeholder="25" />
          </Pair>
          <Pair>
            <Field label="On sale from" testID="deal-starts" keyboardType="numbers-and-punctuation" value={draft.starts} onChangeText={(starts) => setDraft({ ...draft, starts })} placeholder="MM/DD/YYYY" />
            <Field label="Until" testID="deal-ends" keyboardType="numbers-and-punctuation" value={draft.ends} onChangeText={(ends) => setDraft({ ...draft, ends })} placeholder="MM/DD/YYYY" />
          </Pair>
          <Label>Voucher can be used for</Label>
          <Choice testID="deal-expiry" options={[[30, '30 days'], [60, '60 days'], [90, '90 days']]} value={draft.expiryDays} onChange={(expiryDays) => setDraft({ ...draft, expiryDays })} />
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="deal-save" />
          {editing?.status === 'active' ? <QuietButton disabled={saving} label="Pause deal" onPress={() => void setStatus('paused')} testID="deal-pause" /> : null}
          {editing?.status === 'paused' ? <QuietButton disabled={saving} label="Put back on sale" onPress={() => void setStatus('active')} testID="deal-resume" /> : null}
          {editing && editing.status !== 'archived' ? <QuietButton destructive disabled={saving} label="Archive deal" onPress={() => void setStatus('archived')} testID="deal-archive" /> : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {rows.length === 0 && !error ? <Empty>You have no deals yet. Tap + to sell a package at a deal price.</Empty> : null}
          <List>{current.map(row)}</List>
          {archived.length > 0 ? <><SectionTitle>ARCHIVED</SectionTitle><List>{archived.map(row)}</List></> : null}
        </>
      )}
    </CatalogScreen>
  );
}
