/**
 * Client profile (owner, 2026-11-03; plans/certxa-pro-crm.md): everything the website's client profile knows, on the
 * phone. Status and tags, Call / Text / Book / Notes, allergy alert, live numbers, visit rhythm, upcoming and past
 * visits, notes (pinned first), details, tags and the two marketing switches Certxa honours when it sends texts.
 *   GET/PATCH /api/clients/:id · GET /api/clients/:id/appointments · GET /api/intelligence/client/:id
 *   PATCH /api/customers/:id (name, phone, e-mail) · tags /api/clients/tags/list, POST /api/clients/tags,
 *   POST/DELETE /api/clients/:id/tags · PATCH /api/clients/:id/notes/:noteId · PUT /api/clients/:id/marketing-preferences
 *   DELETE /api/pro/clients/:id (for good, from the bottom of Edit)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { callClient } from '@/lib/voice';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { api, ApiError } from '@/lib/live-api';
import { zonedDateLabel } from '@/lib/businessTime';
import { clientStatusOf, STATUS_LABEL } from '@/lib/clientStatus';
import { ClientPhotos } from '@/components/ClientPhotos';
import { HelpTitle } from '@/components/HelpTitle';
import { HoldToDelete } from '@/components/HoldToDelete';

type Note = { id: number; noteContent: string; createdAt: string; pinned?: boolean | null };
type Tag = { id: number; tagName: string; tagColor?: string | null };
type Prefs = { smsMarketingOptIn?: boolean | null; emailMarketingOptIn?: boolean | null; promotionalNotifications?: boolean | null; appointmentReminders?: boolean | null; reviewRequests?: boolean | null };
type Client = {
  id: number; avatarUrl?: string | null; cardBrand?: string | null; cardLast4?: string | null; firstName?: string | null; lastName?: string | null; fullName?: string | null; preferredName?: string | null;
  dateOfBirth?: string | null; allergies?: string | null; clientStatus?: string | null; loyaltyPoints?: number | null;
  totalVisits: number; totalSpentCents: number; spent12mCents: number; lastVisitAt?: string | null;
  primaryPhone?: string | null; primaryEmail?: string | null; notes: Note[]; tags: { tagId: number; tag: Tag }[];
  /** phoneType comes from Twilio's line-type lookup when the number is added or changed (storage.ts). */
  phones?: { displayPhone?: string | null; phoneNumberE164?: string | null; phoneType?: string | null; isPrimary?: boolean | null }[];
  marketingPreferences?: Prefs | null;
};
type Visit = { id: number; date: string; status: string; totalPaid?: string | number | null; tipAmount?: string | number | null; serviceName?: string | null };
type Intel = { avgVisitCadenceDays?: number | string | null; nextExpectedVisitDate?: string | null };

/** "2026-03-09" (how it's saved) → "03/09/2026". */
const shownBirthday = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
/** The slashes go in as they type: "0309" → "03/09". */
const typedBirthday = (text: string) => {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
};
/** "03/09/2026" → "2026-03-09", or null when it isn't a real date (02/31, a future year). */
function savedBirthday(text: string): string | null {
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real && year >= 1900 && date <= new Date() ? `${match[3]}-${match[1]}-${match[2]}` : null;
}
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const OPEN_STATUSES = new Set(['pending', 'confirmed', 'started', 'paid']);
const STATUS_TEXT: Record<string, string> = { completed: 'Paid', cancelled: 'Cancelled', no_show: 'No-show', pending: 'Booked', confirmed: 'Booked', started: 'In progress', paid: 'Paid' };

