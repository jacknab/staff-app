import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/live-api';
import { useAuth } from '@/contexts/AuthContext';
import { businessToday, DEFAULT_TIME_ZONE, validTimeZone, zonedDay, zonedMinutes, zonedMoment, zonedTimeLabel } from '@/lib/businessTime';

export type ClientProfile = {
  id: string;
  customerId: number;
  name: string;
  initials: string;
  phone: string;
  lastVisit: string;
  service: string;
  visits: number;
  spend: string;
  color: 'green' | 'sand' | 'rose';
  email?: string;
  notes?: string;
};

export type AppointmentRecord = {
  id: string;
  appointmentId: number;
  dateKey: string;
  dateIso: string;
  /** Minutes after midnight it starts, in business time. */
  startMinutes: number;
  /** Held until the client pays the deposit (the payment link was texted); not confirmed yet. */
  depositDue?: boolean;
  /** A deposit the client already paid: it comes off what checkout charges. */
  depositPaidCents?: number;
  time: string;
  name: string;
  service: string;
  serviceId?: number;
  duration: string;
  price: string;
  amountCents: number;
  status: string;
  note?: string;
  /** The client's record (for their notes). Missing when the ticket has no client. */
  customerId?: number;
  /** The client's phone and e-mail, for the Text / Call / Email shortcuts. */
  phone?: string;
  email?: string;
  /** Solo plan house calls: where the visit happens, the client's address and the travel fee (in the price). */
  visitAt?: 'place' | 'client';
  clientAddress?: HouseCallAddress | null;
  travelFee?: number;
};

export type HouseCallAddress = { line1: string; line2?: string; city: string; state: string; postcode: string };

