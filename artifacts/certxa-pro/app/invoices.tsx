/**
 * Invoices (owner, 2026-11-18, GlossGenius "invoices"): bill a client with line items, a memo and a due date; Send
 * texts and e-mails them a link to pay by card. Draft → Open (Past due after the due date) → Paid, or Cancelled. Paid
 * invoices can be refunded and a receipt texted. Server: /api/pro/invoices (lib/proInvoices.ts). Money › Invoices.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Item = { label: string; price: number };
type Invoice = { id: number; number: number; appointmentId: number; customerId: number | null; client: string; title: string; memo: string | null; dueOn: string;
  status: 'draft' | 'open' | 'past_due' | 'paid' | 'cancelled'; items: Item[]; totalCents: number; paidCents: number | null; refundedCents: number; paymentMethod: string | null; sentAt: string | null };
type Draft = { id: number; customerId: number | null; clientName: string; title: string; memo: string; dueOn: string; items: { label: string; price: string }[] };

const STATUS: Record<Invoice['status'], string> = { draft: 'Draft', open: 'Open', past_due: 'Past due', paid: 'Paid', cancelled: 'Cancelled' };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default function InvoicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { clients } = useBookingData();
  const [list, setList] = useState<Invoice[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [refund, setRefund] = useState('');
  // One key per opening (as Booking details): a repeated tap is one refund; a new key after each refund that went through.
  const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [refundKey, setRefundKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const open = list?.find((i) => i.id === openId) ?? null;

  const load = useCallback(async () => {
    try { setList((await api.get<{ invoices: Invoice[] }>('/api/pro/invoices')).invoices); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Your invoices could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await work(); await load(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  };

  const save = () => draft && run(async () => {
    const items = draft.items.map((l) => ({ label: l.label.trim(), price: Number(l.price) })).filter((l) => l.label || l.price);
    if (!draft.customerId) throw new ApiError('Choose the client.', 400);
    if (!items.length || items.some((l) => !l.label || !(l.price > 0))) throw new ApiError('Each item needs a name and a price.', 400);
    const body = { customerId: draft.customerId, title: draft.title.trim(), memo: draft.memo.trim() || null, dueOn: draft.dueOn, items };
    if (draft.id) await api.put(`/api/pro/invoices/${draft.id}`, body);
    else setOpenId((await api.post<{ id: number }>('/api/pro/invoices', body)).id);
    setDraft(null);
  });
  const send = (inv: Invoice) => run(async () => {
    const r = await api.post<{ text: boolean; email: boolean }>(`/api/pro/invoices/${inv.id}/send`, {});
    Alert.alert(inv.sentAt ? 'Invoice sent again' : 'Invoice sent', r.text || r.email ? `${inv.client} got it by ${r.text && r.email ? 'text and e-mail' : r.text ? 'text' : 'e-mail'}.` : `${inv.client} has no phone or e-mail, so nothing was sent. Add one to their profile and send it again.`);
  });
  const markPaid = (inv: Invoice, method: string) => run(async () => { await api.post(`/api/pro/invoices/${inv.id}/mark-paid`, { method }); });
  const cancel = (inv: Invoice) => Alert.alert(`Cancel invoice #${inv.number}?`, 'Its link to pay stops working.', [
    { text: 'Keep it', style: 'cancel' }, { text: 'Cancel invoice', style: 'destructive', onPress: () => void run(async () => { await api.post(`/api/pro/invoices/${inv.id}/cancel`, {}); }) },
  ]);
  const remove = (inv: Invoice) => Alert.alert(`Delete draft #${inv.number}?`, 'The draft is deleted.', [
    { text: 'Keep it', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => void run(async () => { await api.del(`/api/pro/invoices/${inv.id}`); setOpenId(null); }) },
  ]);
  const doRefund = (inv: Invoice) => {
    const left = (inv.paidCents ?? 0) - inv.refundedCents;
    const cents = refund.trim() ? Math.round((Number(refund.replace(/[^0-9.]/g, '')) || 0) * 100) : left;
    if (!(cents > 0 && cents <= left)) { setError(`Enter an amount up to ${money(left)}.`); return; }
    Alert.alert(`Refund ${money(cents)}?`, 'A card payment goes back to the client’s card; any other payment is recorded as money you give back.', [
      { text: 'Cancel', style: 'cancel' }, { text: 'Refund', style: 'destructive', onPress: () => void run(async () => { await api.post(`/api/appointments/${inv.appointmentId}/refund`, { amountCents: cents, idempotencyKey: `invoice-${inv.id}-${refundKey}` }); setRefund(''); setRefundKey(newKey()); }) },
    ]);
  };
  const receipt = (inv: Invoice) => run(async () => {
    const phone = clients.find((c) => c.customerId === inv.customerId)?.phone?.replace(/\D/g, '').slice(-10) ?? '';
    if (phone.length !== 10) throw new ApiError(`${inv.client} has no mobile number to text.`, 400);
    await api.post('/api/pos/sms-receipt', { phone, clientName: inv.client, appointmentId: inv.appointmentId, paymentMethod: inv.paymentMethod ?? 'card',
      items: inv.items, discountAmount: 0, taxAmount: 0, tipAmount: 0, grandTotal: (inv.paidCents ?? inv.totalCents) / 100 });
    Alert.alert('Receipt sent', `Texted to ${inv.client}.`);
  });

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const input = [styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }];
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const matches = clientSearch.trim().length < 2 ? [] : clients.filter((c) => [c.name, c.phone, c.email ?? ''].some((v) => v.toLowerCase().includes(clientSearch.trim().toLowerCase()))).slice(0, 8);
  const draftTotal = draft ? draft.items.reduce((n, l) => n + (Number(l.price) || 0), 0) : 0;
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="invoices-screen">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => (draft ? setDraft(null) : open ? setOpenId(null) : router.back())} style={styles.navSide} accessibilityLabel="Back" testID="invoices-back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="invoices" style={[styles.navTitle, { color: colors.foreground }]}>{draft ? (draft.id ? 'Edit invoice' : 'New invoice') : open ? `Invoice #${open.number}` : 'Invoices'}</HelpTitle>
        {!draft && !open ? <TouchableOpacity testID="invoice-add" accessibilityLabel="New invoice" onPress={() => { setError(''); setClientSearch(''); setDraft({ id: 0, customerId: null, clientName: '', title: '', memo: '', dueOn: inDays(7), items: [{ label: '', price: '' }] }); }} style={styles.navSide}><Feather name="plus" size={24} color={colors.primary} /></TouchableOpacity> : <View style={styles.navSide} />}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {draft ? (<>
          <Text style={[styles.label, { color: colors.foreground }]}>Client</Text>
          {draft.customerId ? (
            <View style={[styles.row, card, styles.boxed]}>
              <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]}>{draft.clientName}</Text>
              <TouchableOpacity testID="invoice-client-clear" onPress={() => setDraft({ ...draft, customerId: null, clientName: '' })}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
          ) : (<>
            <TextInput testID="invoice-client-search" value={clientSearch} onChangeText={setClientSearch} placeholder="Name, phone or e-mail" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" style={input} />
            {matches.map((c) => (
              <TouchableOpacity key={c.customerId} testID={`invoice-client-${c.customerId}`} onPress={() => { setDraft({ ...draft, customerId: c.customerId, clientName: c.name }); setClientSearch(''); }} style={styles.pick}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</Text>
              </TouchableOpacity>
            ))}
          </>)}
          <Text style={[styles.label, { color: colors.foreground }]}>Title</Text>
          <TextInput testID="invoice-title" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title: title.slice(0, 80) })} placeholder="e.g. Bridal party, Dec 12" placeholderTextColor={colors.mutedForeground} style={input} />
          <Text style={[styles.label, { color: colors.foreground }]}>Items</Text>
          {draft.items.map((l, i) => (
            <View key={i} style={[styles.pair, { marginBottom: 8 }]}>
              <TextInput testID={`invoice-item-label-${i}`} value={l.label} onChangeText={(label) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, label: label.slice(0, 60) } : x)) })} placeholder="Service, product or charge" placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 2 }]} />
              <TextInput testID={`invoice-item-price-${i}`} keyboardType="decimal-pad" value={l.price} onChangeText={(price) => setDraft({ ...draft, items: draft.items.map((x, j) => (j === i ? { ...x, price: price.replace(/[^\d.]/g, '') } : x)) })} placeholder="$" placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 1 }]} />
              {draft.items.length > 1 ? <TouchableOpacity accessibilityLabel="Remove item" onPress={() => setDraft({ ...draft, items: draft.items.filter((_, j) => j !== i) })} style={styles.x}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity> : null}
            </View>
          ))}
          {draft.items.length < 20 ? <TouchableOpacity testID="invoice-item-add" onPress={() => setDraft({ ...draft, items: [...draft.items, { label: '', price: '' }] })} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}><Text style={[styles.rowTitle, { color: colors.primary }]}>Add an item</Text></TouchableOpacity> : null}
          <Text style={[styles.total, { color: colors.foreground }]}>{`Total ${money(Math.round(draftTotal * 100))}`}</Text>
          <Text style={[styles.label, { color: colors.foreground }]}>Due date</Text>
          <TextInput testID="invoice-due" value={draft.dueOn} onChangeText={(v) => setDraft({ ...draft, dueOn: v.replace(/[^\d-]/g, '').slice(0, 10) })} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} style={input} />
          <Text style={[styles.label, { color: colors.foreground }]}>Memo <Text style={{ color: colors.mutedForeground }}>(optional)</Text></Text>
          <TextInput testID="invoice-memo" value={draft.memo} onChangeText={(memo) => setDraft({ ...draft, memo: memo.slice(0, 500) })} placeholder="A note on the invoice" placeholderTextColor={colors.mutedForeground} multiline style={[...input, { height: 80, paddingTop: 12, textAlignVertical: 'top' }]} />
          {error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity testID="invoice-save" disabled={busy || !draft.title.trim()} onPress={() => void save()} style={[styles.action, { backgroundColor: busy || !draft.title.trim() ? colors.muted : colors.primary }]}>
            <Text style={[styles.actionText, { color: busy || !draft.title.trim() ? colors.mutedForeground : colors.primaryForeground }]}>{busy ? 'Saving…' : 'Save draft'}</Text>
          </TouchableOpacity>
          <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: 'center' }]}>Nothing is sent until you tap Send.</Text>
        </>) : open ? (<>
          <View style={[styles.card, card]}>
            <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 0 }]}>{`${STATUS[open.status]} · ${open.client} · due ${dayLabel(open.dueOn)}`}</Text>
            <Text style={[styles.big, { color: colors.foreground }]}>{open.title}</Text>
            {open.items.map((l, i) => (
              <View key={i} style={styles.line}><Text style={[styles.lineText, { color: colors.foreground, flex: 1 }]}>{l.label}</Text><Text style={[styles.lineText, { color: colors.foreground }]}>{money(Math.round(l.price * 100))}</Text></View>
            ))}
            <View style={[styles.line, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8 }]}><Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]}>Total</Text><Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(open.totalCents)}</Text></View>
            {open.memo ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{open.memo}</Text> : null}
            {open.status === 'paid' ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{`Paid ${money(open.paidCents ?? 0)}${open.paymentMethod ? ` by ${open.paymentMethod.split(',').map((p) => p.split(':')[0].replace(/_/g, ' ')).join(' + ')}` : ''}${open.refundedCents ? ` · refunded ${money(open.refundedCents)}` : ''}`}</Text> : null}
          </View>
          {error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : null}
          {open.status === 'draft' ? <>
            <TouchableOpacity testID="invoice-send" disabled={busy} onPress={() => void send(open)} style={[styles.action, { backgroundColor: colors.primary }]}><Text style={[styles.actionText, { color: colors.primaryForeground }]}>{busy ? 'Sending…' : 'Send'}</Text></TouchableOpacity>
            <TouchableOpacity testID="invoice-edit" disabled={busy} onPress={() => setDraft({ id: open.id, customerId: open.customerId, clientName: open.client, title: open.title, memo: open.memo ?? '', dueOn: open.dueOn, items: open.items.map((l) => ({ label: l.label, price: l.price.toFixed(2) })) })} style={[styles.action, styles.outline, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.actionText, { color: colors.foreground }]}>Edit</Text></TouchableOpacity>
            <TouchableOpacity testID="invoice-delete" disabled={busy} onPress={() => remove(open)} style={styles.textAction}><Text style={[styles.actionText, { color: colors.destructive }]}>Delete draft</Text></TouchableOpacity>
          </> : open.status === 'open' || open.status === 'past_due' ? <>
            <TouchableOpacity testID="invoice-resend" disabled={busy} onPress={() => void send(open)} style={[styles.action, { backgroundColor: colors.primary }]}><Text style={[styles.actionText, { color: colors.primaryForeground }]}>{busy ? 'Sending…' : 'Send again'}</Text></TouchableOpacity>
            <Text style={[styles.label, { color: colors.foreground }]}>Paid another way?</Text>
            <SelectField testID="invoice-mark-paid" title="Mark as paid" placeholder="Mark as paid…" value={null as string | null}
              options={[['cash', 'Cash'], ['check', 'Check'], ['venmo', 'Venmo'], ['zelle', 'Zelle'], ['paypal', 'PayPal'], ['other', 'Other']].map(([value, label]) => ({ value, label }))}
              onChange={(method) => Alert.alert('Mark as paid?', `${money(open.totalCents)} is recorded as paid by ${method}. The link to pay stops working.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark as paid', onPress: () => void markPaid(open, method) }])} />
            <TouchableOpacity testID="invoice-cancel" disabled={busy} onPress={() => cancel(open)} style={styles.textAction}><Text style={[styles.actionText, { color: colors.destructive }]}>Cancel invoice</Text></TouchableOpacity>
          </> : open.status === 'paid' ? <>
            <TouchableOpacity testID="invoice-receipt" disabled={busy} onPress={() => void receipt(open)} style={[styles.action, styles.outline, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.actionText, { color: colors.foreground }]}>Text a receipt</Text></TouchableOpacity>
            {(open.paidCents ?? 0) - open.refundedCents > 0 ? <>
              <Text style={[styles.label, { color: colors.foreground }]}>Refund</Text>
              <View style={styles.pair}>
                <TextInput testID="invoice-refund-amount" keyboardType="decimal-pad" value={refund} onChangeText={setRefund} placeholder={`All of it (${money((open.paidCents ?? 0) - open.refundedCents)})`} placeholderTextColor={colors.mutedForeground} style={[...input, { flex: 1 }]} />
                <TouchableOpacity testID="invoice-refund" disabled={busy} onPress={() => doRefund(open)} style={[styles.small, { backgroundColor: colors.secondary }]}><Text style={[styles.actionText, { color: colors.primary }]}>Refund</Text></TouchableOpacity>
              </View>
            </> : null}
          </> : null}
        </>) : !list ? (error ? <Text style={[styles.hint, { color: colors.destructive }]}>{error}</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />) : list.length === 0 ? (
          <Text style={[styles.muted, { color: colors.mutedForeground, marginTop: 20 }]}>No invoices yet. Tap + to bill a client: add what it’s for, the amount and a due date, then Send. They get a text and e-mail with a link to pay by card.</Text>
        ) : (
          <View style={[styles.list, card]}>
            {list.map((inv, i) => (
              <TouchableOpacity key={inv.id} testID={`invoice-${inv.id}`} onPress={() => { setError(''); setRefund(''); setRefundKey(newKey()); setOpenId(inv.id); }} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{`#${inv.number} · ${inv.client}`}</Text>
                  <Text style={[styles.hint, { color: colors.mutedForeground, marginTop: 2 }]}>{`${inv.title} · due ${dayLabel(inv.dueOn)}`}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(inv.totalCents)}</Text>
                  <Text style={[styles.state, { color: inv.status === 'past_due' ? colors.destructive : inv.status === 'paid' ? colors.primary : colors.mutedForeground }]}>{STATUS[inv.status]}</Text>
                </View>
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
  hint: { fontSize: 14, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 8 },
  pair: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  x: { width: 32, alignItems: 'center' },
  pick: { paddingVertical: 10 },
  boxed: { borderWidth: 1, borderRadius: 12 },
  total: { fontSize: 17, fontFamily: 'Inter_700Bold', marginTop: 10, textAlign: 'right' },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, ...cardShadow },
  big: { fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 6, marginBottom: 10 },
  line: { flexDirection: 'row', paddingVertical: 4 },
  lineText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  action: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  outline: { borderWidth: 1 },
  small: { height: 50, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  textAction: { alignItems: 'center', paddingVertical: 14 },
  actionText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  state: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 2 },
  muted: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
});
