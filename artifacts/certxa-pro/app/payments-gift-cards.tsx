/**
 * Payments marketing page for Gift cards (More › Sell) (owner, 2026-11-11): a copy of the Payments intro (payments-intro.tsx), shown in
 * place of that screen while the business hasn't set up Stripe (lib/usePaymentsReady.ts), so each function can have its
 * own page pushing the pro to set up payments. Same pictures and setup button for now; to be made its own later.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '@/lib/live-api';
import { openHelp } from '@/components/HelpTitle';
import { canTakeCards, runPaymentsSetup } from '@/lib/payments-setup';

/** The pictures' own sizes (assets/images/payments-*), for their proportions. */
const BG = { w: 940, h: 1674 };
const TITLE = { w: 900, h: 321 };
const PHONE = { w: 560, h: 1181 };
const READER = { w: 600, h: 515 };

type Store = { address?: string | null; city?: string | null; state?: string | null; postcode?: string | null };
const addressComplete = (a: Store | null | undefined) =>
  Boolean(a?.address?.trim() && a.city?.trim() && /^[A-Za-z]{2}$/.test(a.state?.trim() ?? '') && /^\d{5}$/.test(a.postcode?.trim() ?? ''));

export default function PaymentsGiftCardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The picture's size from the screen's own width (2026-11-03: sized by '100%' + aspectRatio, iOS drew it at its full
  // 1213-pixel size, far wider than the screen).
  const { width, height } = useWindowDimensions();
  const [opening, setOpening] = useState(false);

  const start = async () => {
    setOpening(true);
    try {
      const rows = await api.get<Store[]>('/api/stores').catch(() => null);
      const store = Array.isArray(rows) ? rows[0] ?? null : null;
      if (!addressComplete(store)) { router.push('/get-paid'); return; }
      const status = await runPaymentsSetup();
      if (canTakeCards(status)) {
        Alert.alert('You’re all set', 'You can take card payments now.', [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (cause) {
      Alert.alert('Payments', cause instanceof Error ? cause.message : 'We couldn’t open payment setup. Check your connection and try again.');
    } finally {
      setOpening(false);
    }
  };

  // Sizes from the screen's width (a picture sized by percentages drew at its full size on iOS, 2026-11-03).
  const titleW = Math.round(width * 0.58);
  const titleH = Math.round(titleW * (TITLE.h / TITLE.w));
  // On a short screen (iPhone SE) the phone and reader get smaller so the text stays clear of the button: the room left
  // after the title, the three lines (about 120) and the button (56 + its margins).
  const room = height - insets.top - 14 - titleH - 18 - 120 - (56 + insets.bottom + 20 + 24);
  const phoneW = Math.round(Math.min(width * 0.43, Math.max(120, room - 12) * (PHONE.w / PHONE.h)));
  const readerW = Math.round(phoneW * 1.02);
  const stageH = Math.round(phoneW * (PHONE.h / PHONE.w)) + 12;
  // The background covers the screen from the top, so its wave sits behind the phone and reader on every phone.
  const bgScale = Math.max(width / BG.w, height / BG.h);

  return (
    <View style={styles.root} testID="payments-gift-cards">
      <Image source={require('@/assets/images/payments-bg.jpg')} resizeMode="stretch" accessibilityIgnoresInvertColors
        style={{ position: 'absolute', top: 0, left: Math.round((width - BG.w * bgScale) / 2), width: Math.round(BG.w * bgScale), height: Math.round(BG.h * bgScale) }} />
      <View style={{ paddingTop: insets.top + 14, alignItems: 'center' }}>
        {/* The title is a picture (Stripe's word mark); holding it opens this page's help, like every title. */}
        <TouchableOpacity activeOpacity={1} onLongPress={() => openHelp('payments-intro')} delayLongPress={500} accessibilityRole="header" accessibilityLabel="Payments, powered by Stripe">
          <Image source={require('@/assets/images/payments-title.png')} resizeMode="contain" style={{ width: titleW, height: titleH }} />
        </TouchableOpacity>
        <View style={{ width, height: stageH, marginTop: 18 }} accessible accessibilityLabel="Tap to Pay on a phone, and the Stripe card reader">
          <Image source={require('@/assets/images/payments-reader.png')} resizeMode="contain"
            style={{ position: 'absolute', right: Math.round(width * 0.03), top: Math.round(stageH * 0.4), width: readerW, height: Math.round(readerW * (READER.h / READER.w)) }} />
          <Image source={require('@/assets/images/payments-phone.png')} resizeMode="contain"
            style={{ position: 'absolute', left: Math.round(width * 0.5 - phoneW * 0.95), top: 6, width: phoneW, height: Math.round(phoneW * (PHONE.h / PHONE.w)), transform: [{ rotate: '-7deg' }] }} />
        </View>
        {/* What it offers (owner, 2026-11-11). */}
        <View style={styles.points} testID="payments-gift-cards-points">
          <Text style={styles.lead} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Take payments right on your iPhone</Text>
          <Text style={styles.point}>2.7% + 70¢ processing fee</Text>
          <Text style={styles.point}>Deposits & cancellation policies</Text>
        </View>
      </View>
      <TouchableOpacity onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} accessibilityRole="button" accessibilityLabel="Back" testID="payments-gift-cards-back">
        <Feather name="chevron-left" size={24} color="#0F1B2D" />
      </TouchableOpacity>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity onPress={() => void start()} disabled={opening} activeOpacity={0.85} style={styles.button}
          accessibilityRole="button" accessibilityLabel="Set up payments with Stripe" testID="payments-gift-cards-start">
          {opening ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Set up payments</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F1EAFD', overflow: 'hidden' },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
  points: { marginTop: 22, paddingHorizontal: 24, alignItems: 'center', gap: 6 },
  lead: { fontSize: 22, lineHeight: 28, fontFamily: 'Inter_700Bold', color: '#0F1B2D', textAlign: 'center' },
  point: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_500Medium', color: '#3B3F5C', textAlign: 'center' },
  button: { height: 56, borderRadius: 16, backgroundColor: '#635BFF', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 19, fontFamily: 'Inter_700Bold' },
});
