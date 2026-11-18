/**
 * Promo codes (owner, 2026-11-18, GlossGenius "promo codes"): named discounts like SUMMER25, applied at checkout and
 * typed by clients when they book on the website. A new code is a draft (change it or delete it); Publish makes it work
 * and fixes it; End stops it. Server: /api/pro/promo-codes (lib/proPromoCodes.ts). More › Client Growth.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { SelectField } from '@/components/SelectField';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

import { useInPane } from '@/components/TabletSplit';
type Code = { id: number; code: string; kind: 'percent' | 'amount'; value: number; appliesTo: 'all' | 'services' | 'products'; newClientsOnly: boolean;
  maxUses: number | null; maxPerClient: number | null; startsOn: string | null; endsOn: string | null; status: 'draft' | 'published' | 'ended'; uses: number };
type Draft = { id: number; code: string; kind: 'percent' | 'amount'; value: string; appliesTo: 'all' | 'services' | 'products'; newClientsOnly: boolean;
  maxUses: string; maxPerClient: string; startsOn: string; endsOn: string };

const blank: Draft = { id: 0, code: '', kind: 'percent', value: '20', appliesTo: 'all', newClientsOnly: false, maxUses: '', maxPerClient: '', startsOn: '', endsOn: '' };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const offLabel = (c: Pick<Code, 'kind' | 'value' | 'appliesTo'>) => c.kind === 'amount' ? `$${(c.value / 100).toFixed(2)} off` : `${c.value}% off${c.appliesTo === 'services' ? ' services' : c.appliesTo === 'products' ? ' products' : ''}`;
/** Draft, Scheduled, Active, Expired or Ended, as GlossGenius shows them. */
const stateOf = (c: Code) => c.status === 'draft' ? 'Draft' : c.status === 'ended' ? 'Ended' : c.endsOn && today() > c.endsOn ? 'Expired' : c.startsOn && today() < c.startsOn ? 'Scheduled' : 'Active';

