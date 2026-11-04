/**
 * Packages (owner, 2026-11-04): prepaid visits sold on the pro's Solo website, like 6 Gel Manicures for $150. Each is one
 * service, a number of visits and a price. A client buys online and the visits are saved on their client record; at
 * checkout the booking offers "Use a package visit" (server: routes/siteShop.ts).
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { SelectField } from '@/components/SelectField';
import { HelpTitle } from '@/components/HelpTitle';
import { api, ApiError } from '@/lib/live-api';

type Pack = { id: number; name: string; description: string | null; serviceId: number; serviceName: string; visits: number; priceCents: number; isActive: boolean; regularCents: number; savingsCents: number };
type Sold = { id: number; name: string; clientId: number; clientName: string; visitsTotal: number; visitsLeft: number };
type Shop = { giftCardsOn: boolean; cardsReady: boolean; packages: Pack[]; sold: Sold[] };
const money = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, '')}`;

export default function PackagesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { services } = useBookingData();
  const [shop, setShop] = useState<Shop | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [visits, setVisits] = useState('6');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setShop(await api.get<Shop>('/api/pro/shop')); } catch { setShop((s) => s ?? { giftCardsOn: false, cardsReady: false, packages: [], sold: [] }); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async () => {
    const cents = Math.round(Number(price.replace(/[^0-9.]/g, '')) * 100);
    const count = Number(visits);
    if (!name.trim() || serviceId == null || !(count >= 2 && count <= 50) || !(cents >= 100)) { setError('Enter a name, a service, 2 to 50 visits and a price.'); return; }
    setSaving(true); setError('');
    try {
      await api.post('/api/pro/packages', { name: name.trim(), serviceId, visits: count, priceCents: cents, description: description.trim() || null });
      setAdding(false); setName(''); setServiceId(null); setVisits('6'); setPrice(''); setDescription('');
      await load();
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The package could not be saved.'); }
    finally { setSaving(false); }
  };
  const setOnSale = async (p: Pack, isActive: boolean) => {
    setShop((s) => (s ? { ...s, packages: s.packages.map((x) => (x.id === p.id ? { ...x, isActive } : x)) } : s));
    try { await api.put(`/api/pro/packages/${p.id}`, { isActive }); } catch { void load(); Alert.alert('Packages', 'That could not be saved.'); }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const box = { borderColor: colors.border, backgroundColor: colors.card };
  const chosen = services.find((s) => s.id === serviceId);
  const regular = chosen ? Math.round(Number(chosen.priceValue ?? 0) * 100) * (Number(visits) || 0) : 0;
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="packages">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => (adding ? setAdding(false) : router.back())} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="packages" style={[styles.navTitle, { color: colors.foreground }]}>{adding ? 'New package' : 'Packages'}</HelpTitle>
        {!adding ? <TouchableOpacity onPress={() => setAdding(true)} style={[styles.navSide, { alignItems: 'flex-end' }]} accessibilityLabel="New package" testID="package-add"><Feather name="plus" size={24} color={colors.primary} /></TouchableOpacity> : <View style={styles.navSide} />}
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
        refreshControl={!adding ? <RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} /> : undefined}>
        {adding ? (
          <>
            <TextInput value={name} onChangeText={setName} placeholder="Name, e.g. The Gel Girl Package" placeholderTextColor={colors.mutedForeground} maxLength={80} style={[styles.input, box, { color: colors.foreground }]} testID="package-name" />
            <SelectField testID="package-service" title="Service" placeholder="Choose the service" value={serviceId} onChange={setServiceId} options={services.map((s) => ({ value: s.id, label: s.name }))} />
            <View style={styles.pair}>
              <TextInput value={visits} onChangeText={(v) => setVisits(v.replace(/\D/g, ''))} placeholder="Visits" keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} style={[styles.input, box, styles.half, { color: colors.foreground }]} testID="package-visits" />
              <TextInput value={price} onChangeText={setPrice} placeholder="Price, e.g. 150" keyboardType="decimal-pad" placeholderTextColor={colors.mutedForeground} style={[styles.input, box, styles.half, { color: colors.foreground }]} testID="package-price" />
            </View>
            {regular > 0 ? <Text style={[styles.muted, { color: colors.mutedForeground }]}>Normally {money(regular)} for {visits} visits.</Text> : null}
            <TextInput value={description} onChangeText={setDescription} placeholder="Description (optional)" placeholderTextColor={colors.mutedForeground} maxLength={300} multiline style={[styles.input, styles.area, box, { color: colors.foreground }]} testID="package-description" />
            {error ? <Text style={[styles.muted, { color: colors.destructive }]}>{error}</Text> : null}
            <TouchableOpacity onPress={() => void save()} disabled={saving} style={[styles.button, { backgroundColor: colors.primary }]} testID="package-save">
              {saving ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Save package</Text>}
            </TouchableOpacity>
          </>
        ) : shop == null ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} /> : (
          <>
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>Prepaid visits clients buy on your website. They show there when they're on sale.</Text>
            {!shop.cardsReady ? <Text style={[styles.muted, { color: colors.destructive }]}>Set up card payments first (More › Payments) so clients can buy.</Text> : null}
            {shop.packages.length === 0 ? <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center', marginTop: 30 }]}>No packages yet. Tap + to make one.</Text> : (
              <View style={[styles.list, box]}>
                {shop.packages.map((p, i) => (
                  <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.foreground }]}>{p.name}</Text>
                      <Text style={[styles.muted, { color: colors.mutedForeground }]}>{p.visits} × {p.serviceName} · {money(p.priceCents)}{p.savingsCents > 0 ? ` · saves ${money(p.savingsCents)}` : ''}</Text>
                    </View>
                    <Switch value={p.isActive} onValueChange={(v) => void setOnSale(p, v)} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel={`${p.name} on sale`} />
                  </View>
                ))}
              </View>
            )}
            {shop.sold.length > 0 ? (
              <>
                <Text style={[styles.section, { color: colors.foreground }]}>Bought by clients</Text>
                <View style={[styles.list, box]}>
                  {shop.sold.map((s, i) => (
                    <TouchableOpacity key={s.id} onPress={() => router.push({ pathname: '/client/[id]', params: { id: String(s.clientId) } })} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.rowTitle, { color: colors.foreground }]}>{s.clientName}</Text>
                        <Text style={[styles.muted, { color: colors.mutedForeground }]}>{s.name} · {s.visitsLeft} of {s.visitsTotal} visits left</Text>
                      </View>
                      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 18, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 12, paddingTop: 6 },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  section: { fontSize: 16, fontFamily: 'Inter_600SemiBold', marginTop: 10 },
  input: { borderWidth: 1, borderRadius: 14, height: 54, paddingHorizontal: 16, fontSize: 16, fontFamily: 'Inter_400Regular' },
  area: { height: 96, paddingTop: 14, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  button: { height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  list: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
