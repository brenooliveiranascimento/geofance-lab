import React from 'react';

import { MonitorView } from './MonitorView';
import { useMonitorViewModel } from './useMonitorViewModel';

export function MonitorScreen(): React.JSX.Element {
  const viewModel = useMonitorViewModel();
  return <MonitorView viewModel={viewModel} />;
}
