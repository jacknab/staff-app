/**
 * Alert.alert in the browser build (pro.certxa.com; owner 2026-11-18, pre-errors 2026-11-05): react-native-web's
 * Alert.alert does nothing, so every "Remove…?" / "Delete…?" confirmation in the app silently did nothing there.
 * On the web only, it is answered with the browser's own boxes: one button → a message; a "cancel" button and one
 * other → OK/Cancel; more choices → a numbered list to type the number of. The iPhone app is unchanged.
 */
import { Platform, type AlertButton } from 'react-native';
import { Alert } from '@/lib/appAlert';

export function installWebAlert(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const list = buttons && buttons.length ? buttons : [{ text: 'OK' }];
    const cancel = list.find((b) => b.style === 'cancel');
    const actions = list.filter((b) => b !== cancel);
    if (actions.length <= 1) {
      if (!cancel) { window.alert(text); actions[0]?.onPress?.(); return; }
      if (window.confirm(actions[0] ? `${text}\n\n${actions[0].text ?? 'OK'}?` : text)) actions[0]?.onPress?.(); else cancel.onPress?.();
      return;
    }
    const answer = window.prompt(`${text}\n\n${actions.map((b, i) => `${i + 1}. ${b.text ?? ''}`).join('\n')}\n\nType a number${cancel ? `, or leave it empty for “${cancel.text ?? 'Cancel'}”` : ''}:`);
    const picked = actions[Number(answer) - 1];
    if (picked) picked.onPress?.(); else cancel?.onPress?.();
  };
}
