/**
 * Application Icon names from `@expo/vector-icons/Ionicons`.
 * Mapped for easy access and typing in the application.
 */
export const AppIcons = {
  chat: "chatbubbles-outline",
  explore: "compass-outline",
  vip: "diamond-outline",
  randomMatch: "dice-outline",
  hot: "flame-outline",
  boost: "flash-outline",
  gift: "gift-outline",
  like: "heart-outline",
  unlimited: "infinite-outline",
  male: "male-outline",
  female: "female-outline",
  fun: "beer-outline",
} as const;

export type AppIconKey = keyof typeof AppIcons;
export type AppIconName = (typeof AppIcons)[AppIconKey];
