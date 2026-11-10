/**
 * The call in progress on the business number (lib/voice.ts), drawn like the iPhone's own call screen: the name,
 * "Calling…" or the timer, Mute · Keypad · Speaker, and the red End button; Keypad swaps the buttons for the in-call
 * keypad with "Hide" beside End. CallKit also shows the call on the lock screen and in the status bar.
 *
 * When the caller is one of the pro's clients, their card is on the screen (owner, 2026-11-04): photo, status, last and
 * next visit, allergies and the latest note, so the pro needn't look them up; "View full profile" sets the call screen
 * aside (a green bar at the top brings it back) and opens the client's profile while the call goes on.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useBookingData, type ClientProfile } from '@/contexts/BookingContext';
import { ClientAvatar } from '@/components/ClientAvatar';
import { Keypad } from '@/components/Keypad';
import { clientStatusOf, STATUS_LABEL } from '@/lib/clientStatus';
import { answerIncoming, hangUp, sendDigits, setCallMinimized, toggleMute, toggleSpeaker, useActiveCall } from '@/lib/voice';

const ten = (n: string) => n.replace(/\D/g, '').slice(-10);
const pretty = (n: string) => { const d = ten(n); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n; };
const shortDate = (iso: string, timeZone: string, withTime = false) =>
  new Date(iso).toLocaleString('en-US', { timeZone, month: 'short', day: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });

export function CallScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const active = useActiveCall();
  const { clients, timeZone } = useBookingData();
  const [keypad, setKeypad] = useState(false);
  const [pressed, setPressed] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) { setKeypad(false); setPressed(''); } }, [active]);
  useEffect(() => {
    if (active?.state !== 'connected') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active?.state]);
  const client = useMemo(() => (active ? clients.find((c) => c.phone && ten(c.phone) === ten(active.number)) : undefined), [active, clients]);
  if (!active) return null;

  const seconds = active.connectedAt ? Math.max(0, Math.floor((now - active.connectedAt) / 1000)) : 0;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const incoming = active.state === 'incoming';
  const status = active.state === 'connected' ? clock : incoming ? 'Incoming call' : active.state === 'ringing' ? 'Ringing...' : 'Calling...';
  // No client match: the caller line Certxa sent ("Client: Jane Smith · Regular"), else the number.
  const callerName = client?.name ?? (active.displayName ? active.displayName.replace(/^Client:\s*/, '').split(' · ')[0] : null) ?? pretty(active.number);

  // Set aside: a green bar at the top, like the iPhone's, brings the call screen back.
  if (active.minimized) return (
    <TouchableOpacity onPress={() => setCallMinimized(false)} activeOpacity={0.85} accessibilityLabel="Return to call" testID="call-return"
      style={[styles.returnBar, { paddingTop: insets.top + 4 }]}>
      <Text style={styles.returnText}>Touch to return to call · {status}</Text>
    </TouchableOpacity>
  );

  const Round = ({ icon, label, on, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; on?: boolean; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={styles.control} accessibilityLabel={label} activeOpacity={0.6}>
      <View style={[styles.round, { backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.16)' }]}>
        <MaterialCommunityIcons name={icon} size={36} color={on ? '#1C1C1E' : '#FFFFFF'} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
  const openProfile = () => {
    if (!client) return;
    setCallMinimized(true);
    router.push({ pathname: '/client/[id]', params: { id: String(client.customerId) } });
  };
  const showCard = !!client && !keypad;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => setCallMinimized(true)}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#1B2A52', '#2E3049', '#3A3036', '#3E2C44']} locations={[0, 0.4, 0.75, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.12)' }]} />
      <View style={[styles.root, { paddingTop: insets.top + (keypad ? 40 : showCard ? 36 : 130), paddingBottom: insets.bottom + 36 }]} testID="call-screen">
        <View style={styles.who}>
          {keypad && pressed ? <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>{pressed}</Text> : (
            <>
              <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit>{callerName}</Text>
              <Text style={styles.status}>{status}</Text>
            </>
          )}
        </View>

        {showCard ? <ClientCard client={client!} timeZone={timeZone} onOpen={openProfile} /> : null}

        {incoming ? <View style={styles.controls} /> : keypad ? <Keypad dark onPress={(k) => { setPressed((p) => p + k); void sendDigits(k); }} /> : (
          <View style={[styles.controls, showCard && { marginBottom: 0 }]}>
            <Round icon="microphone-off" label="Mute" on={active.muted} onPress={() => void toggleMute()} />
            <Round icon="dialpad" label="Keypad" onPress={() => setKeypad(true)} />
            <Round icon="volume-high" label="Speaker" on={active.speaker} onPress={() => void toggleSpeaker()} />
          </View>
        )}

        {incoming ? (
          // Ringing (owner, 2026-11-07): Decline and Answer, as on the iPhone's own screen.
          <View style={[styles.bottom, { justifyContent: 'space-around', alignSelf: 'stretch' }]}>
            <TouchableOpacity onPress={() => void hangUp()} style={styles.control} accessibilityLabel="Decline call" testID="call-decline" activeOpacity={0.7}>
              <View style={styles.end}><MaterialCommunityIcons name="phone-hangup" size={40} color="#FFFFFF" /></View>
              <Text style={styles.label}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void answerIncoming()} style={styles.control} accessibilityLabel="Answer call" testID="call-answer" activeOpacity={0.7}>
              <View style={[styles.end, { backgroundColor: '#34C759' }]}><MaterialCommunityIcons name="phone" size={40} color="#FFFFFF" /></View>
              <Text style={styles.label}>Answer</Text>
            </TouchableOpacity>
          </View>
        ) : (
        <View style={styles.bottom}>
          <View style={styles.side} />
          <TouchableOpacity onPress={() => void hangUp()} style={styles.control} accessibilityLabel="End call" testID="call-end" activeOpacity={0.7}>
            <View style={styles.end}><MaterialCommunityIcons name="phone-hangup" size={40} color="#FFFFFF" /></View>
            {keypad ? null : <Text style={styles.label}>End</Text>}
          </TouchableOpacity>
          <View style={styles.side}>
            {keypad ? <TouchableOpacity onPress={() => setKeypad(false)} accessibilityLabel="Hide keypad" style={styles.hide}><Text style={styles.hideText}>Hide</Text></TouchableOpacity> : null}
          </View>
        </View>
        )}
      </View>
    </Modal>
  );
}

