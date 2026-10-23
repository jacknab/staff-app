/**
 * One booking request: approve it (the time is booked and the client gets the usual confirmation), offer other
 * times (the client is texted a link showing only those times; it stays open for the days set in Settings →
 * Booking approval), or decline it (the client is told). Server: routes/bookingRequests.ts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api, ApiError } from '@/lib/live-api';
import { approveBookingRequest, declineBookingRequest, getBookingRequest, offerBookingTimes, type BookingRequest } from '@/lib/bookingRequests';
import { businessToday, zonedDateLabel, zonedTimeLabel } from '@/lib/businessTime';

const MAX_TIMES = 8;
function isoDay(day: Date) { return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`; }

export default function RequestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { timeZone, ownStaffId, refresh } = useBookingData();
  const [request, setRequest] = useState<BookingRequest | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'' | 'approve' | 'decline' | 'offer'>('');
  // Offering other times
  const [offering, setOffering] = useState(false);
  const [slug, setSlug] = useState('');
  const [day, setDay] = useState(() => businessToday(timeZone));
  const [slots, setSlots] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    setError('');
    try { setRequest(await getBookingRequest(Number(id))); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the request.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => Array.from({ length: 21 }, (_, n) => { const d = businessToday(timeZone); d.setDate(d.getDate() + n); return d; }), [timeZone]);

  // Open times on the chosen day for this request's service and length (your own calendar only).
  useEffect(() => {
    if (!offering || !request?.serviceId) return;
    let cancelled = false;
    setSlots(null);
    (async () => {
      try {
        let storeSlug = slug;
        if (!storeSlug) {
          const stores = await api.get<Array<{ bookingSlug?: string | null }>>('/api/stores');
          storeSlug = String(stores?.[0]?.bookingSlug ?? '');
          if (!cancelled) setSlug(storeSlug);
        }
        const rows = await api.get<Array<{ time: string; staffId: number }>>(`/api/public/store/${encodeURIComponent(storeSlug)}/availability?serviceId=${request.serviceId}&date=${isoDay(day)}&duration=${request.duration}${ownStaffId ? `&staffId=${ownStaffId}` : ''}${request.visitAt === 'client' ? '&visitAt=client' : ''}`);
        const times = [...new Set((Array.isArray(rows) ? rows : []).filter((row) => !ownStaffId || Number(row.staffId) === ownStaffId).map((row) => row.time))].sort();
        if (!cancelled) setSlots(times);
      } catch { if (!cancelled) setSlots([]); }
    })();
    return () => { cancelled = true; };
  }, [day, offering, ownStaffId, request?.duration, request?.serviceId, request?.visitAt, slug]);

  const approve = async () => {
    if (!request) return;
    setBusy('approve'); setError('');
    try {
      setRequest(await approveBookingRequest(request.id));
      void refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        Alert.alert('That time is taken', `${cause.message}\n\nOffer ${request.clientName.split(' ')[0]} other times instead?`, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Offer other times', onPress: () => setOffering(true) },
        ]);
      } else setError(cause instanceof Error ? cause.message : 'Could not approve the request.');
    } finally { setBusy(''); }
  };

  const decline = () => {
    if (!request) return;
    Alert.alert('Decline this request?', `${request.clientName} gets a text that you can't take it, with your booking link.`, [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: async () => {
        setBusy('decline'); setError('');
        try { setRequest(await declineBookingRequest(request.id)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not decline the request.'); }
        finally { setBusy(''); }
      } },
    ]);
  };

  const sendTimes = async () => {
    if (!request || picked.length === 0) return;
    setBusy('offer'); setError('');
    try {
      setRequest(await offerBookingTimes(request.id, picked));
      setOffering(false); setPicked([]);
      Alert.alert('Times sent', `${request.clientName.split(' ')[0]} got a text with a link to pick one of the ${picked.length === 1 ? 'time' : `${picked.length} times`}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send the times.'); }
    finally { setBusy(''); }
  };

  const toggle = (time: string) => setPicked((current) => current.includes(time) ? current.filter((t) => t !== time) : current.length >= MAX_TIMES ? current : [...current, time].sort());
  const open = request?.status === 'requested' || request?.status === 'offered';
  const address = request?.clientAddress ? [request.clientAddress.line1, request.clientAddress.line2, request.clientAddress.city, [request.clientAddress.state, request.clientAddress.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
  const statusText: Record<string, string> = {
    requested: `Waiting for you · answer by ${request ? `${zonedDateLabel(request.expiresAt, timeZone)} ${zonedTimeLabel(request.expiresAt, timeZone)}` : ''}`,
    offered: `Times offered · the link is open until ${request ? zonedDateLabel(request.expiresAt, timeZone) : ''}`,
    approved: 'Approved · it is on your calendar', booked: 'Booked · the client picked one of your times',
    booking: 'Booking…', declined: 'Declined', expired: 'Expired · nobody answered in time',
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.nav}>
        <TouchableOpacity accessibilityLabel="Back" onPress={() => (offering ? setOffering(false) : router.back())} style={styles.back} testID="request-back"><Feather name="arrow-left" size={20} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>{offering ? 'Offer other times' : 'Booking request'}</Text>
        <View style={styles.back} />
      </View>
      {!request ? (
        <View style={styles.center}>{error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : <ActivityIndicator color={colors.primary} />}</View>
      ) : offering ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 140 }]}>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{`Pick up to ${MAX_TIMES} times that suit you. ${request.clientName.split(' ')[0]} gets a text with a link to choose one, and it's booked straight away.`}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
              {days.map((d) => {
                const active = isoDay(d) === isoDay(day);
                return (
                  <TouchableOpacity key={isoDay(d)} onPress={() => setDay(d)} style={[styles.day, { backgroundColor: active ? colors.primary : colors.card, borderColor: active ? colors.primary : colors.border }]} testID={`offer-day-${isoDay(d)}`}>
                    <Text style={[styles.dayName, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                    <Text style={[styles.dayNum, { color: active ? colors.primaryForeground : colors.foreground }]}>{d.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {slots === null ? <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} /> : slots.length === 0 ? (
              <Text style={[styles.body, { color: colors.mutedForeground }]}>No open time on this day has room for the whole visit.</Text>
            ) : (
              <View style={styles.grid}>
                {slots.map((time) => {
                  const on = picked.includes(time);
                  return (
                    <TouchableOpacity key={time} onPress={() => toggle(time)} style={[styles.slot, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border }]} testID={`offer-slot-${time}`}>
                      <Text style={[styles.slotText, { color: on ? colors.primaryForeground : colors.foreground }]}>{zonedTimeLabel(time, timeZone)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {picked.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>{`Times to send (${picked.length})`}</Text>
                {picked.map((time) => (
                  <View key={time} style={[styles.pickedRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Text style={[styles.body, { flex: 1, marginTop: 0, color: colors.foreground }]}>{`${zonedDateLabel(time, timeZone)} at ${zonedTimeLabel(time, timeZone)}`}</Text>
                    <TouchableOpacity accessibilityLabel="Remove" onPress={() => toggle(time)}><Feather name="x" size={18} color={colors.mutedForeground} /></TouchableOpacity>
                  </View>
                ))}
              </>
            ) : null}
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          </ScrollView>
          <View style={[styles.footer, { borderTopColor: colors.border, backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity disabled={picked.length === 0 || busy === 'offer'} onPress={() => void sendTimes()} style={[styles.button, { backgroundColor: picked.length === 0 || busy ? colors.muted : colors.primary }]} testID="offer-send">
              <Text style={[styles.buttonText, { color: picked.length === 0 || busy ? colors.mutedForeground : colors.primaryForeground }]}>{busy === 'offer' ? 'Sending…' : picked.length === 0 ? 'Choose times' : `Send ${picked.length} ${picked.length === 1 ? 'time' : 'times'} to ${request.clientName.split(' ')[0]}`}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.client, { color: colors.foreground }]}>{request.clientName}</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>{statusText[request.status] ?? request.status}</Text>
          {request.clientPhone ? (
            <View style={styles.contactRow}>
              <TouchableOpacity onPress={() => void Linking.openURL(`sms:${request.clientPhone}`)} style={[styles.contact, { borderColor: colors.border }]}><Text style={[styles.contactText, { color: colors.foreground }]}>Text</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => void Linking.openURL(`tel:${request.clientPhone}`)} style={[styles.contact, { borderColor: colors.border }]}><Text style={[styles.contactText, { color: colors.foreground }]}>Call</Text></TouchableOpacity>
            </View>
          ) : null}
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.label, { marginTop: 0, color: colors.mutedForeground }]}>ASKED FOR</Text>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{request.serviceName}</Text>
            <Text style={[styles.body, { color: colors.foreground }]}>{`${zonedDateLabel(request.startsAt, timeZone)} at ${zonedTimeLabel(request.startsAt, timeZone)} · ${request.duration} min`}</Text>
            {request.visitAt === 'client' ? <Text style={[styles.body, { color: colors.foreground }]}>{`House call${request.travelFee ? ` · $${request.travelFee.toFixed(2)} travel fee` : ''}`}</Text> : null}
            {address ? <Text style={[styles.body, { color: colors.mutedForeground }]}>{address}</Text> : null}
            {request.notes ? <Text style={[styles.body, { color: colors.mutedForeground }]}>{`Note: ${request.notes}`}</Text> : null}
          </View>
          {request.status === 'offered' && request.offeredTimes.length > 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { marginTop: 0, color: colors.mutedForeground }]}>TIMES YOU OFFERED</Text>
              {request.offeredTimes.map((time) => <Text key={time} style={[styles.body, { color: colors.foreground }]}>{`${zonedDateLabel(time, timeZone)} at ${zonedTimeLabel(time, timeZone)}`}</Text>)}
            </View>
          ) : null}
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          {request.status === 'requested' ? (
            <TouchableOpacity disabled={!!busy} onPress={() => void approve()} style={[styles.button, { backgroundColor: busy ? colors.muted : colors.primary }]} testID="request-approve">
              <Text style={[styles.buttonText, { color: busy ? colors.mutedForeground : colors.primaryForeground }]}>{busy === 'approve' ? 'Approving…' : 'Approve'}</Text>
            </TouchableOpacity>
          ) : null}
          {open ? (
            <>
              <TouchableOpacity disabled={!!busy} onPress={() => { setPicked(request.status === 'offered' ? request.offeredTimes.filter((t) => new Date(t).getTime() > Date.now()) : []); setOffering(true); }} style={[styles.button, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginTop: 10 }]} testID="request-offer">
                <Text style={[styles.buttonText, { color: colors.foreground }]}>{request.status === 'offered' ? 'Change the times offered' : 'Offer other times'}</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={!!busy} onPress={decline} style={styles.decline} testID="request-decline">
                <Text style={[styles.declineText, { color: colors.destructive }]}>{busy === 'decline' ? 'Declining…' : 'Decline'}</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  nav: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  client: { fontSize: 25, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold' },
  body: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 4 },
  contactRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  contact: { borderWidth: 1, borderRadius: 11, paddingVertical: 8, paddingHorizontal: 16 },
  contactText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  card: { borderWidth: 1, borderRadius: 15, padding: 15, marginTop: 16 },
  cardTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  label: { fontSize: 11, letterSpacing: 0.6, fontFamily: 'Inter_700Bold', marginTop: 18 },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 14 },
  button: { height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  decline: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 8 },
  declineText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  day: { width: 50, borderWidth: 1, borderRadius: 13, paddingVertical: 8, alignItems: 'center' },
  dayName: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  dayNum: { fontSize: 16, fontFamily: 'Inter_700Bold', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31%', borderWidth: 1, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
  slotText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  pickedRow: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, paddingHorizontal: 20, paddingTop: 12 },
});
