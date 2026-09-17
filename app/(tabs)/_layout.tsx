import { Tabs } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { HapticTab } from '@src/components/ui/haptic-tab';
import { IconSymbol } from '@src/components/ui/icon-symbol';
import { colors } from '@src/theme';

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.tabBar,
        sceneStyle: styles.scene,
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.monitor'),
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="location.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="companies"
        options={{
          title: t('tabs.companies'),
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="building.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('tabs.messages'),
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="bell.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="gearshape.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 0,
    height: 76,
    paddingTop: 8,
  },
  label: { fontSize: 11, fontWeight: '500' },
  scene: { backgroundColor: colors.background },
});
