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
// 2026-11-09 (owner): navy-indigo text, lavender page and soft violet borders from the More design (components/look).
const colors = {
  light: {
    text: '#1C1650',
    tint: '#7C3AED',
    background: '#F4F0FE',
    foreground: '#1C1650',
    card: '#FFFFFF',
    cardForeground: '#1C1650',
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
    border: '#ECE6F9',
    input: '#E4DCF6',
  },
  radius: 16,
};

export default colors;
