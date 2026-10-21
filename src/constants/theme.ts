/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import "@/global.css";

import { Platform } from "react-native";

// Napan: ink surfaces, warm coral actions, restrained lavender detail.
// Action fills and text accents are separate so white button text stays legible.
export const Colors = {
  light: {
    text: '#202B3C', background: '#FAF7F3', backgroundElement: '#FFFFFF',
    backgroundSelected: '#EFE7E0', textSecondary: '#616A78', primary: '#AC433D',
    action: '#AC433D', onPrimary: '#FFFFFF', primarySoft: '#FBE8E4', accent: '#71629B',
    vip: '#8E692C', online: '#27775E', border: '#E5DED7', danger: '#B63C46',
  },
  dark: {
    text: '#F5F1EC', background: '#0D1728', backgroundElement: '#172237',
    backgroundSelected: '#23304A', textSecondary: '#AEB6C5', primary: '#F08A80',
    action: '#AA423C', onPrimary: '#FFFFFF', primarySoft: '#35262E', accent: '#BCADDC',
    vip: '#D5B075', online: '#86C4AE', border: '#2A3549', danger: '#F28B94',
  },
} as const;

export const Shape = { control: 14, card: 20, sheet: 26, pill: 999 } as const;
export const Type = { title: 28, section: 20, body: 15, caption: 12 } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** Inter Medium – for headings / titles */
    heading: "Inter_500Medium",
    /** Inter Medium – for main headers */
    headingBlack: "Inter_500Medium",
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
    heading: "Inter_500Medium",
    headingBlack: "Inter_500Medium",
    body: "Inter_400Regular",
    bodyMedium: "Inter_500Medium",
    serif: "serif",
    mono: "monospace",
  },
  web: {
    heading: "Inter_500Medium",
    headingBlack: "Inter_500Medium",
    body: "Inter_400Regular",
    bodyMedium: "Inter_500Medium",
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
