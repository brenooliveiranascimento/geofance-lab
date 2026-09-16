import React from 'react';

import { MessagesView } from './MessagesView';
import { useMessagesViewModel } from './useMessagesViewModel';

export function MessagesScreen(): React.JSX.Element {
  const viewModel = useMessagesViewModel();
  return <MessagesView viewModel={viewModel} />;
}
