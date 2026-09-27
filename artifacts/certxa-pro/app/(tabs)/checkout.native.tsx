import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Keyboard,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import { useStripeTerminal } from '@stripe/stripe-terminal-react-native';
import { useColors } from '@/hooks/useColors';
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
} from '@/lib/certxa-api';

const keypadRows = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['delete', '0', 'clear'],
] as const;

// Re-enable after Apple embeds the Tap to Pay managed entitlement in the
// provisioning profile. Stripe M2 does not require that Apple entitlement.
const TAP_TO_PAY_ENABLED = false;

type PaymentStep = 'idle' | 'initializing' | 'discovering' | 'connecting' | 'ready' | 'processing' | 'capture_pending' | 'success' | 'error';
type ReaderMode = 'tap_to_pay' | 'm2';

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
  const params = useLocalSearchParams<{ appointmentId?: string; clientName?: string; amountCents?: string }>();
  const [digits, setDigits] = useState('0');
  const [appointmentId, setAppointmentId] = useState('');
  const [clientName, setClientName] = useState('');
  const [step, setStep] = useState<PaymentStep>('idle');
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
  const topInset = insets.top;

  useEffect(() => {
    if (params.appointmentId) setAppointmentId(String(params.appointmentId));
    if (params.clientName) setClientName(String(params.clientName));
    if (params.amountCents && Number(params.amountCents) >= 0) setDigits(String(Math.round(Number(params.amountCents))));
  }, [params.amountCents, params.appointmentId, params.clientName]);

  const {
    initialize,
    discoverReaders,
    connectReader,
    disconnectReader,
    retrievePaymentIntent,
    collectPaymentMethod,
    processPaymentIntent,
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
          merchantDisplayName: 'Certxa Pro',
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
  }, [connectReader, connectedReader, discoveredReaders, locationId, readerMode, step]);

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

  const pressDigit = (value: string) => {
    if (value === 'delete') {
      setDigits((current) => current.length > 1 ? current.slice(0, -1) : '0');
      return;
    }
    if (value === 'clear') {
      setDigits('0');
      return;
    }
    setDigits((current) => current === '0' ? value : `${current}${value}`.slice(0, 8));
  };

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

  const startReader = async (mode: ReaderMode) => {
    if (Number(digits) < 50) {
      setError('Enter an amount of at least $0.50.');
      return;
    }
    setError('');
    setReaderMode(mode);
    setStep('initializing');
    setStatusText(mode === 'm2' ? 'Preparing Stripe M2…' : 'Preparing Tap to Pay…');

    try {
      const initialized = await initialize();
      if (initialized.error) throw new Error(initialized.error.message);

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

    try {
      const token = await getStoredToken();
      if (!token) throw new Error('Your Certxa session has expired. Please sign in again.');

      const created = await createTerminalPaymentIntent(token, {
        amountCents,
        appointmentId: numericAppointmentId,
        clientName: clientName.trim() || undefined,
        method: readerMode,
        tipCents: 0,
        discountCents: 0,
        priorTenderedCents: 0,
      });
      createdPaymentIntentId = created.paymentIntentId;
      setPaymentIntentId(created.paymentIntentId);

      const retrieved = await retrievePaymentIntent(created.clientSecret);
      if (retrieved.error || !retrieved.paymentIntent) throw new Error(retrieved.error?.message || 'Unable to prepare the payment.');

      setStatusText(readerMode === 'm2' ? 'Tap, insert, or swipe the card on the M2 reader…' : 'Hold the customer’s card near this phone…');
      const collected = await collectPaymentMethod({ paymentIntent: retrieved.paymentIntent });
      if (collected.error || !collected.paymentIntent) throw new Error(collected.error?.message || 'Payment collection was not completed.');

      setStatusText('Confirming payment…');
      const processed = await processPaymentIntent({ paymentIntent: collected.paymentIntent });
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
      const capturedPayment = await captureTerminalPaymentIntent(token, created.paymentIntentId, readerMode);
      captured = true;
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
      setStep('error');
      setError(cause instanceof CertxaApiError && cause.status === 401 ? 'Your Certxa session has expired. Please sign in again.' : errorMessage(cause));
    }
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
    if (pendingCaptureId) {
      setError('Retry capture before leaving. This payment is authorized but not finalized.');
      return;
    }
    if (connectedReader) await disconnectReader();
    setLocationId(null);
    setPaymentIntentId(null);
    setError('');
    setStep('idle');
    setStatusText('');
  };

  const resetCheckout = () => {
    setDigits('0');
    setAppointmentId('');
    setClientName('');
    setError('');
    setStep('idle');
    setStatusText('');
    setPaymentIntentId(null);
    setPendingCaptureId(null);
    void clearPendingTerminalCapture();
  };

  if (step !== 'idle') {
    const isReady = step === 'ready';
    const isCapturePending = step === 'capture_pending';
    const isSuccess = step === 'success';
    const isBusy = loading || ['initializing', 'discovering', 'connecting', 'processing'].includes(step);

    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.tapHeader}>
          <TouchableOpacity disabled={isCapturePending} testID="cancel-reader" onPress={exitReaderCheckout} style={styles.iconButton}><Feather name="x" size={23} color={isCapturePending ? colors.muted : colors.foreground} /></TouchableOpacity>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>IN-PERSON CHECKOUT</Text>
          <View style={{ width: 42 }} />
        </View>
        {isSuccess ? (
          <View style={styles.successContent}>
            <View style={[styles.successBadge, { backgroundColor: colors.secondary }]}><Feather name="check" size={32} color={colors.primary} /></View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>Payment complete</Text>
            <Text style={[styles.successAmount, { color: colors.foreground }]}>{dollars(digits)}</Text>
            <Text style={[styles.successNote, { color: colors.mutedForeground }]}>Captured through Certxa · {paymentIntentId}</Text>
            <TouchableOpacity testID="new-checkout" onPress={resetCheckout} style={[styles.primaryButton, { backgroundColor: colors.primary }]}><Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>New checkout</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.tapContent}>
             <View style={[styles.nfcCircle, { backgroundColor: isReady || isCapturePending ? colors.secondary : colors.muted }]}><Feather name={isCapturePending ? 'alert-circle' : isReady ? 'radio' : 'loader'} size={32} color={isReady || isCapturePending ? colors.primary : colors.mutedForeground} /></View>
             <Text style={[styles.tapTitle, { color: colors.foreground }]}>{isCapturePending ? 'Payment needs finalizing' : isReady ? 'Ready for payment' : `Connecting ${readerMode === 'm2' ? 'Stripe M2' : 'Tap to Pay'}`}</Text>
            <Text style={[styles.tapSub, { color: colors.mutedForeground }]}>{error || statusText}</Text>
            <View style={[styles.amountCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>AMOUNT DUE</Text><Text style={[styles.tapAmount, { color: colors.foreground }]}>{dollars(digits)}</Text><Text style={[styles.serviceLabel, { color: colors.mutedForeground }]}>{clientName.trim() || 'Certxa appointment'} · Appointment #{appointmentId || '—'}</Text></View>
            {error ? <View style={[styles.errorNotice, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={15} color={colors.accentForeground} /><Text style={[styles.previewText, { color: colors.accentForeground }]}>{error}</Text></View> : null}
             <TouchableOpacity disabled={(!isReady && !isCapturePending) || isBusy} testID={isCapturePending ? 'retry-capture' : 'accept-payment'} onPress={isCapturePending ? retryCapture : processPayment} style={[styles.primaryButton, { backgroundColor: (isReady || isCapturePending) && !isBusy ? colors.primary : colors.muted }]}><Feather name={isCapturePending ? 'refresh-cw' : 'radio'} size={17} color={(isReady || isCapturePending) && !isBusy ? colors.primaryForeground : colors.mutedForeground} /><Text style={[styles.primaryButtonText, { color: (isReady || isCapturePending) && !isBusy ? colors.primaryForeground : colors.mutedForeground }]}>{isBusy ? 'Preparing…' : isCapturePending ? 'Retry capture' : 'Accept payment'}</Text></TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.topLine}><View><Text style={[styles.eyebrow, { color: colors.primary }]}>CERTXA PRO</Text><Text style={[styles.title, { color: colors.foreground }]}>Checkout</Text></View><View style={[styles.secureBadge, { backgroundColor: colors.secondary }]}><Feather name="lock" size={13} color={colors.primary} /><Text style={[styles.secureText, { color: colors.primary }]}>Certxa secure</Text></View></View>
        <View style={[styles.amountPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.amountCaption, { color: colors.mutedForeground }]}>PAYMENT AMOUNT</Text>
          <Text testID="checkout-amount" style={[styles.amount, { color: colors.foreground }]}>{dollars(digits)}</Text>
          <Text style={[styles.liveAmountNote, { color: colors.mutedForeground }]}>{params.appointmentId ? `Loaded from Certxa appointment #${params.appointmentId}` : 'Select Check Out from the live calendar to load an appointment.'}</Text>
        </View>
        <View style={styles.form}>
          <View style={styles.formField}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>Certxa appointment ID</Text><TextInput keyboardType="number-pad" onChangeText={setAppointmentId} placeholder="Required for live payment" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="appointment-id" value={appointmentId} /></View>
          <View style={styles.formField}><Text style={[styles.fieldLabel, { color: colors.foreground }]}>Client name <Text style={{ color: colors.mutedForeground }}>(optional)</Text></Text><TextInput autoCapitalize="words" onChangeText={setClientName} placeholder="Shown on the receipt" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="client-name" value={clientName} /></View>
          <View style={styles.formField}>
            <Text style={[styles.fieldLabel, { color: colors.foreground }]}>New Stripe M2 setup <Text style={{ color: colors.mutedForeground }}>(one time)</Text></Text>
            <View style={styles.registrationRow}>
              <TextInput autoCapitalize="none" autoCorrect={false} onChangeText={setRegistrationCode} placeholder="Reader registration code" placeholderTextColor={colors.mutedForeground} style={[styles.fieldInput, styles.registrationInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} testID="m2-registration-code" value={registrationCode} />
              <TouchableOpacity disabled={isRegisteringReader || !registrationCode.trim()} onPress={registerM2Reader} style={[styles.registerButton, { backgroundColor: registrationCode.trim() ? colors.secondary : colors.muted }]} testID="register-m2"><Text style={[styles.registerButtonText, { color: registrationCode.trim() ? colors.primary : colors.mutedForeground }]}>{isRegisteringReader ? 'Registering…' : 'Register'}</Text></TouchableOpacity>
            </View>
            {readerSetupText ? <Text style={[styles.setupText, { color: colors.primary }]}>{readerSetupText}</Text> : null}
          </View>
        </View>
        <View style={styles.keypad}>
          {keypadRows.map((row, rowIndex) => (
            <View key={`key-row-${rowIndex}`} style={[styles.keypadRow, rowIndex < keypadRows.length - 1 && styles.keypadRowSpacing]}>
              {row.map((key, keyIndex) => <TouchableOpacity key={key} testID={`key-${key}`} onPress={() => { pressDigit(key); Keyboard.dismiss(); }} style={[styles.keyButton, keyIndex < row.length - 1 && styles.keyButtonSpacing, { backgroundColor: colors.card, borderColor: colors.border }]}>{key === 'delete' ? <Feather name="delete" size={20} color={colors.foreground} /> : key === 'clear' ? <Feather name="x" size={20} color={colors.foreground} /> : <Text style={[styles.keyText, { color: colors.foreground }]}>{key}</Text>}</TouchableOpacity>)}
            </View>
          ))}
        </View>
        {error ? <View style={[styles.errorNotice, { backgroundColor: colors.accent }]}><Feather name="alert-circle" size={15} color={colors.accentForeground} /><Text style={[styles.previewText, { color: colors.accentForeground }]}>{error}</Text></View> : null}
        <View style={styles.readerButtons}>
          <TouchableOpacity testID="stripe-m2" onPress={() => startReader('m2')} disabled={Number(digits) < 50} style={[styles.tapButton, styles.readerButton, { backgroundColor: Number(digits) < 50 ? colors.muted : colors.primary }]}><Feather name="credit-card" size={18} color={Number(digits) < 50 ? colors.mutedForeground : colors.primaryForeground} /><Text style={[styles.tapButtonText, { color: Number(digits) < 50 ? colors.mutedForeground : colors.primaryForeground }]}>Stripe M2</Text></TouchableOpacity>
          <TouchableOpacity testID="tap-to-pay" onPress={() => startReader('tap_to_pay')} disabled={!TAP_TO_PAY_ENABLED || Number(digits) < 50} style={[styles.tapButton, styles.readerButton, { backgroundColor: colors.muted }]}><Feather name="radio" size={18} color={colors.mutedForeground} /><Text style={[styles.tapButtonText, { color: colors.mutedForeground }]}>Tap to Pay pending Apple</Text></TouchableOpacity>
        </View>
        <View style={styles.recentHeader}><Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent payments</Text></View>
        <View style={styles.saleList}>{sales.slice(0, 3).map((sale, index) => <View key={`${sale.time}-${index}`} style={[styles.saleRow, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.saleIcon, { backgroundColor: colors.secondary }]}><Feather name="check" size={15} color={colors.primary} /></View><View style={{ flex: 1 }}><Text style={[styles.quickTitle, { color: colors.foreground }]}>{sale.label}</Text><Text style={[styles.saleTime, { color: colors.mutedForeground }]}>{sale.time}</Text></View><Text style={[styles.saleAmount, { color: colors.foreground }]}>{sale.amount}</Text></View>)}</View>
        <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>Payments are processed by Certxa Connect in a custom native build.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pageContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 130 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 23 },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  secureBadge: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  secureText: { fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  amountPanel: { borderWidth: 1, borderRadius: 20, alignItems: 'center', paddingHorizontal: 15, paddingTop: 19, paddingBottom: 14 },
  amountCaption: { fontSize: 9, letterSpacing: 1.45, fontFamily: 'Inter_600SemiBold' },
  amount: { fontSize: 40, letterSpacing: -1.3, fontFamily: 'Inter_500Medium', marginTop: 6, marginBottom: 15 },
  liveAmountNote: { fontSize: 11, lineHeight: 16, textAlign: 'center' },
  quickServices: { flexDirection: 'row', gap: 8, width: '100%' },
  quickChip: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 4 },
  quickTitle: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  quickPrice: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  form: { gap: 12, marginTop: 14 },
  formField: { gap: 6 },
  fieldLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  fieldInput: { borderWidth: 1, borderRadius: 13, minHeight: 45, paddingHorizontal: 12, fontSize: 12, fontFamily: 'Inter_400Regular' },
  registrationRow: { flexDirection: 'row', gap: 8 },
  registrationInput: { flex: 1 },
  registerButton: { minWidth: 92, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  registerButtonText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  setupText: { fontSize: 10, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  keypad: { marginTop: 14 },
  keypadRow: { flexDirection: 'row', alignItems: 'center' },
  keypadRowSpacing: { marginBottom: 8 },
  keyButton: { flex: 1, height: 51, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  keyButtonSpacing: { marginRight: 8 },
  keyText: { fontSize: 18, fontFamily: 'Inter_500Medium' },
  tapButton: { height: 54, marginTop: 11, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11 },
  readerButtons: { flexDirection: 'row', gap: 9 },
  readerButton: { flex: 1 },
  tapButtonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'center' },
  recentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 11 },
  sectionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  saleList: { gap: 8 },
  saleRow: { borderWidth: 1, borderRadius: 15, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  saleIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saleTime: { fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 },
  saleAmount: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  disclaimer: { textAlign: 'center', fontSize: 10, lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 17 },
  tapHeader: { paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  tapContent: { flex: 1, alignItems: 'center', paddingHorizontal: 22, paddingTop: 28 },
  nfcCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 19 },
  tapTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.5 },
  tapSub: { fontSize: 12, lineHeight: 18, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 7, minHeight: 20 },
  amountCard: { width: '100%', borderWidth: 1, borderRadius: 21, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', marginTop: 31 },
  tapAmount: { fontSize: 38, letterSpacing: -1, fontFamily: 'Inter_500Medium', marginTop: 7 },
  serviceLabel: { fontSize: 11, textAlign: 'center', fontFamily: 'Inter_400Regular', marginTop: 5 },
  errorNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 13, borderRadius: 14, width: '100%', marginTop: 13 },
  previewText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_500Medium' },
  primaryButton: { height: 53, width: '100%', borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 'auto', marginBottom: 24 },
  primaryButtonText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  successContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  successBadge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 21 },
  successTitle: { fontSize: 22, fontFamily: 'Inter_600SemiBold' },
  successAmount: { fontSize: 35, fontFamily: 'Inter_500Medium', marginTop: 13 },
  successNote: { fontSize: 10, textAlign: 'center', lineHeight: 15, fontFamily: 'Inter_400Regular', marginTop: 7 },
});
