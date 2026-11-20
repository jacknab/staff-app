import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePathname } from 'expo-router';
import { look } from '@/components/look/tokens';
import { Text } from '@/components/AppText';
import { HELP } from '@/lib/help';
import { HelpContent, helpIdForPath } from '@/components/HelpTitle';
import { TABLET_INTRO } from '@/lib/tabletIntro';
import { PageIntro } from '@/components/PageIntro';
import { useInPane } from '@/components/TabletSplit';

/**
 * Tablets (owner, 2026-11-19: pros use phones and tablets): every screen sits in a centered column no wider than a
 * large phone, on the app's lavender, instead of stretching across the tablet. Phones are narrower than the column,
 * so nothing changes on them. Home (Home and the Calendar side by side, app/(tabs)/index.tsx) and Settings (menu and
 * the chosen setting side by side, app/settings.tsx) and the list screens of components/TabletSplit.tsx use the whole
 * tablet.
 *
 * Beside a one-column screen, when the tablet has the room (owner, 2026-11-20), that screen's intro and help page
 * (lib/help.ts, the same page holding its title opens) fills the right-hand side.
 */
export const APP_MAX_WIDTH = 720;
/** The tablet width from which a one-column screen gets its help beside it. */
export const HELP_PANEL_MIN_WIDTH = 1000;

/**
 * Is this screen's intro panel showing beside it? Not on a phone or an upright tablet, and not when the screen is open
 * inside another page's right-hand pane (More, Services…). When it isn't, an empty page shows the intro under its hero.
 */
export function useIntroBeside() {
  const { width } = useWindowDimensions();
  const inPane = useInPane();
  return width >= HELP_PANEL_MIN_WIDTH && !inPane;
}

export function TabletFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullWidth = ['/', '/index', '/settings', '/clients', '/more', '/catalog', '/past-bookings', '/pos'].includes(pathname)
    || pathname.startsWith('/appointment/');
  const { width } = useWindowDimensions();
  // Not beside checkout: its tip page is turned to the client (owner, 2026-11-20).
  const helpId = !fullWidth && width >= HELP_PANEL_MIN_WIDTH && pathname !== '/checkout' ? helpIdForPath(pathname) : null;
  const help = helpId ? HELP[helpId] : null;
  if (help) {
    return (
      <View style={[styles.outer, styles.split]}>
        <View style={styles.page}>{children}</View>
        <View style={styles.helpPanel} testID="tablet-help-panel">
          <Text style={styles.helpLabel}>Help</Text>
          <ScrollView contentContainerStyle={styles.helpContent}>
            {helpId && TABLET_INTRO[helpId] ? <PageIntro title={help.title} intro={TABLET_INTRO[helpId]} /> : <HelpContent page={help} tip={false} />}
          </ScrollView>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.outer}>
      <View style={[styles.inner, fullWidth && styles.full]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: look.pageTop, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, overflow: 'hidden' },
  full: { maxWidth: '100%' },
  split: { flexDirection: 'row', alignItems: 'stretch' },
  page: { flex: 1, maxWidth: APP_MAX_WIDTH, overflow: 'hidden' },
  helpPanel: { flex: 1, minWidth: 340, margin: 16, marginLeft: 0, borderRadius: 22, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, overflow: 'hidden' },
  helpLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: look.violet, paddingHorizontal: 32, paddingTop: 30 },
  helpContent: { paddingHorizontal: 32, paddingTop: 6, paddingBottom: 40 },
});
