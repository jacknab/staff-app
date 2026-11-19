/**
 * The tablet POS (owner, 2026-11-19), laid out like the POS tab of the website's /barber screen (pages/barber/
 * CheckoutMode.tsx, used as a reference only) in the app's own light look: the ticket on the left, a keypad in the
 * middle, the services and products to tap on the right. Turned upright, the keypad sits under the ticket.
 *
 * The keypad is /barber's: 7 8 9 ⌫ · 4 5 6 ↶ · 1 2 3 X (quantity) · 00 0 ENTER, then Quick Ticket, Retail, Gift Card,
 * Tip Adjust and Discount (/barber's Combine, No Sale and Split Ticket need things the app doesn't have; owner's choice
 * to leave them out). A typed amount goes on the ticket with ENTER; X sets how many of the next item; ↶ clears what is
 * typed, or takes the last item off. Tip and discount go to the checkout with the sale.
 *
 * CHARGE makes the sale a ticket of its own for the client (POST /api/quick-sales with its lines and products, kept off
 * the calendar) and the payment continues in the usual checkout (tip, card, cash, gift card, receipt), as on the phone.
 */
import { useEffect, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { CertxaApiError } from '@/lib/certxa-api';
import { SelectField } from '@/components/SelectField';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Service = { id: number; name: string; priceCents: number; duration: number; categoryId: number | null };
type Product = { id: number; name: string; priceCents: number; stock: number | null };
type Line = { key: string; label: string; priceCents: number; kind: 'service' | 'amount' | 'product'; serviceId?: number; productId?: number };
type Client = { customerId: number; name: string; phone: string; email: string };

const MAX_CENTS = 10_000_000;
const KEYS = ['7', '8', '9', '⌫', '4', '5', '6', '↶', '1', '2', '3', 'X', '00', '0', 'ENTER'];
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
  const [tip, setTip] = useState<number | null>(null);
  const [discountCents, setDiscountCents] = useState(0);
  // The line over the keypad (as /barber's): what just happened, or what to type next.
  const [status, setStatus] = useState<{ text: string; tone: 'info' | 'ok' | 'error' } | null>(null);
  const say = (text: string, tone: 'info' | 'ok' | 'error' = 'info') => setStatus({ text, tone });
  // X: how many of the next item.
  const [qty, setQty] = useState(1);
  const [qtyDigits, setQtyDigits] = useState<string | null>(null);
  const add = (line: Omit<Line, 'key'>) => {
    setError('');
    const n = qty;
    setLines((cur) => [...cur, ...Array.from({ length: n }, (_, i) => ({ ...line, key: `${Date.now()}-${cur.length + i}` }))]);
    setQty(1);
    say(`${n > 1 ? `${n} × ` : ''}${line.label.toUpperCase()} ADDED · ${money(line.priceCents * n)}`, 'ok');
  };
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
  const discount = Math.min(discountCents, servicesCents);
  const totalCents = servicesCents - discount + productsCents + (tip ?? 0);
  const clear = () => { setLines([]); setClient(null); setCents(0); setError(''); setTip(null); setDiscountCents(0); setQty(1); setQtyDigits(null); setGuided(null); setStatus(null); };

  // ── The keypad (/barber's keys) ──
  const [cents, setCents] = useState(0);
  // Quick Ticket: an amount for each of the business's service categories in turn, then Extra (/barber's six steps).
  const [guided, setGuided] = useState<number | null>(null);
  const steps = useMemo(() => [
    ...categories.filter((c) => services.some((sv) => sv.categoryId === c.id)).slice(0, 5).map((c) => c.name),
    'Extra',
  ], [categories, services]);
  const needAmount = () => say('TYPE AN AMOUNT FIRST', 'error');
  const press = (key: string) => {
    setError('');
    if (qtyDigits !== null) {
      if (/^\d+$/.test(key)) { const next = (qtyDigits + key).replace(/^0+/, '').slice(0, 2); setQtyDigits(next); setQty(Math.max(1, Number(next) || 1)); return; }
      if (key === '⌫') { const next = qtyDigits.slice(0, -1); setQtyDigits(next); setQty(Math.max(1, Number(next) || 1)); return; }
      if (key === 'ENTER' || key === 'X') { setQtyDigits(null); if (qty > 1) say(`QTY ${qty} × · TAP THE ITEM`); return; }
      if (key === '↶') { setQtyDigits(null); setQty(1); return; }
    }
    if (key === '⌫') { setCents((c) => Math.floor(c / 10)); return; }
    if (key === 'X') {
      if (guided !== null) return;
      // The digits as typed: 2 then X is 2 of the next item.
      const n = cents;
      if (n >= 1 && n <= 99) { setQty(n); setCents(0); say(`QTY ${n} × · TAP THE ITEM`); return; }
      if (cents === 0) { setQtyDigits(''); say('QTY: TYPE HOW MANY, THEN TAP THE ITEM'); }
      return;
    }
    if (key === '↶') {
      if (guided !== null) { setGuided(null); setCents(0); say('QUICK TICKET EXITED'); return; }
      if (cents || qty !== 1) { setCents(0); setQty(1); return; }
      setLines((cur) => { if (!cur.length) { say('NOTHING TO UNDO'); return cur; } say(`UNDID · ${cur[cur.length - 1].label.toUpperCase()}`); return cur.slice(0, -1); });
      return;
    }
    if (key === 'ENTER') {
      if (guided !== null) {
        if (cents > 0) add({ label: steps[guided], priceCents: cents, kind: 'amount' });
        setCents(0);
        if (guided + 1 >= steps.length) { setGuided(null); say('QUICK TICKET DONE · REVIEW AND CHARGE', 'ok'); } else setGuided(guided + 1);
        return;
      }
      if (cents <= 0) return needAmount();
      add({ label: 'Amount', priceCents: cents, kind: 'amount' }); setCents(0);
      return;
    }
    setCents((c) => { const next = key === '00' ? c * 100 : c * 10 + Number(key); return next > MAX_CENTS ? c : next; });
  };
  const runFn = (fn: 'quick' | 'retail' | 'gift' | 'tip' | 'discount') => {
    setError('');
    if (fn === 'quick') { setCents(0); if (guided !== null) { setGuided(null); say('QUICK TICKET CANCELLED'); } else setGuided(0); return; }
    if (fn === 'retail') {
      // A typed amount is a retail item; with nothing typed, the products are shown to tap.
      if (cents <= 0) { if (products.length) { setSection(PRODUCTS); say('TAP A PRODUCT, OR TYPE AN AMOUNT AND TAP RETAIL'); } else needAmount(); return; }
      add({ label: 'Retail Item', priceCents: cents, kind: 'amount' }); setCents(0); return;
    }
    if (fn === 'gift') { router.push('/gift-cards' as Href); return; }
    if (fn === 'tip') { setTip(cents); setCents(0); say(cents ? `TIP · ${money(cents)}` : 'NO TIP', 'ok'); return; }
    if (cents <= 0) return needAmount();
    if (cents > servicesCents) { say('A DISCOUNT CAN\'T BE MORE THAN THE SERVICES', 'error'); return; }
    setDiscountCents(cents); setCents(0); say(`DISCOUNT · ${money(cents)}`, 'ok');
  };
  const prompt = guided !== null ? `${steps[guided].toUpperCase()} AMOUNT · THEN ENTER` : qtyDigits !== null ? 'QTY: TYPE HOW MANY, THEN TAP THE ITEM' : null;

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
          ...(tip != null ? { tipCents: String(tip) } : {}), ...(discount > 0 ? { discountCents: String(discount) } : {}),
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
        {discount > 0 ? <View style={styles.totalRow}><Text style={styles.subtle}>Discount</Text><View style={styles.adjust}><Text style={styles.subtle}>−{money(discount)}</Text>
          <TouchableOpacity testID="tablet-pos-remove-discount" accessibilityLabel="Remove discount" onPress={() => setDiscountCents(0)} style={styles.removeSmall}><Feather name="x" size={16} color={look.subtle} /></TouchableOpacity></View></View> : null}
        {tip != null ? <View style={styles.totalRow}><Text style={styles.subtle}>Tip</Text><View style={styles.adjust}><Text style={styles.subtle}>{money(tip)}</Text>
          <TouchableOpacity testID="tablet-pos-remove-tip" accessibilityLabel="Remove tip" onPress={() => setTip(null)} style={styles.removeSmall}><Feather name="x" size={16} color={look.subtle} /></TouchableOpacity></View></View> : null}
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text testID="tablet-pos-total" style={styles.totalValue}>{money(totalCents)}</Text></View>
        <Text style={styles.subtle}>{tip != null ? 'Tax is added at checkout.' : 'Tax and tip are added at checkout.'}</Text>
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

  const fns: { id: 'quick' | 'retail' | 'gift' | 'tip' | 'discount'; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[][] = [
    [{ id: 'quick', label: 'Quick Ticket', icon: 'zap' }, { id: 'retail', label: 'Retail', icon: 'shopping-bag' }, { id: 'gift', label: 'Gift Card', icon: 'gift' }],
    [{ id: 'tip', label: 'Tip Adjust', icon: 'dollar-sign' }, { id: 'discount', label: 'Discount', icon: 'percent' }],
  ];
  const keypad = (
    <View style={[styles.panel, styles.keypad, !wide && styles.keypadUnder]} testID="tablet-pos-keypad">
      <View style={[styles.status, status?.tone === 'error' && styles.statusError, status?.tone === 'ok' && styles.statusOk, prompt != null && styles.statusPrompt]} testID="tablet-pos-status">
        <Text style={[styles.statusText, prompt != null && { color: '#FFFFFF' }]} numberOfLines={2}>{prompt ?? status?.text ?? ' '}</Text>
      </View>
      <View style={styles.display}>
        {qtyDigits !== null ? <Text style={styles.displayQty}>QTY {qtyDigits || '_'} ×</Text> : qty > 1 ? <Text style={styles.displayQty}>{qty} ×</Text> : null}
        {/* Just the number, no $ (as /barber). */}
        <Text testID="tablet-pos-display" style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>{cents ? (cents / 100).toFixed(2) : ''}</Text>
      </View>
      <View style={styles.keys}>
        {KEYS.map((k) => (
          <TouchableOpacity key={k} testID={`tablet-pos-key-${k === '⌫' ? 'back' : k === '↶' ? 'undo' : k}`} onPress={() => press(k)} accessibilityLabel={k === '⌫' ? 'Delete' : k === '↶' ? 'Undo' : k === 'X' ? 'Quantity' : k}
            style={[styles.key, k === 'ENTER' && styles.enterKey, k === '↶' && styles.undoKey]}>
            {k === '⌫' ? <Feather name="delete" size={28} color={look.heading} />
              : <Text style={[styles.keyText, k === 'ENTER' && styles.enterText, k === '↶' && guided !== null && styles.exitText]}>{k === '↶' && guided !== null ? 'EXIT' : k}</Text>}
            {k === 'X' ? <Text style={styles.keySmall}>Qty</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      {fns.map((row, r) => (
        <View key={r} style={styles.fnRow}>
          {row.map((fn) => (
            <TouchableOpacity key={fn.id} testID={`tablet-pos-fn-${fn.id}`} onPress={() => runFn(fn.id)} style={[styles.fnButton, fn.id === 'quick' && guided !== null && styles.fnActive]}>
              <Feather name={fn.icon} size={22} color={look.violetDeep} />
              <Text style={styles.fnText} numberOfLines={1}>{fn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );

  const catalog = (
    <View style={[styles.panel, styles.catalog]} testID="tablet-pos-catalog">
      <View style={{ marginBottom: 12 }}>
        <SelectField testID="tablet-pos-section" title="Show" value={section} options={sectionOptions} onChange={(v) => setSection(String(v))} />
      </View>
      {loading ? <ActivityIndicator color={look.violet} style={{ marginTop: 30 }} /> : (
        <FlatList data={tiles} key={wide ? 'w' : 'n'} numColumns={wide ? 2 : 1} keyExtractor={(t) => t.key} contentContainerStyle={{ paddingBottom: 110 }}
          columnWrapperStyle={wide ? { gap: 12 } : undefined} ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
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
    <View style={[styles.root, { paddingTop: insets.top + 18 }]}>
      <AppBackground />
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
  // minHeight 0: a column never grows past the screen; its list scrolls instead.
  columns: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 14, paddingBottom: 18 },
  leftColumn: { flex: 1.1, minHeight: 0, gap: 14 },
  panel: { backgroundColor: look.card, borderRadius: 22, borderWidth: 1, borderColor: look.cardBorder, padding: 16, ...cardShadow },
  ticket: { flex: 1, minHeight: 0 },
  keypad: { width: 390 },
  keypadUnder: { width: 'auto' },
  catalog: { flex: 1, minHeight: 0 },
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
  status: { minHeight: 46, borderRadius: 12, backgroundColor: look.tile, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10 },
  statusOk: { backgroundColor: '#E7F6EC' },
  statusError: { backgroundColor: '#FDECEC' },
  statusPrompt: { backgroundColor: look.violet },
  statusText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: look.heading, letterSpacing: 0.3 },
  display: { height: 76, borderRadius: 16, backgroundColor: look.pageBottom, borderWidth: 1, borderColor: look.cardBorder, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 10 },
  displayQty: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  displayText: { flex: 1, fontSize: 40, fontFamily: 'Inter_700Bold', textAlign: 'right', color: look.heading },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  key: { width: '22.6%', height: 74, borderRadius: 16, backgroundColor: look.pageBottom, borderWidth: 1, borderColor: look.cardBorder, alignItems: 'center', justifyContent: 'center' },
  enterKey: { width: '48.4%', backgroundColor: look.violet, borderColor: look.violet },
  undoKey: { backgroundColor: look.tile },
  keyText: { fontSize: 28, fontFamily: 'Inter_600SemiBold', color: look.heading },
  enterText: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.6 },
  exitText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  keySmall: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: look.subtle, marginTop: -2 },
  fnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  fnButton: { flex: 1, height: 66, borderRadius: 16, backgroundColor: look.tile, borderWidth: 1, borderColor: look.cardBorder, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6 },
  fnActive: { borderColor: look.violet, borderWidth: 2 },
  fnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  removeSmall: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
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
