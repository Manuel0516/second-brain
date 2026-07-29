export const FINANCE_TABS = ['overview', 'review', 'reports'] as const

export type FinanceTab = (typeof FINANCE_TABS)[number]

export const JURISDICTIONS = [
  { code: 'SE', flag: '🇸🇪', label: 'Sweden', status: 'Resident' },
  { code: 'ES', flag: '🇪🇸', label: 'Spain', status: 'Non-resident' },
]
