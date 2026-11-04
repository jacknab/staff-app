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
import { prepareVoice, registerBusinessPhone } from '@/lib/voice';
import { CallScreen } from '@/components/CallScreen';
import { HelpHost } from '@/components/HelpTitle';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { CertxaTerminalProvider } from '@/components/CertxaTerminalProvider';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();
// Business Phone: iOS hands incoming-call pushes to the Twilio SDK only if it is ready on every launch.
void prepareVoice();

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
    void registerBusinessPhone();
    return onBookingPush((data, tapped) => {
      void refresh();
      if (!tapped) return;
      // A booking request opens that request; a new review opens Reviews (to read and reply); anything else the calendar.
      if (data.type === 'booking_request' && Number(data.requestId) > 0) router.push({ pathname: '/request/[id]', params: { id: String(data.requestId) } });
      else if (data.type === 'house_call_alarm' && Number(data.appointmentId) > 0) router.push(`/appointment/${Number(data.appointmentId)}`);
      else if (data.type === 'review') router.push('/reviews');
      else if (data.type === 'waitlist') router.push('/waitlist');
      // Plus: a missed call opens the client's profile (its phone button calls back); a text opens it in Messages.
      else if (data.type === 'plus_call' && Number((data as { clientId?: number }).clientId) > 0) router.push({ pathname: '/client/[id]', params: { id: String((data as { clientId?: number }).clientId) } });
      else if (data.type === 'plus_text') router.push({ pathname: '/messages', params: { phone: String((data as { phone?: string }).phone ?? ''), name: String((data as { name?: string }).name ?? '') } });
      // Plus started or ended: More shows the plan cards as they now apply.
      else if (data.type === 'plan') router.push('/more');
      else if (data.type === 'shop') router.push((data as { to?: string }).to === 'packages' ? '/packages' : '/gift-cards');
      else if (data.type === 'business_phone') router.push((data as { tab?: string }).tab === 'texts' ? '/phone-texts' : '/phone');
      else router.push('/calendar');
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
      <Stack.Screen name="client/[id]" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="ai" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="reviews" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="services" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="notifications" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="tap-to-pay" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="payments-intro" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="credits" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="money" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="block-time" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="messages" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="gift-cards" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="waitlist" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="packages" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="phone" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="phone-texts" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="import-contacts" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="portfolio" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="campaigns" options={{ headerShown: false, presentation: 'card' }} />
      <Stack.Screen name="notes" options={{ headerShown: false, presentation: 'card' }} />
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
      <Stack.Screen name="about-me" options={{ headerShown: false, presentation: 'card' }} />
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
                    {/* After the screens, so the "return to call" bar sits on top of them. */}
                    <CallScreen />
                    {/* Page help: opens when a page's title is held (components/HelpTitle). */}
                    <HelpHost />
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
