import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Redirect, Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { BookingProvider } from '@/contexts/BookingContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CertxaTerminalProvider } from '@/components/CertxaTerminalProvider';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const isLoginRoute = pathname === '/login';
    if (!isAuthenticated && !isLoginRoute) router.replace('/login');
    if (isAuthenticated && isLoginRoute) router.replace('/(tabs)');
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) return null;
  if (!isAuthenticated && pathname !== '/login') return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="booking" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="appointment/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="ai" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <CertxaTerminalProvider>
              <BookingProvider>
                <GestureHandlerRootView>
                  <KeyboardProvider>
                    <RootLayoutNav />
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </BookingProvider>
            </CertxaTerminalProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
