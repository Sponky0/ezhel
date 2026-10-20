import { useEffect, useState } from 'react';
import { useThemeContext } from '@/contexts/ThemeContext';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const { activeTheme } = useThemeContext();

  if (hasHydrated) {
    return activeTheme;
  }

  return 'light';
}
