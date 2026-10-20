/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

export const Colors = {
  light: {
    text: "#0F172A",
    background: "#F8FAFC",
    backgroundElement: "#E2E8F0",
    backgroundSelected: "#CBD5E1",
    textSecondary: "#64748B",
    primary: "#111111",
    vip: "#D97706",
    online: "#10B981",
    border: "#E2E8F0",
  },
  dark: {
    text: "#FFFFFF",
    background: "#0C1014",
    backgroundElement: "#121620",
    backgroundSelected: "#25292E",
    textSecondary: "#A8A8A8",
    primary: "#fdbd19",
    vip: "#F59E0B",
    online: "#45BD62",
    border: "#1C212E",
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** Poppins SemiBold – for headings / titles */
    heading: "Poppins_600SemiBold",
    /** Poppins ExtraBold – for main headers */
    headingBlack: "Poppins_800ExtraBold",
    /** Inter Regular – for body text & chat messages */
    body: "Inter_400Regular",
    /** Inter Medium – for emphasized UI text */
    bodyMedium: "Inter_500Medium",
    /** System serif */
    serif: "ui-serif",
    /** System monospace */
    mono: "ui-monospace",
  },
  default: {
    heading: "Poppins_600SemiBold",
    headingBlack: "Poppins_800ExtraBold",
    body: "Inter_400Regular",
    bodyMedium: "Inter_500Medium",
    serif: "serif",
    mono: "monospace",
  },
  web: {
    heading: "'Poppins', var(--font-display), sans-serif",
    headingBlack: "'Poppins', var(--font-display), sans-serif",
    body: "'Inter', var(--font-display), sans-serif",
    bodyMedium: "'Inter', var(--font-display), sans-serif",
    serif: "var(--font-serif)",
    mono: "var(--font-mono)",
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset =
  Platform.select({
    ios: 120,
    android: 100,
    web: 0,
    default: 100,
  }) ?? 100;
export const MaxContentWidth = 800;
