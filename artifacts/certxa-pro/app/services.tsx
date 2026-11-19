import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Share, StatusBar, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { Alert } from '@/lib/appAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { SelectField } from '@/components/SelectField';
import { useBookingData } from '@/contexts/BookingContext';
import { api } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { SERVICE_COLORS } from '@/lib/serviceColors';

import { AppBackground } from '@/components/look/AppBackground';
import { SectionTitle } from '@/components/look/SectionHeader';
import { look, cardShadow } from '@/components/look/tokens';
import { useInPane } from '@/components/TabletSplit';
type OfferedAt = 'place' | 'client' | 'any';
type Service = { id: number; name: string; duration: number; price: number; offeredAt: OfferedAt; categoryId: number | null; allowQuantity: boolean; color: string | null; processingStart: number | null; processing: number | null; parentId: number | null; optionLabel: string | null };
type Category = { id: number; name: string; sortOrder: number };
/** The service being added (id 0) or changed, as typed. */
type Draft = { id: number; name: string; minutes: string; price: string; offeredAt: OfferedAt; categoryId: number | null; allowQuantity: boolean; groupIds: number[]; color: string | null; processingOn: boolean; processingStart: string; processing: string; options: OptionDraft[] };
/** A service option as typed (owner, 2026-11-18, GlossGenius): id 0 = new. */
type OptionDraft = { id: number; label: string; minutes: string; price: string };
/** An add-on group (Catalog › Add-on Groups): every add-on in it is offered with the services that have it. */
type AddonGroup = { id: number; name: string; addonCount: number };

function minutesLabel(minutes: number) {
  return minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
}

