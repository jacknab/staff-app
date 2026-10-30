// Tap to Pay exists only in the iPhone app (app/tap-to-pay.native.tsx). This is the stand-in for other platforms.
import { Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

export default function TapToPayScreen() {
  const colors = useColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
      <Text style={{ color: colors.mutedForeground, textAlign: 'center' }}>Tap to Pay is available in the Certxa Pro iPhone app.</Text>
    </View>
  );
}
