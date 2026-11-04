import { useEffect, useMemo, useState } from 'react';
import { addressLine, appointmentParams, mapAppointment, type ApiAppointment, type HouseCallAddress } from '@/contexts/BookingContext';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Linking, Modal, Platform, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { zonedDay, zonedMoment, zonedTimeLabel } from '@/lib/businessTime';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { ClientAvatar } from '@/components/ClientAvatar';

/** Every quarter hour of the working day, and the booking's own time when it is between them. */
function timeChoices(current: string): string[] {
  const label = (m: number) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'AM' : 'PM'}`;
  const out: string[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 15) out.push(label(m));
  const norm = current.replace(/\s+/g, ' ');
  if (!out.includes(norm)) {
    const at = (t: string) => { const x = t.match(/(\d+):(\d+)\s*(AM|PM)/i); return x ? (Number(x[1]) % 12 + (x[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(x[2]) : 0; };
    out.push(norm);
    out.sort((a, b) => at(a) - at(b));
  }
  return out;
}

type AddonOption = { id: number; name: string; priceValue: number; minutes: number; serviceIds: number[] };
type Line = { label: string; price: number };

/** The moment of a business date (day carrier) at a "2:30 PM" label, in the business's time zone. */
function withTime(day: Date, label: string, timeZone: string) {
  const match = label.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return zonedMoment(day, 0, timeZone);
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return zonedMoment(day, hour * 60 + Number(match[2]), timeZone);
}

/** "130 min" → "2 hr 10 min"; anything else stays as it is. */
function hoursAndMinutes(text: string) {
  const match = text.match(/^(\d+) min$/);
  const total = match ? Number(match[1]) : 0;
  return total >= 60 ? `${Math.floor(total / 60)} hr${total % 60 ? ` ${total % 60} min` : ''}` : text;
}

function initialsFor(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'CP';
}

function statusLabel(status: string) {
  if (status === 'confirmed') return 'CONFIRMED';
  if (status === 'paid') return 'PAID';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'no_show') return 'NO-SHOW';
  return status.replace('_', ' ').toUpperCase();
}

type AppointmentRouteParams = {
    id: string;
    clientName?: string;
    serviceName?: string;
    serviceId?: string;
    amountCents?: string;
    dateIso?: string;
    duration?: string;
    status?: string;
    note?: string;
    customerId?: string;
    avatarUrl?: string;
    preview?: string;
    phone?: string;
    email?: string;
    visitAt?: string;
    clientAddress?: string;
    travelFeeCents?: string;
    depositDue?: string;
    depositPaidCents?: string;
    extraLines?: string;
    addonIds?: string;
    addonLines?: string;
    totalPaidCents?: string;
    refundedCents?: string;
    cardOnFile?: string;
    feePercent?: string;
    feeChargedCents?: string;
  };

/**
 * The calendar opens this screen with every detail of the booking. The client's Past visits and Home open it with only
 * the id, so the booking is loaded first; a booking that can't be loaded says so rather than showing empty details.
 */
export default function AppointmentDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<AppointmentRouteParams>();
  const { timeZone } = useBookingData();
  // Fixed when the screen opens: saving an edit puts a few details in the address, not all of them.
  const [complete] = useState(!!params.dateIso || params.preview === '1');
  const [loaded, setLoaded] = useState<AppointmentRouteParams | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (complete) return;
    api.get<ApiAppointment>(`/api/appointments/${params.id}`)
      .then((row) => setLoaded(appointmentParams(mapAppointment(row, timeZone)).params))
      .catch(() => setFailed(true));
  }, [complete, params.id, timeZone]);

  if (complete) return <AppointmentDetail params={params} />;
  if (loaded) return <AppointmentDetail params={{ ...loaded, ...params }} />;
  return (
    <View testID="appointment-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.background, paddingTop: insets.top }}>
      {failed ? (
        <>
          <Text style={[styles.clientSubtitle, { color: colors.mutedForeground }]}>This booking could not be opened.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.textAction}><Text style={{ color: colors.primary }}>Back</Text></TouchableOpacity>
        </>
      ) : <ActivityIndicator color={colors.mutedForeground} />}
    </View>
  );
}

function AppointmentDetail({ params }: { params: AppointmentRouteParams }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { services, refresh, timeZone } = useBookingData();
  const originalDate = useMemo(() => params.dateIso ? new Date(params.dateIso) : new Date(), [params.dateIso]);
  // The date and time as the business sees them (its own time zone, not the phone's).
  const [day, setDay] = useState(() => zonedDay(originalDate, timeZone));
  const [time, setTime] = useState(() => zonedTimeLabel(originalDate, timeZone));
  const [serviceId, setServiceId] = useState(Number(params.serviceId) || services[0]?.id || 0);
  const [status, setStatus] = useState(params.status === 'completed' ? 'paid' : params.status || 'pending');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const appointmentId = Number(params.id);
  const isPreview = params.preview === '1';
  const selectedService = services.find((service) => service.id === serviceId);
  // The visit's total from the calendar (service, add-ons, extra services and any travel fee). Only a changed
  // service is priced again here — the service's price alone would drop the add-ons and extras.
  const travelFeeCents = Number(params.travelFeeCents ?? 0) || 0;
  // Held for its deposit (link texted to the client), or a deposit already paid that checkout takes off.
  const depositDue = params.depositDue === '1';
  const depositPaidCents = Number(params.depositPaidCents ?? 0) || 0;
  const serviceChanged = selectedService != null && serviceId !== Number(params.serviceId);
  const amountCents = serviceChanged ? Math.round(selectedService.priceValue * 100) + travelFeeCents : Number(params.amountCents ?? 0);
  const houseCallAddress = useMemo(() => {
    if (params.visitAt !== 'client' || !params.clientAddress) return null;
    try { return addressLine(JSON.parse(params.clientAddress) as HouseCallAddress) || null; } catch { return null; }
  }, [params.visitAt, params.clientAddress]);
  const clientName = params.clientName || 'Walk-in';
  const serviceName = selectedService?.name || params.serviceName || 'Service';
  // The whole visit's length, add-ons and extra services included; the service's own only for a booking without one.
  const duration = hoursAndMinutes(params.duration || selectedService?.duration || '60 min');
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  // ── Edit (owner, 2026-11-03): only a booking that is still to come — not paid, not cancelled, not on a past day. ──
  const today = zonedDay(new Date(), timeZone);
  const pastDay = zonedDay(originalDate, timeZone).getTime() < new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const closed = status === 'cancelled' || status === 'no_show';
  const canEdit = status !== 'paid' && !closed && !pastDay;
  const extraLines = useMemo<Line[]>(() => { try { const v = JSON.parse(params.extraLines || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }, [params.extraLines]);
  // Several services: the first is the booking's service, the others are priced lines on it (as a new booking makes them).
  const [serviceIds, setServiceIds] = useState<number[]>([]);
  // Lines that aren't catalog services (a price added by hand) stay on the ticket as they are.
  const addonLines = useMemo<Line[]>(() => { try { const v = JSON.parse(params.addonLines || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }, [params.addonLines]);
  const keptLines = useMemo(() => extraLines.filter((line) => !services.some((item) => item.name === line.label)), [extraLines, services]);
  const [addonIds, setAddonIds] = useState<number[]>(() => (params.addonIds || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const [addonOptions, setAddonOptions] = useState<AddonOption[]>([]);
  const [whenOpen, setWhenOpen] = useState(false);
  const openEdit = () => {
    if (!canEdit) return;
    const main = Number(params.serviceId) || 0;
    const extras = extraLines.map((line) => services.find((item) => item.name === line.label)?.id).filter((v): v is number => !!v);
    setServiceIds([main, ...extras].filter((v) => v > 0));
    setEditing(true);
  };
  useEffect(() => {
    if (!editing || addonOptions.length || isPreview) return;
    Promise.all([api.get<any[]>('/api/addons'), api.get<any[]>('/api/service-addons')]).then(([rows, links]) => {
      const l = Array.isArray(links) ? links : [];
      setAddonOptions((Array.isArray(rows) ? rows : []).filter((a) => a && a.isActive !== false).map((a) => ({
        id: Number(a.id), name: String(a.name ?? 'Add-on'), priceValue: Number(a.price ?? 0) || 0, minutes: Number(a.duration ?? 0) || 0,
        serviceIds: l.filter((x) => Number(x?.addonId) === Number(a.id)).map((x) => Number(x.serviceId)),
      })));
    }).catch(() => undefined);
  }, [editing, addonOptions.length, isPreview]);

  // ── Paid: Rebook and Refund (owner, 2026-11-03). ──
  const paidCents = params.totalPaidCents ? Number(params.totalPaidCents) : amountCents;
  const [refundedCents, setRefundedCents] = useState(Number(params.refundedCents ?? 0) || 0);
  const refundable = Math.max(0, paidCents - refundedCents);
  const [refundOpen, setRefundOpen] = useState(false);
  const rebook = () => router.push({
    pathname: '/booking',
    params: { clientId: params.customerId ?? '', phone: params.phone ?? '', serviceIds: [Number(params.serviceId) || 0, ...extraLines.map((line) => services.find((item) => item.name === line.label)?.id ?? 0)].filter((v) => v > 0).join(',') },
  });

  const shiftDay = (amount: number) => setDay((current) => {
    const next = new Date(current);
    next.setDate(next.getDate() + amount);
    return next;
  });

  const save = async () => {
    const chosen = serviceIds.map((sid) => services.find((item) => item.id === sid)).filter((v): v is NonNullable<typeof v> => !!v);
    if (!appointmentId || chosen.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const applicable = addonOptions.filter((a) => a.serviceIds.length === 0 || a.serviceIds.some((sid) => serviceIds.includes(sid)));
      const addons = applicable.filter((a) => addonIds.includes(a.id));
      const lines: Line[] = [...chosen.slice(1).map((item) => ({ label: item.name, price: item.priceValue })), ...keptLines];
      const minutes = chosen.reduce((sum, item) => sum + item.durationMinutes, 0) + addons.reduce((sum, a) => sum + a.minutes, 0);
      const nextDate = withTime(day, time, timeZone);
      if (!isPreview) {
        // A new time, or a longer visit, is checked against the calendar's other appointments.
        const moved = Math.floor(nextDate.getTime() / 60000) !== Math.floor(originalDate.getTime() / 60000);
        await api.patch(`/api/appointments/${appointmentId}`, {
          serviceId: chosen[0].id, duration: minutes, customLines: lines, checkConflicts: true,
          ...(moved ? { date: nextDate.toISOString() } : {}),
        });
        await api.post(`/api/appointments/${appointmentId}/addons`, { addonIds: addons.map((a) => a.id), force: true });
        await refresh();
      }
      // The details page shows the booking as it now is.
      const cents = Math.round((chosen.reduce((sum, item) => sum + item.priceValue, 0) + addons.reduce((sum, a) => sum + a.priceValue, 0)
        + keptLines.reduce((sum, line) => sum + line.price, 0)) * 100) + travelFeeCents;
      router.setParams({
        serviceId: String(chosen[0].id), serviceName: chosen.length > 1 ? `${chosen[0].name} + ${chosen.length - 1} more` : chosen[0].name,
        amountCents: String(cents), duration: `${minutes} min`, dateIso: nextDate.toISOString(),
        extraLines: JSON.stringify(lines), addonIds: addons.map((a) => a.id).join(','),
        addonLines: JSON.stringify(addons.map((a) => ({ label: a.name, price: a.priceValue }))),
      });
      setServiceId(chosen[0].id);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update appointment.');
    } finally {
      setSaving(false);
    }
  };

  // Paid in full when booking online: there's nothing to charge, only the visit to finish.
  const prepaid = depositPaidCents > 0 && depositPaidCents >= amountCents;
  // Everything on the ticket. The first line is what's left of the total, so the lines always add up to it.
  const otherLines = [...extraLines, ...addonLines];
  const otherCents = otherLines.reduce((sum, line) => sum + Math.round(Number(line.price) * 100), 0);
  const ticketLines = otherLines.length > 0 || travelFeeCents > 0 ? [
    { label: selectedService?.name ?? params.serviceName ?? 'Service', cents: amountCents - otherCents - travelFeeCents },
    ...otherLines.map((line) => ({ label: line.label, cents: Math.round(Number(line.price) * 100) })),
    ...(travelFeeCents > 0 ? [{ label: 'Travel fee', cents: travelFeeCents }] : []),
  ] : [];
  const markPaid = async () => {
    if (status === 'paid' || status === 'cancelled') return;
    setSaving(true);
    setError('');
    try {
      if (!isPreview) {
        // Mark as paid = paid in cash (or another way outside the app) for the visit's total (owner, 2026-10-28). It is
        // recorded as a cash sale, so it reaches reports, commission and loyalty. ("paid" is not a server status: it
        // used to put the appointment back to pending and record nothing.)
        await api.patch(`/api/appointments/${appointmentId}`, {
          status: 'completed', paymentMethod: prepaid ? 'card' : 'cash', totalPaid: (Math.max(0, amountCents) / 100).toFixed(2),
          serviceRevenue: (Math.max(0, amountCents - travelFeeCents) / 100).toFixed(2), productRevenue: '0.00',
        });
        await refresh();
      }
      setStatus('paid');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not mark appointment as paid.');
    } finally {
      setSaving(false);
    }
  };

  // A prepaid package covering this service (owner, 2026-11-04; routes/siteShop.ts): one visit pays for the booking. The
  // visit is taken first, and given back if the booking can't be marked paid.
  const [packages, setPackages] = useState<{ id: number; name: string; serviceId: number; visitsLeft: number }[]>([]);
  useEffect(() => {
    if (isPreview || !Number(params.customerId)) return;
    api.get<{ id: number; name: string; serviceId: number; visitsLeft: number }[]>(`/api/pro/clients/${params.customerId}/packages`).then(setPackages).catch(() => setPackages([]));
  }, [isPreview, params.customerId]);
  const packageForVisit = packages.find((p) => p.serviceId === serviceId);
  const spendPackageVisit = async () => {
    if (!packageForVisit) return;
    setSaving(true); setError('');
    try {
      await api.post('/api/pro/packages/use', { clientPackageId: packageForVisit.id, appointmentId });
      try {
        await api.patch(`/api/appointments/${appointmentId}`, { status: 'completed', paymentMethod: 'package', totalPaid: '0.00', serviceRevenue: '0.00', productRevenue: '0.00' });
      } catch (cause) {
        await api.post('/api/pro/packages/give-back', { appointmentId }).catch(() => undefined);
        throw cause;
      }
      await refresh();
      setPackages((list) => list.map((p) => (p.id === packageForVisit.id ? { ...p, visitsLeft: p.visitsLeft - 1 } : p)).filter((p) => p.visitsLeft > 0));
      setStatus('paid');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The package visit could not be used.');
    } finally { setSaving(false); }
  };

  // ── Cancel and no-show instead of deleting (owner, 2026-11-03). The booking stays on the client's record. ──
  const close = async (path: 'cancel' | 'no-show', body?: Record<string, unknown>) => {
    setSaving(true); setError('');
    try {
      if (!isPreview) {
        const r = await api.post<any>(`/api/appointments/${appointmentId}/${path}`, body ?? {});
        await refresh();
        if (path === 'cancel' && body?.notifyClient && r?.notification?.status === 'not_sent') {
          Alert.alert('Cancelled', 'The booking is cancelled, but the text to the client could not be sent.');
        }
      }
      setStatus(path === 'cancel' ? 'cancelled' : 'no_show');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not update the booking.');
    } finally { setSaving(false); }
  };
  const cancelBooking = () => Alert.alert('Cancel this booking?', `${clientName} · ${serviceName}`, [
    { text: 'Cancel and text the client', onPress: () => void close('cancel', { notifyClient: true }) },
    { text: 'Cancel without a text', onPress: () => void close('cancel', { notifyClient: false }) },
    { text: 'Keep the booking', style: 'cancel' },
  ]);
  const markNoShow = () => Alert.alert('Mark as no-show?', `${clientName} didn't come to their ${serviceName.toLowerCase()}.`, [
    { text: 'Not now', style: 'cancel' },
    { text: 'Mark as no-show', style: 'destructive', onPress: () => void close('no-show') },
  ]);
  // The fee (decided 10-22): only when the pro taps it — the shop's fee % of the booking, to the client's card on file.
  const [feeCharged, setFeeCharged] = useState<number | null>(params.feeChargedCents ? Number(params.feeChargedCents) : null);
  const feePercent = Number(params.feePercent || 0);
  // Of the booking's price without the travel fee — the same amount the server charges.
  const feeCents = Math.round(Math.max(0, amountCents - travelFeeCents) * feePercent / 100);
  const canChargeFee = closed && feeCharged == null && params.cardOnFile === '1' && feePercent > 0 && feeCents >= 50 && !isPreview;
  const feeName = status === 'no_show' ? 'no-show fee' : 'late-cancel fee';
  const chargeFee = () => Alert.alert(`Charge a ${feeName}?`, `$${(feeCents / 100).toFixed(2)} (${feePercent}%) will be charged to ${clientName}'s card on file.`, [
    { text: 'Not now', style: 'cancel' },
    { text: `Charge $${(feeCents / 100).toFixed(2)}`, style: 'destructive', onPress: async () => {
      setSaving(true); setError('');
      try {
        const r = await api.post<{ feeChargedCents?: number }>(`/api/appointments/${appointmentId}/fee`, {});
        setFeeCharged(Number(r?.feeChargedCents ?? feeCents));
        await refresh();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : 'The fee could not be charged.');
      } finally { setSaving(false); }
    } },
  ]);

  // A payment link (owner, 2026-11-03): texted to the client, who pays by card on certxa.com; the booking is then paid.
  const payLink = async () => {
    setSaving(true); setError('');
    try {
      const r = await api.post<{ url: string; amountCents: number; sent: boolean }>(`/api/appointments/${appointmentId}/pay-link`, {});
      if (r.sent) Alert.alert('Payment link sent', `${clientName} got a text to pay $${(r.amountCents / 100).toFixed(2)}.`);
      else Alert.alert('Payment link', 'This client has no phone number to text. Share the link another way?', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Share link', onPress: () => void Share.share({ message: `Pay $${(r.amountCents / 100).toFixed(2)} for ${serviceName}: ${r.url}` }) },
      ]);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'The payment link could not be sent.');
    } finally { setSaving(false); }
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
    params: { appointmentId: String(appointmentId), clientName, serviceName, amountCents: String(amountCents), depositCents: String(depositPaidCents), phone: params.phone ?? '', email: params.email ?? '' },
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
        <HelpTitle help="appointment" style={[styles.navTitle, { color: colors.foreground }]}>Details</HelpTitle>
        {editing ? (
          <TouchableOpacity testID="appointment-edit" onPress={() => setEditing(false)} style={styles.navSide}>
            <Text style={[styles.editText, { color: colors.primary }]}>Cancel</Text>
          </TouchableOpacity>
        ) : canEdit ? (
          <TouchableOpacity testID="appointment-edit" onPress={openEdit} style={styles.navSide}>
            <Text style={[styles.editText, { color: colors.primary }]}>Edit</Text>
          </TouchableOpacity>
        ) : <View style={styles.navSide} />}
      </View>

      {editing ? (
        <EditAppointment
          colors={colors}
          day={day}
          time={time}
          error={error}
          save={save}
          saving={saving}
          services={services}
          serviceIds={serviceIds}
          setServiceIds={setServiceIds}
          addonOptions={addonOptions}
          addonIds={addonIds}
          setAddonIds={setAddonIds}
          keptLines={keptLines}
          openWhen={() => setWhenOpen(true)}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.profile}>
            <ClientAvatar testID="appointment-client-avatar" clientId={isPreview ? 0 : Number(params.customerId)} avatarUrl={params.avatarUrl} initials={initialsFor(clientName)}
              style={[styles.avatar, { backgroundColor: colors.muted }]} textStyle={[styles.avatarText, { color: colors.mutedForeground }]} />
            <Text style={[styles.clientName, { color: colors.foreground }]}>{clientName}</Text>
            <Text style={[styles.clientSubtitle, { color: colors.mutedForeground }]}>{isPreview ? 'Preview client' : 'Client appointment'}</Text>
          </View>

          {/* A finished visit is a record: reach the client from their profile. */}
          {status !== 'paid' && status !== 'cancelled' && status !== 'no_show' ? (<>
          <View style={styles.quickActions}>
            {canEdit ? <QuickAction icon="calendar" label="Schedule" color={colors.primary} onPress={openEdit} /> : null}
            <QuickAction icon="message-circle" label="Text" color={colors.primary} onPress={() => void openContact('text')} />
            <QuickAction icon="phone" label="Call" color={colors.primary} onPress={() => void openContact('call')} />
            <QuickAction icon="mail" label="Email" color={colors.primary} onPress={() => void openContact('email')} />
          </View>
          </>) : null}

          <TouchableOpacity testID="appointment-notes" onPress={() => router.push({ pathname: '/notes', params: { customerId: params.customerId ?? '', clientName, appointmentId: String(appointmentId) } })} style={[styles.notesRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
                <Text style={[styles.statusText, { color: closed ? colors.destructive : colors.primary }]}>{depositDue && !closed ? 'DEPOSIT DUE' : statusLabel(status)}</Text>
              </View>
              <Text style={[styles.amount, { color: colors.foreground }]}>${(amountCents / 100).toFixed(2)}</Text>
            </View>
            <Text style={[styles.serviceName, { color: colors.foreground }]}>{serviceName}</Text>
            <View style={styles.detailRows}>
              <DetailRow icon="calendar" label={day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} colors={colors} />
              <DetailRow icon="clock" label={`${time} · ${duration}`} colors={colors} />
              {depositDue ? <DetailRow icon="clock" label="Waiting for the client to pay the deposit (link sent by text)" colors={colors} /> : null}
              {depositPaidCents > 0 ? <DetailRow icon="check" label={prepaid ? 'Paid in full online' : `Deposit paid · $${(depositPaidCents / 100).toFixed(2)} comes off at checkout`} colors={colors} /> : null}
              {params.visitAt === 'client' ? <DetailRow icon="navigation" label={`House call${travelFeeCents ? ` · $${(travelFeeCents / 100).toFixed(2)} travel fee` : ''}`} colors={colors} /> : null}
            </View>
            {ticketLines.length > 0 ? (
              <View testID="appointment-ticket" style={[styles.ticket, { borderTopColor: colors.border }]}>
                {ticketLines.map((line, i) => (
                  <View key={`${line.label}-${i}`} style={styles.ticketRow}>
                    <Text style={[styles.ticketLabel, { color: colors.foreground }]}>{line.label}</Text>
                    <Text style={[styles.ticketPrice, { color: colors.foreground }]}>${(line.cents / 100).toFixed(2)}</Text>
                  </View>
                ))}
                <View style={[styles.ticketRow, styles.ticketTotal, { borderTopColor: colors.border }]}>
                  <Text style={[styles.ticketTotalText, { color: colors.foreground }]}>Total</Text>
                  <Text style={[styles.ticketTotalText, { color: colors.foreground }]}>${(amountCents / 100).toFixed(2)}</Text>
                </View>
              </View>
            ) : null}
            {houseCallAddress ? (
              <TouchableOpacity testID="appointment-open-maps" onPress={() => void Linking.openURL(Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${encodeURIComponent(houseCallAddress)}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(houseCallAddress)}`)} style={[styles.mapRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>CLIENT'S ADDRESS</Text>
                  <Text style={[styles.mapAddress, { color: colors.foreground }]}>{houseCallAddress}</Text>
                </View>
                <Text style={[styles.mapLink, { color: colors.primary }]}>Open in Maps</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {error ? <View style={[styles.errorBox, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={15} color={colors.accentForeground} /><Text style={[styles.errorText, { color: colors.accentForeground }]}>{error}</Text></View> : null}

          {status === 'paid' ? (
            <>
              {/* Paid (owner, 2026-11-03): book the client again, or refund — full or part of it. */}
              {refundedCents > 0 ? <Text testID="appointment-refunded" style={[styles.refundedNote, { color: colors.mutedForeground }]}>
                Refunded ${(refundedCents / 100).toFixed(2)}{refundable > 0 ? ` of $${(paidCents / 100).toFixed(2)}` : ' · full refund'}</Text> : null}
              <LinearGradient colors={[colors.primary, '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.checkoutGradient}>
                <TouchableOpacity testID="appointment-rebook" onPress={rebook} style={styles.actionButton}>
                  <Feather name="repeat" size={17} color={colors.primaryForeground} />
                  <Text style={[styles.actionText, { color: colors.primaryForeground }]}>REBOOK</Text>
                </TouchableOpacity>
              </LinearGradient>
              <TouchableOpacity testID="appointment-refund" disabled={refundable <= 0 || isPreview} onPress={() => setRefundOpen(true)}
                style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: refundable <= 0 ? 0.6 : 1 }]}>
                <Feather name="rotate-ccw" size={18} color={colors.primary} />
                <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>{refundable <= 0 ? 'REFUNDED' : 'REFUND'}</Text>
              </TouchableOpacity>
            </>
          ) : closed ? (
            <>
              {/* Cancelled or no-show: book again, charge the fee (only when tapped), or remove the booking for good. */}
              {feeCharged != null ? <Text testID="appointment-fee-charged" style={[styles.refundedNote, { color: colors.mutedForeground }]}>
                {status === 'no_show' ? 'No-show' : 'Late-cancel'} fee of ${(feeCharged / 100).toFixed(2)} charged</Text> : null}
              <LinearGradient colors={[colors.primary, '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.checkoutGradient}>
                <TouchableOpacity testID="appointment-rebook" onPress={rebook} style={styles.actionButton}>
                  <Feather name="repeat" size={17} color={colors.primaryForeground} />
                  <Text style={[styles.actionText, { color: colors.primaryForeground }]}>REBOOK</Text>
                </TouchableOpacity>
              </LinearGradient>
              {canChargeFee ? (
                <TouchableOpacity testID="appointment-charge-fee" disabled={saving} onPress={chargeFee} style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="credit-card" size={18} color={colors.primary} />
                  <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>CHARGE {feeName.toUpperCase()} · ${(feeCents / 100).toFixed(2)}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity testID="appointment-delete" disabled={saving} onPress={deleteAppointment} style={styles.textAction}>
                <Text style={[styles.textActionText, { color: colors.destructive }]}>Delete booking</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {!prepaid ? (
                <LinearGradient colors={[colors.primary, '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.checkoutGradient}>
                  <TouchableOpacity testID="appointment-checkout" disabled={saving} onPress={checkout} style={styles.actionButton}>
                    <Feather name="credit-card" size={17} color={colors.primaryForeground} />
                    <Text style={[styles.actionText, { color: colors.primaryForeground }]}>CHECKOUT</Text>
                  </TouchableOpacity>
                </LinearGradient>
              ) : null}
              <TouchableOpacity testID="appointment-mark-paid" disabled={saving} onPress={() => void markPaid()} style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="check" size={18} color={colors.primary} />
                <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>{saving ? 'UPDATING…' : prepaid ? 'MARK AS DONE' : 'MARK AS PAID'}</Text>
              </TouchableOpacity>
              {packageForVisit ? (
                <TouchableOpacity testID="appointment-use-package" disabled={saving} onPress={() => void spendPackageVisit()} style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name="package" size={18} color={colors.primary} />
                  <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>USE A PACKAGE VISIT ({packageForVisit.visitsLeft} LEFT)</Text>
                </TouchableOpacity>
              ) : null}
              {/* Cancel and no-show replace Delete (owner, 2026-11-03): the booking stays on the client's record. */}
              <View style={styles.closeRow}>
                <TouchableOpacity testID="appointment-no-show" disabled={saving} onPress={markNoShow} style={[styles.closeAction, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="user-x" size={17} color={colors.foreground} />
                  <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>NO-SHOW</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="appointment-cancel" disabled={saving} onPress={cancelBooking} style={[styles.closeAction, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                  <Feather name="x" size={17} color={colors.destructive} />
                  <Text style={[styles.secondaryActionText, { color: colors.destructive }]}>CANCEL</Text>
                </TouchableOpacity>
              </View>
              {!isPreview && !prepaid ? (
                <TouchableOpacity testID="appointment-pay-link" disabled={saving} onPress={() => void payLink()} style={styles.textAction}>
                  <Text style={[styles.textActionText, { color: colors.primary }]}>Text a payment link</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
          <Text style={[styles.previewNote, { color: colors.mutedForeground }]}>{isPreview ? 'Preview only · Changes are not sent to Certxa.' : 'Appointment updates are processed by Certxa.'}</Text>
        </ScrollView>
      )}
      <WhenSheet open={whenOpen} colors={colors} day={day} time={time} shiftDay={shiftDay} setTime={setTime} onClose={() => setWhenOpen(false)} />
      <RefundSheet open={refundOpen} colors={colors} appointmentId={appointmentId} refundableCents={refundable}
        onClose={() => setRefundOpen(false)}
        onRefunded={(total) => { setRefundedCents(total); void refresh(); }} />
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityLabel={label} onPress={onPress} style={styles.quickAction}>
      <View style={[styles.quickIcon, { backgroundColor: `${color}18` }]}><Feather name={icon} size={17} color={color} /></View>
      <Text style={[styles.quickLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DetailRow({ icon, label, colors }: { icon: React.ComponentProps<typeof Feather>['name']; label: string; colors: ReturnType<typeof useColors> }) {
  return <View style={styles.detailRow}><Feather name={icon} size={14} color={colors.mutedForeground} /><Text style={[styles.detailText, { color: colors.mutedForeground }]}>{label}</Text></View>;
}

type ServiceOption = { id: number; name: string; duration: string; durationMinutes: number; price: string; priceValue: number; icon: 'eye' | 'droplet' | 'briefcase' | 'star' };

/**
 * Edit a booking that is still to come (owner, 2026-11-03): its date and time (in their own sheet, the current ones
 * already chosen), one or more services, and add-ons. No status: the app has none to choose.
 */
function EditAppointment({ colors, day, time, error, save, saving, services, serviceIds, setServiceIds, addonOptions, addonIds, setAddonIds, keptLines, openWhen }: {
  colors: ReturnType<typeof useColors>;
  day: Date;
  time: string;
  error: string;
  save: () => Promise<void>;
  saving: boolean;
  services: ServiceOption[];
  serviceIds: number[];
  setServiceIds: (next: number[]) => void;
  addonOptions: AddonOption[];
  addonIds: number[];
  setAddonIds: (next: number[]) => void;
  keptLines: Line[];
  openWhen: () => void;
}) {
  const insets = useSafeAreaInsets();
  const toggleService = (sid: number) => setServiceIds(serviceIds.includes(sid) ? serviceIds.filter((x) => x !== sid) : [...serviceIds, sid]);
  const toggleAddon = (aid: number) => setAddonIds(addonIds.includes(aid) ? addonIds.filter((x) => x !== aid) : [...addonIds, aid]);
  // An add-on linked to no service is offered with every service (as when booking).
  const applicable = addonOptions.filter((a) => a.serviceIds.length === 0 || a.serviceIds.some((sid) => serviceIds.includes(sid)));
  const chosen = serviceIds.map((sid) => services.find((x) => x.id === sid)).filter((v): v is ServiceOption => !!v);
  const addons = applicable.filter((a) => addonIds.includes(a.id));
  const total = chosen.reduce((n, x) => n + x.priceValue, 0) + addons.reduce((n, a) => n + a.priceValue, 0) + keptLines.reduce((n, l) => n + l.price, 0);
  const minutes = chosen.reduce((n, x) => n + x.durationMinutes, 0) + addons.reduce((n, a) => n + a.minutes, 0);
  return (
    <View style={styles.root}>
    <ScrollView contentContainerStyle={styles.editContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.editEyebrow, { color: colors.primary }]}>EDIT APPOINTMENT</Text>
      <Text style={[styles.editTitle, { color: colors.foreground }]}>Make a change</Text>
      <Text style={[styles.editSection, { color: colors.foreground }]}>Date and time</Text>
      <TouchableOpacity testID="edit-when" onPress={openWhen} style={[styles.whenRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="calendar" size={17} color={colors.primary} />
        <Text style={[styles.whenText, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {time}</Text>
        <Text style={[styles.whenChange, { color: colors.primary }]}>Change</Text>
      </TouchableOpacity>
      <Text style={[styles.editSection, { color: colors.foreground }]}>Services</Text>
      <View style={styles.serviceList}>{services.map((service) => {
        const on = serviceIds.includes(service.id);
        return <TouchableOpacity key={service.id} testID={`edit-service-${service.id}`} onPress={() => toggleService(service.id)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: on ? colors.primary : colors.border }]}><View style={[styles.serviceIcon, { backgroundColor: colors.secondary }]}><Feather name={service.icon} size={17} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.serviceName, { color: colors.foreground }]}>{service.name}</Text><Text style={[styles.serviceMeta, { color: colors.mutedForeground }]}>{service.duration}</Text></View><Text style={[styles.servicePrice, { color: colors.foreground }]}>{service.price}</Text><Feather name={on ? 'check-square' : 'square'} size={18} color={on ? colors.primary : colors.border} /></TouchableOpacity>;
      })}</View>
      {applicable.length > 0 ? (
        <>
          <Text style={[styles.editSection, { color: colors.foreground }]}>Add-ons</Text>
          <View style={styles.serviceList}>{applicable.map((a) => {
            const on = addonIds.includes(a.id);
            return <TouchableOpacity key={a.id} testID={`edit-addon-${a.id}`} onPress={() => toggleAddon(a.id)} style={[styles.serviceRow, { backgroundColor: colors.card, borderColor: on ? colors.primary : colors.border }]}><View style={{ flex: 1 }}><Text style={[styles.serviceName, { color: colors.foreground, marginTop: 0 }]}>{a.name}</Text>{a.minutes ? <Text style={[styles.serviceMeta, { color: colors.mutedForeground }]}>{a.minutes} min</Text> : null}</View><Text style={[styles.servicePrice, { color: colors.foreground }]}>${a.priceValue.toFixed(2)}</Text><Feather name={on ? 'check-square' : 'square'} size={18} color={on ? colors.primary : colors.border} /></TouchableOpacity>;
          })}</View>
        </>
      ) : null}
      {keptLines.length > 0 ? <Text style={[styles.serviceMeta, { color: colors.mutedForeground, marginTop: 10 }]}>Also on this ticket: {keptLines.map((l) => `${l.label} $${l.price.toFixed(2)}`).join(', ')}</Text> : null}
      <Text style={[styles.editTotal, { color: colors.foreground }]}>{minutes} min · ${total.toFixed(2)}</Text>
    </ScrollView>
      {/* Stays at the bottom however long the list of services is. */}
      <View testID="edit-footer" style={[styles.editFooter, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity testID="edit-save" disabled={saving || chosen.length === 0} onPress={() => void save()} style={[styles.save, { marginTop: 0, backgroundColor: colors.primary, opacity: saving || chosen.length === 0 ? 0.6 : 1 }]}><Feather name="check" size={17} color={colors.primaryForeground} /><Text style={[styles.saveText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : chosen.length === 0 ? 'Choose a service' : 'Save changes'}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

/** The booking's date and time, in a sheet of their own (the current ones already chosen). */
function WhenSheet({ open, colors, day, time, shiftDay, setTime, onClose }: {
  open: boolean; colors: ReturnType<typeof useColors>; day: Date; time: string; shiftDay: (n: number) => void; setTime: (t: string) => void; onClose: () => void;
}) {
  const choices = useMemo(() => timeChoices(time), [time]);
  const norm = time.replace(/\s+/g, ' ');
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Date and time</Text>
          <View style={[styles.dateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => shiftDay(-1)} style={styles.arrow}><Feather name="chevron-left" size={20} color={colors.foreground} /></TouchableOpacity>
            <View style={{ alignItems: 'center' }}><Text style={[styles.dateMain, { color: colors.foreground }]}>{day.toLocaleDateString('en-US', { weekday: 'long' })}</Text><Text style={[styles.dateSub, { color: colors.mutedForeground }]}>{day.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text></View>
            <TouchableOpacity onPress={() => shiftDay(1)} style={styles.arrow}><Feather name="chevron-right" size={20} color={colors.foreground} /></TouchableOpacity>
          </View>
          {/* Times stay as tappable pills (owner, 2026-11-03: "the time picker can be pills"). */}
          <ScrollView style={{ maxHeight: 300, marginTop: 14 }}>
            <View style={styles.chips}>{choices.map((slot) => <TouchableOpacity key={slot} onPress={() => setTime(slot)} style={[styles.chip, { backgroundColor: norm === slot ? colors.primary : colors.card, borderColor: norm === slot ? colors.primary : colors.border }]}><Text style={[styles.chipText, { color: norm === slot ? colors.primaryForeground : colors.foreground }]}>{slot}</Text></TouchableOpacity>)}</View>
          </ScrollView>
          <TouchableOpacity testID="when-done" onPress={onClose} style={[styles.save, { backgroundColor: colors.primary }]}><Text style={[styles.saveText, { color: colors.primaryForeground }]}>Done</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

/** Refund a paid booking, all of it or part (owner, 2026-11-03). Card payments go back to the card through Stripe. */
function RefundSheet({ open, colors, appointmentId, refundableCents, onClose, onRefunded }: {
  open: boolean; colors: ReturnType<typeof useColors>; appointmentId: number; refundableCents: number; onClose: () => void; onRefunded: (totalRefundedCents: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // One key per opening: a repeated tap is one refund.
  const [key, setKey] = useState('');
  useEffect(() => { if (open) { setAmount(''); setError(''); setKey(`${Date.now()}-${Math.random().toString(36).slice(2, 10)}`); } }, [open]);
  const full = (refundableCents / 100).toFixed(2);
  const send = (cents: number | null) => {
    const shown = cents == null ? full : (cents / 100).toFixed(2);
    Alert.alert('Refund $' + shown + '?', 'A card payment goes back to the client\'s card. A cash payment is recorded as cash you hand back.', [
      { text: 'Not now', style: 'cancel' },
      { text: `Refund $${shown}`, style: 'destructive', onPress: async () => {
        setBusy(true); setError('');
        try {
          const r = await api.post<{ refundedCents?: number }>(`/api/appointments/${appointmentId}/refund`, { amountCents: cents, idempotencyKey: key });
          onRefunded(Number(r?.refundedCents ?? 0) || 0);
          onClose();
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : 'The refund could not be made. Please try again.');
        } finally { setBusy(false); }
      } },
    ]);
  };
  const partCents = Math.round((Number(amount.replace(/[^0-9.]/g, '')) || 0) * 100);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Refund</Text>
          <TouchableOpacity testID="refund-full" disabled={busy} onPress={() => send(null)} style={[styles.save, { backgroundColor: colors.primary, marginTop: 6 }]}>
            <Text style={[styles.saveText, { color: colors.primaryForeground }]}>Full refund · ${full}</Text>
          </TouchableOpacity>
          <Text style={[styles.editSection, { color: colors.foreground }]}>Or part of it</Text>
          <View style={[styles.whenRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.whenText, { color: colors.foreground, flex: 0 }]}>$</Text>
            <TextInput testID="refund-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.mutedForeground}
              style={[styles.whenText, { color: colors.foreground, padding: 0 }]} />
          </View>
          <TouchableOpacity testID="refund-part" disabled={busy || partCents <= 0 || partCents > refundableCents} onPress={() => send(partCents)}
            style={[styles.secondaryAction, { backgroundColor: colors.card, borderColor: colors.border, opacity: busy || partCents <= 0 || partCents > refundableCents ? 0.5 : 1 }]}>
            <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>{partCents > refundableCents ? `At most $${full}` : `Refund $${(partCents / 100).toFixed(2)}`}</Text>
          </TouchableOpacity>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity onPress={onClose} disabled={busy} style={{ alignItems: 'center', paddingVertical: 14 }}><Text style={[styles.secondaryActionText, { color: colors.mutedForeground }]}>Close</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  closeRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  closeAction: { flex: 1, height: 50, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  textAction: { alignSelf: 'center', paddingVertical: 14 },
  textActionText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  refundedNote: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 14 },
  whenRow: { minHeight: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  whenText: { flex: 1, fontSize: 15, fontFamily: 'Inter_500Medium' },
  whenChange: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  editTotal: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 16, textAlign: 'right' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34 },
  sheetTitle: { fontSize: 19, fontFamily: 'Inter_600SemiBold', marginBottom: 14 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  mapAddress: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium', marginTop: 4 },
  mapLink: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  root: { flex: 1 },
  editFooter: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
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
  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: 19, marginTop: 21, marginBottom: 20 },
  quickAction: { width: 52, alignItems: 'center', gap: 6 },
  quickIcon: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
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
  ticket: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, gap: 8 },
  ticketRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  ticketLabel: { flex: 1, fontSize: 14, fontFamily: 'Inter_400Regular' },
  ticketPrice: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  ticketTotal: { marginTop: 2, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  ticketTotalText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  detailRows: { gap: 8, marginTop: 11, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#E6E2F1' },
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