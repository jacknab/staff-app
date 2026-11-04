/**
 * "Payments powered by Stripe" (owner, 2026-11-03): opened from the Tap to Pay card on More. The picture fills the
 * screen; one button opens Stripe's own sign-up for Certxa's card payments (lib/payments-setup.ts).
 *
 * The picture is as wide as the screen and starts at the top; below it the screen is the picture's own bottom colour.
 * Stretched to cover a whole phone screen it would lose the sides of its headline.
 *
 * Stripe's account and its Tap to Pay location are made with the business address, so a business with no address goes
 * to Get paid first, which asks for it and then opens the same Stripe sign-up.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { canTakeCards, runPaymentsSetup } from '@/lib/payments-setup';

/** The picture's bottom colour, so it runs on to the bottom of the screen. */
const PAGE = '#F8F3FD';

type Store = { address?: string | null; city?: string | null; state?: string | null; postcode?: string | null };
const addressComplete = (a: Store | null | undefined) =>
  Boolean(a?.address?.trim() && a.city?.trim() && /^[A-Za-z]{2}$/.test(a.state?.trim() ?? '') && /^\d{5}$/.test(a.postcode?.trim() ?? ''));

export default function PaymentsIntroScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // The picture's size from the screen's own width (2026-11-03: sized by '100%' + aspectRatio, iOS drew it at its full
  // 1213-pixel size, far wider than the screen).
  const { width } = useWindowDimensions();
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

  return (
    <View style={[styles.root, { backgroundColor: PAGE }]} testID="payments-intro">
      <Image source={require('@/assets/images/tap-to-pay-screen.jpg')} resizeMode="contain" style={{ width, height: Math.round((width * 1296) / 1213), marginTop: insets.top + 56 }}
        accessibilityLabel="Payments powered by Stripe: Tap to Pay on iPhone and the card reader" />
      <View style={[styles.header, { top: insets.top }]}><HelpTitle help="payments-intro" style={styles.title}>Payments</HelpTitle></View>
      <TouchableOpacity onPress={() => router.back()} style={[styles.back, { top: insets.top + 8 }]} accessibilityRole="button" accessibilityLabel="Back" testID="payments-intro-back">
        <Feather name="chevron-left" size={24} color="#0F1B2D" />
      </TouchableOpacity>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity onPress={() => void start()} disabled={opening} activeOpacity={0.85} style={styles.button}
          accessibilityRole="button" accessibilityLabel="Set up payments with Stripe" testID="payments-intro-start">
          {opening ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Set up payments</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { position: 'absolute', left: 0, right: 0, height: 56, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontFamily: 'Inter_500Medium', color: '#0F1B2D' },
  back: { position: 'absolute', left: 14, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
  button: { height: 56, borderRadius: 16, backgroundColor: '#635BFF', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontFamily: 'Inter_700Bold' },
});
