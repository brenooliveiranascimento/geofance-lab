import React from 'react';

import { PlaceEditorView } from './PlaceEditorView';
import { usePlaceEditorViewModel } from './usePlaceEditorViewModel';

export function PlaceEditorScreen(): React.JSX.Element {
  const viewModel = usePlaceEditorViewModel();
  return <PlaceEditorView viewModel={viewModel} />;
}
