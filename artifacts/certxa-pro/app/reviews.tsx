/**
 * Reviews (opened from More). Shows the reviews clients left through Certxa for this business.
 *
 * Reviews are read-only here: the owner cannot delete, hide or edit a review. The one thing they
 * can do is post a reply, which Certxa stores with the review.
 *
 *   GET  /api/reviews                 the reviews, newest first
 *   GET  /api/reviews/stats           total, average and the 1 to 5 star counts
 *   POST /api/reviews/:id/response    { response }  save the owner's reply (empty removes it)
 */
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

type Review = {
  id: number; rating: number; comment?: string | null; customerName?: string | null; serviceName?: string | null;
  createdAt?: string | null; ownerResponse?: string | null; ownerResponseAt?: string | null;
};
type Stats = { total: number; avg: number; distribution: Record<string, number> };
const MAX_REPLY = 1000;

function dateLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReviewsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [rows, totals] = await Promise.all([api.get<Review[]>('/api/reviews'), api.get<Stats>('/api/reviews/stats')]);
      setReviews(Array.isArray(rows) ? rows : []);
      setStats(totals ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your reviews from Certxa.'); }
  }, []);

  useEffect(() => { void load().finally(() => setLoading(false)); }, [load]);

  const startReply = (review: Review) => { setReplyingTo(review.id); setReply(review.ownerResponse ?? ''); setSaveError(''); };
  const saveReply = async (review: Review) => {
    if (saving) return;
    setSaving(true); setSaveError('');
    try {
      const saved = await api.post<Review>(`/api/reviews/${review.id}/response`, { response: reply.trim() });
      setReviews((current) => current.map((row) => (row.id === review.id ? { ...row, ownerResponse: saved?.ownerResponse ?? null, ownerResponseAt: saved?.ownerResponseAt ?? null } : row)));
      setReplyingTo(null); setReply('');
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'Could not save your reply. Check the connection and try again.'); }
    finally { setSaving(false); }
  };

  const stars = (rating: number, size = 14) => (
    <View style={styles.stars} accessibilityLabel={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => <Feather key={n} name="star" size={size} color={n <= rating ? '#D9A441' : colors.border} />)}
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="reviews-back" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Reviews</Text>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}>
        {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
          <>
            {error ? <View style={[styles.banner, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={15} color={colors.accentForeground} /><Text style={[styles.bannerText, { color: colors.accentForeground }]}>{error}</Text></View> : null}
            <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.summaryLeft}>
                <Text style={[styles.average, { color: colors.foreground }]}>{stats && stats.total > 0 ? stats.avg.toFixed(1) : '–'}</Text>
                {stars(Math.round(stats?.avg ?? 0), 15)}
                <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 6 }]}>{stats?.total ?? 0} {stats?.total === 1 ? 'review' : 'reviews'}</Text>
              </View>
              <View style={{ flex: 1, gap: 5 }}>
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = Number(stats?.distribution?.[String(n)] ?? 0);
                  const share = stats && stats.total > 0 ? count / stats.total : 0;
                  return <View key={n} style={styles.barRow}><Text style={[styles.meta, { color: colors.mutedForeground, width: 10 }]}>{n}</Text><View style={[styles.barTrack, { backgroundColor: colors.muted }]}><View style={[styles.barFill, { backgroundColor: '#D9A441', width: `${Math.round(share * 100)}%` }]} /></View><Text style={[styles.meta, { color: colors.mutedForeground, width: 22, textAlign: 'right' }]}>{count}</Text></View>;
                })}
              </View>
            </View>

            {reviews.length === 0 && !error ? (
              <View style={[styles.empty, { backgroundColor: colors.secondary }]}><Feather name="message-circle" size={18} color={colors.primary} /><Text style={[styles.emptyText, { color: colors.primary }]}>No reviews yet. Clients are asked for one after their appointment when review requests are switched on in Settings.</Text></View>
            ) : null}

            {reviews.map((review) => {
              const open = replyingTo === review.id;
              return (
                <View key={review.id} testID={`review-${review.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHead}>
                    <View style={{ flex: 1 }}><Text style={[styles.name, { color: colors.foreground }]}>{review.customerName || 'Client'}</Text><Text style={[styles.meta, { color: colors.mutedForeground }]}>{[review.serviceName, dateLabel(review.createdAt)].filter(Boolean).join(' · ')}</Text></View>
                    {stars(review.rating)}
                  </View>
                  {review.comment ? <Text style={[styles.comment, { color: colors.foreground }]}>{review.comment}</Text> : <Text style={[styles.comment, { color: colors.mutedForeground }]}>No written comment.</Text>}

                  {review.ownerResponse && !open ? (
                    <View style={[styles.response, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.responseLabel, { color: colors.primary }]}>YOUR REPLY{review.ownerResponseAt ? ` · ${dateLabel(review.ownerResponseAt)}` : ''}</Text>
                      <Text style={[styles.comment, { color: colors.foreground, marginTop: 4 }]}>{review.ownerResponse}</Text>
                    </View>
                  ) : null}

                  {open ? (
                    <View style={{ marginTop: 12 }}>
                      <TextInput testID={`review-reply-input-${review.id}`} autoFocus multiline maxLength={MAX_REPLY} value={reply} onChangeText={setReply} placeholder="Write a reply your clients will see" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                      <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: 'right' }]}>{reply.length} / {MAX_REPLY}</Text>
                      {saveError ? <Text style={[styles.meta, { color: colors.destructive, marginTop: 6 }]}>{saveError}</Text> : null}
                      <View style={styles.actions}>
                        <TouchableOpacity testID={`review-reply-cancel-${review.id}`} disabled={saving} onPress={() => { setReplyingTo(null); setReply(''); setSaveError(''); }} style={[styles.button, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.buttonText, { color: colors.foreground }]}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity testID={`review-reply-save-${review.id}`} disabled={saving || (!reply.trim() && !review.ownerResponse)} onPress={() => void saveReply(review)} style={[styles.button, { backgroundColor: saving || (!reply.trim() && !review.ownerResponse) ? colors.muted : colors.primary }]}><Text style={[styles.buttonText, { color: saving || (!reply.trim() && !review.ownerResponse) ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : !reply.trim() && review.ownerResponse ? 'Remove reply' : 'Post reply'}</Text></TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity testID={`review-reply-${review.id}`} onPress={() => startReply(review)} style={styles.replyLink}><Feather name="corner-up-left" size={14} color={colors.primary} /><Text style={[styles.replyText, { color: colors.primary }]}>{review.ownerResponse ? 'Edit your reply' : 'Reply'}</Text></TouchableOpacity>
                  )}
                </View>
              );
            })}
            {reviews.length > 0 ? <Text style={[styles.meta, { color: colors.mutedForeground, textAlign: 'center', marginTop: 14 }]}>Reviews are written by your clients and cannot be edited or removed here.</Text> : null}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  summary: { borderWidth: 1, borderRadius: 17, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 14 },
  summaryLeft: { alignItems: 'center', minWidth: 86 },
  average: { fontSize: 34, letterSpacing: -1, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  meta: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  empty: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { flex: 1, fontSize: 12, lineHeight: 18, fontFamily: 'Inter_500Medium' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  name: { fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  comment: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  response: { borderRadius: 12, padding: 11, marginTop: 12 },
  responseLabel: { fontSize: 9, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  input: { minHeight: 92, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlignVertical: 'top', marginBottom: 5 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  button: { flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  replyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, minHeight: 30 },
  replyText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  banner: { marginBottom: 14, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { flex: 1, fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
});
