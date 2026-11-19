/**
 * The tablet POS's key grid (owner, 2026-11-19): /nail's grid (pages/nail/CatalogPanel.tsx) in the app's light look. A
 * fixed 2 × 6 (or 3 × 6) of keys that fills its panel and never scrolls, each with a coloured band along its bottom
 * (the row's colour, or the manager's own). Which key sits where comes from lib/posGrid.ts.
 */
import { useState, type ComponentProps } from 'react';
import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { look } from '@/components/look/tokens';
import {
  POS_FN_LABELS, POS_GRID_MAIN, POS_GRID_ROWS, ROW_BANDS, placeKeys, posGridColumns,
  type CatalogAddon, type CatalogGroup, type CatalogService, type GridKey, type GridPlace, type PosAfter, type PosFn, type PosGridConfig,
} from '@/lib/posGrid';

type Icon = ComponentProps<typeof Feather>['name'];
const money = (v: number) => `$${Number(v).toFixed(2)}`;
const minutes = (n: number) => (n >= 60 ? `${Math.floor(n / 60)} hr${n % 60 ? ` ${n % 60} min` : ''}` : `${n} min`);

/** Category → icon, by what the name says (as /nail does; salons name their own categories). */
function iconFor(name: string): Icon {
  const n = name.toLowerCase();
  if (/kid|child/.test(n)) return 'smile';
  if (/combo|package|deal/.test(n)) return 'gift';
  if (/add/.test(n)) return 'plus-circle';
  if (/pedi|foot/.test(n)) return 'zap';
  if (/hair|cut|barber|beard|shave/.test(n)) return 'scissors';
  if (/wax|brow|lash|face|facial|skin/.test(n)) return 'eye';
  if (/mani|gel|nail|acrylic|dip|art/.test(n)) return 'star';
  return 'package';
}
const FN_ICONS: Record<PosFn, Icon> = { discount: 'percent', giftcard: 'gift', nosale: 'log-out', reprint: 'printer' };

/** One key, drawn the same on the POS and in the grid editor. */
export function PosKeyButton({ k, index, columns, onPress, selected, testID }: {
  k: GridKey; index: number; columns: number; onPress?: () => void; selected?: boolean; testID?: string;
}) {
  const own = 'color' in k ? k.color : undefined;
  const band = own ?? ROW_BANDS[Math.floor(index / columns) % ROW_BANDS.length];
  if (k.kind === 'empty') {
    return onPress
      ? <TouchableOpacity testID={testID} onPress={onPress} accessibilityLabel={`Empty position ${index + 1}`} style={[styles.key, styles.empty, selected && styles.selected]} />
      : <View style={[styles.key, styles.empty]} />;
  }
  const nav = k.kind === 'back' || k.kind === 'more';
  let face: React.ReactNode;
  if (k.kind === 'back') face = <><Feather name="arrow-left" size={24} color={look.subtle} /><Text style={styles.navText}>{k.label || 'Back'}</Text></>;
  else if (k.kind === 'more') face = <><Feather name="more-horizontal" size={24} color={look.subtle} /><Text style={styles.navText}>More</Text></>;
  else if (k.kind === 'grid') face = <><Feather name="grid" size={24} color={look.violetDeep} /><Text style={styles.name} numberOfLines={2}>{k.label || k.grid.name}</Text></>;
  else if (k.kind === 'category') face = <><Feather name={iconFor(k.group.name)} size={24} color={look.violetDeep} /><Text style={styles.name} numberOfLines={2}>{k.label || k.group.name}</Text></>;
  else if (k.kind === 'fn') face = <><Feather name={FN_ICONS[k.fn]} size={24} color={look.violetDeep} /><Text style={styles.name} numberOfLines={2}>{k.label || POS_FN_LABELS[k.fn]}</Text></>;
  else if (k.kind === 'addon') face = <><Text style={styles.name} numberOfLines={2}>{k.label || k.addon.name}</Text><View style={styles.priceRow}><Text style={styles.price}>+{money(k.addon.price)}</Text><Text style={styles.small}>Add-on</Text></View></>;
  else face = <><Text style={styles.name} numberOfLines={2}>{k.label || k.service.name}</Text><View style={styles.priceRow}><Text style={styles.price}>{money(k.service.price)}</Text>{k.service.duration ? <Text style={styles.small}>{minutes(k.service.duration)}</Text> : null}</View></>;
  return (
    <TouchableOpacity testID={testID} onPress={onPress} disabled={!onPress} activeOpacity={0.7}
      style={[styles.key, nav && styles.nav, { borderBottomColor: band }, selected && styles.selected]}>
      {face}
    </TouchableOpacity>
  );
}

