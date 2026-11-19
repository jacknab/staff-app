/**
 * A screen's intro (owner's tablet mock-ups, 2026-11-20; lib/tabletIntro.ts): its title and a line, icon rows (icon
 * tile, heading, a line or two), then Popular examples chips. Beside the screen on a tablet (components/TabletFrame.tsx);
 * under a phone's empty page (`compact`, no title: the screen's own title is above it).
 */
import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { look } from '@/components/look/tokens';
import type { TabletIntro } from '@/lib/tabletIntro';
import { IntroIcon } from '@/components/IntroIcon';

export function PageIntro({ title, intro, compact = false }: { title?: string; intro: TabletIntro; compact?: boolean }) {
  const s = compact ? small : styles;
  return (
    <View>
      {title ? <Text style={s.title}>{title}</Text> : null}
      {title ? <Text style={s.text}>{intro.intro}</Text> : null}
      <View style={s.cards}>
        {intro.cards.map((c) => (
          <View key={c.title} style={s.card}>
            <View style={s.icon}><IntroIcon icon={c.icon} size={compact ? 24 : 30} color={look.violet} /></View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>{c.title}</Text>
              <Text style={s.cardText}>{c.text}</Text>
            </View>
          </View>
        ))}
      </View>
      {intro.examples?.length ? (
        <>
          <View style={s.rule} />
          <Text style={s.examplesTitle}>Popular examples</Text>
          <View style={s.chips}>
            {intro.examples.map((e) => (
              <View key={e} style={s.chip}>
                <Feather name="check" size={compact ? 18 : 20} color={look.violetDeep} />
                <Text style={s.chipText} numberOfLines={1} adjustsFontSizeToFit>{e}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 34, letterSpacing: -0.6, fontFamily: 'Inter_700Bold', color: look.heading },
  text: { fontSize: 19, lineHeight: 28, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 10 },
  cards: { gap: 26, marginTop: 34 },
  card: { flexDirection: 'row', gap: 26, alignItems: 'center' },
  icon: { width: 84, height: 84, borderRadius: 20, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 23, fontFamily: 'Inter_700Bold', color: look.heading },
  cardText: { fontSize: 18, lineHeight: 26, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 4 },
  rule: { height: 3, borderRadius: 2, backgroundColor: look.tile, marginTop: 40 },
  examplesTitle: { fontSize: 23, fontFamily: 'Inter_700Bold', color: look.heading, marginTop: 36 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 20 },
  chip: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 28, paddingHorizontal: 20, backgroundColor: look.tile },
  chipText: { flexShrink: 1, fontSize: 18, fontFamily: 'Inter_500Medium', color: look.heading },
});

const small = StyleSheet.create({
  ...styles,
  cards: { gap: 18, marginTop: 8 },
  card: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  icon: { width: 60, height: 60, borderRadius: 16, backgroundColor: look.tile, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.heading },
  cardText: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular', color: look.subtle, marginTop: 2 },
  rule: { height: 2, borderRadius: 1, backgroundColor: look.tile, marginTop: 26 },
  examplesTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.heading, marginTop: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  chip: { flexGrow: 1, flexBasis: '45%', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 23, paddingHorizontal: 14, backgroundColor: look.tile },
  chipText: { flexShrink: 1, fontSize: 15, fontFamily: 'Inter_500Medium', color: look.heading },
});
