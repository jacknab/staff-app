/**
 * The tablet POS and the checkout it shows in its right side (owner, 2026-11-19: cash taken as /nail takes it). The POS
 * keypad types the cash the client hands over and ENTER records it on the checkout; the checkout tells the POS what is
 * paid and what is left, which the ticket shows like /nail's cart (Cash −$20.00 · Balance due / Change due / Paid in full).
 * Outside the POS there is no bridge and the checkout works on its own.
 */
import { createContext, useContext } from 'react';

export type PosPayState = {
  /** Cash taken toward the bill so far (part payments; a full cash payment ends the sale). */
  cashCents: number; giftCents: number; creditCents: number;
  /** Still to pay; 0 once paid in full. */
  dueCents: number;
  /** Change to give back after the cash payment that finished the sale. */
  changeCents: number;
  paid: boolean;
  /** The checkout's latest message ("Cash $20.00 taken. $35.00 left to pay.") or error. */
  message: string; error: string;
};

export type PosPayBridge = {
  /** The checkout reports what is paid and what is left. */
  report: (state: PosPayState) => void;
  /** The checkout says what ENTER on the POS keypad does with a typed amount (record it as cash), or null. */
  setCashHandler: (handler: ((cents: number) => void) | null) => void;
};

export const PosPayBridgeContext = createContext<PosPayBridge | null>(null);
export const usePosPayBridge = () => useContext(PosPayBridgeContext);
