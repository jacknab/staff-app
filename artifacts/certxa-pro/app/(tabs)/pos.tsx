/**
 * POS tab (owner, 2026-10-30): a quick card payment that is not a booking. The owner keys in the amount
 * (and an optional description), links the sale to a client — an existing one, or a new one from just a name,
 * a phone number or an e-mail — and the payment continues in the usual checkout (tip, Tap to Pay or M2, receipt).
 *
 * The sale is a ticket of its own for that client, kept off the calendar: POST /api/quick-sales. If the owner
 * backs out before paying, checkout removes it again (DELETE /api/quick-sales/:id).
 */
import { useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { CertxaApiError } from '@/lib/certxa-api';
import { HelpTitle } from '@/components/HelpTitle';
import { ClientAvatar } from '@/components/ClientAvatar';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
const MAX_CENTS = 10_000_000; // $100,000
const MIN_CENTS = 50; // Stripe's smallest card payment

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
const digitsOnly = (value: string) => value.replace(/\D/g, '');

type Picked = { customerId: number; name: string; phone: string; email: string };

export default function PosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { clients, addQuickClient } = useBookingData();
  const [cents, setCents] = useState(0);
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [stage, setStage] = useState<'amount' | 'client'>('amount');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const press = (key: string) => {
    setError('');
    if (key === 'back') { setCents((c) => Math.floor(c / 10)); return; }
    setCents((c) => {
      const next = c * 10 + Number(key);
      return next > MAX_CENTS ? c : next;
    });
  };

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digitsOnly(q);
    const list = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (qDigits.length >= 3 && digitsOnly(c.phone).includes(qDigits)))
      : clients;
    return list.slice(0, 50);
  }, [clients, search]);

  const emailOk = !email.trim() || /^\S+@\S+\.\S+$/.test(email.trim());
  const phoneOk = !phone.trim() || digitsOnly(phone).length >= 10;
  const hasNewClient = !!(name.trim() || email.trim() || phone.trim());
  const canBegin = !busy && (picked !== null || (hasNewClient && emailOk && phoneOk));

  const reset = () => {
    setCents(0); setDescription(''); setEditingDescription(false); setStage('amount');
    setName(''); setEmail(''); setPhone(''); setPicked(null); setChoosing(false); setSearch(''); setError('');
  };

  const begin = async () => {
    if (!canBegin) return;
    setBusy(true); setError('');
    try {
      let client = picked;
      if (!client) {
        try {
          const created = await addQuickClient({ name, phone, email });
          client = { customerId: created.customerId, name: created.name, phone: created.phone, email: created.email ?? '' };
        } catch (cause) {
          // That phone number already belongs to a client: use that client.
          const existing = cause instanceof CertxaApiError && cause.status === 409
            ? clients.find((c) => digitsOnly(c.phone).slice(-10) === digitsOnly(phone).slice(-10))
            : undefined;
          if (!existing) throw cause;
          client = { customerId: existing.customerId, name: existing.name, phone: existing.phone, email: existing.email ?? '' };
        }
      }
      const sale = await api.post<{ id: number }>('/api/quick-sales', {
        customerId: client.customerId, amountCents: cents, ...(description.trim() ? { description: description.trim() } : {}),
      });
      router.push({
        pathname: '/(tabs)/checkout',
        params: {
          appointmentId: String(sale.id), amountCents: String(cents), clientName: client.name,
          serviceName: description.trim() || 'Quick sale', phone: client.phone, email: client.email, quickSale: '1',
        },
      });
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the sale. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'amount') {
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];
    return (
      <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]}>
        <AppBackground />
        <StatusBar barStyle="dark-content" />
        <View style={styles.pageHeader}><HelpTitle help="pos" style={[styles.pageTitle, { color: colors.foreground }]}>POS</HelpTitle></View>
        <View style={styles.amountArea}>
          <Text testID="pos-amount" style={[styles.amount, { color: cents > 0 ? colors.foreground : colors.mutedForeground }]} adjustsFontSizeToFit numberOfLines={1}>{dollars(cents)}</Text>
          {editingDescription ? (
            <TextInput testID="pos-description" autoFocus value={description} onChangeText={(v) => setDescription(v.slice(0, 60))}
              onBlur={() => setEditingDescription(false)} onSubmitEditing={() => setEditingDescription(false)} returnKeyType="done"
              placeholder="What is this for?" placeholderTextColor={colors.mutedForeground}
              style={[styles.descriptionInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
          ) : (
            <TouchableOpacity testID="pos-add-description" onPress={() => setEditingDescription(true)} style={styles.descriptionButton}>
              <Text style={[styles.descriptionText, { color: description ? colors.foreground : colors.mutedForeground }]}>{description || '+ Description'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.keypad}>
          {keys.map((key, i) => key === '' ? <View key={`blank-${i}`} style={styles.key} /> : (
            <TouchableOpacity key={key} testID={`pos-key-${key}`} onPress={() => press(key)} onLongPress={key === 'back' ? () => setCents(0) : undefined}
              accessibilityLabel={key === 'back' ? 'Delete' : key}
              style={[styles.key, key !== 'back' && { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              {key === 'back' ? <Feather name="delete" size={24} color={colors.foreground} /> : <Text style={[styles.keyText, { color: colors.foreground }]}>{key}</Text>}
            </TouchableOpacity>
          ))}
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive ?? '#B42318' }]}>{error}</Text> : null}
        <TouchableOpacity testID="pos-next" disabled={cents < MIN_CENTS}
          onPress={() => { setEditingDescription(false); setStage('client'); }}
          style={[styles.primary, { marginBottom: insets.bottom + 70, backgroundColor: cents >= MIN_CENTS ? colors.primary : colors.muted }]}>
          <Text style={[styles.primaryText, { color: cents >= MIN_CENTS ? colors.primaryForeground : colors.mutedForeground }]}>Next</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="pos-back" onPress={() => (choosing ? setChoosing(false) : setStage('amount'))} style={styles.headerBack} accessibilityLabel="Back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
          <Text style={[styles.headerAmount, { color: colors.foreground }]}>{dollars(cents)}</Text>
        </TouchableOpacity>
        {description ? <Text numberOfLines={1} style={[styles.headerNote, { color: colors.mutedForeground }]}>{description}</Text> : null}
      </View>

      {choosing ? (
        <View style={styles.chooser}>
          <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={18} color={colors.mutedForeground} />
            <TextInput testID="pos-client-search" autoFocus value={search} onChangeText={setSearch} placeholder="Search name, phone or e-mail"
              placeholderTextColor={colors.mutedForeground} autoCorrect={false} autoCapitalize="none" style={[styles.searchInput, { color: colors.foreground }]} />
          </View>
          <FlatList data={results} keyExtractor={(c) => c.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
            ListEmptyComponent={<Text style={[styles.empty, { color: colors.mutedForeground }]}>{search ? 'No client matches.' : 'No clients yet.'}</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity testID={`pos-client-${item.customerId}`} onPress={() => {
                setPicked({ customerId: item.customerId, name: item.name, phone: item.phone, email: item.email ?? '' });
                setChoosing(false); setSearch('');
              }} style={[styles.clientRow, { borderBottomColor: colors.border }]}>
                <ClientAvatar clientId={item.customerId} avatarUrl={item.avatarUrl} initials={item.initials} style={[styles.initials, { backgroundColor: colors.secondary }]} textStyle={[styles.initialsText, { color: colors.primary }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.clientName, { color: colors.foreground }]}>{item.name}</Text>
                  {item.phone || item.email ? <Text style={[styles.clientMeta, { color: colors.mutedForeground }]}>{item.phone || item.email}</Text> : null}
                </View>
              </TouchableOpacity>
            )} />
        </View>
      ) : (
        <View style={[styles.clientArea, { paddingBottom: insets.bottom + 70 }]}>
          <HelpTitle help="pos" style={[styles.title, { color: colors.foreground }]}>Who is this sale for?</HelpTitle>
          {picked ? (
            <View testID="pos-picked" style={[styles.card, styles.pickedRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="user" size={20} color={colors.mutedForeground} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.clientName, { color: colors.foreground }]}>{picked.name}</Text>
                {picked.phone || picked.email ? <Text style={[styles.clientMeta, { color: colors.mutedForeground }]}>{picked.phone || picked.email}</Text> : null}
              </View>
              <TouchableOpacity testID="pos-clear-client" onPress={() => setPicked(null)} accessibilityLabel="Remove client"><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Field icon="user" testID="pos-name" value={name} onChange={setName} placeholder="Name" colors={colors} autoCapitalize="words" />
              <Field icon="mail" testID="pos-email" value={email} onChange={setEmail} placeholder="E-mail" colors={colors} keyboardType="email-address" divider />
              <Field icon="phone" testID="pos-phone" value={phone} onChange={(v) => setPhone(v.replace(/[^\d()+\-\s]/g, '').slice(0, 20))} placeholder="Phone" colors={colors} keyboardType="phone-pad" divider />
            </View>
          )}
          {!picked ? <Text style={[styles.hint, { color: !emailOk || !phoneOk ? (colors.destructive ?? '#B42318') : colors.mutedForeground }]}>
            {!emailOk ? 'Check the e-mail address.' : !phoneOk ? 'Enter the full phone number.' : 'A name, phone number or e-mail is enough to add a new client.'}
          </Text> : null}
          <TouchableOpacity testID="pos-select-existing" onPress={() => setChoosing(true)} style={styles.linkButton}>
            <Text style={[styles.link, { color: colors.primary }]}>{picked ? 'Choose a different client' : 'Or select an existing client'}</Text>
          </TouchableOpacity>
          {error ? <Text style={[styles.error, { color: colors.destructive ?? '#B42318' }]}>{error}</Text> : null}
          <TouchableOpacity testID="pos-begin" disabled={!canBegin} onPress={() => void begin()}
            style={[styles.primary, { marginTop: 'auto', backgroundColor: canBegin ? colors.primary : colors.muted }]}>
            {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryText, { color: canBegin ? colors.primaryForeground : colors.mutedForeground }]}>Begin transaction</Text>}
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Field({ icon, value, onChange, placeholder, colors, testID, keyboardType, autoCapitalize, divider }: {
  icon: 'user' | 'mail' | 'phone'; value: string; onChange: (v: string) => void; placeholder: string; testID: string;
  colors: ReturnType<typeof useColors>; keyboardType?: 'email-address' | 'phone-pad'; autoCapitalize?: 'words'; divider?: boolean;
}) {
  return (
    <View style={[styles.field, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Feather name={icon} size={19} color={colors.mutedForeground} />
      <TextInput testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? 'none'} autoCorrect={false} style={[styles.fieldInput, { color: colors.foreground }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageHeader: { height: 60, paddingHorizontal: 20, alignItems: 'flex-start', justifyContent: 'center' },
  pageTitle: { fontSize: 38, fontFamily: 'Inter_700Bold', letterSpacing: -0.8 },
  amountArea: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 24, minHeight: 230 },
  amount: { fontSize: 64, letterSpacing: -2, fontFamily: 'Inter_500Medium' },
  descriptionButton: { paddingVertical: 8, paddingHorizontal: 12 },
  descriptionText: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  descriptionInput: { marginTop: 6, minWidth: 240, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 42, fontSize: 17, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 44, rowGap: 16, columnGap: 22, marginTop: 'auto' },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 28, fontFamily: 'Inter_500Medium' },
  primary: { height: 54, marginHorizontal: 24, marginTop: 24, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  error: { textAlign: 'center', fontSize: 16, marginTop: 12, paddingHorizontal: 24, fontFamily: 'Inter_500Medium' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 50, gap: 8 },
  headerBack: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  headerAmount: { fontSize: 20, fontFamily: 'Inter_600SemiBold' },
  headerNote: { flex: 1, textAlign: 'right', fontSize: 16, fontFamily: 'Inter_400Regular' },
  clientArea: { flex: 1, paddingHorizontal: 20, paddingTop: 24 },
  title: { fontSize: 23, letterSpacing: -0.4, fontFamily: 'Inter_600SemiBold', marginBottom: 16 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden', ...cardShadow },
  field: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, height: 56 },
  fieldInput: { flex: 1, fontSize: 18, fontFamily: 'Inter_400Regular', height: '100%' },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  hint: { fontSize: 15, marginTop: 10, textAlign: 'center', fontFamily: 'Inter_400Regular' },
  linkButton: { alignSelf: 'center', paddingVertical: 12 },
  link: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  chooser: { flex: 1, paddingHorizontal: 16 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 46, marginTop: 8, marginBottom: 6 },
  searchInput: { flex: 1, fontSize: 17, fontFamily: 'Inter_400Regular', height: '100%' },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  initials: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  initialsText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  clientName: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  clientMeta: { fontSize: 15, marginTop: 2, fontFamily: 'Inter_400Regular' },
  empty: { textAlign: 'center', marginTop: 30, fontSize: 17 },
});
