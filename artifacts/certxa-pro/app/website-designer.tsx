/**
 * Website designer (owner, 2026-11-09; plans/ai-website-builder.md on the server, Stages 1–2): "here's your business as
 * I know it", then six ideas drawn as small phone pages. Each gets Love it / Not this, an optional note and what it's
 * about (colours, letters, layout, words); "More ideas" makes six new ones from that feedback. Each AI step uses AI
 * credits (200 free per account). Server: routes/aiSite.ts.
 * "Look me up online" (research step): what Google, the old website and the web say, as cards naming their sources,
 * and "which is right?" questions where they disagree (a phone number picked here becomes the business phone).
 * The mockups use the app's fonts as stand-ins for the site's (a serif for Playfair, bold capitals for Bebas…); the real
 * site loads the exact ones.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { api, ApiError } from '@/lib/live-api';
import { HelpTitle } from '@/components/HelpTitle';
import { AppBackground } from '@/components/look/AppBackground';
import { SectionTitle } from '@/components/look/SectionHeader';
import { cardShadow, look } from '@/components/look/tokens';

type Block = { type: string; title?: string; lines?: string[] };
type Idea = { angle: string; why: string; layout: string; palette: { background: string; surface: string; text: string; accent: string };
  fonts: { heading: string; body: string }; headline: string; subline: string; blocks: Block[]; callToAction: string };
type Feedback = { verdict: 'love' | 'not' | null; note: string | null; chips: string[] };
type Round = { id: number; ideas: Idea[]; feedback: Feedback[] };
type Facts = {
  business: { name: string; kind: string; phone: string | null; area: string | null; privateAddress: boolean; about: string | null; houseCalls: { radiusMiles: number | null } | null };
  services: { name: string; price: number | null }[]; hours: { day: string; open: string | null }[]; team: { name: string }[];
  rating: { average: number; count: number } | null; photos: number; missing: string[];
};
type Version = { id: number; madeBy: string; summary: string | null; previewUrl: string | null; createdAt: string; live: boolean };
type FoundCard = { kind: string; title: string; text: string; chips: string[]; sources: string[] };
type FoundQuestion = { id: string; topic: string; question: string; options: { label: string; from: string }[]; hint?: string };
type Answer = { choice?: number; text?: string; skipped?: boolean };
type Research = { id: number; found: { summary: string; cards: FoundCard[]; questions: FoundQuestion[]; webSearched: boolean }; answers: Record<string, Answer> };
type State = { available: boolean; credits: number; prices: { ideas: number; moreIdeas: number; build: number; research: number }; facts: Facts; round: Round | null;
  research: Research | null; version: Version | null; job: { id: number; kind: string } | null; liveVersionId: number | null; siteUrl: string | null; messages: ChatMessage[] };
type ChatMessage = { id: number; role: 'owner' | 'designer'; text: string; versionId: number | null; createdAt: string };
type JobPoll = { status: 'running' | 'done' | 'failed'; error?: string | null; credits: number; research?: Research | null; round?: Round | null; version?: Version | null; messages?: ChatMessage[] };

const CARD_LABELS: Record<string, string> = { where: 'Where you are', guests: 'What guests say', oldSite: 'Your old site', nearby: 'Salons nearby',
  neighbourhood: 'Your neighbourhood', look: 'How you look', other: 'Also found' };
type Working = 'research' | 'ideas' | 'more' | 'build' | 'change';
const CHIPS = [{ key: 'colours', label: 'Colours' }, { key: 'letters', label: 'Letters' }, { key: 'layout', label: 'Layout' }, { key: 'words', label: 'Words' }];
const MISSING: Record<string, string> = {
  services: 'No services yet. Add them in Settings › Catalog.',
  prices: 'Most services have no price. Prices make a site much stronger (Settings › Catalog).',
  hours: 'No opening hours yet (Settings › Hours).',
  phone: 'No business phone number (Settings › Business details).',
  location: 'No city or address (Settings › Location).',
  photos: 'No photos of your work yet (More › Portfolio).',
  about: 'No About text yet (Settings › Website › About you).',
};
const SERIF = ['Playfair Display', 'DM Serif Display', 'Fraunces', 'Cormorant Garamond', 'Lora', 'Abril Fatface'];
const CONDENSED = ['Bebas Neue', 'Oswald', 'Archivo Black'];
const serifFamily = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });
/** The app's closest stand-in for a site font. */
function headingStyle(font: string) {
  if (SERIF.includes(font)) return { fontFamily: serifFamily, fontWeight: '700' as const };
  if (CONDENSED.includes(font)) return { fontFamily: 'Inter_700Bold', textTransform: 'uppercase' as const, letterSpacing: -0.5 };
  if (font === 'Pacifico') return { fontFamily: serifFamily, fontStyle: 'italic' as const, fontWeight: '700' as const };
  return { fontFamily: 'Inter_700Bold' };
}
const bodyStyle = (font: string) => (SERIF.includes(font) ? { fontFamily: serifFamily } : { fontFamily: 'Inter_400Regular' });
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** One idea drawn as a small phone page. */
function IdeaPreview({ idea, name }: { idea: Idea; name: string }) {
  const p = idea.palette;
  const head = headingStyle(idea.fonts.heading), body = bodyStyle(idea.fonts.body);
  return (
    <View style={[styles.phone, { backgroundColor: p.background }]}>
      <View style={styles.phoneTop}>
        <Text style={[{ color: p.text, fontSize: 13 }, head]} numberOfLines={1}>{name}</Text>
        <View style={[styles.phoneMenu, { borderColor: p.text }]}><Text style={[{ color: p.text, fontSize: 11 }, body]}>Menu</Text></View>
      </View>
      <Text style={[{ color: p.text, fontSize: 30, lineHeight: 34, marginTop: 14 }, head]}>{idea.headline}</Text>
      {idea.subline ? <Text style={[{ color: p.text, opacity: 0.8, fontSize: 14, lineHeight: 20, marginTop: 6 }, body]}>{idea.subline}</Text> : null}
      {idea.blocks.filter((b) => b.type !== 'callToAction').map((b, i) => (
        <View key={i} style={[styles.block, { backgroundColor: p.surface }]}>
          {b.title ? <Text style={[{ color: p.text, fontSize: 15, marginBottom: 6 }, head]}>{b.title}</Text> : null}
          {(b.lines ?? []).slice(0, 6).map((line, j) => {
            const [left, right] = line.split(' · ');
            return b.type === 'priceList' && right ? (
              <View key={j} style={styles.priceRow}>
                <Text style={[{ color: p.text, fontSize: 13, flex: 1 }, body]} numberOfLines={1}>{left}</Text>
                <Text style={[{ color: p.accent, fontSize: 13 }, head]}>{right}</Text>
              </View>
            ) : (
              <Text key={j} style={[{ color: p.text, fontSize: 13, lineHeight: 19, opacity: 0.9 }, body, b.type === 'reviews' && { fontStyle: 'italic' }]}>
                {b.type === 'reviews' ? `“${line.replace(/^[\s"“”']+|[\s"“”']+$/g, '')}”` : line}
              </Text>
            );
          })}
        </View>
      ))}
      <View style={[styles.cta, { backgroundColor: p.accent }]}>
        <Text style={[{ color: p.background, fontSize: 15 }, head]} numberOfLines={1}>{idea.callToAction}</Text>
      </View>
    </View>
  );
}

