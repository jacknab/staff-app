import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Alert, Linking, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api, ApiError } from '@/lib/live-api';

const timeSlots = ['9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '3:30 PM', '5:00 PM'];

function withTime(day: Date, label: string) {
  const result = new Date(day);
  const match = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (match) {
    let hour = Number(match[1]) % 12;
    if (match[3].toUpperCase() === 'PM') hour += 12;
    result.setHours(hour, Number(match[2]), 0, 0);
  }
  return result;
}

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'CP';
}

function statusLabel(status: string) {
  if (status === 'confirmed') return 'CONFIRMED';
  if (status === 'paid') return 'PAID';
  if (status === 'cancelled') return 'CANCELLED';
  return status.replace('_', ' ').toUpperCase();
}

export default function AppointmentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    clientName?: string;
    serviceName?: string;
    serviceId?: string;
    amountCents?: string;
    dateIso?: string;
    duration?: string;
    status?: string;
    note?: string;
    preview?: string;
    phone?: string;
    email?: string;
  }>();
  const { services, refresh } = useBookingData();
  const originalDate = useMemo(() => params.dateIso ? new Date(params.dateIso) : new Date(), [params.dateIso]);
  const [day, setDay] = useState(originalDate);
  const [time, setTime] = useState(originalDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  const [serviceId, setServiceId] = useState(Number(params.serviceId) || services[0]?.id || 0);
  const [status, setStatus] = useState(params.status === 'completed' ? 'paid' : params.status || 'pending');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const appointmentId = Number(params.id);
  const isPreview = params.preview === '1';
  const selectedService = services.find((service) => service.id === serviceId);
  const amountCents = selectedService ? Math.round(selectedService.priceValue * 100) : Number(params.amountCents ?? 0);
  const clientName = params.clientName || 'Walk-in';
  const serviceName = selectedService?.name || params.serviceName || 'Service';
  const duration = selectedService?.duration || params.duration || '60 min';
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const shiftDay = (amount: number) => setDay((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + amount);
    return next;
  });

  const save = async () => {
    if (!appointmentId || !selectedService) return;
    setSaving(true);
    setError('');
    try {
      if (!isPreview) {
        await api.patch(`/api/appointments/${appointmentId}`, { date: withTime(day, time).toISOString(), serviceId: selectedService.id, duration: selectedService.durationMinutes, status });
        await refresh();
      }
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update appointment.');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async () => {
    if (status === 'paid' || status === 'cancelled') return;
    setSaving(true);
    setError('');
    try {
      if (!isPreview) {
        await api.patch(`/api/appointments/${appointmentId}`, { status: 'paid' });
        await refresh();
      }
      setStatus('paid');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not mark appointment as paid.');
    } finally {
      setSaving(false);
    }
  };

  const deleteAppointment = () => Alert.alert(
    'Delete appointment?',
    `Delete ${clientName}'s ${serviceName.toLowerCase()} appointment?`,
    [
      { text: 'Keep appointment', style: 'cancel' },
      {
        text: 'Delete appointment',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          setError('');
          try {
            if (!isPreview) {
              await api.del(`/api/appointments/${appointmentId}`);
              await refresh();
            }
            router.back();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not delete appointment.');
            setSaving(false);
          }
        },
      },
    ],
  );

  const checkout = () => router.push({
    pathname: '/(tabs)/checkout',
    params: { appointmentId: String(appointmentId), clientName, serviceName, amountCents: String(amountCents) },
  });

  const openContact = async (type: 'text' | 'call' | 'email') => {
    const value = type === 'email' ? params.email : params.phone;
    const url = type === 'email' ? (value ? `mailto:${value}` : '') : value ? `${type === 'text' ? 'sms' : 'tel'}:${value}` : '';
    if (url) {
      await Linking.openURL(url);
    } else {
      Alert.alert('Contact details unavailable', 'Add a phone number or email address to this client record to use this shortcut.');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.nav}>
        <TouchableOpacity testID="appointment-back" onPress={() => router.back()} style={styles.navSide}>
          <Feather name="arrow-left" size={18} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.foreground }]}>Details</Text>
        <TouchableOpacity testID="appointment-edit" onPress={() => setEditing((current) => !current)} style={styles.navSide}>
          <Text style={[styles.editText, { color: colors.primary }]}>{editing ? 'Done' : 'Edit'}</Text>
        </TouchableOpacity>
      </View>

      {editing ? (
        <EditAppointment
          colors={colors}
          day={day}
          error={error}
          save={save}
          saving={saving}
          selectedService={selectedService}
          serviceId={serviceId}
          services={services}
          setServiceId={setServiceId}
          setStatus={setStatus}
          setTime={setTime}
          shiftDay={shiftDay}
          status={status}
          time={time}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profile}>
            <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
              <Text style={[styles.avatarText, { color: colors.mutedForeground }]}>{initialsFor(clientName)}</Text>
            </View>
            <Text style={[styles.clientName, { color: colors.foreground }]}>{clientName}</Text>
            <Text style={[styles.clientSubtitle, { color: colors.mutedForeground }]}>{isPreview ? 'Preview client' : 'Client appointment'}</Text>
          </View>

          <View style={styles.quickActions}>
            <QuickAction icon="calendar" label="Schedule" color={colors.primary} onPress={() => setEditing(true)} />
            <QuickAction icon="message-circle" label="Text" color="#C65F85" onPress={() => void openContact('text')} />
            <QuickAction icon="phone" label="Call" color="#C65F85" onPress={() => void openContact('call')} />
            <QuickAction icon="mail" label="Email" color={colors.mutedForeground} onPress={() => void openContact('email')} muted />
          </View>
          <View style={styles.pager}><View style={[styles.pagerDot, { backgroundColor: colors.primary }]} /><View style={[styles.pagerDot, { backgroundColor: colors.border }]} /></View>

          <TouchableOpacity testID="appointment-notes" onPress={() => setEditing(true)} style={[styles.notesRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.notesCopy}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Notes</Text>
              {params.note ? <Text numberOfLines={1} style={[styles.notesPreview, { color: colors.mutedForeground }]}>{params.note}</Text> : null}
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </TouchableOpacity>

          <View style={[styles.appointmentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.appointmentMeta}>
              <View style={[styles.serviceIcon, { backgroundColor: colors.secondary }]}><Feather name="scissors" size={19} color={colors.primary} /></View>
              <View style={styles.statusStack}>
                <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>APPOINTMENT</Text>
                <Text style={[styles.statusText, { color: status === 'cancelled' ? colors.destructive : colors.primary }]}>{statusLabel(status)}</Text>
              </View>
              <Text style={[styles.amount, { color: colors.foreground }]}>${(amountCents / 100).toFixed(2)}</Text>
            </View>
            <Text style={[styles.serviceName, { color: colors.foreground }]}>{serviceName}</Text>
            <View style={styles.detailRows}>
              <DetailRow icon="calendar" label={day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} colors={colors} />
              <DetailRow icon="clock" label={`${time} · ${duration}`} colors={colors} />
            </View>
          </View>

          {error ? <View style={[styles.errorBox, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={15} color={colors.accentForeground} /><Text style={[styles.errorText, { color: colors.accentForeground }]}>{error}</Text></View> : null}

          <LinearGradient colors={[colors.primary, '#6F9B81']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.checkoutGradient}>
            <TouchableOpacity testID="appointment-checkout" disabled={saving || status === 'cancelled' || status === 'paid'} onPress={checkout} style={styles.actionButton}>
              <Feather name="credit-card" size={17} color={colors.primaryForeground} />
              <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{status === 'paid' ? 'PAID' : 'CHECKOUT'}</Text>
            </TouchableOpacity>
          </LinearGradient>
          <TouchableOpacity testID="appointment-mark-paid" disabled={saving || status === 'cancelled' || status === 'paid'} onPress={() => void markPaid()} style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: status === 'paid' ? 0.6 : 1 }]}>
            <Feather name="check" size={18} color={colors.primary} />
            <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>{saving ? 'UPDATING…' : status === 'paid' ? 'MARKED AS PAID' : 'MARK AS PAID'}</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="appointment-delete" disabled={saving} onPress={deleteAppointment} style={[styles.deleteAction, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            <Feather name="x" size={19} color={colors.destructive} />
            <Text style={[styles.deleteText, { color: colors.destructive }]}>DELETE APPOINTMENT</Text>
          </TouchableOpacity>
          <Text style={[styles.previewNote, { color: colors.mutedForeground }]}>{isPreview ? 'Preview only · Changes are not sent to Certxa.' : 'Appointment updates are processed by Certxa.'}</Text>
        </ScrollView>
      )}
    </View>
  );
}

