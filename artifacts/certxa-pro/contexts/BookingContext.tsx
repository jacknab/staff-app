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
  /** Live numbers from Certxa (paid visits; spend without tips). */
  spentCents?: number;
  lastVisitAt?: string | null;
  lastService?: string | null;
  nextAppointmentAt?: string | null;
  allergies?: string | null;
  isVip?: boolean;
  tags?: string[];
  avatarUrl?: string | null;
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
  /** Cancelled online by the client: within the policy (true) or late (false); null otherwise. */
  cancelledInPolicy?: boolean | null;
  /** The deposit refunded automatically for a cancel within the policy, and whether that refund failed. */
  depositRefundedCents?: number | null;
  depositRefundFailed?: boolean;
  /** A declined fee the server keeps trying (pending), settled with half (partial), or stopped (gave_up). */
  feeRetry?: { status: string; owedCents: number; collectedCents: number | null; error: string | null } | null;
  /** A failed deposit refund being tried again ('pending') or done. */
  depositRefundRetry?: string | null;
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
  /** The visit's further services (priced lines on the ticket) and its add-ons, for Edit. */
  extraLines?: { label: string; price: number }[];
  addonIds?: number[];
  addonLines?: { label: string; price: number }[];
  avatarUrl?: string | null;
  /** Paid: what was paid (cents) and how much of it has been refunded since. */
  totalPaidCents?: number | null;
  refundedCents?: number;
  /** No-show / late-cancel fee: the client's card on file, the fee % and amount agreed when booking, and a fee already charged. */
  cardOnFile?: boolean;
  feePercent?: number | null;
  /** The fee agreed when the client booked online; null for older bookings (worked out from the %). */
  feeCents?: number | null;
  feeChargedCents?: number | null;
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
  /** Its category in Catalog (null: none), for showing services under their category. */
  categoryId: number | null;
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

type ApiCustomer = {
  id: number; name?: string | null; fullName?: string | null; firstName?: string | null; lastName?: string | null; phone?: string | null; email?: string | null; notes?: string | null;
  visits?: number | null; spentCents?: number | null; lastVisitAt?: string | null; lastService?: string | null; nextAppointmentAt?: string | null;
  allergies?: string | null; isVip?: boolean | null; tags?: string[] | null; avatarUrl?: string | null;
};
type ApiService = { id: number; categoryId?: number | null; offeredAt?: string | null; name?: string | null; duration?: number | string | null; price?: number | string | null };
export type ApiAppointment = { feeRetry?: { status: string; owedCents: number; collectedCents: number | null; error: string | null } | null; depositRefundRetry?: string | null; cancelledInPolicy?: boolean | null; depositRefundedCents?: number | null; depositRefundFailed?: boolean | null; cardOnFile?: boolean | null; feePercent?: number | null; feeCents?: number | null; feeChargedCents?: number | null; totalPaid?: number | null; refundedCents?: number | null; calendarHidden?: boolean | null; paymentStatus?: string | null; depositCollected?: number | null; visitAt?: string | null; clientAddress?: HouseCallAddress | null; travelFee?: number | null; appointmentAddons?: { addon?: { id?: number; name?: string | null; price?: number | string | null } | null }[] | null; customLines?: { label?: string; price?: number | string | null }[] | null; id: number; date: string; duration?: number | null; status?: string | null; notes?: string | null; customer?: ApiCustomer | null; service?: ApiService | null };

const BookingContext = createContext<BookingContextValue | null>(null);

function dateKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function nameOf(customer?: ApiCustomer | null) { return customer?.fullName || customer?.name || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || 'Walk-in'; }
function initialsOf(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'; }
function money(value: number) { return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function durationMinutes(value: ApiService['duration']) { const number = Number(value ?? 60); return Number.isFinite(number) && number > 0 ? number : 60; }

function mapCustomer(customer: ApiCustomer, index: number): ClientProfile {
  const name = nameOf(customer);
  const visits = Number(customer.visits ?? 0);
  const spentCents = Number(customer.spentCents ?? 0);
  return {
    id: String(customer.id), customerId: customer.id, name, initials: initialsOf(name), phone: customer.phone ?? '', email: customer.email ?? undefined, notes: customer.notes ?? undefined,
    // lastVisit/service are only fallbacks: the Clients screens label dates in business time from lastVisitAt.
    lastVisit: visits > 0 ? 'Visited' : 'No visits yet', service: customer.lastService || customer.phone || customer.email || 'Client record',
    visits, spend: money(spentCents / 100), spentCents,
    lastVisitAt: customer.lastVisitAt ?? null, lastService: customer.lastService ?? null, nextAppointmentAt: customer.nextAppointmentAt ?? null,
    allergies: customer.allergies ?? null, isVip: !!customer.isVip, tags: Array.isArray(customer.tags) ? customer.tags : [], avatarUrl: customer.avatarUrl ?? null,
    color: (['green', 'sand', 'rose'] as const)[index % 3],
  };
}

function mapService(service: ApiService, index: number): ServiceProfile {
  const minutes = durationMinutes(service.duration);
  const priceValue = Number(service.price ?? 0) || 0;
  return { id: service.id, name: service.name || 'Service', durationMinutes: minutes, duration: minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`, priceValue, price: money(priceValue), icon: (['eye', 'droplet', 'briefcase', 'star'] as const)[index % 4], offeredAt: service.offeredAt === 'place' || service.offeredAt === 'client' ? service.offeredAt : 'any', categoryId: service.categoryId == null ? null : Number(service.categoryId) };
}

export function mapAppointment(appointment: ApiAppointment, timeZone: string): AppointmentRecord {
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
    avatarUrl: appointment.customer?.avatarUrl ?? null,
    depositDue: appointment.paymentStatus === 'awaiting_payment',
    depositPaidCents: appointment.paymentStatus === 'awaiting_payment' ? 0 : Math.round((Number(appointment.depositCollected ?? 0) || 0) * 100),
    cancelledInPolicy: appointment.cancelledInPolicy ?? null,
    depositRefundedCents: appointment.depositRefundedCents != null ? Number(appointment.depositRefundedCents) : null,
    depositRefundFailed: !!appointment.depositRefundFailed,
    feeRetry: appointment.feeRetry ?? null,
    depositRefundRetry: appointment.depositRefundRetry ?? null,
    visitAt: appointment.visitAt === 'client' ? 'client' : 'place', clientAddress: appointment.clientAddress ?? null, travelFee: Number(appointment.travelFee ?? 0) || 0,
    extraLines: (Array.isArray(appointment.customLines) ? appointment.customLines : []).map((line) => ({ label: String(line?.label ?? ''), price: Number(line?.price ?? 0) || 0 })).filter((line) => line.label),
    addonIds: (appointment.appointmentAddons ?? []).map((row) => Number(row?.addon?.id)).filter((n) => Number.isInteger(n) && n > 0),
    addonLines: (appointment.appointmentAddons ?? []).map((row) => ({ label: String(row?.addon?.name ?? 'Add-on'), price: Number(row?.addon?.price ?? 0) || 0 })),
    totalPaidCents: appointment.totalPaid != null ? Math.round(Number(appointment.totalPaid) * 100) : null,
    refundedCents: Number(appointment.refundedCents ?? 0) || 0,
    cardOnFile: !!appointment.cardOnFile, feePercent: appointment.feePercent != null ? Number(appointment.feePercent) : null,
    feeCents: appointment.feeCents != null ? Number(appointment.feeCents) : null,
    feeChargedCents: appointment.feeChargedCents != null ? Number(appointment.feeChargedCents) : null };
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
      // A booking held for a deposit is hidden from clients but holds the time, so it's on the calendar ("DEPOSIT DUE"):
      // otherwise its slot looks free and moving another booking there is refused (owner, 2026-11-07).
      setBookings((Array.isArray(appointmentRows) ? appointmentRows : []).filter((row) => row.calendarHidden !== true || row.paymentStatus === 'awaiting_payment').map((row) => mapAppointment(row, tz)));
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

/** The booking details screen for a booking (the calendar, and a review's "View booking"). */
export function appointmentParams(item: AppointmentRecord) {
  return {
    pathname: '/appointment/[id]' as const,
    params: {
      id: String(item.appointmentId),
      clientName: item.name,
      serviceName: item.service,
      serviceId: String(item.serviceId ?? ''),
      amountCents: String(item.amountCents),
      dateIso: item.dateIso,
      duration: item.duration,
      status: item.status,
      note: item.note ?? '',
      customerId: item.customerId ? String(item.customerId) : '',
      avatarUrl: item.avatarUrl ?? '',
      phone: item.phone ?? '',
      email: item.email ?? '',
      depositDue: item.depositDue ? '1' : '0',
      depositPaidCents: String(item.depositPaidCents ?? 0),
      cancelledInPolicy: item.cancelledInPolicy == null ? '' : item.cancelledInPolicy ? '1' : '0',
      depositRefundedCents: item.depositRefundedCents != null ? String(item.depositRefundedCents) : '',
      depositRefundFailed: item.depositRefundFailed ? '1' : '0',
      feeRetry: item.feeRetry ? JSON.stringify(item.feeRetry) : '',
      depositRefundRetry: item.depositRefundRetry ?? '',
      visitAt: item.visitAt ?? 'place',
      clientAddress: item.clientAddress ? JSON.stringify(item.clientAddress) : '',
      travelFeeCents: String(Math.round((item.travelFee ?? 0) * 100)),
      extraLines: JSON.stringify(item.extraLines ?? []),
      addonIds: (item.addonIds ?? []).join(','),
      addonLines: JSON.stringify(item.addonLines ?? []),
      totalPaidCents: item.totalPaidCents != null ? String(item.totalPaidCents) : '',
      refundedCents: String(item.refundedCents ?? 0),
      cardOnFile: item.cardOnFile ? '1' : '0',
      feePercent: item.feePercent != null ? String(item.feePercent) : '',
      feeCents: item.feeCents != null ? String(item.feeCents) : '',
      feeChargedCents: item.feeChargedCents != null ? String(item.feeChargedCents) : '',
    },
  };
}
