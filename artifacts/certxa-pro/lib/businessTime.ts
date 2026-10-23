/**
 * The app shows and books every time in the BUSINESS's time zone (the one clients see on the booking page and
 * in their texts), never the phone's. A pro travelling, or a phone set to another zone, still sees their real
 * business day.
 *
 * Calendar days are carried around as plain JS Dates whose LOCAL year/month/day are the business's date
 * ("day carriers"); only the helpers here turn a business date + time into a real moment, or a moment into
 * business date/time parts.
 */

export const DEFAULT_TIME_ZONE = 'America/New_York';

export function validTimeZone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIME_ZONE;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return DEFAULT_TIME_ZONE; }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

/** The business's calendar date and clock time at a moment. `month` is 0-11. */
export function zonedParts(moment: Date | string, tz: string): Parts {
  const date = typeof moment === 'string' ? new Date(moment) : moment;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month') - 1, day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

/** Minutes the zone is ahead of UTC at that moment (Denver in summer: -360). */
function offsetMinutes(moment: number, tz: string) {
  const p = zonedParts(new Date(moment), tz);
  return (Date.UTC(p.year, p.month, p.day, p.hour, p.minute) - Math.floor(moment / 60000) * 60000) / 60000;
}

/** The real moment of a business date + minutes after midnight. */
export function zonedMoment(day: Date, minutes: number, tz: string): Date {
  const wall = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60);
  let guess = wall - offsetMinutes(wall, tz) * 60000;
  // Across a daylight-saving change the offset at the guess can differ; one more pass settles it.
  guess = wall - offsetMinutes(guess, tz) * 60000;
  return new Date(guess);
}

/** The business date of a moment, as a day carrier. */
export function zonedDay(moment: Date | string, tz: string): Date {
  const p = zonedParts(moment, tz);
  return new Date(p.year, p.month, p.day);
}

/** Minutes after midnight, business time. */
export function zonedMinutes(moment: Date | string, tz: string): number {
  const p = zonedParts(moment, tz);
  return p.hour * 60 + p.minute;
}

/** "2:30 PM" in business time. */
export function zonedTimeLabel(moment: Date | string, tz: string): string {
  const date = typeof moment === 'string' ? new Date(moment) : moment;
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

/** Today's business date, as a day carrier. */
export function businessToday(tz: string): Date {
  return zonedDay(new Date(), tz);
}

/** The US zones offered in Settings, plus whatever the business has now. */
export const US_TIME_ZONES: Array<{ value: string; label: string }> = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Phoenix', label: 'Arizona (no daylight saving)' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];

/** A name for a zone: "Mountain" for the listed ones, otherwise the city ("America/Boise" → "Boise"). */
export function timeZoneName(tz: string): string {
  return US_TIME_ZONES.find((zone) => zone.value === tz)?.label ?? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;
}

/** "Sun, Oct 25" in business time. */
export function zonedDateLabel(moment: Date | string, tz: string): string {
  const date = typeof moment === 'string' ? new Date(moment) : moment;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
}