export default function PromoCodesScreen() {
  const colors = useColors();
  const inPane = useInPane();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<Code | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setCodes((await api.get<{ codes: Code[] }>('/api/pro/promo-codes')).codes); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Your promo codes could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); await load(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };
  const save = () => draft && run(async () => {
    const value = draft.kind === 'amount' ? Math.round((Number(draft.value) || 0) * 100) : Math.round(Number(draft.value) || 0);
    const body = { code: draft.code.trim(), kind: draft.kind, value, appliesTo: draft.appliesTo, newClientsOnly: draft.newClientsOnly,
      maxUses: draft.maxUses ? Number(draft.maxUses) : null, maxPerClient: draft.maxPerClient ? Number(draft.maxPerClient) : null,
      startsOn: draft.startsOn.trim() || null, endsOn: draft.endsOn.trim() || null };
    if (draft.id) await api.put(`/api/pro/promo-codes/${draft.id}`, body); else await api.post('/api/pro/promo-codes', body);
    setDraft(null);
  });
  const publish = (c: Code) => Alert.alert(`Publish ${c.code}?`, 'Once published, the code works at checkout and on your website, and it can’t be changed.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Publish code', onPress: () => void run(async () => { await api.post(`/api/pro/promo-codes/${c.id}/publish`, {}); setOpen(null); }) },
  ]);
  const end = (c: Code) => Alert.alert(`End ${c.code}?`, 'It stops working at checkout and on your website. Bookings that already have it keep it.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'End code', style: 'destructive', onPress: () => void run(async () => { await api.post(`/api/pro/promo-codes/${c.id}/end`, {}); setOpen(null); }) },
  ]);
  const remove = (c: Code) => Alert.alert(`Delete ${c.code}?`, 'The draft is deleted.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(async () => { await api.del(`/api/pro/promo-codes/${c.id}`); setOpen(null); setDraft(null); }) },
  ]);

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const input = [styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const back = () => (draft ? setDraft(null) : open ? setOpen(null) : router.back());
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="promo-codes-screen">
      <AppBackground />
      <View style={styles.nav}>
        {!inPane || !!draft || !!open ? <TouchableOpacity onPress={back} style={styles.navSide} accessibilityLabel="Back" testID="promo-back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity> : <View style={styles.navSide} />}
        <HelpTitle help="promoCodes" style={[styles.navTitle, { color: colors.foreground }]}>{draft ? (draft.id ? 'Edit draft' : 'New promo code') : open ? open.code : 'Promo codes'}</HelpTitle>
        {!draft && !open ? <TouchableOpacity testID="promo-add" accessibilityLabel="New promo code" onPress={() => { setError(''); setDraft({ ...blank }); }} style={styles.navSide}><Feather name="plus" size={24} color={colors.primary} /></TouchableOpacity> : <View style={styles.navSide} />}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {draft ? (<>
          <Text style={[styles.label, { color: colors.foreground }]}>Code name</Text>
          <TextInput testID="promo-code" value={draft.code} onChangeText={(v) => setDraft({ ...draft, code: v.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase().slice(0, 32) })} placeholder="SUMMER25" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" style={input} />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>3 to 32 letters, numbers, hyphens or underscores.</Text>
          <Text style={[styles.label, { color: colors.foreground }]}>Discount</Text>
          <SelectField testID="promo-kind" title="Discount" value={draft.kind} options={[{ value: 'percent' as const, label: 'Percent off' }, { value: 'amount' as const, label: 'Amount off ($)' }]} onChange={(kind) => setDraft({ ...draft, kind, value: kind === 'percent' ? '20' : '10' })} />
          <TextInput testID="promo-value" keyboardType="decimal-pad" value={draft.value} onChangeText={(v) => setDraft({ ...draft, value: v.replace(/[^\d.]/g, '') })} placeholder={draft.kind === 'percent' ? '20' : '10.00'} placeholderTextColor={colors.mutedForeground} style={[...input, { marginTop: 8 }]} />
          {draft.kind === 'percent' ? <>
            <Text style={[styles.label, { color: colors.foreground }]}>Applies to</Text>
            <SelectField testID="promo-applies" title="Applies to" value={draft.appliesTo} options={[{ value: 'all' as const, label: 'The whole visit' }, { value: 'services' as const, label: 'Services only' }, { value: 'products' as const, label: 'Products only' }]} onChange={(appliesTo) => setDraft({ ...draft, appliesTo })} />
          </> : <Text style={[styles.hint, { color: colors.mutedForeground }]}>An amount off comes off the whole visit.</Text>}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}><Text style={[styles.rowTitle, { color: colors.foreground }]}>New clients only</Text><Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 2 }]}>Only a client’s first paid visit.</Text></View>
            <Switch testID="promo-new-only" value={draft.newClientsOnly} onValueChange={(newClientsOnly) => setDraft({ ...draft, newClientsOnly })} trackColor={{ true: colors.primary, false: colors.border }} />
          </View>
          <View style={styles.pair}>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Total uses</Text><TextInput testID="promo-max" keyboardType="number-pad" value={draft.maxUses} onChangeText={(v) => setDraft({ ...draft, maxUses: v.replace(/\D/g, '') })} placeholder="No limit" placeholderTextColor={colors.mutedForeground} style={input} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Uses per client</Text><TextInput testID="promo-max-client" keyboardType="number-pad" value={draft.maxPerClient} onChangeText={(v) => setDraft({ ...draft, maxPerClient: v.replace(/\D/g, '') })} placeholder="No limit" placeholderTextColor={colors.mutedForeground} style={input} /></View>
          </View>
          <View style={styles.pair}>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Starts</Text><TextInput testID="promo-start" value={draft.startsOn} onChangeText={(v) => setDraft({ ...draft, startsOn: v.replace(/[^\d-]/g, '').slice(0, 10) })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={input} /></View>
            <View style={{ flex: 1 }}><Text style={[styles.label, { color: colors.foreground }]}>Ends</Text><TextInput testID="promo-end" value={draft.endsOn} onChangeText={(v) => setDraft({ ...draft, endsOn: v.replace(/[^\d-]/g, '').slice(0, 10) })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={input} /></View>
          </View>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>Leave the dates empty to keep it on until you end it.</Text>
          {error ? <Text style={[styles.hint, { color: colors.destructive, marginTop: 10 }]}>{error}</Text> : null}
          <TouchableOpacity testID="promo-save" disabled={busy || draft.code.length < 3} onPress={() => void save()} style={[styles.action, { backgroundColor: busy || draft.code.length < 3 ? colors.muted : colors.primary }]}>
            <Text style={[styles.actionText, { color: busy || draft.code.length < 3 ? colors.mutedForeground : colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save draft'}</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: 'center', marginTop: 8 }]}>A draft doesn’t work yet. Publish it when it’s ready.</Text>
        </>) : open ? (<>
          <View style={[styles.card, card]}>
            <Text style={[styles.big, { color: colors.foreground }]}>{offLabel(open)}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 6 }]}>{stateOf(open)} · {open.uses} use{open.uses === 1 ? '' : 's'}{open.maxUses ? ` of ${open.maxUses}` : ''}</Text>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>{[open.newClientsOnly ? 'New clients only' : 'All clients', open.maxPerClient ? `${open.maxPerClient} per client` : null, open.startsOn ? `from ${open.startsOn}` : null, open.endsOn ? `until ${open.endsOn}` : null].filter(Boolean).join(' · ')}</Text>
          </View>
          {error ? <Text style={[styles.hint, { color: colors.destructive, marginTop: 10 }]}>{error}</Text> : null}
          {open.status === 'draft' ? <>
            <TouchableOpacity testID="promo-publish" disabled={busy} onPress={() => publish(open)} style={[styles.action, { backgroundColor: colors.primary }]}><Text style={[styles.actionText, { color: colors.primaryForeground }]}>Publish</Text></TouchableOpacity>
            <TouchableOpacity testID="promo-edit" disabled={busy} onPress={() => { setDraft({ id: open.id, code: open.code, kind: open.kind, value: open.kind === 'amount' ? (open.value / 100).toFixed(2) : String(open.value), appliesTo: open.appliesTo, newClientsOnly: open.newClientsOnly, maxUses: open.maxUses ? String(open.maxUses) : '', maxPerClient: open.maxPerClient ? String(open.maxPerClient) : '', startsOn: open.startsOn ?? '', endsOn: open.endsOn ?? '' }); setOpen(null); }} style={[styles.action, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.actionText, { color: colors.foreground }]}>Edit</Text></TouchableOpacity>
            <TouchableOpacity testID="promo-delete" disabled={busy} onPress={() => remove(open)} style={styles.textAction}><Text style={[styles.actionText, { color: colors.destructive }]}>Delete draft</Text></TouchableOpacity>
          </> : open.status === 'published' ? (
            <TouchableOpacity testID="promo-end" disabled={busy} onPress={() => end(open)} style={[styles.action, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.actionText, { color: colors.foreground }]}>End code</Text></TouchableOpacity>
          ) : null}
        </>) : !codes ? (error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />) : codes.length === 0 ? (
          <Text style={[styles.muted, { color: colors.mutedForeground, marginTop: 20 }]}>No promo codes yet. Tap + to make one, like SUMMER25 for 20% off. Share it in a campaign or on social media; clients type it when they book online, and you apply it at checkout.</Text>
        ) : (
          <View style={[styles.list, card]}>
            {codes.map((c, i) => (
              <TouchableOpacity key={c.id} testID={`promo-${c.id}`} onPress={() => { setError(''); setOpen(c); }} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{c.code}</Text>
                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 2 }]}>{offLabel(c)} · {c.uses} use{c.uses === 1 ? '' : 's'}</Text>
                </View>
                <Text style={[styles.state, { color: stateOf(c) === 'Active' ? colors.primary : colors.mutedForeground }]}>{stateOf(c)}</Text>
                <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  navTitle: { fontSize: 22, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 6 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 16, marginBottom: 8 },
  input: { height: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, fontFamily: 'Inter_400Regular' },
  hint: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 6 },
  pair: { flexDirection: 'row', gap: 10 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, ...cardShadow },
  big: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  action: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  textAction: { alignItems: 'center', paddingVertical: 14 },
  actionText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  state: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  muted: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
});
