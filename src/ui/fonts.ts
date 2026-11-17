/** Loads the bundled typefaces. Only the weights used are included in the app. */
import { useFonts } from 'expo-font';
import { Caveat_500Medium } from '@expo-google-fonts/caveat/500Medium';
import { Caveat_700Bold } from '@expo-google-fonts/caveat/700Bold';
import { Fraunces_500Medium } from '@expo-google-fonts/fraunces/500Medium';
import { Fraunces_700Bold } from '@expo-google-fonts/fraunces/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { Lora_400Regular } from '@expo-google-fonts/lora/400Regular';
import { Lora_600SemiBold } from '@expo-google-fonts/lora/600SemiBold';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';

const ASSETS = {
  Caveat_500Medium,
  Caveat_700Bold,
  Fraunces_500Medium,
  Fraunces_700Bold,
  Inter_400Regular,
  Inter_600SemiBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
  Lora_400Regular,
  Lora_600SemiBold,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
};

/** true once the typefaces are ready, or if they could not load (the app then falls back to the system font). */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts(ASSETS);
  return loaded || !!error;
}
