import React from 'react';
import AppTabs from '@/components/app-tabs';

// Uygulama ilk açıldığında "Keşfet" (index) sekmesi açılsın.
// Sekme görsel sırası app-tabs.tsx'teki bildirim sırasına göre korunur.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function TabLayout() {
  return <AppTabs />;
}
