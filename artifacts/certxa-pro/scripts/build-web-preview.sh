#!/bin/bash
# Builds Certxa Pro for the browser and puts it live at https://pro.certxa.com (owner, 2026-10-31).
# The card reader is replaced by the Expo Go stand-in (metro.config.js), so the browser can't take card payments.
# The server's security rules refuse any address containing "vendor/", which is where the icon fonts are, so
# that folder is renamed in the build.
set -e
OUT="${1:-/apps/CM/artifacts/api-server/dist/pro-web}"
TMP="$(mktemp -d)"
cd "$(dirname "$0")/.."
export PATH=/root/.nvm/versions/node/v22.22.3/bin:$PATH
EXPO_PUBLIC_EXPO_GO_PREVIEW=1 npx expo export --platform web --output-dir "$TMP/web"
find "$TMP/web/assets" -depth -type d -name vendor -execdir mv vendor vndr \;
grep -rl "/vendor/" "$TMP/web/_expo" | xargs -r sed -i 's#/build/vendor/#/build/vndr/#g'
mkdir -p "$OUT"
rsync -a --delete "$TMP/web/" "$OUT/"
rm -rf "$TMP"
echo "Live at https://pro.certxa.com"
