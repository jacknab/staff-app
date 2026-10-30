import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';

/**
 * Settings → Client notifications (owner, 2026-10-30): the website's Settings › Client Notifications in native code —
 * appointment reminders, booking confirmations, review requests (by text, e-mail or both, each with its own wording),
 * cancellation replies, and checking which client numbers can receive texts. Same server settings as the website:
 *   GET · PUT /api/sms-settings/:storeId and /api/mail-settings/:storeId
 *   GET /api/clients/phone-types/summary · POST /api/clients/phone-types/backfill
 * Review requests always open Certxa's own review form (Solo plan, owner 2026-10-30): reviews show on the booking
 * site and in Reviews, where the owner replies — so there is no Google review link here.
 */
type Channel = {
  bookingConfirmationEnabled: boolean; reminderEnabled: boolean; reminderHoursBefore: number; reviewRequestEnabled: boolean;
  googleReviewUrl: string; confirmationTemplate: string; reminderTemplate: string; reviewTemplate: string;
};
type Sms = Channel & { smsCancellationEnabled: boolean; reviewRequestEveryVisits: number };
type PhoneTypes = { total: number; unverified: number; mobile: number; voip: number; landline: number };

// The website's defaults (artifacts/booking/src/pages/settings/ClientNotifications.tsx), so a new account reads the same.
const SMS_DEFAULTS: Sms = {
  bookingConfirmationEnabled: true, reminderEnabled: true, reminderHoursBefore: 24, reviewRequestEnabled: true, googleReviewUrl: '',
  confirmationTemplate: 'Hi {customerName}, your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}. See you then!',
  reminderTemplate: "Hi {customerName}, reminder: your appt at {storeName} is on {appointmentDate} at {appointmentTime}. If you can't make it, reply and tell us.",
  reviewTemplate: "Hi {customerName}, thank you for visiting {storeName}! We'd love your feedback. Leave us a review: {reviewUrl}",
  smsCancellationEnabled: true, reviewRequestEveryVisits: 3,
};
const MAIL_DEFAULTS: Channel = {
  bookingConfirmationEnabled: false, reminderEnabled: false, reminderHoursBefore: 24, reviewRequestEnabled: false, googleReviewUrl: '',
  confirmationTemplate: '<p>Hi {customerName},</p>\n<p>Your appointment at {storeName} is confirmed for {appointmentDate} at {appointmentTime}.</p>\n<p>See you then!</p>',
  reminderTemplate: '<p>Hi {customerName},</p>\n<p>This is a reminder of your appointment at {storeName} on {appointmentDate} at {appointmentTime}.</p>\n<p>Reply to this email to confirm or cancel.</p>',
  reviewTemplate: "<p>Hi {customerName},</p>\n<p>Thank you for visiting {storeName}! We'd love your feedback.</p>\n<p><a href=\"{reviewUrl}\">Leave us a review</a></p>",
};
const HOURS = [1, 2, 3, 4, 6, 12, 24, 48, 72];
const hoursLabel = (h: number) => (h === 1 ? '1 hour' : h < 24 ? `${h} hours` : h === 24 ? '1 day' : `${h / 24} days`);
const REVIEW_FREQUENCY = [
  { value: 1, label: 'Every visit' }, { value: 2, label: 'Every 2nd' }, { value: 3, label: 'Every 3rd' }, { value: 4, label: 'Every 4th' },
  { value: 5, label: 'Every 5th' }, { value: 6, label: 'Every 6th' }, { value: 10, label: 'Every 10th' },
];
const BOOKING_VARS = '{customerName}, {storeName}, {appointmentDate}, {appointmentTime}, {serviceName}';
const REVIEW_VARS = '{customerName}, {storeName}, {reviewUrl}';
const TEXT_LIMIT = 160;

function pick<T extends Channel>(src: Partial<T> | null | undefined, base: T): T {
  if (!src) return { ...base };
  const out = { ...base } as T;
  for (const key of Object.keys(base) as (keyof T)[]) if (src[key] !== undefined && src[key] !== null) out[key] = src[key] as T[keyof T];
  return out;
}

