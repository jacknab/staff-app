/**
 * Your booking website (<slug>.certxa.com), in three steps: the link, the design, and the look (colour, cover
 * photo, profile photo or logo, about text, Instagram). Shown after sign-up (?from=signup, then Get paid) and
 * from Settings → Website. Every step can be skipped and changed later. Server: routes/bookingSite.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Image, Platform, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { CERTXA_API_BASE_URL, getStoredToken } from '@/lib/certxa-api';

type Theme = 'bloom' | 'simple' | 'classic' | 'mobile';
type Look = { accent?: string; coverImage?: string; logoImage?: string; about?: string; instagram?: string };
type SiteState = { slug: string | null; url: string | null; theme: Theme; site: Look; businessName: string; oldSlugs: string[] };
type Check = { slug: string; available: boolean; message: string | null; suggestions: string[] };
type Step = 'link' | 'design' | 'look' | 'done';

const THEMES: Array<{ value: Theme; name: string; about: string }> = [
  { value: 'bloom', name: 'Bloom', about: 'A full website: big photo, services with pictures, your gallery, reviews and a map.' },
  { value: 'simple', name: 'Simple', about: 'Your photo and name on top, then a clean list of services to book.' },
  { value: 'mobile', name: 'Mobile', about: 'Feels like an app: service tiles and a bar at the bottom.' },
  { value: 'classic', name: 'Classic', about: 'A plain step-by-step booking page.' },
];
const COLOURS = ['#C2185B', '#D9776E', '#B45309', '#2E7D5B', '#0F766E', '#1F6FB2', '#6D28D9', '#111827'];

/** Upload a photo the pro picked; Certxa stores it and returns its address. */
async function uploadPhoto(uri: string, mimeType: string | undefined): Promise<string> {
  const token = await getStoredToken();
  if (!token) throw new ApiError('Your Certxa session has expired. Please sign in again.', 401);
  const form = new FormData();
  const type = mimeType || 'image/jpeg';
  form.append('image', { uri, name: `photo.${type.split('/')[1] || 'jpg'}`, type } as unknown as Blob);
  const response = await fetch(`${CERTXA_API_BASE_URL}/api/uploads/image`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form });
  const payload = (await response.json().catch(() => null)) as { url?: string; message?: string } | null;
  if (!response.ok || !payload?.url) throw new ApiError(payload?.message || 'Could not upload the photo.', response.status);
  return payload.url;
}

