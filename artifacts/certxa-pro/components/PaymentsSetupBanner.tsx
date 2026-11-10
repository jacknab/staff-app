/**
 * A reminder on the home and checkout screens until the business can take card payments. It disappears
 * once setup is done, and checks again every time the screen comes into view.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { canTakeCards, getPaymentStatus } from '@/lib/payments-setup';

import { cardShadow } from '@/components/look/tokens';
export function PaymentsSetupBanner({ message = 'Set up card payments to take Tap to Pay and card payments from your clients.' }: { message?: string }) {
  const colors = useColors();
  const router = useRouter();
  const [state, setState] = useState<'unknown' | 'ready' | 'setup' | 'finish'>('unknown');

  useFocusEffect(useCallback(() => {
    let live = true;
    getPaymentStatus()
      .then((status) => { if (live) setState(canTakeCards(status) ? 'ready' : status.connected ? 'finish' : 'setup'); })
      .catch(() => undefined); // offline or signed out: say nothing rather than nag
    return () => { live = false; };
  }, []));

  if (state === 'unknown' || state === 'ready') return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.secondary, borderColor: colors.border }]} testID="payments-setup-banner">
      <Text style={[styles.title, { color: colors.foreground }]}>{state === 'finish' ? 'Finish setting up payments' : 'Get paid with Tap to Pay'}</Text>
      <Text style={[styles.line, { color: colors.mutedForeground }]}>{state === 'finish' ? 'Stripe needs a few more details before you can take cards.' : message}</Text>
      <TouchableOpacity onPress={() => router.push('/get-paid')} style={[styles.button, { backgroundColor: colors.primary }]} testID="payments-setup-banner-open">
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{state === 'finish' ? 'Continue setup' : 'Set up payments'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6, ...cardShadow },
  title: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  line: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  button: { alignSelf: 'flex-start', marginTop: 6, height: 40, borderRadius: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
