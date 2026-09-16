import React from 'react';

import { PlacesView } from './PlacesView';
import { usePlacesViewModel } from './usePlacesViewModel';

export function PlacesScreen(): React.JSX.Element {
  const viewModel = usePlacesViewModel();
  return <PlacesView viewModel={viewModel} />;
}