export default function WebsiteSetupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSignup = from === 'signup';
  const [step, setStep] = useState<Step>('link');
  const [state, setState] = useState<SiteState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // Step 1: the link
  const [slug, setSlug] = useState('');
  const [check, setCheck] = useState<Check | null>(null);
  const [checking, setChecking] = useState(false);
  // Step 2: the design
  const [theme, setTheme] = useState<Theme>('bloom');
  // Step 3: the look
  const [look, setLook] = useState<Look>({});
  const [uploading, setUploading] = useState<'' | 'coverImage' | 'logoImage'>('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const site = await api.get<SiteState>('/api/booking-site');
      setState(site); setSlug(site.slug ?? ''); setTheme(site.theme); setLook(site.site ?? {});
    } catch (cause) { setLoadError(cause instanceof Error ? cause.message : 'Could not load your website.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Check the link as it is typed (after a short pause).
  const checkSeq = useRef(0);
  useEffect(() => {
    if (step !== 'link' || !state) return;
    const typed = slug.trim().toLowerCase();
    if (!typed || typed === state.slug) { setCheck(null); setChecking(false); return; }
    const seq = ++checkSeq.current;
    setChecking(true);
    const timer = setTimeout(() => {
      api.get<Check>(`/api/booking-site/check?slug=${encodeURIComponent(typed)}`)
        .then((result) => { if (seq === checkSeq.current) setCheck(result); })
        .catch(() => { if (seq === checkSeq.current) setCheck(null); })
        .finally(() => { if (seq === checkSeq.current) setChecking(false); });
    }, 400);
    return () => clearTimeout(timer);
  }, [slug, state, step]);

  const leave = () => {
    if (fromSignup) router.replace('/get-paid?from=signup');
    else router.back();
  };

  const run = async (work: () => Promise<void>) => {
    setSaving(true); setError('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Something went wrong. Try again.'); }
    finally { setSaving(false); }
  };

  const saveLink = () => run(async () => {
    const typed = slug.trim().toLowerCase();
    if (state && typed && typed !== state.slug) {
      if (check && !check.available) throw new Error(check.message ?? 'That link is taken.');
      setState(await api.put<SiteState>('/api/booking-site/slug', { slug: typed }));
    }
    setStep('design');
  });

  const saveDesign = () => run(async () => {
    if (state && theme !== state.theme) setState(await api.put<SiteState>('/api/booking-site', { theme }));
    setStep('look');
  });

  const saveLook = () => run(async () => {
    const site = { accent: look.accent ?? '', coverImage: look.coverImage ?? '', logoImage: look.logoImage ?? '', about: (look.about ?? '').trim(), instagram: (look.instagram ?? '').trim() };
    setState(await api.put<SiteState>('/api/booking-site', { site }));
    setStep('done');
  });

  const pickPhoto = async (field: 'coverImage' | 'logoImage') => {
    setError('');
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: field === 'coverImage' ? [16, 9] : [1, 1], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setUploading(field);
    try {
      const url = await uploadPhoto(picked.assets[0].uri, picked.assets[0].mimeType);
      setLook((current) => ({ ...current, [field]: url }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not upload the photo.'); }
    finally { setUploading(''); }
  };

  const preview = (value: Theme) => {
    if (state?.url) void WebBrowser.openBrowserAsync(`${state.url}/?previewTheme=${value}`);
  };

  const input = { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground };
  const stepNumber = step === 'link' ? 1 : step === 'design' ? 2 : 3;
  const typedSlug = slug.trim().toLowerCase();
  const linkBlocked = !typedSlug || checking || (typedSlug !== state?.slug && check !== null && !check.available);

  if (!state) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        {loadError ? (
          <>
            <Text style={[styles.body, { color: colors.foreground, textAlign: 'center' }]}>{loadError}</Text>
            <TouchableOpacity onPress={() => void load()} style={[styles.button, { backgroundColor: colors.primary, alignSelf: 'stretch', marginHorizontal: 24 }]}><Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Try again</Text></TouchableOpacity>
            <TouchableOpacity onPress={leave} style={styles.skip}><Text style={[styles.skipText, { color: colors.mutedForeground }]}>{fromSignup ? 'Do this later' : 'Back'}</Text></TouchableOpacity>
          </>
        ) : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 12, paddingBottom: insets.bottom + 28 }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={20}
    >
      <View style={styles.topRow}>
        {step === 'link' || step === 'done' ? (
          <TouchableOpacity accessibilityLabel={fromSignup ? 'Do this later' : 'Close'} onPress={leave} style={styles.iconButton} testID="website-close"><Feather name={fromSignup ? 'chevron-right' : 'x'} size={21} color={colors.foreground} /></TouchableOpacity>
        ) : (
          <TouchableOpacity accessibilityLabel="Back" onPress={() => setStep(step === 'look' ? 'design' : 'link')} style={styles.iconButton} testID="website-back"><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        )}
        {step !== 'done' ? <Text style={[styles.stepText, { color: colors.mutedForeground }]}>{`STEP ${stepNumber} OF 3`}</Text> : <View />}
      </View>

      {step === 'link' ? (
        <>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR WEBSITE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Choose your link</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Clients book you here. Put it in your Instagram bio and share it anywhere.</Text>
          <View style={[styles.slugBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              testID="website-slug" value={slug} onChangeText={(value) => setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 50))}
              autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="yourname" placeholderTextColor={colors.mutedForeground}
              style={[styles.slugInput, { color: colors.foreground }]}
            />
            <Text style={[styles.slugSuffix, { color: colors.mutedForeground }]}>.certxa.com</Text>
          </View>
          <Text testID="website-slug-status" style={[styles.status, { color: typedSlug !== state.slug && check && !check.available ? colors.destructive : colors.mutedForeground }]}>
            {!typedSlug ? 'Use letters, numbers and hyphens.'
              : typedSlug === state.slug ? 'This is your link now.'
              : checking ? 'Checking…'
              : check?.available ? `${typedSlug}.certxa.com is available.`
              : check?.message ?? ''}
          </Text>
          {typedSlug !== state.slug && check && !check.available && check.suggestions.length > 0 ? (
            <View style={styles.chips}>
              {check.suggestions.map((value) => (
                <TouchableOpacity key={value} onPress={() => setSlug(value)} style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`website-suggestion-${value}`}>
                  <Text style={[styles.chipText, { color: colors.foreground }]}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {state.slug && typedSlug !== state.slug ? <Text style={[styles.hint, { color: colors.mutedForeground }]}>{`Your old link, ${state.slug}.certxa.com, keeps working and takes clients to the new one.`}</Text> : null}
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity disabled={saving || linkBlocked} onPress={() => void saveLink()} style={[styles.button, { backgroundColor: saving || linkBlocked ? colors.muted : colors.primary }]} testID="website-link-next">
            <Text style={[styles.buttonText, { color: saving || linkBlocked ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Continue'}</Text>
          </TouchableOpacity>
        </>
      ) : step === 'design' ? (
        <>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR WEBSITE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Pick a design</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Tap Preview to see your own page in that design.</Text>
          <View style={{ gap: 10, marginTop: 6 }}>
            {THEMES.map((item) => {
              const picked = theme === item.value;
              return (
                <TouchableOpacity key={item.value} accessibilityRole="radio" accessibilityState={{ selected: picked }} onPress={() => setTheme(item.value)} style={[styles.card, { backgroundColor: colors.card, borderColor: picked ? colors.primary : colors.border, borderWidth: picked ? 2 : 1 }]} testID={`website-theme-${item.value}`}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.cardBody, { color: colors.mutedForeground }]}>{item.about}</Text>
                  </View>
                  <TouchableOpacity onPress={() => preview(item.value)} style={[styles.previewButton, { borderColor: colors.border }]} testID={`website-preview-${item.value}`}>
                    <Text style={[styles.previewText, { color: colors.foreground }]}>Preview</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity disabled={saving} onPress={() => void saveDesign()} style={[styles.button, { backgroundColor: saving ? colors.muted : colors.primary }]} testID="website-design-next">
            <Text style={[styles.buttonText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Continue'}</Text>
          </TouchableOpacity>
        </>
      ) : step === 'look' ? (
        <>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR WEBSITE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Make it yours</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>All optional. You can change these any time in Settings.</Text>

          <Text style={[styles.label, { color: colors.foreground }]}>Colour</Text>
          <View style={styles.swatches}>
            <TouchableOpacity accessibilityLabel="The design's own colour" onPress={() => setLook((current) => ({ ...current, accent: '' }))} style={[styles.swatch, { backgroundColor: colors.card, borderColor: !look.accent ? colors.foreground : colors.border, borderWidth: !look.accent ? 2 : 1 }]} testID="website-colour-none">
              <Text style={[styles.swatchNone, { color: colors.mutedForeground }]}>Auto</Text>
            </TouchableOpacity>
            {COLOURS.map((value) => (
              <TouchableOpacity key={value} accessibilityLabel={`Colour ${value}`} onPress={() => setLook((current) => ({ ...current, accent: value }))} style={[styles.swatch, { backgroundColor: value, borderColor: look.accent === value ? colors.foreground : 'transparent', borderWidth: 3 }]} testID={`website-colour-${value}`} />
            ))}
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>Cover photo</Text>
          <TouchableOpacity onPress={() => void pickPhoto('coverImage')} style={[styles.cover, { backgroundColor: colors.muted, borderColor: colors.border }]} testID="website-cover">
            {look.coverImage ? <Image source={{ uri: look.coverImage }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            {uploading === 'coverImage' ? <ActivityIndicator color={colors.foreground} /> : !look.coverImage ? <Text style={[styles.photoText, { color: colors.mutedForeground }]}>Choose a photo of your work or space</Text> : null}
          </TouchableOpacity>
          {look.coverImage ? <TouchableOpacity onPress={() => setLook((current) => ({ ...current, coverImage: '' }))} style={styles.remove}><Text style={[styles.removeText, { color: colors.mutedForeground }]}>Remove cover photo</Text></TouchableOpacity> : null}

          <Text style={[styles.label, { color: colors.foreground }]}>Profile photo or logo</Text>
          <View style={styles.logoRow}>
            <TouchableOpacity onPress={() => void pickPhoto('logoImage')} style={[styles.logo, { backgroundColor: colors.muted, borderColor: colors.border }]} testID="website-logo">
              {look.logoImage ? <Image source={{ uri: look.logoImage }} style={styles.logoImage} /> : uploading === 'logoImage' ? <ActivityIndicator color={colors.foreground} /> : <Feather name="user" size={26} color={colors.mutedForeground} />}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => void pickPhoto('logoImage')}><Text style={[styles.linkText, { color: colors.primary }]}>{look.logoImage ? 'Change photo' : 'Choose a photo'}</Text></TouchableOpacity>
              {look.logoImage ? <TouchableOpacity onPress={() => setLook((current) => ({ ...current, logoImage: '' }))}><Text style={[styles.removeText, { color: colors.mutedForeground, marginTop: 8 }]}>Remove</Text></TouchableOpacity> : null}
            </View>
          </View>

          <Text style={[styles.label, { color: colors.foreground }]}>About you</Text>
          <TextInput testID="website-about" value={look.about ?? ''} onChangeText={(value) => setLook((current) => ({ ...current, about: value.slice(0, 600) }))} multiline placeholder="A few lines about you and your work" placeholderTextColor={colors.mutedForeground} style={[styles.input, styles.textArea, input]} />
          <Text style={[styles.counter, { color: colors.mutedForeground }]}>{`${(look.about ?? '').length} / 600`}</Text>

          <Text style={[styles.label, { color: colors.foreground }]}>Instagram</Text>
          <TextInput testID="website-instagram" value={look.instagram ?? ''} onChangeText={(value) => setLook((current) => ({ ...current, instagram: value.replace(/^@/, '').replace(/\s/g, '') }))} autoCapitalize="none" autoCorrect={false} placeholder="yourstudio" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />

          {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
          <TouchableOpacity disabled={saving || uploading !== ''} onPress={() => void saveLook()} style={[styles.button, { backgroundColor: saving || uploading ? colors.muted : colors.primary }]} testID="website-look-save">
            <Text style={[styles.buttonText, { color: saving || uploading ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save my website'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR WEBSITE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Your website is ready</Text>
          <Text style={[styles.body, { color: colors.mutedForeground }]}>Share your link so clients can book you.</Text>
          <View style={[styles.slugBox, { backgroundColor: colors.card, borderColor: colors.border, justifyContent: 'center' }]}>
            <Text testID="website-url" style={[styles.slugInput, { color: colors.foreground, textAlign: 'center' }]}>{(state.url ?? '').replace('https://', '')}</Text>
          </View>
          <TouchableOpacity onPress={() => state.url && void Share.share({ message: state.url })} style={[styles.button, { backgroundColor: colors.primary }]} testID="website-share">
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Share my link</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => state.url && void WebBrowser.openBrowserAsync(state.url)} style={[styles.button, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginTop: 10 }]} testID="website-open">
            <Text style={[styles.buttonText, { color: colors.foreground }]}>See my website</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={leave} style={styles.skip} testID="website-finish">
            <Text style={[styles.skipText, { color: colors.primary }]}>{fromSignup ? 'Next: get paid' : 'Done'}</Text>
          </TouchableOpacity>
        </>
      )}

      {step !== 'done' ? (
        <TouchableOpacity onPress={() => (step === 'link' ? setStep('design') : step === 'design' ? setStep('look') : setStep('done'))} style={styles.skip} testID="website-skip">
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip this step</Text>
        </TouchableOpacity>
      ) : null}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { paddingHorizontal: 22 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  stepText: { fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  eyebrow: { fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  title: { fontSize: 27, letterSpacing: -0.5, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  body: { fontSize: 13, lineHeight: 19, fontFamily: 'Inter_400Regular', marginTop: 7, marginBottom: 18 },
  slugBox: { height: 54, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  slugInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold', paddingVertical: 0 },
  slugSuffix: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  status: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 9 },
  hint: { fontSize: 11, lineHeight: 16, fontFamily: 'Inter_400Regular', marginTop: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 },
  chipText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  card: { borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  cardBody: { fontSize: 12, lineHeight: 17, fontFamily: 'Inter_400Regular', marginTop: 4 },
  previewButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11 },
  previewText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  label: { fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 20, marginBottom: 9 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  swatchNone: { fontSize: 9, fontFamily: 'Inter_600SemiBold' },
  cover: { height: 150, borderRadius: 14, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  remove: { marginTop: 8 },
  removeText: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logo: { width: 78, height: 78, borderRadius: 39, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 78, height: 78 },
  linkText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 13, minHeight: 48, paddingHorizontal: 13, fontSize: 14, fontFamily: 'Inter_400Regular' },
  textArea: { minHeight: 110, paddingTop: 12, textAlignVertical: 'top' },
  counter: { fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right', marginTop: 5 },
  error: { fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 14 },
  button: { height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  buttonText: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  skip: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 8 },
  skipText: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