export default function NotificationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [storeId, setStoreId] = useState<number | null>(null);
  const [sms, setSms] = useState<Sms>(SMS_DEFAULTS);
  const [mail, setMail] = useState<Channel>(MAIL_DEFAULTS);
  const [baseline, setBaseline] = useState('');
  const [phones, setPhones] = useState<PhoneTypes | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPhones = useCallback(async (id: number) => {
    setPhones(await api.get<PhoneTypes>(`/api/clients/phone-types/summary?storeId=${id}`).catch(() => null));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stores = await api.get<{ id: number }[]>('/api/stores');
        const id = Array.isArray(stores) && stores[0] ? Number(stores[0].id) : null;
        if (!id) throw new Error('No business was found for this account.');
        setStoreId(id);
        const [s, m] = await Promise.all([
          api.get<Partial<Sms> | null>(`/api/sms-settings/${id}`),
          api.get<Partial<Channel> | null>(`/api/mail-settings/${id}`),
        ]);
        const nextSms = pick<Sms>(s, SMS_DEFAULTS);
        const nextMail = pick<Channel>(m, MAIL_DEFAULTS);
        setSms(nextSms); setMail(nextMail); setBaseline(JSON.stringify({ s: nextSms, m: nextMail }));
        void loadPhones(id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not load your notification settings.');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadPhones]);

  const dirty = useMemo(() => baseline !== '' && baseline !== JSON.stringify({ s: sms, m: mail }), [baseline, sms, mail]);
  const change = () => { setNotice(''); setError(''); };
  const setBoth = (patch: Partial<Channel>) => { change(); setSms((s) => ({ ...s, ...patch })); setMail((m) => ({ ...m, ...patch })); };

  const save = async () => {
    if (!storeId || saving) return;
    setSaving(true); change();
    try {
      await Promise.all([api.put(`/api/sms-settings/${storeId}`, sms), api.put(`/api/mail-settings/${storeId}`, mail)]);
      setBaseline(JSON.stringify({ s: sms, m: mail }));
      setNotice('Client notifications saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    if (!storeId || verifying) return;
    setVerifying(true);
    try {
      const r = await api.post<{ checked: number; landlinesFound: number }>('/api/clients/phone-types/backfill', { storeId });
      await loadPhones(storeId);
      Alert.alert(
        r?.checked ? `Checked ${r.checked} number${r.checked === 1 ? '' : 's'}` : 'All numbers already verified',
        r?.checked ? (r.landlinesFound > 0 ? `Found ${r.landlinesFound} landline${r.landlinesFound === 1 ? '' : 's'} — they'll be skipped for texts.` : 'No landlines found in this batch.') : undefined,
      );
    } catch (cause) {
      Alert.alert('Verification failed', cause instanceof Error ? cause.message : 'Try again.');
    } finally {
      setVerifying(false);
    }
  };

  const back = () => {
    if (!dirty) return router.back();
    Alert.alert('Leave without saving?', 'Your changes to client notifications are not saved.', [
      { text: 'Stay', style: 'cancel' }, { text: 'Leave', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const toggle = (id: string, icon: keyof typeof Feather.glyphMap, label: string, value: boolean, onChange: (v: boolean) => void) => (
    <ToggleRow colors={colors} id={id} icon={icon} label={label} value={value} onChange={(v) => { change(); onChange(v); }} />
  );
  const customize = (id: string, textOn: boolean, mailOn: boolean, textKey: TemplateKey, vars: string) => (
    <Customize colors={colors} id={id} textOn={textOn} mailOn={mailOn} vars={vars} shown={!!open[id]} onToggle={() => setOpen((o) => ({ ...o, [id]: !o[id] }))}
      text={sms[textKey]} email={mail[textKey]}
      onText={(v) => { change(); setSms((x) => ({ ...x, [textKey]: v.slice(0, TEXT_LIMIT) })); }}
      onEmail={(v) => { change(); setMail((x) => ({ ...x, [textKey]: v })); }} />
  );

  const reminderOn = sms.reminderEnabled || mail.reminderEnabled;

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="notifications-back" accessibilityLabel="Back" onPress={back} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Client notifications</Text>
        <View style={styles.headerButton} />
      </View>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 24 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.intro, { color: colors.mutedForeground }]}>Confirmations, reminders and review requests — by text, e-mail or both.</Text>

            <Section colors={colors} icon="bell" title="Appointment reminder" hint="Send clients a reminder before their appointment.">
              {toggle("reminder-text", "message-square", "Text", sms.reminderEnabled, (v) => setSms((s) => ({ ...s, reminderEnabled: v })))}
              {toggle("reminder-email", "mail", "E-mail", mail.reminderEnabled, (v) => setMail((m) => ({ ...m, reminderEnabled: v })))}
              {reminderOn && (
                <View>
                  <Text style={[styles.label, { color: colors.foreground }]}>Send it before the appointment</Text>
                  <Chips colors={colors} onTouch={change} id="hours" options={(HOURS.includes(sms.reminderHoursBefore) ? HOURS : [...HOURS, sms.reminderHoursBefore].sort((a, b) => a - b)).map((h) => ({ value: h, label: hoursLabel(h) }))}
                    value={sms.reminderHoursBefore} onPick={(h) => setBoth({ reminderHoursBefore: h })} />
                </View>
              )}
              {customize("reminder", sms.reminderEnabled, mail.reminderEnabled, "reminderTemplate", BOOKING_VARS)}
            </Section>

            <Section colors={colors} icon="calendar" title="Booking confirmation" hint="Confirm the appointment as soon as it's booked.">
              {toggle("confirmation-text", "message-square", "Text", sms.bookingConfirmationEnabled, (v) => setSms((s) => ({ ...s, bookingConfirmationEnabled: v })))}
              {toggle("confirmation-email", "mail", "E-mail", mail.bookingConfirmationEnabled, (v) => setMail((m) => ({ ...m, bookingConfirmationEnabled: v })))}
              {customize("confirmation", sms.bookingConfirmationEnabled, mail.bookingConfirmationEnabled, "confirmationTemplate", BOOKING_VARS)}
            </Section>

            <Section colors={colors} icon="star" title="Review request" hint="Ask clients to review their visit. Reviews show on your booking site and in Reviews, where you can reply.">
              {toggle("review-text", "message-square", "Text", sms.reviewRequestEnabled, (v) => setSms((s) => ({ ...s, reviewRequestEnabled: v })))}
              {toggle("review-email", "mail", "E-mail", mail.reviewRequestEnabled, (v) => setMail((m) => ({ ...m, reviewRequestEnabled: v })))}
              {sms.reviewRequestEnabled && (
                <View>
                  <Text style={[styles.label, { color: colors.foreground }]}>How often to text</Text>
                  <Chips colors={colors} onTouch={change} id="frequency" options={REVIEW_FREQUENCY} value={sms.reviewRequestEveryVisits} onPick={(v) => setSms((s) => ({ ...s, reviewRequestEveryVisits: v }))} />
                  <Text style={[styles.small, { color: colors.mutedForeground, marginTop: 6 }]}>A new client is asked after their first visit. After that, a client is asked again only once this many visits have passed since the last review text, so regulars aren't asked every time.</Text>
                </View>
              )}
              {customize("review", sms.reviewRequestEnabled, mail.reviewRequestEnabled, "reviewTemplate", REVIEW_VARS)}
            </Section>

            <Section colors={colors} icon="x-circle" title="Cancellation replies" hint="Recognize clear cancellation requests in clients' text replies.">
              {toggle("cancellation", "message-square", "Text", sms.smsCancellationEnabled, (v) => setSms((s) => ({ ...s, smsCancellationEnabled: v })))}
              {sms.smsCancellationEnabled ? (
                <Text style={[styles.small, { color: colors.mutedForeground }]}>Certxa recognizes clear replies such as "I can't make it" or "Please cancel my appointment", cancels the nearest upcoming appointment, and sends a confirmation. Unclear messages stay in your inbox for you to read.</Text>
              ) : null}
            </Section>

            <Section colors={colors} icon="smartphone" title="Phone number verification" hint="Checks each client's number with their carrier to confirm it can receive a text — landlines can't, so skipping them avoids wasted texts.">
              {phones && phones.total > 0 ? (
                <Text style={[styles.small, { color: colors.mutedForeground }]}>
                  {phones.mobile + phones.voip} can receive texts{phones.landline > 0 ? ` · ${phones.landline} landline${phones.landline === 1 ? '' : 's'} (skipped)` : ''}{phones.unverified > 0 ? ` · ${phones.unverified} not yet checked` : ''}
                </Text>
              ) : (
                <Text style={[styles.small, { color: colors.mutedForeground }]}>No client phone numbers yet.</Text>
              )}
              <TouchableOpacity testID="notifications-verify" disabled={verifying || !phones?.unverified} onPress={() => void verify()}
                style={[styles.outlineButton, { borderColor: colors.border, opacity: verifying || !phones?.unverified ? 0.5 : 1 }]}>
                {verifying ? <ActivityIndicator color={colors.foreground} /> : <Text style={[styles.buttonText, { color: colors.foreground }]}>Verify phone numbers</Text>}
              </TouchableOpacity>
              {phones && phones.total > 0 && !phones.unverified ? <Text style={[styles.small, { color: colors.mutedForeground }]}>All numbers verified.</Text> : null}
            </Section>

            {error ? <Text style={[styles.message, { color: colors.destructive }]}>{error}</Text> : null}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12, borderColor: colors.border, backgroundColor: colors.background }]}>
            {notice ? <Text style={[styles.small, { color: colors.mutedForeground, textAlign: 'center', marginBottom: 8 }]}>{notice}</Text>
              : dirty ? <Text style={[styles.small, { color: colors.mutedForeground, textAlign: 'center', marginBottom: 8 }]}>Unsaved changes</Text> : null}
            <TouchableOpacity testID="notifications-save" disabled={!dirty || saving} onPress={() => void save()}
              style={[styles.button, { backgroundColor: dirty ? colors.primary : colors.muted }]}>
              {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: dirty ? colors.primaryForeground : colors.mutedForeground }]}>Save</Text>}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

type Colors = ReturnType<typeof useColors>;
type TemplateKey = 'confirmationTemplate' | 'reminderTemplate' | 'reviewTemplate';

// Defined outside the screen so they keep their identity between renders — otherwise every keystroke would rebuild
// the text boxes inside them and close the keyboard.
function Section({ colors, icon, title, hint, children }: { colors: Colors; icon: keyof typeof Feather.glyphMap; title: string; hint: string; children: ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.sectionHead}>
        <Feather name={icon} size={17} color={colors.mutedForeground} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>{hint}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function ToggleRow({ colors, id, icon, label, value, onChange }: { colors: Colors; id: string; icon: keyof typeof Feather.glyphMap; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.toggle, { borderColor: colors.border }]}>
      <Feather name={icon} size={15} color={colors.mutedForeground} />
      <Text style={[styles.toggleText, { color: colors.foreground }]}>{label}</Text>
      <Switch testID={`notifications-${id}`} value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

function Chips<T extends string | number>({ colors, onTouch, id, options, value, onPick }: { colors: Colors; onTouch: () => void; id: string; options: { value: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={String(o.value)} testID={`notifications-${id}-${o.value}`} onPress={() => { onTouch(); onPick(o.value); }}
            style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.card }]}>
            <Text style={[styles.chipText, { color: on ? colors.primaryForeground : colors.foreground }]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** "Customize messages": the wording of the text (160 characters) and the e-mail, for whichever channels are on. */
function Customize({ colors, id, textOn, mailOn, vars, shown, onToggle, text, email, onText, onEmail }: {
  colors: Colors; id: string; textOn: boolean; mailOn: boolean; vars: string; shown: boolean; onToggle: () => void;
  text: string; email: string; onText: (v: string) => void; onEmail: (v: string) => void;
}) {
  if (!textOn && !mailOn) return null;
  return (
    <View>
      <TouchableOpacity testID={`notifications-customize-${id}`} onPress={onToggle} style={styles.linkButton}>
        <Text style={[styles.link, { color: colors.primary }]}>{shown ? 'Hide message templates' : 'Customize messages'}</Text>
      </TouchableOpacity>
      {shown && (
        <View style={{ gap: 12 }}>
          {textOn && (
            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>Text message</Text>
              <TextInput testID={`notifications-${id}-text`} multiline value={text} maxLength={TEXT_LIMIT} onChangeText={onText}
                style={[styles.textArea, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]} />
              <View style={styles.counterRow}>
                <Text style={[styles.small, { color: colors.mutedForeground, flex: 1 }]}>Variables: {vars}</Text>
                <Text style={[styles.small, { color: text.length >= TEXT_LIMIT ? colors.destructive : colors.mutedForeground }]}>{text.length}/{TEXT_LIMIT}</Text>
              </View>
            </View>
          )}
          {mailOn && (
            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>E-mail message (HTML)</Text>
              <TextInput testID={`notifications-${id}-email`} multiline autoCapitalize="none" autoCorrect={false} value={email} onChangeText={onEmail}
                style={[styles.textArea, styles.mono, { minHeight: 120, borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]} />
              <Text style={[styles.small, { color: colors.mutedForeground }]}>Variables: {vars}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 14 },
  intro: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular' },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  sectionHead: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  sectionTitle: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  hint: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 2 },
  toggle: { borderWidth: 1, borderRadius: 12, minHeight: 48, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleText: { flex: 1, fontSize: 14, fontFamily: 'Inter_500Medium' },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 4, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 12, height: 48, paddingHorizontal: 12, fontSize: 14, fontFamily: 'Inter_400Regular' },
  textArea: { borderWidth: 1, borderRadius: 12, minHeight: 72, padding: 12, fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', textAlignVertical: 'top' },
  mono: { fontFamily: 'Courier', fontSize: 12 },
  counterRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4 },
  small: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
  linkButton: { paddingVertical: 4 },
  link: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  outlineButton: { height: 46, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  message: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 20, paddingTop: 10 },
  button: { height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
