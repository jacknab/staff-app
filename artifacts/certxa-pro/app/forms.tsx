/**
 * MORE → Forms & Waivers (owner, 2026-11-15: "match GlossGenius"). Intake forms and waivers clients fill in on their
 * phone before the visit: sent by themselves when a client books a service the form is for, or from the booking or
 * the client's profile. Start from a ready-made form or a blank one. The server keeps signed copies as they were.
 *   GET/POST /api/pro/forms · PUT/DELETE /api/pro/forms/:id · GET /api/pro/forms/templates
 */
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Alert } from '@/lib/appAlert';
import { useRouter } from 'expo-router';
import { CatalogScreen, Checklist, Choice, Empty, ErrorLine, Field, Label, List, Loading, QuietButton, Row, SaveButton, SectionTitle, Toggle, errorText } from '@/components/catalog/CatalogKit';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/live-api';
import { useWindowDimensions } from 'react-native';
import { EmptyHero } from '@/components/EmptyHero';
import { PageIntro } from '@/components/PageIntro';
import { HELP_PANEL_MIN_WIDTH } from '@/components/TabletFrame';
import { TABLET_INTRO } from '@/lib/tabletIntro';

type FieldType = 'text' | 'long_text' | 'yes_no' | 'choice' | 'multi' | 'date' | 'agree' | 'info' | 'signature';
type Question = { label: string; fieldType: FieldType; options: string; required: boolean };
type Kind = 'intake' | 'waiver';
type Frequency = 'once' | 'every_visit';
type Form = { id: number; name: string; description: string | null; kind: Kind; frequency: Frequency; sendAuto: boolean; allServices: boolean; isActive: boolean; serviceIds: number[]; completed: number; waiting: number; fields: Array<{ label: string; fieldType: FieldType; options: string[]; required: boolean }> };
type Template = { id: string; name: string; kind: Kind; frequency: Frequency; description: string; fields: Form['fields'] };
type Draft = { id: number; name: string; description: string; kind: Kind; frequency: Frequency; sendAuto: boolean; allServices: boolean; serviceIds: number[]; questions: Question[] };

const TYPES: Array<[FieldType, string]> = [
  ['text', 'Short answer'], ['long_text', 'Long answer'], ['yes_no', 'Yes or no'], ['choice', 'Pick one'], ['multi', 'Pick any'],
  ['date', 'Date'], ['agree', 'I agree (tick box)'], ['info', 'Text to read (no answer)'], ['signature', 'Signature'],
];
const typeName = (t: FieldType) => TYPES.find(([v]) => v === t)?.[1] ?? t;
const toDraft = (f: Pick<Form, 'name' | 'description' | 'kind' | 'frequency' | 'fields'> & Partial<Form>, id = 0): Draft => ({
  id, name: f.name, description: f.description ?? '', kind: f.kind, frequency: f.frequency, sendAuto: f.sendAuto ?? true, allServices: f.allServices ?? true,
  serviceIds: f.serviceIds ?? [], questions: f.fields.map((q) => ({ label: q.label, fieldType: q.fieldType, options: q.options.join('\n'), required: q.required })),
});