export default function ClientProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { timeZone, refresh: refreshBookings, clients } = useBookingData();
  const params = useLocalSearchParams<{ id?: string }>();
  const clientId = Number(params.id);
  const [client, setClient] = useState<Client | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  // Prepaid package visits left (routes/siteShop.ts).
  const [packages, setPackages] = useState<{ id: number; name: string; visitsTotal: number; visitsLeft: number }[]>([]);
  useEffect(() => {
    if (!Number.isInteger(clientId) || clientId <= 0) return;
    api.get<{ id: number; name: string; visitsTotal: number; visitsLeft: number }[]>(`/api/pro/clients/${clientId}/packages`).then(setPackages).catch(() => setPackages([]));
  }, [clientId]);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', phone: '', email: '', preferredName: '', birthday: '', allergies: '' });
  const [tagText, setTagText] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isInteger(clientId) || clientId <= 0) { setError('This client could not be found.'); setLoading(false); return; }
    setError('');
    try {
      const [detail, history, tags] = await Promise.all([
        api.get<Client>(`/api/clients/${clientId}`),
        api.get<Visit[]>(`/api/clients/${clientId}/appointments`),
        api.get<Tag[]>('/api/clients/tags/list').catch(() => [] as Tag[]),
      ]);
      setClient(detail);
      setVisits(Array.isArray(history) ? history : []);
      setAllTags(Array.isArray(tags) ? tags : []);
      // Visit rhythm is worked out overnight; a new client has none yet.
      api.get<{ intel?: Intel | null }>(`/api/intelligence/client/${clientId}`).then((value) => setIntel(value?.intel ?? null)).catch(() => setIntel(null));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not load this client. Check the connection and try again.');
    } finally { setLoading(false); }
  }, [clientId]);
  useEffect(() => { void load(); }, [load]);

  const name = client ? (client.fullName || [client.firstName, client.lastName].filter(Boolean).join(' ') || 'Client') : '';
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
  // Visits as the Clients list counts them (paid visits from the appointments, GET /api/customers), else from this
  // client's own visit history. The client record's totalVisits / lastVisitAt are stale and made active clients look
  // Inactive (found 2026-11-04).
  const listed = clients.find((c) => c.customerId === clientId);
  const paidVisits = useMemo(() => visits.filter((v) => (v.status === 'completed' || v.status === 'paid') && new Date(v.date).getTime() <= Date.now()), [visits]);
  const visitCount = listed ? listed.visits : paidVisits.length;
  const lastVisitAt = listed?.lastVisitAt ?? paidVisits.reduce<string | null>((latest, v) => (!latest || v.date > latest ? v.date : latest), null);
  const status = client ? clientStatusOf({ isVip: client.clientStatus === 'vip', visits: visitCount, lastVisitAt }) : 'new';
  const now = Date.now();
  const upcoming = useMemo(() => visits.filter((v) => OPEN_STATUSES.has(v.status) && new Date(v.date).getTime() >= now - 3600_000).sort((a, b) => +new Date(a.date) - +new Date(b.date)), [visits, now]);
  const past = useMemo(() => visits.filter((v) => !upcoming.includes(v)), [visits, upcoming]);
  const noShows = visits.filter((v) => v.status === 'no_show').length;
  const avgCents = client && client.totalVisits > 0 ? Math.round(client.totalSpentCents / client.totalVisits) : 0;
  const phoneDigits = (client?.primaryPhone ?? '').replace(/\D/g, '');
  const primaryPhone = client?.phones?.find((p) => p.isPrimary) ?? client?.phones?.[0];
  // A landline can't get texts (Twilio's lookup said so); an unchecked number is allowed.
  const canText = !!phoneDigits && primaryPhone?.phoneType !== 'landline';
  const email = client?.primaryEmail ?? '';
  const pinnedFirst = useMemo(() => [...(client?.notes ?? [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt)), [client]);
  const myTagIds = new Set((client?.tags ?? []).map((t) => t.tagId));

  const run = async (work: () => Promise<void>, fallback: string) => {
    if (saving) return;
    setSaving(true); setError('');
    try { await work(); } catch (cause) { setError(cause instanceof ApiError ? cause.message : fallback); }
    finally { setSaving(false); }
  };

  const startEdit = () => {
    if (!client) return;
    setDraft({
      name, phone: client.primaryPhone ?? '', email: client.primaryEmail ?? '', preferredName: client.preferredName ?? '',
      birthday: client.dateOfBirth ? shownBirthday(String(client.dateOfBirth).slice(0, 10)) : '', allergies: client.allergies ?? '',
    });
    setEditing(true); setError('');
  };
  const saveEdit = () => run(async () => {
    const phone = draft.phone.replace(/\D/g, '');
    const email = draft.email.trim();
    if (!draft.name.trim()) throw new ApiError('Enter the client’s name.', 400);
    if (phone && phone.length !== 10) throw new ApiError('Enter a 10-digit phone number.', 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('Enter a valid e-mail address.', 400);
    const birthday = draft.birthday.trim() ? savedBirthday(draft.birthday.trim()) : null;
    if (draft.birthday.trim() && !birthday) throw new ApiError('Enter the birthday as MM/DD/YYYY.', 400);
    await api.patch(`/api/customers/${clientId}`, { name: draft.name.trim(), ...(phone ? { phone } : {}), ...(email ? { email } : {}) });
    await api.patch(`/api/clients/${clientId}`, {
      preferredName: draft.preferredName.trim() || null, dateOfBirth: birthday, allergies: draft.allergies.trim() || null,
    });
    setEditing(false);
    await load();
    void refreshBookings();
  }, 'Could not save the client.');
  // One of the client's before and after photos as their profile photo, or back to their initials (null).
  const setProfilePhoto = (url: string | null) => run(async () => {
    await api.patch(`/api/clients/${clientId}`, { avatarUrl: url });
    await load();
    void refreshBookings();
  }, 'Could not change the profile photo.');
  // Deletes the client's record for good; holding the button for 2 seconds is the confirmation (server: lib/deleteClient.ts).
  const deleteClient = () => run(async () => {
    await api.del(`/api/pro/clients/${clientId}`);
    void refreshBookings();
    router.back();
  }, 'Could not delete the client.');

  const toggleVip = () => run(async () => {
    await api.patch(`/api/clients/${clientId}`, { clientStatus: client?.clientStatus === 'vip' ? 'active' : 'vip' });
    await load();
    void refreshBookings();
  }, 'Could not change VIP.');

  const togglePin = (note: Note) => run(async () => {
    await api.patch(`/api/clients/${clientId}/notes/${note.id}`, { pinned: !note.pinned });
    await load();
  }, 'Could not pin the note.');

  const addTag = (tagName: string) => run(async () => {
    const wanted = tagName.trim();
    if (!wanted) return;
    let tag = allTags.find((t) => t.tagName.toLowerCase() === wanted.toLowerCase());
    if (!tag) tag = await api.post<Tag>('/api/clients/tags', { tagName: wanted });
    if (tag && !myTagIds.has(tag.id)) await api.post(`/api/clients/${clientId}/tags`, { tagId: tag.id });
    setTagText(''); setAddingTag(false);
    await load();
    void refreshBookings();
  }, 'Could not add the tag.');
  const removeTag = (tagId: number) => run(async () => {
    await api.del(`/api/clients/${clientId}/tags/${tagId}`);
    await load();
    void refreshBookings();
  }, 'Could not remove the tag.');

  // Only these two are read when Certxa sends texts (no row = allowed).
  const setPref = (key: 'smsMarketingOptIn' | 'reviewRequests', value: boolean) => run(async () => {
    const p = client?.marketingPreferences ?? {};
    await api.put(`/api/clients/${clientId}/marketing-preferences`, {
      smsMarketingOptIn: p.smsMarketingOptIn ?? true, emailMarketingOptIn: p.emailMarketingOptIn ?? true,
      promotionalNotifications: p.promotionalNotifications ?? true, appointmentReminders: p.appointmentReminders ?? true,
      reviewRequests: p.reviewRequests ?? true, [key]: value,
    });
    await load();
  }, 'Could not save the setting.');

  const card = { backgroundColor: colors.card, borderColor: colors.border };
  const dateLabel = (iso?: string | null) => (iso ? zonedDateLabel(iso, timeZone) : '—');
  const visitRow = (v: Visit) => {
    const paid = Number(v.totalPaid ?? 0) - Number(v.tipAmount ?? 0);
    return (
      <TouchableOpacity key={v.id} testID={`client-visit-${v.id}`} onPress={() => router.push(`/appointment/${v.id}`)} style={[styles.visitRow, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.foreground }]}>{v.serviceName || 'Visit'}</Text>
          <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{dateLabel(v.date)} · {STATUS_TEXT[v.status] ?? v.status}</Text>
        </View>
        {v.status === 'completed' && paid > 0 ? <Text style={[styles.rowTitle, { color: colors.foreground }]}>{money(Math.round(paid * 100))}</Text> : null}
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="client-profile-back" accessibilityLabel="Back" onPress={() => router.back()} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="client" style={[styles.headerTitle, { color: colors.foreground }]}>Client</HelpTitle>
        {client && !editing ? (
          <TouchableOpacity testID="client-edit" accessibilityLabel="Edit client" onPress={startEdit} style={styles.headerButton}><Feather name="edit-2" size={19} color={colors.foreground} /></TouchableOpacity>
        ) : <View style={styles.headerButton} />}
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /> : !client ? (
        <Text style={[styles.error, { color: colors.destructive, textAlign: 'center', marginTop: 40 }]}>{error || 'This client could not be found.'}</Text>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {editing ? (<>
            <Text style={[styles.section, { color: colors.foreground, marginTop: 6 }]}>Edit {name}</Text>
            <View style={[styles.box, card, { padding: 14 }]}>
              {([
                ['name', 'First and last name', 'default'], ['phone', 'Phone number', 'phone-pad'], ['email', 'E-mail', 'email-address'],
                ['preferredName', 'Goes by (optional)', 'default'], ['birthday', 'Birthday (MM/DD/YYYY)', 'number-pad'], ['allergies', 'Allergies (optional)', 'default'],
              ] as const).map(([key, placeholder, keyboard]) => (
                <TextInput key={key} testID={`client-edit-${key}`} value={draft[key]} onChangeText={(value) => setDraft((d) => ({ ...d, [key]: key === 'birthday' ? typedBirthday(value) : value }))}
                  placeholder={placeholder} placeholderTextColor={colors.mutedForeground} keyboardType={keyboard} autoCapitalize={key === 'email' ? 'none' : 'words'}
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
              ))}
              <TouchableOpacity testID="client-edit-save" disabled={saving} onPress={() => void saveEdit()} style={[styles.button, { backgroundColor: colors.primary }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save changes'}</Text></TouchableOpacity>
              <TouchableOpacity disabled={saving} onPress={() => { setEditing(false); setError(''); }} style={styles.more}><Text style={[styles.link, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
            </View>
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            <HoldToDelete testID="client-delete" label="Delete Client" busy={saving} onDone={() => void deleteClient()} />
          </>) : (<>
          {client.avatarUrl
            ? <Image testID="client-avatar" source={{ uri: client.avatarUrl }} style={styles.avatar} />
            : <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text></View>}
          <Text style={[styles.name, { color: colors.foreground }]}>{name}</Text>
          {client.preferredName ? <Text style={[styles.sub, { color: colors.mutedForeground }]}>Goes by {client.preferredName}</Text> : null}
          <View style={styles.badges}>
            <View style={[styles.badge, { backgroundColor: status === 'at_risk' ? colors.accent : colors.secondary }]}><Text style={[styles.badgeText, { color: status === 'at_risk' ? colors.accentForeground : colors.secondaryForeground }]}>{STATUS_LABEL[status]}</Text></View>
            {client.tags.map((t) => (
              <View key={t.tagId} style={[styles.badge, { backgroundColor: colors.muted }]}><Text style={[styles.badgeText, { color: colors.foreground }]}>{t.tag.tagName}</Text></View>
            ))}
          </View>

          {/* The same Text / Call / Email icons as a booking (owner, 2026-11-03); grey when it can't be used. */}
          <View style={styles.quickActions}>
            {[
              { key: 'text', icon: 'message-circle' as const, label: 'Text', on: () => Linking.openURL(`sms:${phoneDigits}`), ok: canText },
              { key: 'call', icon: 'phone' as const, label: 'Call', on: () => callClient(phoneDigits).catch((cause) => Alert.alert('Call', cause instanceof Error ? cause.message : 'The call could not be made.')), ok: !!phoneDigits },
              { key: 'email', icon: 'mail' as const, label: 'Email', on: () => Linking.openURL(`mailto:${email}`), ok: !!email },
            ].map((a) => (
              <TouchableOpacity key={a.key} testID={`client-action-${a.key}`} accessibilityLabel={a.label} accessibilityState={{ disabled: !a.ok }} disabled={!a.ok} onPress={() => void a.on()} style={styles.quickAction}>
                <View style={[styles.quickIcon, { backgroundColor: a.ok ? `${colors.primary}18` : colors.muted }]}><Feather name={a.icon} size={17} color={a.ok ? colors.primary : colors.mutedForeground} /></View>
                <Text style={[styles.quickLabel, { color: a.ok ? colors.primary : colors.mutedForeground }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity testID="client-book" onPress={() => router.push({ pathname: '/booking', params: { clientId: String(client.id), phone: client.primaryPhone ?? '' } })} style={[styles.bookButton, { backgroundColor: colors.primary }]}>
            <Feather name="calendar" size={17} color={colors.primaryForeground} /><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Book appointment</Text>
          </TouchableOpacity>

          {phoneDigits && !canText ? (
            <Text testID="client-landline" style={[styles.sub, { color: colors.mutedForeground }]}>This number is a landline, so it can't receive texts.</Text>
          ) : null}
          {client.allergies ? (
            <View style={[styles.alert, { backgroundColor: colors.accent }]} testID="client-allergies">
              <Feather name="alert-triangle" size={16} color={colors.accentForeground} />
              <Text style={[styles.alertText, { color: colors.accentForeground }]}>Allergies: {client.allergies}</Text>
            </View>
          ) : null}

          {packages.map((p) => (
            <Text key={p.id} testID={`client-package-${p.id}`} style={[styles.sub, { color: colors.foreground }]}>{p.name}: {p.visitsLeft} of {p.visitsTotal} visits left</Text>
          ))}

          <View style={styles.stats}>
            {[
              ['Visits', String(client.totalVisits)],
              ['Lifetime spend', money(client.totalSpentCents)],
              ['Average visit', client.totalVisits ? money(avgCents) : '—'],
              ['Last 12 months', money(client.spent12mCents)],
              ['Last visit', dateLabel(client.lastVisitAt)],
              ['Next visit', upcoming[0] ? dateLabel(upcoming[0].date) : 'Not booked'],
              ['No-shows', String(noShows)],
              ...(client.loyaltyPoints ? [['Loyalty points', String(client.loyaltyPoints)]] : []),
            ].map(([label, value]) => (
              <View key={label} style={[styles.stat, card]}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
              </View>
            ))}
          </View>
          {Number(intel?.avgVisitCadenceDays) > 0 ? (
            <Text style={[styles.sub, { color: colors.mutedForeground, textAlign: 'left', marginTop: 10 }]}>
              Usually comes every {Math.round(Number(intel?.avgVisitCadenceDays))} days{intel?.nextExpectedVisitDate && !upcoming.length ? ` · expected around ${dateLabel(intel.nextExpectedVisitDate)}` : ''}.
            </Text>
          ) : null}

          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}

          <Text style={[styles.section, { color: colors.foreground }]}>Upcoming</Text>
          <View style={[styles.box, card]}>
            {upcoming.length ? upcoming.map(visitRow) : <Text style={[styles.empty, { color: colors.mutedForeground }]}>Nothing booked.</Text>}
          </View>

          <Text style={[styles.section, { color: colors.foreground }]}>Past visits</Text>
          <View style={[styles.box, card]}>
            {past.length ? (showAllPast ? past : past.slice(0, 5)).map(visitRow) : <Text style={[styles.empty, { color: colors.mutedForeground }]}>No visits yet.</Text>}
            {past.length > 5 ? (
              <TouchableOpacity testID="client-past-toggle" onPress={() => setShowAllPast(!showAllPast)} style={styles.more}><Text style={[styles.link, { color: colors.primary }]}>{showAllPast ? 'Show fewer' : `Show all ${past.length}`}</Text></TouchableOpacity>
            ) : null}
          </View>

          {/* Before/after photos, private to the business (owner, 2026-11-03). */}
          <View style={{ marginTop: 22 }}><ClientPhotos clientId={clientId} avatarUrl={client.avatarUrl} onProfilePhoto={(url) => void setProfilePhoto(url)} onRemoved={() => { void load(); void refreshBookings(); }} /></View>

          <View style={styles.sectionLine}>
            <Text style={[styles.section, { color: colors.foreground }]}>Notes</Text>
            <TouchableOpacity testID="client-notes-all" onPress={() => router.push({ pathname: '/notes', params: { customerId: String(clientId), clientName: name } })}><Text style={[styles.link, { color: colors.primary }]}>Add or see all</Text></TouchableOpacity>
          </View>
          <View style={[styles.box, card]}>
            {pinnedFirst.length ? pinnedFirst.slice(0, 3).map((n) => (
              <View key={n.id} style={[styles.noteRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.noteText, { color: colors.foreground }]}>{n.noteContent}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{n.pinned ? 'Pinned · ' : ''}{dateLabel(n.createdAt)}</Text>
                </View>
                <TouchableOpacity testID={`client-note-pin-${n.id}`} accessibilityLabel={n.pinned ? 'Unpin note' : 'Pin note'} onPress={() => void togglePin(n)} style={styles.pin}>
                  <Feather name="bookmark" size={17} color={n.pinned ? colors.primary : colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            )) : <Text style={[styles.empty, { color: colors.mutedForeground }]}>No notes yet.</Text>}
          </View>

          <View style={styles.sectionLine}>
            <Text style={[styles.section, { color: colors.foreground }]}>Details</Text>
          </View>
            <View style={[styles.box, card]}>
              {[
                ['Phone', client.primaryPhone || '—'], ['E-mail', client.primaryEmail || '—'], ['Goes by', client.preferredName || '—'],
                ['Birthday', client.dateOfBirth ? new Date(`${String(client.dateOfBirth).slice(0, 10)}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : '—'],
                ['Allergies', client.allergies || 'None noted'],
                ...(client.cardLast4 ? [['Card on file', `${client.cardBrand ? `${client.cardBrand[0].toUpperCase()}${client.cardBrand.slice(1)} ` : ''}ending ${client.cardLast4}`]] : []),
              ].map(([label, value]) => (
                <View key={label} style={[styles.detailRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground, marginTop: 0 }]}>{label}</Text>
                  <Text style={[styles.rowTitle, { color: colors.foreground, flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
                </View>
              ))}
              <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>VIP client</Text>
                <Switch testID="client-vip" value={client.clientStatus === 'vip'} onValueChange={() => void toggleVip()} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" ios_backgroundColor={colors.border} />
              </View>
            </View>

          <View style={styles.sectionLine}>
            <Text style={[styles.section, { color: colors.foreground }]}>Tags</Text>
            {!addingTag ? <TouchableOpacity testID="client-tag-add" onPress={() => setAddingTag(true)}><Text style={[styles.link, { color: colors.primary }]}>Add tag</Text></TouchableOpacity> : null}
          </View>
          <View style={[styles.box, card, { padding: 12 }]}>
            <View style={styles.badges}>
              {client.tags.length ? client.tags.map((t) => (
                <TouchableOpacity key={t.tagId} testID={`client-tag-remove-${t.tagId}`} accessibilityLabel={`Remove tag ${t.tag.tagName}`} onPress={() => void removeTag(t.tagId)} style={[styles.chip, { borderColor: colors.border }]}>
                  <Text style={[styles.badgeText, { color: colors.foreground }]}>{t.tag.tagName}</Text><Feather name="x" size={13} color={colors.mutedForeground} />
                </TouchableOpacity>
              )) : <Text style={[styles.empty, { color: colors.mutedForeground, padding: 0 }]}>No tags.</Text>}
            </View>
            {addingTag ? (
              <>
                <TextInput testID="client-tag-input" autoFocus value={tagText} onChangeText={setTagText} onSubmitEditing={() => void addTag(tagText)} placeholder="New tag" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, marginTop: 10 }]} />
                {allTags.some((t) => !myTagIds.has(t.id)) ? (
                  <View style={{ marginTop: 2 }}>
                    <SelectField testID="client-tag-pick" title="Your tags" placeholder="Or choose one of your tags" value={null}
                      options={allTags.filter((t) => !myTagIds.has(t.id)).map((t) => ({ value: t.id, label: t.tagName }))}
                      onChange={(id) => { const t = allTags.find((x) => x.id === id); if (t) void addTag(t.tagName); }} />
                  </View>
                ) : null}
                <View style={styles.tagButtons}>
                  <TouchableOpacity onPress={() => { setAddingTag(false); setTagText(''); }}><Text style={[styles.link, { color: colors.mutedForeground }]}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity testID="client-tag-save" disabled={!tagText.trim() || saving} onPress={() => void addTag(tagText)}><Text style={[styles.link, { color: tagText.trim() ? colors.primary : colors.mutedForeground }]}>Add</Text></TouchableOpacity>
                </View>
              </>
            ) : null}
          </View>

          <Text style={[styles.section, { color: colors.foreground }]}>Texts this client gets</Text>
          <View style={[styles.box, card]}>
            {([
              ['smsMarketingOptIn', 'Marketing texts', 'Offers, win-back and rebooking reminders'],
              ['reviewRequests', 'Review requests', 'Asking for a review after a visit'],
            ] as const).map(([key, title, hint], index) => (
              <View key={key} style={[styles.detailRow, index === 1 ? { borderBottomWidth: 0 } : { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{title}</Text>
                  <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{hint}</Text>
                </View>
                <Switch testID={`client-pref-${key}`} value={client.marketingPreferences?.[key] !== false} onValueChange={(value) => void setPref(key, value)} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" ios_backgroundColor={colors.border} />
              </View>
            ))}
          </View>
          </>)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 6 },
  avatar: { width: 78, height: 78, borderRadius: 39, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  avatarText: { fontSize: 23, fontFamily: 'Inter_600SemiBold' },
  name: { fontSize: 23, textAlign: 'center', fontFamily: 'Inter_600SemiBold', marginTop: 14 },
  sub: { fontSize: 12, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 4 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  badge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, minHeight: 30 },
  quickActions: { flexDirection: 'row', justifyContent: 'center', gap: 19, marginTop: 18 },
  quickAction: { width: 52, alignItems: 'center', gap: 6 },
  quickIcon: { width: 37, height: 37, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 10, fontFamily: 'Inter_500Medium' },
  bookButton: { height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18 },
  alert: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 14, padding: 13, marginTop: 14 },
  alertText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: 'Inter_600SemiBold' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 16 },
  stat: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
  statValue: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  statLabel: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  section: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 26, marginBottom: 10 },
  sectionLine: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  box: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  rowSub: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 3 },
  empty: { fontSize: 12, fontFamily: 'Inter_400Regular', padding: 14 },
  more: { alignItems: 'center', paddingVertical: 12 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  noteRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  noteText: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  pin: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 14, minHeight: 50, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: 1, borderRadius: 12, height: 46, paddingHorizontal: 12, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 9 },
  button: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tagButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  error: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 12 },
});
