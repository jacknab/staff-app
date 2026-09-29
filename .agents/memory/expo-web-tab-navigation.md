---
name: Expo web tab navigation
description: Expo Router tab navigation behavior in the browser preview.
---

The current app should use the classic `Tabs` implementation instead of the native liquid-glass tab implementation on all platforms until the native label behavior is explicitly validated.

**Why:** The native tab label component can render raw label text through a web view hierarchy, producing the runtime warning “Unexpected text node” even though the route bundle succeeds.

**How to apply:** Keep the classic tab layout as the active implementation. Reintroduce native tabs only after validating the full route tree on both Expo web and device previews.