export default function FormsScreen() {
  const router = useRouter();
  const colors = useColors();
  const [forms, setForms] = useState<Form[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [services, setServices] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  const startNew = () => { setError(''); setPicking(true); };

  const load = useCallback(async () => {
    try {
      const [list, temps, svc] = await Promise.all([api.get<Form[]>('/api/pro/forms'), api.get<Template[]>('/api/pro/forms/templates'), api.get<any[]>('/api/services')]);
      setForms(Array.isArray(list) ? list : []);
      setTemplates(Array.isArray(temps) ? temps : []);
      setServices((Array.isArray(svc) ? svc : []).filter((s) => s.isActive !== false).map((s) => ({ id: Number(s.id), name: String(s.name ?? '') })));
      setError('');
    } catch (cause) { setError(errorText(cause, 'Could not load your forms.')); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const setQ = (i: number, q: Partial<Question>) => draft && setDraft({ ...draft, questions: draft.questions.map((x, j) => (j === i ? { ...x, ...q } : x)) });
  const moveQ = (i: number, by: number) => {
    if (!draft) return;
    const j = i + by;
    if (j < 0 || j >= draft.questions.length) return;
    const qs = [...draft.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    setDraft({ ...draft, questions: qs });
  };

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.name.trim()) return setError('Give the form a name.');
    if (draft.questions.length === 0) return setError('Add at least one question.');
    if (draft.questions.some((q) => !q.label.trim())) return setError('Every question needs some words.');
    if (!draft.allServices && draft.serviceIds.length === 0) return setError('Choose the services this form is for, or send it for every service.');
    setSaving(true); setError('');
    try {
      const body = {
        name: draft.name.trim(), description: draft.description.trim() || null, kind: draft.kind, frequency: draft.frequency, sendAuto: draft.sendAuto,
        allServices: draft.allServices, serviceIds: draft.allServices ? [] : draft.serviceIds,
        fields: draft.questions.map((q) => ({ label: q.label.trim(), fieldType: q.fieldType, options: q.options.split('\n').map((o) => o.trim()).filter(Boolean), required: q.required })),
      };
      if (draft.id > 0) await api.put(`/api/pro/forms/${draft.id}`, body);
      else await api.post('/api/pro/forms', body);
      setDraft(null);
      await load();
    } catch (cause) { setError(errorText(cause, 'Could not save the form.')); }
    finally { setSaving(false); }
  };

  const setActive = async (isActive: boolean) => {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try { await api.put(`/api/pro/forms/${draft.id}`, { isActive }); setDraft(null); await load(); }
    catch (cause) { setError(errorText(cause, 'Could not change the form.')); }
    finally { setSaving(false); }
  };

  const remove = () => {
    if (!draft) return;
    const form = forms.find((f) => f.id === draft.id);
    Alert.alert('Delete this form?', form?.completed ? 'Clients have filled it in, so their copies are kept and the form is switched off.' : 'It will be deleted for good.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setSaving(true);
        try { await api.del(`/api/pro/forms/${draft.id}`); setDraft(null); await load(); }
        catch (cause) { setError(errorText(cause, 'Could not delete the form.')); }
        finally { setSaving(false); }
      } },
    ]);
  };

  const editing = draft && draft.id > 0 ? forms.find((f) => f.id === draft.id) : undefined;
  const hint = (f: Form) => [
    f.kind === 'waiver' ? 'Waiver' : 'Intake form',
    f.frequency === 'once' ? 'once per client' : 'every visit',
    f.sendAuto ? (f.allServices ? 'sent for every booking' : `sent for ${f.serviceIds.length} service${f.serviceIds.length === 1 ? '' : 's'}`) : 'sent by you',
    `${f.completed} filled in`,
  ].join(' · ');
  const back = () => {
    if (draft) { setDraft(null); setError(''); return; }
    if (picking) { setPicking(false); return; }
    router.back();
  };

  return (
    <CatalogScreen
      help="forms"
      title={draft ? (draft.id > 0 ? 'Edit form' : 'New form') : picking ? 'Start a form' : 'Forms & Waivers'}
      onBack={back}
      inner={!!draft || picking}
      onAdd={draft || picking ? undefined : startNew}
      addLabel="Add a form"
      testID="forms"
    >
      {draft ? (
        <>
          <Field label="Name" testID="form-name" autoCapitalize="sentences" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} placeholder="For example, Lash consent" />
          <Field label="Note at the top" testID="form-description" multiline value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} placeholder="Optional" />
          <Label>Type</Label>
          <Choice testID="form-kind" options={[['intake', 'Intake form (questions)'], ['waiver', 'Waiver (signed)']]} value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
          <Label>Ask clients</Label>
          <Choice testID="form-frequency" options={[['once', 'Once (keep their answers)'], ['every_visit', 'Before every visit']]} value={draft.frequency} onChange={(frequency) => setDraft({ ...draft, frequency })} />
          <Toggle testID="form-send-auto" title="Send when clients book" hint="The link is e-mailed (or texted, if there’s no e-mail) a few minutes after a booking." value={draft.sendAuto} onChange={(sendAuto) => setDraft({ ...draft, sendAuto })} />
          <Toggle testID="form-all-services" title="For every service" hint="Turn off to choose the services that need this form." value={draft.allServices} onChange={(allServices) => setDraft({ ...draft, allServices })} />
          {!draft.allServices ? (
            <>
              <Label>Services</Label>
              <Checklist testID="form-services" items={services.map((s) => ({ id: s.id, title: s.name }))} picked={draft.serviceIds}
                onToggle={(sid) => setDraft({ ...draft, serviceIds: draft.serviceIds.includes(sid) ? draft.serviceIds.filter((x) => x !== sid) : [...draft.serviceIds, sid] })} empty="Add services first." />
            </>
          ) : null}

          <SectionTitle>QUESTIONS</SectionTitle>
          {draft.questions.map((q, i) => (
            <View key={i} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`form-q-${i}`}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>{i + 1}. {typeName(q.fieldType)}</Text>
                <View style={styles.cardTools}>
                  <TouchableOpacity accessibilityLabel="Move up" onPress={() => moveQ(i, -1)} style={styles.tool}><Feather name="arrow-up" size={18} color={colors.mutedForeground} /></TouchableOpacity>
                  <TouchableOpacity accessibilityLabel="Move down" onPress={() => moveQ(i, 1)} style={styles.tool}><Feather name="arrow-down" size={18} color={colors.mutedForeground} /></TouchableOpacity>
                  <TouchableOpacity accessibilityLabel="Remove question" testID={`form-q-${i}-remove`} onPress={() => setDraft({ ...draft, questions: draft.questions.filter((_, j) => j !== i) })} style={styles.tool}><Feather name="trash-2" size={18} color={colors.mutedForeground} /></TouchableOpacity>
                </View>
              </View>
              <Choice testID={`form-q-${i}-type`} options={TYPES} value={q.fieldType} onChange={(fieldType) => setQ(i, { fieldType, required: fieldType === 'info' ? false : q.required })} />
              <Field label={q.fieldType === 'info' ? 'Text' : q.fieldType === 'agree' ? 'What they agree to' : 'Question'} testID={`form-q-${i}-label`} multiline value={q.label} onChangeText={(label) => setQ(i, { label })} />
              {q.fieldType === 'choice' || q.fieldType === 'multi' ? (
                <Field label="Answers (one per line)" testID={`form-q-${i}-options`} multiline value={q.options} onChangeText={(options) => setQ(i, { options })} />
              ) : null}
              {q.fieldType !== 'info' ? <Toggle testID={`form-q-${i}-required`} title="Required" value={q.required} onChange={(required) => setQ(i, { required })} /> : null}
            </View>
          ))}
          <QuietButton label="+ Add a question" testID="form-add-question" onPress={() => setDraft({ ...draft, questions: [...draft.questions, { label: '', fieldType: 'text', options: '', required: false }] })} />
          {draft.kind === 'waiver' && !draft.questions.some((q) => q.fieldType === 'signature') ? (
            <QuietButton label="+ Add a signature" testID="form-add-signature" onPress={() => setDraft({ ...draft, questions: [...draft.questions, { label: 'Signature', fieldType: 'signature', options: '', required: true }] })} />
          ) : null}
          <ErrorLine>{error}</ErrorLine>
          <SaveButton saving={saving} onPress={() => void save()} testID="form-save" />
          {editing?.isActive ? <QuietButton disabled={saving} label="Switch off" onPress={() => void setActive(false)} testID="form-off" /> : null}
          {editing && !editing.isActive ? <QuietButton disabled={saving} label="Switch on" onPress={() => void setActive(true)} testID="form-on" /> : null}
          {editing ? <QuietButton destructive disabled={saving} label="Delete form" onPress={remove} testID="form-delete" /> : null}
        </>
      ) : picking ? (
        <List>
          <Row testID="form-template-blank" title="Blank form" hint="Write your own questions" onPress={() => { setPicking(false); setDraft({ id: 0, name: '', description: '', kind: 'intake', frequency: 'once', sendAuto: true, allServices: true, serviceIds: [], questions: [{ label: '', fieldType: 'text', options: '', required: false }] }); }} />
          {templates.map((t) => (
            <Row key={t.id} testID={`form-template-${t.id}`} title={t.name} hint={`${t.kind === 'waiver' ? 'Waiver' : 'Intake form'} · ${t.fields.length} questions · you can change it`}
              onPress={() => { setPicking(false); setDraft(toDraft({ name: t.name, description: t.description, kind: t.kind, frequency: t.frequency, fields: t.fields })); }} />
          ))}
        </List>
      ) : loading ? <Loading /> : (
        <>
          <ErrorLine>{error}</ErrorLine>
          {/* Nothing made yet (owner's mock-up, 2026-11-20): the big intro with Create a Form or Waiver; on a phone or an
              upright tablet the intro panel's rows go under it. */}
          {forms.length === 0 && !error ? (
            <>
              <EmptyHero testID="forms-empty" compact={width < 600} icons={['shield', 'clipboard', 'user']} badge="edit-2" title="Create Forms & Waivers"
                text="Collect client information, agreements, and consent forms digitally."
                button="Create a Form or Waiver" onPress={startNew} note="No forms yet. Tap + to make one." />
              {width < HELP_PANEL_MIN_WIDTH ? <PageIntro compact={width < 600} intro={TABLET_INTRO.forms} /> : null}
            </>
          ) : null}
          {forms.length > 0 ? (
            <List>
              {forms.map((f) => <Row key={f.id} testID={`form-${f.id}`} dim={!f.isActive} title={f.name} hint={f.isActive ? hint(f) : 'Switched off'} onPress={() => { setError(''); setDraft(toDraft(f, f.id)); }} />)}
            </List>
          ) : null}
        </>
      )}
    </CatalogScreen>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 15, padding: 12, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardNumber: { fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  cardTools: { flexDirection: 'row' },
  tool: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
});
