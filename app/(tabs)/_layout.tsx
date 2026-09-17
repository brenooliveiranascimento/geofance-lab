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
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: true,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
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
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="mappin.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: t('tabs.events'),
          tabBarIcon: ({ color }) => <IconSymbol size={22} name="list.bullet" color={color} />,
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
    height: 78,
    paddingTop: 8,
    paddingBottom: 6,
  },
  tabBarItem: { paddingVertical: 2 },
  tabBarLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
