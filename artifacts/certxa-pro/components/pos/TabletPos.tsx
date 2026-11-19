/**
 * The tablet POS (owner, 2026-11-19), laid out like the POS tab of the website's /barber screen (pages/barber/
 * CheckoutMode.tsx, used as a reference only) in the app's own light look: the ticket on the left, a keypad in the
 * middle, the key grid on the right. Turned upright, the keypad sits under the ticket.
 *
 * The key grid is /nail's (components/pos/PosGrid.tsx, lib/posGrid.ts): a fixed 2 × 6 (or 3 × 6) of keys — the catalog's
 * categories, then Packages, Products and Add-ons, each opening its own grid with Back — or the manager's own
 * arrangement from the key grid editor (the gear under the grid, on the left; GET · PUT /api/pro/pos-grid).
 *
 * The keypad is /barber's: 7 8 9 ⌫ · 4 5 6 ↶ · 1 2 3 X (quantity) · 00 0 ENTER, then Quick Ticket, Retail, Gift Card,
 * Packages, Memberships and Discount (/barber's Combine, No Sale and Split Ticket need things the app doesn't have, and
 * Packages took Tip Adjust's place; owner, 2026-11-19). A typed amount goes on the ticket with ENTER as a +Misc Item; X
 * sets how many of the next item; ↶ clears what is typed, or takes the last item off.
 *
 * The ticket shows tax as a register does (the checkout's own rule and Settings › Card reader & Checkout rates).
 * CHARGE makes the sale a ticket of its own for the client (POST /api/quick-sales with its lines and products, kept off
 * the calendar) and the usual checkout opens in the grid's place (cash, gift card, card; the tip is asked last, before a
 * card payment). Paid, the grid comes back with a new ticket; Back keeps the ticket to change it.
 *
 * BOOK books the ticket's services and add-ons as an appointment instead (owner, 2026-11-19, /nail's way without its
 * technician step): the days and times show in the grid's place (components/pos/BookingGrid.tsx). On a tablet every
 * New booking in the app opens here (lib/openBooking.ts) with its client, services and day.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { CertxaApiError } from '@/lib/certxa-api';
import { OptionGrid, PosGrid } from '@/components/pos/PosGrid';
import { PaneHost } from '@/components/TabletSplit';
import { PosPayBridgeContext, type PosPayBridge, type PosPayState } from '@/lib/posPayBridge';
import CheckoutScreen from '@/app/(tabs)/checkout';
import { ClientLookup } from '@/components/pos/ClientLookup';
import { BookingGrid, type BookingSlot } from '@/components/pos/BookingGrid';
import { zonedTimeLabel } from '@/lib/businessTime';
import { usePaymentsReady } from '@/lib/usePaymentsReady';
import { useReaderSetup } from '@/components/pos/useReaderSetup';
import { PosGridEditor } from '@/components/pos/PosGridEditor';
import { addonGroupKey, posGridColumns, type GridKey, type CatalogAddon, type CatalogGroup, type CatalogService, type PosFn, type PosGridConfig } from '@/lib/posGrid';
import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';

type Service = { id: number; name: string; priceCents: number; duration: number; categoryId: number | null; category: string };
type Product = { id: number; name: string; priceCents: number; stock: number | null };
type Line = { key: string; label: string; priceCents: number; kind: 'service' | 'amount' | 'product' | 'addon' | 'package' | 'giftcard' | 'packageSale';
  serviceId?: number; productId?: number; packageId?: number; addonId?: number; minutes?: number };
/** A New booking from elsewhere in the app (lib/openBooking.ts): who, which services, which day ("2026-10-20", month from 0). */
export type BookRequest = { book?: string; clientId?: string; phone?: string; serviceIds?: string; day?: string };
type Plan = { id: number; name: string; priceCents: number; interval: string; isActive: boolean };
type ShopPackage = { id: number; name: string; visits: number; priceCents: number; isActive: boolean };
type Client = { customerId: number; name: string; phone: string; email: string };

const MAX_CENTS = 10_000_000;
const KEYS = ['7', '8', '9', '⌫', '4', '5', '6', '↶', '1', '2', '3', 'X', '00', '0', 'ENTER'];
const KEY_GAP = 10;
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const digitsOnly = (value: string) => value.replace(/\D/g, '');
/** Products and packages ride on the grid as service keys with ids no service has: a package is its id negated (as on
 *  /nail); a product is PRODUCT_KEY minus its id. */
const PRODUCT_KEY = -1_000_000_000;

