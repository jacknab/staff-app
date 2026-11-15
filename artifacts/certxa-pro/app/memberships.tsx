/**
 * MORE → Memberships (owner, 2026-11-15: "match GlossGenius"). Monthly or yearly plans that include visits of chosen
 * services each period and/or a percent off; Certxa charges members' cards on the business's Stripe account. Clients
 * join from their profile (Add membership); members are listed here.
 *   GET/POST /api/pro/membership-plans · PUT /api/pro/membership-plans/:id · GET /api/pro/memberships
 */
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CatalogScreen, Choice, Empty, ErrorLine, Field, Label, List, Loading, Pair, QuietButton, Row, SaveButton, SectionTitle, errorText, money } from '@/components/catalog/CatalogKit';
import { SelectField } from '@/components/SelectField';
import { useColors } from '@/hooks/useColors';
import { usePaymentsReady } from '@/lib/usePaymentsReady';
import { api } from '@/lib/live-api';

type Interval = 'month' | 'year';
type Plan = { id: number; name: string; description: string | null; priceCents: number; interval: Interval; discountPercent: number; isActive: boolean; members: number; includes: Array<{ serviceId: number; visits: number; name: string }> };
type Member = { id: number; customerId: number; clientName: string | null; name: string; status: string; periodEnd: string | null; cancelAtPeriodEnd: boolean; priceCents: number; interval: Interval };
type Draft = { id: number; name: string; description: string; price: string; interval: Interval; discount: string; includes: Array<{ serviceId: number; visits: string }> };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export default function MembershipsScreen() {
  const router = useRouter();
  const colors = useColors();
  const payments = usePaymentsReady();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [services, setServices] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, m, svc] = await Promise.all([api.get<Plan[]>('/api/pro/membership-plans'), api.get<Member[]>('/api/pro/memberships'), api.get<any[]>('/api/services')]);
      setPlans(Array.isArray(p) ? p : []);
      setMembers(Array.isArray(m) ? m : []);
      setServices((Array.isArray(svc) ? svc : []).filter((s) => s.isActive !== false).map((s) => ({ id: Number(s.id), name: String(s.name ?? '') })));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your memberships.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const price = Number(draft.price);
    const discount = draft.discount.trim() ? Number.parseInt(draft.discount, 10) : 0;
    if (!draft.name.trim()) return setError('Give the membership a name.');
    if (!Number.isFinite(price) || price < 0.5) return setError('Enter a price of at least $0.50.');
    if (!Number.isInteger(discount) || discount < 0 || discount > 100) return setError('Enter a discount from 0 to 100%.');
    const includes = draft.includes.filter((i) => i.serviceId > 0).map((i) => ({ serviceId: i.serviceId, visits: Number.parseInt(i.visits, 10) }));
    if (includes.some((i) => !Number.isInteger(i.visits) || i.visits < 1 || i.visits > 100)) return setError('Enter how many visits (1 to 100) for each service.');
    if (new Set(includes.map((i) => i.serviceId)).size !== includes.length) return setError('Each service can be listed once.');
    if (includes.length === 0 && discount === 0) return setError('Add included visits or a member discount.');
    setSaving(true); setError('');
    try {
      const body = { name: draft.name.trim(), description: draft.description.trim() || null, priceCents: Math.round(price * 100), interval: draft.interval, discountPercent: discount, includes };
      if (draft.id > 0) await api.put(`/api/pro/membership-plans/${draft.id}`, body);
      else await api.post('/api/pro/membership-plans', body);
      setDraft(null);
      await load();
    } catch (cause) { setError(errorText(cause, 'Could not save the membership.')); }
    finally { setSaving(false); }
  };

  const setActive = async (isActive: boolean) => {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try { await api.put(`/api/pro/membership-plans/${draft.id}`, { isActive }); setDraft(null); await load(); }
    catch (cause) { setError(errorText(cause, 'Could not change the membership.')); }
    finally { setSaving(false); }
  };

  const editing = draft && draft.id > 0 ? plans.find((p) => p.id === draft.id) : undefined;
  const planHint = (p: Plan) => [
    ...p.includes.map((i) => `${i.visits} × ${i.name}`),
    ...(p.discountPercent > 0 ? [`${p.discountPercent}% off`] : []),
    `${p.members} member${p.members === 1 ? '' : 's'}`,
  ].join(' · ');
  const memberHint = (m: Member) => m.status === 'past_due' ? 'Payment declined · Certxa tries again daily'
    : m.cancelAtPeriodEnd ? `Ends ${day(m.periodEnd)}` : `Renews ${day(m.periodEnd)} · ${money(m.priceCents / 100)}/${m.interval}`;

  return (
    <CatalogScreen
      help="memberships"
      title={draft ? (draft.id > 0 ? 'Edit membership' : 'New membership') : 'Memberships'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, name: '', description: '', price: '', interval: 'month', discount: '', includes: [{ serviceId: 0, visits: '1' }] }); }}
      addLabel="Add a membership"
      testID="memberships"
    >
      {draft ? (
        <>
          <Field label="Name" testID="membership-name" autoCapitalize="words" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Gel Club" />
          <Field label="Description" testID="membership-description" multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="Optional. Clients see it when they join." />
          <Pair>
            <Field label="Price ($)" testID="membership-price" keyboardType="decimal-pad" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^\d.]/g, '') })} placeholder="0.00" />
            <View style={{ flex: 1 }}>
              <Label>Charged every</Label>
              <Choice testID="membership-interval" options={[['month', 'Month'], ['year', 'Year']]} value={draft.interval} onChange={(interval) => setDraft({ ...draft, interval })} />
            </View>
          </Pair>
          <Label>{`Included each ${draft.interval}`}</Label>
          {draft.includes.map((inc, i) => (
            <View key={i} style={styles.includeRow} testID={`membership-include-${i}`}>
              <View style={{ flex: 1 }}>
                <SelectField testID={`membership-include-${i}-service`} title="Service" placeholder="Choose a service" value={inc.serviceId || null}
                  options={services.map((s) => ({ value: s.id, label: s.name }))} onChange={(serviceId) => setDraft({ ...draft, includes: draft.includes.map((x, j) => (j === i ? { ...x, serviceId } : x)) })} />
              </View>
              <TextInput testID={`membership-include-${i}-visits`} keyboardType="number-pad" value={inc.visits} accessibilityLabel="Visits"
                onChangeText={(visits) => setDraft({ ...draft, includes: draft.includes.map((x, j) => (j === i ? { ...x, visits: visits.replace(/\D/g, '') } : x)) })}
                style={[styles.visits, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
              <Text style={[styles.times, { color: colors.mutedForeground }]}>visits</Text>
              <TouchableOpacity accessibilityLabel="Remove" onPress={() => setDraft({ ...draft, includes: draft.includes.filter((_, j) => j !== i) })} style={styles.remove}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          ))}
          <QuietButton label="+ Add a service" testID="membership-add-include" onPress={() => setDraft({ ...draft, includes: [...draft.includes, { serviceId: 0, visits: '1' }] })} />
          <Field label="Member discount on services (%)" testID="membership-discount" keyboardType="number-pad" value={draft.discount} onChangeText={(discount) => setDraft({ ...draft, discount: discount.replace(/\D/g, '') })} placeholder="0" />
          {editing && editing.members > 0 ? <Text style={[styles.note, { color: colors.mutedForeground }]}>Members who already joined keep the price and visits they joined with.</Text> : null}
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="membership-save" />
          {editing?.isActive ? <QuietButton disabled={saving} label="Stop offering" onPress={() => void setActive(false)} testID="membership-off" /> : null}
          {editing && !editing.isActive ? <QuietButton disabled={saving} label="Offer again" onPress={() => void setActive(true)} testID="membership-on" /> : null}
        </>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {payments === false ? (
            <Row testID="memberships-setup-payments" title="Set up card payments first" hint="Members pay by card every month or year." onPress={() => router.push('/payments-intro')} />
          ) : null}
          {plans.length === 0 && !error ? <Empty>No memberships yet. Tap + to make one, for example 1 gel fill a month for $45.</Empty> : null}
          <List>
            {plans.map((p) => (
              <Row key={p.id} testID={`membership-plan-${p.id}`} dim={!p.isActive} title={p.name} hint={p.isActive ? planHint(p) : 'Not offered'} right={`${money(p.priceCents / 100)}/${p.interval === 'month' ? 'mo' : 'yr'}`}
                onPress={() => { setError(''); setDraft({ id: p.id, name: p.name, description: p.description ?? '', price: (p.priceCents / 100).toFixed(2), interval: p.interval, discount: p.discountPercent ? String(p.discountPercent) : '', includes: p.includes.map((i) => ({ serviceId: i.serviceId, visits: String(i.visits) })) }); }} />
            ))}
          </List>
          {members.length > 0 ? (
            <>
              <SectionTitle>MEMBERS</SectionTitle>
              <List>
                {members.map((m) => <Row key={m.id} testID={`membership-member-${m.id}`} title={`${m.clientName || 'Client'} · ${m.name}`} hint={memberHint(m)} onPress={() => router.push({ pathname: '/client/[id]', params: { id: String(m.customerId) } })} />)}
              </List>
            </>
          ) : null}
        </>
      )}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  includeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  visits: { width: 56, height: 52, borderWidth: 1, borderRadius: 14, textAlign: 'center', fontSize: 17, fontFamily: 'Inter_400Regular' },
  times: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  remove: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', marginTop: 14 },
});
