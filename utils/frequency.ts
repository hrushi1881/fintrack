/**
 * Frequency mapping helpers to keep UI/DB vocabularies in sync.
 * UI: day, week, month, quarter, year, custom
 * DB: daily, weekly, monthly, quarterly, yearly, custom
 */

export type UiFrequency = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
export type DbFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
export type CustomUnit =
  | 'day' | 'days' | 'daily'
  | 'week' | 'weeks' | 'weekly'
  | 'month' | 'months' | 'monthly'
  | 'quarter' | 'quarters' | 'quarterly'
  | 'year' | 'years' | 'yearly';

const uiToDbMap: Record<string, DbFrequency> = {
  day: 'daily',
  week: 'weekly',
  month: 'monthly',
  quarter: 'quarterly',
  year: 'yearly',
  custom: 'custom',
  // already-db tokens pass through
  daily: 'daily',
  weekly: 'weekly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  yearly: 'yearly',
};

const dbToUiMap: Record<string, UiFrequency> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  quarterly: 'quarter',
  yearly: 'year',
  custom: 'custom',
  // pass-through for UI tokens
  day: 'day',
  week: 'week',
  month: 'month',
  quarter: 'quarter',
  year: 'year',
};

export function mapUiToDbFrequency(freq: string | undefined): DbFrequency {
  return uiToDbMap[String(freq || 'month').toLowerCase()] || 'monthly';
}

export function mapDbToUiFrequency(freq: string | undefined): UiFrequency {
  return dbToUiMap[String(freq || 'month').toLowerCase()] || 'month';
}

/**
 * Normalize custom unit strings to a DbFrequency token.
 * Accepts singular/plural/ui/db variants.
 */
export function normalizeCustomUnit(unit: string | undefined): DbFrequency {
  const u = String(unit || 'month').toLowerCase();
  switch (u) {
    case 'day':
    case 'days':
    case 'daily':
      return 'daily';
    case 'week':
    case 'weeks':
    case 'weekly':
      return 'weekly';
    case 'month':
    case 'months':
    case 'monthly':
      return 'monthly';
    case 'quarter':
    case 'quarters':
    case 'quarterly':
      return 'quarterly';
    case 'year':
    case 'years':
    case 'yearly':
      return 'yearly';
    default:
      // Default to monthly to avoid exploding the schedule
      return 'monthly';
  }
}

/**
 * Resolve a frequency, falling back to custom unit when freq is 'custom'.
 */
export function resolveFrequencyWithCustom(freq: string | undefined, customUnit?: string): DbFrequency {
  const dbFreq = mapUiToDbFrequency(freq);
  if (dbFreq === 'custom') {
    return normalizeCustomUnit(customUnit);
  }
  return dbFreq;
}


