---
name: Expo DevTools runtime
description: Optional React Native DevTools helper may need desktop libraries in Replit.
---

The Expo web preview can start and bundle successfully even when the optional React Native DevTools helper reports missing desktop shared libraries.

**Why:** The helper is separate from Metro and the browser preview; chasing its full native desktop dependency chain adds setup cost without improving web preview availability.

**How to apply:** Treat Metro bundling and the preview screenshot as the setup signal. Only add more desktop libraries or troubleshoot the helper if native debugging is specifically required.