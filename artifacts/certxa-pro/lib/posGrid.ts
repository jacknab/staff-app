/**
 * The tablet POS's key grid (owner, 2026-11-19): the same layout and logic as the /nail POS grid. This is the app's copy
 * of the website's shared/posGrid.ts (what a layout is) and of pages/nail/CatalogPanel.tsx's key placement (what each
 * position shows); the server checks a layout with the same rules (GET · PUT /api/pro/pos-grid).
 *
 *  - A fixed grid of 2 across × 6 rows (or 3 × 6), never scrolling.
 *  - Without a saved layout it fills itself: a key per catalog category, then Packages and Add-ons; a category opens its
 *    own grid of services whose last key is Back; what doesn't fit goes to pages behind a More key.
 *  - A manager can arrange the main grid and up to 19 grids of their own: categories, single services, add-ons, add-on
 *    groups (a grid of the group's add-ons, like a category; the app's own), other grids, functions and Back, each with
 *    an optional name and band colour, and where to go after a pick.
 */

export const POS_GRID_COLUMNS = 2;
export const POS_GRID_ROWS = 6;
export const POS_GRID_SLOTS = POS_GRID_COLUMNS * POS_GRID_ROWS;
export type PosGridColumns = 2 | 3;
export const posGridColumns = (config: PosGridConfig | null | undefined): PosGridColumns => (config?.columns === 3 ? 3 : 2);
export const posGridSlots = (config: PosGridConfig | null | undefined) => posGridColumns(config) * POS_GRID_ROWS;
export const POS_GRID_MAIN = 'main';
export const POS_GRID_MAX_GRIDS = 20;

interface KeyLook { label?: string; color?: string }
export type PosKey =
  | ({ type: 'category'; groupKey: string } & KeyLook)
  | ({ type: 'service'; serviceId: number } & KeyLook)
  | ({ type: 'grid'; gridId: string } & KeyLook)
  | ({ type: 'back' } & KeyLook)
  | ({ type: 'addon'; addonId: number } & KeyLook)
  | ({ type: 'fn'; fn: PosFn } & KeyLook)
  | ({ type: 'addonGroup'; groupId: number } & KeyLook);

/** The functions /nail's keys can run. The app has Discount and Gift Card; No Sale and Reprint (saved by /nail) show blank. */
export type PosFn = 'discount' | 'giftcard' | 'nosale' | 'reprint';
export const APP_POS_FNS: PosFn[] = ['discount', 'giftcard'];
export const POS_FN_LABELS: Record<PosFn, string> = { discount: 'Discount', giftcard: 'Gift Card', nosale: 'No Sale', reprint: 'Reprint Last' };

export type PosAfter = { to: 'stay' } | { to: 'main' } | { to: 'grid'; gridId: string };
export interface PosGrid { id: string; name: string; keys: (PosKey | null)[]; after?: PosAfter }
export interface PosGridConfig { grids: PosGrid[]; afterService?: PosAfter; columns?: 3; hideAddonsKey?: true }

/** The band along the bottom of each row of keys, top row first (/nail's colours). */
export const ROW_BANDS = ['#f4d000', '#cfb6ff', '#00c8ff', '#ff8bd4', '#b493ff', '#95d8ff'];

export interface CatalogService { id: number; name: string; duration: number; price: number }
export interface CatalogAddon { id: number; name: string; price: number; duration: number | null }
/** A category of the grid. `addons`: the Add-ons key, whose keys are add-ons, not services. Package keys have negative ids. */
export interface CatalogGroup { key: string; name: string; services: CatalogService[]; addons?: CatalogAddon[] }

export type GridKey =
  | { kind: 'category'; group: CatalogGroup; label?: string; color?: string }
  | { kind: 'service'; service: CatalogService; label?: string; color?: string }
  | { kind: 'grid'; grid: PosGrid; label?: string; color?: string }
  | { kind: 'addon'; addon: CatalogAddon; label?: string; color?: string }
  | { kind: 'fn'; fn: PosFn; label?: string; color?: string }
  /** A key of the POS's own option grids (gift card amounts, packages, membership plans): the same key, its own action. */
  | { kind: 'action'; id: string; title: string; price?: string; sub?: string; icon?: string; onPress: () => void }
  | { kind: 'more' }
  | { kind: 'back'; label?: string; color?: string }
  | { kind: 'empty' };

export type GridPlace = { at: 'main' } | { at: 'category'; key: string } | { at: 'grid'; id: string };

