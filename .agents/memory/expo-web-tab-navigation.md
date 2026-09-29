---
name: Expo web tab navigation
description: Expo Router tab navigation behavior in the browser preview.
---

Expo web should use the classic `Tabs` implementation instead of the native liquid-glass tab implementation.

**Why:** The native tab label component can render raw label text through a web view hierarchy, producing the runtime warning “Unexpected text node” even though the route bundle succeeds.

**How to apply:** Gate native tabs behind `Platform.OS !== 'web'`; keep native tabs enabled for supported device builds.