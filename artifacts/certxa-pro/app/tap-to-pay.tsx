// Tap to Pay exists only in the iPhone app (app/tap-to-pay.native.tsx). This is the stand-in for other platforms.
import { Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { HelpTitle } from '@/components/HelpTitle';

export default function TapToPayScreen() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
      <HelpTitle help="tap-to-pay" style={{ color: colors.mutedForeground, textAlign: 'center' }}>Tap to Pay is available in the Certxa Pro iPhone app.</HelpTitle>
    </View>
  );
}
