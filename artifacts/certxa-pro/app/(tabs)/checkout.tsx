import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { TipCheckout } from '@/components/TipCheckout';

type Sale = { amount: string; label: string; time: string };
type CheckoutStage = 'tip' | 'tap' | 'success';

function dollars(cents: number) {
  const value = (Number(cents || 0) || 0) / 100;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ amountCents?: string; clientName?: string; serviceName?: string }>();
  const [stage, setStage] = useState<CheckoutStage>('tip');
  const [tipCents, setTipCents] = useState(0);
  const [digits, setDigits] = useState('0');
  const [sales, setSales] = useState<Sale[]>([
  ]);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const baseCents = Number(params.amountCents) || 0;
  const totalCents = baseCents + tipCents;
  const amount = dollars(totalCents);

  useEffect(() => {
    const amountCents = Number(params.amountCents);
    if (params.amountCents && Number.isFinite(amountCents) && amountCents >= 0) {
       setDigits(String(Math.round(amountCents)));
    }
  }, [params.amountCents]);

  const finishPayment = () => {
    setSales((current) => [{
      amount,
      label: 'Tap to Pay',
      time: 'Just now · Demo payment',
    }, ...current]);
    setStage('success');
  };

  if (stage === 'tip') {
    return <TipCheckout baseCents={baseCents} clientName={String(params.clientName || '')} serviceName={String(params.serviceName || '')} onConfirmTip={(nextTipCents) => { setTipCents(nextTipCents); setStage('tap'); }} />;
  }

  if (stage === 'tap' || stage === 'success') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.tapHeader}>
          <TouchableOpacity testID="cancel-tap" onPress={() => { setStage('tip'); setTipCents(0); }} style={styles.iconButton}><Feather name="x" size={23} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>IN-PERSON CHECKOUT</Text>
          <View style={{ width: 42 }} />
        </View>
        {stage === 'success' ? (
          <View style={styles.successContent}>
            <View style={[styles.successBadge, { backgroundColor: colors.secondary }]}><Feather name="check" size={32} color={colors.primary} /></View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Payment successful</Text>
            <Text style={[styles.successAmount, { color: colors.foreground }]}>{amount}</Text>
            <Text style={[styles.successNote, { color: colors.mutedForeground }]}>Tip included · Preview payment recorded on this device.</Text>
            <TouchableOpacity testID="new-checkout" onPress={() => { setDigits('0'); setTipCents(0); setStage('tip'); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>New checkout</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.tapContent}>
            <View style={[styles.nfcCircle, { backgroundColor: colors.secondary }]}><Feather name="radio" size={32} color={colors.primary} /></View>
            <Text style={[styles.tapTitle, { color: colors.foreground }]}>Tap to Pay</Text>
            <Text style={[styles.tapSub, { color: colors.mutedForeground }]}>Hold the customer’s card near this phone.</Text>
            <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>AMOUNT DUE</Text><Text style={[styles.tapAmount, { color: colors.foreground }]}>{amount}</Text><Text style={[styles.serviceLabel, { color: colors.mutedForeground }]}>{String(params.clientName || 'Walk-in client')} · {String(params.serviceName || 'Appointment')}</Text><Text style={[styles.tipIncluded, { color: colors.primary }]}>Includes {dollars(tipCents)} tip</Text></View>
            <View style={[styles.previewNotice, { backgroundColor: colors.accent }]}><Feather name="info" size={15} color={colors.accentForeground} /><Text style={[styles.previewText, { color: colors.accentForeground }]}>Preview only · Payments are not processed.</Text></View>
            <TouchableOpacity testID="simulate-payment" onPress={finishPayment} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Feather name="radio" size={17} color={colors.primaryForeground} /><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Simulate tap</Text></TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>{params.clientName ? String(params.clientName).toUpperCase() : 'CERTXA PRO'}</Text><Text style={[styles.title, { color: colors.foreground }]}>Checkout</Text></View><View style={[styles.secureBadge, { backgroundColor: colors.secondary }]}><Feather name="lock" size={13} color={colors.primary} /><Text style={[styles.secureText, { color: colors.primary }]}>Certxa secure</Text></View></View>
        <View style={[styles.amountPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.amountCaption, { color: colors.mutedForeground }]}>PAYMENT AMOUNT</Text>
          <Text testID="checkout-amount" style={[styles.amount, { color: colors.foreground }]}>{amount}</Text>
        </View>
        <TouchableOpacity testID="start-tip-checkout" onPress={() => setStage('tip')} disabled={baseCents <= 0} style={[styles.tapButton, { backgroundColor: baseCents <= 0 ? colors.muted : colors.primary }]}><Feather name="percent" size={18} color={baseCents <= 0 ? colors.mutedForeground : colors.primaryForeground} /><Text style={[styles.tapButtonText, { color: baseCents <= 0 ? colors.mutedForeground : colors.primaryForeground }]}>Add tip and checkout</Text><Feather name="arrow-up-right" size={16} color={baseCents <= 0 ? colors.mutedForeground : colors.primaryForeground} /></TouchableOpacity>
        <View style={styles.recentHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent payments</Text></View>
        <View style={styles.saleList}>{sales.slice(0, 3).map((sale, index) => <View key={`${sale.time}-${index}`} style={[styles.saleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.saleIcon, { backgroundColor: colors.secondary }]}><Feather name="check" size={15} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.quickTitle, { color: colors.foreground }]}>{sale.label}</Text><Text style={[styles.saleTime, { color: colors.mutedForeground }]}>{sale.time}</Text></View><Text style={[styles.saleAmount, { color: colors.foreground }]}>{sale.amount}</Text></View>)}</View>
        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Preview only · Payments are not processed</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 130 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 23 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  secureBadge: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secureText: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  amountPanel: { borderWidth: 1, borderRadius: 20, alignItems: 'center', paddingHorizontal: 15, paddingTop: 19, paddingBottom: 14 },
  amountCaption: { fontSize: 9, letterSpacing: 1.45, fontFamily: 'Inter_600SemiBold' },
  amount: { fontSize: 40, letterSpacing: -1.3, fontFamily: 'Inter_500Medium', marginTop: 6, marginBottom: 15 },
  quickTitle: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  methodHeading: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 25, marginBottom: 10 },
  methodList: { gap: 8 },
  methodCard: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  methodIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  methodDescription: { fontSize: 10, marginTop: 3 },
  giftCardField: { gap: 6, marginTop: 12 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  fieldInput: { borderWidth: 1, borderRadius: 13, minHeight: 45, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  tapButton: { height: 54, marginTop: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  tapButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 11 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  saleList: { gap: 8 },
  saleRow: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  saleIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
  saleAmount: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  disclaimer: { textAlign: 'center', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 17 },
  tapHeader: { paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  tapContent: { flex: 1, alignItems: 'center', paddingHorizontal: 22, paddingTop: 28 },
  nfcCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  tapTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  tapSub: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 7 },
  amountCard: { width: '100%', borderWidth: 1, borderRadius: 21, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', marginTop: 31 },
  tapAmount: { fontSize: 38, letterSpacing: -1, fontFamily: 'Inter_500Medium', marginTop: 7 },
  serviceLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 5 },
  tipIncluded: { fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 9 },
  previewNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 14, width: '100%', marginTop: 15 },
  previewText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  primaryButton: { height: 53, width: '100%', borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 'auto', marginBottom: 24 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  successBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 21 },
  successTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold' },
  successAmount: { fontSize: 35, fontFamily: 'Inter_500Medium', marginTop: 13 },
  successNote: { fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 6 },
});