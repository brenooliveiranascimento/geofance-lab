import React from 'react';

import { SimulatorView } from '@src/domains/geofencing/screens/SimulatorScreen/SimulatorView';
import { useSimulatorViewModel } from '@src/domains/geofencing/screens/SimulatorScreen/useSimulatorViewModel';

export function SimulatorScreen(): React.JSX.Element {
  const viewModel = useSimulatorViewModel();
  return <SimulatorView viewModel={viewModel} />;
}
