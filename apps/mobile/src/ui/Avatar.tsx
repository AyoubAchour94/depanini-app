import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme';

import { Text } from './Text';

interface AvatarProps {
  /** The person's name; the initials and the background colour come from it. */
  name: string;
  size?: number;
}

/** Up to two initials: "Sami B." gives "SB", "Nizar" gives "N". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function hash(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** A round initials avatar. The colour is stable for a name, picked from the theme's palette. */
export function Avatar({ name, size = 48 }: AvatarProps) {
  const t = useTheme();
  const background = t.color.avatars[hash(name) % t.color.avatars.length];
  return (
    <View
      accessible
      accessibilityLabel={name}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
    >
      <Text
        variant="bodyStrong"
        style={{
          color: t.color.onAvatar,
          fontSize: Math.round(size / 3),
          lineHeight: Math.round(size / 3) + 4,
        }}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
});
