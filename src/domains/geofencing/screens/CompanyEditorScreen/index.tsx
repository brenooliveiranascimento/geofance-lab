import React from 'react';

import { CompanyEditorView } from '@src/domains/geofencing/screens/CompanyEditorScreen/CompanyEditorView';
import { useCompanyEditorViewModel } from '@src/domains/geofencing/screens/CompanyEditorScreen/useCompanyEditorViewModel';

export function CompanyEditorScreen(): React.JSX.Element {
  const viewModel = useCompanyEditorViewModel();
  return <CompanyEditorView viewModel={viewModel} />;
}
