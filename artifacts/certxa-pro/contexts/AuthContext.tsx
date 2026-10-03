import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clearSession,
  getStoredToken,
  getStoredUser,
  login as loginWithCertxa,
  storeSession,
  type CertxaUser,
} from '@/lib/certxa-api';
import { unregisterBookingPushes } from '@/lib/push';

type AuthContextValue = {
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  user: CertxaUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CertxaUser | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getStoredToken(), getStoredUser()])
      .then(([storedToken, storedUser]) => {
        if (!mounted) return;
        setToken(storedToken);
        setUser(storedUser);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isAuthenticated: Boolean(token),
    token,
    user,
    login: async (email, password) => {
      const session = await loginWithCertxa(email.trim(), password);
      await storeSession(session);
      setToken(session.token);
      setUser(session.user);
    },
    logout: async () => {
      // Stop this phone getting the account's booking notifications before the session goes.
      await unregisterBookingPushes(token);
      await clearSession();
      setToken(null);
      setUser(null);
    },
  }), [isLoading, token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}