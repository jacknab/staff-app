/**
 * Business AI (owner, 2026-11-03): the pro's own business assistant, live (POST /api/pro-assistant/chat; server
 * routes/proAssistant.ts on the /manage assistant's engine). It answers from their real numbers, proposes setting
 * changes that run only when they tap Confirm, puts the clients it names on buttons that open their profile, and drafts
 * texts that open in the phone's Messages (sent from their own number, no credits). The conversation is kept.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Keyboard, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
type Action = { id: number; summary: string; status: 'pending' | 'running' | 'done' | 'failed' | 'cancelled'; result?: string | null };
type ClientLink = { id: number; name: string };
type Draft = { clientId: number; name: string; phone: string; message: string };
type ChatMessage = { id: string; role: 'assistant' | 'user'; text: string; actions?: Action[]; clients?: ClientLink[]; drafts?: Draft[]; thinking?: boolean };
type Saved = { id: number; role: 'assistant' | 'user'; content: string; actions?: Action[]; clients?: ClientLink[]; drafts?: Draft[] };

const SUGGESTIONS = [
  'How much did I make this week?',
  "Who haven't I seen in a while?",
  "What's on my schedule tomorrow?",
  'How can I fill my week?',
  'How do I ask for a deposit?',
];

/** The phone's Messages app with the text filled in (iOS joins the body with "&", Android with "?"). */
function smsLink(phone: string, body: string) {
  const to = phone.replace(/[^\d+]/g, '');
  return `sms:${to}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

export default function BusinessAiScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  useEffect(() => {
    api.get<Saved[]>('/api/pro-assistant/history')
      .then((rows) => setMessages((Array.isArray(rows) ? rows : []).map((m) => ({ id: String(m.id), role: m.role, text: m.content, actions: m.actions, clients: m.clients, drafts: m.drafts }))))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, []);
  const params = useLocalSearchParams<{ start?: string }>();
  const started = useRef(false);
  const scrollDown = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);

  const send = useCallback(async (value: string) => {
    const text = value.trim();
    if (!text || busy) return;
    setDraft(''); Keyboard.dismiss(); setBusy(true);
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text }, { id: 'thinking', role: 'assistant', text: '', thinking: true }]);
    scrollDown();
    try {
      const r = await api.post<{ reply: string; actions?: Action[]; clients?: ClientLink[]; drafts?: Draft[] }>('/api/pro-assistant/chat', { message: text });
      setMessages((current) => [...current.filter((m) => !m.thinking), { id: `a-${Date.now()}`, role: 'assistant', text: r.reply, actions: r.actions, clients: r.clients, drafts: r.drafts }]);
    } catch (cause) {
      setMessages((current) => [...current.filter((m) => !m.thinking), { id: `e-${Date.now()}`, role: 'assistant', text: cause instanceof ApiError ? cause.message : 'Business AI is unavailable right now. Check your connection and try again.' }]);
    } finally { setBusy(false); scrollDown(); }
  }, [busy]);
  // Opened from About you: starts the About text as soon as the conversation has loaded.
  useEffect(() => {
    if (loading || started.current || params.start !== 'about') return;
    started.current = true;
    void send('Help me write the About text for my website.');
  }, [loading, params.start, send]);

  const decide = async (messageId: string, action: Action, decision: 'confirm' | 'cancel') => {
    const set = (patch: Partial<Action>) => setMessages((current) => current.map((m) => (m.id === messageId
      ? { ...m, actions: m.actions?.map((a) => (a.id === action.id ? { ...a, ...patch } : a)) } : m)));
    set({ status: 'running' });
    try {
      const r = await api.post<{ status: Action['status']; message: string }>(`/api/assistant/actions/${action.id}/${decision}`);
      set({ status: r.status, result: r.message });
    } catch (cause) {
      set({ status: 'failed', result: cause instanceof ApiError ? cause.message : 'That did not go through. Try again.' });
    }
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    const mine = item.role === 'user';
    return (
      <View style={[styles.messageRow, mine && styles.userMessageRow]}>
        {!mine && <View style={[styles.smallAvatar, { backgroundColor: colors.secondary }]}><Feather name="zap" size={14} color={colors.primary} /></View>}
        <View style={{ flexShrink: 1, gap: 8, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          <View style={[styles.messageBubble, mine ? { backgroundColor: colors.primary, borderWidth: 0 } : { backgroundColor: colors.card, borderColor: colors.border }, mine && styles.userBubble]}>
            {item.thinking ? <ActivityIndicator color={colors.primary} testID="business-ai-thinking" />
              : <Text style={[styles.messageText, { color: mine ? colors.primaryForeground : colors.foreground }]}>{item.text}</Text>}
          </View>
          {item.clients?.length ? (
            <View style={styles.chips}>
              {item.clients.map((c) => (
                <TouchableOpacity key={c.id} testID={`business-ai-client-${c.id}`} onPress={() => router.push(`/client/${c.id}`)} style={[styles.chip, { borderColor: colors.primary, backgroundColor: colors.card }]}>
                  <Feather name="user" size={15} color={colors.primary} /><Text style={[styles.chipText, { color: colors.primary }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {item.drafts?.map((d) => (
            <View key={`${d.clientId}-${d.message.slice(0, 12)}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>Text to {d.name}</Text>
              <Text style={[styles.cardText, { color: colors.foreground }]}>{d.message}</Text>
              <View style={styles.cardButtons}>
                <TouchableOpacity testID={`business-ai-draft-send-${d.clientId}`} onPress={() => void Linking.openURL(smsLink(d.phone, d.message))} style={[styles.cardButton, { backgroundColor: colors.primary }]}>
                  <Feather name="message-circle" size={16} color={colors.primaryForeground} /><Text style={[styles.cardButtonText, { color: colors.primaryForeground }]}>Open in Messages</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => router.push(`/client/${d.clientId}`)} style={[styles.cardButton, { borderWidth: 1, borderColor: colors.border }]}>
                  <Text style={[styles.cardButtonText, { color: colors.foreground }]}>Profile</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {item.actions?.map((a) => (
            <View key={a.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>{a.status === 'done' ? 'Changed' : a.status === 'cancelled' ? 'Cancelled' : a.status === 'failed' ? 'Not changed' : 'Change to confirm'}</Text>
              <Text style={[styles.cardText, { color: colors.foreground }]}>{a.summary}</Text>
              {a.result && a.status !== 'pending' ? <Text style={[styles.cardResult, { color: a.status === 'failed' ? colors.destructive : colors.mutedForeground }]}>{a.result}</Text> : null}
              {a.status === 'pending' || a.status === 'running' ? (
                <View style={styles.cardButtons}>
                  <TouchableOpacity testID={`business-ai-confirm-${a.id}`} disabled={a.status === 'running'} onPress={() => void decide(item.id, a, 'confirm')} style={[styles.cardButton, { backgroundColor: colors.primary }]}>
                    {a.status === 'running' ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.cardButtonText, { color: colors.primaryForeground }]}>Confirm</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity testID={`business-ai-cancel-${a.id}`} disabled={a.status === 'running'} onPress={() => void decide(item.id, a, 'cancel')} style={[styles.cardButton, { borderWidth: 1, borderColor: colors.border }]}>
                    <Text style={[styles.cardButtonText, { color: colors.foreground }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: look.pageTop }]} behavior="padding">
      <AppBackground />
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        <TouchableOpacity testID="business-ai-back" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={19} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>More</Text>
        </TouchableOpacity>
        <HelpTitle help="ai" style={[styles.title, { color: colors.foreground }]}>Business AI</HelpTitle>
        <View style={[styles.aiMark, { backgroundColor: colors.primary }]}><Feather name="zap" size={19} color={colors.primaryForeground} /></View>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.messageContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => { if (messages.length) listRef.current?.scrollToEnd({ animated: false }); }}
          ListHeaderComponent={messages.length === 0 ? (
            <View>
              <View style={styles.chatIntro}>
                <View style={[styles.assistantAvatar, { backgroundColor: colors.secondary }]}><Feather name="zap" size={17} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.introTitle, { color: colors.foreground }]}>Ask about your business</Text>
                  <Text style={[styles.introText, { color: colors.mutedForeground }]}>Your earnings, schedule and clients, from your real numbers. I can draft texts to clients and change your hours, tax, tips and booking approval when you confirm.</Text>
                </View>
              </View>
              <View style={styles.suggestionRow}>
                {SUGGESTIONS.map((q) => (
                  <TouchableOpacity key={q} testID={`ai-suggestion-${q}`} onPress={() => void send(q)} style={[styles.suggestionChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.suggestionText, { color: colors.primary }]}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          renderItem={renderItem}
        />
      )}

      <View style={[styles.composerArea, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: bottomInset + 8 }]}>
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => void send(draft)}
            placeholder="Ask about your business..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="send"
            multiline
            style={[styles.input, { color: colors.foreground }]}
            testID="business-ai-input"
          />
          <TouchableOpacity testID="business-ai-send" accessibilityLabel="Send message" onPress={() => void send(draft)} disabled={!draft.trim() || busy} style={[styles.sendButton, { backgroundColor: draft.trim() && !busy ? colors.primary : colors.muted }]}>
            <Feather name="arrow-up" size={19} color={draft.trim() && !busy ? colors.primaryForeground : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 66 },
  backText: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  title: { fontSize: 22, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold' },
  aiMark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  messageContent: { paddingHorizontal: 20, paddingBottom: 18 },
  chatIntro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  assistantAvatar: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  introText: { fontSize: 15, fontFamily: 'Inter_400Regular', lineHeight: 21, marginTop: 3 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  suggestionChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  suggestionText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 12, maxWidth: '94%' },
  userMessageRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  smallAvatar: { width: 23, height: 23, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  messageBubble: { borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 5, paddingHorizontal: 13, paddingVertical: 11 },
  userBubble: { borderWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 5 },
  messageText: { fontSize: 17, lineHeight: 26, fontFamily: 'Inter_400Regular' },
  composerArea: { paddingHorizontal: 15, paddingTop: 9, borderTopWidth: 1 },
  composer: { minHeight: 48, borderWidth: 1, borderRadius: 17, paddingLeft: 14, paddingRight: 6, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: 42, maxHeight: 120, fontSize: 17, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, minHeight: 32 },
  chipText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, alignSelf: 'stretch', ...cardShadow },
  cardLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  cardText: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_400Regular', marginTop: 5 },
  cardResult: { fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 6 },
  cardButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  cardButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 38, borderRadius: 11, paddingHorizontal: 14 },
  cardButtonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  sendButton: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});