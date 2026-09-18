import React from 'react';

import { CompaniesView } from '@src/domains/geofencing/screens/CompaniesScreen/CompaniesView';
import { useCompaniesViewModel } from '@src/domains/geofencing/screens/CompaniesScreen/useCompaniesViewModel';

export function CompaniesScreen(): React.JSX.Element {
  const viewModel = useCompaniesViewModel();
  return <CompaniesView viewModel={viewModel} />;
}
