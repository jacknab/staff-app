/**
 * Phone numbers typed for a client (owner, 2026-11-20: the same checks as /nail's keypads; rules in lib/usPhone.ts).
 * A keypad refuses a digit that can't lead to a real US number and says why; a complete number must pass usPhoneProblem.
 */
import { exchangeProblem, isValidUsPhonePrefix, usPhoneProblem } from '@/lib/usPhone';

export { isValidUsPhone, isValidUsPhonePrefix, usPhoneProblem } from '@/lib/usPhone';

/** Why adding this digit (the digits so far + the new one) is refused, or null when it's fine. */
export function refusedDigit(next: string): string | null {
  if (isValidUsPhonePrefix(next)) return null;
  if (next.length <= 3) return `No US area code starts with ${next}.`;
  if (next.length === 4) return 'The exchange (the 3 digits after the area code) must start with 2–9.';
  return `${exchangeProblem(next.slice(3, 6)) ?? 'That isn’t a real US phone number'}.`;
}

/** For a typed (not keypad) field: why the number can't be saved, or null. Empty is fine when the phone is optional. */
export function typedPhoneProblem(value: string, optional = true): string | null {
  const d = value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (!d) return optional ? null : 'Enter the client’s mobile number.';
  const problem = usPhoneProblem(d);
  return problem ? `${problem}.` : null;
}
