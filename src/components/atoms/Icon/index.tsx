import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React from 'react';
import type { OpaqueColorValue, StyleProp, TextStyle } from 'react-native';

const GLYPHS = {
  'bell.fill': 'notifications',
  'building.2.fill': 'business',
  'gearshape.fill': 'settings',
  'location.circle.fill': 'gps-fixed',
  'location.fill': 'my-location',
  'map.fill': 'map',
  'mappin.and.ellipse': 'add-location-alt',
} as const;

export type IconName = keyof typeof GLYPHS;

export interface IconProps {
  name: IconName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 24, color, style }: IconProps): React.JSX.Element {
  return <MaterialIcons name={GLYPHS[name]} size={size} color={color} style={style} />;
}
