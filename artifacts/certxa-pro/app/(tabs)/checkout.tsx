import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const keypadRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'delete'],
] as const;

type Sale = { amount: string; label: string; time: string };

function dollars(digits: string) {
  const value = (Number(digits || '0') || 0) / 100;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState('0');
  const [tapping, setTapping] = useState(false);
  const [paid, setPaid] = useState(false);
  const [sales, setSales] = useState<Sale[]>([
  ]);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const amount = dollars(digits);

  const pressDigit = (value: string) => {
    if (value === 'delete') {
      setDigits((current) => current.length > 1 ? current.slice(0, -1) : '0');
      return;
    }
    if (value === '.') {
      if (!digits.includes('.')) setDigits((current) => `${current === '0' ? '0' : current}.`);
      return;
    }
    if (digits.includes('.')) {
      if (digits.split('.')[1].length < 2) setDigits((current) => `${current}${value}`);
      return;
    }
    if (digits.length < 8) setDigits((current) => current === '0' ? value : `${current}${value}`);
  };

  const finishPayment = () => {
    setSales((current) => [{ amount, label: 'In-person service', time: 'Just now · Demo payment' }, ...current]);
    setPaid(true);
  };

  if (tapping) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.tapHeader}>
          <TouchableOpacity testID="cancel-tap" onPress={() => { setTapping(false); setPaid(false); }} style={styles.iconButton}><Feather name="x" size={23} color={colors.foreground} /></TouchableOpacity>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>IN-PERSON CHECKOUT</Text>
          <View style={{ width: 42 }} />
        </View>
        {paid ? (
          <View style={styles.successContent}>
            <View style={[styles.successBadge, { backgroundColor: colors.secondary }]}><Feather name="check" size={32} color={colors.primary} /></View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Payment complete</Text>
            <Text style={[styles.successAmount, { color: colors.foreground }]}>{amount}</Text>
            <Text style={[styles.successNote, { color: colors.mutedForeground }]}>.</Text>
            <TouchableOpacity testID="new-checkout" onPress={() => { setDigits('0'); setPaid(false); setTapping(false); }} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>New checkout</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.tapContent}>
            <View style={[styles.nfcCircle, { backgroundColor: colors.secondary }]}><Feather name="radio" size={32} color={colors.primary} /></View>
            <Text style={[styles.tapTitle, { color: colors.foreground }]}>Hold near phone</Text>
            <Text style={[styles.tapSub, { color: colors.mutedForeground }]}>Tap to Pay experience preview</Text>
            <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>AMOUNT DUE</Text><Text style={[styles.tapAmount, { color: colors.foreground }]}>{amount}</Text><Text style={[styles.serviceLabel, { color: colors.mutedForeground }]}>Tom L · Nail services</Text></View>
            <View style={[styles.previewNotice, { backgroundColor: colors.accent }]}><Feather name="info" size={15} color={colors.accentForeground} /><Text style={[styles.previewText, { color: colors.accentForeground }]}>Tom this app is 100% real native app.</Text></View>
            <TouchableOpacity testID="simulate-payment" onPress={finishPayment} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Feather name="check" size={17} color={colors.primaryForeground} /><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Preview success state</Text></TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>TOM L</Text><Text style={[styles.title, { color: colors.foreground }]}>Checkout</Text></View><View style={[styles.secureBadge, { backgroundColor: colors.secondary }]}><Feather name="lock" size={13} color={colors.primary} /><Text style={[styles.secureText, { color: colors.primary }]}>Nails by Tom</Text></View></View>
        <View style={[styles.amountPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.amountCaption, { color: colors.mutedForeground }]}>PAYMENT AMOUNT</Text>
          <Text testID="checkout-amount" style={[styles.amount, { color: colors.foreground }]}>{amount}</Text>
          <View style={styles.quickServices}>
            {[{ title: 'Brow shaping', cost: '4800' }, { title: 'Facial', cost: '12500' }].map((service) => <TouchableOpacity key={service.title} testID={`quick-${service.title}`} onPress={() => setDigits(service.cost)} style={[styles.quickChip, { backgroundColor: colors.background, borderColor: colors.border }]}><Text style={[styles.quickTitle, { color: colors.foreground }]}>{service.title}</Text><Text style={[styles.quickPrice, { color: colors.primary }]}>{dollars(service.cost)}</Text></TouchableOpacity>)}
          </View>
        </View>
        <View style={styles.keypad}>
          {keypadRows.map((row, rowIndex) => (
            <View key={`key-row-${rowIndex}`} style={[styles.keypadRow, rowIndex < keypadRows.length - 1 && styles.keypadRowSpacing]}>
              {row.map((key, keyIndex) => (
                <TouchableOpacity key={key} testID={`key-${key}`} onPress={() => pressDigit(key)} style={[styles.keyButton, keyIndex < row.length - 1 && styles.keyButtonSpacing, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {key === 'delete' ? <Feather name="delete" size={20} color={colors.foreground} /> : <Text style={[styles.keyText, { color: colors.foreground }]}>{key}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
        <TouchableOpacity testID="tap-to-pay" onPress={() => { setTapping(true); setPaid(false); }} disabled={Number(digits) === 0} style={[styles.tapButton, { backgroundColor: Number(digits) === 0 ? colors.muted : colors.primary }]}><Feather name="radio" size={18} color={Number(digits) === 0 ? colors.mutedForeground : colors.primaryForeground} /><Text style={[styles.tapButtonText, { color: Number(digits) === 0 ? colors.mutedForeground : colors.primaryForeground }]}>Tap to Pay</Text><Feather name="arrow-up-right" size={16} color={Number(digits) === 0 ? colors.mutedForeground : colors.primaryForeground} /></TouchableOpacity>
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
  quickServices: { flexDirection: 'row', gap: 8, width: '100%' },
  quickChip: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  quickTitle: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  quickPrice: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  keypad: { marginTop: 11 },
  keypadRow: { flexDirection: 'row', alignItems: 'center' },
  keypadRowSpacing: { marginBottom: 8 },
  keyButton: { flex: 1, height: 56, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyButtonSpacing: { marginRight: 8 },
  keyText: { fontSize: 18, fontFamily: 'Inter_500Medium' },
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