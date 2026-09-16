// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  'chevron.right': 'chevron-right',
  'arrow.clockwise': 'refresh',
  'globe': 'language',
  'doc.text': 'description',
  'checkmark': 'check',
  'envelope': 'mail',
  'gearshape.fill': 'settings',
  // Geofencing
  'location.fill': 'my-location',
  'location.circle.fill': 'gps-fixed',
  'mappin.circle.fill': 'place',
  'map.fill': 'map',
  'list.bullet': 'list',
  'play.circle.fill': 'play-circle-filled',
  // Messaging and maintenance
  'bell.fill': 'notifications',
  'trash': 'delete',
  'wrench.and.screwdriver': 'build',
  'battery.25': 'battery-alert',
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