/** What the pro needs while talking to a client, on the frosted call background. */
function ClientCard({ client, timeZone, onOpen }: { client: ClientProfile; timeZone: string; onOpen: () => void }) {
  const status = clientStatusOf({ isVip: client.isVip, visits: client.visits, lastVisitAt: client.lastVisitAt });
  const last = client.lastVisitAt ? `${shortDate(client.lastVisitAt, timeZone)}${client.lastService ? ` · ${client.lastService}` : ''}` : 'No visits yet';
  const next = client.nextAppointmentAt ? shortDate(client.nextAppointmentAt, timeZone, true) : 'None booked';
  return (
    <View style={styles.card} testID="call-client-card">
      <View style={styles.cardHead}>
        <ClientAvatar onOpen={onOpen} avatarUrl={client.avatarUrl} initials={client.initials} style={[styles.avatar, !client.avatarUrl && styles.avatarEmpty]} textStyle={styles.initials} />
        <View style={{ flex: 1 }}>
          <View style={styles.pill}><Text style={styles.pillText}>{STATUS_LABEL[status]}</Text></View>
          <Text style={styles.cardSub}>{client.visits} {client.visits === 1 ? 'visit' : 'visits'} · {client.spend} spent</Text>
        </View>
      </View>
      <Row label="Last visit" value={last} />
      <Row label="Next booking" value={next} />
      {client.allergies ? <Row label="Allergies" value={client.allergies} strong /> : null}
      {client.notes ? <Text style={styles.note} numberOfLines={2}>{client.notes}</Text> : null}
      <TouchableOpacity onPress={onOpen} style={styles.open} accessibilityLabel="View full profile" testID="call-open-profile">
        <Text style={styles.openText}>View full profile</Text>
        <MaterialCommunityIcons name="chevron-right" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && { fontWeight: '600' }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24 },
  who: { alignItems: 'center', gap: 4, minHeight: 80 },
  name: { color: '#FFFFFF', fontSize: 38, fontWeight: '400', letterSpacing: 0.2 },
  status: { color: 'rgba(235,235,245,0.6)', fontSize: 25, fontWeight: '400' },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginBottom: 60 },
  control: { alignItems: 'center', gap: 10 },
  round: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#FFFFFF', fontSize: 17, fontWeight: '500' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  side: { width: 108, alignItems: 'center' },
  end: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#EB4034', alignItems: 'center', justifyContent: 'center' },
  hide: { height: 80, justifyContent: 'center', paddingHorizontal: 8 },
  hideText: { color: '#FFFFFF', fontSize: 19, fontWeight: '400' },
  card: { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarEmpty: { backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#FFFFFF', fontSize: 22, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  cardSub: { color: 'rgba(235,235,245,0.7)', fontSize: 17, marginTop: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { color: 'rgba(235,235,245,0.6)', fontSize: 17 },
  rowValue: { color: '#FFFFFF', fontSize: 17, flexShrink: 1, textAlign: 'right' },
  note: { color: 'rgba(235,235,245,0.8)', fontSize: 17, lineHeight: 23, fontStyle: 'italic' },
  open: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, marginTop: 4, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.14)' },
  openText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  returnBar: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#34C759', alignItems: 'center', paddingBottom: 6, zIndex: 1000, elevation: 1000 },
  returnText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
