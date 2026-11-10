/**
 * The full-screen alarm (lib/alarm.ts, owner 2026-11-07): what the booking is, the sound on a loop, and two big buttons —
 * Got it (stops it and opens the booking) and Snooze 5 min. Drawn over every screen, like the call screen.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { dismissAlarm, snoozeAlarm, SNOOZE_MINUTES, useAlarm } from '@/lib/alarm';

export function AlarmScreen() {
  const alarm = useAlarm();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!alarm) return;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => { loop.stop(); pulse.setValue(0); };
  }, [alarm, pulse]);
  if (!alarm) return null;

  const gotIt = () => {
    const id = alarm.appointmentId;
    dismissAlarm();
    if (id > 0) router.push(`/appointment/${id}`);
  };
  const ring = { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }], opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }) };
  const icon = alarm.kind === 'house_call_alarm' ? 'car' : 'bell-ring';

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={gotIt}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#2A1B52', '#4A2C7A', '#6B3FA0']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.root, { paddingTop: insets.top + 70, paddingBottom: insets.bottom + 36 }]} testID="alarm-screen">
        <View style={styles.top}>
          <View style={styles.iconWrap}>
            <Animated.View style={[styles.ring, ring]} />
            <View style={styles.icon}><MaterialCommunityIcons name={icon} size={52} color="#FFFFFF" /></View>
          </View>
          <Text style={styles.title} accessibilityRole="header">{alarm.title}</Text>
          <Text style={styles.body}>{alarm.body}</Text>
        </View>
        <View style={styles.buttons}>
          <TouchableOpacity onPress={gotIt} style={[styles.button, styles.primary]} activeOpacity={0.85} accessibilityLabel="Got it" testID="alarm-got-it">
            <Text style={[styles.buttonText, { color: '#2A1B52' }]}>Got it</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void snoozeAlarm()} style={[styles.button, styles.secondary]} activeOpacity={0.85} accessibilityLabel={`Snooze ${SNOOZE_MINUTES} minutes`} testID="alarm-snooze">
            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Snooze {SNOOZE_MINUTES} min</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 28, justifyContent: 'space-between' },
  top: { alignItems: 'center' },
  iconWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 34 },
  ring: { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: '#FFFFFF' },
  icon: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  title: { color: '#FFFFFF', fontSize: 30, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  body: { color: 'rgba(255,255,255,0.86)', fontSize: 20, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 14, lineHeight: 29 },
  buttons: { gap: 14 },
  button: { height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#FFFFFF' },
  secondary: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  buttonText: { fontSize: 21, fontFamily: 'Inter_700Bold' },
});
