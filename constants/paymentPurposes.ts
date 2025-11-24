/**
 * Payment Purpose Tags
 * Used for categorizing payment purposes in liability payments
 */

export const PAYMENT_PURPOSES = [
  { value: 'regular', label: 'Regular Payment', icon: 'calendar' },
  { value: 'extra', label: 'Extra Payment', icon: 'add-circle' },
  { value: 'catch_up', label: 'Catch Up', icon: 'arrow-forward-circle' },
  { value: 'early', label: 'Early Payment', icon: 'time' },
  { value: 'settlement', label: 'Settlement', icon: 'checkmark-circle' },
  { value: 'refinance', label: 'Refinance Payment', icon: 'swap-horizontal' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
] as const;

export type PaymentPurpose = typeof PAYMENT_PURPOSES[number]['value'];

