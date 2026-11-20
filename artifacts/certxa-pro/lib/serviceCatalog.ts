/**
 * Certxa's service catalog for the app (owner, 2026-11-20): every business type's list of common services
 * (GET /api/public/service-catalog/:type, server table service_catalog). Used by sign-up's catalog builder and by
 * Services › Add from list.
 */
import { certxaRequest } from '@/lib/certxa-api';
import type { CatalogCategory } from '@/components/signup/CatalogBuilder';

/** The types of business (Sign-up, Settings › Business details). */
export const BUSINESS_TYPES = ['Nail Salon', 'Hair Salon', 'Barbershop', 'Lash and Brows', 'Esthetician', 'Makeup', 'Massage', 'Wax', 'Med Spa', 'Wellness', 'Tattoo and Piercing', 'Pet Grooming', 'Other'];

/** Each business type's list in the catalog; Makeup is the Esthetics list's Makeup category. Types not here have none. */
export const CATALOG_TYPE: Record<string, { type: string; only?: string }> = {
  'Nail Salon': { type: 'Nails' }, 'Hair Salon': { type: 'Hair' }, Barbershop: { type: 'Barber' }, 'Lash and Brows': { type: 'Lash & Brow' },
  Esthetician: { type: 'Esthetics' }, Makeup: { type: 'Esthetics', only: 'Makeup' }, Massage: { type: 'Massage' }, Wax: { type: 'Waxing' },
  'Med Spa': { type: 'Med Spa' }, Wellness: { type: 'Wellness' },
  'Tattoo and Piercing': { type: 'Tattoo & Piercing' }, 'Pet Grooming': { type: 'Pet Grooming' },
};

/** A business type's categories with their common services, in the order they're asked. */
export async function loadCatalog(businessType: string): Promise<CatalogCategory[]> {
  const t = CATALOG_TYPE[businessType];
  if (!t) return [];
  const r = await certxaRequest<{ categories: CatalogCategory[] }>(`/api/public/service-catalog/${encodeURIComponent(t.type)}`);
  return (r?.categories ?? []).filter((c) => !t.only || c.name === t.only);
}
