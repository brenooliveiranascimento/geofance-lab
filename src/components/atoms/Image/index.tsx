import React from 'react';
import { Image as ExpoImage, type ImageProps } from 'expo-image';

export type AppImageProps = ImageProps;

export function Image(props: AppImageProps): React.JSX.Element {
  return <ExpoImage {...props} />;
}
