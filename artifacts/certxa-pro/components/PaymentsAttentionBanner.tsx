import { useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { getPaymentStatus, onPaymentStatusChange, type PaymentStatus } from '@/lib/payments-setup';

const HIDDEN_ON = new Set(['/get-paid', '/login', '/signup']);

/**
 * Thin banner at the top of every screen (owner, 2026-11-10) while Stripe is waiting on the owner for more details
 * after setup (server: lib/paymentsAttention.ts). A tap opens Get paid, which opens Stripe's form. The screens below
 * get the banner's height taken off the top inset, so nothing is covered.
 */
export function PaymentsAttentionFrame({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const [attention, setAttention] = useState<PaymentStatus['attention'] | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { setAttention(null); return; }
    const load = () => { getPaymentStatus().then((s) => setAttention(s.attention ?? null)).catch(() => undefined); };
    load();
    const timer = setInterval(load, 15 * 60_000);
    const appState = AppState.addEventListener('change', (next) => { if (next === 'active') load(); });
    const stop = onPaymentStatusChange(load);
    return () => { clearInterval(timer); appState.remove(); stop(); };
  }, [isAuthenticated]);

  const shown = Boolean(isAuthenticated && attention?.needed && !HIDDEN_ON.has(pathname));
  // The same tree whether or not the banner shows, so the screens below never remount when it comes and goes.
  return (
    <View style={{ flex: 1 }}>
      {shown ? (
        <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/get-paid')} testID="payments-attention-banner"
          style={[styles.bar, { paddingTop: (Platform.OS === 'web' ? 0 : insets.top) + 5 }]}>
          <Text style={styles.text} numberOfLines={2}>
            {attention!.paused ? 'Stripe paused card payments. Tap to add the details it asked for.' : 'Stripe needs more details to keep card payments on. Tap to add them.'}
          </Text>
        </TouchableOpacity>
      ) : null}
      <SafeAreaInsetsContext.Provider value={shown ? { ...insets, top: 0 } : insets}>
        {children}
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: '#FFF4D6', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E8CF8A', paddingBottom: 6, paddingHorizontal: 16, alignItems: 'center' },
  text: { color: '#6B4E00', fontSize: 14, lineHeight: 19, fontFamily: 'Inter_500Medium', textAlign: 'center' },
});