export default function WebsiteDesigner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState<Working | null>(null);
  const [change, setChange] = useState('');
  const notes = useRef<Record<number, string>>({});
  // Stage 4: every version, which one is online, and the switches.
  const [list, setList] = useState<Version[]>([]);
  const [switching, setSwitching] = useState(false);
  const loadVersions = useCallback(async () => {
    const r = await api.get<{ versions: Version[] }>('/api/ai-site/versions').catch(() => null);
    if (r) setList(r.versions);
  }, []);

  // AI steps run as background jobs on the server (they can take a few minutes): check every 4 seconds until done.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const follow = useCallback(async (jobId: number, kind: Working) => {
    setWorking(kind);
    try {
      for (;;) {
        await new Promise((r) => setTimeout(r, 4000));
        if (!alive.current) return;
        const job = await api.get<JobPoll>(`/api/ai-site/jobs/${jobId}`).catch(() => null);
        if (!job) continue;
        if (job.status === 'running') { setState((s) => (s ? { ...s, credits: job.credits } : s)); continue; }
        if (job.status === 'failed') { setError(job.error ?? 'Something went wrong. Your credits were not used.'); setState((s) => (s ? { ...s, credits: job.credits } : s)); return; }
        setState((s) => (s ? { ...s, credits: job.credits, research: job.research ?? s.research, round: job.round ?? s.round, version: job.version ?? s.version, messages: job.messages ?? s.messages } : s));
        if (kind === 'ideas' || kind === 'more') notes.current = {}; else if (kind !== 'research') void loadVersions();
        return;
      }
    } finally { if (alive.current) setWorking(null); }
  }, [loadVersions]);

  const load = useCallback(async () => {
    try {
      const next = await api.get<State>('/api/ai-site');
      setState(next); setError('');
      void loadVersions();
      // Opened again while the designer is still working: pick the job back up.
      if (next.job) void follow(next.job.id, next.job.kind === 'research' ? 'research' : next.job.kind === 'build' ? 'build' : next.job.kind === 'change' ? 'change' : next.job.kind === 'more-ideas' ? 'more' : 'ideas');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The website designer could not be opened.'); }
  }, [follow, loadVersions]);
  useEffect(() => { void load(); }, [load]);

  // Stage 5: describe a change; a new version with only that change (2 credits, none if nothing needed changing).
  const sendChange = async () => {
    const message = change.trim();
    if (!state || working || message.length < 2) return;
    if (state.credits < 2) { Alert.alert('Not enough credits', `A change needs 2 credits; you have ${state.credits}.`); return; }
    setError('');
    try {
      const r = await api.post<{ jobId: number; credits: number }>('/api/ai-site/change', { message, idempotencyKey: newKey() });
      setChange('');
      setState((s) => (s ? { ...s, credits: r.credits, messages: [...s.messages, { id: -Date.now(), role: 'owner', text: message, versionId: null, createdAt: new Date().toISOString() }] } : s));
      void follow(r.jobId, 'change');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Your change could not be sent. Your credits were not used.'); }
  };

  /** Put a version online (asks first), or go back to the regular design. */
  const publish = (v: Version) => Alert.alert('Put it online?', `${state?.siteUrl?.replace('https://', '') ?? 'Your website'} will show this design from now on. You can switch back any time.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Put it online', onPress: async () => {
      setSwitching(true); setError('');
      try {
        const r = await api.post<{ versions: Version[] }>(`/api/ai-site/versions/${v.id}/publish`, {});
        setList(r.versions);
        setState((s) => (s ? { ...s, liveVersionId: v.id, version: s.version ? { ...s.version, live: s.version.id === v.id } : s.version } : s));
      } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Your site could not be put online.'); }
      finally { setSwitching(false); }
    } },
  ]);
  const unpublish = () => Alert.alert('Use your old design?', 'Your website goes back to the design you had before. Your AI designs are kept, so you can put one back online any time.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Use old design', onPress: async () => {
      setSwitching(true); setError('');
      try {
        const r = await api.post<{ versions: Version[] }>('/api/ai-site/unpublish', {});
        setList(r.versions);
        setState((s) => (s ? { ...s, liveVersionId: null, version: s.version ? { ...s.version, live: false } : s.version } : s));
      } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Could not switch back.'); }
      finally { setSwitching(false); }
    } },
  ]);
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // "Look me up online": Google, the old website and (with Claude) the web.
  const lookUp = async () => {
    if (!state || working) return;
    if (state.credits < state.prices.research) { Alert.alert('Not enough credits', `This needs ${state.prices.research} credits; you have ${state.credits}.`); return; }
    setError('');
    try {
      const r = await api.post<{ jobId: number; credits: number }>('/api/ai-site/research', { idempotencyKey: newKey() });
      setState((s) => (s ? { ...s, credits: r.credits } : s));
      void follow(r.jobId, 'research');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'I could not look you up. Your credits were not used.'); }
  };
  // Answers to "which is right?" questions. `typed` holds what the owner is typing per question; `reopened` shows an
  // answered question again so it can be changed.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [reopened, setReopened] = useState<Record<string, boolean>>({});
  const answer = async (q: FoundQuestion, a: Answer) => {
    if (!state?.research) return;
    const id = state.research.id;
    setState((s) => (s && s.research ? { ...s, research: { ...s.research, answers: { ...s.research.answers, [q.id]: a } } } : s));
    setReopened((r) => ({ ...r, [q.id]: false }));
    try {
      const r = await api.put<{ research: Research; facts: Facts; phoneSaved: string | null }>(`/api/ai-site/research/${id}/answers/${q.id}`, a);
      setState((s) => (s ? { ...s, research: r.research, facts: r.facts } : s));
      if (r.phoneSaved) Alert.alert('Phone number saved', `${q.options[a.choice ?? 0]?.label ?? r.phoneSaved} is now your business phone.`);
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'That could not be saved. Check the connection.'); }
  };
  const answerText = (q: FoundQuestion, a: Answer | undefined) =>
    !a ? null : a.skipped ? 'Skipped for now' : a.text ? a.text : a.choice != null ? q.options[a.choice]?.label ?? null : null;

  const sketch = async (more: boolean) => {
    if (!state || working) return;
    const price = more ? state.prices.moreIdeas : state.prices.ideas;
    if (state.credits < price) { Alert.alert('Not enough credits', `This needs ${price} credits; you have ${state.credits}.`); return; }
    setError('');
    try {
      const r = await api.post<{ jobId: number; credits: number }>('/api/ai-site/ideas', { more, idempotencyKey: newKey() });
      setState((s) => (s ? { ...s, credits: r.credits } : s));
      void follow(r.jobId, more ? 'more' : 'ideas');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'The ideas could not be made. Your credits were not used.'); }
  };

  const build = async () => {
    if (!state || working) return;
    if (state.credits < state.prices.build) { Alert.alert('Not enough credits', `This needs ${state.prices.build} credits; you have ${state.credits}.`); return; }
    setError('');
    try {
      const r = await api.post<{ jobId: number; credits: number }>('/api/ai-site/build', { idempotencyKey: newKey() });
      setState((s) => (s ? { ...s, credits: r.credits } : s));
      void follow(r.jobId, 'build');
    } catch (cause) { setError(cause instanceof ApiError ? cause.message : 'Your site could not be built. Your credits were not used.'); }
  };

  const saveFeedback = (index: number, change: Partial<Feedback>) => {
    if (!state?.round) return;
    const round = state.round;
    setState((s) => (s && s.round ? { ...s, round: { ...s.round, feedback: s.round.feedback.map((f, i) => (i === index ? { ...f, ...change } : f)) } } : s));
    void api.put(`/api/ai-site/ideas/${round.id}/${index}`, change).catch(() => setError('That could not be saved. Check the connection.'));
  };

  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const f = state?.facts;
  const priced = f ? f.services.filter((x) => x.price != null).length : 0;
  const openDays = f ? f.hours.filter((h) => h.open).length : 0;
  const reacted = state?.round ? state.round.feedback.some((x) => x.verdict) : false;
  const loved = state?.round ? state.round.feedback.some((x) => x.verdict === 'love') : false;

  return (
    <View style={[styles.root, { paddingTop: topInset }]} testID="website-designer">
      <AppBackground />
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navSide} accessibilityLabel="Back" testID="designer-back"><Feather name="arrow-left" size={26} color={look.heading} /></TouchableOpacity>
        <HelpTitle help="website-designer" style={styles.navTitle}>Website designer</HelpTitle>
        <View style={[styles.navSide, { alignItems: 'flex-end' }]} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        {!state ? (error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator style={{ marginTop: 60 }} color={look.violet} />) : (
          <>
            <View style={styles.creditRow}>
              <Feather name="zap" size={18} color={look.violet} />
              <Text style={styles.creditText} testID="designer-credits">{`${state.credits} AI credits`}</Text>
            </View>
            {!state.available ? <Text style={styles.muted}>The website designer isn't switched on yet.</Text> : null}

            {/* Stage 1: what Certxa knows, and what's missing. */}
            <View style={styles.card} testID="designer-facts">
              <Text style={styles.cardTitle}>{`Here's ${f!.business.name} as I know it`}</Text>
              <Text style={styles.fact}>{[f!.business.kind, f!.business.area].filter(Boolean).join(' · ')}{f!.business.privateAddress ? ' (city only, your address stays private)' : ''}</Text>
              <Text style={styles.fact}>{`${f!.services.length} services, ${priced} with prices`}</Text>
              <Text style={styles.fact}>{openDays ? `Open ${openDays} ${openDays === 1 ? 'day' : 'days'} a week` : 'No opening hours yet'}</Text>
              {f!.business.houseCalls ? <Text style={styles.fact}>{`House calls${f!.business.houseCalls.radiusMiles ? ` within ${f!.business.houseCalls.radiusMiles} miles` : ''}`}</Text> : null}
              {f!.team.length ? <Text style={styles.fact}>{`Team: ${f!.team.map((t) => t.name).join(', ')}`}</Text> : null}
              {f!.rating ? <Text style={styles.fact}>{`${f!.rating.average} stars from ${f!.rating.count} ${f!.rating.count === 1 ? 'review' : 'reviews'}`}</Text> : null}
              <Text style={styles.fact}>{f!.photos ? `${f!.photos} photos of your work` : 'No photos yet'}</Text>
              {f!.missing.length ? (
                <View style={styles.missing}>
                  <Text style={styles.missingTitle}>Worth adding first</Text>
                  {f!.missing.map((m) => <Text key={m} style={styles.missingLine}>{`• ${MISSING[m] ?? m}`}</Text>)}
                </View>
              ) : null}
            </View>

            {/* What I found online: cards with their sources, then "which is right?" questions. */}
            {!working && !state.research && state.available ? (
              <TouchableOpacity onPress={() => void lookUp()} style={styles.secondary} testID="designer-lookup">
                <Text style={styles.secondaryText}>{`Look me up online · ${state.prices.research} credits`}</Text>
              </TouchableOpacity>
            ) : null}
            {state.research ? (
              <>
                <SectionTitle style={{ marginTop: 10, marginBottom: 4 }}>What I found</SectionTitle>
                <Text style={styles.foundSummary} testID="designer-found-summary">{state.research.found.summary}</Text>
                {state.research.found.questions.map((q) => {
                  const a = state.research!.answers[q.id];
                  const said = answerText(q, a);
                  if (a && !reopened[q.id]) return (
                    <View key={q.id} style={styles.answered} testID={`designer-answered-${q.id}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.answeredQ}>{q.question}</Text>
                        <Text style={styles.answeredA}>{said}</Text>
                      </View>
                      <TouchableOpacity onPress={() => setReopened((r) => ({ ...r, [q.id]: true }))} testID={`designer-reanswer-${q.id}`}><Text style={styles.link}>Change</Text></TouchableOpacity>
                    </View>
                  );
                  return (
                    <View key={q.id} style={styles.question} testID={`designer-question-${q.id}`}>
                      <Text style={styles.questionLabel}>I need you for a moment</Text>
                      <Text style={styles.questionText}>{q.question}</Text>
                      {q.options.map((o, i) => (
                        <TouchableOpacity key={i} onPress={() => void answer(q, { choice: i })} style={[styles.option, a?.choice === i && styles.optionOn]} testID={`designer-option-${q.id}-${i}`}>
                          <Text style={styles.optionLabel}>{o.label}</Text>
                          <Text style={styles.optionFrom}>{o.from}</Text>
                        </TouchableOpacity>
                      ))}
                      {q.hint ? <Text style={styles.questionHint}>{q.hint}</Text> : null}
                      {q.topic === 'other' ? (
                        <View style={[styles.composer, { marginTop: 4 }]}>
                          <TextInput value={typed[q.id] ?? ''} onChangeText={(v) => setTyped((t) => ({ ...t, [q.id]: v }))} placeholder="Or type the right answer"
                            placeholderTextColor={look.subtle} maxLength={200} style={styles.composerInput} testID={`designer-typed-${q.id}`} />
                          <TouchableOpacity disabled={!(typed[q.id] ?? '').trim()} onPress={() => void answer(q, { text: typed[q.id].trim() })} accessibilityLabel="Send answer"
                            style={[styles.send, !(typed[q.id] ?? '').trim() && { opacity: 0.4 }]} testID={`designer-typed-send-${q.id}`}>
                            <Feather name="arrow-up" size={22} color="#FFFFFF" />
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <TouchableOpacity onPress={() => void answer(q, { skipped: true })} style={{ paddingVertical: 8 }} testID={`designer-skip-${q.id}`}>
                        <Text style={styles.skip}>Skip for now</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {state.research.found.cards.map((c, i) => (
                  <View key={i} style={styles.card} testID={`designer-found-${i}`}>
                    <Text style={styles.foundKind}>{CARD_LABELS[c.kind] ?? CARD_LABELS.other}</Text>
                    <Text style={styles.foundTitle}>{c.title}</Text>
                    {c.text ? <Text style={styles.fact}>{c.text}</Text> : null}
                    {c.chips.length ? <Text style={styles.foundChips}>{c.chips.join(' · ')}</Text> : null}
                    <Text style={styles.foundSource}>{c.sources.join(', ')}</Text>
                  </View>
                ))}
                {!state.research.found.webSearched ? <Text style={styles.muted}>Yelp, Nextdoor and other sites are added once the full designer is switched on.</Text> : null}
                {!working ? (
                  <TouchableOpacity onPress={() => void lookUp()} style={styles.textButton} testID="designer-lookup-again">
                    <Text style={styles.textButtonLabel}>{`Look me up again · ${state.prices.research} credits`}</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {/* Stage 2: six ideas. */}
            {working ? (
              <View style={[styles.card, styles.working]} testID="designer-working">
                <ActivityIndicator color={look.violet} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{working === 'research' ? 'Looking you up online' : working === 'build' ? 'Building your site' : working === 'change' ? 'Making your change' : 'Sketching 6 ideas at once'}</Text>
                  <Text style={styles.muted}>{working === 'ideas' || working === 'more' ? 'This takes about a minute. You can leave this screen; it keeps going.' : 'This takes a minute or so. You can leave this screen; it keeps going.'}</Text>
                </View>
              </View>
            ) : null}

            {/* Stage 3: the built site, opened as a private preview on the business's own address. */}
            {state.version && !working ? (
              <View style={styles.card} testID="designer-version">
                <Text style={styles.cardTitle}>{state.version.live ? 'Your site is online' : 'Your site is ready to preview'}</Text>
                {state.version.summary ? <Text style={styles.fact}>{state.version.summary}</Text> : null}
                <Text style={styles.muted}>{state.version.live
                  ? `Clients see this design at ${state.siteUrl?.replace('https://', '') ?? 'your website'}. Prices, hours, reviews and photos always come from your Certxa details.`
                  : 'Prices, hours, reviews and photos always come from your Certxa details. Only you can see the preview until you put it online.'}</Text>
                {state.version.previewUrl ? (
                  <TouchableOpacity onPress={() => void WebBrowser.openBrowserAsync(state.version!.previewUrl!)} style={styles.primary} testID="designer-preview">
                    <Text style={styles.primaryText}>{state.version.live ? 'Open my website' : 'Preview my site'}</Text>
                  </TouchableOpacity>
                ) : <Text style={styles.muted}>Set up your website link first (Settings › Website).</Text>}
                {state.version.previewUrl && !state.version.live ? (
                  <TouchableOpacity disabled={switching} onPress={() => publish(state.version!)} style={[styles.secondary, switching && { opacity: 0.5 }]} testID="designer-publish">
                    <Text style={styles.secondaryText}>Put it online</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {/* Stage 5: change it by describing what you want. */}
            {state.version ? (
              <>
                <SectionTitle style={{ marginTop: 10, marginBottom: 8 }}>Describe a change</SectionTitle>
                {state.messages.length ? (
                  <View style={styles.chat} testID="designer-chat">
                    {state.messages.map((m) => (
                      <View key={m.id} style={[styles.bubble, m.role === 'owner' ? styles.bubbleOwner : styles.bubbleDesigner]}>
                        <Text style={[styles.bubbleText, m.role === 'owner' && { color: '#FFFFFF' }]}>{m.text}</Text>
                      </View>
                    ))}
                  </View>
                ) : <Text style={styles.muted}>For example: "make it pink", "add a short FAQ about parking", "say I speak Spanish".</Text>}
                <View style={styles.composer}>
                  <TextInput value={change} onChangeText={setChange} placeholder="Describe a change…" placeholderTextColor={look.subtle} multiline maxLength={500}
                    editable={!working} style={styles.composerInput} testID="designer-change-input" />
                  <TouchableOpacity disabled={!!working || change.trim().length < 2} onPress={() => void sendChange()} accessibilityLabel="Send change"
                    style={[styles.send, (working || change.trim().length < 2) && { opacity: 0.4 }]} testID="designer-change-send">
                    <Feather name="arrow-up" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.muted, { marginTop: 6 }]}>2 credits a change, none if nothing needed changing. Each change is a new version you can preview first.</Text>
              </>
            ) : null}

            {/* Versions: every build, which is online, preview or put any of them online; back to the old design. */}
            {!working && list.length > 0 && (list.length > 1 || state.liveVersionId != null) ? (
              <>
                <SectionTitle style={{ marginTop: 10, marginBottom: 8 }}>Versions</SectionTitle>
                <View style={styles.card} testID="designer-versions">
                  {list.map((v, i) => (
                    <View key={v.id} style={[styles.versionRow, i > 0 && styles.versionDivider]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.versionTitle}>{`${v.madeBy === 'build' ? 'Built' : 'Changed'} ${when(v.createdAt)}`}</Text>
                        {v.live ? <Text style={styles.versionLive}>Online now</Text> : null}
                      </View>
                      {v.previewUrl ? <TouchableOpacity onPress={() => void WebBrowser.openBrowserAsync(v.previewUrl!)} testID={`designer-version-preview-${v.id}`}><Text style={styles.link}>Preview</Text></TouchableOpacity> : null}
                      {!v.live && v.previewUrl ? <TouchableOpacity disabled={switching} onPress={() => publish(v)} testID={`designer-version-publish-${v.id}`}><Text style={styles.link}>Put online</Text></TouchableOpacity> : null}
                    </View>
                  ))}
                </View>
                {state.liveVersionId != null ? (
                  <TouchableOpacity disabled={switching} onPress={unpublish} style={styles.textButton} testID="designer-unpublish">
                    <Text style={styles.textButtonLabel}>Use my old design</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : null}

            {working ? null : !state.round ? (
              <TouchableOpacity disabled={!state.available} onPress={() => void sketch(false)} style={[styles.primary, !state.available && { opacity: 0.5 }]} testID="designer-sketch">
                <Text style={styles.primaryText}>{`Show me 6 ideas · ${state.prices.ideas} credits`}</Text>
              </TouchableOpacity>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}

            {state.round ? (
              <>
                <SectionTitle style={{ marginTop: 24, marginBottom: 4 }}>Ideas for your site</SectionTitle>
                <Text style={styles.muted}>These are just inspiration. Tell me what you love and what you don't, and I'll design your site from that.</Text>
                {state.round.ideas.map((idea, i) => {
                  const fb = state.round!.feedback[i] ?? { verdict: null, note: null, chips: [] };
                  return (
                    <View key={`${state.round!.id}-${i}`} style={styles.ideaWrap} testID={`designer-idea-${i}`}>
                      <Text style={styles.ideaAngle}>{idea.angle}</Text>
                      <Text style={styles.ideaWhy}>{idea.why}</Text>
                      <IdeaPreview idea={idea} name={f!.business.name} />
                      <View style={styles.verdicts}>
                        <TouchableOpacity onPress={() => saveFeedback(i, { verdict: fb.verdict === 'not' ? null : 'not' })} testID={`designer-not-${i}`}
                          style={[styles.verdict, fb.verdict === 'not' && { backgroundColor: look.heading, borderColor: look.heading }]}>
                          <Text style={[styles.verdictText, fb.verdict === 'not' && { color: '#FFFFFF' }]}>Not this</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => saveFeedback(i, { verdict: fb.verdict === 'love' ? null : 'love' })} testID={`designer-love-${i}`}
                          style={[styles.verdict, fb.verdict === 'love' && { backgroundColor: look.violet, borderColor: look.violet }]}>
                          <Text style={[styles.verdictText, fb.verdict === 'love' && { color: '#FFFFFF' }]}>Love it</Text>
                        </TouchableOpacity>
                      </View>
                      {fb.verdict ? (
                        <View style={styles.feedback}>
                          <TextInput defaultValue={fb.note ?? ''} onChangeText={(v) => { notes.current[i] = v; }}
                            onEndEditing={() => { if (notes.current[i] !== undefined) saveFeedback(i, { note: notes.current[i].trim() || null }); }}
                            placeholder={fb.verdict === 'love' ? 'What do you love?' : "What's not working?"} placeholderTextColor={look.subtle}
                            style={styles.note} testID={`designer-note-${i}`} />
                          <View style={styles.checks}>
                            {CHIPS.map((c) => {
                              const on = fb.chips.includes(c.key);
                              return (
                                <TouchableOpacity key={c.key} onPress={() => saveFeedback(i, { chips: on ? fb.chips.filter((x) => x !== c.key) : [...fb.chips, c.key] })}
                                  accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.check} testID={`designer-chip-${i}-${c.key}`}>
                                  <Feather name={on ? 'check-square' : 'square'} size={22} color={on ? look.violet : look.subtle} />
                                  <Text style={styles.checkText}>{c.label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {!working ? (
                  <TouchableOpacity disabled={!loved} onPress={() => void build()} style={[styles.primary, { marginTop: 18 }, !loved && { opacity: 0.5 }]} testID="designer-build">
                    <Text style={styles.primaryText}>{`${state.version ? 'Build it again' : 'Build my site'} · ${state.prices.build} credits`}</Text>
                  </TouchableOpacity>
                ) : null}
                {!working && !loved ? <Text style={[styles.muted, { textAlign: 'center' }]}>Mark at least one idea Love it to build your site.</Text> : null}
                {!working ? (
                  <TouchableOpacity disabled={!reacted} onPress={() => void sketch(true)} style={[styles.secondary, !reacted && { opacity: 0.5 }]} testID="designer-more">
                    <Text style={styles.secondaryText}>{`More ideas · ${state.prices.moreIdeas} credits`}</Text>
                  </TouchableOpacity>
                ) : null}
                {!reacted ? <Text style={[styles.muted, { textAlign: 'center' }]}>Mark at least one idea to get more.</Text> : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: look.pageTop },
  nav: { height: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { flex: 1, textAlign: 'center', fontSize: 20, fontFamily: 'Inter_600SemiBold', color: look.heading },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 10 },
  creditText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.violet },
  card: { backgroundColor: look.card, borderRadius: 18, borderWidth: 1, borderColor: look.cardBorder, padding: 16, gap: 4, marginBottom: 14, ...cardShadow },
  cardTitle: { fontSize: 19, fontFamily: 'Inter_700Bold', color: look.heading, marginBottom: 4 },
  fact: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular', color: look.heading },
  missing: { marginTop: 10, backgroundColor: look.tile, borderRadius: 12, padding: 12, gap: 4 },
  missingTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: look.violetDeep },
  missingLine: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', color: look.heading },
  working: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  muted: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', color: look.subtle, marginBottom: 8 },
  error: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', color: '#D92D20', marginVertical: 8 },
  primary: { height: 54, borderRadius: 16, backgroundColor: look.violet, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: '#FFFFFF' },
  secondary: { height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: look.violet, backgroundColor: look.card, alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 8 },
  secondaryText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: look.violet },
  ideaWrap: { marginTop: 18 },
  ideaAngle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.heading },
  ideaWhy: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 2, marginBottom: 10 },
  phone: { borderRadius: 22, padding: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', ...cardShadow },
  phoneTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  phoneMenu: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, opacity: 0.7 },
  block: { borderRadius: 14, padding: 12, marginTop: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  cta: { height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  verdicts: { flexDirection: 'row', gap: 10, marginTop: 12 },
  verdict: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: look.cardBorder, backgroundColor: look.card, alignItems: 'center', justifyContent: 'center' },
  verdictText: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.heading },
  feedback: { marginTop: 10, gap: 8 },
  note: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: look.cardBorder, backgroundColor: look.card, paddingHorizontal: 12, fontSize: 16, fontFamily: 'Inter_400Regular', color: look.heading },
  chat: { gap: 8, marginBottom: 10 },
  bubble: { maxWidth: '88%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwner: { alignSelf: 'flex-end', backgroundColor: look.violet },
  bubbleDesigner: { alignSelf: 'flex-start', backgroundColor: look.card, borderWidth: 1, borderColor: look.cardBorder },
  bubbleText: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_400Regular', color: look.heading },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  composerInput: { flex: 1, minHeight: 50, maxHeight: 140, borderRadius: 16, borderWidth: 1, borderColor: look.cardBorder, backgroundColor: look.card, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 13, fontSize: 16, fontFamily: 'Inter_400Regular', color: look.heading },
  send: { width: 50, height: 50, borderRadius: 25, backgroundColor: look.violet, alignItems: 'center', justifyContent: 'center' },
  versionRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12 },
  versionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: look.cardBorder },
  versionTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.heading },
  versionLive: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: look.violet, marginTop: 2 },
  link: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.violet },
  textButton: { alignItems: 'center', paddingVertical: 12, marginBottom: 4 },
  textButtonLabel: { fontSize: 16, fontFamily: 'Inter_600SemiBold', color: look.heading },
  checks: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  foundSummary: { fontSize: 17, lineHeight: 24, fontFamily: 'Inter_500Medium', color: look.heading, marginBottom: 12 },
  foundKind: { fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold', color: look.subtle, marginBottom: 2 },
  foundTitle: { fontSize: 19, lineHeight: 25, fontFamily: 'Inter_700Bold', color: look.heading, marginBottom: 2 },
  foundChips: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_600SemiBold', color: look.heading, marginTop: 4 },
  foundSource: { fontSize: 14, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 8 },
  question: { backgroundColor: look.tile, borderRadius: 18, padding: 16, gap: 8, marginBottom: 14 },
  questionLabel: { fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Inter_600SemiBold', color: look.violetDeep },
  questionText: { fontSize: 18, lineHeight: 24, fontFamily: 'Inter_700Bold', color: look.heading, marginBottom: 2 },
  questionHint: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', color: look.subtle },
  option: { minHeight: 54, borderRadius: 14, borderWidth: 1.5, borderColor: look.cardBorder, backgroundColor: look.card, paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 10 },
  optionOn: { borderColor: look.violet },
  optionLabel: { flex: 1, fontSize: 16, lineHeight: 22, fontFamily: 'Inter_600SemiBold', color: look.heading },
  optionFrom: { maxWidth: '45%', fontSize: 13, textAlign: 'right', fontFamily: 'Inter_400Regular', color: look.subtle },
  skip: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: look.heading, textDecorationLine: 'underline' },
  answered: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: look.card, borderRadius: 14, borderWidth: 1, borderColor: look.cardBorder, padding: 14, marginBottom: 10 },
  answeredQ: { fontSize: 14, lineHeight: 20, fontFamily: 'Inter_400Regular', color: look.subtle },
  answeredA: { fontSize: 16, lineHeight: 22, fontFamily: 'Inter_600SemiBold', color: look.heading, marginTop: 2 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  checkText: { fontSize: 16, fontFamily: 'Inter_400Regular', color: look.heading },
});
