/**
 * Portfolio (owner, 2026-11-03): photos of the pro's work in the gallery on their own Certxa booking website (never
 * Google). Add with the camera or from the library; tap one to remove it (GET · POST · DELETE /api/portfolio). Client
 * photos can also be shown here from a client's profile.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Image, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useColors } from '@/hooks/useColors';
import { useBookingData } from '@/contexts/BookingContext';
import { SelectField } from '@/components/SelectField';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

type Photo = { id: number; url: string; caption: string | null; serviceId?: number | null };

export default function PortfolioScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<Photo | null>(null);
  const { services } = useBookingData();
  const size = Math.floor((width - 40 - 16) / 3);

  const load = useCallback(async () => {
    try { setPhotos(await api.get<Photo[]>('/api/portfolio')); } catch { setPhotos([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async (camera: boolean) => {
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { Alert.alert('Camera', 'Allow Certxa Pro to use the camera in your phone\'s Settings.'); return; }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
      const picked = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (picked.canceled || !picked.assets?.[0]?.base64) return;
      setBusy(true);
      await api.post('/api/portfolio', { data: picked.assets[0].base64, mimeType: picked.assets[0].mimeType === 'image/png' ? 'image/png' : 'image/jpeg' });
      await load();
    } catch (cause) {
      Alert.alert('Photo', cause instanceof ApiError ? cause.message : 'The photo could not be added. Try again.');
    } finally { setBusy(false); }
  };
  const choose = () => Alert.alert('Add a photo of your work', undefined, [
    { text: 'Take a photo', onPress: () => void add(true) },
    { text: 'Choose from library', onPress: () => void add(false) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const remove = (p: Photo) => Alert.alert('Take this photo off your website?', undefined, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { setEditing(null); void api.del(`/api/portfolio/${p.id}`).then(load).catch(() => undefined); } },
  ]);
  // "Book this look": the service a photo shows; clients can book it from the photo on the website.
  const setPhotoService = async (p: Photo, serviceId: number | null) => {
    setEditing({ ...p, serviceId });
    setPhotos((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, serviceId } : x)));
    try { await api.patch(`/api/portfolio/${p.id}`, { serviceId }); } catch { void load(); Alert.alert('Portfolio', 'That could not be saved.'); }
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topInset }]} testID="portfolio">
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back"><Feather name="arrow-left" size={24} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="portfolio" style={[styles.navTitle, { color: colors.foreground }]}>Portfolio</HelpTitle>
        <TouchableOpacity onPress={choose} disabled={busy} style={[styles.navSide, { alignItems: 'flex-end' }]} accessibilityLabel="Add a photo" testID="portfolio-add">
          {busy ? <ActivityIndicator color={colors.primary} /> : <Feather name="plus" size={24} color={colors.primary} />}
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        {editing ? (
          <View style={{ gap: 12 }}>
            <Image source={{ uri: editing.url }} style={{ width: '100%', height: width - 40, borderRadius: 14, backgroundColor: colors.muted }} />
            <Text style={[styles.muted, { color: colors.mutedForeground }]}>Choose the service this photo shows, and clients can tap "Book this look" on your website.</Text>
            <SelectField testID="portfolio-service" title="Service shown" placeholder="No service" value={editing.serviceId ?? 0} onChange={(v) => void setPhotoService(editing, v ? Number(v) : null)}
              options={[{ value: 0, label: 'No service' }, ...services.map((s) => ({ value: s.id, label: s.name }))]} />
            <TouchableOpacity onPress={() => remove(editing)} style={styles.removeRow} testID="portfolio-remove"><Text style={[styles.removeText, { color: colors.destructive }]}>Take off my website</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditing(null)} style={styles.removeRow} testID="portfolio-done"><Text style={[styles.removeText, { color: colors.primary }]}>Done</Text></TouchableOpacity>
          </View>
        ) : <Text style={[styles.muted, { color: colors.mutedForeground }]}>These photos show in the Portfolio on your booking website. Tap one to link a service or take it off.</Text>}
        {editing ? null : photos == null ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.mutedForeground} />
          : photos.length === 0 ? (
            <TouchableOpacity onPress={choose} style={[styles.empty, { borderColor: colors.border }]} testID="portfolio-empty-add">
              <Feather name="camera" size={22} color={colors.mutedForeground} />
              <Text style={[styles.muted, { color: colors.mutedForeground }]}>Add your first photo</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.grid}>
              {photos.map((p) => (
                <TouchableOpacity key={p.id} onPress={() => setEditing(p)} testID={`portfolio-photo-${p.id}`}>
                  <Image source={{ uri: p.url }} style={{ width: size, height: size, borderRadius: 10, backgroundColor: colors.muted }} />
                </TouchableOpacity>
              ))}
            </View>
          )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 18, fontFamily: 'Inter_500Medium' },
  content: { paddingHorizontal: 20, paddingBottom: 60, gap: 14, paddingTop: 6 },
  muted: { fontSize: 13, lineHeight: 18, fontFamily: 'Inter_400Regular' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  removeRow: { height: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  empty: { height: 140, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
