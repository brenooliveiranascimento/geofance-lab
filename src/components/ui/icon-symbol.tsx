import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight, SymbolViewProps } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type IconMapping = Record<SymbolViewProps['name'], ComponentProps<typeof MaterialIcons>['name']>;
export type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  'chevron.right': 'chevron-right',
  'arrow.clockwise': 'refresh',
  'globe': 'language',
  'doc.text': 'description',
  'checkmark': 'check',
  'envelope': 'mail',
  'gearshape.fill': 'settings',
  'location.fill': 'my-location',
  'location.circle.fill': 'gps-fixed',
  'mappin.circle.fill': 'place',
  'map.fill': 'map',
  'list.bullet': 'list',
  'play.circle.fill': 'play-circle-filled',
  'bell.fill': 'notifications',
  'trash': 'delete',
  'wrench.and.screwdriver': 'build',
  'battery.25': 'battery-alert',
  'mappin.and.ellipse': 'add-location-alt',
  'building.2.fill': 'business',
  'square.on.square': 'layers',
  'arrow.uturn.backward': 'undo',
} as IconMapping;

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
