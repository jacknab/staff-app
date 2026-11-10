import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, ScrollView, StatusBar, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';

import { AppBackground } from '@/components/look/AppBackground';
import { SectionTitle } from '@/components/look/SectionHeader';
import { look, cardShadow } from '@/components/look/tokens';
type OfferedAt = 'place' | 'client' | 'any';
type Service = { id: number; name: string; duration: number; price: number; offeredAt: OfferedAt; categoryId: number | null; allowQuantity: boolean };
type Category = { id: number; name: string; sortOrder: number };
/** The service being added (id 0) or changed, as typed. */
type Draft = { id: number; name: string; minutes: string; price: string; offeredAt: OfferedAt; categoryId: number | null; allowQuantity: boolean; groupIds: number[] };
/** An add-on group (Catalog › Add-on Groups): every add-on in it is offered with the services that have it. */
type AddonGroup = { id: number; name: string; addonCount: number };

function minutesLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}

export default function ServicesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useBookingData();
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Only a business with its own place and house calls chooses where each service is done.
  const [offersBoth, setOffersBoth] = useState(false);
  const [ownPlace, setOwnPlace] = useState('My place');
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  // The open service's groups as saved, so Save only sends them when they changed.
  const [savedGroupIds, setSavedGroupIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    try {
      const [rows, cats] = await Promise.all([api.get<any[]>('/api/services'), api.get<any[]>('/api/service-categories')]);
      setServices((Array.isArray(rows) ? rows : []).map((row) => ({ id: Number(row.id), name: String(row.name ?? 'Service'), duration: Number(row.duration) || 0, price: Number(row.price) || 0, allowQuantity: Boolean(row.allowQuantity), offeredAt: row.offeredAt === 'place' || row.offeredAt === 'client' ? row.offeredAt : 'any', categoryId: row.categoryId == null ? null : Number(row.categoryId) })));
      setCategories((Array.isArray(cats) ? cats : []).map((row) => ({ id: Number(row.id), name: String(row.name ?? ''), sortOrder: Number(row.sortOrder) || 0 })).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id));
      const list = await api.get<any[]>('/api/addon-groups').catch(() => []);
      setAddonGroups((Array.isArray(list) ? list : []).map((row) => ({ id: Number(row.id), name: String(row.name ?? ''), addonCount: (row.addonIds ?? []).length })));
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your services.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<{ eligible?: boolean; ownPlace?: string; houseCalls?: boolean }>('/api/work-places')
      .then((p) => {
        setOffersBoth(Boolean(p?.eligible && p.houseCalls && p.ownPlace !== 'none'));
        setOwnPlace(p?.ownPlace === 'home' ? 'Home studio' : p?.ownPlace === 'salon' ? 'Salon' : 'My place');
      })
      .catch(() => undefined);
  }, []);

  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const minutes = Number.parseInt(draft.minutes, 10);
    const price = Number(draft.price);
    if (!name) return setError('Enter the name of the service.');
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) return setError('Enter how long it takes, in minutes (5 to 720).');
    if (!Number.isFinite(price) || price < 0) return setError('Enter the price, for example 45 or 45.50.');
    setSaving(true);
    setError('');
    try {
      const category = categories.find((row) => row.id === draft.categoryId);
      const body = { name, duration: minutes, price: price.toFixed(2), categoryId: category?.id ?? null, category: category?.name ?? 'General', allowQuantity: draft.allowQuantity, ...(offersBoth ? { offeredAt: draft.offeredAt } : {}) };
      let serviceId = draft.id;
      if (draft.id > 0) await api.patch(`/api/services/${draft.id}`, body);
      else serviceId = Number((await api.post<{ id: number }>('/api/services', body))?.id) || 0;
      if (serviceId > 0 && JSON.stringify(draft.groupIds) !== JSON.stringify(savedGroupIds)) {
        await api.put(`/api/services/${serviceId}/addon-groups`, { groupIds: draft.groupIds });
      }
      setDraft(null);
      await load();
      // The booking screens read services from the shared list.
      void refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the service.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (service: Service) => {
    Alert.alert('Remove this service?', `${service.name} will no longer be offered. Appointments already booked for it are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.del(`/api/services/${service.id}`);
            setDraft(null);
            await load();
            void refresh();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not remove the service.');
          }
        },
      },
    ]);
  };

  const openService = (service: Service) => {
    setError('');
    setSavedGroupIds([]);
    setDraft({ id: service.id, name: service.name, minutes: String(service.duration), price: service.price.toFixed(2), offeredAt: service.offeredAt, allowQuantity: service.allowQuantity, categoryId: service.categoryId, groupIds: [] });
    if (addonGroups.length === 0) return;
    api.get<{ groupIds: number[] }>(`/api/services/${service.id}/addon-groups`)
      .then((r) => {
        const ids = (r?.groupIds ?? []).map(Number);
        setSavedGroupIds(ids);
        setDraft((d) => (d && d.id === service.id ? { ...d, groupIds: ids } : d));
      })
      .catch(() => undefined);
  };

  const input = { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground };
  const editing = draft && draft.id > 0 ? services.find((service) => service.id === draft.id) : undefined;
  // The list under each category (in the Categories order), then the services with none.
  const groups = [
    ...categories.map((category) => ({ id: category.id, name: category.name, services: services.filter((service) => service.categoryId === category.id) })),
    { id: 0, name: 'Uncategorized', services: services.filter((service) => !categories.some((category) => category.id === service.categoryId)) },
  ].filter((group) => group.services.length > 0);

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity testID="services-back" accessibilityLabel="Back" onPress={() => (draft ? (setDraft(null), setError('')) : router.back())} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity>
        <HelpTitle help="services" style={[styles.headerTitle, { color: colors.foreground }]}>{draft ? (draft.id > 0 ? 'Edit service' : 'New service') : 'Services'}</HelpTitle>
        {draft ? <View style={styles.headerButton} /> : (
          <TouchableOpacity testID="services-add" accessibilityLabel="Add a service" onPress={() => { setError(''); setSavedGroupIds([]); setDraft({ id: 0, name: '', minutes: '', price: '', offeredAt: 'any', categoryId: null, allowQuantity: false, groupIds: [] }); }} style={styles.headerButton}><Feather name="plus" size={22} color={colors.primary} /></TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {draft ? (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>Name</Text>
            <TextInput testID="service-name" autoCapitalize="words" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Gel manicure" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>Minutes</Text>
                <TextInput testID="service-minutes" keyboardType="number-pad" value={draft.minutes} onChangeText={(minutes) => setDraft({ ...draft, minutes: minutes.replace(/\D/g, '') })} placeholder="60" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.foreground }]}>Price ($)</Text>
                <TextInput testID="service-price" keyboardType="decimal-pad" value={draft.price} onChangeText={(price) => setDraft({ ...draft, price: price.replace(/[^\d.]/g, '') })} placeholder="45.00" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
              </View>
            </View>
            {categories.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
                <SelectField testID="service-category" title="Category" value={draft.categoryId ?? 0}
                  options={[{ id: 0, name: 'None' }, ...categories].map((category) => ({ value: category.id, label: category.name }))}
                  onChange={(id) => setDraft({ ...draft, categoryId: id || null })} />
              </>
            ) : null}
            <View style={styles.quantityRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Clients choose how many</Text>
                <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>For anything priced per item. Clients see − 1 + on your website, up to 10.</Text>
              </View>
              <Switch testID="service-quantity" value={draft.allowQuantity} onValueChange={(allowQuantity) => setDraft({ ...draft, allowQuantity })} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
            {addonGroups.length > 0 || draft.groupIds.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Add-on groups</Text>
                {draft.groupIds.map((id) => {
                  const group = addonGroups.find((row) => row.id === id);
                  return (
                    <View key={id} testID={`service-group-${id}`} style={[styles.row, styles.groupRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{group?.name ?? 'Group'}</Text>
                        {group ? <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{`${group.addonCount} add-on${group.addonCount === 1 ? '' : 's'}`}</Text> : null}
                      </View>
                      <TouchableOpacity testID={`service-group-remove-${id}`} accessibilityLabel={`Remove ${group?.name ?? 'group'}`} onPress={() => setDraft({ ...draft, groupIds: draft.groupIds.filter((value) => value !== id) })} style={styles.headerButton}>
                        <Feather name="x" size={20} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {addonGroups.some((row) => !draft.groupIds.includes(row.id)) ? (
                  <SelectField testID="service-add-group" title="Add a group" placeholder="Add a group" value={null as number | null}
                    options={addonGroups.filter((row) => !draft.groupIds.includes(row.id)).map((row) => ({ value: row.id, label: row.name, hint: `${row.addonCount} add-on${row.addonCount === 1 ? '' : 's'}` }))}
                    onChange={(id) => setDraft({ ...draft, groupIds: [...draft.groupIds, id] })} />
                ) : null}
              </>
            ) : null}
            {offersBoth ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Where you offer it</Text>
                <SelectField testID="service-offered" value={draft.offeredAt} title="Where you offer it"
                  options={[{ value: 'any', label: `${ownPlace} and house calls` }, { value: 'place', label: `${ownPlace} only` }, { value: 'client', label: 'House calls only' }]}
                  onChange={(value) => setDraft({ ...draft, offeredAt: value })} />
              </>
            ) : null}
            {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
            <TouchableOpacity testID="service-save" disabled={saving} onPress={() => void save()} style={[styles.button, { backgroundColor: saving ? colors.muted : colors.primary }]}>
              <Text style={[styles.buttonText, { color: saving ? colors.mutedForeground : colors.primaryForeground }]}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
            {editing ? (
              <TouchableOpacity testID="service-remove" disabled={saving} onPress={() => remove(editing)} style={styles.removeButton}>
                <Text style={[styles.buttonText, { color: colors.destructive }]}>Remove service</Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <>
            {error ? <Text style={[styles.error, { color: colors.destructive, marginBottom: 12 }]}>{error}</Text> : null}
            {services.length === 0 && !error ? <Text style={[styles.empty, { color: colors.mutedForeground }]}>You have no services yet. Tap + to add the first one.</Text> : null}
            {groups.map((group) => (
            <View key={group.id} style={styles.group}>
              {categories.length > 0 ? <SectionTitle style={styles.groupTitle}>{group.name}</SectionTitle> : null}
            <View style={styles.list}>
              {group.services.map((service) => (
                <TouchableOpacity key={service.id} testID={`service-${service.id}`} onPress={() => openService(service)} style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.foreground }]}>{service.name}</Text>
                    <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{minutesLabel(service.duration)}{offersBoth && service.offeredAt === 'place' ? ` · ${ownPlace} only` : offersBoth && service.offeredAt === 'client' ? ' · House calls only' : ''}</Text>
                  </View>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{`$${service.price.toFixed(2)}`}</Text>
                  <Feather name="chevron-right" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              ))}
            </View>
            </View>
            ))}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  groupRow: { minHeight: 52, marginBottom: 8, paddingRight: 2 },
  root: { flex: 1 },
  header: { minHeight: 52, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  list: { gap: 8 },
  row: { borderWidth: 1, borderRadius: 15, minHeight: 60, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11, ...cardShadow },
  rowTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  rowHint: { fontSize: 14, fontFamily: 'Inter_400Regular', marginTop: 3 },
  label: { fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 18, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 14, fontSize: 17, fontFamily: 'Inter_400Regular' },
  pair: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, borderWidth: 1, borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrapChip: { borderWidth: 1, borderRadius: 12, minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  group: { marginBottom: 14 },
  groupTitle: { marginTop: 14, marginBottom: 4 },
  chipText: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  error: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_500Medium', marginTop: 14 },
  empty: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 24, textAlign: 'center' },
  button: { height: 53, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  buttonText: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  removeButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});
