/**
 * Recurrence Engine Types
 * Unified recurrence system for bills, liabilities, budgets, and other cyclical entities
 */

export type RecurrenceFrequency = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type OccurrenceStatus = 'upcoming' | 'due_today' | 'overdue' | 'completed' | 'skipped' | 'cancelled';

/**
 * Recurrence Definition
 * Defines how an entity repeats over time
 */
export interface RecurrenceDefinition {
  /** Frequency type: day, week, month, quarter, year, or custom */
  frequency: RecurrenceFrequency;
  
  /** Repeat every N periods (e.g., 1 = every period, 2 = every other period) */
  interval: number;
  
  /** When recurrence begins (ISO date string) - REQUIRED */
  start_date: string;
  
  /** When recurrence stops (ISO date string) - OPTIONAL */
  end_date?: string;
  
  /** Specific day of month/week for occurrence (e.g., 15 = 15th of month, 1 = Monday) */
  date_of_occurrence?: number;
  
  /** For custom frequency: the unit to use (day/week/month/quarter/year) */
  custom_unit?: RecurrenceUnit;
  
  /** For custom frequency: repeat every N custom_units */
  custom_interval?: number;
}

/**
 * Occurrence Information
 * Represents a single occurrence in a recurrence schedule
 */
export interface Occurrence {
  /** Date of this occurrence (ISO date string) */
  date: string;
  
  /** Status of this occurrence */
  status: OccurrenceStatus;
  
  /** Days until/since this occurrence (negative = overdue, 0 = today, positive = upcoming) */
  daysFromNow: number;
}

/**
 * Schedule Generation Options
 */
export interface ScheduleOptions {
  /** Start date for generation (defaults to recurrence.start_date) */
  startDate?: string;
  
  /** End date for generation (required if recurrence.end_date not set) */
  endDate?: string;
  
  /** Maximum number of occurrences to generate (defaults to unlimited) */
  maxOccurrences?: number;
  
  /** Current date for status calculation (defaults to today) */
  currentDate?: string;
}

