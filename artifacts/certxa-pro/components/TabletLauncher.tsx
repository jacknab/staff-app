/**
 * Tablets (owner, 2026-11-19): no bottom tab bar. A round button fixed at the bottom right opens a floating panel on the
 * right side, like Android's app sidebar: large app-style icons (each its own colour, white symbol, name under it) for the main
 * parts of the app, five to a row with no group titles (owner's list and order, 2026-11-19; the rest are in More); the app
 * stays in view behind it. Phones keep the tab bar. Shown on the five main screens; pages
 * opened from them have their Back button.
 */
import { useState, type ComponentProps } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/AppText';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePaymentsReady } from '@/lib/usePaymentsReady';

/** A tablet: the shorter side of the screen is at least 600 points (phones are well under, even turned sideways). */
export function useIsTablet() {
  const { width, height } = useWindowDimensions();
  return Math.min(width, height) >= 600;
}

/** One icon's cell, and how many to a row. */
const CELL_WIDTH = 140;
const ROW_HEIGHT = 168;
const PER_ROW = 5;

type Icon = ComponentProps<typeof Feather>['name'];
type App = { key: string; label: string; icon: Icon; to: Href };
// Each app its own colour, as app icons are (owner's example: Android's app sidebar).
const TINT: Record<string, [string, string]> = {
  home: ['#A78BFA', '#7C3AED'], calendar: ['#FB7185', '#E11D48'], clients: ['#38BDF8', '#0284C7'], pos: ['#34D399', '#059669'],
  book: ['#F472B6', '#DB2777'], past: ['#94A3B8', '#475569'], money: ['#4ADE80', '#16A34A'], invoices: ['#FBBF24', '#D97706'],
  phone: ['#22D3EE', '#0891B2'], messages: ['#60A5FA', '#2563EB'], expenses: ['#FB923C', '#EA580C'], memberships: ['#C084FC', '#9333EA'],
  forms: ['#2DD4BF', '#0D9488'], catalog: ['#F9A8D4', '#EC4899'], waitlist: ['#A5B4FC', '#4F46E5'], campaigns: ['#FDA4AF', '#F43F5E'],
  promo: ['#FCD34D', '#F59E0B'], referrals: ['#86EFAC', '#22C55E'], reviews: ['#FDE047', '#EAB308'], portfolio: ['#F0ABFC', '#C026D3'],
  ai: ['#818CF8', '#4338CA'], sell: ['#FCA5A5', '#DC2626'], credits: ['#5EEAD4', '#14B8A6'], settings: ['#9CA3AF', '#4B5563'],
  more: ['#C4B5FD', '#6D28D9'],
};

export function TabletLauncher() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const paymentsReady = usePaymentsReady();
  const { width, height } = useWindowDimensions();

  // Row 1 your day, row 2 the business and its clients, row 3 the account.
  const apps: App[] = [
    { key: 'home', label: 'Home', icon: 'home', to: '/' as Href },
    { key: 'calendar', label: 'Calendar', icon: 'calendar', to: '/calendar' as Href },
    { key: 'clients', label: 'Clients', icon: 'users', to: '/clients' as Href },
    { key: 'pos', label: 'POS', icon: 'credit-card', to: (paymentsReady === false ? '/payments-pos' : '/pos') as Href },
    { key: 'past', label: 'Past 30 days', icon: 'clock', to: '/past-bookings' as Href },
    { key: 'money', label: 'Money', icon: 'dollar-sign', to: '/money' as Href },
    { key: 'catalog', label: 'Services', icon: 'scissors', to: '/catalog' as Href },
    { key: 'forms', label: 'Forms & Waivers', icon: 'file-text', to: '/forms' as Href },
    { key: 'campaigns', label: 'Campaigns', icon: 'send', to: '/campaigns' as Href },
    { key: 'reviews', label: 'Reviews', icon: 'star', to: '/reviews' as Href },
    { key: 'ai', label: 'Business AI', icon: 'message-square', to: '/ai' as Href },
    { key: 'settings', label: 'Settings', icon: 'settings', to: '/settings' as Href },
    { key: 'more', label: 'More', icon: 'grid', to: '/more' as Href },
  ];

  const panelTop = (Platform.OS === 'web' ? 24 : insets.top) + 16;
  const panelBottom = Math.max(insets.bottom, 12) + 92;
  const columns = Math.max(2, Math.min(PER_ROW, Math.floor((width - 60) / CELL_WIDTH)));

  const go = (app: App) => {
    setOpen(false);
    router.navigate(app.to);
  };

  // The POS fills the whole tablet (owner, 2026-11-19): no app-icons button there.
  if (pathname === '/pos') return null;

  return (
    <>
      <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(insets.bottom, 12) + 10 }]}>
        <TouchableOpacity testID="tablet-launcher" accessibilityLabel="All apps" onPress={() => setOpen(true)} activeOpacity={0.85} style={styles.dockShadow}>
          <LinearGradient colors={['#8B5CF6', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dockButton}>
            <Feather name="grid" size={28} color="#FFFFFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)} supportedOrientations={['portrait', 'landscape']}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={styles.backdrop} accessibilityLabel="Close">
          <TouchableOpacity activeOpacity={1} onPress={() => undefined} testID="tablet-launcher-overlay"
            style={[styles.panel, { top: panelTop, maxHeight: height - panelTop - panelBottom, width: columns * CELL_WIDTH + 24 }]}>
            <ScrollView contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false}>
              <View style={styles.grid}>
                {apps.map((app) => {
                  const here = app.to === pathname || (app.to === '/' && pathname === '/index');
                  return (
                    <TouchableOpacity key={app.key} testID={`tablet-app-${app.key}`} accessibilityLabel={app.label} onPress={() => go(app)} activeOpacity={0.75} style={styles.app}>
                      <LinearGradient colors={TINT[app.key] ?? ['#A78BFA', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.icon, here && styles.iconHere]}>
                        <Feather name={app.icon} size={40} color="#FFFFFF" />
                      </LinearGradient>
                      <Text style={styles.label} numberOfLines={2}>{app.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', right: 20 },
  dockShadow: { borderRadius: 22, shadowColor: '#4C1D95', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  dockButton: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 12, 34, 0.12)' },
  // The floating panel on the right, over the button, like Android's app sidebar.
  panel: { position: 'absolute', right: 18, borderRadius: 30, backgroundColor: 'rgba(246, 245, 250, 0.98)',
    shadowColor: '#1C1650', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 14, overflow: 'hidden' },
  panelBody: { paddingHorizontal: 12, paddingTop: 18, paddingBottom: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  app: { width: CELL_WIDTH, height: ROW_HEIGHT, alignItems: 'center', paddingTop: 6, paddingHorizontal: 4 },
  icon: { width: 92, height: 92, borderRadius: 24, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1C1650', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  iconHere: { borderWidth: 3, borderColor: '#FFFFFF' },
  label: { marginTop: 9, fontSize: 17, lineHeight: 21, fontFamily: 'Inter_600SemiBold', color: '#1F1B33', textAlign: 'center' },
});
