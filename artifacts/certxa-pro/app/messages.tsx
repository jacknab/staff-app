/**
 * Messages (owner, 2026-11-03; plans/certxa-pro-glossgenius-audit.md): two-way texting with clients, from the business's
 * Certxa number. The conversations, then one conversation with a reply box (/api/sms-inbox). A reply uses a text
 * message credit like any text to a client.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

type Conversation = { clientPhone: string; clientName: string | null; lastMessage: string; lastMessageAt: string; unreadCount: number; direction: string };
type Message = { id: number; body: string; direction: 'inbound' | 'outbound' | string; createdAt: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const formatPhone = (p: string) => { const d = p.replace(/\D/g, '').slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

export default function MessagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; name?: string }>();
  const [list, setList] = useState<Conversation[] | null>(null);
  const [open, setOpen] = useState<{ phone: string; name: string | null } | null>(params.phone ? { phone: params.phone, name: params.name ?? null } : null);
  const [thread, setThread] = useState<Message[] | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const scroll = useRef<ScrollView>(null);

  const loadList = useCallback(async () => {
    try { setList(await api.get<Conversation[]>('/api/sms-inbox/conversations')); setError(''); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Messages could not be loaded.'); setList([]); }
  }, []);
  const loadThread = useCallback(async (phone: string) => {
    try { setThread(await api.get<Message[]>(`/api/sms-inbox/messages?phone=${encodeURIComponent(phone)}`)); setError(''); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'This conversation could not be loaded.'); setThread([]); }
  }, []);
  useEffect(() => { if (open) { setThread(null); void loadThread(open.phone); } else void loadList(); }, [open, loadList, loadThread]);
  // A conversation that's open checks for new replies every 15 seconds.
  useEffect(() => {
    if (!open) return;
    const iv = setInterval(() => void loadThread(open.phone), 15_000);
    return () => clearInterval(iv);
  }, [open, loadThread]);

  const send = async () => {
    if (!open || !reply.trim() || sending) return;
    setSending(true); setError('');
    try {
      await api.post('/api/sms-inbox/reply', { phone: open.phone, body: reply.trim() });
      setReply('');
      await loadThread(open.phone);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The text could not be sent.');
    } finally { setSending(false); }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const back = () => (open && !params.phone ? setOpen(null) : router.back());
  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="messages-screen">
      <View style={styles.nav}>
        <TouchableOpacity onPress={back} style={styles.navSide} accessibilityLabel="Back" testID="messages-back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="messages" style={[styles.navTitle, { color: colors.foreground }]} numberOfLines={1}>{open ? open.name || formatPhone(open.phone) : 'Messages'}</HelpTitle>
        <View style={styles.navSide} />
      </View>
      {!open ? (
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadList(); setRefreshing(false); }} />}>
          {list == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
            : list.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center', marginTop: 40 }]}>{error || 'No messages yet. When a client texts you back, it shows here.'}</Text>
            : (
              <View style={[styles.listBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
                {list.map((c, i) => (
                  <TouchableOpacity key={c.clientPhone} onPress={() => setOpen({ phone: c.clientPhone, name: c.clientName })} testID={`messages-conversation-${i}`}
                    style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground, fontFamily: c.unreadCount > 0 ? 'Inter_700Bold' : 'Inter_500Medium' }]} numberOfLines={1}>{c.clientName || formatPhone(c.clientPhone)}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]} numberOfLines={1}>{c.direction === 'outbound' ? 'You: ' : ''}{c.lastMessage}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>{when(c.lastMessageAt)}</Text>
                      {c.unreadCount > 0 ? <View style={[styles.badge, { backgroundColor: colors.primary }]}><Text style={styles.badgeText}>{c.unreadCount}</Text></View> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
        </ScrollView>
      ) : (
        <>
          <ScrollView ref={scroll} contentContainerStyle={[styles.content, { gap: 8 }]} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
            {thread == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
              : thread.map((m) => {
                const mine = m.direction !== 'inbound';
                return (
                  <View key={m.id} style={[styles.bubble, mine ? { alignSelf: 'flex-end', backgroundColor: colors.primary } : { alignSelf: 'flex-start', backgroundColor: colors.muted }]}>
                    <Text style={[styles.bubbleText, { color: mine ? colors.primaryForeground : colors.foreground }]}>{m.body}</Text>
                    <Text style={[styles.bubbleTime, { color: mine ? colors.primaryForeground : colors.mutedForeground }]}>{when(m.createdAt)}</Text>
                  </View>
                );
              })}
          </ScrollView>
          {error ? <Text style={[styles.muted, { color: colors.destructive, paddingHorizontal: 20 }]}>{error}</Text> : null}
          <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: insets.bottom + 10, backgroundColor: colors.background }]}>
            <TextInput value={reply} onChangeText={setReply} placeholder="Text message" placeholderTextColor={colors.mutedForeground} multiline maxLength={480}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]} testID="messages-reply" />
            <TouchableOpacity onPress={() => void send()} disabled={!reply.trim() || sending} accessibilityLabel="Send" testID="messages-send"
              style={[styles.send, { backgroundColor: reply.trim() && !sending ? colors.primary : colors.muted }]}>
              {sending ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="send" size={18} color={reply.trim() ? colors.primaryForeground : colors.mutedForeground} />}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 16, paddingBottom: 24, paddingTop: 6 },
  listBox: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 15 },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: 'Inter_700Bold' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8 },
  bubbleText: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_400Regular' },
  bubbleTime: { fontSize: 10, marginTop: 3, opacity: 0.75, fontFamily: 'Inter_400Regular' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: 20, minHeight: 42, maxHeight: 120, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontSize: 15, fontFamily: 'Inter_400Regular' },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
