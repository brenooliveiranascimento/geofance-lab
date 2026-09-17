import React from 'react';

import { CompanyEditorView } from './CompanyEditorView';
import { useCompanyEditorViewModel } from './useCompanyEditorViewModel';

export function CompanyEditorScreen(): React.JSX.Element {
  const viewModel = useCompanyEditorViewModel();
  return <CompanyEditorView viewModel={viewModel} />;
}
