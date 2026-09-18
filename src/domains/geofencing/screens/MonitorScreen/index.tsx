import React from 'react';

import { MonitorView } from '@src/domains/geofencing/screens/MonitorScreen/MonitorView';
import { useMonitorViewModel } from '@src/domains/geofencing/screens/MonitorScreen/useMonitorViewModel';

export function MonitorScreen(): React.JSX.Element {
  const viewModel = useMonitorViewModel();
  return <MonitorView viewModel={viewModel} />;
}
