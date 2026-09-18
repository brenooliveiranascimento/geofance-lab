import React, { type PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors } from '@src/theme';

export interface ScreenTemplateProps extends PropsWithChildren {
  underTabBar?: boolean;
}

const FULL: Edge[] = ['top', 'bottom', 'left', 'right'];
const ABOVE_TAB_BAR: Edge[] = ['top', 'left', 'right'];

export function ScreenTemplate({
  children,
  underTabBar = false,
}: ScreenTemplateProps): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container} edges={underTabBar ? ABOVE_TAB_BAR : FULL}>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
});
