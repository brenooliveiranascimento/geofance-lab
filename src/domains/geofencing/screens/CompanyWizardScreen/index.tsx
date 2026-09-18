import React from 'react';

import { CompanyWizardView } from '@src/domains/geofencing/screens/CompanyWizardScreen/CompanyWizardView';
import { useCompanyWizardViewModel } from '@src/domains/geofencing/screens/CompanyWizardScreen/useCompanyWizardViewModel';

export function CompanyWizardScreen(): React.JSX.Element {
  const viewModel = useCompanyWizardViewModel();
  return <CompanyWizardView viewModel={viewModel} />;
}
