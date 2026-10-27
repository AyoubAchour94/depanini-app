// Only the weights in use are imported, from their own entry points: the
// package index would pull every file of the family into the bundle.
import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_500Medium } from '@expo-google-fonts/ibm-plex-sans-arabic/500Medium';
import { IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold';
import { IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic/700Bold';
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

/** Keys match `arabicFontFamily` in tokens.ts. The family has no 800, so extra bold uses 700. */
export const ARABIC_FONTS = {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
};

/**
 * Loads Inter and IBM Plex Sans Arabic (used for all text in Arabic). `ready`
 * turns true when the fonts are loaded or failed to load, so a font problem
 * never keeps the splash screen up forever.
 */
export function useAppFonts(): { ready: boolean; error: Error | null } {
  const [loaded, error] = useFonts({ ...INTER_FONTS, ...ARABIC_FONTS });
  return { ready: loaded || error !== null, error };
}
