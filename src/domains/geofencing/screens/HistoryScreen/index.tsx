import React from 'react';

import { HistoryView } from './HistoryView';
import { useHistoryViewModel } from './useHistoryViewModel';

export function HistoryScreen(): React.JSX.Element {
  const viewModel = useHistoryViewModel();
  return <HistoryView viewModel={viewModel} />;
}
