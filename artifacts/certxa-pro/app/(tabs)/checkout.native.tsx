import { useEffect, useRef, useState } from 'react';
import { PaymentsSetupBanner } from '@/components/PaymentsSetupBanner';
import type { ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { Alert } from '@/lib/appAlert';
import { setCardMethod, setTapToPaySupported, useCardMethod } from '@/lib/cardMethod';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useInPane, usePaneClose, useScreenParams } from '@/components/TabletSplit';
import { useIsTablet } from '@/components/TabletLauncher';
import { usePosPayBridge } from '@/lib/posPayBridge';
import { requestNeededAndroidPermissions, useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import * as WebBrowser from 'expo-web-browser';
import { useColors } from '@/hooks/useColors';
import { TipCheckout } from '@/components/TipCheckout';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import {
  cancelTerminalPaymentIntent,
  captureTerminalPaymentIntent,
  clearPendingTerminalCapture,
  createTerminalPaymentIntent,
  getPendingTerminalCapture,
  getStoredToken,
  getTerminalLocation,
  registerTerminalReader,
  storePendingTerminalCapture,
  CertxaApiError,
  CERTXA_API_BASE_URL,
} from '@/lib/certxa-api';
import { HelpTitle } from '@/components/HelpTitle';
import { usePaymentsReady } from '@/lib/usePaymentsReady';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
import { useOpenBooking } from '@/lib/openBooking';
// Tap to Pay on iPhone needs Apple's managed entitlement in the provisioning
// profile. Today only the development profile carries it (the "preview-dev"
// EAS build profile), so ad hoc and App Store builds cannot use it yet.
// Stripe M2 does not require that Apple entitlement.
const TAP_TO_PAY_ENABLED = true;
// Shown on the payment screen so a tester can tell which build is installed.
const BUILD_LABEL = 'Build Nov 20 · Y';
const EXPO_GO_PREVIEW = process.env.EXPO_PUBLIC_EXPO_GO_PREVIEW === '1';

type PaymentStep = 'idle' | 'tap_intro' | 'initializing' | 'discovering' | 'connecting' | 'ready' | 'processing' | 'capture_pending' | 'success' | 'error';
type ReaderMode = 'tap_to_pay' | 'm2';
// 'credit': the client's referral credit (routes/proReferrals.ts); not in the list below, it has its own button.
type PaymentMethod = 'card' | 'cash' | 'gift_card' | 'credit';

const paymentMethods: Array<{ key: PaymentMethod; label: string; description: string; icon: ComponentProps<typeof Feather>['name'] }> = [
  { key: 'card', label: 'Card', description: 'Stripe reader', icon: 'credit-card' },
  { key: 'gift_card', label: 'Gift card', description: 'Record manually', icon: 'gift' },
  { key: 'cash', label: 'Cash', description: 'Paid in cash', icon: 'dollar-sign' },
];

function dollars(cents: string) {
  const value = (Number(cents || '0') || 0) / 100;
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function errorMessage(cause: unknown) {
  if (cause instanceof Error) return cause.message;
  return 'Something went wrong. Please try again.';
}

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { refresh: refreshBookings, setCalendarDate } = useBookingData();
  // Book the next appointment after checkout (owner, 2026-11-18, GlossGenius style): pick how many weeks out, then the
  // calendar on that day, Instant Book (same weekday, time and services) or the booking form.
  const [nextWeeks, setNextWeeks] = useState<number | null>(null);
  const [rebookNote, setRebookNote] = useState('');
  const [rebooking, setRebooking] = useState(false);
  const nextDay = () => { const d = new Date(); d.setDate(d.getDate() + (nextWeeks ?? 0) * 7); return d; };
  const instantBook = async () => {
    if (!nextWeeks || rebooking) return;
    setRebooking(true); setRebookNote('');
    try {
      const r = await api.post<{ label: string; clash: boolean }>(`/api/appointments/${appointmentId}/rebook`, { weeks: nextWeeks });
      setRebookNote(r.clash ? `Booked for ${r.label}. That time overlaps another booking or blocked time, so check your calendar.` : `Booked for ${r.label}.`);
      void refreshBookings();
    } catch (cause) {
      setRebookNote(errorMessage(cause));
    } finally {
      setRebooking(false);
    }
  };
  // On a tablet the POS shows this checkout in its right side (components/TabletSplit.tsx): the details come from there.
  const params = useScreenParams<{ appointmentId?: string; clientName?: string; serviceName?: string; amountCents?: string; depositCents?: string; phone?: string; email?: string; quickSale?: string; clientId?: string; serviceIds?: string; tipCents?: string; discountCents?: string; taxFreeCents?: string }>();
  const [digits, setDigits] = useState('0');
  const [tipCents, setTipCents] = useState(0);
  const [appointmentId, setAppointmentId] = useState('');
  const [clientName, setClientName] = useState('');
  const [step, setStep] = useState<PaymentStep>('idle');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [giftCardCode, setGiftCardCode] = useState('');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [pendingCaptureId, setPendingCaptureId] = useState<string | null>(null);
  const [readerMode, setReaderMode] = useState<ReaderMode>('m2');
  const [registrationCode, setRegistrationCode] = useState('');
  const [readerSetupText, setReaderSetupText] = useState('');
  const [isRegisteringReader, setIsRegisteringReader] = useState(false);
  const [sales, setSales] = useState<Array<{ amount: string; label: string; time: string }>>([]);
  // The business's name, shown to the client on Apple's Tap to Pay screen ("Pay <business>").
  const [businessName, setBusinessName] = useState('');
  const topInset = insets.top;
  const selectedMethod = paymentMethods.find((method) => method.key === paymentMethod) || paymentMethods[0];

  // The tip comes last (owner, 2026-11-19): checkout opens on the ways to pay. Tap to Pay or Card reader first asks for
  // the tip (tipFor), then starts that payment. A tip already set with the tablet POS's Tip Adjust key skips the question.
  const [tipFor, setTipFor] = useState<ReaderMode | null>(null);
  const presetTip = params.tipCents != null ? Math.max(0, Math.round(Number(params.tipCents) || 0)) : null;
  // Opened for a sale (again, or another one): start on the ways to pay.
  useEffect(() => {
    if (!params.appointmentId || (step !== 'idle' && step !== 'success')) return;
    if (step === 'success' && String(params.appointmentId) === appointmentId) return;
    setTipFor(null); setTipCents(presetTip ?? 0); setPaymentIntentId(null); setError(''); setStatusText('');
    setStep('tap_intro');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appointmentId, step === 'idle']);
  // A POS quick sale (app/(tabs)/pos.tsx) is its own ticket; leaving before paying removes it again.
  const isQuickSale = params.quickSale === '1';

  useEffect(() => {
    if (params.appointmentId) setAppointmentId(String(params.appointmentId));
    // Charges added before are on the booking now, so its amount (amountCents) already has them.
    setCharges([]);
    if (params.clientName) setClientName(String(params.clientName));
    if (params.amountCents && Number(params.amountCents) >= 0) setDigits(String(Math.round(Number(params.amountCents))));
  }, [params.amountCents, params.appointmentId, params.clientName]);

  const {
    initialize,
    supportsReadersOfType,
    discoverReaders,
    cancelDiscovering,
    cancelCollectPaymentMethod,
    connectReader,
    disconnectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    confirmPaymentIntent,
    connectedReader,
    discoveredReaders,
    loading,
  } = useStripeTerminal({
    onUpdateDiscoveredReaders: () => undefined,
    onDidChangeConnectionStatus: (status) => {
      if (status === 'connected') {
        setStep('ready');
        setStatusText(readerMode === 'm2' ? 'Stripe M2 reader is ready.' : 'Tap to Pay is ready.');
      }
    },
  });

  useEffect(() => {
    getPendingTerminalCapture().then((pendingCapture) => {
      if (!pendingCapture) return;
      setDigits(String(pendingCapture.amountCents));
      setClientName(pendingCapture.clientName || '');
      setPaymentIntentId(pendingCapture.paymentIntentId);
      setPendingCaptureId(pendingCapture.paymentIntentId);
      setReaderMode(pendingCapture.method === 'm2' ? 'm2' : 'tap_to_pay');
      setStep('capture_pending');
      setStatusText('A previous payment is authorized and needs to be finalized.');
    }).catch(() => {
      // A stale local recovery record should never block opening checkout.
    });
  }, []);

  useEffect(() => {
    if (step !== 'discovering' || !locationId || connectedReader || !discoveredReaders[0]) return;

    let cancelled = false;
    const isM2 = readerMode === 'm2';
    setStep('connecting');
    setStatusText(isM2 ? 'Connecting to Stripe M2…' : 'Connecting to Tap to Pay…');
    const connection = isM2
      ? connectReader({
          discoveryMethod: 'bluetoothScan',
          reader: discoveredReaders[0],
          locationId,
          autoReconnectOnUnexpectedDisconnect: true,
        })
      : connectReader({
          discoveryMethod: 'tapToPay',
          reader: discoveredReaders[0],
          locationId,
          merchantDisplayName: businessName.trim() || 'Certxa Pro',
          autoReconnectOnUnexpectedDisconnect: true,
          tosAcceptancePermitted: true,
        });
    connection.then((result) => {
      if (cancelled) return;
      if (result.error) {
        setStep('error');
        setError(result.error.message);
        return;
      }
      setStep('ready');
      setStatusText(isM2 ? 'Stripe M2 reader is ready.' : 'Tap to Pay is ready.');
    }).catch((cause) => {
      if (cancelled) return;
      setStep('error');
      setError(errorMessage(cause));
    });

    return () => {
      cancelled = true;
    };
  }, [businessName, connectReader, connectedReader, discoveredReaders, locationId, readerMode, step]);

  useEffect(() => {
    if (step !== 'discovering') return;
    const timer = setTimeout(() => {
      setStep('error');
      setError(readerMode === 'm2'
        ? 'No Stripe M2 reader found. Turn it on, keep it nearby, and do not pair it in iPhone Bluetooth settings.'
        : 'Tap to Pay was not found on this iPhone.');
    }, 30_000);
    return () => clearTimeout(timer);
  }, [readerMode, step]);

  const registerM2Reader = async () => {
    const code = registrationCode.trim();
    if (!code) {
      setError('Enter the registration code shown on the Stripe M2 reader.');
      return;
    }
    setError('');
    setReaderSetupText('Registering Stripe M2…');
    setIsRegisteringReader(true);
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
      const reader = await registerTerminalReader(token, code, 'Certxa Pro M2');
      setRegistrationCode('');
      setReaderSetupText(`M2 registered${reader.serialNumber ? ` · ${reader.serialNumber}` : ''}. It is ready to connect.`);
    } catch (cause) {
      setReaderSetupText('');
      setError(errorMessage(cause));
    } finally {
      setIsRegisteringReader(false);
    }
  };

  // Discount, chosen on the payment screen before the reader starts: a preset percentage or a
  // custom dollar amount off the appointment's price (never more than the price). The tip is
  // added after the discount. Sent to Certxa with the charge so the ticket records it.
  const [discountPercent, setDiscountPercent] = useState(0);
  const [customDiscount, setCustomDiscount] = useState('');
  // Custom charges added here (owner, 2026-11-18, GlossGenius "charge a custom fee"): saved on the booking as priced
  // lines, and part of the bill like its services. `index` is the line's place in the booking's lines.
  const [charges, setCharges] = useState<{ label: string; cents: number; index: number }[]>([]);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeLabel, setChargeLabel] = useState('');
  const [chargePrice, setChargePrice] = useState('');
  const [chargeBusy, setChargeBusy] = useState(false);
  const chargesCents = charges.reduce((n, c) => n + c.cents, 0);
  const baseCentsParam = Math.max(0, Math.round(Number(params.amountCents) || 0)) + chargesCents;
  const addCharge = async () => {
    const label = chargeLabel.trim();
    const cents = Math.round((Number(chargePrice.replace(/[^0-9.]/g, '')) || 0) * 100);
    if (!label) { setError('Name the charge, for example Late fee.'); return; }
    if (cents <= 0) { setError('Enter the amount of the charge.'); return; }
    setChargeBusy(true); setError('');
    try {
      const r = await api.post<{ index: number }>(`/api/pro/appointments/${appointmentId}/custom-charge`, { label, price: cents / 100 });
      setCharges((list) => [...list, { label, cents, index: r.index }]);
      setChargeLabel(''); setChargePrice(''); setChargeOpen(false);
    } catch (cause) { setError(errorMessage(cause)); } finally { setChargeBusy(false); }
  };
  const removeCharge = async (index: number) => {
    setChargeBusy(true); setError('');
    try {
      await api.del(`/api/pro/appointments/${appointmentId}/custom-charge/${index}`);
      // The lines after it move up one place.
      setCharges((list) => list.filter((c) => c.index !== index).map((c) => (c.index > index ? { ...c, index: c.index - 1 } : c)));
    } catch (cause) { setError(errorMessage(cause)); } finally { setChargeBusy(false); }
  };
  const customDiscountCents = Math.round((Number(customDiscount.replace(/[^0-9.]/g, '')) || 0) * 100);
  const discountCents = Math.min(
    baseCentsParam,
    customDiscountCents > 0 ? customDiscountCents : Math.round(baseCentsParam * discountPercent / 100),
  );
  // The tablet POS's Discount key (owner, 2026-11-19): put in as the amount off, which the pro can still change here.
  useEffect(() => {
    const off = Math.round(Number(params.discountCents) || 0);
    if (off > 0) { setDiscountPercent(0); setCustomDiscount((off / 100).toFixed(2)); }
  }, [params.appointmentId, params.discountCents]);
  // A member's discount (owner, 2026-11-15; routes/proMemberships.ts): put in as the amount off, which the pro can change.
  const [memberDiscount, setMemberDiscount] = useState<{ name: string; percent: number } | null>(null);
  useEffect(() => {
    const id = Number(params.appointmentId);
    setMemberDiscount(null);
    if (EXPO_GO_PREVIEW || !id || baseCentsParam <= 0) return;
    api.get<{ discount: { name: string; percent: number } | null }>(`/api/pro/memberships/appointment/${id}`).then((r) => {
      if (!r?.discount || r.discount.percent <= 0) return;
      setMemberDiscount(r.discount);
      setDiscountPercent(0);
      setCustomDiscount((Math.round(baseCentsParam * r.discount.percent / 100) / 100).toFixed(2));
    }).catch(() => undefined);
  }, [params.appointmentId, baseCentsParam]);
  // Promo codes (owner, 2026-11-18, GlossGenius; app/promo-codes.tsx): one code per visit. It becomes the visit's
  // discount (the % and custom amount go away while it's on). A code the client typed when booking online is already on.
  const [promo, setPromo] = useState<{ code: string; cents: number } | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const applyPromo = async (code: string, productsCents: number) => {
    setPromoBusy(true); setError('');
    try {
      const r = await api.post<{ code: string; discountCents: number }>(`/api/pro/appointments/${params.appointmentId}/promo`, { code, servicesCents: baseCentsParam, productsCents });
      setPromo({ code: r.code, cents: r.discountCents }); setPromoInput('');
      setDiscountPercent(0); setCustomDiscount((r.discountCents / 100).toFixed(2));
    } catch (cause) { setError(errorMessage(cause)); } finally { setPromoBusy(false); }
  };
  const removePromo = async () => {
    setPromoBusy(true);
    try { await api.del(`/api/pro/appointments/${params.appointmentId}/promo`); setPromo(null); setCustomDiscount(''); }
    catch (cause) { setError(errorMessage(cause)); } finally { setPromoBusy(false); }
  };
  useEffect(() => {
    const id = Number(params.appointmentId);
    setPromo(null);
    if (EXPO_GO_PREVIEW || !id || isQuickSale) return;
    api.get<{ code: string | null }>(`/api/pro/appointments/${id}/promo`).then((r) => { if (r?.code) void applyPromo(r.code, 0); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.appointmentId]);
  // The business's sales tax (Settings → Sales tax; off unless they turn on tax on services) and tip presets.
  const [tax, setTax] = useState<{ rate: number; services: boolean; retail: number }>({ rate: 0, services: false, retail: 0 });
  const [tipPresets, setTipPresets] = useState<number[] | undefined>(undefined);
  const [defaultTip, setDefaultTip] = useState<number | null>(null);
  // The fee the client pays on a card payment (Settings › Card reader & Checkout), 0 to 3%.
  const [feeRate, setFeeRate] = useState(0);
  const [storeId, setStoreId] = useState<number | null>(null);
  useEffect(() => {
    if (EXPO_GO_PREVIEW) return;
    api.get<{ presets?: number[]; defaultPreset?: number | null }>('/api/tip-presets').then((row) => {
      if (Array.isArray(row?.presets)) setTipPresets(row.presets);
      setDefaultTip(Number(row?.defaultPreset) > 0 ? Number(row!.defaultPreset) : null);
    }).catch(() => undefined);
    api.get<Array<{ id: number; name?: string | null }>>('/api/stores').then(async (rows) => {
      const id = Array.isArray(rows) ? Number(rows[0]?.id) : 0;
      if (!id) return;
      if (rows[0]?.name) setBusinessName(String(rows[0].name));
      setStoreId(id);
      const pos = await api.get<{ salesTaxRate?: string | number; taxServicesTaxable?: boolean; clientFeeRate?: string | number; retailTaxRate?: string | number | null; taxProductsTaxable?: boolean }>(`/api/pos-settings/${id}`);
      const rate = Number(pos?.salesTaxRate ?? 0);
      // Retail tax on products (Settings › Card reader & Checkout); no retail rate yet = the one rate, as Settings shows it.
      const retail = pos?.taxProductsTaxable === false ? 0 : Number(pos?.retailTaxRate != null && pos.retailTaxRate !== '' ? pos.retailTaxRate : rate);
      setTax({ rate: Number.isFinite(rate) && rate > 0 && rate <= 0.3 ? rate : 0, services: Boolean(pos?.taxServicesTaxable), retail: Number.isFinite(retail) && retail > 0 && retail <= 0.3 ? retail : 0 });
      const fee = Number(pos?.clientFeeRate ?? 0);
      setFeeRate(Number.isFinite(fee) && fee > 0 && fee <= 0.03 ? fee : 0);
    }).catch(() => undefined);
  }, []);
  // ── Products and part payments (owner, 2026-11-15: "match GlossGenius"; routes/proCheckout.ts) ──
  // Retail products added to the visit (retail tax on them), and parts already paid on this checkout: a gift card with
  // less on it than the bill, and cash toward it. The rest is paid by card, cash or another gift card.
  type ProductLine = { productId: number; name: string; priceCents: number; quantity: number };
  const [products, setProducts] = useState<ProductLine[]>([]);
  const [catalog, setCatalog] = useState<Array<{ id: number; name: string; priceCents: number; stock: number | null }>>([]);
  const [giftPaidCents, setGiftPaidCents] = useState(0);
  const [cashPartCents, setCashPartCents] = useState(0);
  const [creditPaidCents, setCreditPaidCents] = useState(0);
  const [creditBalanceCents, setCreditBalanceCents] = useState(0);
  const [savingProducts, setSavingProducts] = useState(false);
  useEffect(() => {
    const id = Number(params.appointmentId);
    setProducts([]); setGiftPaidCents(0); setCashPartCents(0); setCreditPaidCents(0); setCreditBalanceCents(0);
    // A quick sale from the tablet POS can hold products too (owner, 2026-11-19), so they are read for it as well.
    if (EXPO_GO_PREVIEW || !id) return;
    api.get<{ products: ProductLine[]; giftCard: { redeemedCents: number }; credit?: { usedCents: number; balanceCents: number } }>(`/api/pro/appointments/${id}/checkout`).then((r) => {
      setProducts(Array.isArray(r?.products) ? r.products : []);
      setGiftPaidCents(Number(r?.giftCard?.redeemedCents) || 0);
      setCreditPaidCents(Number(r?.credit?.usedCents) || 0);
      setCreditBalanceCents(Number(r?.credit?.balanceCents) || 0);
    }).catch(() => undefined);
    api.get<any[]>('/api/products').then((rows) => setCatalog((Array.isArray(rows) ? rows : [])
      .map((p) => ({ id: Number(p.id), name: String(p.name ?? ''), priceCents: Math.round(Number(p.price) * 100) || 0, stock: p.stock == null ? null : Number(p.stock) }))))
      .catch(() => undefined);
  }, [params.appointmentId, params.quickSale]);
  const saveProducts = async (next: ProductLine[]) => {
    const id = Number(appointmentId);
    if (!id || savingProducts) return;
    setSavingProducts(true); setError('');
    try {
      const r = await api.put<{ products: ProductLine[] }>(`/api/pro/appointments/${id}/products`, { items: next.map((l) => ({ productId: l.productId, quantity: l.quantity })) });
      setProducts(Array.isArray(r?.products) ? r.products : next);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setSavingProducts(false); }
  };
  const productCents = products.reduce((n, l) => n + l.priceCents * l.quantity, 0);
  const partialCents = giftPaidCents + cashPartCents + creditPaidCents;
  // Tax is on the visit after the discount (and on products at the retail rate), never on the tip.
  // taxFreeCents: gift cards sold at the tablet POS are not taxed (owner, 2026-11-19).
  const taxFreeCents = Math.max(0, Math.round(Number(params.taxFreeCents) || 0));
  const taxCents = (tax.services && tax.rate > 0 ? Math.round(Math.max(0, baseCentsParam - discountCents - taxFreeCents) * tax.rate) : 0) + Math.round(productCents * tax.retail);
  // A deposit the client paid when booking comes off this charge (it is recorded as already paid).
  const depositCents = Math.max(0, Math.round(Number(params.depositCents) || 0));
  // The client's card fee: on what is charged now, after the discount, tax, deposit and part payments, never on the tip.
  const feeCents = feeRate > 0 ? Math.round(Math.max(0, baseCentsParam - discountCents + productCents + taxCents - depositCents - partialCents) * feeRate) : 0;
  useEffect(() => {
    if (step !== 'tap_intro' || baseCentsParam + productCents <= 0) return;
    setDigits(String(Math.max(0, baseCentsParam - discountCents + productCents + taxCents + tipCents - depositCents - partialCents + feeCents)));
  }, [baseCentsParam, depositCents, discountCents, feeCents, partialCents, productCents, step, taxCents, tipCents]);
  /** How a split checkout was paid, as Certxa records it ("gift_card:20.00,cash:10.00,m2:45.00"); one tender stays as it is. */
  const tenderString = (last: string, lastCents: number) => {
    const parts = [
      ...(creditPaidCents > 0 ? [`credit:${(creditPaidCents / 100).toFixed(2)}`] : []),
      ...(giftPaidCents > 0 ? [`gift_card:${(giftPaidCents / 100).toFixed(2)}`] : []),
      ...(cashPartCents > 0 ? [`cash:${(cashPartCents / 100).toFixed(2)}`] : []),
    ];
    return parts.length ? [...parts, `${last}:${(lastCents / 100).toFixed(2)}`].join(',') : last;
  };
  const [paidSummary, setPaidSummary] = useState('');
  const partsSummary = (lastLabel: string, lastCents: number) => [
    ...(creditPaidCents > 0 ? [`Credit ${dollars(String(creditPaidCents))}`] : []),
    ...(giftPaidCents > 0 ? [`Gift card ${dollars(String(giftPaidCents))}`] : []),
    ...(cashPartCents > 0 ? [`Cash ${dollars(String(cashPartCents))}`] : []),
    `${lastLabel} ${dollars(String(lastCents))}`,
  ].join(' · ');

  // Receipt after a card payment, by text and/or e-mail, to the client's details (editable).
  const [receiptPhone, setReceiptPhone] = useState(String(params.phone ?? '').replace(/\D/g, '').slice(-10));
  const [receiptEmail, setReceiptEmail] = useState(String(params.email ?? ''));
  const [receiptNote, setReceiptNote] = useState('');
  const [sendingReceipt, setSendingReceipt] = useState<'' | 'text' | 'email'>('');
  const sendReceipt = async (kind: 'text' | 'email') => {
    const visit = String(params.serviceName || 'Appointment');
    // The receipt after any payment (card, cash, gift card, or a split), with the products sold (owner, 2026-11-15).
    const paidFee = paymentMethod === 'card' ? feeCents : 0;
    const totals = { discountAmount: discountCents / 100, taxAmount: taxCents / 100, tipAmount: tipCents / 100, grandTotal: (baseCentsParam - discountCents + productCents + taxCents + tipCents + paidFee) / 100 };
    const lines = [{ name: visit, price: baseCentsParam / 100 }, ...products.map((l) => ({ name: l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name, price: (l.priceCents * l.quantity) / 100 })), ...(paidFee > 0 ? [{ name: 'Platform fee', price: paidFee / 100 }] : [])];
    const method = paidSummary || (paymentMethod === 'cash' ? 'Cash' : paymentMethod === 'gift_card' ? 'Gift card' : paymentMethod === 'credit' ? 'Credit' : 'Card');
    setSendingReceipt(kind); setReceiptNote('');
    try {
      if (kind === 'text') {
        await api.post('/api/pos/sms-receipt', { phone: receiptPhone, clientName, appointmentId: Number(appointmentId) || undefined, paymentMethod: paymentMethod === 'card' && !paidSummary ? 'card' : method,
          items: lines.map((l) => ({ label: l.name, price: l.price })), ...totals });
        setReceiptNote(`Receipt texted to ${receiptPhone}.`);
        goHome();
        return;
      } else {
        await api.post('/api/pos/email-receipt', { storeId: storeId ?? undefined, email: receiptEmail.trim(), clientName: clientName.trim().split(/\s+/)[0] || 'there',
          items: lines, subtotal: lines.reduce((n, l) => n + l.price, 0), paymentMethod: method, transactionId: paymentIntentId ?? '', ...totals });
        setReceiptNote(`Receipt e-mailed to ${receiptEmail.trim()}.`);
        goHome();
        return;
      }
    } catch (cause) {
      setReceiptNote(errorMessage(cause));
    } finally {
      setSendingReceipt('');
    }
  };

  const startReader = async (mode: ReaderMode) => {
    if (Number(digits) < 50) {
      setError('Enter an amount of at least $0.50.');
      return;
    }
    setError('');
    // Never take a second payment for a booking: ask Certxa for its current status first.
    const paidCheckId = Number(appointmentId);
    if (!EXPO_GO_PREVIEW && Number.isInteger(paidCheckId) && paidCheckId > 0) {
      try {
        const current = await api.get<{ status?: string | null; totalPaid?: string | number | null }>(`/api/appointments/${paidCheckId}`);
        // Completed with no payment (MARK AS COMPLETED) still owes the visit.
        const alreadyPaid = (current?.status === 'completed' && current?.totalPaid != null) || current?.status === 'paid';
        if (alreadyPaid || current?.status === 'cancelled') {
          setError(alreadyPaid ? 'This appointment has already been paid.' : 'This appointment was cancelled.');
          void refreshBookings();
          return;
        }
      } catch {
        setError('Could not check this appointment with Certxa. Check the connection and try again.');
        return;
      }
    }
    setReaderMode(mode);
    // The M2 is still connected from the last card payment: it is ready, no new search (a search only ever looks for a
    // reader not yet connected, so it would wait forever).
    if (mode === 'm2' && connectedReader && !EXPO_GO_PREVIEW) {
      setStep('ready');
      setStatusText('Stripe M2 reader is ready.');
      return;
    }
    setStep('initializing');
    setStatusText(mode === 'm2' ? 'Preparing Stripe M2…' : 'Preparing Tap to Pay…');

    if (EXPO_GO_PREVIEW) {
      setStep('ready');
      setStatusText(`${mode === 'm2' ? 'Stripe M2' : 'Tap to Pay'} preview is ready in Expo Go.`);
      return;
    }

    try {
      // Android asks the person for location and Bluetooth before the reader search can run (Stripe Terminal's rule).
      if (Platform.OS === 'android') {
        const allowed = await requestNeededAndroidPermissions({ accessFineLocation: {
          title: 'Location for card payments', message: 'Stripe needs your location to take card payments with the card reader.', buttonPositive: 'Allow',
        } });
        if (allowed.error) throw new Error('Allow Location and Nearby devices for Certxa Pro, then try the card reader again.');
      }
      const initialized = await initialize();
      if (initialized.error) throw new Error(initialized.error.message);
      // Tap to Pay needs a phone that can do it (Android: NFC). One that can't is switched off as an option (owner,
      // 2026-11-20; Settings › Card payments).
      if (mode === 'tap_to_pay') {
        const support = await supportsReadersOfType({ deviceType: 'tapToPay', discoveryMethod: 'tapToPay', simulated: false });
        if (!support.error && !support.readerSupportResult) {
          setTapToPaySupported(false);
          throw new Error('This phone can’t take Tap to Pay (it has no NFC). Take cards with the Stripe M2 card reader: Settings › Card payments.');
        }
      }

      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
      const location = await getTerminalLocation(token);
      setLocationId(location.locationId);
      setStep('discovering');
      setStatusText(mode === 'm2' ? 'Looking for a nearby Stripe M2 reader…' : 'Looking for Tap to Pay…');
      const discovered = await discoverReaders({
        discoveryMethod: mode === 'm2' ? 'bluetoothScan' : 'tapToPay',
        simulated: false,
      });
      if (discovered.error) throw new Error(discovered.error.message);
    } catch (cause) {
      setStep('error');
      setError(errorMessage(cause));
    }
  };

  const processPayment = async () => {
    const amountCents = Number(digits);
    if (EXPO_GO_PREVIEW) {
      if (amountCents < 50) {
        setError('Enter an amount of at least $0.50.');
        return;
      }

      setError('');
      setSales((current) => [
        { amount: dollars(digits), label: 'Card payment', time: 'Just now · Expo Go preview' },
        ...current,
      ]);
      setStatusText('Expo Go preview payment complete.');
      setStep('success');
      return;
    }

    const numericAppointmentId = Number(appointmentId);
    if (!Number.isInteger(numericAppointmentId) || numericAppointmentId < 1) {
      setError('Enter the numeric Certxa appointment ID for this checkout.');
      return;
    }
    if (!connectedReader) {
      setError(`Connect ${readerMode === 'm2' ? 'the Stripe M2 reader' : 'Tap to Pay'} before accepting a payment.`);
      return;
    }

    setError('');
    setStep('processing');
    setStatusText('Preparing payment…');
    let createdPaymentIntentId: string | null = null;
    let captured = false;
    let paymentMayBeAuthorized = false;
    // Which step is running, so an error says where it happened.
    let phase = 'Create payment';

    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');

      const created = await createTerminalPaymentIntent(token, {
        amountCents,
        appointmentId: numericAppointmentId,
        clientName: clientName.trim() || undefined,
        method: readerMode,
        tipCents,
        discountCents,
        priorTenderedCents: depositCents + partialCents,
        clientFeeCents: feeCents,
        saveCard: keepCard,
      });
      createdPaymentIntentId = created.paymentIntentId;
      setPaymentIntentId(created.paymentIntentId);

      phase = 'Load payment';
      const retrieved = await retrievePaymentIntent(created.clientSecret);
      if (retrieved.error || !retrieved.paymentIntent) throw new Error(retrieved.error?.message || 'Unable to prepare the payment.');

      setStatusText(readerMode === 'm2' ? 'Tap, insert, or swipe the card on the M2 reader…' : 'Hold the customer’s card near this phone…');
      phase = 'Read card';
      // Saving the card needs the client's OK recorded with it (Stripe: allowRedisplay).
      const collected = await collectPaymentMethod({ paymentIntent: retrieved.paymentIntent, ...(keepCard ? { allowRedisplay: 'always' as const } : {}) });
      if (collected.error || !collected.paymentIntent) throw new Error(collected.error?.message || 'Payment collection was not completed.');

      setStatusText('Confirming payment…');
      // Confirm the card that was just collected. (In this Stripe Terminal SDK, processPaymentIntent
      // is collect + confirm in one call - using it after collectPaymentMethod asks the reader to
      // collect a second time and fails with "The reader is busy".)
      phase = 'Charge card';
      const processed = await confirmPaymentIntent({ paymentIntent: collected.paymentIntent });
      if (processed.error || !processed.paymentIntent) throw new Error(processed.error?.message || 'Payment confirmation was not completed.');

      paymentMayBeAuthorized = true;
      try {
        await storePendingTerminalCapture({
          paymentIntentId: created.paymentIntentId,
          amountCents,
          clientName: clientName.trim() || undefined,
          method: readerMode,
        });
      } catch {
        // Storage recovery is best-effort; it must not block capture.
      }
      setStatusText('Finalizing payment…');
      phase = 'Finalize';
      const capturedPayment = await captureTerminalPaymentIntent(token, created.paymentIntentId, tenderString(readerMode, amountCents));
      captured = true;
      if (partialCents > 0) setPaidSummary(partsSummary('Card', amountCents));
      try {
        await clearPendingTerminalCapture();
      } catch {
        // A stale recovery record is safe because capture is idempotent.
      }
      setPendingCaptureId(null);
      setSales((current) => [
        { amount: dollars(String(capturedPayment.amount)), label: clientName.trim() || 'In-person service', time: 'Just now · Certxa' },
        ...current,
      ]);
      setStep('success');
      setStatusText('Payment complete.');
      void refreshBookings();
    } catch (cause) {
      if (paymentMayBeAuthorized && createdPaymentIntentId && !captured) {
        setPaymentIntentId(createdPaymentIntentId);
        setPendingCaptureId(createdPaymentIntentId);
        setStep('capture_pending');
        setStatusText('Payment authorized. Retry capture to finish it.');
        setError(cause instanceof CertxaApiError && cause.status === 401 ? 'Your Certxa session expired. Sign in again, then retry capture.' : errorMessage(cause));
        return;
      }

      if (createdPaymentIntentId && !captured) {
        try {
          await cancelTerminalPaymentIntent(await getStoredToken() || '', createdPaymentIntentId);
        } catch {
          // The original payment error is more useful to the user than cleanup details.
        }
      }
      if (cardCancelled.current) {
        cardCancelled.current = false;
        setStep('tap_intro'); setError(''); setStatusText('Card payment cancelled.');
        return;
      }
      setStep('error');
      setError(cause instanceof CertxaApiError && cause.status === 401 ? 'Your Certxa session has expired. Please sign in again.' : `${phase}: ${errorMessage(cause)}`);
    }
  };

  // The tablet POS's card reader screen (owner, 2026-11-19): no way out but Cancel, which first asks the pro to make sure
  // the client isn't about to pay. Continue stops the reader (a card being read is let go and its unpaid charge
  // cancelled) and goes back to the ways to pay; the reader stays connected for the next card.
  const cardCancelled = useRef(false);
  const cancelCardPayment = () => {
    const stop = async () => {
      if (step === 'processing') { cardCancelled.current = true; await cancelCollectPaymentMethod().catch(() => undefined); return; }
      if (step === 'discovering') await cancelDiscovering().catch(() => undefined);
      setPaymentIntentId(null); setError(''); setStatusText('Card payment cancelled.');
      setStep('tap_intro');
    };
    if (step === 'error') { void stop(); return; }
    Alert.alert('Cancel the card payment?', 'Make sure your client is not about to tap, insert or swipe their card.', [
      { text: 'Keep waiting', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => void stop() },
    ]);
  };

  const processManualPayment = () => {
    if (Number(digits) < 50) {
      setError('Enter an amount of at least $0.50.');
      return;
    }

    setError('');
    setSales((current) => [
      {
        amount: dollars(digits),
        label: `${selectedMethod.label} payment${paymentMethod === 'gift_card' && giftCardCode.trim() ? ` · ${giftCardCode.trim()}` : ''}`,
        time: 'Just now · Recorded manually',
      },
      ...current,
    ]);
    setStatusText(`${selectedMethod.label} payment recorded.`);
    setStep('success');
  };

  // ── Cash and Certxa gift cards (owner, 2026-11-15) ──
  // No card fee on these. The booking is marked paid like a card checkout (sale, tip, discount, loyalty), with the
  // deposit counted in the total as the card path does. A gift card is taken first (once per booking, so a retry is safe).
  const paymentsReady = usePaymentsReady();
  const [giftOpen, setGiftOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const [changeCents, setChangeCents] = useState(0);
  const [recording, setRecording] = useState(false);
  // Payments taken outside Certxa (owner, 2026-11-18, GlossGenius "alternative payment methods"): recorded, not processed.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherKind, setOtherKind] = useState<'check' | 'venmo' | 'zelle' | 'paypal' | 'other' | null>(null);
  const [otherLabel, setOtherLabel] = useState('');
  const otherName = otherKind === 'other' ? otherLabel.trim() : ({ check: 'Check', venmo: 'Venmo', zelle: 'Zelle', paypal: 'PayPal' } as Record<string, string>)[otherKind ?? ''] ?? '';
  const offlineDueCents = Math.max(0, baseCentsParam - discountCents + productCents + taxCents + tipCents - depositCents - partialCents);
  // `givenOverride`: the cash typed on the tablet POS keypad (lib/posPayBridge.ts) instead of this screen's cash box.
  // `override`: from the tablet POS, the gift card number typed on its keypad and the Other button tapped (their state may
  // not be set yet when the payment is recorded).
  const recordOfflinePayment = async (method: 'cash' | 'gift_card' | 'credit' | 'other', givenOverride?: number,
    override?: { code?: string; otherName?: string; otherKind?: string }) => {
    const apptId = Number(appointmentId);
    const giftCode = (override?.code ?? giftCardCode).trim();
    const otherNameNow = override?.otherName ?? otherName;
    const otherKindNow = override?.otherKind ?? otherKind;
    if (!Number.isInteger(apptId) || apptId <= 0) { setError('This payment has no booking to record it on.'); return; }
    if (method === 'gift_card' && !giftCode) { setError('Enter the gift card code.'); return; }
    if (offlineDueCents <= 0) { setError('There is nothing left to pay.'); return; }
    if (method === 'other' && !otherNameNow) { setError(otherKind === 'other' ? 'Type how the client paid.' : 'Choose how the client paid.'); return; }
    // Cash: what the client handed over. Less than the bill pays part of it; more gives change.
    const givenCents = method === 'cash' ? givenOverride ?? Math.round((Number(cashGiven.replace(/[^0-9.]/g, '')) || 0) * 100) : 0;
    if (method === 'cash' && givenCents <= 0) { setError('Enter the cash the client gave you.'); return; }
    setRecording(true); setError('');
    try {
      let thisCents = method === 'cash' ? Math.min(givenCents, offlineDueCents) : offlineDueCents;
      if (method === 'gift_card' && !EXPO_GO_PREVIEW) {
        // Pays what the card has, up to the bill. What a card already paid on this visit is never counted twice.
        await api.post(`/api/pro/appointments/${apptId}/gift-card`, { code: giftCode, amountCents: offlineDueCents, partial: true });
        const r = await api.get<{ giftCard: { redeemedCents: number } }>(`/api/pro/appointments/${apptId}/checkout`);
        const total = Number(r?.giftCard?.redeemedCents) || 0;
        thisCents = total - giftPaidCents;
        if (thisCents <= 0) { setError('This gift card was already used on this visit.'); return; }
        if (thisCents < offlineDueCents) {
          setGiftPaidCents(total); setGiftOpen(false); setGiftCardCode('');
          setStatusText(`Gift card paid ${dollars(String(thisCents))}. ${dollars(String(offlineDueCents - thisCents))} left to pay.`);
          return;
        }
      }
      if (method === 'credit' && !EXPO_GO_PREVIEW) {
        // The client's credit, up to the bill; once per booking.
        const r = await api.post<{ usedCents: number }>(`/api/pro/appointments/${apptId}/credit`, { amountCents: offlineDueCents });
        thisCents = Number(r?.usedCents) || 0;
        setCreditBalanceCents((b) => Math.max(0, b - thisCents));
        if (thisCents < offlineDueCents) {
          setCreditPaidCents(thisCents);
          setStatusText(`Credit paid ${dollars(String(thisCents))}. ${dollars(String(offlineDueCents - thisCents))} left to pay.`);
          return;
        }
      }
      if (method === 'cash' && givenCents < offlineDueCents) {
        setCashPartCents((c) => c + givenCents); setCashOpen(false); setCashGiven('');
        setStatusText(`Cash ${dollars(String(givenCents))} taken. ${dollars(String(offlineDueCents - givenCents))} left to pay.`);
        return;
      }
      if (!EXPO_GO_PREVIEW) {
        await api.patch(`/api/appointments/${apptId}`, {
          status: 'completed', paymentMethod: tenderString(method === 'other' ? (otherKindNow === 'other' ? otherNameNow.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'other' : String(otherKindNow)) : method, thisCents),
          totalPaid: ((thisCents + partialCents + depositCents) / 100).toFixed(2),
          tipAmount: (tipCents / 100).toFixed(2), discountAmount: (discountCents / 100).toFixed(2),
          serviceRevenue: (Math.max(0, baseCentsParam - discountCents) / 100).toFixed(2), productRevenue: (productCents / 100).toFixed(2),
        });
      }
      const label = method === 'cash' ? 'Cash' : method === 'credit' ? 'Credit' : method === 'other' ? otherNameNow : 'Gift card';
      if (partialCents > 0 || method === 'credit') setPaidSummary(partsSummary(label, thisCents));
      else if (method === 'other') setPaidSummary(label);
      setChangeCents(method === 'cash' ? Math.max(0, givenCents - offlineDueCents) : 0);
      setPaymentMethod(method === 'other' ? 'cash' : method);
      setDigits(String(thisCents + partialCents));
      setSales((current) => [{ amount: dollars(String(thisCents + partialCents)), label: `${label} · ${clientName.trim() || 'In-person service'}`, time: 'Just now · Certxa' }, ...current]);
      setStatusText('Payment complete.');
      setStep('success');
      void refreshBookings();
    } catch (cause) {
      setError(cause instanceof CertxaApiError && cause.status === 401 ? 'Your Certxa session has expired. Please sign in again.' : errorMessage(cause));
    } finally { setRecording(false); }
  };
  // Card payments need Stripe set up; until then the card buttons open the set-up page.
  // Without Stripe set up the card buttons are switched off (owner, 2026-11-15): cash and gift card still work.
  const cardsOff = paymentsReady === false;
  // The tablet POS (owner, 2026-11-19, /nail's way): its keypad's ENTER records the typed cash here, and the ticket shows
  // what is paid and what is left.
  const posBridge = usePosPayBridge();
  const cashFromKeypad = useRef<(cents: number) => void>(() => undefined);
  // GIFT CARD chosen: the typed digits are the gift card number (number-only for now; owner, 2026-11-19). Otherwise cash.
  cashFromKeypad.current = (cents: number) => {
    if (step !== 'tap_intro' || recording) return;
    if (giftOpen) { const code = String(cents); setGiftCardCode(code); void recordOfflinePayment('gift_card', undefined, { code }); return; }
    void recordOfflinePayment('cash', cents);
  };
  useEffect(() => {
    if (!posBridge) return;
    posBridge.setCashHandler((cents) => cashFromKeypad.current(cents));
    return () => posBridge.setCashHandler(null);
  }, [posBridge]);
  useEffect(() => {
    posBridge?.report({ cashCents: cashPartCents, giftCents: giftPaidCents, creditCents: creditPaidCents, dueCents: step === 'success' ? 0 : offlineDueCents,
      changeCents: step === 'success' ? changeCents : 0, paid: step === 'success', message: statusText, error, keypad: giftOpen ? 'gift' : 'cash' });
  }, [posBridge, cashPartCents, giftPaidCents, creditPaidCents, offlineDueCents, changeCents, step, statusText, error, giftOpen]);

  const startCard = (mode: ReaderMode) => { if (!cardsOff) void startReader(mode); };

  // ── Card on file and Enter new card (owner, 2026-11-17) ──
  // Neither needs a reader: the card is held on the business's Stripe account like a reader payment, then the same
  // capture records the whole sale (tip, discount, other payments, card fee).
  const [savedCard, setSavedCard] = useState<{ brand: string | null; last4: string | null } | null>(null);
  const [charging, setCharging] = useState<null | 'saved' | 'keyed'>(null);
  // Save card on file (owner, 2026-11-18): a card paying a booking is kept on the client for later charges (no-show and
  // late-cancel fees, Card on file), with the client's OK. Offered while the client has no card saved.
  const [saveCard, setSaveCard] = useState(true);
  const offerSave = !savedCard && Number(appointmentId) > 0 && !isQuickSale;
  const keepCard = offerSave && saveCard;
  const [splitOpen, setSplitOpen] = useState(false);
  useEffect(() => {
    const apptId = Number(appointmentId);
    if (EXPO_GO_PREVIEW || isQuickSale || !Number.isInteger(apptId) || apptId <= 0) { setSavedCard(null); return; }
    let cancelled = false;
    api.get<{ card: { brand: string | null; last4: string | null } | null }>(`/api/payments/terminal/card-on-file?appointmentId=${apptId}`)
      .then((r) => { if (!cancelled) setSavedCard(r?.card ?? null); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [appointmentId, isQuickSale]);
  const payWithoutReader = async (method: 'card_on_file' | 'keyed') => {
    const apptId = Number(appointmentId);
    const amountCents = Number(digits);
    if (!Number.isInteger(apptId) || apptId <= 0) { setError('This payment has no booking to record it on.'); return; }
    if (amountCents < 50) { setError('Card payments must be at least $0.50.'); return; }
    setError(''); setCharging(method === 'card_on_file' ? 'saved' : 'keyed');
    let created: { paymentIntentId: string } | null = null;
    let captured = false;
    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
      const made = await createTerminalPaymentIntent(token, {
        amountCents, appointmentId: apptId, clientName: clientName.trim() || undefined, method,
        tipCents, discountCents, priorTenderedCents: depositCents + partialCents, clientFeeCents: feeCents,
        saveCard: method === 'keyed' && keepCard,
      });
      created = made;
      if (method === 'keyed') {
        if (!made.publishableKey || !made.stripeAccount) throw new Error('Card entry is not available for this business right now.');
        const ret = 'certxa-pro://card-entry';
        const page = `${CERTXA_API_BASE_URL.replace(/\/$/, '')}/card-entry#${new URLSearchParams({
          s: made.clientSecret, pk: made.publishableKey, acct: made.stripeAccount, amt: String(amountCents), biz: businessName.trim(), ret,
        }).toString()}`;
        const r = await WebBrowser.openAuthSessionAsync(page, ret);
        if (r.type !== 'success' || !/[?&]pi=/.test(r.url)) throw new Error('The card was not entered, so nothing was charged.');
      }
      const done = await captureTerminalPaymentIntent(token, made.paymentIntentId, tenderString('card', amountCents));
      captured = true;
      setPaymentIntentId(made.paymentIntentId);
      const cardName = method === 'card_on_file' ? `card on file${savedCard?.last4 ? ` ending ${savedCard.last4}` : ''}` : 'card';
      setPaidSummary(partialCents > 0 ? partsSummary('Card', amountCents) : cardName);
      setSales((current) => [{ amount: dollars(String(done.amount)), label: clientName.trim() || 'In-person service', time: 'Just now · Certxa' }, ...current]);
      setStep('success');
      setStatusText('Payment complete.');
      void refreshBookings();
    } catch (cause) {
      if (created && !captured) {
        try { await cancelTerminalPaymentIntent(await getStoredToken() || '', created.paymentIntentId); } catch { /* the first error matters more */ }
      }
      setError(cause instanceof CertxaApiError && cause.status === 401 ? 'Your Certxa session has expired. Please sign in again.' : errorMessage(cause));
    } finally {
      setCharging(null);
    }
  };
  const payWithSavedCard = () => {
    const card = savedCard?.last4 ? `${savedCard.brand ? `${savedCard.brand[0].toUpperCase()}${savedCard.brand.slice(1)} ` : ''}ending ${savedCard.last4}` : 'card on file';
    Alert.alert(`Charge ${dollars(digits)}?`, `It will be charged to ${clientName.trim() || 'the client'}'s ${card}.`, [
      { text: 'Not now', style: 'cancel' },
      { text: `Charge ${dollars(digits)}`, onPress: () => void payWithoutReader('card_on_file') },
    ]);
  };

  const retryCapture = async () => {
    if (!pendingCaptureId) return;

    setError('');
    setStep('processing');
    setStatusText('Retrying payment finalization…');

    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');
      const capturedPayment = await captureTerminalPaymentIntent(token, pendingCaptureId, readerMode);
      try {
        await clearPendingTerminalCapture();
      } catch {
        // A stale recovery record is safe because capture is idempotent.
      }
      setPendingCaptureId(null);
      setSales((current) => [
        { amount: dollars(String(capturedPayment.amount)), label: clientName.trim() || 'In-person service', time: 'Just now · Certxa' },
        ...current,
      ]);
      setStep('success');
      setStatusText('Payment complete.');
    } catch (cause) {
      setStep('capture_pending');
      setStatusText('Payment authorized. Retry capture to finish it.');
      setError(cause instanceof CertxaApiError && cause.status === 401 ? 'Your Certxa session has expired. Please sign in again.' : errorMessage(cause));
    }
  };

  const exitReaderCheckout = async () => {
    if (step === 'tap_intro') { leaveCheckout(); return; }
    if (pendingCaptureId) {
      setError('Retry capture before leaving. This payment is authorized but not finalized.');
      return;
    }
    if (connectedReader) await disconnectReader();
    setLocationId(null);
    setPaymentIntentId(null);
    setError('');
    // Back to the ways to pay.
    setStep('tap_intro');
    setStatusText('');
  };

  const clearCheckout = () => {
    setDigits('0');
    setTipCents(0);
    setAppointmentId('');
    setClientName('');
    setError('');
    setStep('idle');
    setStatusText('');
    setPaymentIntentId(null);
    setPendingCaptureId(null);
    setPaymentMethod('card');
    setGiftCardCode('');
    setGiftOpen(false);
    setCashOpen(false); setCashGiven(''); setChangeCents(0); setPaidSummary('');
    setNextWeeks(null); setRebookNote('');
    setOtherOpen(false); setOtherKind(null); setOtherLabel('');
    setCharges([]); setChargeOpen(false); setChargeLabel(''); setChargePrice('');
    setPromo(null); setPromoInput('');
    setProducts([]); setGiftPaidCents(0); setCashPartCents(0); setCreditPaidCents(0); setCreditBalanceCents(0);
    void clearPendingTerminalCapture();
  };
  const inPane = useInPane();
  const closePane = usePaneClose();
  // Choose another time: New booking on a phone, the POS's booking on a tablet (lib/openBooking.ts).
  const openBooking = useOpenBooking();
  const isTablet = useIsTablet();
  const resetCheckout = () => {
    clearCheckout();
    // Paid: the tablet POS takes its grid back and starts a new ticket.
    if (isQuickSale) { if (inPane) closePane(true); else router.replace('/(tabs)/pos'); }
  };
  // Back from the ways to pay: out of the checkout. An unpaid quick sale's ticket is removed (refused by the server once
  // anything was paid).
  const leaveCheckout = () => {
    if (isQuickSale) {
      const saleId = Number(params.appointmentId);
      if (Number.isInteger(saleId) && saleId > 0) void api.del(`/api/quick-sales/${saleId}`).catch(() => undefined);
      clearCheckout();
      if (inPane) closePane(); else router.replace('/(tabs)/pos');
      return;
    }
    clearCheckout();
    if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
  };
  // What is due before the tip: the visit after the discount, products, tax, the card fee, less what is already paid.
  const dueBeforeTip = Math.max(0, baseCentsParam - discountCents + productCents + taxCents - depositCents - partialCents + feeCents);
  const chooseCard = (mode: ReaderMode) => {
    if (cardsOff) return;
    if (presetTip != null) { startCard(mode); return; }
    setTipFor(mode);
  };
  // Card (owner, 2026-11-20): the way this device takes cards (Settings › Card payments; a tablet always the M2). Not
  // chosen yet: asked once here, and kept.
  const [cardMethod, tapSupported] = useCardMethod();
  const tapLabel = Platform.OS === 'ios' ? 'Tap to Pay on iPhone' : 'Tap to Pay on this phone';
  // A tablet, or a phone that can't do Tap to Pay, has only the card reader.
  const deviceCardMethod: ReaderMode | null = isTablet || tapSupported === false ? 'm2' : cardMethod;
  const payByCard = () => {
    if (cardsOff) return;
    if (deviceCardMethod) { chooseCard(deviceCardMethod); return; }
    Alert.alert('Take card payments with', 'Choose how this phone takes cards. You can change it in Settings › Card payments.', [
      ...(tapSupported === false ? [] : [{ text: tapLabel, onPress: () => { setCardMethod('tap_to_pay'); chooseCard('tap_to_pay'); } }]),
      { text: 'Stripe M2 card reader', onPress: () => { setCardMethod('m2'); chooseCard('m2'); } },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };
  // A receipt sent from "Payment successful" finishes the checkout: back to Home (owner, 2026-11-15).
  const goHome = () => {
    clearCheckout();
    // In the tablet POS: the grid comes back with a new ticket.
    if (inPane) { closePane(true); return; }
    router.replace('/(tabs)');
  };

  // Tap to Pay or Card reader chosen: the tip, then that payment starts.
  if (tipFor) {
    return <TipCheckout
      baseCents={Number(params.amountCents) || 0}
      presets={tipPresets}
      defaultPercent={defaultTip}
      serviceName={String(params.serviceName || '')}
      onBack={() => setTipFor(null)}
      onConfirmTip={(nextTipCents) => {
        const mode = tipFor;
        setTipCents(nextTipCents);
        setDigits(String(dueBeforeTip + nextTipCents));
        setTipFor(null);
        startCard(mode);
      }}
    />;
  }

  if (step !== 'idle') {
    const isTapIntro = step === 'tap_intro';
    const isReady = step === 'ready';
    const isCapturePending = step === 'capture_pending';
    const isSuccess = step === 'success';
    // Stripe Terminal reports `loading` until initialize() has run, and initialize() only runs when
    // "Start Tap to Pay" is pressed - so `loading` must not disable that button.
    const isBusy = (loading && !isTapIntro) || ['initializing', 'discovering', 'connecting', 'processing'].includes(step);

    return (
      <View style={[styles.root, { backgroundColor: look.pageTop, paddingTop: topInset }]}>
        <AppBackground />
        <StatusBar barStyle="dark-content" />
        {/* In the tablet POS the ways to pay are a page of their own (owner, 2026-11-19): no header and no Amount due (the
            ticket beside it shows the total), and EXIT at the bottom puts the POS back as it was. */}
        {inPane ? null : <View style={styles.tapHeader}>
          {/* Back: from a card payment to the ways to pay; from the ways to pay out of the checkout. Not while a card payment
              is going through, or one is waiting to be finalized. */}
          {isSuccess ? <View style={{ width: 84 }} /> : (
            <TouchableOpacity disabled={isCapturePending || step === 'processing'} testID="cancel-reader" onPress={exitReaderCheckout}
              style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
              <Feather name="arrow-left" size={20} color={isCapturePending || step === 'processing' ? colors.muted : colors.foreground} />
              <Text style={[styles.backText, { color: isCapturePending || step === 'processing' ? colors.muted : colors.foreground }]}>Back</Text>
            </TouchableOpacity>
          )}
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>IN-PERSON CHECKOUT</Text>
          <View style={{ width: 84 }} />
        </View>}
        {isSuccess ? (
          <View style={styles.successContent}>
            <View style={[styles.successBadge, { backgroundColor: colors.secondary }]}><Feather name="check" size={32} color={colors.primary} /></View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Payment successful</Text>
            <Text style={[styles.successAmount, { color: colors.foreground }]}>{dollars(digits)}</Text>
            <Text style={[styles.successNote, { color: colors.mutedForeground }]}>{paidSummary ? `Paid by ${paidSummary}` : paymentMethod === 'card' ? `Captured through Certxa · ${paymentIntentId}` : `Paid by ${selectedMethod.label.toLowerCase()}${paymentMethod === 'gift_card' && giftCardCode.trim() ? ` · ${giftCardCode.trim().toUpperCase()}` : ''}`}</Text>
            {changeCents > 0 ? <Text testID="cash-change" style={[styles.successTitle, { color: colors.foreground, fontSize: 22, marginBottom: 12 }]}>{`Change: ${dollars(String(changeCents))}`}</Text> : null}
            {/* A receipt after any payment: card, cash, gift card or a split (owner, 2026-11-15). */}
            {step === 'success' ? <View testID="receipt-block" style={{ width: '100%', gap: 8, marginBottom: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Send a receipt</Text>
              <View style={styles.registrationRow}>
                <TextInput testID="receipt-phone" keyboardType="phone-pad" value={receiptPhone} onChangeText={(v) => setReceiptPhone(v.replace(/\D/g, '').slice(0, 10))} placeholder="Client's phone" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, styles.registrationInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                <TouchableOpacity testID="receipt-text" disabled={!!sendingReceipt || receiptPhone.length !== 10} onPress={() => void sendReceipt('text')} style={[styles.registerButton, { backgroundColor: receiptPhone.length === 10 ? colors.secondary : colors.muted }]}><Text style={[styles.registerButtonText, { color: receiptPhone.length === 10 ? colors.primary : colors.mutedForeground }]}>{sendingReceipt === 'text' ? 'Sending…' : 'Text'}</Text></TouchableOpacity>
              </View>
              <View style={styles.registrationRow}>
                <TextInput testID="receipt-email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} value={receiptEmail} onChangeText={setReceiptEmail} placeholder="Client's e-mail" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, styles.registrationInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                <TouchableOpacity testID="receipt-email-send" disabled={!!sendingReceipt || !/^\S+@\S+\.\S+$/.test(receiptEmail.trim())} onPress={() => void sendReceipt('email')} style={[styles.registerButton, { backgroundColor: /^\S+@\S+\.\S+$/.test(receiptEmail.trim()) ? colors.secondary : colors.muted }]}><Text style={[styles.registerButtonText, { color: /^\S+@\S+\.\S+$/.test(receiptEmail.trim()) ? colors.primary : colors.mutedForeground }]}>{sendingReceipt === 'email' ? 'Sending…' : 'E-mail'}</Text></TouchableOpacity>
              </View>
              {receiptNote ? <Text style={[styles.setupText, { color: colors.primary }]}>{receiptNote}</Text> : null}
            </View> : null}
            {/* Quick Notes for the visit just paid (owner, 2026-11-11; app/quick-notes.tsx). */}
            {!isQuickSale && Number(appointmentId) > 0 ? <TouchableOpacity testID="checkout-quick-notes" onPress={() => router.push({ pathname: '/quick-notes' as any, params: { appointmentId: String(appointmentId) } })} style={[styles.primaryButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 10 }]}><Feather name="edit-3" size={19} color={colors.foreground} /><Text style={[styles.primaryButtonText, { color: colors.foreground }]}>Quick Notes</Text></TouchableOpacity> : null}
            {/* Book the next appointment (owner, 2026-11-18, GlossGenius style; replaces the 11-15 Rebook button). */}
            {!isQuickSale && Number(appointmentId) > 0 ? <View testID="rebook-block" style={{ width: '100%', gap: 8, marginBottom: 14 }}>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Book next appointment</Text>
              <SelectField testID="rebook-weeks" title="Next appointment in" placeholder="Choose when" value={nextWeeks} onChange={(w) => { setNextWeeks(w); setRebookNote(''); }}
                options={[1, 2, 3, 4, 5, 6, 8, 10, 12].map((w) => ({ value: w, label: w === 1 ? 'In 1 week' : `In ${w} weeks` }))} />
              {nextWeeks ? <>
                <TouchableOpacity testID="rebook-calendar" onPress={() => { const d = nextDay(); clearCheckout(); setCalendarDate(d); router.replace('/(tabs)/calendar'); }} style={[styles.primaryButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 0 }]}><Text style={[styles.primaryButtonText, { color: colors.foreground }]}>See my calendar</Text></TouchableOpacity>
                <TouchableOpacity testID="rebook-instant" disabled={rebooking} onPress={() => void instantBook()} style={[styles.primaryButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 0 }]}><Text style={[styles.primaryButtonText, { color: colors.foreground }]}>{rebooking ? 'Booking…' : 'Instant book'}</Text></TouchableOpacity>
                <TouchableOpacity testID="rebook-choose" onPress={() => { const d = nextDay(); const next = { clientId: String(params.clientId ?? ''), phone: String(params.phone ?? ''), serviceIds: String(params.serviceIds ?? ''), day: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }; clearCheckout(); openBooking(next); }} style={[styles.primaryButton, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 0 }]}><Text style={[styles.primaryButtonText, { color: colors.foreground }]}>Choose another time</Text></TouchableOpacity>
              </> : null}
              {rebookNote ? <Text testID="rebook-note" style={[styles.setupText, { color: colors.primary }]}>{rebookNote}</Text> : null}
            </View> : null}
            <TouchableOpacity testID="new-checkout" onPress={resetCheckout} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{isQuickSale ? 'New sale' : 'New checkout'}</Text></TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.tapContent, { flexGrow: 1, paddingBottom: inPane ? 16 : insets.bottom + 84 }, inPane && { paddingTop: 18, paddingHorizontal: 18 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
             {isTapIntro ? null : <View style={[styles.nfcCircle, { backgroundColor: isReady || isCapturePending ? colors.secondary : colors.muted }]}><Feather name={isCapturePending ? 'alert-circle' : isReady ? 'radio' : 'loader'} size={32} color={isReady || isCapturePending ? colors.primary : colors.mutedForeground} /></View>}
             <Text style={[styles.tapTitle, { color: colors.foreground }]}>{isCapturePending ? 'Payment needs finalizing' : isTapIntro ? 'Take payment' : isReady ? 'Ready for payment' : `Connecting ${readerMode === 'm2' ? 'Stripe M2' : 'Tap to Pay'}`}</Text>
             {/* Hidden on checkout (owner, 2026-11-18): the line under "Take payment" (error or "Card, cash or gift card."). Remove this comment to bring it back.
             <Text style={[styles.tapSub, { color: colors.mutedForeground }]}>{error || (isTapIntro ? 'Card, cash or gift card.' : statusText)}</Text> */}
            {inPane && isTapIntro ? null : <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>AMOUNT DUE</Text><Text style={[styles.tapAmount, { color: colors.foreground }]}>{dollars(digits)}</Text><Text style={[styles.serviceLabel, { color: colors.mutedForeground }]}>{clientName.trim() || 'Certxa appointment'} · {isQuickSale ? String(params.serviceName || 'Quick sale') : `Appointment #${appointmentId || '—'}`}</Text></View>}
            {/* Hidden on checkout (owner, 2026-11-18): the error box. Remove this comment to bring it back.
            {error ? <View style={[styles.errorNotice, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={17} color={colors.accentForeground} /><Text style={[styles.previewText, { color: colors.accentForeground }]}>{error}</Text></View> : null} */}
             {/* Hidden on checkout (owner, 2026-11-18): Discount (with promo code). Remove this comment to bring it back.
             {isTapIntro && baseCentsParam > 0 ? <View testID="discount-block" style={[styles.formField, { width: '100%', marginTop: 16 }]}>
               <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Discount{discountCents > 0 ? <Text style={{ color: colors.primary }}>{` · −${dollars(String(discountCents))}`}</Text> : null}</Text>
               {promo ? (
                 <View testID="promo-line" style={styles.registrationRow}>
                   <Text style={[styles.fieldLabel, { flex: 1, color: colors.foreground }]}>{`Promo ${promo.code} · −${dollars(String(promo.cents))}`}</Text>
                   <TouchableOpacity testID="promo-remove" disabled={promoBusy} accessibilityLabel={`Remove promo ${promo.code}`} onPress={() => void removePromo()} style={[styles.registerButton, { backgroundColor: colors.secondary, minWidth: 44 }]}><Feather name="x" size={18} color={colors.primary} /></TouchableOpacity>
                 </View>
               ) : <>
               <View style={{ flexDirection: 'row', gap: 6 }}>
                 {[0, 10, 15, 20, 25].map((pct) => {
                   const selected = customDiscountCents <= 0 && discountPercent === pct;
                   return <TouchableOpacity key={pct} testID={`discount-${pct}`} onPress={() => { setCustomDiscount(''); setDiscountPercent(pct); }} style={{ flex: 1, height: 38, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border }}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>{pct === 0 ? 'None' : `${pct}%`}</Text></TouchableOpacity>;
                 })}
               </View>
               {memberDiscount ? <Text testID="member-discount-line" style={[styles.serviceLabel, { color: colors.mutedForeground, marginBottom: 6 }]}>{`Member discount: ${memberDiscount.name}, ${memberDiscount.percent}% off`}</Text> : null}
               <TextInput keyboardType="numbers-and-punctuation" returnKeyType="done" onChangeText={setCustomDiscount} placeholder="Or a custom amount off, e.g. 39.00" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="discount-custom" value={customDiscount} />
               {!isQuickSale && Number(appointmentId) > 0 ? <View style={styles.registrationRow}>
                 <TextInput testID="promo-input" autoCapitalize="characters" autoCorrect={false} value={promoInput} onChangeText={(v) => setPromoInput(v.replace(/\s/g, '').toUpperCase().slice(0, 32))} placeholder="Or a promo code" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, styles.registrationInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                 <TouchableOpacity testID="promo-apply" disabled={promoBusy || promoInput.length < 3} onPress={() => void applyPromo(promoInput, productCents)} style={[styles.registerButton, { backgroundColor: promoInput.length >= 3 ? colors.secondary : colors.muted }]}><Text style={[styles.registerButtonText, { color: promoInput.length >= 3 ? colors.primary : colors.mutedForeground }]}>{promoBusy ? 'Checking…' : 'Apply'}</Text></TouchableOpacity>
               </View> : null}
               </>}
             </View> : null} */}
             {isTapIntro && !isQuickSale && Number(appointmentId) > 0 && (catalog.length > 0 || products.length > 0) ? <View testID="products-block" style={[styles.formField, { width: '100%', marginTop: 16 }]}>
               <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Products{productCents > 0 ? <Text style={{ color: colors.primary }}>{` · ${dollars(String(productCents))}`}</Text> : null}</Text>
               {products.map((l, i) => (
                 <View key={l.productId} testID={`product-line-${l.productId}`} style={styles.registrationRow}>
                   <Text style={[styles.fieldLabel, { flex: 1, color: colors.foreground }]} numberOfLines={1}>{`${l.name} · ${dollars(String(l.priceCents))}`}</Text>
                   <TouchableOpacity testID={`product-less-${l.productId}`} disabled={savingProducts} accessibilityLabel="One fewer" onPress={() => void saveProducts(l.quantity > 1 ? products.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x)) : products.filter((_, j) => j !== i))} style={[styles.registerButton, { backgroundColor: colors.secondary, minWidth: 44 }]}><Feather name={l.quantity > 1 ? 'minus' : 'x'} size={18} color={colors.primary} /></TouchableOpacity>
                   <Text style={[styles.fieldLabel, { minWidth: 22, textAlign: 'center', color: colors.foreground }]}>{l.quantity}</Text>
                   <TouchableOpacity testID={`product-more-${l.productId}`} disabled={savingProducts || l.quantity >= 99} accessibilityLabel="One more" onPress={() => void saveProducts(products.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))} style={[styles.registerButton, { backgroundColor: colors.secondary, minWidth: 44 }]}><Feather name="plus" size={18} color={colors.primary} /></TouchableOpacity>
                 </View>
               ))}
               {catalog.some((p) => !products.some((l) => l.productId === p.id)) ? <SelectField testID="product-add" title="Add a product" placeholder={savingProducts ? 'Saving…' : 'Add a product'} value={null}
                 options={catalog.filter((p) => !products.some((l) => l.productId === p.id)).map((p) => ({ value: p.id, label: `${p.name} · ${dollars(String(p.priceCents))}${p.stock != null ? ` · ${p.stock} in stock` : ''}` }))}
                 onChange={(productId) => { const p = catalog.find((x) => x.id === productId); if (p) void saveProducts([...products, { productId: p.id, name: p.name, priceCents: p.priceCents, quantity: 1 }]); }} /> : null}
             </View> : null}
             {/* Hidden on checkout (owner, 2026-11-18): Custom charges. Remove this comment to bring it back.
             {isTapIntro && !isQuickSale && Number(appointmentId) > 0 && creditPaidCents === 0 && giftPaidCents === 0 && cashPartCents === 0 ? <View testID="charges-block" style={[styles.formField, { width: '100%', marginTop: 16 }]}>
               <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Custom charges{chargesCents > 0 ? <Text style={{ color: colors.primary }}>{` · ${dollars(String(chargesCents))}`}</Text> : null}</Text>
               {charges.map((c) => (
                 <View key={c.index} testID={`charge-line-${c.index}`} style={styles.registrationRow}>
                   <Text style={[styles.fieldLabel, { flex: 1, color: colors.foreground }]} numberOfLines={1}>{`${c.label} · ${dollars(String(c.cents))}`}</Text>
                   <TouchableOpacity testID={`charge-remove-${c.index}`} disabled={chargeBusy} accessibilityLabel={`Remove ${c.label}`} onPress={() => void removeCharge(c.index)} style={[styles.registerButton, { backgroundColor: colors.secondary, minWidth: 44 }]}><Feather name="x" size={18} color={colors.primary} /></TouchableOpacity>
                 </View>
               ))}
               {chargeOpen ? <>
                 <TextInput testID="charge-label" value={chargeLabel} onChangeText={(v) => setChargeLabel(v.slice(0, 60))} placeholder="Name, e.g. Late fee" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                 <View style={styles.registrationRow}>
                   <TextInput testID="charge-price" keyboardType="decimal-pad" returnKeyType="done" value={chargePrice} onChangeText={setChargePrice} placeholder="Amount, e.g. 15.00" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, styles.registrationInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                   <TouchableOpacity testID="charge-save" disabled={chargeBusy} onPress={() => void addCharge()} style={[styles.registerButton, { backgroundColor: colors.secondary }]}><Text style={[styles.registerButtonText, { color: colors.primary }]}>{chargeBusy ? 'Adding…' : 'Add'}</Text></TouchableOpacity>
                 </View>
               </> : <TouchableOpacity testID="charge-open" onPress={() => { setError(''); setChargeOpen(true); }} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}><Text style={[styles.registerButtonText, { color: colors.primary }]}>Add a custom charge</Text></TouchableOpacity>}
             </View> : null} */}
             {isTapIntro && creditPaidCents > 0 ? <Text testID="credit-paid-line" style={[styles.fieldLabel, { width: '100%', marginTop: 12, color: colors.foreground }]}>{`Credit used · −${dollars(String(creditPaidCents))}`}</Text> : null}
             {isTapIntro && giftPaidCents > 0 ? <Text testID="gift-paid-line" style={[styles.fieldLabel, { width: '100%', marginTop: 12, color: colors.foreground }]}>{`Gift card paid · −${dollars(String(giftPaidCents))}`}</Text> : null}
             {isTapIntro && cashPartCents > 0 ? <Text testID="cash-part-line" style={[styles.fieldLabel, { width: '100%', marginTop: 12, color: colors.foreground }]}>{`Cash taken · −${dollars(String(cashPartCents))}`}</Text> : null}
             {isTapIntro && depositCents > 0 ? <Text testID="deposit-line" style={[styles.fieldLabel, { width: '100%', marginTop: 12, color: colors.foreground }]}>{`Deposit already paid · −${dollars(String(depositCents))}`}</Text> : null}
             {isTapIntro && taxCents > 0 ? <Text testID="sales-tax-line" style={[styles.fieldLabel, { width: '100%', marginTop: 12, color: colors.foreground }]}>{`Sales tax (${(tax.rate * 100).toFixed(2).replace(/\.?0+$/, '')}%) · ${dollars(String(taxCents))}`}</Text> : null}
             {isTapIntro && feeCents > 0 ? <Text testID="platform-fee-line" style={[styles.fieldLabel, { width: '100%', marginTop: 12, color: colors.foreground }]}>{`Platform fee (${(feeRate * 100).toFixed(2).replace(/\.?0+$/, '')}%) · ${dollars(String(feeCents))}`}</Text> : null}
             {/* Hidden on checkout (owner, 2026-11-18): New Stripe M2 setup. Remove this comment to bring it back.
             {isTapIntro && !cardsOff ? <View testID="m2-registration-intro" style={[styles.formField, { width: '100%', marginTop: 18 }]}>
               <Text style={[styles.fieldLabel, { color: colors.foreground }]}>New Stripe M2 setup <Text style={{ color: colors.mutedForeground }}>(one time)</Text></Text>
               <View style={styles.registrationRow}>
               <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setRegistrationCode} placeholder="Reader registration code" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, styles.registrationInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="m2-registration-code" value={registrationCode} />
               <TouchableOpacity disabled={isRegisteringReader || !registrationCode.trim()} onPress={registerM2Reader} style={[styles.registerButton, { backgroundColor: registrationCode.trim() ? colors.secondary : colors.muted }]} testID="register-m2"><Text style={[styles.registerButtonText, { color: registrationCode.trim() ? colors.primary : colors.mutedForeground }]}>{isRegisteringReader ? 'Registering…' : 'Register'}</Text></TouchableOpacity>
               </View>
               {readerSetupText ? <Text style={[styles.setupText, { color: colors.primary }]}>{readerSetupText}</Text> : null}
             </View> : null} */}
             {!isTapIntro ? <TouchableOpacity disabled={(!isReady && !isCapturePending && !isTapIntro) || isBusy || (isTapIntro && cardsOff)} testID={isTapIntro ? 'start-tap-to-pay' : isCapturePending ? 'retry-capture' : 'accept-payment'} onPress={isTapIntro ? () => startCard('tap_to_pay') : isCapturePending ? retryCapture : processPayment} style={[styles.primaryButton, { backgroundColor: (isReady || isCapturePending || (isTapIntro && !cardsOff)) && !isBusy ? colors.primary : colors.muted }]}><Feather name={isTapIntro ? 'radio' : isCapturePending ? 'refresh-cw' : 'radio'} size={19} color={(isReady || isCapturePending || (isTapIntro && !cardsOff)) && !isBusy ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.primaryButtonText, { color: (isReady || isCapturePending || (isTapIntro && !cardsOff)) && !isBusy ? colors.primaryForeground : colors.mutedForeground }]}>{isBusy ? (step === 'processing' ? 'Payment in progress…' : 'Preparing…') : isTapIntro ? 'Start Tap to Pay' : isCapturePending ? 'Retry capture' : 'Accept payment'}</Text></TouchableOpacity> : null}
             {inPane && !isTapIntro && !isCapturePending ? (
               <TouchableOpacity testID="pos-card-cancel" onPress={cancelCardPayment} style={[styles.exitButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
                 <Feather name="x-circle" size={22} color={colors.foreground} />
                 <Text style={[styles.exitText, { color: colors.foreground }]}>CANCEL</Text>
               </TouchableOpacity>
             ) : null}
             {inPane && !isTapIntro && error ? <Text testID="pos-card-error" style={[styles.setupText, { color: colors.destructive, textAlign: 'center' }]}>{error}</Text> : null}
             {/* How the client pays (owner, 2026-11-17): one list of the ways to pay, then Split payment. */}
             {isTapIntro && !inPane && offerSave && !cardsOff ? <View testID="save-card-row" style={[styles.saveCardRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
               <View style={{ flex: 1 }}>
                 <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Save card on file</Text>
                 <Text style={[styles.saveCardSub, { color: colors.mutedForeground }]}>With the client’s OK. Used for no-show and late-cancel fees, and Card on file at checkout.</Text>
               </View>
               <Switch testID="save-card-switch" value={saveCard} onValueChange={setSaveCard} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Save card on file" />
             </View> : null}
             {inPane && isTapIntro ? (
               // The tablet POS's ways to pay, as /nail's: CASH (typed on the keypad), CARD (the Stripe reader), GIFT CARD, OTHER.
               <View testID="pos-pay-tiles" style={{ width: '100%', gap: 12 }}>
                 <View style={styles.tileRow}>
                   <PayTile testID="pos-pay-cash" icon="dollar-sign" label="CASH" on={!giftOpen && !otherOpen} colors={colors} onPress={() => { setGiftOpen(false); setOtherOpen(false); setError(''); setStatusText(''); }} />
                   <PayTile testID="pos-pay-card" icon="credit-card" label="CARD" disabled={isBusy || cardsOff || !!charging} colors={colors} onPress={payByCard} />
                 </View>
                 <View style={styles.tileRow}>
                   <PayTile testID="pos-pay-gift" icon="gift" label="GIFT CARD" on={giftOpen} disabled={recording || isBusy} colors={colors} onPress={() => { setError(''); setStatusText(''); setGiftCardCode(''); setGiftOpen((o) => !o); setOtherOpen(false); }} />
                   <PayTile testID="pos-pay-other" icon="more-horizontal" label="OTHER" on={otherOpen} disabled={recording || isBusy} colors={colors} onPress={() => { setError(''); setStatusText(''); setOtherOpen((o) => !o); setGiftOpen(false); }} />
                 </View>
                 {/* Other: one button per way, under the others (owner, 2026-11-19); a tap asks before recording. */}
                 {otherOpen ? <View style={styles.tileRow}>
                   {([['check', 'Check'], ['venmo', 'Venmo'], ['zelle', 'Zelle'], ['paypal', 'PayPal']] as const).map(([kind, name]) => (
                     <TouchableOpacity key={kind} testID={`pos-pay-other-${kind}`} disabled={recording} activeOpacity={0.75}
                       onPress={() => Alert.alert(`Record ${dollars(String(offlineDueCents))} paid by ${name}?`, 'Recorded only; no fee.', [
                         { text: 'Cancel', style: 'cancel' },
                         { text: 'Record', onPress: () => { setOtherKind(kind); void recordOfflinePayment('other', undefined, { otherName: name, otherKind: kind }); } },
                       ])}
                       style={[styles.otherTile, { backgroundColor: colors.card, borderColor: colors.border }]}>
                       <Text style={[styles.payTileText, { color: colors.foreground, fontSize: 15 }]}>{name}</Text>
                     </TouchableOpacity>
                   ))}
                 </View> : null}
                 <Text testID="pos-pay-hint" style={[styles.setupText, { color: colors.mutedForeground, textAlign: 'center' }]}>
                   {error || statusText || (giftOpen ? 'Gift card: type the gift card number on the keypad and press ENTER.'
                     : otherOpen ? 'Tap how the client paid.' : 'Cash: type the amount on the keypad and press ENTER. Less pays part of it; more gives change. Card: tap CARD.')}
                 </Text>
               </View>
             ) : null}
             {isTapIntro && !inPane ? <View testID="payment-methods" style={[styles.payList, { backgroundColor: colors.card, borderColor: colors.border }]}>
               {/* One Card (owner, 2026-11-20): the tip comes next, and choosing it starts this device's way of taking
                   cards — Tap to Pay or the Stripe M2 (Settings › Card payments; tablets: the M2). */}
               <MethodRow testID="pay-card" icon={deviceCardMethod === 'tap_to_pay' ? 'smartphone' : 'credit-card'} title="Card"
                 sub={cardsOff ? 'Set up card payments first' : deviceCardMethod === 'tap_to_pay' ? tapLabel
                   : deviceCardMethod === 'm2' ? (connectedReader && readerMode === 'm2' ? `Stripe M2 · connected${typeof (connectedReader as any).batteryLevel === 'number' ? ` · ${Math.round((connectedReader as any).batteryLevel * 100)}% battery` : ''}` : 'Stripe M2 card reader')
                   : 'Choose Tap to Pay or the card reader'}
                 disabled={isBusy || cardsOff || !!charging} onPress={payByCard} colors={colors} />
               {savedCard ? <MethodRow testID="pay-card-on-file" icon="credit-card" title={`Card on file${savedCard.last4 ? ` (${savedCard.last4})` : ''}`} sub={charging === 'saved' ? 'Charging…' : undefined} disabled={isBusy || cardsOff || !!charging} onPress={payWithSavedCard} colors={colors} /> : null}
               {Number(appointmentId) > 0 ? <MethodRow testID="pay-new-card" icon="edit-3" title="Enter new card" sub={charging === 'keyed' ? 'Waiting for the card…' : undefined} disabled={isBusy || cardsOff || !!charging} onPress={() => void payWithoutReader('keyed')} colors={colors} /> : null}
               {Number(appointmentId) > 0 && creditBalanceCents > 0 && creditPaidCents === 0 && offlineDueCents > 0 ? <MethodRow testID="pay-credit" icon="award" title="Client credit" sub={recording ? 'Recording…' : dollars(String(Math.min(creditBalanceCents, offlineDueCents)))} disabled={recording || isBusy || !!charging} onPress={() => void recordOfflinePayment('credit')} colors={colors} /> : null}
               {Number(appointmentId) > 0 ? <MethodRow testID="pay-gift-card" icon="gift" title="Gift card" disabled={recording || isBusy || !!charging} onPress={() => { setError(''); setGiftOpen((o) => !o); setCashOpen(false); }} colors={colors} /> : null}
               {giftOpen ? <View style={styles.methodForm}>
                 <View testID="gift-card-block" style={styles.formField}>
                   <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Gift card code</Text>
                   <TextInput testID="gift-card-code" autoCapitalize="characters" autoCorrect={false} value={giftCardCode} onChangeText={setGiftCardCode} placeholder="Code on the gift card" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                   <TouchableOpacity testID="gift-card-use" disabled={recording || !giftCardCode.trim()} onPress={() => void recordOfflinePayment('gift_card')} style={[styles.primaryButton, { backgroundColor: giftCardCode.trim() && !recording ? colors.primary : colors.muted }]}><Feather name="gift" size={19} color={giftCardCode.trim() && !recording ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.primaryButtonText, { color: giftCardCode.trim() && !recording ? colors.primaryForeground : colors.mutedForeground }]}>{recording ? 'Checking the card…' : 'Use gift card'}</Text></TouchableOpacity>
                 </View>
               </View> : null}
               {Number(appointmentId) > 0 ? <MethodRow testID="pay-cash" icon="dollar-sign" title="Cash" sub={dollars(String(offlineDueCents))} disabled={recording || isBusy || !!charging} onPress={() => { setError(''); setSplitOpen(false); setCashGiven((offlineDueCents / 100).toFixed(2)); setCashOpen((o) => !o); setGiftOpen(false); setOtherOpen(false); }} colors={colors} /> : null}
               {cashOpen ? <View style={styles.methodForm}>
                 <View testID="cash-block" style={styles.formField}>
                   <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Cash the client gave you <Text style={{ color: colors.mutedForeground }}>(less pays part of it)</Text></Text>
                   <TextInput testID="cash-given" keyboardType="decimal-pad" returnKeyType="done" value={cashGiven} onChangeText={setCashGiven} placeholder="0.00" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
                   <TouchableOpacity testID="cash-record" disabled={recording} onPress={() => void recordOfflinePayment('cash')} style={[styles.primaryButton, { backgroundColor: recording ? colors.muted : colors.primary }]}><Feather name="dollar-sign" size={19} color={recording ? colors.mutedForeground : colors.primaryForeground} /><Text style={[styles.primaryButtonText, { color: recording ? colors.mutedForeground : colors.primaryForeground }]}>{recording ? 'Recording…' : 'Record cash'}</Text></TouchableOpacity>
                 </View>
               </View> : null}
               {Number(appointmentId) > 0 ? <MethodRow testID="pay-other" icon="more-horizontal" title="Other payment" sub="Check, Venmo, Zelle, PayPal…" disabled={recording || isBusy || !!charging} onPress={() => { setError(''); setOtherOpen((o) => !o); setCashOpen(false); setGiftOpen(false); }} colors={colors} last /> : null}
               {otherOpen ? <View style={styles.methodForm}>
                 <View testID="other-block" style={styles.formField}>
                   <Text style={[styles.fieldLabel, { color: colors.foreground }]}>How the client paid <Text style={{ color: colors.mutedForeground }}>(recorded only, no fee)</Text></Text>
                   <SelectField testID="other-kind" title="How the client paid" placeholder="Choose" value={otherKind}
                     options={[{ value: 'check' as const, label: 'Check' }, { value: 'venmo' as const, label: 'Venmo' }, { value: 'zelle' as const, label: 'Zelle' }, { value: 'paypal' as const, label: 'PayPal' }, { value: 'other' as const, label: 'Other (type it)' }]}
                     onChange={(k) => { setOtherKind(k); setError(''); }} />
                   {otherKind === 'other' ? <TextInput testID="other-label" value={otherLabel} onChangeText={(v) => setOtherLabel(v.slice(0, 30))} placeholder="For example, Apple Cash" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground, marginTop: 8 }]} /> : null}
                   <TouchableOpacity testID="other-record" disabled={recording || !otherName} onPress={() => void recordOfflinePayment('other')} style={[styles.primaryButton, { backgroundColor: otherName && !recording ? colors.primary : colors.muted }]}><Text style={[styles.primaryButtonText, { color: otherName && !recording ? colors.primaryForeground : colors.mutedForeground }]}>{recording ? 'Recording…' : `Record ${dollars(String(offlineDueCents))}${otherName ? ` by ${otherName}` : ''}`}</Text></TouchableOpacity>
                 </View>
               </View> : null}
             </View> : null}
             {isTapIntro && !inPane && Number(appointmentId) > 0 ? <>
               <View style={styles.orRow}><View style={[styles.orLine, { backgroundColor: colors.border }]} /><Text style={[styles.orText, { color: colors.mutedForeground }]}>or</Text><View style={[styles.orLine, { backgroundColor: colors.border }]} /></View>
               <TouchableOpacity testID="split-payment" disabled={recording || isBusy || !!charging} onPress={() => { setError(''); setSplitOpen(true); setGiftOpen(false); setCashGiven(''); setCashOpen(true); }} style={[styles.splitButton, { backgroundColor: colors.muted }]}>
                 <Text style={[styles.splitText, { color: colors.foreground }]}>Split payment</Text>
               </TouchableOpacity>
               {splitOpen ? <Text testID="split-note" style={[styles.setupText, { color: colors.mutedForeground, textAlign: 'center' }]}>Take part of the bill in cash (type the amount), or use a gift card or credit. Then choose how to pay the rest.</Text> : null}
             </> : null}
             {/* No way back to adding items once a payment is on the ticket (owner, 2026-11-20: it could charge the client
                 twice). Before any payment, EXIT cancels the unpaid sale and puts the POS back. */}
             {inPane && isTapIntro && cashPartCents + giftPaidCents + creditPaidCents === 0 ? (
               <TouchableOpacity testID="pos-pay-exit" disabled={recording || isBusy || !!charging} onPress={leaveCheckout} style={[styles.exitButton, { borderColor: colors.border, backgroundColor: colors.card }]}>
                 <Feather name="x" size={22} color={colors.foreground} />
                 <Text style={[styles.exitText, { color: colors.foreground }]}>EXIT</Text>
               </TouchableOpacity>
             ) : null}
             <Text testID="build-label" style={[styles.tapSub, { fontSize: 13, marginTop: 10, color: colors.mutedForeground }]}>{BUILD_LABEL}</Text>
          </ScrollView>
        )}
      </View>
    );
  }

  return <TipCheckout
    baseCents={Number(params.amountCents) || 0}
    presets={tipPresets}
    defaultPercent={defaultTip}
    serviceName={String(params.serviceName || '')}
    onBack={() => {
      if (isQuickSale) {
        // Not paid: remove the quick sale's ticket (refused by the server once anything was paid).
        const saleId = Number(params.appointmentId);
        if (Number.isInteger(saleId) && saleId > 0) void api.del(`/api/quick-sales/${saleId}`).catch(() => undefined);
        router.replace('/(tabs)/pos');
        return;
      }
      if (router.canGoBack()) router.back(); else router.replace('/(tabs)');
    }}
    onConfirmTip={(nextTipCents) => {
      const baseCents = Number(params.amountCents) || 0;
      setTipCents(nextTipCents);
      setDigits(String(Math.max(0, Math.round(baseCents + nextTipCents))));
      setStep('tap_intro');
    }}
  />;
}

