/**
 * The app's Text and TextInput (owner, 2026-11-19: Settings › Language): React Native's, with the words shown in the
 * chosen language (lib/i18n.ts). Every screen imports Text and TextInput from here, not from react-native.
 */
import { Children, type ComponentProps, type ReactNode } from 'react';
import { Text as RNText, TextInput as RNTextInput } from 'react-native';
import { tr, useLang, type AppLang } from '@/lib/i18n';

/** Each string in the children, translated; numbers and elements (a nested Text translates itself) as they are.
 *  `_lang` makes the language an input, so nothing that remembers results keeps the old language's words. */
function trChildren(children: ReactNode, _lang: AppLang): ReactNode {
  if (typeof children === 'string') return trIn(children, _lang);
  if (Array.isArray(children)) {
    // A line built from pieces ("{n} paid visits · {m} appointments still to go"): the whole line first, then each piece.
    if (children.every((c) => typeof c === 'string' || typeof c === 'number')) {
      const whole = children.join('');
      const done = trIn(whole, _lang);
      if (done !== whole) return done;
    }
    return Children.map(children, (c) => (typeof c === 'string' ? trIn(c, _lang) : c));
  }
  return children;
}

const trIn = (s: string, _lang: AppLang) => tr(s);

export function Text(props: ComponentProps<typeof RNText>) {
  const lang = useLang();
  const { children, accessibilityLabel, ...rest } = props;
  return <RNText {...rest} accessibilityLabel={accessibilityLabel ? trIn(accessibilityLabel, lang) : accessibilityLabel}>{trChildren(children, lang)}</RNText>;
}

export function TextInput(props: ComponentProps<typeof RNTextInput>) {
  const lang = useLang();
  const { placeholder, accessibilityLabel, ...rest } = props;
  return <RNTextInput {...rest} placeholder={placeholder ? trIn(placeholder, lang) : placeholder} accessibilityLabel={accessibilityLabel ? trIn(accessibilityLabel, lang) : accessibilityLabel} />;
}
