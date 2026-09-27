import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { CertxaApiError } from '@/lib/certxa-api';

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password to continue.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (cause) {
      setError(cause instanceof CertxaApiError ? cause.message : 'Unable to sign in right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 42, paddingBottom: bottomInset + 26 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <View style={[styles.logo, { backgroundColor: colors.primary }]}>
        <Feather name="arrow-up-right" size={22} color={colors.primaryForeground} />
      </View>
      <Text style={[styles.eyebrow, { color: colors.primary }]}>CERTXA PRO</Text>
      <Text style={[styles.title, { color: colors.foreground }]}>Welcome back.</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Sign in to manage your business, clients, and checkout.</Text>

      <View style={styles.form}>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            testID="login-email"
            value={email}
          />
        </View>
        <View>
          <Text style={[styles.label, { color: colors.foreground }]}>Password</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            onChangeText={setPassword}
            onSubmitEditing={submit}
            placeholder="Your Certxa password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            testID="login-password"
            value={password}
          />
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
        <TouchableOpacity
          disabled={isSubmitting}
          onPress={submit}
          style={[styles.button, { backgroundColor: isSubmitting ? colors.muted : colors.primary }]}
          testID="login-submit"
        >
          <Text style={[styles.buttonText, { color: isSubmitting ? colors.mutedForeground : colors.primaryForeground }]}>
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </Text>
          {!isSubmitting && <Feather name="arrow-right" size={17} color={colors.primaryForeground} />}
        </TouchableOpacity>
      </View>

      <View style={[styles.secureNote, { backgroundColor: colors.secondary }]}>
        <Feather name="shield" size={16} color={colors.primary} />
        <Text style={[styles.secureText, { color: colors.secondaryForeground }]}>Your Certxa session is stored securely on this device.</Text>
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' },
  logo: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  eyebrow: { fontSize: 10, letterSpacing: 1.6, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 34, letterSpacing: -1, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  subtitle: { fontSize: 14, lineHeight: 21, fontFamily: 'Inter_400Regular', marginTop: 10, maxWidth: 300 },
  form: { gap: 17, marginTop: 34 },
  label: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginBottom: 7 },
  input: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontSize: 14, fontFamily: 'Inter_400Regular' },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_500Medium', marginTop: -5 },
  button: { height: 53, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  secureNote: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, padding: 12, marginTop: 26 },
  secureText: { flex: 1, fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular' },
});