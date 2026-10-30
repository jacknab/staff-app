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
import { BookingProvider, useBookingData } from '@/contexts/BookingContext';
import { onBookingPush, registerForBookingPushes } from '@/lib/push';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CertxaTerminalProvider } from '@/components/CertxaTerminalProvider';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

/**
 * Booking push notifications: registers this phone once signed in, reloads the calendar when a
 * notification arrives, and opens the calendar when one is tapped.
 */
function PushBridge() {
  const { isAuthenticated } = useAuth();
  const { refresh } = useBookingData();
  const router = useRouter();
  useEffect(() => {
    if (!isAuthenticated) return;
    void registerForBookingPushes();
    return onBookingPush((data, tapped) => {
      void refresh();
      if (!tapped) return;
      // A booking request opens that request; anything else opens the calendar.
      if (data.type === 'booking_request' && Number(data.requestId) > 0) router.push({ pathname: '/request/[id]', params: { id: String(data.requestId) } });
      else router.push('/(tabs)');
    });
  }, [isAuthenticated, refresh, router]);
  return null;
}

function RootLayoutNav() {
  const { isLoading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    // Signed-out screens: sign in, and create an account.
    const isLoginRoute = pathname === '/login' || pathname === '/signup';
    if (!isAuthenticated && !isLoginRoute) router.replace('/login');
    if (isAuthenticated && isLoginRoute) router.replace('/(tabs)');
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading) return null;
  if (!isAuthenticated && pathname !== '/login' && pathname !== '/signup') return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerBackTitle: 'Back' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="booking" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="appointment/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="ai" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="reviews" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="services" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="catalog/index" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="catalog/categories" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="catalog/addons" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="catalog/packages" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="catalog/deals" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="catalog/products" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="get-paid" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="website-setup" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="requests" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="request/[id]" options={{ headerShown: false, presentation: 'card' }} />
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
                    <PushBridge />
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
