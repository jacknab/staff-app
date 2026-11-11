import React from 'react';
import { Platform, StyleSheet, useColorScheme, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs, useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePaymentsReady } from '@/lib/usePaymentsReady';

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  const router = useRouter();
  // Payments not set up: the POS tab opens its Stripe page instead (owner, 2026-11-11; app/payments-pos.tsx).
  const paymentsReady = usePaymentsReady();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Bigger text (owner, 2026-11-09): the tab names were the default 10 pt.
        tabBarLabelStyle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.card,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          paddingBottom: insets.bottom,
          ...(isWeb ? { height: 84, paddingBottom: 34 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]} />
          ) : null,
      }}
    >
      {/* Home (owner, 2026-11-03): today at a glance; the screen the app opens on. */}
      <Tabs.Screen name="index" options={{
        title: 'Home',
        tabBarIcon: ({ color }) => isIOS
          ? <SymbolView name="house" tintColor={color} size={23} />
          : <Feather name="home" size={21} color={color} />,
      }} />
      <Tabs.Screen name="calendar" options={{
        title: 'Calendar',
        tabBarIcon: ({ color }) => isIOS
          ? <SymbolView name="calendar" tintColor={color} size={23} />
          : <Feather name="calendar" size={21} color={color} />,
      }} />
      <Tabs.Screen name="clients" options={{
        title: 'Clients',
        tabBarIcon: ({ color }) => isIOS
          ? <SymbolView name="person.2" tintColor={color} size={23} />
          : <Feather name="users" size={21} color={color} />,
      }} />
      {/* POS (owner, 2026-10-30): a quick card payment linked to a client. It opens the checkout below. */}
      <Tabs.Screen name="pos" listeners={{
        tabPress: (e) => { if (paymentsReady === false) { e.preventDefault(); router.push('/payments-pos' as Href); } },
      }} options={{
        title: 'POS',
        tabBarIcon: ({ color }) => isIOS
          ? <SymbolView name="creditcard" tintColor={color} size={23} />
          : <Feather name="credit-card" size={21} color={color} />,
      }} />
      {/* Checkout has no tab of its own: it is opened from an appointment's Check Out or from the POS. */}
      <Tabs.Screen name="checkout" options={{ title: 'Checkout', href: null }} />
      <Tabs.Screen name="more" options={{
        title: 'More',
        tabBarIcon: ({ color }) => isIOS
          ? <SymbolView name="square.grid.2x2" tintColor={color} size={23} />
          : <Feather name="grid" size={21} color={color} />,
      }} />
    </Tabs>
  );
}

export default function TabLayout() {
  return <ClassicTabLayout />;
}
