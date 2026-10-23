/** Booking requests (Settings → Booking approval → "Review each one first"). Server: routes/bookingRequests.ts. */
import { api } from '@/lib/live-api';

export type BookingRequest = {
  id: number;
  status: 'requested' | 'offered' | 'approved' | 'declined' | 'expired' | 'booked' | 'booking';
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  serviceId: number | null;
  serviceName: string;
  startsAt: string;
  duration: number;
  visitAt: 'place' | 'client';
  clientAddress: { line1?: string; line2?: string; city?: string; state?: string; postcode?: string } | null;
  travelFee: number;
  notes: string | null;
  offeredTimes: string[];
  appointmentId: number | null;
  expiresAt: string;
  createdAt: string;
  staffId: number | null;
};

export const listBookingRequests = () => api.get<BookingRequest[]>('/api/booking-requests');
export const getBookingRequest = (id: number) => api.get<BookingRequest>(`/api/booking-requests/${id}`);
export const approveBookingRequest = (id: number) => api.post<BookingRequest>(`/api/booking-requests/${id}/approve`);
export const declineBookingRequest = (id: number) => api.post<BookingRequest>(`/api/booking-requests/${id}/decline`);
export const offerBookingTimes = (id: number, times: string[]) => api.post<BookingRequest>(`/api/booking-requests/${id}/offer`, { times });