export function TabletPos({ bookRequest }: { bookRequest?: BookRequest | null } = {}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const wide = width > height;
  const { clients, addQuickClient, timeZone, ownStaffId, refresh: refreshBookings } = useBookingData();
  const paymentsReady = usePaymentsReady();

  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string; sortOrder: number }[]>([]);
  const [addons, setAddons] = useState<CatalogAddon[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [addonGroupRows, setAddonGroupRows] = useState<{ id: number; name: string; addonIds: number[] }[]>([]);
  const [gridConfig, setGridConfig] = useState<PosGridConfig | null>(null);
  // Sales tax, as the checkout reads it (Settings › Card reader & Checkout): services at the sales rate when they are
  // taxable, products at the retail rate (no retail rate yet = the sales rate).
  const [slug, setSlug] = useState('');
  const [taxRates, setTaxRates] = useState<{ rate: number; services: boolean; retail: number }>({ rate: 0, services: false, retail: 0 });
  useEffect(() => {
    api.get<Array<{ id: number; bookingSlug?: string | null }>>('/api/stores').then(async (rows) => {
      const id = Array.isArray(rows) ? Number(rows[0]?.id) : 0;
      if (!id) return;
      setSlug(String(rows[0]?.bookingSlug ?? ''));
      const pos = await api.get<{ salesTaxRate?: string | number; taxServicesTaxable?: boolean; retailTaxRate?: string | number | null; taxProductsTaxable?: boolean }>(`/api/pos-settings/${id}`);
      const rate = Number(pos?.salesTaxRate ?? 0);
      const retail = pos?.taxProductsTaxable === false ? 0 : Number(pos?.retailTaxRate != null && pos.retailTaxRate !== '' ? pos.retailTaxRate : rate);
      setTaxRates({ rate: Number.isFinite(rate) && rate > 0 && rate <= 0.3 ? rate : 0, services: Boolean(pos?.taxServicesTaxable), retail: Number.isFinite(retail) && retail > 0 && retail <= 0.3 ? retail : 0 });
    }).catch(() => undefined);
  }, []);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([
      api.get<any[]>('/api/services').catch(() => []),
      api.get<any[]>('/api/service-categories').catch(() => []),
      api.get<any[]>('/api/products').catch(() => []),
      api.get<any[]>('/api/addons').catch(() => []),
      api.get<any[]>('/api/packages').catch(() => []),
      api.get<{ config: PosGridConfig | null }>('/api/pro/pos-grid').catch(() => ({ config: null })),
      api.get<any[]>('/api/addon-groups').catch(() => []),
    ]).then(([rows, cats, prods, adds, packs, grid, addonGroupList]) => {
      const list = Array.isArray(rows) ? rows : [];
      // A service with options is sold by its options ("Haircut · Long"), not by itself.
      const parents = new Set(list.filter((s) => s.parentServiceId).map((s) => Number(s.parentServiceId)));
      const byId = new Map(list.map((s) => [Number(s.id), s]));
      setServices(list.filter((s) => !parents.has(Number(s.id))).map((s) => {
        const parent = s.parentServiceId ? byId.get(Number(s.parentServiceId)) : null;
        return {
          id: Number(s.id), name: parent ? `${parent.name} · ${s.optionLabel || s.name}` : String(s.name),
          priceCents: Math.round(Number(s.price) * 100) || 0, duration: Number(s.duration) || 0,
          categoryId: s.categoryId ?? parent?.categoryId ?? null, category: String(s.category ?? parent?.category ?? 'Services'),
        };
      }).sort((a, b) => a.name.localeCompare(b.name)));
      setCategories((Array.isArray(cats) ? cats : []).map((c) => ({ id: Number(c.id), name: String(c.name), sortOrder: Number(c.sortOrder ?? 9999) })));
      setAddons((Array.isArray(adds) ? adds : []).filter((a) => a.isActive !== false && !a.kioskExtra)
        .map((a) => ({ id: Number(a.id), name: String(a.name), price: Number(a.price) || 0, duration: a.duration ?? null })));
      setPackages(Array.isArray(packs) ? packs : []);
      setAddonGroupRows((Array.isArray(addonGroupList) ? addonGroupList : []).map((g) => ({ id: Number(g.id), name: String(g.name), addonIds: (g.addonIds ?? []).map(Number) })));
      setGridConfig(grid?.config ?? null);
      setProducts((Array.isArray(prods) ? prods : []).map((p) => ({ id: Number(p.id), name: String(p.name ?? ''), priceCents: Math.round(Number(p.price) * 100) || 0, stock: p.stock == null ? null : Number(p.stock) })));
    }).finally(() => setLoading(false));
  }, []);

  // The grid's categories, as /nail builds them: the catalog's (in their order), then Packages, Products and Add-ons.
  const groups = useMemo<CatalogGroup[]>(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const map = new Map<string, CatalogGroup & { sortOrder: number }>();
    for (const sv of services) {
      const cat = sv.categoryId != null ? byId.get(sv.categoryId) : undefined;
      const key = cat ? `cat:${sv.categoryId}` : `legacy:${sv.category}`;
      const g = map.get(key) ?? { key, name: cat?.name ?? sv.category, sortOrder: cat?.sortOrder ?? 99999, services: [] };
      g.services.push({ id: sv.id, name: sv.name, duration: sv.duration, price: sv.priceCents / 100 });
      map.set(key, g);
    }
    const out: CatalogGroup[] = [...map.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const known = new Set(services.map((sv) => sv.id));
    const packageKeys = packages.filter((p) => p.isActive !== false && (p.items ?? []).some((i: any) => i.itemType === 'service')
      && (p.items ?? []).every((i: any) => i.itemType !== 'service' || known.has(Number(i.serviceId))))
      .map((p) => ({ id: -Number(p.id), name: String(p.name), duration: Number(p.duration) || 0, price: Number(p.price) || 0 }));
    if (packageKeys.length) out.push({ key: 'packages', name: 'Packages', services: packageKeys });
    if (products.length) out.push({ key: 'products', name: 'Products', services: products.map((p) => ({ id: PRODUCT_KEY - p.id, name: p.name, duration: 0, price: p.priceCents / 100 })) });
    if (addons.length && !gridConfig?.hideAddonsKey) out.push({ key: 'addons', name: 'Add-ons', services: [], addons });
    return out;
  }, [services, categories, packages, products, addons, gridConfig?.hideAddonsKey]);

  // Add-on groups for Add-on Group keys: each opens a grid of its add-ons, in the group's order.
  const addonGroups = useMemo(() => addonGroupRows.map((g) => ({
    id: g.id, name: g.name,
    group: { key: addonGroupKey(g.id), name: g.name, services: [], addons: g.addonIds.flatMap((id) => addons.filter((a) => a.id === id)) } as CatalogGroup,
  })), [addonGroupRows, addons]);

  // ── The ticket ──
  const [lines, setLines] = useState<Line[]>([]);
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // BOOK (below): the visit being booked, the day to open on, and its saving.
  const [booking, setBooking] = useState<{ slot: BookingSlot | null } | null>(null);
  const [bookDay, setBookDay] = useState<Date | null>(null);
  const [bookBusy, setBookBusy] = useState(false);
  const serviceLines = lines.filter((l) => l.kind === 'service' && l.serviceId);
  const bookMinutes = lines.filter((l) => l.kind === 'service' || l.kind === 'addon').reduce((n, l) => n + (l.minutes ?? 0), 0);
  const slotLabel = (s: BookingSlot) => `${new Date(s.time).toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })} · ${zonedTimeLabel(s.time, timeZone)}`;
  // The checkout open in the grid's place, with the sale's details.
  const [paying, setPaying] = useState<Record<string, string> | null>(null);
  // What the checkout says is paid and left (lib/posPayBridge.ts), and where ENTER sends typed cash.
  const [payState, setPayState] = useState<PosPayState | null>(null);
  const cashHandler = useRef<((cents: number) => void) | null>(null);
  const bridge = useMemo<PosPayBridge>(() => ({ report: setPayState, setCashHandler: (h) => { cashHandler.current = h; } }), []);
  const [discountCents, setDiscountCents] = useState(0);
  // The line over the keypad (as /barber's): what just happened, or what to type next.
  const [status, setStatus] = useState<{ text: string; tone: 'info' | 'ok' | 'error' } | null>(null);
  const say = (text: string, tone: 'info' | 'ok' | 'error' = 'info') => setStatus({ text, tone });
  // The Stripe M2 reader is set up and connected when the POS opens (components/pos/useReaderSetup.native.tsx).
  useReaderSetup(true, say);
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
      const id = l.kind === 'amount' ? l.key : `${l.kind}-${l.serviceId ?? l.productId ?? l.packageId ?? `${l.label}-${l.priceCents}`}`;
      const g = groups.find((x) => x.id === id);
      if (g) { g.count += 1; g.lastKey = l.key; } else groups.push({ id, line: l, count: 1, lastKey: l.key });
    }
    return groups;
  }, [lines]);
  const servicesCents = lines.filter((l) => l.kind !== 'product').reduce((n, l) => n + l.priceCents, 0);
  const productsCents = lines.filter((l) => l.kind === 'product').reduce((n, l) => n + l.priceCents, 0);
  const discount = Math.min(discountCents, servicesCents);
  // Tax on the services after the discount, and on products; never on a tip (the checkout's rule).
  // A gift card sold is money held for the client, not a sale: no tax on it.
  const giftCardCents = lines.filter((l) => l.kind === 'giftcard').reduce((n, l) => n + l.priceCents, 0);
  const taxCents = (taxRates.services && taxRates.rate > 0 ? Math.round(Math.max(0, servicesCents - giftCardCents - discount) * taxRates.rate) : 0) + Math.round(productsCents * taxRates.retail);
  const totalCents = servicesCents - discount + productsCents + taxCents;
  const percent = (r: number) => `${(r * 100).toFixed(3).replace(/\.?0+$/, '')}%`;
  const taxLabel = taxRates.services && taxRates.rate > 0 && productsCents > 0 && taxRates.retail > 0 && taxRates.retail !== taxRates.rate ? 'Tax'
    : `Tax (${percent(taxRates.services && taxRates.rate > 0 ? taxRates.rate : taxRates.retail)})`;
  const clear = () => { setLines([]); setClient(null); setCents(0); setError(''); setDiscountCents(0); setQty(1); setQtyDigits(null); setGuided(null); setStatus(null); };

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
    // Paying (owner, 2026-11-19, /nail's way): the keypad types the cash the client hands over; ENTER records it.
    if (paying) {
      if (key === 'ENTER') {
        if (cents <= 0) { say(payState?.keypad === 'gift' ? 'TYPE THE GIFT CARD NUMBER, THEN ENTER' : 'TYPE THE CASH AMOUNT, THEN ENTER', 'error'); return; }
        cashHandler.current?.(cents); setCents(0); return;
      }
      if (key === '↶') { setCents(0); return; }
      if (key === 'X') return;
    }
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
      // A typed amount and ENTER is a "+Misc Item" line (owner, 2026-11-19).
      add({ label: '+Misc Item', priceCents: cents, kind: 'amount' }); setCents(0);
      return;
    }
    setCents((c) => { const next = key === '00' ? c * 100 : c * 10 + Number(key); return next > MAX_CENTS ? c : next; });
  };
  const runFn = (fn: 'quick' | 'retail' | 'gift' | 'packages' | 'memberships' | 'discount') => {
    if (paying) return;
    setError('');
    if (fn === 'quick') { setCents(0); if (guided !== null) { setGuided(null); say('QUICK TICKET CANCELLED'); } else setGuided(0); return; }
    if (fn === 'retail') {
      // A typed amount is a retail item; with nothing typed, the products are shown to tap.
      if (cents <= 0) { if (products.length) say('TYPE AN AMOUNT AND TAP RETAIL, OR TAP PRODUCTS ON THE GRID'); else needAmount(); return; }
      add({ label: 'Retail Item', priceCents: cents, kind: 'amount' }); setCents(0); return;
    }
    // Gift Card, Packages and Memberships turn the grid into their own options (owner, 2026-11-19).
    if (fn === 'gift') { setPanel('gift'); return; }
    if (fn === 'packages') { setPanel('packages'); return; }
    if (fn === 'memberships') { setPanel('memberships'); return; }
    if (cents <= 0) return needAmount();
    if (cents > servicesCents) { say('A DISCOUNT CAN\'T BE MORE THAN THE SERVICES', 'error'); return; }
    setDiscountCents(cents); setCents(0); say(`DISCOUNT · ${money(cents)}`, 'ok');
  };
  const prompt = paying && payState && !payState.paid ? (payState.error || payState.message || (payState.keypad === 'gift' ? 'GIFT CARD: TYPE THE NUMBER, THEN ENTER' : 'CASH: TYPE THE AMOUNT, THEN ENTER')).toUpperCase()
    : guided !== null ? `${steps[guided].toUpperCase()} AMOUNT · THEN ENTER` : qtyDigits !== null ? 'QTY: TYPE HOW MANY, THEN TAP THE ITEM' : null;

  // ── Choosing the client ──
  const [picking, setPicking] = useState(false);
  const pickExisting = (c: (typeof clients)[number]) => { setClient({ customerId: c.customerId, name: c.name, phone: c.phone, email: c.email ?? '' }); setPicking(false); };
  const addNewClient = async (newName: string, newPhone: string) => {
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
      setPicking(false);
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
      const saleLines = lines.filter((l) => l.kind !== 'product').map((l) => ({ label: l.label, priceCents: l.priceCents, ...(l.serviceId ? { serviceId: l.serviceId } : {}),
        ...(l.kind === 'giftcard' ? { giftCard: true } : {}), ...(l.kind === 'packageSale' && l.packageId ? { packageId: l.packageId } : {}) }));
      const counts = new Map<number, number>();
      for (const l of lines) if (l.productId) counts.set(l.productId, (counts.get(l.productId) ?? 0) + 1);
      const sale = await api.post<{ id: number }>('/api/quick-sales', {
        customerId: client.customerId, amountCents: servicesCents,
        ...(saleLines.length ? { lines: saleLines } : {}),
        ...(counts.size ? { products: [...counts].map(([productId, quantity]) => ({ productId, quantity })) } : {}),
      });
      const first = grouped[0]?.line.label ?? 'Sale';
      setPaying({
        appointmentId: String(sale.id), amountCents: String(servicesCents), clientName: client.name,
        serviceName: grouped.length > 1 ? `${first} + ${grouped.length - 1} more` : first, phone: client.phone, email: client.email, quickSale: '1',
        ...(discount > 0 ? { discountCents: String(discount) } : {}), ...(giftCardCents > 0 ? { taxFreeCents: String(giftCardCents) } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start the sale. Please try again.');
    } finally { setBusy(false); }
  };

  const ticket = (
    <View pointerEvents={paying ? 'none' : 'auto'} style={[styles.panel, styles.ticket, wide && styles.ticketWide]} testID="tablet-pos-ticket">
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
              <Text style={styles.subtle}>{g.line.kind === 'product' ? 'Product' : g.line.kind === 'amount' ? 'Keyed in' : g.line.kind === 'addon' ? 'Add-on' : g.line.kind === 'package' ? 'Package'
                : g.line.kind === 'giftcard' ? 'Gift card · code given when paid' : g.line.kind === 'packageSale' ? 'Prepaid package' : 'Service'}</Text>
            </View>
            <Text style={styles.linePrice}>{money(g.line.priceCents * g.count)}</Text>
            <TouchableOpacity accessibilityLabel={g.count > 1 ? `Remove one ${g.line.label}` : `Remove ${g.line.label}`} onPress={() => removeOne(g.lastKey)} style={styles.remove}>
              <Feather name="x" size={18} color={look.subtle} />
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
      <View style={styles.totals}>
        <View style={styles.totalRow}><Text style={styles.subtle}>Subtotal</Text><Text testID="tablet-pos-subtotal" style={styles.subtle}>{money(servicesCents + productsCents)}</Text></View>
        {discount > 0 ? <View style={styles.totalRow}><Text style={styles.subtle}>Discount</Text><View style={styles.adjust}><Text style={styles.subtle}>−{money(discount)}</Text>
          <TouchableOpacity testID="tablet-pos-remove-discount" accessibilityLabel="Remove discount" onPress={() => setDiscountCents(0)} style={styles.removeSmall}><Feather name="x" size={16} color={look.subtle} /></TouchableOpacity></View></View> : null}
        {taxCents > 0 ? <View style={styles.totalRow}><Text style={styles.subtle}>{taxLabel}</Text><Text testID="tablet-pos-tax" style={styles.subtle}>{money(taxCents)}</Text></View> : null}
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text testID="tablet-pos-total" style={styles.totalValue}>{money(totalCents)}</Text></View>
        {/* Paying: what is paid so far and what is left, as /nail's cart shows it. */}
        {paying && payState ? <>
          {payState.cashCents > 0 ? <View style={styles.totalRow}><Text style={styles.tender}>CASH</Text><Text testID="tablet-pos-tender-cash" style={styles.tender}>−{money(payState.cashCents)}</Text></View> : null}
          {payState.giftCents > 0 ? <View style={styles.totalRow}><Text style={styles.tender}>GIFT CARD</Text><Text style={styles.tender}>−{money(payState.giftCents)}</Text></View> : null}
          {payState.creditCents > 0 ? <View style={styles.totalRow}><Text style={styles.tender}>CREDIT</Text><Text style={styles.tender}>−{money(payState.creditCents)}</Text></View> : null}
          <View style={[styles.balanceRow, payState.paid && styles.balancePaid]} testID="tablet-pos-balance">
            <Text style={styles.balanceText}>{payState.changeCents > 0 ? 'CHANGE DUE' : payState.paid ? 'PAID IN FULL' : 'BALANCE DUE'}</Text>
            <Text style={styles.balanceText}>{money(payState.changeCents > 0 ? payState.changeCents : payState.dueCents)}</Text>
          </View>
        </> : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {booking ? <>
        {booking.slot ? <View style={styles.bookedRow}><Text style={styles.bookedText}>{slotLabel(booking.slot)}</Text></View> : null}
        <View style={styles.actionRow}>
          <TouchableOpacity testID="tablet-pos-book-cancel" onPress={() => setBooking(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>CANCEL</Text></TouchableOpacity>
          <TouchableOpacity testID="tablet-pos-book-save" disabled={!booking.slot || bookBusy} onPress={() => void saveBooking()} style={[styles.chargeButton, (!booking.slot || bookBusy) && { opacity: 0.5 }]}>
            {bookBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.chargeText}>{booking.slot ? 'BOOK' : 'PICK A TIME'}</Text>}
          </TouchableOpacity>
        </View>
      </> : <>
      <View style={styles.actionRow}>
        <TouchableOpacity testID="tablet-pos-clear" onPress={clear} style={[styles.secondaryButton, { flex: 1 }]}><Text style={styles.secondaryText}>CLEAR</Text></TouchableOpacity>
        <TouchableOpacity testID="tablet-pos-book" disabled={!!paying} onPress={() => startBooking()} style={[styles.secondaryButton, { flex: 1 }]}><Text style={styles.secondaryText}>BOOK</Text></TouchableOpacity>
      </View>
      <View style={[styles.actionRow, { marginTop: 10 }]}>
        <TouchableOpacity testID="tablet-pos-charge" disabled={!lines.length || busy} onPress={() => void charge()} style={[styles.chargeButton, (!lines.length || busy) && { opacity: 0.5 }]}>
          {/* Paying: what is still owed after the payments taken so far (owner, 2026-11-19). */}
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.chargeText}>
            {paying && payState ? (payState.paid ? 'PAID' : `CHARGE ${money(payState.dueCents)}`) : `CHARGE ${money(totalCents)}`}</Text>}
        </TouchableOpacity>
      </View>
      </>}
    </View>
  );

  const fns: { id: 'quick' | 'retail' | 'gift' | 'packages' | 'memberships' | 'discount'; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[][] = [
    [{ id: 'quick', label: 'Quick Ticket', icon: 'zap' }, { id: 'retail', label: 'Retail', icon: 'shopping-bag' }, { id: 'gift', label: 'Gift Card', icon: 'gift' }],
    [{ id: 'packages', label: 'Packages', icon: 'package' }, { id: 'memberships', label: 'Memberships', icon: 'award' }, { id: 'discount', label: 'Discount', icon: 'percent' }],
  ];
  // Square keys (owner, 2026-11-19), as big as the keypad's width allows.
  const [keySize, setKeySize] = useState(0);
  const keypad = (
    <View style={[styles.panel, styles.keypad, !wide && styles.keypadUnder]} testID="tablet-pos-keypad">
      <View style={[styles.status, status?.tone === 'error' && styles.statusError, status?.tone === 'ok' && styles.statusOk, prompt != null && styles.statusPrompt]} testID="tablet-pos-status">
        <Text style={[styles.statusText, prompt != null && { color: '#FFFFFF' }]} numberOfLines={2}>{prompt ?? status?.text ?? ' '}</Text>
      </View>
      <View style={styles.display}>
        {qtyDigits !== null ? <Text style={styles.displayQty}>QTY {qtyDigits || '_'} ×</Text> : qty > 1 ? <Text style={styles.displayQty}>{qty} ×</Text> : null}
        {/* Just the number, no $ (as /barber). */}
        {/* A gift card number shows as typed; an amount as dollars and cents. */}
        <Text testID="tablet-pos-display" style={styles.displayText} numberOfLines={1} adjustsFontSizeToFit>{!cents ? '' : paying && payState?.keypad === 'gift' ? String(cents) : (cents / 100).toFixed(2)}</Text>
      </View>
      <View style={styles.keys} onLayout={(e) => setKeySize(Math.floor((e.nativeEvent.layout.width - 3 * KEY_GAP) / 4))}>
        {KEYS.map((k) => (
          <TouchableOpacity key={k} testID={`tablet-pos-key-${k === '⌫' ? 'back' : k === '↶' ? 'undo' : k}`} onPress={() => press(k)} accessibilityLabel={k === '⌫' ? 'Delete' : k === '↶' ? 'Undo' : k === 'X' ? 'Quantity' : k} activeOpacity={0.7}
            style={[styles.key, keySize > 0 && { width: k === 'ENTER' ? keySize * 2 + KEY_GAP : keySize, height: keySize }, k === 'ENTER' && styles.enterKey, k === '↶' && styles.undoKey]}>
            {k === '⌫' ? <Feather name="delete" size={28} color={look.heading} />
              : <Text style={[styles.keyText, k === 'ENTER' && styles.enterText, k === '↶' && guided !== null && styles.exitText]}>{k === '↶' && guided !== null ? 'EXIT' : k}</Text>}
            {k === 'X' ? <Text style={styles.keySmall}>Qty</Text> : null}
          </TouchableOpacity>
        ))}
      </View>
      {fns.map((row, r) => (
        <View key={r} pointerEvents={paying ? 'none' : 'auto'} style={[styles.fnRow, paying && styles.lockedOn]}>
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

  // ── Gift Card, Packages and Memberships: the grid shows their options, in the same keys ──
  const [panel, setPanel] = useState<null | 'gift' | 'packages' | 'memberships'>(null);
  const [shopPackages, setShopPackages] = useState<ShopPackage[] | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  useEffect(() => {
    if (panel === 'packages' && shopPackages == null) api.get<{ packages: ShopPackage[] }>('/api/pro/shop').then((r) => setShopPackages((r?.packages ?? []).filter((p) => p.isActive))).catch(() => setShopPackages([]));
    if (panel === 'memberships' && plans == null) api.get<Plan[]>('/api/pro/membership-plans').then((r) => setPlans((Array.isArray(r) ? r : []).filter((p) => p.isActive))).catch(() => setPlans([]));
  }, [panel, shopPackages, plans]);
  const startMembership = (plan: Plan) => {
    if (!client) { say('CHOOSE THE CLIENT FIRST', 'error'); setPicking(true); return; }
    const run = async (how: 'start' | 'link') => {
      try {
        if (how === 'start') { await api.post('/api/pro/memberships/start', { planId: plan.id, customerId: client.customerId }); say(`${plan.name.toUpperCase()} STARTED FOR ${client.name.toUpperCase()}`, 'ok'); }
        else { await api.post('/api/pro/memberships/link', { planId: plan.id, customerId: client.customerId, send: true }); say(`JOIN LINK FOR ${plan.name.toUpperCase()} TEXTED TO ${client.name.toUpperCase()}`, 'ok'); }
      } catch (cause) { say((cause instanceof Error ? cause.message : 'Could not start the membership.').toUpperCase(), 'error'); }
    };
    Alert.alert(`${plan.name} for ${client.name}`, `${money(plan.priceCents)} a ${plan.interval === 'year' ? 'year' : 'month'}, charged by Certxa.`, [
      { text: 'Start with card on file', onPress: () => void run('start') },
      { text: 'Text a join link', onPress: () => void run('link') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  const optionKeys: Extract<GridKey, { kind: 'action' }>[] = panel === 'gift' ? [
    ...[2500, 5000, 7500, 10000, 15000, 20000].map((c) => ({ kind: 'action' as const, id: `gift-${c}`, title: 'Gift card', price: money(c), onPress: () => add({ label: `Gift card ${money(c)}`, priceCents: c, kind: 'giftcard' }) })),
    { kind: 'action', id: 'gift-custom', title: 'Custom amount', icon: 'edit-3', onPress: () => {
      if (cents < 100 || cents > 100_000) { say('TYPE THE AMOUNT ($1–$1,000), THEN TAP CUSTOM AMOUNT', 'error'); return; }
      add({ label: `Gift card ${money(cents)}`, priceCents: cents, kind: 'giftcard' }); setCents(0);
    } },
    { kind: 'action', id: 'gift-lookup', title: 'Look up / redeem', icon: 'search', onPress: () => router.push('/gift-cards' as Href) },
  ] : panel === 'packages' ? (shopPackages ?? []).map((p) => ({ kind: 'action' as const, id: `pack-${p.id}`, title: p.name, price: money(p.priceCents), sub: `${p.visits} visits`,
      onPress: () => add({ label: p.name, priceCents: p.priceCents, kind: 'packageSale', packageId: p.id }) }))
    : panel === 'memberships' ? (plans ?? []).map((p) => ({ kind: 'action' as const, id: `plan-${p.id}`, title: p.name, price: money(p.priceCents), sub: p.interval === 'year' ? 'a year' : 'a month', onPress: () => startMembership(p) }))
    : [];

  // Paid: the gift cards are made and the package visits saved (POST /api/quick-sales/:id/fulfil), and the codes shown.
  const fulfilled = useRef<string | null>(null);
  useEffect(() => {
    if (!paying || !payState?.paid || fulfilled.current === paying.appointmentId) return;
    if (!lines.some((l) => l.kind === 'giftcard' || l.kind === 'packageSale')) return;
    fulfilled.current = paying.appointmentId;
    api.post<{ giftCards: { code: string; amountCents: number }[]; packages: { name: string; visits: number | null }[] }>(`/api/quick-sales/${paying.appointmentId}/fulfil`, {})
      .then((r) => Alert.alert('Sold', [
        ...(r?.giftCards ?? []).map((g) => `Gift card ${money(g.amountCents)}: ${g.code}`),
        ...(r?.packages ?? []).map((p) => `${p.name}${p.visits ? ` · ${p.visits} visits` : ''} saved for ${client?.name ?? 'the client'}`),
        (r?.giftCards ?? []).length ? 'Give the code to the client; it is also in Gift cards.' : '',
      ].filter(Boolean).join('\n')))
      .catch((cause) => Alert.alert('Gift card or package', `${cause instanceof Error ? cause.message : 'Could not finish it.'} Open Gift cards or Packages to check.`));
  }, [paying, payState?.paid, lines, client]);

  // A key on the grid: a service, a package, a product or an add-on goes on the ticket (X first for that many).
  const pickKey = (svc: CatalogService) => {
    const cents = Math.round(svc.price * 100);
    if (svc.id <= PRODUCT_KEY) add({ label: svc.name, priceCents: cents, kind: 'product', productId: PRODUCT_KEY - svc.id });
    else if (svc.id < 0) add({ label: svc.name, priceCents: cents, kind: 'package' });
    else add({ label: svc.name, priceCents: cents, kind: 'service', serviceId: svc.id, minutes: svc.duration });
  };
  const pickAddon = (a: CatalogAddon) => add({ label: a.name, priceCents: Math.round(a.price * 100), kind: 'addon', addonId: a.id, minutes: a.duration ?? 0 });

  // ── BOOK: the ticket's services and add-ons as an appointment ──
  const startBooking = () => {
    setError('');
    if (!client) { say('CHOOSE THE CLIENT FIRST', 'error'); setPicking(true); return; }
    if (!serviceLines.length) { say('TAP THE SERVICES TO BOOK, THEN BOOK', 'error'); return; }
    if (!slug) { say('YOUR BOOKING PAGE ISN\'T SET UP YET', 'error'); return; }
    if (lines.some((l) => l.kind !== 'service' && l.kind !== 'addon')) say('ONLY THE SERVICES AND ADD-ONS ARE BOOKED', 'info');
    setPanel(null); setBooking({ slot: null });
  };
  const saveBooking = async (choice?: 'request' | 'skip') => {
    if (!client || !booking?.slot || bookBusy) return;
    const slot = booking.slot;
    // A client who must pay a deposit or keep a card on file: ask whether to text them the link (as New booking does).
    if (choice === undefined) {
      setBookBusy(true);
      const policy = await api.get<{ requirement: 'deposit' | 'card_on_file' | null }>(`/api/booking-payment-policy?customerId=${client.customerId}`).catch(() => null);
      setBookBusy(false);
      if (policy?.requirement && paymentsReady !== false) {
        Alert.alert(policy.requirement === 'deposit' ? 'Deposit' : 'Card on file', `Text ${client.name} a link to ${policy.requirement === 'deposit' ? 'pay the deposit' : 'save a card'}?`, [
          { text: 'Yes, send it', onPress: () => void saveBooking('request') },
          { text: 'No, confirm', onPress: () => void saveBooking('skip') },
          { text: 'Cancel', style: 'cancel' },
        ]);
        return;
      }
      if (policy?.requirement) choice = 'skip';
    }
    setBookBusy(true); setError('');
    try {
      const [first, ...more] = serviceLines;
      const created = await api.post<{ id?: number; paymentHold?: { notificationSent?: boolean } }>('/api/appointments', {
        customerId: client.customerId, serviceId: first.serviceId, staffId: slot.staffId, duration: bookMinutes, date: slot.time,
        ...(more.length ? { additionalServiceIds: more.map((l) => l.serviceId) } : {}),
        ...(lines.some((l) => l.addonId) ? { addonIds: lines.filter((l) => l.addonId).map((l) => l.addonId) } : {}),
        ...(choice ? { paymentChoice: choice } : {}),
      });
      if (created?.paymentHold && !created.paymentHold.notificationSent) Alert.alert('Payment link not sent', 'The appointment is on hold, but Certxa could not text the client. Contact the client before the hold expires.');
      say(`BOOKED ${client.name.split(' ')[0].toUpperCase()} · ${slotLabel(slot).toUpperCase()}`, 'ok');
      void refreshBookings();
      setBooking(null); setBookDay(null); clear();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not book it.');
      setBooking((b) => (b ? { ...b, slot: null } : b));
    } finally { setBookBusy(false); }
  };
  // A New booking from elsewhere in the app: its client, services and day.
  useEffect(() => {
    if (!bookRequest?.book) return;
    const digits = (v: string) => v.replace(/\D/g, '').slice(-10);
    const who = clients.find((c) => String(c.customerId) === String(bookRequest.clientId ?? ''))
      ?? (bookRequest.phone && digits(bookRequest.phone).length === 10 ? clients.find((c) => digits(c.phone) === digits(bookRequest.phone!)) : undefined);
    setPaying(null); setPanel(null); setBooking(null);
    setLines([]); setDiscountCents(0);
    setClient(who ? { customerId: who.customerId, name: who.name, phone: who.phone, email: who.email ?? '' } : null);
    const [y, m, d] = String(bookRequest.day ?? '').split('-').map(Number);
    setBookDay(y && m !== undefined && d ? new Date(y, m, d) : null);
    const ids = String(bookRequest.serviceIds ?? '').split(',').map(Number).filter((n) => n > 0);
    const chosen = ids.flatMap((id) => services.filter((sv) => sv.id === id));
    if (chosen.length) setLines(chosen.map((sv, i) => ({ key: `book-${Date.now()}-${i}`, label: sv.name, priceCents: sv.priceCents, kind: 'service', serviceId: sv.id, minutes: sv.duration })));
    say(!who ? 'CHOOSE THE CLIENT, TAP THE SERVICES, THEN BOOK' : chosen.length ? 'TAP BOOK TO PICK THE DAY AND TIME' : 'TAP THE SERVICES, THEN BOOK', 'info');
    if (!who) setPicking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookRequest?.book, services.length]);
  const gridFn = (fn: PosFn) => { if (fn === 'discount') runFn('discount'); else if (fn === 'giftcard') runFn('gift'); };
  const [editingGrid, setEditingGrid] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  const saveGrid = async (config: PosGridConfig | null) => {
    setSavingGrid(true);
    try {
      const r = await api.put<{ config: PosGridConfig | null }>('/api/pro/pos-grid', { config });
      setGridConfig(r?.config ?? null); setEditingGrid(false);
      say(r?.config ? 'KEY GRID SAVED' : 'KEY GRID IS AUTOMATIC AGAIN', 'ok');
    } catch (cause) { Alert.alert('Key grid', cause instanceof Error ? cause.message : 'Could not save the key grid.'); }
    finally { setSavingGrid(false); }
  };

  const catalog = paying ? (
    <View style={styles.catalogColumn}>
      <View style={[styles.panel, styles.catalog, styles.payPanel]} testID="tablet-pos-checkout">
        <PosPayBridgeContext.Provider value={bridge}>
          <PaneHost pane={{ key: paying.appointmentId, Screen: CheckoutScreen, params: paying }}
            onClose={(done) => { setPaying(null); setPayState(null); if (done) clear(); }} />
        </PosPayBridgeContext.Provider>
      </View>
    </View>
  ) : (
    <View style={styles.catalogColumn}>
      <View style={[styles.panel, styles.catalog]} testID="tablet-pos-catalog">
        {booking && serviceLines.length ? (
          <BookingGrid slug={slug} timeZone={timeZone} staffId={ownStaffId} serviceId={serviceLines[0].serviceId!} duration={Math.max(5, bookMinutes)} columns={posGridColumns(gridConfig)}
            startDay={bookDay} slot={booking.slot} onSlot={(s) => setBooking((b) => (b ? { ...b, slot: s } : b))} onServices={() => setBooking(null)} />
        ) : panel ? (
          (panel === 'packages' && shopPackages == null) || (panel === 'memberships' && plans == null) ? <ActivityIndicator color={look.violet} style={{ marginTop: 30 }} />
            : optionKeys.length === 0 ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <Text style={[styles.subtle, styles.empty]}>{panel === 'packages' ? 'No packages for sale yet. Make them in Packages.' : 'No membership plans yet. Make them in Memberships.'}</Text>
                <TouchableOpacity testID="pos-option-back" onPress={() => setPanel(null)} style={styles.secondaryButton}><Text style={styles.secondaryText}>BACK</Text></TouchableOpacity>
              </View>
            : <OptionGrid key={panel} testID={`pos-options-${panel}`} items={optionKeys} columns={posGridColumns(gridConfig)} onBack={() => setPanel(null)} />
        ) : loading ? <ActivityIndicator color={look.violet} style={{ marginTop: 30 }} />
          : groups.length === 0 ? <Text style={[styles.subtle, styles.empty]}>No services yet. Add them in Services.</Text>
          : <PosGrid key={JSON.stringify(gridConfig)} layout={gridConfig} groups={groups} addons={addons} addonGroups={addonGroups.map((g) => g.group)} onService={pickKey} onAddon={pickAddon} onFn={gridFn} />}
      </View>
      {/* The key grid editor: under the grid on the left, in the app-icons button's style (the app-icons button is on the right). */}
      <TouchableOpacity testID="tablet-pos-grid-settings" accessibilityLabel="Key grid" onPress={() => setEditingGrid(true)} activeOpacity={0.85} style={styles.gearShadow}>
        <LinearGradient colors={['#8B5CF6', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gear}>
          <Feather name="settings" size={28} color="#FFFFFF" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 18, paddingBottom: insets.bottom }]}>
      <AppBackground />
      {/* While paying the ticket waits and the keypad types cash (EXIT on the payment side brings everything back). */}
      {wide ? (
        <View style={styles.columns}>{ticket}{keypad}{catalog}</View>
      ) : (
        <View style={styles.columns}>
          <View style={styles.leftColumn}>{ticket}{keypad}</View>
          {catalog}
        </View>
      )}

      {editingGrid ? <PosGridEditor visible groups={groups} addons={addons} addonGroups={addonGroups} config={gridConfig} saving={savingGrid} onSave={(c) => void saveGrid(c)} onClose={() => setEditingGrid(false)} /> : null}
      <ClientLookup visible={picking} clients={clients} busy={busy} error={error} onPick={pickExisting}
        onAdd={(n, ph) => void addNewClient(n, ph)} onClose={() => { setPicking(false); setError(''); }} />
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
  // Side by side: a narrower ticket, so the keypad's keys can be bigger.
  ticketWide: { flexGrow: 0, flexShrink: 0, flexBasis: 320, width: 320 },
  keypad: { width: 450 },
  keypadUnder: { width: 'auto' },
  // The grid ends above the app-icons button (bottom right, components/TabletLauncher.tsx), so its last key — Back — is
  // never under it; the gear sits in that row on the left.
  // minWidth 0: whatever the right side shows (the grid or the payment list) never pushes into the ticket and keypad.
  catalogColumn: { flex: 1, minHeight: 0, minWidth: 0, gap: 12, paddingBottom: 4 },
  catalog: { flex: 1, minHeight: 0, minWidth: 0 },
  payPanel: { padding: 0, overflow: 'hidden' },
  lockedOn: { opacity: 0.4 },
  tender: { fontSize: 16, fontFamily: 'Inter_700Bold', color: look.heading, letterSpacing: 0.5 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, backgroundColor: look.tile, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6 },
  balancePaid: { backgroundColor: '#E7F6EC' },
  balanceText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.heading },
  gearShadow: { alignSelf: 'flex-start', borderRadius: 22, shadowColor: '#4C1D95', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  gear: { width: 62, height: 62, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bookedRow: { borderRadius: 12, backgroundColor: look.tile, paddingHorizontal: 12, paddingVertical: 10, marginTop: 10 },
  bookedText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: look.violetDeep, textAlign: 'center' },
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
  // The message bar and the amount box grow to fill the keypad's panel, pushing the keys down to its bottom.
  status: { minHeight: 46, flexGrow: 1, maxHeight: 110, borderRadius: 12, backgroundColor: look.tile, justifyContent: 'center', paddingHorizontal: 12, marginBottom: 10 },
  statusOk: { backgroundColor: '#E7F6EC' },
  statusError: { backgroundColor: '#FDECEC' },
  statusPrompt: { backgroundColor: look.violet },
  statusText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: look.heading, letterSpacing: 0.3 },
  display: { minHeight: 68, flexGrow: 1.4, maxHeight: 150, borderRadius: 16, backgroundColor: look.pageBottom, borderWidth: 1, borderColor: look.cardBorder, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 12, gap: 10 },
  displayQty: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  displayText: { flex: 1, fontSize: 46, fontFamily: 'Inter_700Bold', textAlign: 'right', color: look.heading },
  keys: { flexDirection: 'row', flexWrap: 'wrap', gap: KEY_GAP },
  // Raised keys (owner, 2026-11-19): a darker bottom edge and a shadow give them depth.
  key: { width: '22.6%', aspectRatio: 1, borderRadius: 16, backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 5, borderBottomColor: '#D8CEF6',
    alignItems: 'center', justifyContent: 'center', shadowColor: '#2E1065', shadowOpacity: 0.18, shadowRadius: 5, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  enterKey: { aspectRatio: undefined, backgroundColor: look.violet, borderColor: look.violet, borderBottomColor: look.violetDeep },
  undoKey: { backgroundColor: look.tile },
  keyText: { fontSize: 32, fontFamily: 'Inter_600SemiBold', color: look.heading },
  enterText: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#FFFFFF', letterSpacing: 0.6 },
  exitText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  keySmall: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: look.subtle, marginTop: -2 },
  fnRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  fnButton: { flex: 1, height: 66, borderRadius: 16, backgroundColor: look.tile, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 4, borderBottomColor: '#D8CEF6',
    alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 6, shadowColor: '#2E1065', shadowOpacity: 0.14, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  fnActive: { borderColor: look.violet, borderWidth: 2 },
  fnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  adjust: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  removeSmall: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
