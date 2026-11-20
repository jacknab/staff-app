/** Shows "You currently do not have any SMS credits…" with OK when a text wasn't sent for want of credits (lib/smsCreditNotice.ts). Once, in app/_layout.tsx. */
import { useEffect } from 'react';
import { Alert } from '@/lib/appAlert';
import { noCreditsMessage, onNoSmsCredits, whatWasSent } from '@/lib/smsCreditNotice';

export function SmsCreditNoticeHost() {
  useEffect(() => onNoSmsCredits(({ phone, messageType }) => {
    Alert.alert('Text message', noCreditsMessage(whatWasSent(messageType), phone), [{ text: 'OK' }]);
  }), []);
  return null;
}
