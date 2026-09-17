import React from 'react';

import { CompanyWizardView } from './CompanyWizardView';
import { useCompanyWizardViewModel } from './useCompanyWizardViewModel';

export function CompanyWizardScreen(): React.JSX.Element {
  const viewModel = useCompanyWizardViewModel();
  return <CompanyWizardView viewModel={viewModel} />;
}
