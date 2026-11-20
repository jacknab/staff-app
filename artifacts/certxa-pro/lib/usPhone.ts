/**
 * Copied from the Certxa repo (shared/usPhone.ts, the rules /nail and every front-desk keypad use) — keep the two the same
 * (owner, 2026-11-20: Certxa Pro checks phone numbers the same way).
 *
 * US phone-number rules, in one pure place (browser keypads and server alike).
 *
 * A number must be exactly 10 digits: NPA (area code) + NXX (exchange) + 4 line digits.
 *   NPA  — a currently assigned US geographic area code (shared/usAreaCodes.ts). That leaves out, by construction, everything
 *          reserved or special-use: 0/1 first digit, N11 service codes (211…911), 37X / 96X (reserved), toll-free (800, 833,
 *          844, 855, 866, 877, 888), premium (900), personal-number (500, 52X, 533, 544, 566, 577, 588), 555, and codes that
 *          are unassigned, fictitious (123, 000…) or belong to Canada / Caribbean nations.
 *   NXX  — first digit 2–9, not an N11 code, not reserved / fictitious (555, 950, 958, 959), and never the same digit three
 *          times (222, 333 … 999).
 *   The area code can't be one digit repeated either (222, 333, …) — none is a real code, and the list already refuses them.
 *
 * NOT checkable here: whether a given exchange is actually assigned to a carrier in that area code. That needs a live carrier
 * database (NANPA / a lookup service), so structurally valid but unassigned exchanges still pass.
 */
import { US_AREA_CODES } from "./usAreaCodes";

/** Exchanges that are reserved for network use / test / fictitious numbers in every area code. */
const RESERVED_EXCHANGES: ReadonlySet<string> = new Set(["555", "950", "958", "959"]);
const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

// Every 1- and 2-digit start of an assigned area code, so a keypad can refuse the digit that makes a real code impossible.
const AREA_STARTS = new Set<string>();
for (const c of US_AREA_CODES) { AREA_STARTS.add(c.slice(0, 1)); AREA_STARTS.add(c.slice(0, 2)); }

const repeated = (s: string) => /^(\d)\1+$/.test(s);
const isN11 = (s: string) => s[1] === "1" && s[2] === "1";

export const isAssignedUsAreaCode = (code: string): boolean => US_AREA_CODES.has(code);

/** Why this 3-digit exchange can't be a real one, or null. */
export function exchangeProblem(nxx: string): string | null {
  if (!/^\d{3}$/.test(nxx)) return "Enter the 3-digit exchange";
  if (!/[2-9]/.test(nxx[0])) return "The exchange must start with 2–9";
  if (isN11(nxx)) return "That exchange is a reserved service code";
  if (RESERVED_EXCHANGES.has(nxx)) return "That exchange is reserved (not a real number range)";
  if (repeated(nxx)) return "That exchange isn't valid (one digit repeated)";
  return null;
}

/** Why a COMPLETE number can't be a real US number, or null when it passes every rule. */
export function usPhoneProblem(digits: string): string | null {
  if (!/^\d+$/.test(digits)) return "Numbers only";
  if (digits.length !== 10) return "Enter all 10 digits";
  const npa = digits.slice(0, 3);
  if (TOLL_FREE.has(npa)) return "Toll-free numbers can't be used";
  if (repeated(npa)) return "That area code isn't valid (one digit repeated)";
  if (!isAssignedUsAreaCode(npa)) return "That isn't an assigned US area code";
  return exchangeProblem(digits.slice(3, 6));
}

export const isValidUsPhone = (digits: string): boolean => usPhoneProblem(digits) === null;

/**
 * Safe to call after every keystroke on a digit-by-digit keypad: is what has been typed so far (0–10 digits) still the start of a
 * possible US number? False the instant a digit makes that impossible (no assigned area code begins that way, an exchange that
 * starts 0/1 or is reserved / N11 / one repeated digit), so the keypad can refuse just that digit and keep the rest.
 */
export function isValidUsPhonePrefix(digits: string): boolean {
  if (!/^\d{0,10}$/.test(digits)) return false;
  const n = digits.length;
  if (n >= 1 && !/[2-9]/.test(digits[0])) return false;
  if (n === 1 || n === 2) return AREA_STARTS.has(digits);
  if (n >= 3 && !isAssignedUsAreaCode(digits.slice(0, 3))) return false;
  if (n >= 4 && !/[2-9]/.test(digits[3])) return false;
  if (n >= 6 && exchangeProblem(digits.slice(3, 6)) !== null) return false;
  return true;
}
