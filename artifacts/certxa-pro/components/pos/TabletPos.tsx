/**
 * The tablet POS (owner, 2026-11-19), laid out like the POS tab of the website's /barber screen (pages/barber/
 * CheckoutMode.tsx, used as a reference only) in the app's own light look: the ticket on the left, a keypad in the
 * middle, the services and products to tap on the right. Turned upright, the keypad sits under the ticket.
 *
 * CHARGE makes the sale a ticket of its own for the client (POST /api/quick-sales with its lines and products, kept off
 * the calendar) and the payment continues in the usual checkout (tip, card, cash, gift card, receipt), as on the phone.
 */
import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { CertxaApiError } from '@/lib/certxa-api';
import { HelpTitle } from '@/components/HelpTitle';
import { SelectField } from '@/components/SelectField';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Service = { id: number; name: string; priceCents: number; duration: number; categoryId: number | null };
type Product = { id: number; name: string; priceCents: number; stock: number | null };
type Line = { key: string; label: string; priceCents: number; kind: 'service' | 'amount' | 'product'; serviceId?: number; productId?: number };
type Client = { customerId: number; name: string; phone: string; email: string };

const MAX_CENTS = 10_000_000;
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const digitsOnly = (value: string) => value.replace(/\D/g, '');
const ALL = 'all';
const PRODUCTS = 'products';

