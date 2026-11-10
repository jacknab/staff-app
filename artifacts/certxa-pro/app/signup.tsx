import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { useAuth } from '@/contexts/AuthContext';
import { CertxaApiError, sendSignupPhoneCode, verifySignupPhoneCode } from '@/lib/certxa-api';
import { api } from '@/lib/live-api';
import { BusinessHoursEditor, DAY_NAMES, type DayHours } from '@/components/BusinessHoursEditor';

import { AppBackground } from '@/components/look/AppBackground';
import { look, cardShadow } from '@/components/look/tokens';
import { HelpTitle } from '@/components/HelpTitle';
import { WhyWeAsk } from '@/components/WhyWeAsk';
import { BUSINESS_STRUCTURES, WHY, dateOfBirthIso, isCompany } from '@/lib/stripe-details';
// The same list as Settings > Business details. Certxa loads a starter list of services for the types it has one for.
const BUSINESS_TYPES = ['Nail Salon', 'Hair Salon', 'Barbershop', 'Lash and Brows', 'Esthetician', 'Makeup', 'Massage', 'Wax', 'Tattoo and Piercing', 'Pet Grooming', 'Other'];
const STEPS = 6;

function deviceTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

/**
 * Sign-up, one question per step (owner, 2026-11-03): 1 you and your business, 2 where you offer your services,
 * 3 your business hours (a day opens a sheet with a time wheel), 4 the details Stripe needs for card payments (date of
 * birth, home address, business structure and EIN, each with "Why we ask"; owner, 2026-11-10: handed to Stripe so its
 * form doesn't ask again), 5 your login, 6 your mobile number, proved by a
 * texted code (a mobile line no Certxa account has ever had: lib/proPhoneVerification.ts on the server). A progress
 * bar and "n / 5" at the top, one Next button at the bottom that is grey until the step is answered. Light colours
 * throughout.
 */