function QuickAction({ icon, label, color, onPress, muted = false }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; color: string; onPress: () => void; muted?: boolean }) {
  return (
    <TouchableOpacity accessibilityLabel={label} onPress={onPress} style={styles.quickAction}>
      <View style={[styles.quickIcon, { backgroundColor: muted ? '#EEF0ED' : `${color}18` }]}><Feather name={icon} size={17} color={color} /></View>
      <Text style={[styles.quickLabel, { color: muted ? '#89918C' : color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, colors }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.detailRow}><Feather name={icon} size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

function EditAppointment({ colors, day, error, save, saving, selectedService, serviceId, services, setServiceId, setStatus, setTime, shiftDay, status, time }: {
  colors: ReturnType<typeof useColors>;
  day: Date;
  error: string;
  save: () => Promise<void>;
  saving: boolean;
  selectedService?: { id: number; name: string; duration: string; durationMinutes: number; price: string; priceValue: number; icon: 'eye' | 'droplet' | 'briefcase' | 'star' };
  serviceId: number;
  services: Array<{ id: number; name: string; duration: string; durationMinutes: number; price: string; priceValue: number; icon: 'eye' | 'droplet' | 'briefcase' | 'star' }>;
  setServiceId: (value: number) => void;
  setStatus: (value: string) => void;
  setTime: (value: string) => void;
  shiftDay: (amount: number) => void;
  status: string;
  time: string;
}) {
  return (
    <ScrollView contentContainerStyle={styles.editContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.editEyebrow, { color: colors.primary }]}>EDIT APPOINTMENT</Text>
      <Text style={[styles.editTitle, { color: colors.foreground }]}>Make a change</Text>
      <Text style={[styles.editSubtitle, { color: colors.mutedForeground }]}>Update the timing, service, or status.</Text>
      <Text style={[styles.editSection, { color: colors.foreground }]}>Date</Text>
      <View style={[styles.dateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.arrow}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
        <View style={{ alignItems: 'center' }}><Text style={[styles.dateMain, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'long' })}</Text><Text style={[styles.dateSub, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text></View>
        <TouchableOpacity onPress={() => shiftDay(1)} style={styles.arrow}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
      </View>
      <Text style={[styles.editSection, { color: colors.foreground }]}>Time</Text>
      <View style={styles.chips}>{timeSlots.map((slot) => <TouchableOpacity key={slot} onPress={() => setTime(slot)} style={[styles.chip, { backgroundColor: time === slot ? colors.primary : colors.card, borderColor: time === slot ? colors.primary : colors.border }]}><Text style={[styles.chipText, { color: time === slot ? colors.primaryForeground : colors.foreground }]}>{slot}</Text></TouchableOpacity>)}</View>
      <Text style={[styles.editSection, { color: colors.foreground }]}>Service</Text>
      <View style={styles.serviceList}>{services.map((service) => <TouchableOpacity key={service.id} onPress={() => setServiceId(service.id)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: serviceId === service.id ? colors.primary : colors.border }]}><View style={[styles.serviceIcon, { backgroundColor: colors.secondary }]}><Feather name={service.icon} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.serviceName, { color: colors.foreground }]}>{service.name}</Text><Text style={[styles.serviceMeta, { color: colors.mutedForeground }]}>{service.duration}</Text></View><Text style={[styles.servicePrice, { color: colors.foreground }]}>{service.price}</Text><Feather name={serviceId === service.id ? 'check-circle' : 'circle'} size={18} color={serviceId === service.id ? colors.primary : colors.border} /></TouchableOpacity>)}</View>
      <Text style={[styles.editSection, { color: colors.foreground }]}>Status</Text>
      <View style={styles.chips}>{[{ value: 'pending', label: 'Pending' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'started', label: 'In progress' }].map((item) => <TouchableOpacity key={item.value} onPress={() => setStatus(item.value)} style={[styles.chip, { backgroundColor: status === item.value ? colors.secondary : colors.card, borderColor: status === item.value ? colors.primary : colors.border }]}><Text style={[styles.chipText, { color: status === item.value ? colors.primary : colors.foreground }]}>{item.label}</Text></TouchableOpacity>)}</View>
      {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      <TouchableOpacity disabled={saving || !selectedService} onPress={() => void save()} style={[styles.save, { backgroundColor: colors.primary, opacity: saving || !selectedService ? 0.6 : 1 }]}><Feather name="check" size={17} color={colors.primaryForeground} /><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save changes'}</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 55, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 74, minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 3 },
  navTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  backText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  editText: { fontSize: 14, fontFamily: 'Inter_500Medium', marginLeft: 'auto' },
  content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 55 },
  profile: { alignItems: 'center', paddingTop: 14 },
  avatar: { width: 77, height: 77, borderRadius: 39, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontFamily: 'Inter_400Regular', letterSpacing: 1 },
  clientName: { fontSize: 24, fontFamily: 'Inter_500Medium', letterSpacing: 0.2, marginTop: 11 },
  clientSubtitle: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: 19, marginTop: 21 },
  quickAction: { width: 52, alignItems: 'center', gap: 6 },
  quickIcon: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  pager: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 21 },
  pagerDot: { width: 7, height: 7, borderRadius: 4 },
  notesRow: { minHeight: 58, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notesCopy: { flex: 1, paddingRight: 12 },
  sectionLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  notesPreview: { fontSize: 11, marginTop: 4, fontFamily: 'Inter_400Regular' },
  appointmentCard: { borderWidth: 1, borderRadius: 17, padding: 15, marginTop: 12 },
  appointmentMeta: { flexDirection: 'row', alignItems: 'center' },
  serviceIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusStack: { flex: 1, marginLeft: 11 },
  metaLabel: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  statusText: { fontSize: 11, letterSpacing: 0.5, fontFamily: 'Inter_700Bold', marginTop: 4 },
  amount: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  serviceName: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginTop: 14 },
  detailRows: { gap: 8, marginTop: 11, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#E5E7E1' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  errorBox: { borderRadius: 12, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 13 },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  checkoutGradient: { borderRadius: 14, marginTop: 18, overflow: 'hidden' },
  actionButton: { height: 53, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  actionText: { fontSize: 14, letterSpacing: 0.5, fontFamily: 'Inter_700Bold' },
  secondaryAction: { height: 52, borderWidth: 1, borderRadius: 14, marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryActionText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  deleteAction: { height: 51, borderWidth: 1, borderRadius: 14, marginTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  deleteText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.2 },
  previewNote: { textAlign: 'center', fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 15 },
  editContent: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 50 },
  editEyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  editTitle: { fontSize: 27, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 5 },
  editSubtitle: { fontSize: 12, marginTop: 5 },
  editSection: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 25, marginBottom: 10 },
  dateCard: { borderWidth: 1, borderRadius: 16, minHeight: 73, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9 },
  arrow: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  dateMain: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  dateSub: { fontSize: 11, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 13 },
  chipText: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  serviceList: { gap: 8 },
  serviceRow: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  serviceMeta: { fontSize: 10, marginTop: 3 },
  servicePrice: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  error: { textAlign: 'center', marginTop: 15, fontSize: 11 },
  save: { height: 53, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 25 },
  saveText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});