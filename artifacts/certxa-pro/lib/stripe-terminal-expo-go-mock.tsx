import type { ReactNode } from 'react';

export function StripeTerminalProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useStripeTerminal() {
  return {
    initialize: async () => ({}),
    discoverReaders: async (..._args: unknown[]) => ({}),
    connectReader: async (..._args: unknown[]) => ({}),
    disconnectReader: async () => ({}),
    retrievePaymentIntent: async (clientSecret: string) => ({
      paymentIntent: { id: clientSecret },
    }),
    collectPaymentMethod: async ({ paymentIntent }: { paymentIntent: unknown }) => ({
      paymentIntent,
    }),
    processPaymentIntent: async ({ paymentIntent }: { paymentIntent: unknown }) => ({
      paymentIntent,
    }),
    connectedReader: null,
    discoveredReaders: [],
    loading: false,
  };
}