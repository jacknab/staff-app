/**
 * Turning the screen (owner, 2026-11-19): tablets rotate with the device; phones stay upright, as the app always was.
 * app.json allows every orientation, and phones are locked to portrait here. expo-screen-orientation is native code
 * added in Build Nov 19 · G: older installed builds don't have it, so it is loaded carefully and they just stay upright.
 */
import { Dimensions } from 'react-native';

export function setScreenTurning() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ScreenOrientation = require('expo-screen-orientation') as typeof import('expo-screen-orientation');
    const { width, height } = Dimensions.get('screen');
    const tablet = Math.min(width, height) >= 600; // the same test as components/TabletLauncher.tsx useIsTablet
    if (tablet) void ScreenOrientation.unlockAsync().catch(() => undefined);
    else void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  } catch {
    // A build without expo-screen-orientation: its screen is fixed upright by that build's own settings.
  }
}
