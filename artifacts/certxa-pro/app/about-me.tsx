/**
 * About you (owner, 2026-11-04): the text and photo on the About tab of the pro's website (GET/PUT /api/booking-site,
 * saved in booking_site.about and .aboutImage). Most pros won't write it themselves, so Write it with AI opens Business
 * AI, which asks a few questions and proposes the text; it's saved when they tap Confirm there, and shows here on return.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

const LIMIT = 600;

export default function AboutMeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [about, setAbout] = useState('');
  const [photo, setPhoto] = useState('');
  const [edited, setEdited] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useFocusEffect(useCallback(() => {
    if (edited) return;
    api.get<{ site?: { about?: string; aboutImage?: string } }>('/api/booking-site')
      .then((r) => { setAbout(r.site?.about ?? ''); setPhoto(r.site?.aboutImage ?? ''); })
      .catch(() => setMessage('Could not load your About text.'))
      .finally(() => setLoaded(true));
  }, [edited]));

  const save = async (site: { about?: string; aboutImage?: string }) => {
    setSaving(true); setMessage('');
    try { await api.put('/api/booking-site', { site }); setEdited(false); setMessage('Saved'); }
    catch (cause) { setMessage(cause instanceof ApiError ? cause.message : 'Could not save.'); }
    finally { setSaving(false); }
  };
  const pickPhoto = async () => {
    setMessage('');
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7, base64: true });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.base64) return;
    setUploading(true);
    try {
      const { url } = await api.post<{ url: string }>('/api/booking-site/photo', { data: asset.base64, mimeType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
      setPhoto(url);
      await save({ aboutImage: url });
    } catch (cause) { setMessage(cause instanceof ApiError ? cause.message : 'Could not upload the photo. Try again.'); }
    finally { setUploading(false); }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const box = { borderColor: colors.border, backgroundColor: colors.card };
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="about-me">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="about-me" style={[styles.navTitle, { color: colors.foreground }]}>About you</HelpTitle>
        <View style={styles.navSide} />
      </View>
      {!loaded ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.mutedForeground} /> : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
          <Text style={[styles.muted, { color: colors.mutedForeground }]}>Shown on the About tab of your website.</Text>

          <TouchableOpacity testID="about-photo" onPress={() => void pickPhoto()} disabled={uploading} style={[styles.photo, { backgroundColor: colors.muted, borderColor: colors.border }]} accessibilityLabel={photo ? 'Change your photo' : 'Add your photo'}>
            {uploading ? <ActivityIndicator color={colors.foreground} /> : photo ? <Image source={{ uri: photo }} style={styles.photoImage} /> : <Feather name="camera" size={28} color={colors.mutedForeground} />}
          </TouchableOpacity>
          <View style={styles.photoLinks}>
            <TouchableOpacity onPress={() => void pickPhoto()}><Text style={[styles.link, { color: colors.primary }]}>{photo ? 'Change photo' : 'Add your photo'}</Text></TouchableOpacity>
            {photo ? <TouchableOpacity testID="about-photo-remove" onPress={() => { setPhoto(''); void save({ aboutImage: '' }); }}><Text style={[styles.link, { color: colors.mutedForeground }]}>Remove</Text></TouchableOpacity> : null}
          </View>

          <TouchableOpacity testID="about-ai" onPress={() => router.push({ pathname: '/ai', params: { start: 'about' } })} style={[styles.button, { backgroundColor: colors.primary }]}>
            <Feather name="message-circle" size={17} color={colors.primaryForeground} />
            <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Write it with AI</Text>
          </TouchableOpacity>
          <Text style={[styles.muted, { color: colors.mutedForeground, textAlign: 'center' }]}>Answer a few questions and Business AI writes it for you. Nothing changes until you tap Confirm.</Text>

          <TextInput testID="about-text" value={about} onChangeText={(value) => { setAbout(value.slice(0, LIMIT)); setEdited(true); setMessage(''); }} multiline textAlignVertical="top"
            placeholder="Or write it yourself: how long you've been doing this, what you love, what clients can expect." placeholderTextColor={colors.mutedForeground}
            style={[styles.input, box, { color: colors.foreground }]} />
          <Text style={[styles.counter, { color: colors.mutedForeground }]}>{`${about.length} / ${LIMIT}`}</Text>
          {message ? <Text style={[styles.muted, { color: message === 'Saved' ? colors.mutedForeground : colors.destructive, textAlign: 'center' }]}>{message}</Text> : null}
          <TouchableOpacity testID="about-save" disabled={saving || !edited} onPress={() => void save({ about: about.trim() })} style={[styles.button, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: edited ? 1 : 0.5 }]}>
            {saving ? <ActivityIndicator color={colors.foreground} /> : <Text style={[styles.buttonText, { color: colors.foreground }]}>Save</Text>}
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 18, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, gap: 12, paddingTop: 4 },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  photo: { width: 124, height: 124, borderRadius: 62, borderWidth: 1, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: 6 },
  photoImage: { width: '100%', height: '100%' },
  photoLinks: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  link: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  button: { height: 52, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  input: { borderWidth: 1, borderRadius: 14, minHeight: 170, padding: 14, fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  counter: { fontSize: 12, textAlign: 'right', fontFamily: 'Inter_400Regular' },
});
