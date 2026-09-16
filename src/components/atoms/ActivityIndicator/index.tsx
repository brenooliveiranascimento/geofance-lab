import React from 'react';
import { ActivityIndicator as RNActivityIndicator, type ActivityIndicatorProps } from 'react-native';
import { colors } from '@src/theme';

export function ActivityIndicator({ color = colors.primary, ...props }: ActivityIndicatorProps): React.JSX.Element {
  return <RNActivityIndicator color={color} {...props} />;
}
