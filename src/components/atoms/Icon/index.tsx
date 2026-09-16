import React from 'react';
import { IconSymbol } from '@src/components/ui/icon-symbol';
import type { ComponentProps } from 'react';

export type IconProps = ComponentProps<typeof IconSymbol>;

export function Icon(props: IconProps): React.JSX.Element {
  return <IconSymbol {...props} />;
}
