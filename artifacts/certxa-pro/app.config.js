/**
 * Built on app.json (owner, 2026-11-19: Android calls and pushes).
 *  - Android's Firebase file (google-services.json, from the Certxa Firebase project) is used once it is in this folder.
 *    Without it Android has no pushes and no Business Phone calls, and the build still works.
 *  - extra.androidCalling tells the app (lib/voice.ts) whether Business Phone calls can ring on this Android build.
 *  - Android delivers Firebase messages to one receiver only: expo-notifications' and Twilio Voice's own are removed, and
 *    modules/certxa-push's receiver hands calls to Twilio and everything else to expo-notifications.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest } = require('expo/config-plugins');

const GOOGLE_SERVICES = './google-services.json';
const REMOVED_RECEIVERS = [
  'expo.modules.notifications.service.ExpoFirebaseMessagingService',
  'com.twiliovoicereactnative.VoiceFirebaseMessagingService',
];

function withOneFirebaseReceiver(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = { ...manifest.$, 'xmlns:tools': 'http://schemas.android.com/tools' };
    const app = manifest.application[0];
    app.service = (app.service ?? []).filter((s) => !REMOVED_RECEIVERS.includes(s.$['android:name']));
    for (const name of REMOVED_RECEIVERS) app.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    return cfg;
  });
}

module.exports = ({ config }) => {
  const hasFirebase = fs.existsSync(path.join(__dirname, GOOGLE_SERVICES));
  const next = {
    ...config,
    android: { ...config.android, ...(hasFirebase ? { googleServicesFile: GOOGLE_SERVICES } : {}) },
    extra: { ...config.extra, androidCalling: hasFirebase },
  };
  return withOneFirebaseReceiver(next);
};
