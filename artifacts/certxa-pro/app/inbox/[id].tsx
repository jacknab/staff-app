/**
 * One website conversation (owner, 2026-11-07): the client's messages and the pro's answers. An answer is e-mailed to
 * the client with a link to the conversation, where they write back (server: routes/proMessages.ts). Opening it marks
 * it read. A client already on the books opens their profile from the name. Delete is for spam.
 * Laid out like a message in the iPhone's Mail app (owner, 2026-11-09): sender block, large subject, each message as
 * its own e-mail in the thread, a bottom bar with Trash and Reply, and a compose sheet to answer. Live chat is retired,
 * so there is no "is typing" any more.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { when } from '@/lib/inbox';
import { onInboxEvent } from '@/lib/inboxLive';
import { look } from '@/components/look/tokens';
import { HelpTitle } from '@/components/HelpTitle';

type Message = { id: number; sender: 'client' | 'pro'; body: string; createdAt: string };
type Thread = { id: number; clientId: number | null; clientName: string; clientEmail: string; clientPhone: string | null; subject: string; messages: Message[] };

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
const reSubject = (subject: string) => (/^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`);

export default function InboxThreadScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const [failed, setFailed] = useState('');
  const [composing, setComposing] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const scroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    try { setThread(await api.get<Thread>(`/api/pro/messages/${id}`)); setFailed(''); }
    catch (cause) { setFailed(cause instanceof ApiError ? cause.message : 'This message could not be opened.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  // A client's new message shows while the conversation is open (lib/inboxLive.ts); the 15-second check covers a dropped connection.
  useEffect(() => { const iv = setInterval(() => void load(), 15_000); return () => clearInterval(iv); }, [load]);
  useEffect(() => onInboxEvent((e) => { if (e.threadId === Number(id) && e.type === 'message' && e.message.sender === 'client') void load(); }), [id, load]);

  const send = async () => {
    if (!reply.trim() || sending) return;
    setSending(true); setError(''); setNote('');
    try {
      const r = await api.post<{ emailed?: boolean }>(`/api/pro/messages/${id}/reply`, { message: reply.trim() });
      setReply(''); setComposing(false);
      setNote(r?.emailed === false ? 'Your answer is saved, but the e-mail to the client could not be sent.' : 'Sent. The client gets your answer by e-mail.');
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Your answer could not be sent.');
    } finally { setSending(false); }
  };

  const remove = () => Alert.alert('Delete this conversation?', 'It is deleted for good, for spam or messages you no longer need.', [
    { text: 'Keep', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await api.del(`/api/pro/messages/${id}`); router.back(); }
      catch (cause) { setError(cause instanceof ApiError ? cause.message : 'This conversation could not be deleted.'); }
    } },
  ]);
  const cancelCompose = () => {
    if (!reply.trim()) { setComposing(false); return; }
    Alert.alert('Delete this draft?', undefined, [{ text: 'Keep Editing', style: 'cancel' }, { text: 'Delete Draft', style: 'destructive', onPress: () => { setReply(''); setComposing(false); } }]);
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const first = thread?.messages[0];
  return (
    <View style={[styles.root, { paddingTop: topInset }]} testID="inbox-thread-screen">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back to Inbox" testID="inbox-thread-back">
          <Feather name="chevron-left" size={30} color={look.violet} />
          <Text style={styles.backText}>Inbox</Text>
        </TouchableOpacity>
      </View>
      {failed ? <Text style={[styles.gray, { textAlign: 'center', marginTop: 40 }]}>{failed}</Text>
        : !thread ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
        : (
          <>
            <ScrollView ref={scroll} contentContainerStyle={{ paddingBottom: 24 }}>
              {/* Sender block, like Mail: who it's from, who it's to, when. The name opens the client's profile. */}
              <View style={styles.header}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initials(thread.clientName)}</Text></View>
                <View style={{ flex: 1 }}>
                  <View style={styles.headerLine}>
                    <TouchableOpacity style={{ flex: 1 }} disabled={!thread.clientId} onPress={() => thread.clientId && router.push(`/client/${thread.clientId}`)} testID="inbox-thread-client">
                      <Text style={styles.sender} numberOfLines={1}>{thread.clientName}</Text>
                    </TouchableOpacity>
                    {first ? <Text style={styles.gray}>{when(first.createdAt)}</Text> : null}
                  </View>
                  <Text style={styles.gray} numberOfLines={1} selectable>{`From: ${thread.clientEmail}`}</Text>
                  {thread.clientPhone ? <Text style={styles.gray} numberOfLines={1} selectable>{`Phone: ${thread.clientPhone}`}</Text> : null}
                  <Text style={styles.gray}>To: You</Text>
                </View>
              </View>
              <HelpTitle help="inbox.thread" style={styles.subject}>{thread.subject}</HelpTitle>

              {/* Each message is one e-mail in the thread, oldest first. */}
              {thread.messages.map((m, i) => {
                const mine = m.sender === 'pro';
                return (
                  <View key={m.id} style={[styles.message, i > 0 && styles.messageDivider]} testID={`inbox-message-${m.id}`}>
                    {i > 0 ? (
                      <View style={styles.messageHead}>
                        <Text style={[styles.messageFrom, mine && { color: look.violet }]}>{mine ? 'You' : thread.clientName}</Text>
                        <Text style={styles.gray}>{when(m.createdAt)}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.messageBody} selectable>{m.body}</Text>
                  </View>
                );
              })}
              {note ? <Text style={[styles.gray, styles.note]} testID="inbox-thread-note">{note}</Text> : null}
              {error && !composing ? <Text style={[styles.note, { color: colors.destructive }]}>{error}</Text> : null}
            </ScrollView>

            {/* Mail's bottom bar: Trash and Reply. */}
            <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <TouchableOpacity onPress={remove} style={styles.toolButton} accessibilityLabel="Delete conversation" testID="inbox-thread-delete">
                <Feather name="trash-2" size={26} color={look.violet} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setError(''); setComposing(true); }} style={styles.toolButton} accessibilityLabel="Reply" testID="inbox-thread-reply-open">
                <Feather name="corner-up-left" size={26} color={look.violet} />
              </TouchableOpacity>
            </View>

            {/* The reply, written on a sheet like Mail's: Cancel, the subject, the round send arrow, To and Subject. */}
            <Modal visible={composing} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancelCompose}>
              <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.sheetTop}>
                  <TouchableOpacity onPress={cancelCompose} testID="inbox-compose-cancel"><Text style={styles.cancel}>Cancel</Text></TouchableOpacity>
                </View>
                <View style={styles.sheetTitleRow}>
                  <Text style={styles.sheetTitle} numberOfLines={2}>{reSubject(thread.subject)}</Text>
                  <TouchableOpacity onPress={() => void send()} disabled={!reply.trim() || sending} accessibilityLabel="Send" testID="inbox-thread-send"
                    style={[styles.sendButton, { backgroundColor: reply.trim() && !sending ? look.violet : '#C7C7CC' }]}>
                    {sending ? <ActivityIndicator color="#FFFFFF" /> : <Feather name="arrow-up" size={24} color="#FFFFFF" />}
                  </TouchableOpacity>
                </View>
                <View style={styles.field}><Text style={styles.fieldLabel}>To:</Text><Text style={[styles.fieldValue, { color: look.violet }]} numberOfLines={1}>{thread.clientName}</Text></View>
                <View style={styles.field}><Text style={styles.fieldLabel}>Subject:</Text><Text style={styles.fieldValue} numberOfLines={2}>{reSubject(thread.subject)}</Text></View>
                {error ? <Text style={[styles.note, { color: colors.destructive }]}>{error}</Text> : null}
                <TextInput value={reply} onChangeText={setReply} placeholder="Write your answer" placeholderTextColor="#8A8A8E" multiline autoFocus maxLength={5000}
                  style={styles.composeInput} testID="inbox-thread-reply" />
                <Text style={[styles.gray, { paddingHorizontal: 20, paddingBottom: 16 }]}>Your answer is e-mailed to the client with a link to write back.</Text>
              </KeyboardAvoidingView>
            </Modal>
          </>
        )}
    </View>
  );
}

