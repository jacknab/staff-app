/**
 * A payment's receipt (owner, 2026-11-19; from Card on file): the business, when, who did the visit, each service,
 * add-on and extra, discount, tax, tip, total, how it was paid and any refund. Send it to the client by text (a link
 * to the web receipt) or e-mail. Built on the server from the booking (api-server lib/proReceipts.ts).
 *   GET /api/pro/receipts/:kind/:id · POST /api/pro/receipts/:kind/:id/send { via }
 */
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Receipt = {
  storeName: string; storeAddress?: string; storePhone?: string; ticketNumber: number; dateLabel: string;
  clientName?: string; staffName?: string; title: string;
  items: { label: string; price: number }[]; subtotal: number; discount: number; tax: number; tip: number; total: number;
  tenders: { method: string; amount: number }[]; refunded: number; cardDetails?: { brand?: string; last4?: string };
};
const money = (n: number) => `$${n.toFixed(2)}`;
const phoneLabel = (p?: string) => { const d = String(p ?? '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p ?? ''; };

export default function ClientReceiptScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const [data, setData] = useState<{ receipt: Receipt; canText: boolean; canEmail: boolean } | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState<null | 'text' | 'email'>(null);

  useFocusEffect(useCallback(() => {
    api.get<{ receipt: Receipt; canText: boolean; canEmail: boolean }>(`/api/pro/receipts/${params.kind}/${params.id}`)
      .then((r) => { setData(r); setError(''); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load the receipt.'));
  }, [params.kind, params.id]));

  const send = (via: 'text' | 'email') => Alert.alert(via === 'text' ? 'Text the receipt?' : 'E-mail the receipt?',
    `${data?.receipt.clientName ?? 'The client'} gets ${via === 'text' ? 'a text with a link to' : 'an e-mail with'} this receipt.`, [
      { text: 'Not now', style: 'cancel' },
      { text: via === 'text' ? 'Send text' : 'Send e-mail', onPress: async () => {
        setSending(via);
        try {
          const r = await api.post<{ to: string }>(`/api/pro/receipts/${params.kind}/${params.id}/send`, { via });
          Alert.alert('Receipt sent', `Sent to ${via === 'text' ? phoneLabel(r.to) : r.to}.`);
        } catch (cause) {
          Alert.alert('Not sent', cause instanceof Error ? cause.message : 'Try again in a minute.');
        } finally { setSending(null); }
      } },
    ]);

  const r = data?.receipt;
  const line = (label: string, value: string, strong = false, color?: string) => (
    <View key={label} style={styles.line}>
      <Text style={[strong ? styles.strongText : styles.lineText, { color: color ?? colors.foreground, flex: 1 }]}>{label}</Text>
      <Text style={[strong ? styles.strongText : styles.lineText, { color: color ?? colors.foreground }]}>{value}</Text>
    </View>
  );
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="client-receipt-back" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="clientReceipt" style={[styles.headerTitle, { color: colors.foreground }]}>Receipt</HelpTitle>
        <View style={styles.headerButton} />
      </View>
      {error ? <Text style={[styles.empty, { color: colors.destructive }]}>{error}</Text> : !r ? <ActivityIndicator style={{ marginTop: 30 }} color={colors.primary} /> : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
          <View testID="client-receipt" style={[styles.paper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.store, { color: look.heading }]}>{r.storeName}</Text>
            {r.storeAddress ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{r.storeAddress}</Text> : null}
            {r.storePhone ? <Text style={[styles.small, { color: colors.mutedForeground }]}>{phoneLabel(r.storePhone)}</Text> : null}
            <View style={[styles.rule, { borderColor: colors.border }]} />
            {line('Receipt', `#${r.ticketNumber}`)}
            {line('Date', r.dateLabel)}
            {r.clientName ? line('Client', r.clientName) : null}
            {r.staffName ? line('Done by', r.staffName) : null}
            <View style={[styles.rule, { borderColor: colors.border }]} />
            {r.items.map((i, k) => <View key={`${i.label}-${k}`}>{line(i.label, money(i.price))}</View>)}
            <View style={[styles.rule, { borderColor: colors.border }]} />
            {line('Subtotal', money(r.subtotal))}
            {r.discount > 0 ? line('Discount', `−${money(r.discount)}`) : null}
            {r.tax > 0 ? line('Tax', money(r.tax)) : null}
            {r.tip > 0 ? line('Tip', money(r.tip)) : null}
            {line('Total', money(r.total), true)}
            <View style={[styles.rule, { borderColor: colors.border }]} />
            <Text style={[styles.section, { color: colors.mutedForeground }]}>PAID WITH</Text>
            {r.tenders.map((t, k) => <View key={`${t.method}-${k}`}>{line(t.method, money(t.amount))}</View>)}
            {r.cardDetails?.last4 ? <Text style={[styles.small, { color: colors.mutedForeground, textAlign: 'left' }]}>{`${r.cardDetails.brand ?? 'Card'} •••• ${r.cardDetails.last4}`}</Text> : null}
            {r.refunded > 0 ? line('Refunded', `−${money(r.refunded)}`, false, colors.accentForeground) : null}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity testID="client-receipt-text" disabled={!data?.canText || !!sending} onPress={() => send('text')}
              style={[styles.action, { backgroundColor: data?.canText ? colors.primary : colors.muted }]}>
              <Feather name="message-circle" size={20} color={data?.canText ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.actionText, { color: data?.canText ? colors.primaryForeground : colors.mutedForeground }]}>{sending === 'text' ? 'Sending…' : 'Text receipt'}</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="client-receipt-email" disabled={!data?.canEmail || !!sending} onPress={() => send('email')}
              style={[styles.action, { backgroundColor: colors.card, borderWidth: 1.5, borderColor: data?.canEmail ? colors.primary : colors.border }]}>
              <Feather name="mail" size={20} color={data?.canEmail ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.actionText, { color: data?.canEmail ? colors.primary : colors.mutedForeground }]}>{sending === 'email' ? 'Sending…' : 'Email receipt'}</Text>
            </TouchableOpacity>
          </View>
          {!data?.canText || !data?.canEmail ? (
            <Text style={[styles.small, { color: colors.mutedForeground, marginTop: 10 }]}>
              {!data?.canText && !data?.canEmail ? 'Add a phone number or e-mail to this client to send the receipt.' : !data?.canText ? 'No phone number on file for texting.' : 'No e-mail address on file.'}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontFamily: 'Inter_700Bold' },
  content: { paddingHorizontal: 18, paddingTop: 10 },
  paper: { borderWidth: 1, borderRadius: 18, padding: 20, ...cardShadow },
  store: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  small: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 3 },
  rule: { borderTopWidth: 1, borderStyle: 'dashed', marginVertical: 12 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  lineText: { fontSize: 16, fontFamily: 'Inter_400Regular' },
  strongText: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  section: { fontSize: 13, letterSpacing: 1.2, fontFamily: 'Inter_700Bold', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  action: { flex: 1, height: 54, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  actionText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  empty: { fontSize: 16, textAlign: 'center', marginTop: 30 },
});
