import React, { createContext, useContext, useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';

export type ThemeSetting = 'light' | 'dark' | 'system';

interface ThemeContextType {
  themeSetting: ThemeSetting;
  setThemeSetting: (setting: ThemeSetting) => Promise<void>;
  activeTheme: 'light' | 'dark';
  colors: Record<keyof typeof Colors.light, string>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>('dark');
  const systemScheme = useRNColorScheme();

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem('app_theme_setting');
        if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system') {
          setThemeSettingState(savedTheme);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      }
    };
    loadTheme();
  }, []);

  const setThemeSetting = async (setting: ThemeSetting) => {
    try {
      setThemeSettingState(setting);
      await AsyncStorage.setItem('app_theme_setting', setting);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const activeTheme =
    themeSetting === 'system'
      ? systemScheme === 'dark'
        ? 'dark'
        : 'light'
      : themeSetting;

  const colors = Colors[activeTheme];

  return (
    <ThemeContext.Provider value={{ themeSetting, setThemeSetting, activeTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeContext must be used within an AppThemeProvider');
  }
  return context;
}