const SEPARATOR = '#D9D9DE';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  nav: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', height: 44, paddingRight: 12 },
  backText: { fontSize: 18, color: look.violet, fontFamily: 'Inter_400Regular', marginLeft: -2 },
  header: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEPARATOR },
  avatar: { width: 44, height: 44, borderRadius: 11, backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  headerLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sender: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#000000' },
  gray: { fontSize: 15, lineHeight: 20, fontFamily: 'Inter_400Regular', color: '#8A8A8E' },
  subject: { fontSize: 26, lineHeight: 32, fontFamily: 'Inter_700Bold', color: '#000000', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  message: { paddingHorizontal: 16, paddingVertical: 12 },
  messageDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEPARATOR },
  messageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  messageFrom: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: '#000000' },
  messageBody: { fontSize: 17, lineHeight: 25, fontFamily: 'Inter_400Regular', color: '#000000' },
  note: { fontSize: 15, paddingHorizontal: 16, marginTop: 6, fontFamily: 'Inter_400Regular' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 28, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEPARATOR, backgroundColor: '#F7F7F8' },
  toolButton: { width: 48, height: 40, alignItems: 'center', justifyContent: 'center' },
  sheet: { flex: 1, backgroundColor: '#FFFFFF' },
  sheetTop: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  cancel: { fontSize: 18, color: look.violet, fontFamily: 'Inter_400Regular' },
  sheetTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  sheetTitle: { flex: 1, fontSize: 26, lineHeight: 32, fontFamily: 'Inter_700Bold', color: '#000000' },
  sendButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  field: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 46, paddingHorizontal: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEPARATOR },
  fieldLabel: { fontSize: 16, fontFamily: 'Inter_400Regular', color: '#8A8A8E' },
  fieldValue: { flex: 1, fontSize: 16, fontFamily: 'Inter_400Regular', color: '#000000' },
  composeInput: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEPARATOR, paddingHorizontal: 20, paddingTop: 14, fontSize: 17, lineHeight: 24, textAlignVertical: 'top', fontFamily: 'Inter_400Regular', color: '#000000' },
});
