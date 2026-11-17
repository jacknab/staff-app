import React, { useEffect, useState } from 'react';
import { Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

/**
 * Asks for a Google review of Certxa once the account is 45 days old (owner, 2026-11-17). Shown once on this phone:
 * either button closes it for good.
 */
const REVIEW_URL = 'https://g.page/r/CSmVaBIaEnLgECE/review';
const AFTER_DAYS = 45;
const DONE_KEY = 'certxa.reviewAsk.done';

export function ReviewAsk() {
  const colors = useColors();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (await AsyncStorage.getItem(DONE_KEY)) return;
      const account = await api.get<{ startedAt: string | null }>('/api/pro/account-started');
      const since = account?.startedAt ? new Date(account.startedAt).getTime() : NaN;
      if (!cancelled && Number.isFinite(since) && Date.now() - since >= AFTER_DAYS * 86_400_000) setOpen(true);
    })().catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const close = (review: boolean) => {
    setOpen(false);
    void AsyncStorage.setItem(DONE_KEY, new Date().toISOString()).catch(() => undefined);
    if (review) void Linking.openURL(REVIEW_URL).catch(() => undefined);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.backdrop}>
        <View testID="review-ask" style={[styles.card, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Enjoying Certxa?</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>A Google review helps other beauty pros find Certxa. It only takes a minute.</Text>
          <TouchableOpacity testID="review-ask-leave" onPress={() => close(true)} accessibilityRole="button" style={[styles.button, { backgroundColor: colors.primary }]}>
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Leave a review</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="review-ask-later" onPress={() => close(false)} accessibilityRole="button" style={styles.later}>
            <Text style={[styles.laterText, { color: colors.mutedForeground }]}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 20, padding: 22 },
  title: { fontSize: 22, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  body: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 10, lineHeight: 21 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  laterText: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
