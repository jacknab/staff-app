import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { CertxaApiError } from '@/lib/certxa-api';

// The same list as Settings > Business details. Certxa loads a starter list of services for the types it has one for.
const BUSINESS_TYPES = ['Nail Salon', 'Hair Salon', 'Barbershop', 'Lash and Brows', 'Esthetician', 'Makeup', 'Massage', 'Wax', 'Tattoo and Piercing', 'Pet Grooming', 'Other'];

function deviceTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; }
}

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const submit = async () => {
    if (isSubmitting) return;
    const phoneDigits = phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!firstName.trim() || !lastName.trim()) return setError('Enter your first and last name.');
    if (businessName.trim().length < 2) return setError('Enter the name of your business.');
    if (!businessType) return setError('Choose your type of business.');
    if (!email.trim() || !email.includes('@')) return setError('Enter a valid e-mail address.');
    if (phoneDigits && phoneDigits.length !== 10) return setError('Enter a 10-digit phone number, or leave it empty.');
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');

    setError('');
    setIsSubmitting(true);
    try {
      await register({
        firstName: firstName.trim(), lastName: lastName.trim(), businessName: businessName.trim(), businessType,
        email: email.trim(), password, phone: phoneDigits || undefined, timezone: deviceTimezone(),
      });
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof CertxaApiError ? cause.message : 'Could not create your account. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const input = { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 18, paddingBottom: bottomInset + 26 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <TouchableOpacity accessibilityLabel="Back to sign in" onPress={() => router.replace('/login')} style={styles.back} testID="signup-back">
        <Feather name="arrow-left" size={21} color={colors.foreground} />
      </TouchableOpacity>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>CERTXA PRO</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Create your account.</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Your own calendar, clients and checkout. Free to use.</Text>

      <View style={styles.form}>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>First name</Text>
            <TextInput autoCapitalize="words" autoComplete="given-name" onChangeText={setFirstName} placeholder="First name" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} testID="signup-first-name" value={firstName} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.foreground }]}>Last name</Text>
            <TextInput autoCapitalize="words" autoComplete="family-name" onChangeText={setLastName} placeholder="Last name" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} testID="signup-last-name" value={lastName} />
          </View>
        </View>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Business name</Text>
          <TextInput autoCapitalize="words" onChangeText={setBusinessName} placeholder="What clients know you as" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} testID="signup-business-name" value={businessName} />
        </View>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Type of business</Text>
          <View style={styles.chips}>
            {BUSINESS_TYPES.map((type) => {
              const picked = businessType === type;
              return (
                <TouchableOpacity key={type} accessibilityRole="radio" accessibilityState={{ selected: picked }} onPress={() => setBusinessType(type)} style={[styles.chip, { backgroundColor: picked ? colors.primary : colors.card, borderColor: picked ? colors.primary : colors.border }]} testID={`signup-type-${type}`}>
                  <Text style={[styles.chipText, { color: picked ? colors.primaryForeground : colors.foreground }]}>{type}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
          <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} testID="signup-email" value={email} />
        </View>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Phone (optional)</Text>
          <TextInput autoComplete="tel" keyboardType="phone-pad" onChangeText={setPhone} placeholder="(555) 555-5555" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} testID="signup-phone" value={phone} />
        </View>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
          <TextInput autoCapitalize="none" autoComplete="new-password" onChangeText={setPassword} onSubmitEditing={submit} placeholder="At least 8 characters" placeholderTextColor={colors.mutedForeground} secureTextEntry style={[styles.input, input]} testID="signup-password" value={password} />
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <TouchableOpacity disabled={isSubmitting} onPress={submit} style={[styles.button, { backgroundColor: isSubmitting ? colors.muted : colors.primary }]} testID="signup-submit">
          <Text style={[styles.buttonText, { color: isSubmitting ? colors.mutedForeground : colors.primaryForeground }]}>{isSubmitting ? 'Creating your account…' : 'Create account'}</Text>
          {!isSubmitting && <Feather name="arrow-right" size={17} color={colors.primaryForeground} />}
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.replace('/login')} style={{ alignSelf: 'center', minHeight: 40, justifyContent: 'center' }} testID="signup-sign-in">
          <Text style={[styles.label, { color: colors.primary, marginBottom: 0 }]}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: { width: 42, height: 42, justifyContent: 'center', marginLeft: -8, marginBottom: 10 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 30, letterSpacing: -0.9, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  subtitle: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', marginTop: 10, maxWidth: 300 },
  form: { gap: 17, marginTop: 26 },
  pair: { flexDirection: 'row', gap: 10 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, minHeight: 38, justifyContent: 'center' },
  chipText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', marginTop: -5 },
  button: { height: 53, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
