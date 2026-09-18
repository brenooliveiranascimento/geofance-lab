import React from 'react';

import { MessagesView } from '@src/domains/messaging/screens/MessagesScreen/MessagesView';
import { useMessagesViewModel } from '@src/domains/messaging/screens/MessagesScreen/useMessagesViewModel';

export function MessagesScreen(): React.JSX.Element {
  const viewModel = useMessagesViewModel();
  return <MessagesView viewModel={viewModel} />;
}