export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  // Where they see clients: their own place (a salon/suite/booth, or a home studio kept private) and/or house calls.
  const [houseCalls, setHouseCalls] = useState(false);
  const [hasPlace, setHasPlace] = useState(true);
  const [placeIsHome, setPlaceIsHome] = useState(false);
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  // The days and times clients can book (the same default as before: Monday to Saturday, 9 to 6).
  const [hours, setHours] = useState<DayHours[]>(() => DAY_NAMES.map((_, dayOfWeek) => ({ dayOfWeek, openTime: '09:00', closeTime: '18:00', isClosed: dayOfWeek === 0 })));
  // Step 4, for Stripe: date of birth, home address (a home studio's is the business address), business structure.
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [homeSame, setHomeSame] = useState(false);
  const [homeStreet, setHomeStreet] = useState('');
  const [homeCity, setHomeCity] = useState('');
  const [homeState, setHomeState] = useState('');
  const [homeZip, setHomeZip] = useState('');
  const [structure, setStructure] = useState('');
  const [legalName, setLegalName] = useState('');
  const [ein, setEin] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  // Kept once the code is right, so going back to fix the e-mail doesn't need a new code.
  const [phoneToken, setPhoneToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const phoneDigits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const addressReady = Boolean(street.trim() && city.trim() && /^[A-Za-z]{2}$/.test(state.trim()) && /^\d{5}$/.test(zip.trim()));
  const dateOfBirth = dateOfBirthIso(dobMonth, dobDay, dobYear);
  // A home studio's address is the home address; with a business location it can be "the same".
  const homeIsBusiness = hasPlace && (placeIsHome || homeSame);
  const homeReady = homeIsBusiness || Boolean(homeStreet.trim() && homeCity.trim() && /^[A-Za-z]{2}$/.test(homeState.trim()) && /^\d{5}$/.test(homeZip.trim()));
  const einDigits = ein.replace(/\D/g, '');
  const ready =
    step === 1 ? Boolean(firstName.trim() && lastName.trim() && businessName.trim().length >= 2 && businessType)
    : step === 2 ? (houseCalls || hasPlace) && (!hasPlace || addressReady)
    : step === 3 ? hours.some((day) => !day.isClosed)
    : step === 4 ? Boolean(dateOfBirth && homeReady && structure && (!isCompany(structure) || einDigits.length === 0 || einDigits.length === 9))
    : step === 5 ? Boolean(email.trim().includes('@') && password.length >= 8)
    : codeSent ? code.length === 6 : phoneDigits.length === 10;

  const otherNumber = () => { setCodeSent(false); setCode(''); setPhoneToken(null); setError(''); };
  const back = () => {
    setError('');
    if (step === STEPS && codeSent) otherNumber();
    else if (step > 1) setStep(step - 1);
    else router.replace('/login');
  };

  const sendCode = async () => {
    setError('');
    setIsSubmitting(true);
    try {
      await sendSignupPhoneCode(phoneDigits);
      setCodeSent(true);
      setCode('');
    } catch (cause) {
      setError(cause instanceof CertxaApiError ? cause.message : 'Could not send the code. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const next = async () => {
    if (!ready || isSubmitting) return;
    setError('');
    if (step < STEPS) { setStep(step + 1); return; }
    if (!codeSent) { await sendCode(); return; }
    setIsSubmitting(true);
    try {
      let token = phoneToken;
      if (!token) {
        try {
          token = (await verifySignupPhoneCode(phoneDigits, code)).phoneToken;
          setPhoneToken(token);
        } catch (cause) {
          setError(cause instanceof CertxaApiError ? cause.message : 'Could not check the code. Check your connection and try again.');
          return;
        }
      }
      await register({
        firstName: firstName.trim(), lastName: lastName.trim(), businessName: businessName.trim(), businessType,
        email: email.trim(), password, phone: phoneDigits, phoneToken: token, timezone: deviceTimezone(),
        ownPlace: hasPlace ? (placeIsHome ? 'home' : 'salon') : 'none', houseCalls,
      });
      // The business address, saved the way Get paid saves it (Certxa also sets the time zone from it). Never blocks
      // the sign-up: Get paid asks again if it is missing.
      if (hasPlace) {
        try {
          const stores = await api.get<{ id: number }[]>('/api/stores');
          const store = Array.isArray(stores) ? stores[0] : null;
          if (store) await api.patch(`/api/stores/${store.id}`, { address: street.trim(), city: city.trim(), state: state.trim().toUpperCase(), postcode: zip.trim() });
        } catch { /* asked again before card payments */ }
      }
      // The details for Stripe (step 4), kept for when card payments are set up. Never blocks the sign-up: Stripe's
      // form asks for anything missing.
      try {
        await api.put('/api/payments/stripe/owner-details', {
          dateOfBirth, legalEntityType: structure,
          homeSameAsBusiness: homeIsBusiness,
          ...(homeIsBusiness ? {} : { homeAddress: homeStreet.trim(), homeCity: homeCity.trim(), homeState: homeState.trim().toUpperCase(), homePostcode: homeZip.trim() }),
          ...(isCompany(structure) ? { legalName: legalName.trim() || businessName.trim(), ein: einDigits } : {}),
        });
      } catch { /* Stripe's form asks instead */ }
      // The business hours chosen here (the account starts with Monday to Saturday, 9 to 6). Never blocks the sign-up.
      try {
        const stores = await api.get<{ id: number }[]>('/api/stores');
        const store = Array.isArray(stores) ? stores[0] : null;
        if (store) await api.put('/api/business-hours', { storeId: store.id, hours });
      } catch { /* they can be set in Settings › Business hours */ }
      // A new account sets up its booking website (link, design, look - each step can be skipped), then card payments.
      router.replace('/website-setup?from=signup');
    } catch (cause) {
      // The number was taken meanwhile, or the check went stale: start the number step again.
      if (cause instanceof CertxaApiError && (cause.payload as { field?: string } | undefined)?.field === 'phone') otherNumber();
      setError(cause instanceof CertxaApiError ? cause.message : 'Could not create your account. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const field = { borderColor: colors.border, backgroundColor: colors.card };
  const inputText = { color: colors.foreground };
  const toggle = (on: boolean, set: (v: boolean) => void, testID: string) => (
    <Switch value={on} onValueChange={set} testID={testID}
      trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#FFFFFF" ios_backgroundColor={colors.border} />
  );

  return (
    <View style={[styles.root, { backgroundColor: look.pageTop }]}>
      <AppBackground />
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingTop: topInset + 6, paddingBottom: 30 }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={110}
      >
        <TouchableOpacity accessibilityLabel={step > 1 ? 'Back' : 'Back to sign in'} onPress={back} style={styles.back} testID="signup-back">
          <Feather name="arrow-left" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.progress, { backgroundColor: colors.border }]} accessibilityLabel={`Step ${step} of ${STEPS}`}>
          <View style={[styles.progressFill, { backgroundColor: colors.foreground, width: `${(step / STEPS) * 100}%` }]} />
        </View>
        <Text style={[styles.stepCount, { color: colors.mutedForeground }]}>{step} / {STEPS}</Text>

        {step === 1 ? (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>Tell us about your business</HelpTitle>
            <View style={styles.form}>
              <View style={styles.pair}>
                <TextInput autoCapitalize="words" autoComplete="given-name" onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1, minWidth: 0 }]} testID="signup-first-name" value={firstName} />
                <TextInput autoCapitalize="words" autoComplete="family-name" onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1, minWidth: 0 }]} testID="signup-last-name" value={lastName} />
              </View>
              <TextInput autoCapitalize="words" onChangeText={setBusinessName} placeholder="Business name" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-business-name" value={businessName} />
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Type of business</Text>
              <SelectField testID="signup-type" title="Type of business" placeholder="Choose your type of business" value={businessType || null}
                options={BUSINESS_TYPES.map((type) => ({ value: type, label: type }))} onChange={setBusinessType} />
            </View>
          </>
        ) : step === 2 ? (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>Where do you offer your services?</HelpTitle>
            <View style={styles.optionRow}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>House call</Text>
              {toggle(houseCalls, setHouseCalls, 'signup-place-house-calls')}
            </View>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <View style={styles.optionRow}>
              <Text style={[styles.optionTitle, { color: colors.foreground }]}>Business location</Text>
              {toggle(hasPlace, setHasPlace, 'signup-place-location')}
            </View>
            {hasPlace ? (
              <>
                <Text style={[styles.optionHint, { color: colors.mutedForeground }]}>
                  {placeIsHome ? 'Your home address stays private. Clients see your city until they book.' : 'This address will appear on your website.'}
                </Text>
                <View style={[styles.addressBox, field]}>
                  <Feather name="map-pin" size={20} color={colors.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.addressLabel, { color: colors.mutedForeground }]}>Address</Text>
                    <TextInput autoComplete="street-address" onChangeText={setStreet} placeholder="Your business address" placeholderTextColor={colors.mutedForeground} style={[styles.addressInput, inputText]} testID="signup-address" value={street} />
                  </View>
                </View>
                <View style={[styles.pair, { marginTop: 10 }]}>
                  <TextInput autoComplete="postal-address-locality" onChangeText={setCity} placeholder="City" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 2, minWidth: 0 }]} testID="signup-city" value={city} />
                  <TextInput autoCapitalize="characters" maxLength={2} onChangeText={setState} placeholder="State" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1, minWidth: 0 }]} testID="signup-state" value={state} />
                  <TextInput keyboardType="number-pad" maxLength={5} autoComplete="postal-code" onChangeText={setZip} placeholder="ZIP" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1.3, minWidth: 0 }]} testID="signup-zip" value={zip} />
                </View>
                <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: placeIsHome }} onPress={() => setPlaceIsHome(!placeIsHome)} style={styles.checkRow} testID="signup-place-home">
                  <Feather name={placeIsHome ? 'check-square' : 'square'} size={20} color={placeIsHome ? colors.foreground : colors.mutedForeground} />
                  <Text style={[styles.checkText, { color: colors.foreground }]}>This is my home studio (keep the address private)</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {!houseCalls && !hasPlace ? <Text style={[styles.optionHint, { color: colors.mutedForeground, marginTop: 18 }]}>Turn on at least one.</Text> : null}
          </>
        ) : step === 3 ? (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>What are your business hours?</HelpTitle>
            <Text style={[styles.optionHint, { color: colors.mutedForeground, marginTop: 12 }]}>Clients will only be able to book within these hours. You can edit these later in Settings.</Text>
            <View style={{ marginTop: 18 }}>
              <BusinessHoursEditor hours={hours} onChange={setHours} />
            </View>
          </>
        ) : step === 4 ? (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>A few details for card payments</HelpTitle>
            <Text style={[styles.optionHint, { color: colors.mutedForeground, marginTop: 12 }]}>Stripe processes your card payments. We pass these to Stripe so you only enter them once.</Text>
            <View style={styles.form}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Date of birth</Text>
              <View style={styles.pair}>
                <TextInput keyboardType="number-pad" maxLength={2} onChangeText={(v) => setDobMonth(v.replace(/\D/g, ''))} placeholder="MM" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1, minWidth: 0 }]} testID="signup-dob-month" value={dobMonth} />
                <TextInput keyboardType="number-pad" maxLength={2} onChangeText={(v) => setDobDay(v.replace(/\D/g, ''))} placeholder="DD" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1, minWidth: 0 }]} testID="signup-dob-day" value={dobDay} />
                <TextInput keyboardType="number-pad" maxLength={4} onChangeText={(v) => setDobYear(v.replace(/\D/g, ''))} placeholder="YYYY" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1.4, minWidth: 0 }]} testID="signup-dob-year" value={dobYear} />
              </View>
              <WhyWeAsk testID="signup-why-dob">{WHY.dateOfBirth}</WhyWeAsk>

              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Home address</Text>
              {hasPlace && placeIsHome ? (
                <Text style={[styles.optionHint, { color: colors.mutedForeground }]}>Your home studio address: {street.trim()}, {city.trim()}.</Text>
              ) : (
                <>
                  {hasPlace ? (
                    <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: homeSame }} onPress={() => setHomeSame(!homeSame)} style={styles.checkRow} testID="signup-home-same">
                      <Feather name={homeSame ? 'check-square' : 'square'} size={20} color={homeSame ? colors.foreground : colors.mutedForeground} />
                      <Text style={[styles.checkText, { color: colors.foreground }]}>Same as my business address</Text>
                    </TouchableOpacity>
                  ) : null}
                  {!homeSame || !hasPlace ? (
                    <>
                      <TextInput autoComplete="street-address" onChangeText={setHomeStreet} placeholder="Street address" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-home-address" value={homeStreet} />
                      <View style={styles.pair}>
                        <TextInput autoComplete="postal-address-locality" onChangeText={setHomeCity} placeholder="City" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 2, minWidth: 0 }]} testID="signup-home-city" value={homeCity} />
                        <TextInput autoCapitalize="characters" maxLength={2} onChangeText={setHomeState} placeholder="State" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1, minWidth: 0 }]} testID="signup-home-state" value={homeState} />
                        <TextInput keyboardType="number-pad" maxLength={5} autoComplete="postal-code" onChangeText={setHomeZip} placeholder="ZIP" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText, { flex: 1.3, minWidth: 0 }]} testID="signup-home-zip" value={homeZip} />
                      </View>
                    </>
                  ) : null}
                </>
              )}
              <WhyWeAsk testID="signup-why-home">{WHY.homeAddress}</WhyWeAsk>

              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>How is your business set up?</Text>
              <SelectField testID="signup-structure" title="How is your business set up?" placeholder="Choose one" value={structure || null}
                options={BUSINESS_STRUCTURES} onChange={setStructure} />
              <WhyWeAsk testID="signup-why-structure">{WHY.structure}</WhyWeAsk>

              {isCompany(structure) ? (
                <>
                  <Text style={[styles.sectionLabel, { color: colors.foreground }]}>Legal business name</Text>
                  <TextInput autoCapitalize="words" onChangeText={setLegalName} placeholder={businessName.trim() || 'As registered'} placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-legal-name" value={legalName} />
                  <WhyWeAsk testID="signup-why-legal-name">{WHY.legalName}</WhyWeAsk>
                  <Text style={[styles.sectionLabel, { color: colors.foreground }]}>EIN (federal tax ID)</Text>
                  <TextInput keyboardType="number-pad" maxLength={10} onChangeText={(v) => { const d = v.replace(/\D/g, '').slice(0, 9); setEin(d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2)}` : d); }} placeholder="12-3456789 (optional)" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-ein" value={ein} />
                  <WhyWeAsk testID="signup-why-ein">{WHY.ein}</WhyWeAsk>
                </>
              ) : null}
            </View>
          </>
        ) : step === 5 ? (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>Create your login</HelpTitle>
            <View style={styles.form}>
              <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-email" value={email} />
              <TextInput autoCapitalize="none" autoComplete="new-password" onChangeText={setPassword} onSubmitEditing={() => void next()} placeholder="Password (at least 8 characters)" placeholderTextColor={colors.mutedForeground} secureTextEntry style={[styles.input, field, inputText]} testID="signup-password" value={password} />
            </View>
          </>
        ) : !codeSent ? (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>What's your mobile number?</HelpTitle>
            <Text style={[styles.optionHint, { color: colors.mutedForeground, marginTop: 12 }]}>We'll text you a code to confirm it.</Text>
            <View style={styles.form}>
              <TextInput autoComplete="tel" keyboardType="phone-pad" onChangeText={setPhone} onSubmitEditing={() => void next()} placeholder="Mobile number" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-phone" textContentType="telephoneNumber" value={phone} />
            </View>
          </>
        ) : (
          <>
            <HelpTitle help="signup" style={[styles.title, { color: colors.foreground }]}>Enter the code</HelpTitle>
            <Text style={[styles.optionHint, { color: colors.mutedForeground, marginTop: 12 }]}>
              We texted a 6-digit code to ({phoneDigits.slice(0, 3)}) {phoneDigits.slice(3, 6)}-{phoneDigits.slice(6)}.
            </Text>
            <View style={styles.form}>
              <TextInput autoComplete="sms-otp" keyboardType="number-pad" maxLength={6} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} onSubmitEditing={() => void next()} placeholder="6-digit code" placeholderTextColor={colors.mutedForeground} style={[styles.input, field, inputText]} testID="signup-code" textContentType="oneTimeCode" value={code} />
            </View>
            <View style={styles.codeLinks}>
              <TouchableOpacity disabled={isSubmitting} onPress={() => void sendCode()} style={styles.codeLink} testID="signup-code-resend">
                <Text style={[styles.link, { color: colors.foreground }]}>Send a new code</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={otherNumber} style={styles.codeLink} testID="signup-code-other-number">
                <Text style={[styles.link, { color: colors.foreground }]}>Use a different number</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        {step === 1 ? (
          <TouchableOpacity onPress={() => router.replace('/login')} style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 18 }} testID="signup-sign-in">
            <Text style={[styles.link, { color: colors.foreground }]}>I already have an account</Text>
          </TouchableOpacity>
        ) : null}
      </KeyboardAwareScrollViewCompat>

      <View style={[styles.footer, { borderTopColor: colors.border, paddingBottom: bottomInset + 14, backgroundColor: colors.background }]}>
        <TouchableOpacity disabled={!ready || isSubmitting} onPress={() => void next()} testID="signup-submit"
          style={[styles.button, { backgroundColor: ready && !isSubmitting ? colors.foreground : colors.muted }]}>
          <Text style={[styles.buttonText, { color: ready && !isSubmitting ? colors.background : colors.mutedForeground }]}>
            {step < STEPS ? 'Next' : !codeSent ? (isSubmitting ? 'Sending…' : 'Text me a code') : isSubmitting ? 'Creating your account…' : 'Create account'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: { width: 44, height: 44, justifyContent: 'center', marginLeft: -6, marginBottom: 16 },
  progress: { height: 3, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, borderRadius: 2 },
  stepCount: { alignSelf: 'flex-end', fontSize: 19, fontFamily: 'Inter_500Medium', marginTop: 12 },
  title: { fontSize: 34, lineHeight: 40, letterSpacing: -0.8, fontFamily: 'Inter_500Medium', marginTop: 6 },
  form: { gap: 12, marginTop: 28 },
  pair: { flexDirection: 'row', gap: 10 },
  sectionLabel: { fontSize: 17, fontFamily: 'Inter_600SemiBold', marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 14, height: 56, paddingHorizontal: 16, fontSize: 18, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, minHeight: 42, justifyContent: 'center' },
  chipText: { fontSize: 17, fontFamily: 'Inter_500Medium' },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, marginTop: 22 },
  optionTitle: { fontSize: 21, fontFamily: 'Inter_500Medium' },
  optionHint: { fontSize: 18, lineHeight: 26, fontFamily: 'Inter_400Regular', marginTop: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 22 },
  addressBox: { borderWidth: 1, borderRadius: 14, minHeight: 66, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 22, ...cardShadow },
  addressLabel: { fontSize: 16, fontFamily: 'Inter_500Medium' },
  addressInput: { fontSize: 19, fontFamily: 'Inter_400Regular', padding: 0, marginTop: 2 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, marginTop: 12 },
  checkText: { flex: 1, fontSize: 17, fontFamily: 'Inter_400Regular' },
  link: { fontSize: 17, fontFamily: 'Inter_500Medium', textDecorationLine: 'underline' },
  codeLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  codeLink: { minHeight: 44, justifyContent: 'center' },
  error: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_500Medium', marginTop: 16 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 24, paddingTop: 14 },
  button: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 19, fontFamily: 'Inter_600SemiBold' },
});