/** A big way-to-pay tile in the tablet POS (as /nail's CASH · CARD · GIFT CARD); `on` = the one in use. */
function PayTile({ testID, icon, label, on, disabled, onPress, colors }: {
  testID: string; icon: ComponentProps<typeof Feather>['name']; label: string; on?: boolean; disabled?: boolean; onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity testID={testID} disabled={disabled} onPress={onPress} activeOpacity={0.75}
      style={[styles.payTile, { backgroundColor: on ? colors.secondary : colors.card, borderColor: on ? colors.primary : colors.border, opacity: disabled ? 0.5 : 1 }]}>
      <Feather name={icon} size={30} color={colors.primary} />
      <Text style={[styles.payTileText, { color: colors.foreground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** One way to pay in the checkout list: icon, name, a short line under it, and an arrow. */
function MethodRow({ testID, icon, title, sub, disabled, onPress, colors, last }: {
  testID: string; icon: ComponentProps<typeof Feather>['name']; title: string; sub?: string; disabled?: boolean;
  onPress: () => void; colors: ReturnType<typeof useColors>; last?: boolean;
}) {
  const tint = disabled ? colors.mutedForeground : colors.foreground;
  return (
    <TouchableOpacity testID={testID} disabled={disabled} onPress={onPress} accessibilityRole="button"
      style={[styles.methodRow, !last ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border } : null]}>
      <Feather name={icon} size={24} color={tint} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.methodTitle, { color: tint }]}>{title}</Text>
        {sub ? <Text style={[styles.methodSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      <Feather name="chevron-right" size={22} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  payList: { width: '100%', borderWidth: 1, borderRadius: 18, marginTop: 18, overflow: 'hidden' },
  saveCardRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 18, marginTop: 18, paddingHorizontal: 18, paddingVertical: 14 },
  saveCardSub: { fontSize: 15, lineHeight: 20, marginTop: 4 },
  methodRow: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 68, paddingHorizontal: 18, paddingVertical: 12 },
  methodTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  methodSub: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 2 },
  methodForm: { paddingHorizontal: 18, paddingBottom: 16 },
  orRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth },
  orText: { fontSize: 15, fontFamily: 'Inter_400Regular' },
  tileRow: { flexDirection: 'row', gap: 12 },
  payTile: { flex: 1, height: 104, borderRadius: 18, borderWidth: 2, borderBottomWidth: 5, alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowColor: '#2E1065', shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  otherTile: { flex: 1, height: 64, borderRadius: 14, borderWidth: 1, borderBottomWidth: 4, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#2E1065', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  payTileText: { fontSize: 17, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  exitButton: { width: '100%', height: 60, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 'auto', paddingTop: 0,
    shadowColor: '#2E1065', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  exitText: { fontSize: 18, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  splitButton: { width: '100%', height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  splitText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  root: { flex: 1 },
  pageContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 130 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 23 },
  eyebrow: { fontSize: 13, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  secureBadge: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secureText: { fontSize: 12, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  amountPanel: { borderWidth: 1, borderRadius: 20, alignItems: 'center', paddingHorizontal: 15, paddingTop: 19, paddingBottom: 14, ...cardShadow },
  amountCaption: { fontSize: 12, letterSpacing: 1.45, fontFamily: 'Inter_600SemiBold' },
  amount: { fontSize: 40, letterSpacing: -1.3, fontFamily: 'Inter_500Medium', marginTop: 6, marginBottom: 15 },
  liveAmountNote: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  quickTitle: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  form: { gap: 12, marginTop: 14 },
  formField: { gap: 6 },
  fieldLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  fieldInput: { borderWidth: 1, borderRadius: 13, minHeight: 45, paddingHorizontal: 12, fontSize: 15, fontFamily: 'Inter_400Regular' },
  registrationRow: { flexDirection: 'row', gap: 8 },
  registrationInput: { flex: 1 },
  registerButton: { minWidth: 92, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  registerButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  setupText: { fontSize: 13, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  tapButton: { height: 54, marginTop: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  readerButtons: { flexDirection: 'row', gap: 9 },
  readerButton: { flex: 1 },
  tapButtonText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  methodHeading: { fontSize: 18, fontFamily: 'Inter_600SemiBold', marginTop: 25, marginBottom: 10 },
  methodList: { gap: 8 },
  methodCard: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, ...cardShadow },
  methodIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  methodLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  methodDescription: { fontSize: 13, marginTop: 3 },
  giftCardField: { gap: 6, marginTop: 12 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 11 },
  sectionTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  saleList: { gap: 8 },
  saleRow: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, ...cardShadow },
  saleIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saleTime: { fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 4 },
  saleAmount: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  disclaimer: { textAlign: 'center', fontSize: 13, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 17 },
  tapHeader: { paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  backButton: { minWidth: 84, height: 42, flexDirection: 'row', alignItems: 'center', gap: 6 },
  backText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  // No flex: 1 here: it pinned the content to the screen's height, so the buttons below the fold could not be
  // scrolled to (2026-11-17). flexGrow on the ScrollView still lets short content fill the screen.
  tapContent: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 28 },
  nfcCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  tapTitle: { fontSize: 23, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  tapSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 7, minHeight: 20 },
  amountCard: { width: '100%', borderWidth: 1, borderRadius: 21, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', marginTop: 31, ...cardShadow },
  tapAmount: { fontSize: 38, letterSpacing: -1, fontFamily: 'Inter_500Medium', marginTop: 7 },
  serviceLabel: { fontSize: 14, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 5 },
  errorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 14, width: '100%', marginTop: 13 },
  previewText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: 'Inter_500Medium' },
  primaryButton: { height: 53, width: '100%', borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 'auto', marginBottom: 24 },
  primaryButtonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  successBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 21 },
  successTitle: { fontSize: 23, fontFamily: 'Inter_600SemiBold' },
  successAmount: { fontSize: 35, fontFamily: 'Inter_500Medium', marginTop: 13 },
  successNote: { fontSize: 13, textAlign: 'center', lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 7 },
});
