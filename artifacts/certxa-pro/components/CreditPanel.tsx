/**
 * A client's credit and referrals on their profile (owner, 2026-11-15; app/referrals.tsx). Shows the credit they can use
 * at checkout, who referred them (or Referred by to choose, once), and the friends they referred. Hidden while the
 * business has no referral program and the client has no credit.
 */
import { useCallback, useState } from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { useBookingData } from '@/contexts/BookingContext';
import { SelectField } from '@/components/SelectField';
import { SectionTitle } from '@/components/look/SectionHeader';
import { cardShadow } from '@/components/look/tokens';

type Credit = { balanceCents: number; referredBy: { id: number; name: string | null } | null; referred: Array<{ id: number; name: string | null; rewardedAt: string | null }>; program: { enabled: boolean } };
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function CreditPanel({ customerId }: { customerId: number }) {
  const colors = useColors();
  const { clients } = useBookingData();
  const [data, setData] = useState<Credit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setData(await api.get<Credit>(`/api/pro/clients/${customerId}/credit`)); setError(''); }
    catch { setError('Could not load credit.'); }
  }, [customerId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const choose = async (referrerId: number) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await api.post(`/api/pro/clients/${customerId}/referred-by`, { referrerId }); await load(); }
    catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'Could not save.'); }
    finally { setBusy(false); }
  };

  // The client's own referral link (owner, 2026-11-18): a friend who books through it is saved as referred by them.
  const shareLink = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await api.get<{ url: string; friendRewardCents: number }>(`/api/pro/clients/${customerId}/referral-link`);
      await Share.share({ message: `Book with my link${r.friendRewardCents > 0 ? ` and get ${money(r.friendRewardCents)} off your first visit` : ''}: ${r.url}`, url: r.url });
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'Could not get the link.'); }
    finally { setBusy(false); }
  };

  if (!data || (!data.program.enabled && data.balanceCents <= 0 && !data.referredBy && data.referred.length === 0)) return null;
  const others = clients.filter((c) => c.customerId !== customerId).map((c) => ({ value: c.customerId, label: c.name || c.phone || 'Client' }));
  const line = (label: string, value: string, i: number) => (
    <View key={label} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
    </View>
  );

  return (
    <View testID="credit-panel">
      <SectionTitle style={styles.section}>Credit & referrals</SectionTitle>
      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          line('Credit', money(data.balanceCents), 0),
          ...(data.referredBy ? [line('Referred by', data.referredBy.name || 'Client', 1)] : []),
          ...(data.referred.length ? [line('Referred', data.referred.map((r) => `${r.name || 'Client'}${r.rewardedAt ? '' : ' (no paid visit yet)'}`).join(', '), 2)] : []),
        ]}
      </View>
      {data.program.enabled ? (
        <TouchableOpacity testID="credit-share-referral" disabled={busy} onPress={() => void shareLink()} style={[styles.share, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="share" size={18} color={colors.primary} />
          <Text style={[styles.shareText, { color: colors.foreground }]}>Share referral link</Text>
        </TouchableOpacity>
      ) : null}
      {!data.referredBy && data.program.enabled && others.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <SelectField testID="credit-referred-by" title="Who referred this client?" placeholder={busy ? 'Saving…' : 'Referred by…'} value={null} options={others} onChange={(v) => void choose(v)} />
        </View>
      ) : null}
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 26, marginBottom: 12 },
  box: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  label: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  value: { flex: 1, textAlign: 'right', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 10 },
  share: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 1, borderRadius: 14, minHeight: 50, marginTop: 10 },
  shareText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
