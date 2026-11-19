/**
 * Every "New booking" in the app (owner, 2026-11-19): on a phone the New booking screen (app/booking.tsx); on a tablet the
 * POS's booking (components/pos/TabletPos.tsx: the ticket's services, then days and times in the grid). The same details
 * go either way: clientId, phone, serviceIds ("12,15") and day ("2026-10-20", month from 0, as the calendar keeps it).
 */
import { useRouter, type Href } from 'expo-router';
import { useIsTablet } from '@/components/TabletLauncher';

export type BookingParams = { clientId?: string; phone?: string; serviceIds?: string; day?: string };

export function useOpenBooking() {
  const router = useRouter();
  const isTablet = useIsTablet();
  return (params: BookingParams = {}) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '')) as Record<string, string>;
    // `book` changes every time, so the POS starts a new booking even when it is already open.
    if (isTablet) router.navigate({ pathname: '/(tabs)/pos', params: { ...clean, book: String(Date.now()) } } as unknown as Href);
    else router.push({ pathname: '/booking', params: clean } as unknown as Href);
  };
}
