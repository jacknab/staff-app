/**
 * The tablet's intro panel (owner's tablet mock-ups, 2026-11-20): beside a one-column screen, its intro in place of the
 * plain help page (components/TabletFrame.tsx). Keyed by the same id as the screen's help page (lib/help.ts), whose
 * title it shows. A screen without an entry here shows its help page instead.
 */
import type { Feather } from '@expo/vector-icons';

export type TabletIntro = {
  intro: string;
  /** Icon tile, heading and a line or two each. */
  cards: { icon: keyof typeof Feather.glyphMap; title: string; text: string }[];
  /** "Popular examples" chips. */
  examples?: string[];
};

export const TABLET_INTRO: Record<string, TabletIntro> = {
  packages: {
    intro: 'Prepaid visits clients buy on your booking site, like 6 services for $150 or a monthly wellness package.',
    cards: [
      { icon: 'gift', title: 'What is a package?', text: 'A bundle of the same service or a group of services sold at a special price.' },
      { icon: 'settings', title: 'How it works', text: 'Create a package, set the price, number of visits, and description, then publish it to your booking site.' },
      { icon: 'shopping-cart', title: 'Client experience', text: 'Clients can purchase a package online, and their visits automatically track in their account.' },
    ],
    examples: ['6 Services Package', '10-Visit Package', 'Monthly Membership', 'Wellness Package'],
  },
};
