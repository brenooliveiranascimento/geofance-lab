import React from 'react';
import { useSettingsViewModel } from '@src/domains/settings/screens/SettingsScreen/useSettingsViewModel';
import { SettingsView } from '@src/domains/settings/screens/SettingsScreen/SettingsView';

export function SettingsScreen(): React.JSX.Element {
  const viewModel = useSettingsViewModel();
  return <SettingsView viewModel={viewModel} />;
}
