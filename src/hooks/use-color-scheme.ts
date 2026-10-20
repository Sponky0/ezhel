import { useThemeContext } from '@/contexts/ThemeContext';

export function useColorScheme() {
  const { activeTheme } = useThemeContext();
  return activeTheme;
}
