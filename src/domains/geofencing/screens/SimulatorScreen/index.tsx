import React from 'react';

import { SimulatorView } from './SimulatorView';
import { useSimulatorViewModel } from './useSimulatorViewModel';

export function SimulatorScreen(): React.JSX.Element {
  const viewModel = useSimulatorViewModel();
  return <SimulatorView viewModel={viewModel} />;
}
