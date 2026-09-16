import React from 'react';
import { useSettingsViewModel } from './useSettingsViewModel';
import { SettingsView } from './SettingsView';

export function SettingsScreen(): React.JSX.Element {
  const viewModel = useSettingsViewModel();
  return <SettingsView viewModel={viewModel} />;
}
