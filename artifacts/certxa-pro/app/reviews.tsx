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
import { Feather, Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { appointmentParams, mapAppointment, useBookingData, type ApiAppointment } from '@/contexts/BookingContext';
import { HelpTitle } from '@/components/HelpTitle';
import { getGoogleProfile, googleConnected, googleReviews, myStoreId, replyOnGoogle, type GoogleReview } from '@/lib/google-business';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
type Review = {
  id: number; rating: number; comment?: string | null; customerName?: string | null; serviceName?: string | null;
  createdAt?: string | null; ownerResponse?: string | null; ownerResponseAt?: string | null; photoUrl?: string | null; appointmentId?: number | null; clientAvatarUrl?: string | null;
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
  const { timeZone } = useBookingData();
  // "View booking": the booking the review was left for, loaded on its own (it may be outside the calendar's month).
  const [openingBooking, setOpeningBooking] = useState<number | null>(null);
  const openBooking = async (appointmentId: number) => {
    const reviewId = reviews.find((r) => r.appointmentId === appointmentId)?.id ?? null;
    setOpeningBooking(reviewId);
    try {
      const row = await api.get<ApiAppointment>(`/api/appointments/${appointmentId}`);
      router.push(appointmentParams(mapAppointment(row, timeZone)));
    } catch {
      Alert.alert('Booking', 'That booking could not be opened.');
    } finally {
      setOpeningBooking(null);
    }
  };
  const [reviews, setReviews] = useState<Review[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Google reviews, when the business has connected its Google Business Profile (Settings › Google; owner, 2026-11-11).
  const [googleStore, setGoogleStore] = useState<number | null>(null);
  const [gReviews, setGReviews] = useState<GoogleReview[]>([]);
  const [gReplyingTo, setGReplyingTo] = useState<number | null>(null);
  const [gReply, setGReply] = useState('');
  const [gSaving, setGSaving] = useState(false);
  const [gError, setGError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [rows, totals] = await Promise.all([api.get<Review[]>('/api/reviews'), api.get<Stats>('/api/reviews/stats')]);
      setReviews(Array.isArray(rows) ? rows : []);
      setStats(totals ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your reviews from Certxa.'); }
    try {
      const id = await myStoreId();
      const connected = id ? googleConnected(await getGoogleProfile(id)) : false;
      setGoogleStore(connected ? id : null);
      setGReviews(connected && id ? await googleReviews(id) : []);
    } catch { setGoogleStore(null); }
  }, []);

  const replyGoogle = async (review: GoogleReview) => {
    if (gSaving || !googleStore || !gReply.trim()) return;
    setGSaving(true); setGError('');
    try {
      await replyOnGoogle(googleStore, review.id, gReply.trim());
      setGReviews((current) => current.map((row) => (row.id === review.id ? { ...row, ownerReply: { comment: gReply.trim() } } : row)));
      setGReplyingTo(null); setGReply('');
    } catch (cause) { setGError(cause instanceof Error ? cause.message : 'Google didn’t take the reply. Try again in a moment.'); }
    finally { setGSaving(false); }
  };

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
      {/* Filled stars for the rating (the outline-only star looked the same filled or not, 2026-11-03). */}
      {[1, 2, 3, 4, 5].map((n) => <Ionicons key={n} name={n <= rating ? 'star' : 'star-outline'} size={size} color={n <= rating ? '#D9A441' : colors.border} />)}
    </View>
  );

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="reviews-back" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="reviews" style={[styles.headerTitle, { color: colors.foreground }]}>Reviews</HelpTitle>
        <View style={styles.headerButton} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} onRefresh={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }} />}>
        {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : (
          <>
            {error ? <View style={[styles.banner, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={17} color={colors.accentForeground} /><Text style={[styles.bannerText, { color: colors.accentForeground }]}>{error}</Text></View> : null}
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

            {googleStore ? (
              <View testID="google-reviews">
                <Text style={[styles.responseLabel, { color: colors.mutedForeground, marginBottom: 8 }]}>GOOGLE REVIEWS</Text>
                {gReviews.length === 0 ? <Text style={[styles.meta, { color: colors.mutedForeground, marginBottom: 14 }]}>No Google reviews yet.</Text> : null}
                {gReviews.map((review) => {
                  const open = gReplyingTo === review.id;
                  const replied = review.ownerReply?.comment;
                  return (
                    <View key={`g-${review.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={styles.cardHead}>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.name, { color: colors.foreground }]}>{review.customerName ?? 'Google user'}</Text>
                          {stars(Math.round(review.rating))}
                          <Text style={[styles.meta, { color: colors.mutedForeground, marginTop: 4 }]}>{dateLabel(review.reviewCreateTime)} · Posted on Google</Text>
                        </View>
                      </View>
                      {review.reviewText ? <Text style={[styles.comment, { color: colors.foreground }]}>{review.reviewText}</Text> : null}
                      {replied ? <View style={[styles.response, { backgroundColor: colors.secondary }]}><Text style={[styles.responseLabel, { color: colors.primary }]}>YOUR REPLY ON GOOGLE</Text><Text style={[styles.reviewMeta, { color: colors.foreground, marginTop: 4 }]}>{replied}</Text></View> : null}
                      {open ? (
                        <View style={{ marginTop: 12 }}>
                          <TextInput testID={`google-reply-input-${review.id}`} autoFocus multiline maxLength={4000} value={gReply} onChangeText={setGReply} placeholder="Write a reply. It’s posted on Google for everyone to see." placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]} />
                          {gError ? <Text style={[styles.meta, { color: colors.destructive }]}>{gError}</Text> : null}
                          <View style={styles.actions}>
                            <TouchableOpacity disabled={gSaving} onPress={() => { setGReplyingTo(null); setGReply(''); setGError(''); }} style={[styles.button, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}><Text style={[styles.buttonText, { color: colors.foreground }]}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity testID={`google-reply-save-${review.id}`} disabled={gSaving || !gReply.trim()} onPress={() => void replyGoogle(review)} style={[styles.button, { backgroundColor: gSaving || !gReply.trim() ? colors.muted : colors.primary }]}><Text style={[styles.buttonText, { color: gSaving || !gReply.trim() ? colors.mutedForeground : colors.primaryForeground }]}>{gSaving ? 'Posting…' : 'Post on Google'}</Text></TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <TouchableOpacity testID={`google-reply-${review.id}`} onPress={() => { setGReplyingTo(review.id); setGReply(replied ?? ''); setGError(''); }} style={styles.replyLink}><Feather name="corner-up-left" size={16} color={colors.primary} /><Text style={[styles.replyText, { color: colors.primary }]}>{replied ? 'Edit your reply' : 'Reply'}</Text></TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {reviews.length > 0 ? <Text style={[styles.responseLabel, { color: colors.mutedForeground, marginTop: 10, marginBottom: 8 }]}>CERTXA REVIEWS</Text> : null}
              </View>
            ) : null}

            {reviews.length === 0 && !error && !googleStore ? (
              <View style={[styles.empty, { backgroundColor: colors.secondary }]}><Feather name="message-circle" size={20} color={colors.primary} /><Text style={[styles.emptyText, { color: colors.primary }]}>No reviews yet. Clients are asked for one after their appointment when review requests are switched on in Settings.</Text></View>
            ) : null}

            {reviews.map((review) => {
              const open = replyingTo === review.id;
              return (
                <View key={review.id} testID={`review-${review.id}`} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHead}>
                    {review.clientAvatarUrl
                      ? <Image testID={`review-avatar-${review.id}`} source={{ uri: review.clientAvatarUrl }} style={styles.avatar} />
                      : <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.foreground }]}>{(review.customerName || 'Client').charAt(0).toUpperCase()}</Text></View>}
                    <View style={{ flex: 1 }}><Text style={[styles.name, { color: colors.foreground }]}>{review.customerName || 'Client'}</Text><Text style={[styles.reviewMeta, { color: colors.mutedForeground }]}>{[review.serviceName, dateLabel(review.createdAt)].filter(Boolean).join(' · ')}</Text></View>
                    {stars(review.rating, 17)}
                  </View>
                  {/* The photo the client added to the review, with their words beside it. */}
                  <View style={styles.reviewBody}>
                    {review.photoUrl ? <Image testID={`review-photo-${review.id}`} source={{ uri: review.photoUrl }} resizeMode="cover" style={[styles.photo, { borderColor: colors.border }]} accessibilityLabel="Photo from the client" /> : null}
                    <View style={{ flex: 1 }}>
                      {review.comment ? <Text style={[styles.comment, { color: colors.foreground }]}>{review.comment}</Text> : <Text style={[styles.comment, { color: colors.mutedForeground }]}>No written comment.</Text>}
                    </View>
                  </View>
                  {/* The visit the review is about: its booking, paid or not (owner, 2026-11-03). */}
                  {review.appointmentId ? (
                    <TouchableOpacity testID={`review-booking-${review.id}`} disabled={openingBooking === review.id} onPress={() => void openBooking(review.appointmentId!)} style={styles.bookingLink}>
                      <Feather name="file-text" size={16} color={colors.primary} />
                      <Text style={[styles.bookingLinkText, { color: colors.primary }]}>{openingBooking === review.id ? 'Opening…' : 'View booking'}</Text>
                    </TouchableOpacity>
                  ) : null}

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
                    <TouchableOpacity testID={`review-reply-${review.id}`} onPress={() => startReply(review)} style={styles.replyLink}><Feather name="corner-up-left" size={16} color={colors.primary} /><Text style={[styles.replyText, { color: colors.primary }]}>{review.ownerResponse ? 'Edit your reply' : 'Reply'}</Text></TouchableOpacity>
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
  headerTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  summary: { borderWidth: 1, borderRadius: 17, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 14, ...cardShadow },
  summaryLeft: { alignItems: 'center', minWidth: 86 },
  average: { fontSize: 34, letterSpacing: -1, fontFamily: 'Inter_600SemiBold', marginBottom: 4 },
  stars: { flexDirection: 'row', gap: 2 },
  photo: { width: 120, height: 120, borderRadius: 12, borderWidth: 1 },
  bookingLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  bookingLinkText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  meta: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  empty: { borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyText: { flex: 1, fontSize: 15, lineHeight: 22, fontFamily: 'Inter_500Medium' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 9 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 21, fontFamily: 'Inter_600SemiBold' },
  name: { fontSize: 19, fontFamily: 'Inter_600SemiBold', marginBottom: 3 },
  reviewMeta: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_400Regular' },
  reviewBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  comment: { fontSize: 19, lineHeight: 28, fontFamily: 'Inter_400Regular' },
  response: { borderRadius: 12, padding: 11, marginTop: 12 },
  responseLabel: { fontSize: 15, letterSpacing: 1.1, fontFamily: 'Inter_700Bold' },
  input: { minHeight: 92, borderWidth: 1, borderRadius: 13, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 11, fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular', textAlignVertical: 'top', marginBottom: 5 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  button: { flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  replyLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, minHeight: 30 },
  replyText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  banner: { marginBottom: 14, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerText: { flex: 1, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium' },
});
