import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/live-api';
import { useAuth } from '@/contexts/AuthContext';

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
  time: string;
  name: string;
  service: string;
  serviceId?: number;
  duration: string;
  price: string;
  amountCents: number;
  status: string;
  note?: string;
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
  setCalendarDate: (date: Date) => void;
  refresh: () => Promise<void>;
  addClient: (client: NewClient) => Promise<ClientProfile>;
  addBooking: (appointment: NewAppointment) => Promise<void>;
  rescheduleBooking: (appointmentId: number, dateIso: string, durationMinutes: number) => Promise<void>;
};

type ApiCustomer = { id: number; name?: string | null; fullName?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; notes?: string | null };
type ApiService = { id: number; offeredAt?: string | null; name?: string | null; duration?: number | string | null; price?: number | string | null };
type ApiAppointment = { visitAt?: string | null; clientAddress?: HouseCallAddress | null; travelFee?: number | null; appointmentAddons?: { addon?: { price?: number | string | null } | null }[] | null; customLines?: { label?: string; price?: number | string | null }[] | null; id: number; date: string; duration?: number | null; status?: string | null; notes?: string | null; customer?: ApiCustomer | null; service?: ApiService | null };

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

function mapAppointment(appointment: ApiAppointment): AppointmentRecord {
  const date = new Date(appointment.date);
  // What the visit comes to: the main service, its add-ons, and any extra services on the ticket.
  const priceValue = (Number(appointment.service?.price ?? 0) || 0)
    + (appointment.appointmentAddons ?? []).reduce((sum, row) => sum + (Number(row?.addon?.price ?? 0) || 0), 0)
    + (Array.isArray(appointment.customLines) ? appointment.customLines : []).reduce((sum, line) => sum + (Number(line?.price ?? 0) || 0), 0)
    // A house call's travel fee is part of what the client pays.
    + (Number(appointment.travelFee ?? 0) || 0);
  const minutes = Number(appointment.duration ?? appointment.service?.duration ?? 60) || 60;
  return { id: String(appointment.id), appointmentId: appointment.id, dateKey: dateKey(date), dateIso: date.toISOString(), time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), name: nameOf(appointment.customer), service: appointment.service?.name || 'Service', serviceId: appointment.service?.id, duration: `${minutes} min`, price: money(priceValue), amountCents: Math.round(priceValue * 100), status: appointment.status === 'completed' ? 'paid' : appointment.status || 'pending', note: appointment.notes ?? undefined,
    phone: appointment.customer?.phone ?? undefined, email: appointment.customer?.email ?? undefined,
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

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    // The whole month grid around the chosen day (the Monday on or before the 1st, six weeks on), so the
    // Day, Week and Month views all show the real bookings.
    const from = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const to = new Date(from); to.setDate(to.getDate() + 42); to.setMilliseconds(-1);
    try {
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
      setBookings((Array.isArray(appointmentRows) ? appointmentRows : []).map(mapAppointment));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Certxa data.'); }
    finally { setLoading(false); }
  }, [calendarDate, ownStaffId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<BookingContextValue>(() => ({
    clients, bookings, services, loading, error, calendarDate, ownStaffId, setCalendarDate, refresh,
    addClient: async (client) => {
      const created = await api.post<ApiCustomer>('/api/customers', { name: client.name, phone: client.phone || undefined });
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
    rescheduleBooking: async (appointmentId, dateIso, durationMinutes) => {
      // Certxa refuses the move when it would land on another appointment of the same technician.
      await api.patch(`/api/appointments/${appointmentId}`, { date: dateIso, duration: durationMinutes, checkConflicts: true });
      await refresh();
    },
  }), [bookings, calendarDate, clients, error, loading, ownStaffId, refresh, services]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookingData() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBookingData must be used within BookingProvider.');
  return value;
}
