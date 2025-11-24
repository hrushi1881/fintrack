/**
 * Recurring Transaction Types
 * Defines the 4 main types with their characteristics and templates
 */

import { RecurringTransactionNature, RecurringAmountType, RecurringFrequency } from '@/types';

export interface RecurringTransactionTypeDefinition {
  nature: RecurringTransactionNature;
  label: string;
  description: string;
  icon: string;
  color: string;
  defaultType: 'income' | 'expense';
  
  // Characteristics
  characteristics: {
    amountPattern: 'fixed' | 'variable' | 'both';
    typicalFrequencies: RecurringFrequency[];
    commonUseCases: string[];
    autoPayCapable: boolean;
    subscriptionTracking: boolean;
  };
  
  // Default values for creation
  defaults: {
    amount_type: RecurringAmountType;
    frequency: RecurringFrequency;
    interval: number;
    auto_create: boolean;
    auto_create_days_before: number;
    remind_before: boolean;
    reminder_days: number[];
  };
  
  // Examples for user guidance
  examples: Array<{
    name: string;
    amount?: number;
    frequency: RecurringFrequency;
    description: string;
  }>;
}

/**
 * SUBSCRIPTIONS
 * Fixed amount, regular interval (Netflix, Spotify, Gym)
 * Characteristics:
 * - Fixed amount each period
 * - Very predictable
 * - Usually auto-debit
 * - Need tracking to avoid waste
 */
export const SUBSCRIPTION_TYPE: RecurringTransactionTypeDefinition = {
  nature: 'subscription',
  label: 'Subscription',
  description: 'Fixed monthly payments like Netflix, Spotify, or Gym membership',
  icon: 'repeat',
  color: '#10B981', // Green
  defaultType: 'expense',
  
  characteristics: {
    amountPattern: 'fixed',
    typicalFrequencies: ['monthly', 'yearly'],
    commonUseCases: [
      'Streaming services (Netflix, Spotify, Prime)',
      'Software subscriptions (Adobe, Microsoft 365)',
      'Gym memberships',
      'Magazine subscriptions',
      'Cloud storage',
    ],
    autoPayCapable: true,
    subscriptionTracking: true,
  },
  
  defaults: {
    amount_type: 'fixed',
    frequency: 'monthly',
    interval: 1,
    auto_create: true,
    auto_create_days_before: 3,
    remind_before: true,
    reminder_days: [3, 1],
  },
  
  examples: [
    {
      name: 'Netflix Premium',
      amount: 649,
      frequency: 'monthly',
      description: 'Streaming service charged on 11th of every month',
    },
    {
      name: 'Spotify Premium',
      amount: 119,
      frequency: 'monthly',
      description: 'Music streaming',
    },
    {
      name: 'Amazon Prime',
      amount: 1499,
      frequency: 'yearly',
      description: 'Annual subscription renewing in October',
    },
    {
      name: 'Gym Membership',
      amount: 2000,
      frequency: 'monthly',
      description: 'Local gym on 1st of month',
    },
    {
      name: 'iCloud Storage',
      amount: 75,
      frequency: 'monthly',
      description: '50GB cloud storage',
    },
  ],
};

/**
 * BILLS
 * Variable or fixed amount, regular interval (Utilities, Rent, Internet)
 * Characteristics:
 * - Amount may vary
 * - Predictable schedule
 * - Need payment tracking
 * - Budget impact
 */
export const BILL_TYPE: RecurringTransactionTypeDefinition = {
  nature: 'bill',
  label: 'Bill',
  description: 'Regular bills like rent, utilities, or internet',
  icon: 'receipt',
  color: '#F59E0B', // Orange
  defaultType: 'expense',
  
  characteristics: {
    amountPattern: 'both',
    typicalFrequencies: ['monthly', 'bimonthly', 'quarterly'],
    commonUseCases: [
      'Utilities (electricity, water, gas)',
      'Internet/phone bills',
      'Credit card bills',
      'Rent (fixed) or maintenance (variable)',
      'Insurance premiums',
    ],
    autoPayCapable: true,
    subscriptionTracking: false,
  },
  
  defaults: {
    amount_type: 'variable',
    frequency: 'monthly',
    interval: 1,
    auto_create: true,
    auto_create_days_before: 3,
    remind_before: true,
    reminder_days: [7, 3, 1],
  },
  
  examples: [
    {
      name: 'Electricity Bill',
      frequency: 'monthly',
      description: 'Variable amount, due 10th of every month (~₹2,500)',
    },
    {
      name: 'Water Bill',
      frequency: 'monthly',
      description: 'Variable amount, due 15th of every month (~₹800)',
    },
    {
      name: 'Internet',
      amount: 999,
      frequency: 'monthly',
      description: 'Fixed amount, due 5th of every month',
    },
    {
      name: 'Phone Bill',
      amount: 599,
      frequency: 'monthly',
      description: 'Fixed postpaid plan',
    },
    {
      name: 'Rent',
      amount: 20000,
      frequency: 'monthly',
      description: 'House rent on 1st of every month',
    },
  ],
};

/**
 * PAYMENTS
 * Fixed amount, regular interval, often liability-linked (EMIs, Insurance)
 * Characteristics:
 * - Fixed amount
 * - Fixed schedule
 * - Critical payments (cannot miss)
 * - Long-term commitment
 */
