import { useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Keyboard, FlatList, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
};

const starterMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    text: 'Hi Tom. I’ve been looking at your recent activity. Your business is having a strong week, with repeat clients and bookings both trending in the right direction.',
  },
  {
    id: 'first-insight',
    role: 'assistant',
    text: 'You have room to grow your Tuesday and Thursday afternoons. Want me to look at your schedule, revenue, or client retention?',
  },
];

const suggestedQuestions = [
  'How is my week going?',
  'Where can I grow?',
  'Who are my best clients?',
];

function assistantReply(question: string) {
  const normalized = question.toLowerCase();
  if (normalized.includes('week') || normalized.includes('doing')) {
    return 'You’re tracking ahead of last week. Revenue is up 18%, your calendar is 78% booked, and two returning clients have already scheduled their next visit.';
  }
  if (normalized.includes('grow') || normalized.includes('opportunity')) {
    return 'Your clearest opportunity is filling weekday afternoons. A small rebooking prompt after appointments could also help turn your strong repeat-client trend into more predictable revenue.';
  }
  if (normalized.includes('client') || normalized.includes('customer')) {
    return 'Your returning clients are driving the most consistency. Alina, Sofia, and Maya have the strongest visit patterns in this preview, with services that are easy to rebook.';
  }
  return 'I can help you understand bookings, revenue, client retention, and availability. Ask me about one of those areas and I’ll break it down in plain language.';
}

