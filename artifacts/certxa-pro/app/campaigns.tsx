/**
 * Campaigns (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): one text to many clients — a special, an opening,
 * a reminder to book. Only clients who haven't opted out of marketing texts get it; each text uses one credit. Certxa
 * checks the message for carrier rules before it goes (/api/campaigns, POST /:id/send).
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

type Campaign = { id: number; name: string; status: string; audience: string; messageTemplate: string; sentCount: number | null; failedCount: number | null;
  rejectionReason?: string | null; sentAt: string | null; createdAt: string };
const AUDIENCE = [
  { value: 'all', label: 'All my clients' },
  { value: 'lapsed_60', label: "Clients who haven't been in for 60 days" },
  { value: 'lapsed_90', label: "Clients who haven't been in for 90 days" },
];
const STATUS: Record<string, string> = { draft: 'Draft', pending_review: 'Being checked', approved: 'Sending', sending: 'Sending', sent: 'Sent', rejected: 'Not sent', scheduled: 'Scheduled' };

export default function CampaignsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<Campaign[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [audience, setAudience] = useState('all');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setList(await api.get<Campaign[]>('/api/campaigns')); } catch { setList([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const send = () => {
    if (!message.trim()) return;
    Alert.alert('Send this text?', `To ${AUDIENCE.find((a) => a.value === audience)!.label.toLowerCase()} who accept texts. Each text uses one credit.`, [
      { text: 'Not now', style: 'cancel' },
      { text: 'Send', onPress: async () => {
        setSending(true); setError('');
        try {
          const created = await api.post<{ id: number }>('/api/campaigns', {
            name: `Text · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, channel: 'sms', audience, messageTemplate: message.trim(),
          });
          try {
            const r = await api.post<{ sentCount?: number; message?: string }>(`/api/campaigns/${created.id}/send`, {});
            Alert.alert('Campaign', r.sentCount != null ? `Sent to ${r.sentCount} ${r.sentCount === 1 ? 'client' : 'clients'}.` : r.message ?? 'It will be sent once it has been checked.');
          } catch (cause) {
            Alert.alert('Not sent', cause instanceof ApiError ? cause.message : 'The campaign could not be sent.');
          }
          setWriting(false); setMessage('');
          await load();
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'The campaign could not be made.');
        } finally { setSending(false); }
      } },
    ]);
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="campaigns">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => (writing ? setWriting(false) : router.back())} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="campaigns" style={[styles.navTitle, { color: colors.foreground }]}>{writing ? 'New campaign' : 'Campaigns'}</HelpTitle>
        {!writing ? <TouchableOpacity onPress={() => setWriting(true)} style={[styles.navSide, { alignItems: 'flex-end' }]} accessibilityLabel="New campaign" testID="campaign-new"><Feather name="plus" size={24} color={colors.primary} /></TouchableOpacity> : <View style={styles.navSide} />}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={!writing ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} /> : undefined}>
        {writing ? (
          <>
            <SelectField testID="campaign-audience" title="Who gets it" value={audience} onChange={setAudience} options={AUDIENCE} />
            <TextInput value={message} onChangeText={setMessage} multiline maxLength={480} placeholder="Hi {{firstName}}, ..." placeholderTextColor={colors.mutedForeground}
              style={[styles.message, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} testID="campaign-message" />
            <View style={styles.inserts}>
              <TouchableOpacity onPress={() => setMessage((m) => `${m}{{firstName}}`)} testID="campaign-insert-name"><Text style={[styles.link, { color: colors.primary }]}>+ Their first name</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => setMessage((m) => `${m}${m && !m.endsWith(' ') ? ' ' : ''}{{bookingLink}}`)} testID="campaign-insert-link"><Text style={[styles.link, { color: colors.primary }]}>+ Your booking link</Text></TouchableOpacity>
            </View>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>{message.length}/480 · End with "Reply STOP to opt out" — carriers require it for marketing texts.</Text>
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
            <TouchableOpacity onPress={send} disabled={sending || !message.trim()} testID="campaign-send"
              style={[styles.button, { backgroundColor: message.trim() ? colors.primary : colors.muted }]}>
              {sending ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: message.trim() ? colors.primaryForeground : colors.mutedForeground }]}>Send</Text>}
            </TouchableOpacity>
          </>
        ) : list == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
          : list.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>Send one text to many clients: a special, an opening, a reminder to book.</Text>
          : (
            <View style={[styles.list, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {list.map((c, i) => (
                <View key={c.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={2}>{c.messageTemplate}</Text>
                    <Text style={[styles.muted, { color: c.status === 'rejected' ? colors.destructive : colors.mutedForeground }]} numberOfLines={3}>
                      {STATUS[c.status] ?? c.status}{c.status === 'sent' && c.sentCount != null ? ` to ${c.sentCount}` : ''} · {new Date(c.sentAt ?? c.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {c.status === 'rejected' && c.rejectionReason ? ` · ${c.rejectionReason}` : ''}
                    </Text>
                  </View>
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
  message: { borderWidth: 1, borderRadius: 14, minHeight: 140, padding: 14, fontSize: 16, textAlignVertical: 'top', fontFamily: 'Inter_400Regular' },
  inserts: { flexDirection: 'row', gap: 20 },
  link: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
