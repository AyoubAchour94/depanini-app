// Only the five weights in use are imported, from their own entry points: the
// package index would pull all 18 Inter files into the bundle.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { useFonts } from 'expo-font';

/** Keys match `fontFamily` in tokens.ts. Works on native and on web (a generated @font-face). */
export const INTER_FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
};

/**
 * Loads Inter. `ready` turns true when the fonts are loaded or failed to
 * load, so a font problem never keeps the splash screen up forever.
 */
export function useInterFonts(): { ready: boolean; error: Error | null } {
  const [loaded, error] = useFonts(INTER_FONTS);
  return { ready: loaded || error !== null, error };
}
