---
name: Expo web and Stripe Terminal
description: Known Expo web bundling constraint for the native Stripe Terminal dependency.
---

The Expo web bundle can resolve the native checkout route far enough to load `@stripe/stripe-terminal-react-native`, whose logger imports a package manifest that is not present at the expected pnpm path. This produces a blank web preview even when the app typechecks. The development Metro config now aliases that package to a local Expo Go mock; EAS builds do not set the alias and retain the native package.

**Why:** The native Stripe Terminal package is intended for device builds, but Expo web route discovery may still traverse the native checkout module during bundling.

**How to apply:** Keep the Stripe Terminal import behind a web-safe platform boundary or development alias before relying on Expo Go or the browser preview. Verify EAS builds without the development alias so native reader payments remain enabled.