import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { look } from '@/components/look/tokens';

/**
 * Tablets (owner, 2026-11-19: pros use phones and tablets): every screen sits in a centered column no wider than a
 * large phone, on the app's lavender, instead of stretching across the tablet. Phones are narrower than the column,
 * so nothing changes on them.
 */
export const APP_MAX_WIDTH = 720;

export function TabletFrame({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: look.pageTop, alignItems: 'center' },
  inner: { flex: 1, width: '100%', maxWidth: APP_MAX_WIDTH, overflow: 'hidden' },
});
