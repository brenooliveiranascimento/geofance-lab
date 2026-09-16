import React from 'react';

import { EventLogView } from './EventLogView';
import { useEventLogViewModel } from './useEventLogViewModel';

export function EventLogScreen(): React.JSX.Element {
  const viewModel = useEventLogViewModel();
  return <EventLogView viewModel={viewModel} />;
}