export default function BusinessAiScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(starterMessages);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const sendMessage = (value = draft) => {
    const text = value.trim();
    if (!text) return;
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: 'user', text };
    const reply: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: assistantReply(text),
    };
    setMessages((current) => [...current, userMessage, reply]);
    setDraft('');
    Keyboard.dismiss();
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background }]} behavior="padding">
      <View style={[styles.header, { paddingTop: topInset + 10 }]}>
        <TouchableOpacity testID="business-ai-back" onPress={() => router.back()} style={styles.backButton}>
          <Feather name="arrow-left" size={19} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>More</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR BUSINESS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Business AI</Text>
        </View>
        <View style={[styles.aiMark, { backgroundColor: colors.primary }]}>
          <Feather name="message-circle" size={17} color={colors.primaryForeground} />
        </View>
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.messageContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={[styles.healthCard, { backgroundColor: colors.primary }]}>
              <View style={styles.healthHeader}>
                <View>
                  <Text style={[styles.healthEyebrow, { color: colors.primaryForeground }]}>BUSINESS SNAPSHOT</Text>
                  <Text style={[styles.healthTitle, { color: colors.primaryForeground }]}>You’re on a good run.</Text>
                </View>
                <View style={[styles.healthPulse, { backgroundColor: colors.primaryForeground }]}>
                  <Feather name="trending-up" size={17} color={colors.primary} />
                </View>
              </View>
              <View style={styles.metricRow}>
                <View style={styles.metric}>
                  <Text style={[styles.metricValue, { color: colors.primaryForeground }]}>$1,240</Text>
                  <Text style={[styles.metricLabel, { color: colors.primaryForeground }]}>this week</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={[styles.metricValue, { color: colors.primaryForeground }]}>78%</Text>
                  <Text style={[styles.metricLabel, { color: colors.primaryForeground }]}>booked</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.metric}>
                  <Text style={[styles.metricValue, { color: colors.primaryForeground }]}>12</Text>
                  <Text style={[styles.metricLabel, { color: colors.primaryForeground }]}>repeat visits</Text>
                </View>
              </View>
              <Text style={[styles.healthNote, { color: colors.primaryForeground }]}>Revenue is up 18% from last week.</Text>
            </View>

            <View style={styles.chatIntro}>
              <View style={[styles.assistantAvatar, { backgroundColor: colors.secondary }]}>
                <Feather name="zap" size={15} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.introTitle, { color: colors.foreground }]}>Ask about your business</Text>
                <Text style={[styles.introText, { color: colors.mutedForeground }]}>Get a clear read on what’s working and what to do next.</Text>
              </View>
            </View>

            <View style={styles.suggestionRow}>
              {suggestedQuestions.map((question) => (
                <TouchableOpacity key={question} testID={`ai-suggestion-${question}`} onPress={() => sendMessage(question)} style={[styles.suggestionChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.suggestionText, { color: colors.primary }]}>{question}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.messageRow, item.role === 'user' && styles.userMessageRow]}>
            {item.role === 'assistant' && (
              <View style={[styles.smallAvatar, { backgroundColor: colors.secondary }]}>
                <Feather name="zap" size={12} color={colors.primary} />
              </View>
            )}
            <View style={[styles.messageBubble, item.role === 'assistant' ? { backgroundColor: colors.card, borderColor: colors.border } : { backgroundColor: colors.secondary }, item.role === 'user' && styles.userBubble]}>
              <Text style={[styles.messageText, { color: colors.foreground }]}>{item.text}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={<Text style={[styles.previewNote, { color: colors.mutedForeground }]}>Preview insights use sample business activity. Your SaaS AI will provide live answers when connected.</Text>}
      />

      <View style={[styles.composerArea, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: bottomInset + 8 }]}>
        <View style={[styles.composer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => sendMessage()}
            placeholder="Ask about your business..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="send"
            style={[styles.input, { color: colors.foreground }]}
            testID="business-ai-input"
          />
          <TouchableOpacity testID="business-ai-send" accessibilityLabel="Send message" onPress={() => sendMessage()} disabled={!draft.trim()} style={[styles.sendButton, { backgroundColor: draft.trim() ? colors.primary : colors.muted }]}>
            <Feather name="arrow-up" size={17} color={draft.trim() ? colors.primaryForeground : colors.mutedForeground} />
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
  backText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  headerTitleWrap: { alignItems: 'center' },
  eyebrow: { fontSize: 9, letterSpacing: 1.35, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 22, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  aiMark: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  messageContent: { paddingHorizontal: 20, paddingBottom: 18 },
  healthCard: { borderRadius: 20, padding: 17, marginBottom: 18 },
  healthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  healthEyebrow: { fontSize: 9, letterSpacing: 1.15, fontFamily: 'Inter_700Bold', opacity: 0.78 },
  healthTitle: { fontSize: 18, letterSpacing: -0.25, fontFamily: 'Inter_600SemiBold', marginTop: 6 },
  healthPulse: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  metricRow: { flexDirection: 'row', alignItems: 'center', marginTop: 19 },
  metric: { flex: 1 },
  metricValue: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  metricLabel: { fontSize: 9, fontFamily: 'Inter_400Regular', marginTop: 4, opacity: 0.78 },
  metricDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 10 },
  healthNote: { fontSize: 10, fontFamily: 'Inter_500Medium', marginTop: 16, opacity: 0.86 },
  chatIntro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  assistantAvatar: { width: 32, height: 32, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  introText: { fontSize: 10, fontFamily: 'Inter_400Regular', lineHeight: 15, marginTop: 3 },
  suggestionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 18 },
  suggestionChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 11, paddingVertical: 8 },
  suggestionText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 11, maxWidth: '92%' },
  userMessageRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  smallAvatar: { width: 23, height: 23, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  messageBubble: { borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 5, paddingHorizontal: 12, paddingVertical: 10, maxWidth: '88%' },
  userBubble: { borderWidth: 0, borderBottomLeftRadius: 16, borderBottomRightRadius: 5 },
  messageText: { fontSize: 12, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  previewNote: { textAlign: 'center', fontSize: 9, lineHeight: 14, fontFamily: 'Inter_400Regular', marginTop: 6, marginBottom: 2 },
  composerArea: { paddingHorizontal: 15, paddingTop: 9, borderTopWidth: 1 },
  composer: { minHeight: 48, borderWidth: 1, borderRadius: 17, paddingLeft: 14, paddingRight: 6, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, minHeight: 42, fontSize: 12, fontFamily: 'Inter_400Regular', paddingVertical: 8 },
  sendButton: { width: 35, height: 35, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});