/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

// Certxa Payments look (owner, 2026-11-03): deep navy text, violet primary, lavender-white background, Stripe-indigo
// accent. Replaced the earlier teal/green palette.
const colors = {
  light: {
    text: '#11152E',
    tint: '#7C3AED',
    background: '#F7F5FD',
    foreground: '#11152E',
    card: '#FFFFFF',
    cardForeground: '#11152E',
    primary: '#7C3AED',
    primaryForeground: '#FFFFFF',
    secondary: '#F0EAFE',
    secondaryForeground: '#6D28D9',
    muted: '#F1EFF7',
    mutedForeground: '#6B6F86',
    accent: '#EEEDFF',
    accentForeground: '#4F46E5',
    destructive: '#D92D20',
    destructiveForeground: '#FFFFFF',
    border: '#E6E2F1',
    input: '#E6E2F1',
  },
  radius: 16,
};

export default colors;
