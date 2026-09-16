import React from 'react';

import { DiagnosticsView } from './DiagnosticsView';
import { useDiagnosticsViewModel } from './useDiagnosticsViewModel';

export function DiagnosticsScreen(): React.JSX.Element {
  const viewModel = useDiagnosticsViewModel();
  return <DiagnosticsView viewModel={viewModel} />;
}
