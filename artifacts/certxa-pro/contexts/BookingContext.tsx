import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/live-api';

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
};

export type ServiceProfile = {
  id: number;
  name: string;
  durationMinutes: number;
  duration: string;
  priceValue: number;
  price: string;
  icon: 'eye' | 'droplet' | 'briefcase' | 'star';
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
  setCalendarDate: (date: Date) => void;
  refresh: () => Promise<void>;
  addClient: (client: NewClient) => Promise<ClientProfile>;
  addBooking: (appointment: NewAppointment) => Promise<void>;
  rescheduleBooking: (appointmentId: number, dateIso: string, durationMinutes: number) => Promise<void>;
};

type ApiCustomer = { id: number; name?: string | null; fullName?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; notes?: string | null };
type ApiService = { id: number; name?: string | null; duration?: number | string | null; price?: number | string | null };
type ApiAppointment = { appointmentAddons?: { addon?: { price?: number | string | null } | null }[] | null; customLines?: { label?: string; price?: number | string | null }[] | null; id: number; date: string; duration?: number | null; status?: string | null; notes?: string | null; customer?: ApiCustomer | null; service?: ApiService | null };

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
  return { id: service.id, name: service.name || 'Service', durationMinutes: minutes, duration: minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`, priceValue, price: money(priceValue), icon: (['eye', 'droplet', 'briefcase', 'star'] as const)[index % 4] };
}

function mapAppointment(appointment: ApiAppointment): AppointmentRecord {
  const date = new Date(appointment.date);
  // What the visit comes to: the main service, its add-ons, and any extra services on the ticket.
  const priceValue = (Number(appointment.service?.price ?? 0) || 0)
    + (appointment.appointmentAddons ?? []).reduce((sum, row) => sum + (Number(row?.addon?.price ?? 0) || 0), 0)
    + (Array.isArray(appointment.customLines) ? appointment.customLines : []).reduce((sum, line) => sum + (Number(line?.price ?? 0) || 0), 0);
  const minutes = Number(appointment.duration ?? appointment.service?.duration ?? 60) || 60;
  return { id: String(appointment.id), appointmentId: appointment.id, dateKey: dateKey(date), dateIso: date.toISOString(), time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), name: nameOf(appointment.customer), service: appointment.service?.name || 'Service', serviceId: appointment.service?.id, duration: `${minutes} min`, price: money(priceValue), amountCents: Math.round(priceValue * 100), status: appointment.status === 'completed' ? 'paid' : appointment.status || 'pending', note: appointment.notes ?? undefined };
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientProfile[]>([]);
  const [bookings, setBookings] = useState<AppointmentRecord[]>([]);
  const [services, setServices] = useState<ServiceProfile[]>([]);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    const from = new Date(calendarDate); from.setHours(0, 0, 0, 0);
    const to = new Date(calendarDate); to.setHours(23, 59, 59, 999);
    try {
      const [customerRows, serviceRows, appointmentRows] = await Promise.all([
        api.get<ApiCustomer[]>('/api/customers'),
        api.get<ApiService[]>('/api/services'),
        api.get<ApiAppointment[]>(`/api/appointments?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`),
      ]);
      setClients((Array.isArray(customerRows) ? customerRows : []).map(mapCustomer));
      setServices((Array.isArray(serviceRows) ? serviceRows : []).map(mapService));
      setBookings((Array.isArray(appointmentRows) ? appointmentRows : []).map(mapAppointment));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load Certxa data.'); }
    finally { setLoading(false); }
  }, [calendarDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<BookingContextValue>(() => ({
    clients, bookings, services, loading, error, calendarDate, setCalendarDate, refresh,
    addClient: async (client) => {
      const created = await api.post<ApiCustomer>('/api/customers', { name: client.name, phone: client.phone || undefined });
      const record = mapCustomer(created, 0); setClients((current) => [record, ...current]); return record;
    },
    addBooking: async (appointment) => {
      await api.post('/api/appointments', { customerId: appointment.customerId, serviceId: appointment.serviceId, duration: Number.parseInt(appointment.duration, 10) || 60, date: appointment.dateIso });
      await refresh();
    },
    rescheduleBooking: async (appointmentId, dateIso, durationMinutes) => {
      await api.patch(`/api/appointments/${appointmentId}`, { date: dateIso, duration: durationMinutes });
      await refresh();
    },
  }), [bookings, calendarDate, clients, error, loading, refresh, services]);

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
}

export function useBookingData() {
  const value = useContext(BookingContext);
  if (!value) throw new Error('useBookingData must be used within BookingProvider.');
  return value;
}
