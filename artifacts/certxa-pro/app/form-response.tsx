/**
 * One filled-in form or signed waiver (owner, 2026-11-15), opened from a booking's or client's Forms. Shows the
 * questions as they were when the client answered, their answers, and the signature.
 *   GET /api/pro/forms/responses/:id
 */
import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CatalogScreen, ErrorLine, Loading } from '@/components/catalog/CatalogKit';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { cardShadow } from '@/components/look/tokens';

type Answer = { label: string; fieldType: string; answer: unknown };
type Response = { id: number; clientName: string | null; completedAt: string; name: string; kind: string; answers: Answer[]; signatureName: string | null; signatureImage: string | null };

function answerText(a: Answer): string {
  if (a.fieldType === 'agree') return a.answer === true ? 'Agreed' : 'Not ticked';
  if (a.fieldType === 'yes_no') return a.answer === 'yes' ? 'Yes' : a.answer === 'no' ? 'No' : '—';
  if (a.fieldType === 'date' && typeof a.answer === 'string') {
    const [y, m, d] = a.answer.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (Array.isArray(a.answer)) return a.answer.length ? a.answer.join(', ') : '—';
  return typeof a.answer === 'string' && a.answer.trim() ? a.answer : '—';
}

export default function FormResponseScreen() {
  const router = useRouter();
  const colors = useColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Response>(`/api/pro/forms/responses/${Number(id)}`).then(setData).catch(() => setError('This form could not be loaded.'));
  }, [id]);

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  return (
    <CatalogScreen title={data?.name ?? 'Form'} help="form-response" onBack={() => router.back()} testID="form-response">
      <ErrorLine>{error}</ErrorLine>
      {!data && !error ? <Loading /> : null}
      {data ? (
        <>
          <Text style={[styles.meta, { color: colors.mutedForeground }]} testID="form-response-meta">
            {data.clientName || 'Client'} · {data.kind === 'waiver' ? 'signed' : 'filled in'} {new Date(data.completedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </Text>
          <View style={[styles.box, card]}>
            {data.answers.filter((a) => a.fieldType !== 'signature').map((a, i) => (
              <View key={i} style={[styles.row, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : null]}>
                <Text style={[a.fieldType === 'info' ? styles.info : styles.q, { color: a.fieldType === 'info' ? colors.mutedForeground : colors.foreground }]}>{a.label}</Text>
                {a.fieldType !== 'info' ? <Text style={[styles.a, { color: colors.foreground }]}>{answerText(a)}</Text> : null}
              </View>
            ))}
          </View>
          {data.signatureImage ? (
            <View style={[styles.box, card, { marginTop: 16, padding: 14 }]} testID="form-response-signature">
              <Text style={[styles.q, { color: colors.foreground }]}>Signature</Text>
              <Image source={{ uri: data.signatureImage }} resizeMode="contain" style={styles.signature} />
              <Text style={[styles.a, { color: colors.foreground }]}>{data.signatureName}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  meta: { fontSize: 15, fontFamily: 'Inter_400Regular', marginBottom: 14 },
  box: { borderWidth: 1, borderRadius: 15, overflow: 'hidden', ...cardShadow },
  row: { paddingHorizontal: 14, paddingVertical: 12 },
  q: { fontSize: 15, fontFamily: 'Inter_600SemiBold', lineHeight: 21 },
  info: { fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  a: { fontSize: 16, fontFamily: 'Inter_400Regular', marginTop: 4, lineHeight: 22 },
  signature: { width: '100%', height: 120, marginTop: 8, backgroundColor: '#fff' },
});