export function TabletPos() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width > height;
  const { clients, addQuickClient } = useBookingData();

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      api.get<any[]>('/api/services').catch(() => []),
      api.get<any[]>('/api/service-categories').catch(() => []),
      api.get<any[]>('/api/products').catch(() => []),
    ]).then(([rows, cats, prods]) => {
      const list = Array.isArray(rows) ? rows : [];
      // A service with options is sold by its options ("Haircut · Long"), not by itself.
      const parents = new Set(list.filter((s) => s.parentServiceId).map((s) => Number(s.parentServiceId)));
      const byId = new Map(list.map((s) => [Number(s.id), s]));
      setServices(list.filter((s) => !parents.has(Number(s.id))).map((s) => {
        const parent = s.parentServiceId ? byId.get(Number(s.parentServiceId)) : null;
        return {
          id: Number(s.id), name: parent ? `${parent.name} · ${s.optionLabel || s.name}` : String(s.name),
          priceCents: Math.round(Number(s.price) * 100) || 0, duration: Number(s.duration) || 0,
          categoryId: s.categoryId ?? parent?.categoryId ?? null,
        };
      }).sort((a, b) => a.name.localeCompare(b.name)));
      setCategories((Array.isArray(cats) ? cats : []).map((c) => ({ id: Number(c.id), name: String(c.name) })));
      setProducts((Array.isArray(prods) ? prods : []).map((p) => ({ id: Number(p.id), name: String(p.name ?? ''), priceCents: Math.round(Number(p.price) * 100) || 0, stock: p.stock == null ? null : Number(p.stock) })));
    }).finally(() => setLoading(false));
  }, []);

  // ── The ticket ──
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const add = (line: Omit<Line, 'key'>) => { setError(''); setLines((cur) => [...cur, { ...line, key: `${Date.now()}-${cur.length}` }]); };
  const removeOne = (key: string) => setLines((cur) => cur.filter((l) => l.key !== key));
  // Same item twice shows once with its count (as /barber does); × takes one off.
  const grouped = useMemo(() => {
    const groups: { id: string; line: Line; count: number; lastKey: string }[] = [];
    for (const l of lines) {
      const id = l.kind === 'amount' ? l.key : `${l.kind}-${l.serviceId ?? l.productId}`;
      const g = groups.find((x) => x.id === id);
      if (g) { g.count += 1; g.lastKey = l.key; } else groups.push({ id, line: l, count: 1, lastKey: l.key });
    }
    return groups;
  }, [lines]);
  const servicesCents = lines.filter((l) => l.kind !== 'product').reduce((n, l) => n + l.priceCents, 0);
  const productsCents = lines.filter((l) => l.kind === 'product').reduce((n, l) => n + l.priceCents, 0);
  const totalCents = servicesCents + productsCents;
  const clear = () => { setLines([]); setClient(null); setCents(0); setError(''); };

  // ── The keypad: an amount, added to the ticket as a line ──
  const [cents, setCents] = useState(0);
  const press = (key: string) => {
    setError('');
    if (key === 'C') { setCents(0); return; }
    if (key === 'back') { setCents((c) => Math.floor(c / 10)); return; }
    setCents((c) => { const next = c * (key === '00' ? 100 : 10) + (key === '00' ? 0 : Number(key)); return next > MAX_CENTS ? c : next; });
  };
  const addAmount = () => { if (cents <= 0) return; add({ label: 'Amount', priceCents: cents, kind: 'amount' }); setCents(0); };

  // ── The catalog ──
  const [section, setSection] = useState<string>(ALL);
  const sectionOptions = [
    { value: ALL, label: 'All services' },
    ...categories.filter((c) => services.some((s) => s.categoryId === c.id)).map((c) => ({ value: String(c.id), label: c.name })),
    ...(products.length ? [{ value: PRODUCTS, label: 'Products' }] : []),
  ];
  const tiles = section === PRODUCTS
    ? products.map((p) => ({ key: `p${p.id}`, title: p.name, price: p.priceCents, hint: p.stock != null ? `${p.stock} in stock` : 'Product', onPress: () => add({ label: p.name, priceCents: p.priceCents, kind: 'product', productId: p.id }) }))
    : services.filter((s) => section === ALL || String(s.categoryId) === section)
      .map((s) => ({ key: `s${s.id}`, title: s.name, price: s.priceCents, hint: s.duration ? `${s.duration} min` : 'Service', onPress: () => add({ label: s.name, priceCents: s.priceCents, kind: 'service', serviceId: s.id }) }));

  // ── Choosing the client ──
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = digitsOnly(q);
    return (q ? clients.filter((c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q) || (qDigits.length >= 3 && digitsOnly(c.phone).includes(qDigits))) : clients).slice(0, 60);
  }, [clients, search]);
  const pickExisting = (c: (typeof clients)[number]) => { setClient({ customerId: c.customerId, name: c.name, phone: c.phone, email: c.email ?? '' }); setPicking(false); setSearch(''); };
  const addNewClient = async () => {
    if (!newName.trim() && !newPhone.trim()) return;
    setBusy(true); setError('');
    try {
      try {
        const created = await addQuickClient({ name: newName, phone: newPhone, email: '' });
        setClient({ customerId: created.customerId, name: created.name, phone: created.phone, email: created.email ?? '' });
      } catch (cause) {
        // That phone number already belongs to a client: use that client.
        const existing = cause instanceof CertxaApiError && cause.status === 409 ? clients.find((c) => digitsOnly(c.phone).slice(-10) === digitsOnly(newPhone).slice(-10)) : undefined;
        if (!existing) throw cause;
        pickExisting(existing);
      }
      setNewName(''); setNewPhone(''); setPicking(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not add the client.'); }
    finally { setBusy(false); }
  };

  // ── CHARGE ──
  const charge = async () => {
    if (!lines.length || busy) return;
    if (!client) { setPicking(true); return; }
    if (servicesCents > 0 && servicesCents < 50) { setError('A sale must be at least $0.50.'); return; }
    setBusy(true); setError('');
    try {
      const saleLines = lines.filter((l) => l.kind !== 'product').map((l) => ({ label: l.label, priceCents: l.priceCents, ...(l.serviceId ? { serviceId: l.serviceId } : {}) }));
      const counts = new Map<number, number>();
      for (const l of lines) if (l.productId) counts.set(l.productId, (counts.get(l.productId) ?? 0) + 1);
      const sale = await api.post<{ id: number }>('/api/quick-sales', {
        customerId: client.customerId, amountCents: servicesCents,
        ...(saleLines.length ? { lines: saleLines } : {}),
        ...(counts.size ? { products: [...counts].map(([productId, quantity]) => ({ productId, quantity })) } : {}),
      });
      const first = grouped[0]?.line.label ?? 'Sale';
      router.push({
        pathname: '/(tabs)/checkout',
        params: {
          appointmentId: String(sale.id), amountCents: String(servicesCents), clientName: client.name,
          serviceName: grouped.length > 1 ? `${first} + ${grouped.length - 1} more` : first, phone: client.phone, email: client.email, quickSale: '1',
        },
      });
      clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the sale. Please try again.');
    } finally { setBusy(false); }
  };

  const ticket = (
    <View style={[styles.panel, styles.ticket]} testID="tablet-pos-ticket">
      <TouchableOpacity testID="tablet-pos-client" onPress={() => setPicking(true)} style={styles.clientRow}>
        <View style={styles.clientIcon}><Feather name="user" size={22} color={look.violetDeep} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.clientName} numberOfLines={1}>{client ? client.name : 'Choose a client'}</Text>
          <Text style={styles.subtle} numberOfLines={1}>{client ? client.phone || client.email || 'Client' : 'Tap to pick or add one'}</Text>
        </View>
        <Feather name="chevron-right" size={22} color={look.subtle} />
      </TouchableOpacity>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingVertical: 6 }}>
        {grouped.length === 0 ? <Text style={[styles.subtle, styles.empty]}>Tap a service or product, or key in an amount.</Text> : null}
        {grouped.map((g) => (
          <View key={g.id} style={styles.line} testID={`tablet-pos-line-${g.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineTitle} numberOfLines={2}>{g.count > 1 ? `${g.count} × ` : ''}{g.line.label}</Text>
              <Text style={styles.subtle}>{g.line.kind === 'product' ? 'Product' : g.line.kind === 'amount' ? 'Keyed in' : 'Service'}</Text>
            </View>
            <Text style={styles.linePrice}>{money(g.line.priceCents * g.count)}</Text>
            <TouchableOpacity accessibilityLabel={g.count > 1 ? `Remove one ${g.line.label}` : `Remove ${g.line.label}`} onPress={() => removeOne(g.lastKey)} style={styles.remove}>
              <Feather name="x" size={18} color={look.subtle} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      <View style={styles.totals}>
        {productsCents > 0 && servicesCents > 0 ? <>
          <View style={styles.totalRow}><Text style={styles.subtle}>Services</Text><Text style={styles.subtle}>{money(servicesCents)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.subtle}>Products</Text><Text style={styles.subtle}>{money(productsCents)}</Text></View>
        </> : null}
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text testID="tablet-pos-total" style={styles.totalValue}>{money(totalCents)}</Text></View>
        <Text style={styles.subtle}>Tax and tip are added at checkout.</Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actionRow}>
        <TouchableOpacity testID="tablet-pos-clear" onPress={clear} style={[styles.secondaryButton]}><Text style={styles.secondaryText}>CLEAR</Text></TouchableOpacity>
        <TouchableOpacity testID="tablet-pos-charge" disabled={!lines.length || busy} onPress={() => void charge()} style={[styles.chargeButton, (!lines.length || busy) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.chargeText}>CHARGE {money(totalCents)}</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  const keypad = (
    <View style={[styles.panel, styles.keypad, !wide && styles.keypadUnder]} testID="tablet-pos-keypad">
      <View style={styles.display}><Text testID="tablet-pos-display" style={[styles.displayText, { color: cents ? look.heading : look.subtle }]} numberOfLines={1} adjustsFontSizeToFit>{money(cents)}</Text></View>
      <View style={styles.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'].map((k) => (
          <TouchableOpacity key={k} testID={`tablet-pos-key-${k}`} onPress={() => press(k)} style={styles.key} accessibilityLabel={k === 'back' ? 'Delete' : k}>
            {k === 'back' ? <Feather name="delete" size={26} color={look.heading} /> : <Text style={styles.keyText}>{k}</Text>}
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity testID="tablet-pos-key-C" onPress={() => press('C')} style={styles.secondaryButton}><Text style={styles.secondaryText}>C</Text></TouchableOpacity>
        <TouchableOpacity testID="tablet-pos-add-amount" disabled={cents <= 0} onPress={addAmount} style={[styles.addAmount, cents <= 0 && { opacity: 0.5 }]}><Text style={styles.chargeText}>ADD AMOUNT</Text></TouchableOpacity>
      </View>
    </View>
  );

  const catalog = (
    <View style={[styles.panel, styles.catalog]} testID="tablet-pos-catalog">
      <View style={{ marginBottom: 12 }}>
        <SelectField testID="tablet-pos-section" title="Show" value={section} options={sectionOptions} onChange={(v) => setSection(String(v))} />
      </View>
      {loading ? <ActivityIndicator color={look.violet} style={{ marginTop: 30 }} /> : (
        <FlatList data={tiles} key={wide ? 'w' : 'n'} numColumns={wide ? 3 : 2} keyExtractor={(t) => t.key} contentContainerStyle={{ paddingBottom: 110 }}
          columnWrapperStyle={{ gap: 12 }} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          ListEmptyComponent={<Text style={[styles.subtle, styles.empty]}>{section === PRODUCTS ? 'No products yet.' : 'No services yet. Add them in Services.'}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity testID={`tablet-pos-tile-${item.key}`} onPress={item.onPress} activeOpacity={0.75} style={styles.tile}>
              <Text style={styles.tileTitle} numberOfLines={2}>{item.title}</Text>
              <View style={styles.tileFoot}>
                <Text style={styles.tilePrice}>{money(item.price)}</Text>
                <Text style={styles.subtle} numberOfLines={1}>{item.hint}</Text>
              </View>
            </TouchableOpacity>
          )} />
      )}
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <AppBackground />
      <View style={styles.header}><HelpTitle help="pos" style={styles.title}>POS</HelpTitle></View>
      {wide ? (
        <View style={styles.columns}>{ticket}{keypad}{catalog}</View>
      ) : (
        <View style={styles.columns}>
          <View style={styles.leftColumn}>{ticket}{keypad}</View>
          {catalog}
        </View>
      )}

      <Modal visible={picking} transparent animationType="fade" onRequestClose={() => setPicking(false)} supportedOrientations={['portrait', 'landscape']}>
        <TouchableOpacity activeOpacity={1} onPress={() => setPicking(false)} style={styles.backdrop}>
          <TouchableOpacity activeOpacity={1} onPress={() => undefined} style={styles.sheet} testID="tablet-pos-client-sheet">
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Client</Text>
              <TouchableOpacity accessibilityLabel="Close" onPress={() => setPicking(false)} style={styles.remove}><Feather name="x" size={24} color={look.heading} /></TouchableOpacity>
            </View>
            <TextInput testID="tablet-pos-client-search" value={search} onChangeText={setSearch} placeholder="Search name, phone or e-mail" placeholderTextColor={look.subtle} style={styles.input} />
            <FlatList data={results} keyExtractor={(c) => String(c.customerId)} style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity testID={`tablet-pos-client-${item.customerId}`} onPress={() => pickExisting(item)} style={styles.clientPick}>
                  <Text style={styles.lineTitle}>{item.name}</Text><Text style={styles.subtle}>{item.phone || item.email}</Text>
                </TouchableOpacity>
              )} />
            <Text style={[styles.lineTitle, { marginTop: 16 }]}>New client</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TextInput testID="tablet-pos-new-name" value={newName} onChangeText={setNewName} placeholder="Name" placeholderTextColor={look.subtle} style={[styles.input, styles.half]} autoCapitalize="words" />
              <TextInput testID="tablet-pos-new-phone" value={newPhone} onChangeText={setNewPhone} placeholder="Mobile" placeholderTextColor={look.subtle} style={[styles.input, styles.half]} keyboardType="phone-pad" />
            </View>
            <TouchableOpacity testID="tablet-pos-new-add" disabled={busy || (!newName.trim() && !newPhone.trim())} onPress={() => void addNewClient()} style={[styles.newClientButton, (!newName.trim() && !newPhone.trim()) && { opacity: 0.5 }]}>
              <Text style={styles.chargeText}>ADD CLIENT</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: look.pageTop, paddingHorizontal: 18 },
  header: { paddingHorizontal: 4, paddingBottom: 12 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', color: look.heading },
  // minHeight 0: a column never grows past the screen; its list scrolls instead.
  columns: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 14, paddingBottom: 18 },
  leftColumn: { flex: 1.1, minHeight: 0, gap: 14 },
  panel: { backgroundColor: look.card, borderRadius: 22, borderWidth: 1, borderColor: look.cardBorder, padding: 16, ...cardShadow },
  ticket: { flex: 1, minHeight: 0 },
  keypad: { width: 300 },
  keypadUnder: { width: 'auto' },
  catalog: { flex: 1.4, minHeight: 0 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: look.cardBorder },
  clientIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' },
  clientName: { fontSize: 20, fontFamily: 'Inter_700Bold', color: look.heading },
  subtle: { fontSize: 15, fontFamily: 'Inter_400Regular', color: look.subtle },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 12 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: look.cardBorder },
  lineTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: look.heading },
  linePrice: { fontSize: 17, fontFamily: 'Inter_700Bold', color: look.heading },
  remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  totals: { borderTopWidth: 1, borderTopColor: look.cardBorder, paddingTop: 12, gap: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { fontSize: 20, fontFamily: 'Inter_700Bold', color: look.heading },
  totalValue: { fontSize: 28, fontFamily: 'Inter_700Bold', color: look.heading },
  error: { color: '#B42318', fontSize: 15, fontFamily: 'Inter_500Medium', marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondaryButton: { minWidth: 86, height: 58, borderRadius: 16, borderWidth: 1, borderColor: look.cardBorder, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  chargeButton: { flex: 1, height: 58, borderRadius: 16, backgroundColor: look.violet, alignItems: 'center', justifyContent: 'center' },
  chargeText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.4 },
  addAmount: { flex: 1, height: 58, borderRadius: 16, backgroundColor: look.violetDeep, alignItems: 'center', justifyContent: 'center' },
  display: { height: 72, borderRadius: 16, backgroundColor: look.tile, justifyContent: 'center', paddingHorizontal: 16, marginBottom: 12 },
  displayText: { fontSize: 36, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: { width: '30.8%', height: 64, borderRadius: 16, backgroundColor: look.pageBottom, borderWidth: 1, borderColor: look.cardBorder, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 26, fontFamily: 'Inter_600SemiBold', color: look.heading },
  tile: { flex: 1, minHeight: 112, borderRadius: 18, backgroundColor: look.pageBottom, borderWidth: 1, borderColor: look.cardBorder, padding: 14, justifyContent: 'space-between' },
  tileTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: look.heading },
  tileFoot: { marginTop: 10, gap: 2 },
  tilePrice: { fontSize: 19, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  backdrop: { flex: 1, backgroundColor: 'rgba(17, 12, 34, 0.35)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: 560, maxWidth: '92%', backgroundColor: look.pageTop, borderRadius: 26, padding: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 24, fontFamily: 'Inter_700Bold', color: look.heading },
  input: { height: 52, borderRadius: 14, borderWidth: 1, borderColor: look.cardBorder, backgroundColor: look.card, paddingHorizontal: 14, fontSize: 17, color: look.heading, fontFamily: 'Inter_400Regular' },
  half: { flex: 1, minWidth: 0 },
  newClientButton: { height: 58, borderRadius: 16, backgroundColor: look.violetDeep, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  clientPick: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: look.cardBorder },
});
