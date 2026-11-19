/** An intro icon (lib/tabletIntro.ts IntroIcon): Feather, or Material Community Icons for the few Feather lacks. */
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { IntroIcon as Icon } from '@/lib/tabletIntro';

export function IntroIcon({ icon, size, color }: { icon: Icon; size: number; color: string }) {
  return typeof icon === 'string'
    ? <Feather name={icon} size={size} color={color} />
    : <MaterialCommunityIcons name={icon.mci} size={Math.round(size * 1.15)} color={color} />;
}
