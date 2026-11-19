/**
 * MORE → Referrals (owner, 2026-11-15: "match GlossGenius"). A reward for clients who send a friend: the new client gets
 * credit at once, the client who referred them when the new client's first visit is paid. Who referred whom is chosen on
 * the new client's profile; credit is used at checkout.
 *   GET /api/pro/referrals · PUT /api/pro/referrals/program
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useRouter } from 'expo-router';
import { CatalogScreen, Empty, ErrorLine, Field, List, Loading, Pair, Row, SaveButton, SectionTitle, Toggle, errorText, money } from '@/components/catalog/CatalogKit';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

type Program = { enabled: boolean; referrerRewardCents: number; friendRewardCents: number };
type Referral = { id: number; referrerId: number; referrerName: string | null; friendId: number; friendName: string | null; referrerRewardCents: number; friendRewardCents: number; rewardedAt: string | null; createdAt: string };

export default function ReferralsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [enabled, setEnabled] = useState(false);
  const [referrer, setReferrer] = useState('10.00');
  const [friend, setFriend] = useState('10.00');
  const [list, setList] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.get<{ program: Program; referrals: Referral[] }>('/api/pro/referrals');
      setEnabled(r.program.enabled);
      setReferrer((r.program.referrerRewardCents / 100).toFixed(2));
      setFriend((r.program.friendRewardCents / 100).toFixed(2));
      setList(Array.isArray(r.referrals) ? r.referrals : []);
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load referrals.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    const a = Number(referrer || '0'), b = Number(friend || '0');
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 1000 || b > 1000) return setError('Enter rewards from $0 to $1,000.');
    setSaving(true); setError(''); setSaved('');
    try {
      await api.put('/api/pro/referrals/program', { enabled, referrerRewardCents: Math.round(a * 100), friendRewardCents: Math.round(b * 100) });
      setSaved('Saved.');
    } catch (cause) { setError(errorText(cause, 'Could not save.')); }
    finally { setSaving(false); }
  };

  return (
    <CatalogScreen help="referrals" title="Referrals" onBack={() => router.back()} testID="referrals">
      {loading ? <Loading /> : (
        <>
          <Toggle testID="referrals-enabled" title="Reward referrals" hint="Credit for clients who send you a friend, and for the friend." value={enabled} onChange={setEnabled} />
          <Pair>
            <Field label="Client who referred ($)" testID="referrals-referrer" keyboardType="decimal-pad" value={referrer} onChangeText={(v) => setReferrer(v.replace(/[^\d.]/g, ''))} placeholder="10.00" />
            <Field label="New client ($)" testID="referrals-friend" keyboardType="decimal-pad" value={friend} onChangeText={(v) => setFriend(v.replace(/[^\d.]/g, ''))} placeholder="10.00" />
          </Pair>
          <Text style={[styles.note, { color: colors.mutedForeground }]}>The new client gets their credit when you save who referred them (on their profile). The client who referred them gets theirs after the new client’s first paid visit. Credit is used at checkout.</Text>
          <ErrorLine>{error}</ErrorLine>
          {saved ? <Text style={[styles.note, { color: colors.primary }]}>{saved}</Text> : null}
          <SaveButton saving={saving} onPress={() => void save()} testID="referrals-save" />
          <SectionTitle>REFERRALS</SectionTitle>
          {list.length === 0 ? <Empty>No referrals yet. On a new client’s profile, choose who referred them.</Empty> : (
            <List>
              {list.map((r) => (
                <Row key={r.id} testID={`referral-${r.id}`} title={`${r.referrerName || 'Client'} → ${r.friendName || 'Client'}`}
                  hint={r.rewardedAt ? `Both rewarded · ${money(r.referrerRewardCents / 100)} and ${money(r.friendRewardCents / 100)}` : `${money(r.friendRewardCents / 100)} to the new client · ${money(r.referrerRewardCents / 100)} after their first paid visit`}
                  onPress={() => router.push({ pathname: '/client/[id]', params: { id: String(r.friendId) } })} />
              ))}
            </List>
          )}
        </>
      )}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({ note: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', marginTop: 14 } });
