#!/usr/bin/env bash
# Publish a JS-only change to installed Certxa Pro apps (EAS Update, owner 2026-11-04).
#   scripts/ota-update.sh "what changed"            → channel preview-dev (the builds made with --profile preview-dev)
#   CHANNEL=preview scripts/ota-update.sh "…"        → preview builds
#   CHANNEL=production scripts/ota-update.sh "…"     → App Store / TestFlight builds
# An update reaches only builds with the same app.json "version" (runtimeVersion policy appVersion). Whenever native
# code or a native package changes, bump "version" and make a new build instead: JS that expects native code an older
# build lacks would crash it. Bump BUILD_LABEL in app/(tabs)/checkout.native.tsx so the update can be seen on the phone.
# Installed apps download it in the background and use it from the next launch.
set -euo pipefail
cd "$(dirname "$0")/.."
MESSAGE="${1:?Usage: scripts/ota-update.sh \"what changed\"}"
CHANNEL="${CHANNEL:-preview-dev}"
# eas update does not apply eas.json's build env, so it is set here to match the channel's builds. preview-dev builds
# are signed with a development profile, so their calls wake the phone through Apple's development push service.
export EXPO_PUBLIC_API_BASE_URL="https://certxa.com"
if [ "$CHANNEL" = "preview-dev" ]; then export EXPO_PUBLIC_APNS_ENV=development; else export EXPO_PUBLIC_APNS_ENV=production; fi
# EAS requires --environment here. It names which of the project's EAS variables to load; the two above are in this shell.
if [ "$CHANNEL" = "production" ]; then ENVIRONMENT=production; else ENVIRONMENT=preview; fi
# iOS only: the app ships on iPhone, and the other platforms' bundles fail on the Stripe Terminal package.
npx eas-cli@latest update --channel "$CHANNEL" --message "$MESSAGE" --environment "$ENVIRONMENT" --platform ios --non-interactive
