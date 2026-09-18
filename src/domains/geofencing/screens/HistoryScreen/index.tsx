import React from 'react';

import { HistoryView } from '@src/domains/geofencing/screens/HistoryScreen/HistoryView';
import { useHistoryViewModel } from '@src/domains/geofencing/screens/HistoryScreen/useHistoryViewModel';

export function HistoryScreen(): React.JSX.Element {
  const viewModel = useHistoryViewModel();
  return <HistoryView viewModel={viewModel} />;
}
