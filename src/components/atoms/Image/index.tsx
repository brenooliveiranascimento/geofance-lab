import React from 'react';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

/** Thin alias so callers depend on the atom, not on expo-image directly. */
export type AppImageProps = ImageProps;

export function Image(props: AppImageProps): React.JSX.Element {
  return <ExpoImage {...props} />;
}
