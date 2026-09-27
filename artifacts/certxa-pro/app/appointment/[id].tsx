import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api, ApiError } from '@/lib/live-api';

const timeSlots = ['9:00 AM', '10:30 AM', '12:00 PM', '2:00 PM', '3:30 PM', '5:00 PM'];

function withTime(day: Date, label: string) {
  const result = new Date(day);
  const match = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (match) { let hour = Number(match[1]) % 12; if (match[3].toUpperCase() === 'PM') hour += 12; result.setHours(hour, Number(match[2]), 0, 0); }
  return result;
}

export default function AppointmentDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; clientName?: string; serviceName?: string; serviceId?: string; amountCents?: string; dateIso?: string; duration?: string; status?: string; note?: string }>();
  const { services, refresh } = useBookingData();
  const originalDate = useMemo(() => params.dateIso ? new Date(params.dateIso) : new Date(), [params.dateIso]);
  const [day, setDay] = useState(originalDate);
  const [time, setTime] = useState(originalDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
  const [serviceId, setServiceId] = useState(Number(params.serviceId) || services[0]?.id || 0);
  const [status, setStatus] = useState(params.status || 'pending');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const appointmentId = Number(params.id);
  const selectedService = services.find((service) => service.id === serviceId);
  const amountCents = selectedService ? Math.round(selectedService.priceValue * 100) : Number(params.amountCents ?? 0);

  const shiftDay = (amount: number) => setDay((current) => { const next = new Date(current); next.setDate(next.getDate() + amount); return next; });

  const save = async () => {
    if (!appointmentId || !selectedService) return;
    setSaving(true); setError('');
    try {
      await api.patch(`/api/appointments/${appointmentId}`, { date: withTime(day, time).toISOString(), serviceId: selectedService.id, duration: selectedService.durationMinutes, status });
      await refresh(); router.back();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not update appointment.'); }
    finally { setSaving(false); }
  };

  const cancelAppointment = () => Alert.alert('Cancel appointment?', `Cancel ${params.clientName || 'this appointment'}?`, [
    { text: 'Keep appointment', style: 'cancel' },
    { text: 'Cancel appointment', style: 'destructive', onPress: async () => { setSaving(true); setError(''); try { await api.patch(`/api/appointments/${appointmentId}`, { status: 'cancelled', cancellationReason: 'Cancelled in Certxa Pro' }); await refresh(); router.back(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel appointment.'); setSaving(false); } } },
  ]);

  const checkout = () => router.push({ pathname: '/(tabs)/checkout', params: { appointmentId: String(appointmentId), clientName: params.clientName || '', amountCents: String(amountCents) } });

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}> 
      <View style={styles.nav}><TouchableOpacity onPress={() => router.back()} style={styles.navButton}><Feather name="arrow-left" size={20} color={colors.foreground} /></TouchableOpacity><Text style={[styles.navTitle, { color: colors.foreground }]}>Appointment</Text><View style={styles.navButton} /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>{status.toUpperCase().replace('_', ' ')}</Text>
        <Text style={[styles.client, { color: colors.foreground }]}>{params.clientName || 'Walk-in'}</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Appointment #{appointmentId}</Text>
        <View style={[styles.heroCard, { backgroundColor: colors.primary }]}><Text style={[styles.heroLabel, { color: colors.primaryForeground }]}>AMOUNT</Text><Text style={[styles.heroAmount, { color: colors.primaryForeground }]}>${(amountCents / 100).toFixed(2)}</Text><Text style={[styles.heroService, { color: colors.primaryForeground }]}>{selectedService?.name || params.serviceName || 'Service'}</Text></View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Date</Text>
        <View style={[styles.dateCard, { backgroundColor: colors.card, borderColor: colors.border }]}><TouchableOpacity onPress={() => shiftDay(-1)} style={styles.arrow}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity><View style={{ alignItems: 'center' }}><Text style={[styles.dateMain, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'long' })}</Text><Text style={[styles.dateSub, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text></View><TouchableOpacity onPress={() => shiftDay(1)} style={styles.arrow}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity></View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Time</Text>
        <View style={styles.chips}>{timeSlots.map((slot) => <TouchableOpacity key={slot} onPress={() => setTime(slot)} style={[styles.chip, { backgroundColor: time === slot ? colors.primary : colors.card, borderColor: time === slot ? colors.primary : colors.border }]}><Text style={[styles.chipText, { color: time === slot ? colors.primaryForeground : colors.foreground }]}>{slot}</Text></TouchableOpacity>)}</View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Service</Text>
        <View style={styles.serviceList}>{services.map((service) => <TouchableOpacity key={service.id} onPress={() => setServiceId(service.id)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: serviceId === service.id ? colors.primary : colors.border }]}><View style={[styles.serviceIcon, { backgroundColor: colors.secondary }]}><Feather name={service.icon} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.serviceName, { color: colors.foreground }]}>{service.name}</Text><Text style={[styles.serviceMeta, { color: colors.mutedForeground }]}>{service.duration}</Text></View><Text style={[styles.servicePrice, { color: colors.foreground }]}>{service.price}</Text><Feather name={serviceId === service.id ? 'check-circle' : 'circle'} size={18} color={serviceId === service.id ? colors.primary : colors.border} /></TouchableOpacity>)}</View>

        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Status</Text>
        <View style={styles.chips}>{[{ value: 'pending', label: 'Pending' }, { value: 'confirmed', label: 'Checked in' }, { value: 'started', label: 'In progress' }].map((item) => <TouchableOpacity key={item.value} onPress={() => setStatus(item.value)} style={[styles.chip, { backgroundColor: status === item.value ? colors.secondary : colors.card, borderColor: status === item.value ? colors.primary : colors.border }]}><Text style={[styles.chipText, { color: status === item.value ? colors.primary : colors.foreground }]}>{item.label}</Text></TouchableOpacity>)}</View>
        {params.note ? <View style={[styles.note, { backgroundColor: colors.accent }]}><Feather name="file-text" size={16} color={colors.accentForeground} /><Text style={[styles.noteText, { color: colors.accentForeground }]}>{params.note}</Text></View> : null}
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <TouchableOpacity disabled={saving || !selectedService} onPress={save} style={[styles.save, { backgroundColor: colors.primary }]}><Feather name="save" size={17} color={colors.primaryForeground} /><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save changes'}</Text></TouchableOpacity>
        <TouchableOpacity disabled={saving || status === 'cancelled'} onPress={checkout} style={[styles.checkout, { backgroundColor: colors.secondary }]}><Feather name="credit-card" size={17} color={colors.primary} /><Text style={[styles.checkoutText, { color: colors.primary }]}>Check out with Stripe M2</Text></TouchableOpacity>
        <TouchableOpacity disabled={saving || status === 'cancelled'} onPress={cancelAppointment} style={[styles.cancel, { borderColor: colors.destructive }]}><Feather name="x-circle" size={17} color={colors.destructive} /><Text style={[styles.cancelText, { color: colors.destructive }]}>Cancel appointment</Text></TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 }, nav: { height: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, navTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }, content: { paddingHorizontal: 20, paddingTop: 13, paddingBottom: 50 }, eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' }, client: { fontSize: 28, letterSpacing: -0.6, fontFamily: 'Inter_600SemiBold', marginTop: 5 }, subtitle: { fontSize: 11, marginTop: 5 }, heroCard: { borderRadius: 21, padding: 20, marginTop: 21 }, heroLabel: { fontSize: 9, letterSpacing: 1.3, fontFamily: 'Inter_700Bold', opacity: 0.75 }, heroAmount: { fontSize: 37, fontFamily: 'Inter_500Medium', marginTop: 8 }, heroService: { fontSize: 12, marginTop: 5, opacity: 0.86 }, sectionTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 25, marginBottom: 10 }, dateCard: { borderWidth: 1, borderRadius: 16, minHeight: 73, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 9 }, arrow: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, dateMain: { fontSize: 14, fontFamily: 'Inter_600SemiBold' }, dateSub: { fontSize: 11, marginTop: 4 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 13 }, chipText: { fontSize: 11, fontFamily: 'Inter_500Medium' }, serviceList: { gap: 8 }, serviceRow: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 }, serviceIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, serviceName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }, serviceMeta: { fontSize: 10, marginTop: 3 }, servicePrice: { fontSize: 12, fontFamily: 'Inter_600SemiBold' }, note: { borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9, marginTop: 22 }, noteText: { flex: 1, fontSize: 11, lineHeight: 16 }, error: { textAlign: 'center', marginTop: 15, fontSize: 11 }, save: { height: 53, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 25 }, saveText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }, checkout: { height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 10 }, checkoutText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' }, cancel: { height: 50, borderWidth: 1, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18 }, cancelText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});