export const PAYMENT_TYPE: RecurringTransactionTypeDefinition = {
  nature: 'payment',
  label: 'Regular Payment',
  description: 'Fixed payments like EMIs, insurance, or tuition fees',
  icon: 'card',
  color: '#EF4444', // Red
  defaultType: 'expense',
  
  characteristics: {
    amountPattern: 'fixed',
    typicalFrequencies: ['monthly', 'quarterly', 'halfyearly', 'yearly'],
    commonUseCases: [
      'Loan EMIs (home, car, personal)',
      'Insurance premiums',
      'School/tuition fees',
      'Investment SIPs',
      'Property tax',
    ],
    autoPayCapable: true,
    subscriptionTracking: false,
  },
  
  defaults: {
    amount_type: 'fixed',
    frequency: 'monthly',
    interval: 1,
    auto_create: true,
    auto_create_days_before: 7,
    remind_before: true,
    reminder_days: [7, 3, 1],
  },
  
  examples: [
    {
      name: 'Home Loan EMI',
      amount: 35000,
      frequency: 'monthly',
      description: 'Monthly EMI on 1st of every month',
    },
    {
      name: 'Car Loan EMI',
      amount: 12000,
      frequency: 'monthly',
      description: 'Monthly EMI on 5th of every month',
    },
    {
      name: 'Life Insurance Premium',
      amount: 15000,
      frequency: 'quarterly',
      description: 'Paid every 3 months',
    },
    {
      name: 'Property Tax',
      amount: 12000,
      frequency: 'yearly',
      description: 'Annual property tax',
    },
    {
      name: 'School Fees',
      amount: 75000,
      frequency: 'halfyearly',
      description: 'Tuition fees every 6 months',
    },
  ],
};

/**
 * INCOME
 * Money coming in (Salary, Freelance retainer, Rent received)
 * Characteristics:
 * - Money coming IN
 * - Predictable schedule
 * - Base for financial planning
 * - Can be fixed or variable
 */
export const INCOME_TYPE: RecurringTransactionTypeDefinition = {
  nature: 'income',
  label: 'Regular Income',
  description: 'Recurring income like salary, freelance retainer, or rent received',
  icon: 'cash',
  color: '#10B981', // Green
  defaultType: 'income',
  
  characteristics: {
    amountPattern: 'both',
    typicalFrequencies: ['weekly', 'biweekly', 'monthly'],
    commonUseCases: [
      'Salary',
      'Rent received (if landlord)',
      'Freelance retainers',
      'Pension',
      'Investment returns',
    ],
    autoPayCapable: false,
    subscriptionTracking: false,
  },
  
  defaults: {
    amount_type: 'fixed',
    frequency: 'monthly',
    interval: 1,
    auto_create: true,
    auto_create_days_before: 1,
    remind_before: true,
    reminder_days: [1],
  },
  
  examples: [
    {
      name: 'Monthly Salary',
      amount: 100000,
      frequency: 'monthly',
      description: 'Salary credited on last day of month',
    },
    {
      name: 'Freelance Retainer',
      amount: 50000,
      frequency: 'monthly',
      description: 'Variable amount, 10th of every month',
    },
    {
      name: 'Rental Income',
      amount: 15000,
      frequency: 'monthly',
      description: 'From tenant on 5th of every month',
    },
    {
      name: 'Pension',
      amount: 25000,
      frequency: 'monthly',
      description: 'Monthly pension on 1st',
    },
    {
      name: 'Part-time Job',
      amount: 8000,
      frequency: 'weekly',
      description: 'Weekly earnings every Saturday',
    },
  ],
};

/**
 * All recurring transaction types registry
 */
export const RECURRING_TRANSACTION_TYPES: Record<RecurringTransactionNature, RecurringTransactionTypeDefinition> = {
  subscription: SUBSCRIPTION_TYPE,
  bill: BILL_TYPE,
  payment: PAYMENT_TYPE,
  income: INCOME_TYPE,
};

/**
 * Get type definition by nature
 */
export function getRecurringTypeDefinition(nature: RecurringTransactionNature): RecurringTransactionTypeDefinition {
  return RECURRING_TRANSACTION_TYPES[nature];
}

/**
 * Get all type definitions as array
 */
export function getAllRecurringTypeDefinitions(): RecurringTransactionTypeDefinition[] {
  return Object.values(RECURRING_TRANSACTION_TYPES);
}

/**
 * Frequency display labels
 */
export const FREQUENCY_LABELS: Record<RecurringFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Bi-Weekly (Every 2 weeks)',
  monthly: 'Monthly',
  bimonthly: 'Bi-Monthly (Every 2 months)',
  quarterly: 'Quarterly (Every 3 months)',
  halfyearly: 'Half-Yearly (Every 6 months)',
  yearly: 'Yearly',
  custom: 'Custom',
};

/**
 * Frequency descriptions
 */
export const FREQUENCY_DESCRIPTIONS: Record<RecurringFrequency, string> = {
  daily: 'Repeats every day',
  weekly: 'Repeats every week',
  biweekly: 'Repeats every 2 weeks',
  monthly: 'Repeats every month on the same day',
  bimonthly: 'Repeats every 2 months',
  quarterly: 'Repeats every 3 months',
  halfyearly: 'Repeats every 6 months',
  yearly: 'Repeats every year on the same date',
  custom: 'Custom recurrence pattern',
};

/**
 * Get frequency label
 */
export function getFrequencyLabel(frequency: RecurringFrequency, interval: number = 1): string {
  if (interval === 1) {
    return FREQUENCY_LABELS[frequency];
  }
  
  // Custom interval labels
  const baseLabels: Record<RecurringFrequency, string> = {
    daily: 'day',
    weekly: 'week',
    biweekly: 'week',
    monthly: 'month',
    bimonthly: 'month',
    quarterly: 'month',
    halfyearly: 'month',
    yearly: 'year',
    custom: '',
  };
  
  const unit = baseLabels[frequency];
  const plural = interval > 1 ? 's' : '';
  
  return `Every ${interval} ${unit}${plural}`;
}


