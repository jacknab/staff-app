import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

/**
 * "Why we ask" under a personal detail Certxa asks for Stripe (date of birth, home address, EIN, SSN): a tap shows
 * the reason in plain words, a second tap hides it (owner, 2026-11-10).
 */
export function WhyWeAsk({ children, testID }: { children: string; testID?: string }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={styles.link} testID={testID}>
        <Text style={[styles.linkText, { color: colors.foreground }]}>{open ? 'Hide' : 'Why we ask'}</Text>
      </TouchableOpacity>
      {open ? <Text style={[styles.why, { color: colors.mutedForeground }]}>{children}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  linkText: { fontSize: 15, fontFamily: 'Inter_500Medium', textDecorationLine: 'underline' },
  why: { fontSize: 15, lineHeight: 22, fontFamily: 'Inter_400Regular', marginBottom: 4 },
});
