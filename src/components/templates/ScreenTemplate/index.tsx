import React, { type PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '@src/theme';

export interface ScreenTemplateProps extends PropsWithChildren {
  scrollable?: boolean;
}

export function ScreenTemplate({
  children,
  scrollable = false,
}: ScreenTemplateProps): React.JSX.Element {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {scrollable ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.scrollContent}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.flex}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
});
