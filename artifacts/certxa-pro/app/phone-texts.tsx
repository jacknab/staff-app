/**
 * Texts to the business number (owner, 2026-11-04): shown here, newest first (GET /api/pro/phone/texts).
 * Replying from the business number comes later.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

type TextRow = { id: number; display: string; clientName: string | null; body: string; mediaCount: number; at: string };

export default function PhoneTextsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [texts, setTexts] = useState<TextRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setTexts(await api.get<TextRow[]>('/api/pro/phone/texts')); } catch { setTexts((t) => t ?? []); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="phone-texts-screen">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="phone-texts" style={[styles.navTitle, { color: colors.foreground }]}>Texts</HelpTitle>
        <View style={styles.navSide} />
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {texts == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
          : texts.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>Texts to your business number show here.</Text>
          : (
            <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {texts.map((t, i) => (
                <View key={t.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={styles.head}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{t.clientName ?? t.display}</Text>
                    <Text style={[styles.muted, { color: colors.mutedForeground }]}>{new Date(t.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text>
                  </View>
                  {t.body ? <Text style={[styles.body, { color: colors.foreground }]} selectable>{t.body}</Text> : null}
                  {t.mediaCount ? <Text style={[styles.muted, { color: colors.mutedForeground }]}>{t.mediaCount === 1 ? 'Sent a photo' : `Sent ${t.mediaCount} photos`}</Text> : null}
                </View>
              ))}
            </View>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 18, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12, paddingTop: 6 },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { paddingHorizontal: 14, paddingVertical: 12, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
});
