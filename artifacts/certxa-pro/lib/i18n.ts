/**
 * The app's language (owner, 2026-11-19: Settings › Language; English and Vietnamese for now), the /nail way
 * (pages/nail/nailDomTranslate.ts): the app is written in English, and while another language is chosen every piece of
 * text that is exactly a known phrase is shown in that language (lib/phrases.vi.ts). Names, prices, dates and anything
 * typed are never in the phrase list, so they never change. Text, TextInput and Alert come from components/AppText.tsx
 * and lib/appAlert.ts, which translate through tr().
 *
 * Kept on this device (AsyncStorage "app.language").
 *
 * The salon's own catalog names (categories, services, add-ons, products, packages) translate the same way, from their
 * translations on the server (lib/catalogNames.ts → setCatalogNames): text that is exactly one of those names shows its
 * translation, and a line joined with " · " is translated part by part.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VI } from '@/lib/phrases.vi';

export type AppLang = 'en' | 'vi';
export const APP_LANGS: { value: AppLang; label: string }[] = [{ value: 'en', label: 'English' }, { value: 'vi', label: 'Tiếng Việt' }];

const KEY = 'app.language';
let lang: AppLang = 'en';
const listeners = new Set<() => void>();
// Changes whenever the words can change (the language, or the catalog names arriving), so every Text redraws.
let version = 0;
let catalog = new Map<string, string>();
const notify = () => { version += 1; for (const fn of listeners) fn(); };

/** The salon's catalog names in the chosen language: English name → translated name (lib/catalogNames.ts). */
export function setCatalogNames(names: Map<string, string>) { catalog = names; notify(); }

/** Read the saved language once at start (the app waits for it, so the first screen is already in that language). */
export async function loadLang(): Promise<void> {
  try { const saved = await AsyncStorage.getItem(KEY); if (saved === 'vi' || saved === 'en') lang = saved; } catch { /* English */ }
}

// Dates and times written for 'en-US' (or no locale) come out in Vietnamese while it is chosen (owner, 2026-11-19).
// Other locales (like 'en-CA' for 2026-11-20 keys) and numbers are left alone.
const toLocale = (locales: Intl.LocalesArgument | undefined) => (lang === 'vi' && (locales === undefined || locales === 'en-US') ? 'vi-VN' : locales);
const dateFns = ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString'] as const;
for (const name of dateFns) {
  const original = Date.prototype[name];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Date.prototype as any)[name] = function (this: Date, locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    return original.call(this, toLocale(locales), options);
  };
}

export function setLang(next: AppLang) {
  if (next === lang) return;
  lang = next;
  catalog = new Map();
  void AsyncStorage.setItem(KEY, next).catch(() => undefined);
  notify();
}

export const getLang = () => lang;
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
/** The language, re-rendering when it changes. */
export const useLang = () => useSyncExternalStore(subscribe, getLang, getLang);
const getTextKey = () => `${lang}:${version}`;
/** For translating Text: changes with the language and when the catalog names arrive. Pass it to tr(). */
export const useTextKey = () => useSyncExternalStore(subscribe, getTextKey, getTextKey);

/** Sentences with a number or name in them: the English pattern and its Vietnamese ($1, $2… are kept). */
const PATTERNS_VI: [RegExp, string][] = [
  [/^Say thanks to (.+) with a tip$/, 'Gửi lời cảm ơn $1 bằng tiền tip'],
  [/^(\d+) appointments?$/, '$1 lịch hẹn'],
  [/^(\d+) appointments? this (week|month|day)$/, '$1 lịch hẹn'],
  [/^(\d+) visits?$/, '$1 lần'],
  [/^(\d+) min$/, '$1 phút'],
  [/^(\d+) hr$/, '$1 giờ'],
  [/^(\d+) hr (\d+) min$/, '$1 giờ $2 phút'],
  [/^(\d+)% off$/, 'Giảm $1%'],
  [/^Gift card (\$[\d,.]+)$/, 'Thẻ quà tặng $1'],
  [/^CHARGE (\$[\d,.]+)$/, 'THANH TOÁN $1'],
  [/^Tax \(([\d.]+%)\)$/, 'Thuế ($1)'],
  [/^Discount \(([\d.]+%)\)$/, 'Giảm giá ($1)'],
  [/^(\d+) paid visits? · (\d+) appointments? still to go$/, '$1 lượt đã trả · còn $2 lịch hẹn'],
  [/^Weekly goal · (\$[\d,.]+) of (\$[\d,.]+)$/, 'Mục tiêu tuần · $1 / $2'],
  [/^(.+) · (\d+) appointments?$/, '$1 · $2 lịch hẹn'],
  [/^(\d+) appointments? still to go$/, 'còn $1 lịch hẹn'],
  [/^(\d+) clients?$/, '$1 khách'],
  [/^All clients \((\d+)\)$/, 'Tất cả khách ($1)'],
  [/^BOOKED (.+)$/, 'ĐÃ ĐẶT $1'],
  [/^(.+) ADDED · (\$[\d,.]+)$/, 'ĐÃ THÊM $1 · $2'],
  [/^DISCOUNT · (.+)$/, 'GIẢM GIÁ · $1'],
];

/** `english` in the chosen language, or as it is when it isn't a known phrase. Spaces around it are kept.
 *  Components pass the language from useLang() as `_lang`, so remembered results (React Compiler) follow a change. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function tr(english: string, _key: string = getTextKey()): string {
  if (lang === 'en' || !english) return english;
  const core = english.trim();
  if (!core) return english;
  let out = VI[core] ?? catalog.get(core);
  // "Gel Manicure · 60 min", "PAID · Gel Manicure": each part on its own.
  if (out === undefined && core.includes(' · ')) {
    const parts = core.split(' · ');
    const done = parts.map((p) => tr(p));
    if (done.some((d, i) => d !== parts[i])) out = done.join(' · ');
  }
  if (out === undefined) {
    for (const [re, to] of PATTERNS_VI) if (re.test(core)) { out = core.replace(re, to); break; }
  }
  if (out === undefined) return english;
  return english.replace(core, out);
}