/** One line for a client's address. */
export function addressLine(a: HouseCallAddress | null | undefined): string {
  if (!a) return '';
  return [a.line1, a.line2, a.city, [a.state, a.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

export type ServiceProfile = {
  id: number;
  name: string;
  durationMinutes: number;
  duration: string;
  priceValue: number;
  price: string;
  icon: 'eye' | 'droplet' | 'briefcase' | 'star';
  /** Solo house calls: done at the professional's place, at the client's, or either. */
  offeredAt: 'place' | 'client' | 'any';
};

type NewClient = Omit<ClientProfile, 'id' | 'customerId'>;
type NewAppointment = Omit<AppointmentRecord, 'id' | 'appointmentId'> & { customerId: number };
type BookingContextValue = {
  clients: ClientProfile[];
  bookings: AppointmentRecord[];
  services: ServiceProfile[];
  loading: boolean;
  error: string;
  calendarDate: Date;
  /** The signed-in owner's own staff record. The app shows and books only this person's calendar. */
  ownStaffId: number | null;
  /** The business's IANA time zone. Every time in the app is shown and booked in it (lib/businessTime.ts). */
  timeZone: string;
  /** After the time zone is changed in Settings. */
  setTimeZone: (timeZone: string) => void;
  setCalendarDate: (date: Date) => void;
  refresh: () => Promise<void>;
  addClient: (client: NewClient) => Promise<ClientProfile>;
  /** A client from just a name, a phone number or an e-mail (the POS). */
  addQuickClient: (client: { name?: string; phone?: string; email?: string }) => Promise<ClientProfile>;
  addBooking: (appointment: NewAppointment) => Promise<void>;
  /** `notifyClient`: text the client the new day and time (the "Notify client" switch). */
  rescheduleBooking: (appointmentId: number, dateIso: string, durationMinutes: number, notifyClient?: boolean) => Promise<void>;
};

type ApiCustomer = { id: number; name?: string | null; fullName?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; notes?: string | null };
type ApiService = { id: number; offeredAt?: string | null; name?: string | null; duration?: number | string | null; price?: number | string | null };
type ApiAppointment = { calendarHidden?: boolean | null; paymentStatus?: string | null; depositCollected?: number | null; visitAt?: string | null; clientAddress?: HouseCallAddress | null; travelFee?: number | null; appointmentAddons?: { addon?: { price?: number | string | null } | null }[] | null; customLines?: { label?: string; price?: number | string | null }[] | null; id: number; date: string; duration?: number | null; status?: string | null; notes?: string | null; customer?: ApiCustomer | null; service?: ApiService | null };

const BookingContext = createContext<BookingContextValue | null>(null);

function dateKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function nameOf(customer?: ApiCustomer | null) { return customer?.fullName || customer?.name || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Walk-in'; }
function initialsOf(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'; }
function money(value: number) { return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function durationMinutes(value: ApiService['duration']) { const number = Number(value ?? 60); return Number.isFinite(number) && number > 0 ? number : 60; }

function mapCustomer(customer: ApiCustomer, index: number): ClientProfile {
  const name = nameOf(customer);
  return { id: String(customer.id), customerId: customer.id, name, initials: initialsOf(name), phone: customer.phone ?? '', email: customer.email ?? undefined, notes: customer.notes ?? undefined, lastVisit: 'Certxa client', service: customer.phone || customer.email || 'Client record', visits: 0, spend: '—', color: (['green', 'sand', 'rose'] as const)[index % 3] };
}

function mapService(service: ApiService, index: number): ServiceProfile {
  const minutes = durationMinutes(service.duration);
  const priceValue = Number(service.price ?? 0) || 0;
  return { id: service.id, name: service.name || 'Service', durationMinutes: minutes, duration: minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`, priceValue, price: money(priceValue), icon: (['eye', 'droplet', 'briefcase', 'star'] as const)[index % 4], offeredAt: service.offeredAt === 'place' || service.offeredAt === 'client' ? service.offeredAt : 'any' };
}

function mapAppointment(appointment: ApiAppointment, timeZone: string): AppointmentRecord {
  const date = new Date(appointment.date);
  // The business date and time, whatever zone the phone is in.
  const businessDay = zonedDay(date, timeZone);
  // What the visit comes to: the main service, its add-ons, and any extra services on the ticket.
  const priceValue = (Number(appointment.service?.price ?? 0) || 0)
    + (appointment.appointmentAddons ?? []).reduce((sum, row) => sum + (Number(row?.addon?.price ?? 0) || 0), 0)
    + (Array.isArray(appointment.customLines) ? appointment.customLines : []).reduce((sum, line) => sum + (Number(line?.price ?? 0) || 0), 0)
    // A house call's travel fee is part of what the client pays.
    + (Number(appointment.travelFee ?? 0) || 0);
  const minutes = Number(appointment.duration ?? appointment.service?.duration ?? 60) || 60;
  return { id: String(appointment.id), appointmentId: appointment.id, dateKey: dateKey(businessDay), dateIso: date.toISOString(), startMinutes: zonedMinutes(date, timeZone), time: zonedTimeLabel(date, timeZone), name: nameOf(appointment.customer), service: appointment.service?.name || 'Service', serviceId: appointment.service?.id, duration: `${minutes} min`, price: money(priceValue), amountCents: Math.round(priceValue * 100), status: appointment.status === 'completed' ? 'paid' : appointment.status || 'pending', note: appointment.notes ?? undefined, customerId: appointment.customer?.id ?? undefined,
    phone: appointment.customer?.phone ?? undefined, email: appointment.customer?.email ?? undefined,
    depositDue: appointment.paymentStatus === 'awaiting_payment',
    depositPaidCents: appointment.paymentStatus === 'awaiting_payment' ? 0 : Math.round((Number(appointment.depositCollected ?? 0) || 0) * 100),
    visitAt: appointment.visitAt === 'client' ? 'client' : 'place', clientAddress: appointment.clientAddress ?? null, travelFee: Number(appointment.travelFee ?? 0) || 0 };
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [bookings, setBookings] = useState<AppointmentRecord[]>([]);
  const [services, setServices] = useState<ServiceProfile[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // This app is one person's calendar: the account owner's. Other technicians of the same business are
  // never shown or booked here. (An account with no staff record linked to it falls back to the whole business.)
  const { user } = useAuth();
  const ownStaffId = Number(user?.staffId) > 0 ? Number(user?.staffId) : null;
  const [timeZone, setTimeZoneState] = useState(DEFAULT_TIME_ZONE);
  const timeZoneLoaded = useRef(false);
  const timeZoneRef = useRef(DEFAULT_TIME_ZONE);

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      // The business's time zone, once per session (Settings updates it through setTimeZone).
      let tz = timeZoneRef.current;
      if (!timeZoneLoaded.current) {
        const stores = await api.get<Array<{ timezone?: string | null }>>('/api/stores').catch(() => null);
        if (Array.isArray(stores) && stores[0]) {
          tz = validTimeZone(stores[0].timezone);
          timeZoneLoaded.current = true;
          timeZoneRef.current = tz;
          setTimeZoneState(tz);
          // The calendar opened on the phone's today; when the business is already on another date, start there.
          const today = businessToday(tz);
          if (dateKey(today) !== dateKey(calendarDate) && dateKey(calendarDate) === dateKey(new Date())) { setCalendarDate(today); return; }
        }
      }
      // The whole month grid around the chosen business day, from its first midnight to the last, in business time.
      const gridStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
      gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7));
      const gridEnd = new Date(gridStart); gridEnd.setDate(gridEnd.getDate() + 42);
      const from = zonedMoment(gridStart, 0, tz);
      const to = new Date(zonedMoment(gridEnd, 0, tz).getTime() - 1);
      const [customerRows, serviceRows, appointmentRows, ownServices] = await Promise.all([
        api.get<ApiCustomer[]>('/api/customers'),
        api.get<ApiService[]>('/api/services'),
        api.get<ApiAppointment[]>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${ownStaffId ? `&staffId=${ownStaffId}` : ''}`),
        // The services the owner performs. An empty list means no restriction.
        ownStaffId ? api.get<{ serviceIds?: number[] }>(`/api/staff/${ownStaffId}/services`).catch(() => null) : Promise.resolve(null),
      ]);
      const ownServiceIds = Array.isArray(ownServices?.serviceIds) ? ownServices.serviceIds.map(Number) : [];
      setClients((Array.isArray(customerRows) ? customerRows : []).map(mapCustomer));
      setServices((Array.isArray(serviceRows) ? serviceRows : []).filter((service) => ownServiceIds.length === 0 || ownServiceIds.includes(Number(service.id))).map(mapService));
      // Tickets kept off the calendar (POS quick sales, bookings held for a deposit) are not drawn.
      setBookings((Array.isArray(appointmentRows) ? appointmentRows : []).filter((row) => row.calendarHidden !== true).map((row) => mapAppointment(row, tz)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Certxa data.'); }
    finally { setLoading(false); }
  }, [calendarDate, ownStaffId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<BookingContextValue>(() => ({
    clients, bookings, services, loading, error, calendarDate, ownStaffId, setCalendarDate, refresh,
    timeZone, setTimeZone: (next) => { timeZoneLoaded.current = true; timeZoneRef.current = validTimeZone(next); setTimeZoneState(timeZoneRef.current); },
    addClient: async (client) => {
      const created = await api.post<ApiCustomer>('/api/customers', { name: client.name, phone: client.phone || undefined });
      const record = mapCustomer(created, 0); setClients((current) => [record, ...current]); return record;
    },
    addQuickClient: async (client) => {
      const created = await api.post<ApiCustomer>('/api/customers', {
        ...(client.name?.trim() ? { name: client.name.trim() } : {}),
        ...(client.phone?.trim() ? { phone: client.phone.trim() } : {}),
        ...(client.email?.trim() ? { email: client.email.trim() } : {}),
      });
      const record = mapCustomer(created, 0); setClients((current) => [record, ...current]); return record;
    },
    addBooking: async (appointment) => {
      await api.post('/api/appointments', {
        customerId: appointment.customerId, serviceId: appointment.serviceId, ...(ownStaffId ? { staffId: ownStaffId } : {}),
        duration: Number.parseInt(appointment.duration, 10) || 60, date: appointment.dateIso,
        ...(appointment.visitAt === 'client' ? { visitAt: 'client', clientAddress: appointment.clientAddress } : {}),
      });
      await refresh();
    },
    rescheduleBooking: async (appointmentId, dateIso, durationMinutes, notifyClient = false) => {
      // Certxa refuses the move when it would land on another appointment of the same technician.
      await api.patch(`/api/appointments/${appointmentId}`, { date: dateIso, duration: durationMinutes, checkConflicts: true, ...(notifyClient ? { notifyClient: true } : {}) });
      await refresh();
    },
  }), [bookings, calendarDate, clients, error, loading, ownStaffId, refresh, services, timeZone]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookingData() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBookingData must be used within BookingProvider.');
  return value;
}