/** Keys in rows, filling the panel. */
export function KeyRows({ keys, columns, render }: { keys: GridKey[]; columns: number; render: (k: GridKey, i: number) => React.ReactNode }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: POS_GRID_ROWS }, (_, r) => (
        <View key={r} style={styles.row}>
          {keys.slice(r * columns, r * columns + columns).map((k, c) => <View key={c} style={styles.cell}>{render(k, r * columns + c)}</View>)}
        </View>
      ))}
    </View>
  );
}

export function PosGrid({ layout, groups, addons, onService, onAddon, onFn }: {
  layout: PosGridConfig | null; groups: CatalogGroup[]; addons: CatalogAddon[];
  onService: (svc: CatalogService) => void; onAddon: (addon: CatalogAddon) => void; onFn: (fn: PosFn) => void;
}) {
  // The way here: the main grid first, then whatever was opened from it. Back takes one step off.
  const [trail, setTrail] = useState<GridPlace[]>([{ at: 'main' }]);
  const [page, setPage] = useState(0);
  const place = trail[trail.length - 1];
  const columns = posGridColumns(layout);
  const keys = placeKeys(layout, groups, place, page, addons);
  const open = (next: GridPlace) => { setTrail((t) => [...t, next]); setPage(0); };
  const back = () => { setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t)); setPage(0); };
  // After a service or add-on is picked: what the grid it was on says — stay, back to main, or open a grid.
  const afterPick = () => {
    const after: PosAfter | undefined = place.at === 'category' ? layout?.afterService
      : layout?.grids.find((g) => g.id === (place.at === 'grid' ? place.id : POS_GRID_MAIN))?.after;
    if (!after || after.to === 'stay') return;
    if (after.to === 'main') { setTrail([{ at: 'main' }]); setPage(0); return; }
    if (layout?.grids.some((g) => g.id === after.gridId)) { setTrail([{ at: 'main' }, { at: 'grid', id: after.gridId }]); setPage(0); }
  };
  return (
    <KeyRows keys={keys} columns={columns} render={(k, i) => (
      <PosKeyButton k={k} index={i} columns={columns}
        testID={k.kind === 'back' ? 'pos-grid-back' : k.kind === 'more' ? 'pos-grid-more' : k.kind === 'category' ? `pos-cat-${k.group.key}`
          : k.kind === 'service' ? `pos-service-${k.service.id}` : k.kind === 'grid' ? `pos-grid-open-${k.grid.id}` : k.kind === 'addon' ? `pos-addon-${k.addon.id}`
          : k.kind === 'fn' ? `pos-fn-key-${k.fn}` : undefined}
        onPress={k.kind === 'empty' ? undefined
          : k.kind === 'back' ? back
          : k.kind === 'more' ? () => setPage((n) => n + 1)
          : k.kind === 'category' ? () => open({ at: 'category', key: k.group.key })
          : k.kind === 'grid' ? () => open({ at: 'grid', id: k.grid.id })
          : k.kind === 'addon' ? () => { onAddon(k.addon); afterPick(); }
          : k.kind === 'fn' ? () => onFn(k.fn)
          : () => { onService(k.service); afterPick(); }} />
    )} />
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, minHeight: 0, gap: 8 },
  row: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 8 },
  cell: { flex: 1, minWidth: 0 },
  key: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: look.cardBorder, borderBottomWidth: 6, backgroundColor: look.pageBottom,
    alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  nav: { backgroundColor: look.tile },
  empty: { backgroundColor: '#FBFAFE', borderBottomWidth: 1, borderStyle: 'dashed' },
  selected: { borderColor: look.violet, borderWidth: 2, borderBottomWidth: 6 },
  name: { fontSize: 17, lineHeight: 21, fontFamily: 'Inter_700Bold', color: look.heading, textAlign: 'center' },
  navText: { fontSize: 14, fontFamily: 'Inter_700Bold', color: look.subtle, letterSpacing: 1, textTransform: 'uppercase' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 18, fontFamily: 'Inter_700Bold', color: look.violetDeep },
  small: { fontSize: 13, fontFamily: 'Inter_500Medium', color: look.subtle },
});
