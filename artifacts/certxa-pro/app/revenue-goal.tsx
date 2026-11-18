/**
 * Weekly revenue goal (owner, 2026-11-18, GlossGenius "set a weekly revenue goal"): the goal, this week's progress
 * (Sunday to Saturday), − / + $100 or a typed amount, and past weeks against the goal they had. Server: GET/PUT
 * /api/pro/revenue-goal (lib/proRevenueGoal.ts). Home shows the progress.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Week = { weekStart: string; goalCents: number; cents: number };
type Goal = { goalCents: number; week: Week; history: Week[] };

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const weekLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function RevenueGoalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const g = await api.get<Goal>('/api/pro/revenue-goal');
      setGoal(g); setDraft(g.goalCents > 0 ? String(Math.round(g.goalCents / 100)) : '500');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The goal could not be loaded.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dollars = Math.max(0, Math.round(Number(draft.replace(/[^0-9.]/g, '')) || 0));
  const save = async (cents: number) => {
    setSaving(true); setError('');
    try { setGoal(await api.put<Goal>('/api/pro/revenue-goal', { goalCents: cents })); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The goal could not be saved.'); }
    finally { setSaving(false); }
  };

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const pct = goal && goal.goalCents > 0 ? Math.min(100, Math.round((goal.week.cents / goal.goalCents) * 100)) : 0;
  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]} testID="revenue-goal-screen">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back" testID="goal-back">
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <HelpTitle help="revenueGoal" style={[styles.navTitle, { color: colors.foreground }]}>Weekly goal</HelpTitle>
        <View style={styles.navSide} />
      </View>
      {!goal ? (error ? <Text style={[styles.muted, { color: colors.destructive, padding: 20 }]}>{error}</Text> : <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {goal.goalCents > 0 ? (
            <View style={[styles.card, card]} testID="goal-progress">
              <Text style={[styles.big, { color: colors.foreground }]}>{`${money(goal.week.cents)} of ${money(goal.goalCents)}`}</Text>
              <View style={[styles.track, { backgroundColor: colors.muted }]}><View style={[styles.fill, { backgroundColor: colors.primary, width: `${pct}%` }]} /></View>
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>
                {goal.week.cents >= goal.goalCents ? `Goal reached this week (week of ${weekLabel(goal.week.weekStart)}).` : `${money(goal.goalCents - goal.week.cents)} to go this week (Sunday to Saturday).`}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.label, { color: colors.foreground }]}>{goal.goalCents > 0 ? 'Change your weekly goal' : 'Set a weekly revenue goal'}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity testID="goal-less" accessibilityLabel="$100 less" onPress={() => setDraft(String(Math.max(0, dollars - 100)))} style={[styles.stepButton, card]}><Feather name="minus" size={22} color={colors.foreground} /></TouchableOpacity>
            <View style={[styles.amount, card]}>
              <Text style={[styles.dollar, { color: colors.mutedForeground }]}>$</Text>
              <TextInput testID="goal-amount" keyboardType="number-pad" value={draft} onChangeText={(v) => setDraft(v.replace(/\D/g, '').slice(0, 7))} style={[styles.amountInput, { color: colors.foreground }]} />
            </View>
            <TouchableOpacity testID="goal-more" accessibilityLabel="$100 more" onPress={() => setDraft(String(dollars + 100))} style={[styles.stepButton, card]}><Feather name="plus" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          {error ? <Text style={[styles.muted, { color: colors.destructive, marginTop: 10 }]}>{error}</Text> : null}
          <TouchableOpacity testID="goal-save" disabled={saving || dollars <= 0} onPress={() => void save(dollars * 100)} style={[styles.action, { backgroundColor: saving || dollars <= 0 ? colors.muted : colors.primary }]}>
            <Text style={[styles.actionText, { color: saving || dollars <= 0 ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save goal'}</Text>
          </TouchableOpacity>
          {goal.goalCents > 0 ? (
            <TouchableOpacity testID="goal-off" disabled={saving} onPress={() => void save(0)} style={styles.textAction}><Text style={[styles.actionText, { color: colors.primary }]}>Turn the goal off</Text></TouchableOpacity>
          ) : null}
          <Text style={[styles.muted, { color: colors.mutedForeground, marginTop: 14 }]}>Counts paid visits and sales (tips and tax included) and membership payments, less refunds. The goal stays the same each week until you change it.</Text>
          {goal.history.length ? <>
            <Text style={[styles.label, { color: colors.foreground }]}>Past weeks</Text>
            <View style={[styles.list, card]} testID="goal-history">
              {goal.history.map((w, i) => (
                <View key={w.weekStart} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                  <Text style={[styles.rowTitle, { color: colors.foreground, flex: 1 }]}>{`Week of ${weekLabel(w.weekStart)}`}</Text>
                  <Text style={[styles.rowSub, { color: w.goalCents > 0 && w.cents >= w.goalCents ? colors.primary : colors.mutedForeground }]}>{w.goalCents > 0 ? `${money(w.cents)} of ${money(w.goalCents)}` : money(w.cents)}</Text>
                </View>
              ))}
            </View>
          </> : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 22, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, paddingTop: 6 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, ...cardShadow },
  big: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  track: { height: 10, borderRadius: 5, marginVertical: 12, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
  label: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 22, marginBottom: 10 },
  stepper: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  stepButton: { width: 52, height: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  amount: { flex: 1, height: 52, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  dollar: { fontSize: 20, fontFamily: 'Inter_500Medium', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  action: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  textAction: { alignItems: 'center', paddingVertical: 14 },
  actionText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', ...cardShadow },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  rowSub: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  muted: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
});
