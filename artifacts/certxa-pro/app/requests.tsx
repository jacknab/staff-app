/** Booking requests waiting for an answer (Settings → Booking approval → "Review each one first"). */
import { useCallback, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { listBookingRequests, type BookingRequest } from '@/lib/bookingRequests';
import { zonedDateLabel, zonedTimeLabel } from '@/lib/businessTime';
import { HelpTitle } from '@/components/HelpTitle';

export default function RequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { timeZone } = useBookingData();
  const [requests, setRequests] = useState<BookingRequest[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try { setRequests(await listBookingRequests()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load booking requests.'); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.nav}>
        <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()} style={styles.back} testID="requests-back"><Feather name="arrow-left" size={20} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="requests" style={[styles.navTitle, { color: colors.foreground }]}>Booking requests</HelpTitle>
        <View style={styles.back} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {requests === null && !error ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : null}
        {requests?.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.foreground }]}>No requests waiting</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>New online bookings show here when you review each one first.</Text>
          </View>
        ) : null}
        {requests?.map((request) => (
          <TouchableOpacity key={request.id} onPress={() => router.push({ pathname: '/request/[id]', params: { id: String(request.id) } })} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`request-${request.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>{request.clientName}</Text>
              <Text style={[styles.sub, { color: colors.foreground }]}>{request.serviceName}{request.visitAt === 'client' ? ' · House call' : ''}</Text>
              <Text style={[styles.sub, { color: colors.mutedForeground }]}>
                {request.status === 'offered'
                  ? `Times offered · open until ${zonedDateLabel(request.expiresAt, timeZone)}`
                  : `${zonedDateLabel(request.startsAt, timeZone)} at ${zonedTimeLabel(request.startsAt, timeZone)} · answer by ${zonedDateLabel(request.expiresAt, timeZone)} ${zonedTimeLabel(request.expiresAt, timeZone)}`}
              </Text>
            </View>
            <View style={[styles.pill, { borderColor: colors.border }]}><Text style={[styles.pillText, { color: colors.foreground }]}>{request.status === 'offered' ? 'Offered' : 'Waiting'}</Text></View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  row: { borderWidth: 1, borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  sub: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 3 },
  pill: { borderWidth: 1, borderRadius: 10, paddingVertical: 5, paddingHorizontal: 9 },
  pillText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  empty: { borderWidth: 1, borderRadius: 15, padding: 18, marginTop: 10 },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 10 },
});
