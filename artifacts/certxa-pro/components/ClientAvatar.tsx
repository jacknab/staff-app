/**
 * A client's picture, or their initials without one (owner, 2026-11-04): tapping it opens their profile, on every screen.
 * Inside a row it takes the tap for itself, so the row can still choose the client. No link for a visit whose client
 * record is gone (id 0) or a client not saved yet.
 */
import { Image, Text, TouchableOpacity, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';

export function ClientAvatar({ clientId, avatarUrl, initials, style, textStyle, onOpen, testID }: {
  clientId?: number | null; avatarUrl?: string | null; initials: string; style: StyleProp<ViewStyle>; textStyle: StyleProp<TextStyle>;
  /** Instead of going straight to the profile (the call screen minimizes the call first). */
  onOpen?: () => void; testID?: string;
}) {
  const router = useRouter();
  const content = avatarUrl
    ? <Image source={{ uri: avatarUrl }} style={[{ width: '100%', height: '100%' }]} />
    : <Text style={textStyle}>{initials}</Text>;
  const box: StyleProp<ViewStyle> = [style, { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }];
  if (!Number(clientId) && !onOpen) return <View style={box}>{content}</View>;
  return (
    <TouchableOpacity testID={testID} accessibilityRole="link" accessibilityLabel="Open client profile" style={box}
      onPress={onOpen ?? (() => router.push({ pathname: '/client/[id]', params: { id: String(clientId) } }))}>
      {content}
    </TouchableOpacity>
  );
}
