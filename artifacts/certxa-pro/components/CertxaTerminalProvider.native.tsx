import type { ReactNode } from 'react';
import { StripeTerminalProvider } from '@stripe/stripe-terminal-react-native';
import { createTerminalConnectionToken, getStoredToken } from '@/lib/certxa-api';

async function fetchConnectionToken() {
  const token = await getStoredToken();
  if (!token) throw new Error('Sign in to Certxa before connecting Stripe Terminal.');
  const response = await createTerminalConnectionToken(token);
  return response.secret;
}

export function CertxaTerminalProvider({ children }: { children: ReactNode }) {
  return (
    <StripeTerminalProvider tokenProvider={fetchConnectionToken} logLevel="error">
      <>{children}</>
    </StripeTerminalProvider>
  );
}