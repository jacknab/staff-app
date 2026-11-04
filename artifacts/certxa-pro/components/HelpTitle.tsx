/**
 * Page help (owner, 2026-11-04): hold a screen's title and that screen's help opens, full screen (lib/help.ts). The title
 * is the trigger because press-and-hold already means something elsewhere (dragging a booking on the calendar).
 *   <HelpTitle help="calendar" style={…}>Calendar</HelpTitle>   in place of the title's <Text>
 *   <HelpHost />                                                  once, in app/_layout.tsx
 */
import { useSyncExternalStore, type ReactNode } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { HELP } from '@/lib/help';

let openId: string | null = null;
const listeners = new Set<() => void>();
const setOpen = (id: string | null) => { openId = id; listeners.forEach((l) => l()); };

/** Open a page's help; 'settings.hours' falls back to 'settings' when it has no page of its own. */
export function openHelp(id: string) {
  const page = HELP[id] ? id : HELP[id.split('.')[0]] ? id.split('.')[0] : null;
  if (!page) return;
  setOpen(page);
}

export function HelpTitle({ help, style, numberOfLines, children }: { help: string; style?: StyleProp<TextStyle>; numberOfLines?: number; children: ReactNode }) {
  return (
    <Text style={style} numberOfLines={numberOfLines} onLongPress={() => openHelp(help)}
      accessibilityHint="Hold for help with this page" suppressHighlighting>
      {children}
    </Text>
  );
}

export function HelpHost() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const id = useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => openId);
  const page = id ? HELP[id] : null;
  if (!page) return null;
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setOpen(null)}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: Platform.OS === 'web' ? 24 : insets.top }]} testID="help-screen">
        <View style={styles.nav}>
          <View style={styles.navSide} />
          <Text style={[styles.navTitle, { color: colors.mutedForeground }]}>Help</Text>
          <TouchableOpacity onPress={() => setOpen(null)} style={[styles.navSide, { alignItems: 'flex-end' }]} accessibilityLabel="Close help" testID="help-close">
            <Feather name="x" size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>{page.title}</Text>
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>{page.intro}</Text>
          {page.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text style={[styles.heading, { color: colors.foreground }]}>{section.heading}</Text>
              {section.points.map((point) => (
                <View key={point} style={styles.point}>
                  <View style={[styles.bullet, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.pointText, { color: colors.foreground }]}>{point}</Text>
                </View>
              ))}
            </View>
          ))}
          {page.examples?.length ? (
            <View style={styles.section}>
              <Text style={[styles.heading, { color: colors.foreground }]}>Examples</Text>
              <Text style={[styles.intro, { color: colors.mutedForeground, marginTop: 0, marginBottom: 6 }]}>Things you can ask, with the kind of answer you get.</Text>
              {page.examples.map((e) => (
                <View key={e.q} style={styles.example}>
                  <View style={[styles.bubble, styles.mine, { backgroundColor: colors.primary }]}><Text style={[styles.bubbleText, { color: colors.primaryForeground }]}>{e.q}</Text></View>
                  <View style={[styles.bubble, styles.theirs, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.bubbleText, { color: colors.foreground }]}>{e.a}</Text></View>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={[styles.tip, { color: colors.mutedForeground }]}>Hold the title at the top of any page for help with that page.</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  nav: { height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { width: 44, height: 44, justifyContent: 'center' },
  navTitle: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  content: { paddingHorizontal: 22, paddingTop: 4 },
  title: { fontSize: 28, fontFamily: 'Inter_600SemiBold', letterSpacing: -0.4 },
  intro: { fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular', marginTop: 8 },
  section: { marginTop: 26, gap: 10 },
  heading: { fontSize: 17, fontFamily: 'Inter_600SemiBold' },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  pointText: { flex: 1, fontSize: 16, lineHeight: 23, fontFamily: 'Inter_400Regular' },
  example: { gap: 6, marginTop: 6 },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 6 },
  bubbleText: { fontSize: 15, lineHeight: 21, fontFamily: 'Inter_400Regular' },
  tip: { fontSize: 13, textAlign: 'center', marginTop: 34, fontFamily: 'Inter_400Regular' },
});
