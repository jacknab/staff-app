/**
 * Before/after photos on a client's profile (owner, 2026-11-03): private to the business (GET · POST · DELETE
 * /api/client-photos) until the pro puts one on their own Certxa website's gallery (never Google). Take one with the
 * camera or pick one, mark it Before or After; tap a photo to see it big, show it on the website, make it the client's
 * profile photo, or remove it.
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { api, ApiError } from '@/lib/live-api';

type Photo = { id: number; url: string; kind: 'before' | 'after' | null; onWebsite: boolean; createdAt: string };
const KIND = { before: 'Before', after: 'After' } as const;

export function ClientPhotos({ clientId, avatarUrl, onProfilePhoto, onRemoved }: {
  clientId: number; avatarUrl?: string | null; onProfilePhoto: (url: string | null) => void; onRemoved: () => void;
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);

  const load = useCallback(() => {
    api.get<Photo[]>(`/api/client-photos?clientId=${clientId}`).then(setPhotos).catch(() => setPhotos([]));
  }, [clientId]);
  useEffect(load, [load]);

  const upload = async (kind: 'before' | 'after' | null, camera: boolean) => {
    try {
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('Camera', 'Allow Certxa Pro to use the camera in your phone\'s Settings.'); return; }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, base64: true };
      const picked = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (picked.canceled || !picked.assets?.[0]?.base64) return;
      const asset = picked.assets[0];
      setBusy(true);
      await api.post('/api/client-photos', { clientId, data: asset.base64, mimeType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', kind });
      load();
    } catch (cause) {
      Alert.alert('Photo', cause instanceof ApiError ? cause.message : 'The photo could not be saved. Try again.');
    } finally { setBusy(false); }
  };
  const add = () => Alert.alert('Add a photo', undefined, [
    { text: 'Before · take photo', onPress: () => void upload('before', true) },
    { text: 'After · take photo', onPress: () => void upload('after', true) },
    { text: 'Choose from library', onPress: () => Alert.alert('Which is it?', undefined, [
      { text: 'Before', onPress: () => void upload('before', false) },
      { text: 'After', onPress: () => void upload('after', false) },
      { text: 'Neither', onPress: () => void upload(null, false) },
    ]) },
    { text: 'Cancel', style: 'cancel' },
  ]);
  const toWebsite = (p: Photo) => {
    const run = () => { setOpen(null); void api.post<Photo>(`/api/client-photos/${p.id}/website`, { show: !p.onWebsite }).then(load).catch(() => Alert.alert('Photo', 'That could not be changed. Try again.')); };
    if (p.onWebsite) run();
    else Alert.alert('Show on your website?', 'It goes in the Portfolio on your booking website. Only post a client\'s photo with their OK.', [
      { text: 'Not now', style: 'cancel' }, { text: 'Show it', onPress: run },
    ]);
  };
  const remove = (p: Photo) => Alert.alert('Remove this photo?', undefined, [
    { text: 'Keep', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => { setOpen(null); void api.del(`/api/client-photos/${p.id}`).then(() => { load(); onRemoved(); }).catch(() => undefined); } },
  ]);

  return (
    <View testID="client-photos">
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.foreground }]}>Photos</Text>
        <TouchableOpacity onPress={add} disabled={busy} style={styles.addLink} testID="client-photo-add">
          {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={[styles.addText, { color: colors.primary }]}>Add photo</Text>}
        </TouchableOpacity>
      </View>
      {photos == null ? null : photos.length === 0 ? (
        <Text style={[styles.empty, { color: colors.mutedForeground }]}>Before and after photos of their visits. Only you see them, unless you show one on your website.</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {photos.map((p) => (
            <TouchableOpacity key={p.id} onPress={() => setOpen(p)} testID={`client-photo-${p.id}`}>
              <Image source={{ uri: p.url }} style={[styles.thumb, { backgroundColor: colors.muted }]} />
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>
                {p.kind ? KIND[p.kind] : 'Photo'} · {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{p.onWebsite ? ' · on website' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={styles.viewer}>
          {open ? <Image source={{ uri: open.url }} resizeMode="contain" style={{ width, height: width * 1.25 }} /> : null}
          <View style={styles.viewerBar}>
            <TouchableOpacity onPress={() => open && toWebsite(open)} style={styles.viewerButton} testID="client-photo-website"><Feather name="globe" size={20} color="#FFFFFF" /><Text style={styles.viewerText}>{open?.onWebsite ? 'Take off website' : 'Show on website'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => { if (open) { onProfilePhoto(open.url === avatarUrl ? null : open.url); setOpen(null); } }} style={styles.viewerButton} testID="client-photo-profile"><Feather name="user" size={20} color="#FFFFFF" /><Text style={styles.viewerText}>{open?.url === avatarUrl ? 'Remove as profile photo' : 'Set as profile photo'}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => open && remove(open)} style={styles.viewerButton} testID="client-photo-remove"><Feather name="trash-2" size={20} color="#FFFFFF" /><Text style={styles.viewerText}>Remove</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setOpen(null)} style={styles.viewerButton} testID="client-photo-close"><Feather name="x" size={22} color="#FFFFFF" /><Text style={styles.viewerText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  addLink: { minHeight: 36, justifyContent: 'center' },
  addText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  empty: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular' },
  thumb: { width: 104, height: 130, borderRadius: 12 },
  caption: { fontSize: 14, fontFamily: 'Inter_500Medium', marginTop: 4 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerBar: { flexDirection: 'row', alignSelf: 'stretch', paddingHorizontal: 8, marginTop: 24 },
  viewerButton: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 4 },
  viewerText: { color: '#FFFFFF', fontSize: 15, textAlign: 'center', fontFamily: 'Inter_500Medium' },
});
