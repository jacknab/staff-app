import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cardShadow, look } from './tokens';

export type Promo = {
  key: string;
  title: string;
  pill: string;
  points: [string, string];
  art: ComponentProps<typeof MaterialCommunityIcons>['name'];
  onPress: () => void;
  busy?: boolean;
  label: string;
};

const SLIDE_MS = 15_000;

/**
 * The promo cards stacked in one place (owner, 2026-11-09): in a random order each time the screen opens, sliding to
 * the next every 15 seconds, and swipeable. One card just shows; none shows nothing.
 */
export function PromoCarousel({ promos }: { promos: Promo[] }) {
  const keys = promos.map((p) => p.key).join('|');
  const order = useMemo(() => [...promos].sort(() => Math.random() - 0.5).map((p) => p.key), [keys]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = order.map((k) => promos.find((p) => p.key === k)).filter((p): p is Promo => !!p);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    if (timer.current) clearInterval(timer.current);
    if (cards.length < 2 || !width) return;
    timer.current = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % cards.length;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, SLIDE_MS);
  };
  useEffect(() => { setIndex(0); scroller.current?.scrollTo({ x: 0, animated: false }); }, [keys]);
  useEffect(() => { start(); return () => { if (timer.current) clearInterval(timer.current); }; }, [cards.length, width]); // eslint-disable-line react-hooks/exhaustive-deps

  if (cards.length === 0) return null;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} testID="promo-carousel">
      <ScrollView ref={scroller} horizontal pagingEnabled showsHorizontalScrollIndicator={false} scrollEnabled={cards.length > 1}
        onScrollBeginDrag={() => { if (timer.current) clearInterval(timer.current); }}
        onMomentumScrollEnd={(e) => { if (width) setIndex(Math.round(e.nativeEvent.contentOffset.x / width)); start(); }}>
        {cards.map((card) => <View key={card.key} style={{ width: width || undefined, paddingVertical: 6 }}><PromoCard promo={card} /></View>)}
      </ScrollView>
      {cards.length > 1 ? (
        <View style={styles.dots}>
          {cards.map((card, i) => <View key={card.key} style={[styles.dot, i === index && styles.dotOn]} />)}
        </View>
      ) : null}
    </View>
  );
}

function PromoCard({ promo }: { promo: Promo }) {
  return (
    <TouchableOpacity testID={`promo-${promo.key}`} onPress={promo.onPress} disabled={promo.busy} activeOpacity={0.85}
      accessibilityRole="button" accessibilityLabel={promo.label} style={styles.shadow}>
      <LinearGradient colors={['#E9E1FE', '#EFE7FF', '#FBE8F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.glow} />
        <MaterialCommunityIcons name={promo.art} size={58} color={look.violet} style={styles.art} />
        <View style={styles.left}>
          <Text style={styles.title} numberOfLines={2}>{promo.title}</Text>
          <LinearGradient colors={['#7C3AED', '#6D28D9']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.pill}>
            <Text style={styles.pillText}>{promo.pill}</Text>
          </LinearGradient>
        </View>
        <View style={styles.divider} />
        <View style={styles.points}>
          {promo.points.map((point) => (
            <View key={point} style={styles.point}>
              <MaterialCommunityIcons name="check-circle" size={21} color={look.violet} />
              <Text style={styles.pointText} numberOfLines={2}>{point}</Text>
            </View>
          ))}
        </View>
        {promo.busy ? <View style={styles.busy}><ActivityIndicator color={look.violet} /></View> : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  shadow: { borderRadius: 20, ...cardShadow },
  card: { borderRadius: 20, minHeight: 124, paddingVertical: 16, paddingLeft: 16, paddingRight: 74, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: '#E4DAFD' },
  glow: { position: 'absolute', right: -18, top: 16, width: 92, height: 92, borderRadius: 46, backgroundColor: '#F6D3EE', opacity: 0.55 },
  art: { position: 'absolute', right: 12, top: 32, transform: [{ rotate: '-10deg' }] },
  left: { width: 112, gap: 8 },
  title: { fontSize: 20, lineHeight: 24, fontFamily: 'Inter_700Bold', color: look.heading },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 4 },
  pillText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: '#C9B8F5', marginHorizontal: 12 },
  points: { flex: 1, gap: 10 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pointText: { flex: 1, fontSize: 15, lineHeight: 19, fontFamily: 'Inter_500Medium', color: look.heading },
  busy: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D5C9F7' },
  dotOn: { width: 18, backgroundColor: look.violet },
});
