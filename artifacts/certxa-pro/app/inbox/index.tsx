/**
 * Inbox (owner, 2026-11-07; plans/pro-messages.md on the server): messages clients send from the pro's website. Opened
 * from the envelope on Home. Each conversation opens app/inbox/[id].tsx, where the pro answers and the answer goes to
 * the client by e-mail.
 * Laid out like the iPhone's Mail app (owner, 2026-11-09): a large "Inbox" title, a plain list with an unread dot,
 * sender, time, subject and a two-line preview, and a bottom bar with "Updated … · N Unread". Live chat is retired, so
 * there is no availability switch any more.
 * Swipe a conversation left to delete it (owner, 2026-11-07): one quick swipe, no Delete button to tap.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { when, type InboxThread } from '@/lib/inbox';
import { onInboxEvent } from '@/lib/inboxLive';
import { HelpTitle } from '@/components/HelpTitle';
import { look } from '@/components/look/tokens';

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

export default function InboxScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [list, setList] = useState<InboxThread[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try { setList(await api.get<InboxThread[]>('/api/pro/messages')); setError(''); setUpdatedAt(Date.now()); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Messages could not be loaded.'); setList((l) => l ?? []); }
  }, []);
  // Every time the inbox shows (back from a conversation too): read marks and new messages are current.
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  // A new message (or one read on another phone) while the inbox is open: show it at once.
  useEffect(() => onInboxEvent((e) => { if (e.type === 'message' || e.type === 'read') void load(); }), [load]);
  // "Updated Just Now" ages to "Updated 3 minutes ago" while the screen stays open.
  useEffect(() => { const iv = setInterval(() => setTick((n) => n + 1), 30_000); return () => clearInterval(iv); }, []);

  // A swipe left deletes it, no tap (owner, 2026-11-07): gone at once (it comes back with an error if the server refuses).
  const remove = async (id: number) => {
    setList((l) => (l ? l.filter((t) => t.id !== id) : l));
    try { await api.del(`/api/pro/messages/${id}`); }
    catch (cause) { setError(cause instanceof ApiError ? cause.message : 'This conversation could not be deleted.'); void load(); }
  };

  const unreadCount = (list ?? []).filter((t) => t.unread > 0).length;
  const updatedLabel = updatedAt == null ? 'Checking for messages…'
    : Date.now() - updatedAt < 60_000 ? 'Updated Just Now'
    : `Updated ${Math.round((Date.now() - updatedAt) / 60_000)} min ago`;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <View style={[styles.root, { paddingTop: topInset }]} testID="inbox-screen">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back" testID="inbox-back">
          <Feather name="chevron-left" size={30} color={look.violet} />
          <Text style={styles.backText}>Home</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={look.violet} />}>
        <HelpTitle help="inbox" style={styles.largeTitle}>Inbox</HelpTitle>
        {error && list && list.length > 0 ? <Text style={[styles.note, { color: colors.destructive }]}>{error}</Text> : null}
        {list == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} />
          : list.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="inbox" size={44} color="#C7C7CC" />
              <Text style={styles.emptyTitle}>No Messages</Text>
              <Text style={styles.emptyText}>{error || 'When a client sends you a message from your website, it shows here.'}</Text>
            </View>
          ) : (
            list.map((t) => {
              const unread = t.unread > 0;
              return (
                <ReanimatedSwipeable key={t.id} friction={2} rightThreshold={40} overshootRight={false}
                  onSwipeableOpen={() => void remove(t.id)}
                  renderRightActions={() => (
                    <View style={[styles.deleteAction, { backgroundColor: colors.destructive }]} testID={`inbox-delete-${t.id}`}>
                      <Feather name="trash-2" size={22} color="#FFFFFF" />
                      <Text style={styles.deleteText}>Trash</Text>
                    </View>
                  )}>
                  <TouchableOpacity onPress={() => router.push(`/inbox/${t.id}` as Href)} testID={`inbox-thread-${t.id}`} activeOpacity={0.6} style={styles.row}>
                    <View style={styles.dotColumn}>{unread ? <View style={styles.dot} testID={`inbox-unread-${t.id}`} /> : null}</View>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{initials(t.clientName)}</Text></View>
                    <View style={styles.body}>
                      <View style={styles.line}>
                        <Text style={styles.from} numberOfLines={1}>{t.clientName}</Text>
                        <Text style={styles.time}>{when(t.lastMessageAt)}</Text>
                        <Feather name="chevron-right" size={18} color="#C4C4C6" />
                      </View>
                      <Text style={[styles.subject, unread && { fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{t.subject}</Text>
                      <Text style={styles.preview} numberOfLines={2}>{t.lastSender === 'pro' ? 'You: ' : ''}{t.snippet}</Text>
                    </View>
                  </TouchableOpacity>
                </ReanimatedSwipeable>
              );
            })
          )}
      </ScrollView>
      {/* Mail's bottom bar: when the list was last checked, and how many conversations are unread. */}
      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]} testID="inbox-status">
        <Text style={styles.toolbarTitle}>{updatedLabel}</Text>
        <Text style={styles.toolbarSub}>{unreadCount === 0 ? 'No Unread' : `${unreadCount} Unread`}</Text>
      </View>
    </View>
  );
}

const SEPARATOR = '#D9D9DE';
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  nav: { height: 44, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', height: 44, paddingRight: 12 },
  backText: { fontSize: 18, color: look.violet, fontFamily: 'Inter_400Regular', marginLeft: -2 },
  largeTitle: { fontSize: 36, letterSpacing: -0.6, fontFamily: 'Inter_700Bold', color: look.heading, paddingHorizontal: 20, marginTop: 2, marginBottom: 8 },
  note: { fontSize: 15, paddingHorizontal: 20, marginBottom: 8, fontFamily: 'Inter_400Regular' },
  row: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', paddingRight: 16 },
  dotColumn: { width: 24, alignItems: 'center', paddingTop: 30 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: look.violet },
  avatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#A78BFA', alignItems: 'center', justifyContent: 'center', marginTop: 14, marginRight: 12 },
  avatarText: { color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  body: { flex: 1, paddingTop: 12, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SEPARATOR, gap: 2 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  from: { flex: 1, fontSize: 18, fontFamily: 'Inter_700Bold', color: '#000000' },
  time: { fontSize: 15, fontFamily: 'Inter_400Regular', color: '#8A8A8E' },
  subject: { fontSize: 16, fontFamily: 'Inter_500Medium', color: '#000000' },
  preview: { fontSize: 16, lineHeight: 21, fontFamily: 'Inter_400Regular', color: '#8A8A8E' },
  deleteAction: { width: 92, alignItems: 'center', justifyContent: 'center', gap: 2 },
  deleteText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', paddingHorizontal: 40, marginTop: 70, gap: 8 },
  emptyTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#000000' },
  emptyText: { fontSize: 16, lineHeight: 22, textAlign: 'center', fontFamily: 'Inter_400Regular', color: '#8A8A8E' },
  toolbar: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SEPARATOR, backgroundColor: '#F7F7F8', alignItems: 'center', paddingTop: 10 },
  toolbarTitle: { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#000000' },
  toolbarSub: { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8A8A8E', marginTop: 1 },
});
