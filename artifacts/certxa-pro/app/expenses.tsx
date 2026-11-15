/**
 * MORE → Expenses (owner, 2026-11-15: "match GlossGenius"). What the business spends, month by month, with receipt
 * photos and costs that repeat every month; the month's takings less expenses; the year as a spreadsheet (CSV) to send
 * to a tax adviser.
 *   GET /api/pro/expenses?month= · POST · PUT/DELETE /api/pro/expenses/:id · GET /api/pro/expenses/export?year=
 */
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CatalogScreen, Choice, Empty, ErrorLine, Field, Label, List, Loading, Pair, PhotoField, QuietButton, Row, SaveButton, SectionTitle, Toggle, errorText, money, pickImageDataUri } from '@/components/catalog/CatalogKit';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { cardShadow } from '@/components/look/tokens';

const CATEGORIES = ['Supplies', 'Rent', 'Products for resale', 'Equipment', 'Education', 'Marketing', 'Software', 'Insurance', 'Travel', 'Fees', 'Other'] as const;
type Category = (typeof CATEGORIES)[number];
type Expense = { id: number; spentOn: string; amountCents: number; category: Category; vendor: string | null; note: string | null; receiptUrl: string | null; repeatsMonthly: boolean; repeated: boolean };
type Month = { expenses: Expense[]; totalCents: number; byCategory: Record<string, number>; takingsCents: number; leftCents: number };
type Draft = { id: number; amount: string; date: string; category: Category; vendor: string; note: string; receipt: string | null; repeatsMonthly: boolean };

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const toText = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${m}/${d}/${y}`; };
function fromText(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return d.getMonth() === Number(m[1]) - 1 ? ymd(d) : null;
}

export default function ExpensesScreen() {
  const router = useRouter();
  const colors = useColors();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [data, setData] = useState<Month | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.get<Month>(`/api/pro/expenses?month=${key}`)); setError(''); }
    catch (cause) { setError(errorText(cause, 'Could not load your expenses.')); }
    finally { setLoading(false); }
  }, [key]);
  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft || saving) return;
    const amount = Number(draft.amount);
    const spentOn = fromText(draft.date);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter the amount.');
    if (!spentOn) return setError('Enter the date like 11/15/2026.');
    setSaving(true); setError('');
    try {
      const body = { spentOn, amountCents: Math.round(amount * 100), category: draft.category, vendor: draft.vendor.trim() || null, note: draft.note.trim() || null, receipt: draft.receipt, repeatsMonthly: draft.repeatsMonthly };
      if (draft.id > 0) await api.put(`/api/pro/expenses/${draft.id}`, body);
      else await api.post('/api/pro/expenses', body);
      setDraft(null);
      await load();
    } catch (cause) { setError(errorText(cause, 'Could not save the expense.')); }
    finally { setSaving(false); }
  };

  const remove = () => {
    if (!draft) return;
    Alert.alert('Delete this expense?', draft.repeatsMonthly ? 'It also stops repeating. Copies already made stay.' : '', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setSaving(true);
        try { await api.del(`/api/pro/expenses/${draft.id}`); setDraft(null); await load(); }
        catch (cause) { setError(errorText(cause, 'Could not delete the expense.')); }
        finally { setSaving(false); }
      } },
    ]);
  };

  const exportYear = async () => {
    try {
      const r = await api.get<{ filename: string; csv: string; count: number }>(`/api/pro/expenses/export?year=${month.getFullYear()}`);
      if (!r.count) return Alert.alert('Nothing to send', `You have no expenses in ${month.getFullYear()}.`);
      await Share.share({ title: r.filename, message: r.csv });
    } catch (cause) { setError(errorText(cause, 'Could not make the spreadsheet.')); }
  };

  const pick = async () => {
    if (!draft) return;
    try { const uri = await pickImageDataUri([3, 4]); if (uri) setDraft({ ...draft, receipt: uri }); }
    catch (cause) { setError(errorText(cause, 'That photo could not be read.')); }
  };

  const shift = (by: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));
  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const monthName = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <CatalogScreen
      help="expenses"
      title={draft ? (draft.id > 0 ? 'Edit expense' : 'New expense') : 'Expenses'}
      onBack={() => (draft ? (setDraft(null), setError('')) : router.back())}
      onAdd={draft ? undefined : () => { setError(''); setDraft({ id: 0, amount: '', date: toText(ymd(new Date())), category: 'Supplies', vendor: '', note: '', receipt: null, repeatsMonthly: false }); }}
      addLabel="Add an expense"
      testID="expenses"
    >
      {draft ? (
        <>
          <Pair>
            <Field label="Amount ($)" testID="expense-amount" keyboardType="decimal-pad" value={draft.amount} onChangeText={(amount) => setDraft({ ...draft, amount: amount.replace(/[^\d.]/g, '') })} placeholder="0.00" />
            <Field label="Date" testID="expense-date" keyboardType="numbers-and-punctuation" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} placeholder="MM/DD/YYYY" />
          </Pair>
          <Label>Category</Label>
          <Choice testID="expense-category" options={CATEGORIES.map((c) => [c, c] as [Category, string])} value={draft.category} onChange={(category) => setDraft({ ...draft, category })} />
          <Field label="Paid to" testID="expense-vendor" autoCapitalize="words" value={draft.vendor} onChangeText={(vendor) => setDraft({ ...draft, vendor })} placeholder="Optional, e.g. Sally Beauty" />
          <Field label="Note" testID="expense-note" multiline value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} placeholder="Optional" />
          <PhotoField label="Receipt" testID="expense-receipt" uri={draft.receipt} onPick={() => void pick()} onRemove={() => setDraft({ ...draft, receipt: null })} />
          <Toggle testID="expense-repeats" title="Repeats every month" hint="Added again on the same day each month, like rent." value={draft.repeatsMonthly} onChange={(repeatsMonthly) => setDraft({ ...draft, repeatsMonthly })} />
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="expense-save" />
          {draft.id > 0 ? <QuietButton destructive disabled={saving} label="Delete expense" onPress={remove} testID="expense-delete" /> : null}
        </>
      ) : (
        <>
          <View style={styles.monthRow}>
            <TouchableOpacity testID="expenses-prev" accessibilityLabel="Previous month" onPress={() => shift(-1)} style={styles.arrow}><Feather name="chevron-left" size={22} color={colors.foreground} /></TouchableOpacity>
            <Text style={[styles.month, { color: colors.foreground }]}>{monthName}</Text>
            <TouchableOpacity testID="expenses-next" accessibilityLabel="Next month" onPress={() => shift(1)} style={styles.arrow}><Feather name="chevron-right" size={22} color={colors.foreground} /></TouchableOpacity>
          </View>
          <ErrorLine>{error}</ErrorLine>
          {loading && !data ? <Loading /> : data ? (
            <>
              <View style={[styles.summary, card]} testID="expenses-summary">
                {[['Takings', data.takingsCents], ['Expenses', data.totalCents], ['Left', data.leftCents]].map(([label, cents]) => (
                  <View key={String(label)} style={styles.summaryCell}>
                    <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <Text style={[styles.summaryValue, { color: colors.foreground }]}>{`${Number(cents) < 0 ? '−' : ''}${money(Math.abs(Number(cents)) / 100)}`}</Text>
                  </View>
                ))}
              </View>
              {Object.keys(data.byCategory).length > 0 ? (
                <View style={[styles.box, card]}>
                  {Object.entries(data.byCategory).sort((a, b) => b[1] - a[1]).map(([c, cents], i) => (
                    <View key={c} style={[styles.catRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                      <Text style={[styles.catText, { color: colors.foreground }]}>{c}</Text>
                      <Text style={[styles.catText, { color: colors.foreground }]}>{money(cents / 100)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {data.expenses.length === 0 ? <Empty>No expenses this month. Tap + to add one, with a photo of the receipt.</Empty> : (
                <>
                  <SectionTitle>{monthName.toUpperCase()}</SectionTitle>
                  <List>
                    {data.expenses.map((e) => (
                      <Row key={e.id} testID={`expense-${e.id}`} title={e.vendor || e.category} right={money(e.amountCents / 100)}
                        hint={[toText(e.spentOn), e.vendor ? e.category : null, e.repeatsMonthly ? 'every month' : e.repeated ? 'monthly copy' : null, e.receiptUrl ? 'receipt' : null].filter(Boolean).join(' · ')}
                        onPress={() => { setError(''); setDraft({ id: e.id, amount: (e.amountCents / 100).toFixed(2), date: toText(e.spentOn), category: e.category, vendor: e.vendor ?? '', note: e.note ?? '', receipt: e.receiptUrl, repeatsMonthly: e.repeatsMonthly }); }} />
                    ))}
                  </List>
                </>
              )}
              <QuietButton label={`Send ${month.getFullYear()} as a spreadsheet`} testID="expenses-export" onPress={() => void exportYear()} />
            </>
          ) : null}
        </>
      )}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  summary: { flexDirection: 'row', borderWidth: 1, borderRadius: 15, paddingVertical: 14, marginBottom: 12, ...cardShadow },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  summaryValue: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  box: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', ...cardShadow },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11 },
  catText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
});
