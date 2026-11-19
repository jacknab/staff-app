/**
 * React Native's Alert with its title, message and buttons in the chosen language (lib/i18n.ts; owner, 2026-11-19).
 * Every screen imports Alert from here, not from react-native.
 */
import { Alert as RNAlert, type AlertButton, type AlertOptions } from 'react-native';
import { tr } from '@/lib/i18n';

export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
    RNAlert.alert(tr(title), message ? tr(message) : message, buttons?.map((b) => ({ ...b, text: b.text ? tr(b.text) : b.text })), options);
  },
  prompt: RNAlert.prompt,
};