/** The automatic grid: the main grid is the categories; a category's grid is its services (or add-ons) and Back last. */
export function gridKeys(groups: CatalogGroup[], openKey: string | null, page: number, columns: number = POS_GRID_COLUMNS): GridKey[] {
  const slots = columns * POS_GRID_ROWS;
  const open = openKey ? groups.find((g) => g.key === openKey) : undefined;
  const items: GridKey[] = open
    ? open.addons ? open.addons.map((addon) => ({ kind: 'addon', addon })) : open.services.map((service) => ({ kind: 'service', service }))
    : groups.map((group) => ({ kind: 'category', group }));
  const reserved = open ? 1 : 0;
  const room = slots - reserved;
  const paged = items.length > room;
  const perPage = paged ? room - 1 : room; // one position goes to More
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const keys: GridKey[] = items.slice((page % pages) * perPage, (page % pages) * perPage + perPage);
  while (keys.length < perPage) keys.push({ kind: 'empty' });
  if (paged) keys.push({ kind: 'more' });
  if (open) keys.push({ kind: 'back' });
  return keys;
}

/** An add-on group as a grid category: its key is `addongroup:<id>` and its keys are its add-ons. */
export const addonGroupKey = (id: number) => `addongroup:${id}`;

/** One arranged grid as keys; on the main grid a category on no grid yet takes the next empty position. */
export function arrangedKeys(grid: PosGrid, layout: PosGridConfig, groups: CatalogGroup[], addons: CatalogAddon[] = [], addonGroups: CatalogGroup[] = []): GridKey[] {
  const slots = posGridSlots(layout);
  const services = new Map<number, CatalogService>();
  for (const g of groups) for (const svc of g.services) services.set(svc.id, svc);
  const keys = Array.from({ length: slots }, (_, i): GridKey => {
    const k = grid.keys[i];
    if (!k) return { kind: 'empty' };
    const look = { label: k.label, color: k.color };
    if (k.type === 'category') { const group = groups.find((g) => g.key === k.groupKey); return group ? { kind: 'category', group, ...look } : { kind: 'empty' }; }
    if (k.type === 'service') { const service = services.get(k.serviceId); return service ? { kind: 'service', service, ...look } : { kind: 'empty' }; }
    if (k.type === 'grid') { const target = layout.grids.find((g) => g.id === k.gridId); return target ? { kind: 'grid', grid: target, ...look } : { kind: 'empty' }; }
    if (k.type === 'addon') { const addon = addons.find((a) => a.id === k.addonId); return addon ? { kind: 'addon', addon, ...look } : { kind: 'empty' }; }
    if (k.type === 'fn') return APP_POS_FNS.includes(k.fn) ? { kind: 'fn', fn: k.fn, ...look } : { kind: 'empty' };
    if (k.type === 'addonGroup') { const group = addonGroups.find((g) => g.key === addonGroupKey(k.groupId)); return group ? { kind: 'category', group, ...look } : { kind: 'empty' }; }
    return { kind: 'back', ...look };
  });
  if (grid.id === POS_GRID_MAIN) {
    const placed = new Set(layout.grids.flatMap((g) => g.keys.flatMap((k) => (k?.type === 'category' ? [k.groupKey] : []))));
    const unplaced = groups.filter((g) => !placed.has(g.key));
    for (let i = 0; i < keys.length && unplaced.length > 0; i++) {
      if (keys[i].kind === 'empty' && !grid.keys[i]) keys[i] = { kind: 'category', group: unplaced.shift()! };
    }
  }
  return keys;
}

/** Main-grid positions that show a category only because it is on no grid yet. */
export function autoPlacedSlots(layout: PosGridConfig, groups: CatalogGroup[], addons: CatalogAddon[] = []): Set<number> {
  const main = layout.grids.find((g) => g.id === POS_GRID_MAIN);
  if (!main) return new Set();
  const keys = arrangedKeys(main, layout, groups, addons);
  return new Set(keys.flatMap((k, i) => (k.kind === 'category' && !main.keys[i] ? [i] : [])));
}

/** The keys for wherever the grid is. A manager's grid with no Back key gets one in its last position. */
export function placeKeys(layout: PosGridConfig | null | undefined, groups: CatalogGroup[], place: GridPlace, page: number, addons: CatalogAddon[] = [], addonGroups: CatalogGroup[] = []): GridKey[] {
  const columns = posGridColumns(layout);
  const slots = columns * POS_GRID_ROWS;
  const openable = [...groups, ...addonGroups];
  if (place.at === 'category' && openable.some((g) => g.key === place.key)) return gridKeys(openable, place.key, page, columns);
  const grid = layout?.grids.find((g) => g.id === (place.at === 'grid' ? place.id : POS_GRID_MAIN));
  if (!layout || !grid) return gridKeys(groups, null, page, columns);
  const keys = arrangedKeys(grid, layout, groups, addons, addonGroups);
  if (grid.id !== POS_GRID_MAIN && !keys.some((k) => k.kind === 'back')) keys[slots - 1] = { kind: 'back' };
  return keys;
}

/** The automatic layout as an arranged one — where a manager starts the first time: a key per category. */
export function automaticLayout(groups: CatalogGroup[]): PosGridConfig {
  const keys: (PosKey | null)[] = Array.from({ length: POS_GRID_SLOTS }, (_, i) => (groups[i] ? { type: 'category', groupKey: groups[i].key } : null));
  return { grids: [{ id: POS_GRID_MAIN, name: 'Main', keys }] };
}
