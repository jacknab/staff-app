/**
 * Forms on a booking or a client's profile (owner, 2026-11-15; app/forms.tsx makes the forms).
 * Booking: the forms it needs and where each stands — filled in (View), sent (Send again / Fill in here) or not sent.
 * Client: every form they filled in, links still waiting, and Send a form.
 * Fill in here opens the client's page on this phone, so the client can fill it in at the chair.
 */
import { textHeldBack } from '@/lib/smsCreditNotice';
import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Alert } from '@/lib/appAlert';
import { useFocusEffect, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { SelectField } from '@/components/SelectField';
import { SectionTitle } from '@/components/look/SectionHeader';
import { cardShadow } from '@/components/look/tokens';

type Row = { key: string; formId: number; name: string; kind: string; status: 'completed' | 'sent' | 'not_sent'; sentVia?: string | null; at?: string | null; responseId?: number | null; appointmentId?: number | null };
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const via = (v?: string | null) => (v === 'email' ? 'by e-mail' : v === 'sms' ? 'by text' : v === 'in_person' ? 'on your phone' : '');

export function FormsPanel({ customerId, appointmentId }: { customerId: number; appointmentId?: number }) {
  const colors = useColors();
  const [rows, setRows] = useState<Row[]>([]);
  const [all, setAll] = useState<Array<{ id: number; name: string }>>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const forms = await api.get<any[]>('/api/pro/forms');
      setAll((Array.isArray(forms) ? forms : []).filter((f) => f.isActive).map((f) => ({ id: Number(f.id), name: String(f.name) })));
      if (appointmentId) {
        const r = await api.get<{ forms: any[] }>(`/api/pro/forms/appointment/${appointmentId}`);
        setRows((r?.forms ?? []).map((f) => ({ key: `f${f.formId}`, formId: f.formId, name: f.name, kind: f.kind, status: f.status, sentVia: f.sentVia, at: f.completedAt ?? f.sentAt, responseId: f.responseId })));
      } else {
        const r = await api.get<{ completed: any[]; waiting: any[] }>(`/api/pro/forms/client/${customerId}`);
        setRows([
          ...(r?.waiting ?? []).map((f) => ({ key: `w${f.requestId}`, formId: f.formId, name: f.name, kind: f.kind, status: 'sent' as const, sentVia: f.sentVia, at: f.sentAt, appointmentId: f.appointmentId })),
          ...(r?.completed ?? []).map((f) => ({ key: `c${f.responseId}`, formId: f.formId, name: f.name, kind: f.kind, status: 'completed' as const, at: f.completedAt, responseId: f.responseId })),
        ]);
      }
      setError('');
    } catch { setError('Could not load forms.'); }
    finally { setLoaded(true); }
  }, [customerId, appointmentId]);
  // Also on coming back from the client's page (Fill in here) or a filled-in form.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const send = async (formId: number, how: 'auto' | 'in_person', forVisit = appointmentId) => {
    if (busy) return;
    setBusy(`${formId}${how}`); setError('');
    try {
      const since = Date.now();
      const r = await api.post<{ link: string; sentVia: string }>('/api/pro/forms/send', { formId, customerId, appointmentId: forVisit ?? null, via: how });
      if (how === 'in_person') { await WebBrowser.openBrowserAsync(r.link); }
      else if (!textHeldBack(since)) Alert.alert('Sent', r.sentVia === 'email' ? 'The form was e-mailed to the client.' : 'The form was texted to the client.');
      await load();
    } catch (cause) { setError(cause instanceof Error && cause.message ? cause.message : 'The form could not be sent.'); }
    finally { setBusy(''); }
  };

  if (!loaded || (all.length === 0 && rows.length === 0)) return null;
  const notListed = all.filter((f) => !rows.some((r) => r.formId === f.id && r.status !== 'completed'));

  return (
    <View testID="forms-panel">
      <SectionTitle style={styles.section}>Forms</SectionTitle>
      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {rows.length === 0 ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>No forms yet.</Text> : rows.map((r, i) => (
          <View key={r.key} testID={`forms-row-${r.formId}`} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
            <Text style={[styles.title, { color: colors.foreground }]}>{r.name}</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              {r.status === 'completed' ? `${r.kind === 'waiver' ? 'Signed' : 'Filled in'} ${day(r.at)}` : r.status === 'sent' && r.sentVia !== 'none' ? `Sent ${via(r.sentVia)} ${day(r.at)} · not filled in yet` : 'Not sent yet'}
            </Text>
            <View style={styles.actions}>
              {r.status === 'completed' && r.responseId ? (
                <TouchableOpacity testID={`forms-view-${r.formId}`} onPress={() => router.push({ pathname: '/form-response' as any, params: { id: String(r.responseId) } })}><Text style={[styles.link, { color: colors.primary }]}>View</Text></TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity testID={`forms-send-${r.formId}`} disabled={!!busy} onPress={() => void send(r.formId, 'auto', r.appointmentId ?? appointmentId)}>
                    <Text style={[styles.link, { color: colors.primary }]}>{busy === `${r.formId}auto` ? 'Sending…' : r.status === 'sent' && r.sentVia !== 'none' ? 'Send again' : 'Send'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity testID={`forms-here-${r.formId}`} disabled={!!busy} onPress={() => void send(r.formId, 'in_person', r.appointmentId ?? appointmentId)}>
                    <Text style={[styles.link, { color: colors.primary }]}>Fill in here</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ))}
      </View>
      {notListed.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <SelectField testID="forms-send-other" title="Send a form" placeholder={appointmentId ? 'Send another form' : 'Send a form'} value={null}
            options={notListed.map((f) => ({ value: f.id, label: f.name }))} onChange={(formId) => void send(formId, 'auto')} />
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
  sub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 22, marginTop: 8 },
  link: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  empty: { fontSize: 15, fontFamily: 'Inter_400Regular', padding: 14 },
  error: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 10 },
});
