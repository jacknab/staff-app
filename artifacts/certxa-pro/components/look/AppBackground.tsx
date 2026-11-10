import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { look } from './tokens';

/** The page behind a screen: lavender fading down, with two pale curves across the top right. */
export function AppBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[look.pageTop, look.pageBottom]} locations={[0, 0.45]} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height={300} viewBox="0 0 390 300" preserveAspectRatio="xMaxYMin slice" style={styles.shapes}>
        <Path d="M150 0 C 230 70, 330 60, 390 150 L 390 0 Z" fill="#FFFFFF" fillOpacity={0.55} />
        <Path d="M250 0 C 300 40, 350 30, 390 70 L 390 0 Z" fill="#FFFFFF" fillOpacity={0.5} />
        <Path d="M0 120 C 90 70, 170 110, 260 40" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={28} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ shapes: { position: 'absolute', top: 0, right: 0 } });
