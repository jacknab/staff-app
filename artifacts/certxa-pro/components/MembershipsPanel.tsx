/**
 * A client's memberships on their profile (owner, 2026-11-15; app/memberships.tsx makes the plans).
 * Each membership: what's left this period, when it renews or ends, and Cancel. Add membership: charge the card on
 * file now, or send the client the link to join and pay on their phone.
 */
import { textHeldBack } from '@/lib/smsCreditNotice';
import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Alert } from '@/lib/appAlert';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { SelectField } from '@/components/SelectField';
import { SectionTitle } from '@/components/look/SectionHeader';
import { cardShadow } from '@/components/look/tokens';

type Membership = {
  id: number; planId: number; name: string; priceCents: number; interval: string; discountPercent: number; status: string;
  includes: Array<{ serviceId: number; name: string; visits: number; left: number }>; periodEnd: string | null; cancelAtPeriodEnd: boolean; lastError: string | null; link: string | null;
};
type Plan = { id: number; name: string; priceCents: number; interval: string; isActive: boolean };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

export function MembershipsPanel({ customerId, hasCard }: { customerId: number; hasCard: boolean }) {
  const colors = useColors();
  const [list, setList] = useState<Membership[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [m, p] = await Promise.all([api.get<Membership[]>(`/api/pro/memberships?customerId=${customerId}`), api.get<Plan[]>('/api/pro/membership-plans')]);
      setList(Array.isArray(m) ? m : []);
      setPlans((Array.isArray(p) ? p : []).filter((x) => x.isActive));
      setError('');
    } catch { setError('Could not load memberships.'); }
    finally { setLoaded(true); }
  }, [customerId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const run = async (work: () => Promise<unknown>, fallback: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); await load(); }
    catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : fallback); }
    finally { setBusy(false); }
  };

  const add = (planId: number) => {
    const plan = plans.find((p) => p.id === planId);
    if (!plan) return;
    const price = `${money(plan.priceCents)}/${plan.interval}`;
    const sendLink = () => void run(async () => {
      const since = Date.now();
      const r = await api.post<{ sentVia: string | null }>('/api/pro/memberships/link', { planId, customerId, send: true });
      if (textHeldBack(since)) return;
      Alert.alert(r.sentVia ? 'Link sent' : 'Link made', r.sentVia === 'email' ? 'The client was e-mailed the link to join.' : r.sentVia === 'sms' ? 'The client was texted the link to join.' : 'The client has no e-mail or mobile number, so nothing was sent.');
    }, 'The link could not be sent.');
    Alert.alert(`Add ${plan.name}?`, hasCard ? `${price}. Charge the card on file now, or send the client a link to join and pay.` : `${price}. The client gets a link to join and pay with their card.`, [
      { text: 'Not now', style: 'cancel' },
      ...(hasCard ? [{ text: 'Charge card on file', onPress: () => void run(() => api.post('/api/pro/memberships/start', { planId, customerId }), 'The card could not be charged.') }] : []),
      { text: 'Send link to join', onPress: sendLink },
    ]);
  };

  const cancel = (m: Membership) => {
    if (m.status === 'pending') return void run(() => api.post(`/api/pro/memberships/${m.id}/cancel`, { now: true }), 'Could not cancel.');
    Alert.alert(`Cancel ${m.name}?`, m.status === 'past_due' ? 'It ends now. Nothing more is charged.' : `End it on ${day(m.periodEnd)} (already paid until then), or now. Nothing is refunded either way.`, [
      { text: 'Keep it', style: 'cancel' },
      ...(m.status === 'active' ? [{ text: `End on ${day(m.periodEnd)}`, onPress: () => void run(() => api.post(`/api/pro/memberships/${m.id}/cancel`, { now: false }), 'Could not cancel.') }] : []),
      { text: 'End now', style: 'destructive' as const, onPress: () => void run(() => api.post(`/api/pro/memberships/${m.id}/cancel`, { now: true }), 'Could not cancel.') },
    ]);
  };

  const live = list.filter((m) => m.status !== 'cancelled');
  if (!loaded || (plans.length === 0 && live.length === 0)) return null;
  const offer = plans.filter((p) => !live.some((m) => m.planId === p.id && m.status !== 'pending'));
  const statusLine = (m: Membership) => m.status === 'pending' ? 'Link sent · not joined yet'
    : m.status === 'past_due' ? `Payment declined${m.lastError ? `: ${m.lastError}` : ''} · tried again daily`
    : m.cancelAtPeriodEnd ? `Ends ${day(m.periodEnd)}` : `Renews ${day(m.periodEnd)} · ${money(m.priceCents)}/${m.interval}`;

  return (
    <View testID="memberships-panel">
      <SectionTitle style={styles.section}>Memberships</SectionTitle>
      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {live.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>Not a member.</Text> : live.map((m, i) => (
          <View key={m.id} testID={`memberships-row-${m.id}`} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{m.name}</Text>
            <Text style={[styles.sub, { color: m.status === 'past_due' ? colors.destructive : colors.mutedForeground }]}>{statusLine(m)}</Text>
            {m.status === 'active' || m.status === 'past_due' ? (
              <Text style={[styles.sub, { color: colors.foreground }]}>
                {[...m.includes.map((x) => `${x.name}: ${x.left} of ${x.visits} left`), ...(m.discountPercent > 0 ? [`${m.discountPercent}% off`] : [])].join(' · ')}
              </Text>
            ) : null}
            {!m.cancelAtPeriodEnd ? (
              <TouchableOpacity testID={`memberships-cancel-${m.id}`} disabled={busy} onPress={() => cancel(m)} style={{ marginTop: 8 }}>
                <Text style={[styles.link, { color: colors.primary }]}>{m.status === 'pending' ? 'Cancel the link' : 'Cancel membership'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
      {offer.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <SelectField testID="memberships-add" title="Add membership" placeholder={busy ? 'Working…' : 'Add membership'} value={null}
            options={offer.map((p) => ({ value: p.id, label: `${p.name} · ${money(p.priceCents)}/${p.interval}` }))} onChange={add} />
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26, marginBottom: 12 },
  box: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', ...cardShadow },
  row: { paddingHorizontal: 14, paddingVertical: 12 },
  title: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 3, lineHeight: 20 },
  link: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  empty: { fontSize: 15, fontFamily: 'Inter_400Regular', padding: 14 },
  error: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 10 },
});
