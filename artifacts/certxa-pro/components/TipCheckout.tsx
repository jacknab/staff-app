import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Platform, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type TipCheckoutProps = {
  baseCents: number;
  serviceName?: string;
  onConfirmTip: (tipCents: number) => void;
};

const tipOptions = [
  { label: 'NO TIP', percent: 0 },
  { label: '15%', percent: 15 },
  { label: '20%', percent: 20 },
  { label: '25%', percent: 25 },
];

function dollars(cents: number) {
  return `$${(Math.max(0, cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TipCheckout({ baseCents, serviceName, onConfirmTip }: TipCheckoutProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [screen, setScreen] = useState<'select' | 'custom'>('select');
  const [selectedPercent, setSelectedPercent] = useState<number | null>(null);
  const [customDigits, setCustomDigits] = useState('0');
  const safeBaseCents = Math.max(0, Math.round(baseCents || 0));
  const selectedTipCents = selectedPercent === null ? null : Math.round(safeBaseCents * selectedPercent / 100);
  const customTipCents = Number(customDigits) || 0;
  const tipCents = screen === 'custom' ? customTipCents : selectedTipCents ?? 0;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const displayService = serviceName?.trim() || 'Appointment';

  useEffect(() => {
    navigation.setOptions({ tabBarStyle: { display: 'none' } });
    return () => navigation.setOptions({ tabBarStyle: undefined });
  }, [navigation]);

  const choosePercent = (percent: number) => {
    setSelectedPercent(percent);
    setScreen('select');
  };

  const pressKey = (key: string) => {
    if (key === 'backspace') {
      setCustomDigits((current) => current.length > 1 ? current.slice(0, -1) : '0');
      return;
    }
    setCustomDigits((current) => current === '0' ? key : `${current}${key}`);
  };

  const confirm = () => {
    if (screen === 'custom' && customTipCents <= 0) return;
    if (screen === 'select' && selectedPercent === null) return;
    onConfirmTip(tipCents);
  };

  const summary = useMemo(() => (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>{displayService}</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{dollars(safeBaseCents)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Tip</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{dollars(tipCents)}</Text>
      </View>
      <View style={[styles.totalRow, { borderTopColor: colors.border }]}>
        <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
        <Text style={[styles.totalValue, { color: colors.foreground }]}>{dollars(safeBaseCents + tipCents)}</Text>
      </View>
    </View>
  ), [colors, displayService, safeBaseCents, tipCents]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        {screen === 'custom' ? (
          <TouchableOpacity testID="tip-back" onPress={() => setScreen('select')} style={styles.headerButton}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
        ) : <View style={styles.headerButton} />}
        <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>CHECKOUT</Text>
        <View style={styles.headerButton} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>FINISHING UP</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>{screen === 'custom' ? 'Add a custom tip' : 'Add a tip?'}</Text>
        {screen === 'custom' ? <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Enter the tip amount for this appointment.</Text> : null}

        {screen === 'select' ? (
          <>
            {summary}
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Choose a tip</Text>
            <View style={styles.tipGrid}>
              {tipOptions.map(({ label, percent }) => {
                const selected = selectedPercent === percent;
                return (
                  <TouchableOpacity
                    key={label}
                    testID={percent === 0 ? 'tip-no-tip' : `tip-${percent}`}
                    onPress={() => choosePercent(percent)}
                    style={[styles.tipOption, { backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.tipPercent, { color: selected ? colors.primary : colors.foreground }]}>{label}</Text>
                    <Text style={[styles.tipAmount, { color: colors.mutedForeground }]}>{dollars(Math.round(safeBaseCents * percent / 100))}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity testID="custom-tip" onPress={() => setScreen('custom')} style={[styles.customButton, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="edit-3" size={16} color={colors.primary} />
              <Text style={[styles.customButtonText, { color: colors.foreground }]}>Custom tip</Text>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={[styles.customAmountCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.amountCaption, { color: colors.mutedForeground }]}>CUSTOM TIP</Text>
              <Text testID="custom-tip-amount" style={[styles.customAmount, { color: colors.foreground }]}>{dollars(customTipCents)}</Text>
            </View>
            <View style={styles.keypad}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'backspace'].map((key) => (
                <TouchableOpacity
                  key={key}
                  testID={`tip-key-${key}`}
                  onPress={() => key === 'clear' ? setCustomDigits('0') : pressKey(key)}
                  style={[styles.key, { backgroundColor: key === 'clear' || key === 'backspace' ? colors.muted : colors.card, borderColor: colors.border }]}
                >
                  {key === 'backspace' ? <Feather name="delete" size={19} color={colors.foreground} /> : <Text style={[styles.keyText, { color: colors.foreground }]}>{key === 'clear' ? 'C' : key}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity testID="confirm-tip" disabled={(screen === 'select' && selectedPercent === null) || (screen === 'custom' && customTipCents <= 0)} onPress={confirm} style={[styles.confirmButton, { backgroundColor: ((screen === 'select' && selectedPercent !== null) || (screen === 'custom' && customTipCents > 0)) ? colors.primary : colors.muted }]}>
          <Text style={[styles.confirmText, { color: ((screen === 'select' && selectedPercent !== null) || (screen === 'custom' && customTipCents > 0)) ? colors.primaryForeground : colors.mutedForeground }]}>{screen === 'custom' ? 'Confirm tip' : 'Continue to Tap to Pay'}</Text>
          <Feather name="arrow-right" size={17} color={((screen === 'select' && selectedPercent !== null) || (screen === 'custom' && customTipCents > 0)) ? colors.primaryForeground : colors.mutedForeground} />
        </TouchableOpacity>
        <Text style={[styles.footerNote, { color: colors.mutedForeground }]}>You can review the total before payment.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 55, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  title: { fontSize: 29, letterSpacing: -0.8, fontFamily: 'Inter_600SemiBold', marginTop: 5 },
  subtitle: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular', marginTop: 6, maxWidth: 320 },
  summaryCard: { borderWidth: 1, borderRadius: 18, padding: 15, marginTop: 25, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  summaryValue: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  totalRow: { borderTopWidth: 1, paddingTop: 11, marginTop: 2, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  totalValue: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 25, marginBottom: 10 },
  tipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  tipOption: { width: '48%', minHeight: 72, borderWidth: 1, borderRadius: 15, padding: 12, justifyContent: 'center' },
  tipPercent: { fontSize: 19, fontFamily: 'Inter_600SemiBold' },
  tipAmount: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  customButton: { minHeight: 52, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 10 },
  customButtonText: { flex: 1, fontSize: 13, fontFamily: 'Inter_500Medium' },
  customAmountCard: { borderWidth: 1, borderRadius: 18, alignItems: 'center', paddingVertical: 19, marginTop: 26 },
  amountCaption: { fontSize: 9, letterSpacing: 1.4, fontFamily: 'Inter_600SemiBold' },
  customAmount: { fontSize: 38, letterSpacing: -1, fontFamily: 'Inter_500Medium', marginTop: 7 },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 17 },
  key: { width: '31.5%', height: 51, borderWidth: 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 19, fontFamily: 'Inter_500Medium' },
  footer: { paddingHorizontal: 20, paddingBottom: 22 },
  confirmButton: { height: 53, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  confirmText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  footerNote: { textAlign: 'center', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 10 },
});