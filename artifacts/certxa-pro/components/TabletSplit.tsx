/**
 * Tablets (owner, 2026-11-19): list screens show their list on the left and the opened page on the right, in one screen
 * (Clients, Services, More, Past 30 days; Settings does the same inside app/settings.tsx).
 *
 * A page shown on the right is the same screen the phone opens, given its details through PaneContext instead of the
 * address. Inside the pane:
 *  - useScreenParams() gives the details (on a phone: the address's, as useLocalSearchParams does);
 *  - useInPane() is true, so the page hides a back arrow that would only leave the screen (an arrow that closes
 *    something inside the page, such as a form being filled in, stays);
 *  - usePaneClose() is what the page calls when it is done (a client deleted, a visit cancelled): it empties the right
 *    side, where a phone goes back;
 *  - usePaneSetParams() changes the page's details (an edited visit), as router.setParams changes the address.
 */
import { createContext, useContext, useState, type ComponentType, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

type Params = Record<string, string | undefined>;
type Pane = { params: Params; close: () => void; setParams: (next: Params) => void };
const PaneContext = createContext<Pane | null>(null);

export const useInPane = () => useContext(PaneContext) != null;

export function useScreenParams<T extends Record<string, string | undefined>>(): T {
  const pane = useContext(PaneContext);
  const route = useLocalSearchParams();
  return (pane ? pane.params : route) as unknown as T;
}

export function usePaneClose() {
  const pane = useContext(PaneContext);
  const router = useRouter();
  return pane ? pane.close : () => router.back();
}

export function usePaneSetParams() {
  const pane = useContext(PaneContext);
  const router = useRouter();
  return pane ? pane.setParams : (next: Params) => router.setParams(next);
}

/** What the right side shows: a screen and its details; `key` makes a new choice start the screen afresh. */
export type PaneScreen = { key: string; Screen: ComponentType; params?: Record<string, string | undefined> };

export function TabletSplit({ list, pane, onClose }: { list: ReactNode; pane: PaneScreen | null; onClose: () => void }) {
  return (
    <View style={styles.split}>
      <View style={styles.list}>{list}</View>
      <View style={styles.line} />
      <View style={styles.pane}>
        {pane ? <PaneHost key={pane.key} pane={pane} onClose={onClose} /> : null}
      </View>
    </View>
  );
}

function PaneHost({ pane, onClose }: { pane: PaneScreen; onClose: () => void }) {
  const [params, setParams] = useState<Params>(pane.params ?? {});
  return (
    <PaneContext.Provider value={{ params, close: onClose, setParams: (next) => setParams((current) => ({ ...current, ...next })) }}>
      <pane.Screen />
    </PaneContext.Provider>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, flexDirection: 'row' },
  list: { width: '38%', minWidth: 320, maxWidth: 440 },
  line: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(28, 22, 80, 0.14)' },
  pane: { flex: 1, overflow: 'hidden' },
});
