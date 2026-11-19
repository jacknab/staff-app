/**
 * The salon's catalog names in the app's language (owner, 2026-11-19): categories, services, add-ons, products, prepaid
 * packages and catalog packages, from their translations on the server (GET /api/translations/store; made by AI when
 * an item is added or renamed, and editable by the pro). Handed to lib/i18n.ts, so every Text showing exactly one of
 * those names shows its translation. Loaded when signed in and whenever the language changes; English needs none.
 */
import { api } from '@/lib/live-api';
import { getLang, setCatalogNames } from '@/lib/i18n';

type Row = { id: number; base_name: string; language: string | null; translated_name: string | null };
type StoreTranslations = Record<string, Row[]>;

export async function loadCatalogNames(): Promise<void> {
  const lang = getLang();
  if (lang === 'en') { setCatalogNames(new Map()); return; }
  try {
    const data = await api.get<StoreTranslations>('/api/translations/store');
    if (getLang() !== lang) return; // changed while loading
    const names = new Map<string, string>();
    for (const rows of Object.values(data ?? {})) {
      for (const r of Array.isArray(rows) ? rows : []) {
        if (r.language === lang && r.translated_name && r.base_name && !names.has(r.base_name.trim())) names.set(r.base_name.trim(), r.translated_name.trim());
      }
    }
    setCatalogNames(names);
  } catch { /* not signed in yet, or offline: names stay in English */ }
}
