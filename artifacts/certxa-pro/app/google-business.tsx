/**
 * Settings › Google Business Profile (owner, 2026-11-11): connect the business's Google Business Profile (Google's
 * sign-in on Certxa's page, lib/google-business.ts), or — for a pro who doesn't have one yet — a step-by-step guide to
 * creating it on Google, then connect. Once connected, its Google reviews show on the website and in Reviews.
 * Not connected yet, it opens on a full-screen picture of what the setting is for (owner, 2026-11-11), then Get started.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { look } from '@/components/look/tokens';
import { api } from '@/lib/live-api';
import { disconnectGoogle, getGoogleProfile, googleConnected, myStoreId, openCreateProfile, runGoogleConnect, syncGoogleReviews, type GoogleProfile } from '@/lib/google-business';

type Stage = 'loading' | 'welcome' | 'connected' | 'guide' | 'working' | 'error';

// The picture's own top and bottom colours, so the page around it matches whatever the phone's shape.
const WELCOME_TOP = '#F4EFFD';
const WELCOME_BOTTOM = '#ECE3FD';

export default function GoogleBusinessScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('loading');
  const [storeId, setStoreId] = useState<number | null>(null);
  const [profile, setProfile] = useState<GoogleProfile>(null);
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    try {
      const id = await myStoreId();
      setStoreId(id);
      if (!id) { setStage('welcome'); return; }
      const stores = await api.get<{ bookingSlug?: string | null }[]>('/api/stores').catch(() => []);
      const slug = Array.isArray(stores) ? stores[0]?.bookingSlug : null;
      if (slug) setWebsite(`${slug}.certxa.com`);
      const p = await getGoogleProfile(id).catch(() => null);
      setProfile(p);
      // Not connected (the Google page closed without finishing): back to the first page.
      setStage(googleConnected(p) ? 'connected' : 'welcome');
    } catch {
      setStage('welcome');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = useCallback(async () => {
    setError(''); setNote('');
    setStage('working');
    try {
      await runGoogleConnect();
      await load();
    } catch (cause: any) {
      setError(cause?.message ?? 'We couldn’t open Google. Check your connection and try again.');
      setStage('error');
    }
  }, [load]);

  const sync = useCallback(async () => {
    if (!storeId) return;
    setNote('');
    try { await syncGoogleReviews(storeId); setNote('Your Google reviews are up to date.'); await load(); }
    catch { setNote('Google didn’t answer just now. Try again in a few minutes.'); }
  }, [storeId, load]);

  const disconnect = useCallback(() => {
    if (!storeId) return;
    Alert.alert('Disconnect Google?', 'Your Google reviews stop showing on your website and in the app, and Certxa’s own reviews show instead. You can connect again any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Disconnect', style: 'destructive', onPress: async () => { try { await disconnectGoogle(storeId); await load(); } catch { setNote('Could not disconnect. Try again.'); } } },
    ]);
  }, [storeId, load]);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const text = { color: colors.foreground };
  const muted = { color: colors.mutedForeground };
  const primary = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity onPress={onPress} style={[styles.button, { backgroundColor: colors.primary }]} testID={testID}>
      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
  const secondary = (label: string, onPress: () => void, testID: string) => (
    <TouchableOpacity onPress={onPress} style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.card }]} testID={testID}>
      <Text style={[styles.secondaryText, text]}>{label}</Text>
    </TouchableOpacity>
  );

  const steps: [string, string][] = [
    ['Use a Google account you’ll keep', 'Sign in with the Google (Gmail) account you want to manage your business with. You’ll use the same account to connect it here.'],
    ['Start your profile', 'Tap “Open Google Business Profile” below. Enter your business name and choose your category, for example Nail salon, Hair salon, Barber shop or Eyelash service.'],
    ['Add where you work', 'If clients come to you, add your address. Working from home? Google lets you hide your street address and show only your area. For house calls, add the areas you travel to.'],
    ['Add your phone and website', `Add the phone number clients call${website ? ` and your website, ${website}` : ' and your Certxa website'}.`],
    ['Verify that it’s yours', 'Google asks you to prove you own the business — often with a short video of your business, or a code by phone, text or e-mail. It can take a few days before your profile appears on Google.'],
    ['Come back and connect', 'Once your profile is created, tap “I’ve created it — connect now” and sign in with the same Google account.'],
  ];

  // What this setting is for: the picture, full screen and never stretched or cut (contain on the picture's colours).
  if (stage === 'welcome') {
    return (
      <View style={{ flex: 1 }} testID="google-welcome">
        <StatusBar barStyle="dark-content" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: WELCOME_TOP }]} />
        <View style={[styles.welcomeBottom, { backgroundColor: WELCOME_BOTTOM }]} />
        <Image source={require('@/assets/images/google-business-intro.jpg')} resizeMode="contain" style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
          accessibilityLabel="Google Business Profile: be easy to find on Google Search and Maps, build your reputation with reviews, grow your business." />
        <TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()} style={[styles.welcomeBack, { top: topInset + 4 }]} testID="google-welcome-back">
          <Feather name="arrow-left" size={22} color="#1E1B4B" />
        </TouchableOpacity>
        <View style={[styles.welcomeFooter, { paddingBottom: insets.bottom + 18 }]}>
          <TouchableOpacity onPress={() => setStage('guide')} style={[styles.button, styles.welcomePill, { backgroundColor: colors.primary }]} testID="google-welcome-setup">
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Set Up Google Business Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void connect()} style={styles.welcomeLink} testID="google-welcome-connect">
            <Text style={[styles.welcomeLinkText, { color: colors.primary }]}>Connect My Existing Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: look.pageTop }}>
      <AppBackground />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, { paddingTop: topInset + 12, paddingBottom: insets.bottom + 28 }]}>
        <TouchableOpacity accessibilityLabel="Back" onPress={() => (stage === 'guide' || stage === 'error' ? setStage('welcome') : router.back())} style={styles.back} testID="google-back">
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>GOOGLE BUSINESS PROFILE</Text>

        {stage === 'loading' || stage === 'working' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.body, muted, { marginTop: 14 }]}>{stage === 'working' ? 'Opening Google…' : 'Checking your Google connection…'}</Text>
          </View>
        ) : stage === 'connected' ? (
          <>
            <HelpTitle help="google-business" style={[styles.title, text]}>Connected to Google</HelpTitle>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, text]}>{profile?.businessName ?? 'Your business'}</Text>
              {profile?.locationAddress ? <Text style={[styles.cardLine, muted]}>{profile.locationAddress}</Text> : null}
              {profile?.lastSyncedAt ? <Text style={[styles.cardLine, muted]}>Reviews last updated {new Date(profile.lastSyncedAt).toLocaleString()}</Text> : null}
            </View>
            {profile?.reconnectRequired ? <Text style={[styles.body, { color: colors.destructive }]}>Google asks you to sign in again to keep your reviews updating.</Text> : null}
            <Text style={[styles.body, muted]}>Your Google reviews show on your website and in Reviews, where you can reply. Replies are posted on Google.</Text>
            {note ? <Text style={[styles.body, text]}>{note}</Text> : null}
            <View style={styles.actions}>
              {profile?.reconnectRequired ? primary('Sign in to Google again', () => void connect(), 'google-reconnect') : primary('Open Reviews', () => router.push('/reviews'), 'google-open-reviews')}
              {secondary('Update reviews now', () => void sync(), 'google-sync')}
              <TouchableOpacity onPress={disconnect} style={styles.linkButton} testID="google-disconnect"><Text style={[styles.linkText, muted]}>Disconnect Google</Text></TouchableOpacity>
            </View>
          </>
        ) : stage === 'guide' ? (
          <>
            <HelpTitle help="google-business" style={[styles.title, text]}>Create your Google Business Profile</HelpTitle>
            <Text style={[styles.body, muted]}>It’s free, and it’s how your business shows up on Google Search and Maps. It takes about 10 minutes, plus Google’s check.</Text>
            <View style={styles.steps}>
              {steps.map(([title, line], i) => (
                <View key={title} style={[styles.step, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.stepNumber, { color: colors.primary }]}>{i + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepTitle, text]}>{title}</Text>
                    <Text style={[styles.stepLine, muted]}>{line}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.actions}>
              {primary('Open Google Business Profile', () => void openCreateProfile(), 'google-open-create')}
              {secondary('I’ve created it — connect now', () => void connect(), 'google-connect-after-create')}
            </View>
          </>
        ) : (
          <>
            <HelpTitle help="google-business" style={[styles.title, text]}>Show your Google reviews</HelpTitle>
            <Text style={[styles.body, muted]}>Connect your Google Business Profile so your Google reviews show on your website and in the app, where you can reply to them. Clients you ask for a review are sent to Google.</Text>
            {stage === 'error' && error ? <Text style={[styles.body, { color: colors.destructive }]}>{error}</Text> : null}
            <View style={styles.actions}>
              {primary('Connect Google Business Profile', () => void connect(), 'google-connect')}
              {secondary('I don’t have one yet', () => setStage('guide'), 'google-no-profile')}
            </View>
            <Text style={[styles.fine, muted]}>Google asks you to allow Certxa to manage your Business Profile. Certxa uses it to show your Google reviews and post the replies you write.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24 },
  back: { width: 42, height: 42, justifyContent: 'center', marginLeft: -8, marginBottom: 10 },
  eyebrow: { fontSize: 13, letterSpacing: 1.6, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 30, letterSpacing: -0.9, fontFamily: 'Inter_600SemiBold', marginTop: 8 },
  body: { fontSize: 17, lineHeight: 26, fontFamily: 'Inter_400Regular', marginTop: 12 },
  center: { alignItems: 'center', marginTop: 80 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18 },
  cardTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  cardLine: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 4 },
  steps: { gap: 10, marginTop: 20 },
  step: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12 },
  stepNumber: { fontSize: 20, fontFamily: 'Inter_700Bold', width: 22 },
  stepTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  stepLine: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginTop: 4 },
  actions: { gap: 10, marginTop: 26 },
  button: { height: 53, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  secondaryButton: { height: 53, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 16, fontFamily: 'Inter_500Medium', textDecorationLine: 'underline' },
  fine: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', marginTop: 18 },
  welcomeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  welcomeBack: { position: 'absolute', left: 14, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
  welcomeFooter: { position: 'absolute', left: 24, right: 24, bottom: 0 },
  welcomePill: { borderRadius: 999 },
  welcomeLink: { alignItems: 'center', paddingVertical: 14 },
  welcomeLinkText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
});
