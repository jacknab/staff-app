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

const colors = {
  light: {
    text: '#20241F',
    tint: '#285747',
    background: '#F6F6F1',
    foreground: '#20241F',
    card: '#FFFFFF',
    cardForeground: '#20241F',
    primary: '#285747',
    primaryForeground: '#FFFFFF',
    secondary: '#EAF0EB',
    secondaryForeground: '#285747',
    muted: '#EEEFEA',
    mutedForeground: '#777F79',
    accent: '#F0E9DD',
    accentForeground: '#725B37',
    destructive: '#B84B42',
    destructiveForeground: '#FFFFFF',
    border: '#E5E7E1',
    input: '#E5E7E1',
  },
  radius: 16,
};

export default colors;
