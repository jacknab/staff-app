/**
 * Gift Cards & Packages (owner, 2026-11-09): More has one row for the two things a pro sells ahead of a visit; this
 * screen offers them (app/gift-cards.tsx, app/packages.tsx). In the Certxa Pro look (components/look).
 */
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { MenuCard } from '@/components/look/MenuCard';
import { look } from '@/components/look/tokens';
import { usePaymentsReady } from '@/lib/usePaymentsReady';

export default function SellScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  // Payments not set up: each opens its Stripe page instead (owner, 2026-11-11; app/payments-gift-cards.tsx, -packages).
  const paymentsReady = usePaymentsReady();
  return (
    <View style={[styles.root, { paddingTop: topInset }]} testID="sell-screen">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back" testID="sell-back">
          <Feather name="arrow-left" size={26} color={look.heading} />
        </TouchableOpacity>
        <HelpTitle help="sell" style={styles.navTitle}>Gift Cards & Packages</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <MenuCard testID="sell-gift-cards" icon={{ feather: 'gift' }} title="Gift cards" subtitle="Sell, use and check balances" onPress={() => router.push(paymentsReady === false ? '/payments-gift-cards' as Href : '/gift-cards')} />
        <MenuCard testID="sell-packages" icon={{ feather: 'package' }} title="Packages" subtitle="Prepaid visits on your website" onPress={() => router.push(paymentsReady === false ? '/payments-packages' as Href : '/packages')} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: look.pageTop },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: 'Inter_600SemiBold', color: look.heading },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 60, gap: 12 },
});
