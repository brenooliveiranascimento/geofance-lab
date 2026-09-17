import React from 'react';

import { CompaniesView } from './CompaniesView';
import { useCompaniesViewModel } from './useCompaniesViewModel';

export function CompaniesScreen(): React.JSX.Element {
  const viewModel = useCompaniesViewModel();
  return <CompaniesView viewModel={viewModel} />;
}