export default function ServicesScreen() {
  const colors = useColors();
  const inPane = useInPane();
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
      setServices((Array.isArray(rows) ? rows : []).filter((row) => row.isActive !== false).map((row) => ({ id: Number(row.id), name: String(row.name ?? 'Service'), duration: Number(row.duration) || 0, price: Number(row.price) || 0, allowQuantity: Boolean(row.allowQuantity), offeredAt: row.offeredAt === 'place' || row.offeredAt === 'client' ? row.offeredAt : 'any', categoryId: row.categoryId == null ? null : Number(row.categoryId), color: row.calendarColor ? String(row.calendarColor) : null, processingStart: row.processingStartMin ? Number(row.processingStartMin) : null, processing: row.processingMin ? Number(row.processingMin) : null, parentId: row.parentServiceId ? Number(row.parentServiceId) : null, optionLabel: row.optionLabel ? String(row.optionLabel) : null })));
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
  // The booking website, for each service's own booking link (owner, 2026-11-18, GlossGenius direct service links).
  const [siteSlug, setSiteSlug] = useState('');
  useEffect(() => {
    api.get<{ bookingSlug?: string | null }[]>('/api/stores').then((rows) => setSiteSlug(String((Array.isArray(rows) ? rows[0]?.bookingSlug : '') ?? ''))).catch(() => undefined);
  }, []);
  const shareLink = (service: Service) => {
    void Share.share({ message: `Book ${service.name}: https://${siteSlug}.certxa.com/?serviceId=${service.id}` });
  };
  useEffect(() => {
    api.get<{ eligible?: boolean; ownPlace?: string; houseCalls?: boolean }>('/api/work-places')
      .then((p) => {
        setOffersBoth(Boolean(p?.eligible && p.houseCalls && p.ownPlace !== 'none'));
        setOwnPlace(p?.ownPlace === 'home' ? 'Home studio' : p?.ownPlace === 'salon' ? 'Salon' : 'My place');
      })
      .catch(() => undefined);
  }, []);

  const optionsOf = (serviceId: number) => services.filter((row) => row.parentId === serviceId);
  const save = async () => {
    if (!draft || saving) return;
    const name = draft.name.trim();
    const minutes = Number.parseInt(draft.minutes, 10);
    const price = Number(draft.price);
    if (!name) return setError('Enter the name of the service.');
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) return setError('Enter how long it takes, in minutes (5 to 720).');
    if (!Number.isFinite(price) || price < 0) return setError('Enter the price, for example 45 or 45.50.');
    const pStart = Number.parseInt(draft.processingStart, 10), pMin = Number.parseInt(draft.processing, 10);
    const options = draft.options.map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim(), minutes: Number.parseInt(o.minutes, 10), price: Number(o.price) }));
    if (options.some((o) => !o.label || !(o.minutes >= 5 && o.minutes <= 720) || !Number.isFinite(o.price) || o.price < 0)) return setError('Each option needs a name, its minutes (5 to 720) and a price.');
    if (draft.processingOn && (!(pStart >= 5) || !(pMin >= 5) || pStart + pMin >= minutes)) return setError('Processing time: enter the minutes of work first and the minutes of processing, leaving time to finish within the service’s minutes.');
    setSaving(true);
    setError('');
    try {
      const category = categories.find((row) => row.id === draft.categoryId);
      const body = { name, duration: minutes, price: price.toFixed(2), categoryId: category?.id ?? null, category: category?.name ?? 'General', allowQuantity: draft.allowQuantity, calendarColor: draft.color, processingStartMin: draft.processingOn ? pStart : null, processingMin: draft.processingOn ? pMin : null, ...(offersBoth ? { offeredAt: draft.offeredAt } : {}) };
      let serviceId = draft.id;
      if (draft.id > 0) await api.patch(`/api/services/${draft.id}`, body);
      else serviceId = Number((await api.post<{ id: number }>('/api/services', body))?.id) || 0;
      if (serviceId > 0 && JSON.stringify(draft.groupIds) !== JSON.stringify(savedGroupIds)) {
        await api.put(`/api/services/${serviceId}/addon-groups`, { groupIds: draft.groupIds });
      }
      // Options are saved after the service, so each gets its name, groups and staff as they are now.
      if (serviceId > 0 && (options.length > 0 || optionsOf(serviceId).length > 0)) await api.put(`/api/pro/services/${serviceId}/options`, { options });
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
    setDraft({ id: service.id, name: service.name, minutes: String(service.duration), price: service.price.toFixed(2), offeredAt: service.offeredAt, allowQuantity: service.allowQuantity, categoryId: service.categoryId, groupIds: [], color: service.color, processingOn: !!service.processing, processingStart: service.processingStart ? String(service.processingStart) : '', processing: service.processing ? String(service.processing) : '',
      options: optionsOf(service.id).map((o) => ({ id: o.id, label: o.optionLabel ?? o.name, minutes: String(o.duration), price: o.price.toFixed(2) })) });
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
  const setOption = (i: number, change: Partial<OptionDraft>) => draft && setDraft({ ...draft, options: draft.options.map((o, j) => (j === i ? { ...o, ...change } : o)) });
  const editing = draft && draft.id > 0 ? services.find((service) => service.id === draft.id) : undefined;
  // The list under each category (in the Categories order), then the services with none.
  // Options are listed inside their service, not as services of their own.
  const listed = services.filter((service) => service.parentId == null);
  const groups = [
    ...categories.map((category) => ({ id: category.id, name: category.name, services: listed.filter((service) => service.categoryId === category.id) })),
    { id: 0, name: 'Uncategorized', services: listed.filter((service) => !categories.some((category) => category.id === service.categoryId)) },
  ].filter((group) => group.services.length > 0);

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: look.pageTop, paddingTop: insets.top }]} behavior="padding" keyboardVerticalOffset={0}>
      <AppBackground />
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        {!inPane || !!draft ? <TouchableOpacity testID="services-back" accessibilityLabel="Back" onPress={() => (draft ? (setDraft(null), setError('')) : router.back())} style={styles.headerButton}><Feather name="arrow-left" size={21} color={colors.foreground} /></TouchableOpacity> : <View style={styles.headerButton} />}
        <HelpTitle help="services" style={[styles.headerTitle, { color: colors.foreground }]}>{draft ? (draft.id > 0 ? 'Edit service' : 'New service') : 'Services'}</HelpTitle>
        {draft ? <View style={styles.headerButton} /> : (
          <TouchableOpacity testID="services-add" accessibilityLabel="Add a service" onPress={() => { setError(''); setSavedGroupIds([]); setDraft({ id: 0, name: '', minutes: '', price: '', offeredAt: 'any', categoryId: null, allowQuantity: false, groupIds: [], color: null, processingOn: false, processingStart: '', processing: '', options: [] }); }} style={styles.headerButton}><Feather name="plus" size={22} color={colors.primary} /></TouchableOpacity>
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
            {/* Processing time (owner, 2026-11-18, GlossGenius): work, then time the client waits, then the finish. */}
            <View style={styles.quantityRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.foreground }]}>Processing time</Text>
                <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>Time in the middle when the client waits (colour, a mask). You can take another client then.</Text>
              </View>
              <Switch testID="service-processing" value={draft.processingOn} onValueChange={(processingOn) => setDraft({ ...draft, processingOn })} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>
            {draft.processingOn ? (
              <>
                <View style={styles.pair}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.foreground }]}>Work first (min)</Text>
                    <TextInput testID="service-processing-start" keyboardType="number-pad" value={draft.processingStart} onChangeText={(v) => setDraft({ ...draft, processingStart: v.replace(/\D/g, '') })} placeholder="30" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.label, { color: colors.foreground }]}>Processing (min)</Text>
                    <TextInput testID="service-processing-min" keyboardType="number-pad" value={draft.processing} onChangeText={(v) => setDraft({ ...draft, processing: v.replace(/\D/g, '') })} placeholder="45" placeholderTextColor={colors.mutedForeground} style={[styles.input, input]} />
                  </View>
                </View>
                {(() => {
                  const left = (Number.parseInt(draft.minutes, 10) || 0) - (Number.parseInt(draft.processingStart, 10) || 0) - (Number.parseInt(draft.processing, 10) || 0);
                  return <Text style={[styles.rowHint, { color: left > 0 ? colors.mutedForeground : colors.destructive }]}>{left > 0 ? `Then ${left} min to finish.` : 'Leave time to finish: work first and processing must be less than the service’s minutes.'}</Text>;
                })()}
              </>
            ) : null}
            {categories.length > 0 ? (
              <>
                <Text style={[styles.label, { color: colors.foreground }]}>Category</Text>
                <SelectField testID="service-category" title="Category" value={draft.categoryId ?? 0}
                  options={[{ id: 0, name: 'None' }, ...categories].map((category) => ({ value: category.id, label: category.name }))}
                  onChange={(id) => setDraft({ ...draft, categoryId: id || null })} />
              </>
            ) : null}
            <Text style={[styles.label, { color: colors.foreground }]}>Calendar colour</Text>
            <View style={styles.pair}>
              <View style={{ flex: 1 }}>
                <SelectField testID="service-color" title="Calendar colour" value={draft.color ?? ''}
                  options={[{ value: '', label: 'Default' }, ...SERVICE_COLORS]} onChange={(color) => setDraft({ ...draft, color: color || null })} />
              </View>
              <View testID="service-color-swatch" style={[styles.swatch, { backgroundColor: draft.color ?? colors.card, borderColor: colors.border }]} />
            </View>
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
            {/* Options (owner, 2026-11-18, GlossGenius): versions of this service with their own time and price. */}
            <Text style={[styles.label, { color: colors.foreground }]}>Options</Text>
            <Text style={[styles.rowHint, { color: colors.mutedForeground, marginTop: -4, marginBottom: 8 }]}>Versions of this service with their own time and price, like Short, Medium, Long. Clients choose one.</Text>
            {draft.options.map((o, i) => (
              <View key={`${o.id}-${i}`} testID={`service-option-${i}`} style={[styles.row, styles.groupRow, { backgroundColor: colors.card, borderColor: colors.border, flexDirection: 'column', alignItems: 'stretch' }]}>
                <View style={styles.pair}>
                  <TextInput testID={`service-option-label-${i}`} value={o.label} onChangeText={(label) => setOption(i, { label: label.slice(0, 40) })} placeholder="Name, e.g. Long" placeholderTextColor={colors.mutedForeground} style={[styles.input, input, { flex: 1 }]} />
                  <TouchableOpacity testID={`service-option-remove-${i}`} accessibilityLabel={`Remove ${o.label || 'option'}`} onPress={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })} style={styles.headerButton}><Feather name="x" size={20} color={colors.mutedForeground} /></TouchableOpacity>
                </View>
                <View style={[styles.pair, { marginTop: 8 }]}>
                  <TextInput testID={`service-option-minutes-${i}`} keyboardType="number-pad" value={o.minutes} onChangeText={(minutes) => setOption(i, { minutes: minutes.replace(/\D/g, '') })} placeholder="Minutes" placeholderTextColor={colors.mutedForeground} style={[styles.input, input, { flex: 1 }]} />
                  <TextInput testID={`service-option-price-${i}`} keyboardType="decimal-pad" value={o.price} onChangeText={(price) => setOption(i, { price: price.replace(/[^\d.]/g, '') })} placeholder="Price ($)" placeholderTextColor={colors.mutedForeground} style={[styles.input, input, { flex: 1 }]} />
                </View>
              </View>
            ))}
            {draft.options.length < 12 ? (
              <TouchableOpacity testID="service-option-add" onPress={() => setDraft({ ...draft, options: [...draft.options, { id: 0, label: '', minutes: draft.minutes, price: '' }] })} style={{ alignSelf: 'flex-start', paddingVertical: 6 }}>
                <Text style={[styles.rowTitle, { color: colors.primary }]}>Add an option</Text>
              </TouchableOpacity>
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
            {editing && siteSlug ? (
              <TouchableOpacity testID="service-share-link" onPress={() => shareLink(editing)} style={[styles.button, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[styles.buttonText, { color: colors.foreground }]}>Share booking link</Text>
              </TouchableOpacity>
            ) : null}
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
                    <Text style={[styles.rowHint, { color: colors.mutedForeground }]}>{optionsOf(service.id).length ? `${optionsOf(service.id).length} options` : minutesLabel(service.duration)}{service.processing ? ` · ${service.processing} min processing` : ''}{offersBoth && service.offeredAt === 'place' ? ` · ${ownPlace} only` : offersBoth && service.offeredAt === 'client' ? ' · House calls only' : ''}</Text>
                  </View>
                  <Text style={[styles.rowTitle, { color: colors.foreground }]}>{optionsOf(service.id).length ? `from $${Math.min(...optionsOf(service.id).map((o) => o.price)).toFixed(2)}` : `$${service.price.toFixed(2)}`}</Text>
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
  swatch: { width: 52, height: 52, borderRadius: 14, borderWidth: 1 },
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
