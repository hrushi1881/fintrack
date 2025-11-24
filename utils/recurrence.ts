/**
 * Recurrence Engine
 * Unified recurrence system for bills, liabilities, budgets, and other cyclical entities
 * 
 * Supports: day, week, month, quarter, year, and custom frequencies
 */

import { 
  RecurrenceDefinition, 
  RecurrenceFrequency, 
  RecurrenceUnit,
  Occurrence, 
  OccurrenceStatus,
  ScheduleOptions 
} from '@/types/recurrence';

/**
 * Calculate the next occurrence date after a given date
 * @param def Recurrence definition
 * @param fromDate Date to calculate from (ISO date string)
 * @returns Next occurrence date (ISO date string) or null if past end_date
 */
export function calculateNextOccurrence(
  def: RecurrenceDefinition,
  fromDate: string
): string | null {
  const from = new Date(fromDate);
  const start = new Date(def.start_date);
  
  // Ensure fromDate is at or after start_date
  if (from < start) {
    from.setTime(start.getTime());
  }
  
  // Check if past end_date
  if (def.end_date) {
    const end = new Date(def.end_date);
    if (from >= end) {
      return null;
    }
  }
  
  const next = new Date(from);
  
  // Determine actual frequency and interval to use
  const actualFrequency = def.frequency === 'custom' ? def.custom_unit! : def.frequency;
  const actualInterval = def.frequency === 'custom' ? def.custom_interval! : def.interval;
  
  switch (actualFrequency) {
    case 'day':
      next.setDate(from.getDate() + actualInterval);
      break;
      
    case 'week':
      if (def.date_of_occurrence !== undefined) {
        // Specific weekday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
        const targetDay = def.date_of_occurrence % 7;
        const currentDay = from.getDay();
        let daysToAdd = targetDay - currentDay;
        
        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }
        daysToAdd += (actualInterval - 1) * 7; // Add interval weeks
        next.setDate(from.getDate() + daysToAdd);
      } else {
        next.setDate(from.getDate() + (actualInterval * 7));
      }
      break;
      
    case 'month':
      if (def.date_of_occurrence !== undefined) {
        // Specific day of month (e.g., 15th)
        next.setMonth(from.getMonth() + actualInterval);
        const targetDay = Math.min(def.date_of_occurrence, getLastDayOfMonth(next));
        next.setDate(targetDay);
        
        // If we went backwards in time, move to next month
        if (next <= from) {
          next.setMonth(next.getMonth() + 1);
          const targetDay2 = Math.min(def.date_of_occurrence, getLastDayOfMonth(next));
          next.setDate(targetDay2);
        }
      } else {
        // Same day of month, N months later
        next.setMonth(from.getMonth() + actualInterval);
        // Handle month-end edge cases
        const lastDayOfFrom = getLastDayOfMonth(from);
        const lastDayOfNext = getLastDayOfMonth(next);
        if (from.getDate() === lastDayOfFrom && lastDayOfNext < lastDayOfFrom) {
          next.setDate(lastDayOfNext);
        }
      }
      break;
      
    case 'quarter':
      // Every N quarters (3-month periods)
      if (def.date_of_occurrence !== undefined) {
        next.setMonth(from.getMonth() + (actualInterval * 3));
        const targetDay = Math.min(def.date_of_occurrence, getLastDayOfMonth(next));
        next.setDate(targetDay);
        
        if (next <= from) {
          next.setMonth(next.getMonth() + 3);
          const targetDay2 = Math.min(def.date_of_occurrence, getLastDayOfMonth(next));
          next.setDate(targetDay2);
        }
      } else {
        next.setMonth(from.getMonth() + (actualInterval * 3));
        const lastDayOfFrom = getLastDayOfMonth(from);
        const lastDayOfNext = getLastDayOfMonth(next);
        if (from.getDate() === lastDayOfFrom && lastDayOfNext < lastDayOfFrom) {
          next.setDate(lastDayOfNext);
        }
      }
      break;
      
    case 'year':
      // Every N years
      if (def.date_of_occurrence !== undefined) {
        // date_of_occurrence represents day of year (1-365/366)
        next.setFullYear(from.getFullYear() + actualInterval);
        const daysInYear = isLeapYear(next.getFullYear()) ? 366 : 365;
        const targetDay = Math.min(def.date_of_occurrence, daysInYear);
        next.setMonth(0, 1); // January 1
        next.setDate(targetDay);
        
        if (next <= from) {
          next.setFullYear(next.getFullYear() + 1);
          const daysInNextYear = isLeapYear(next.getFullYear()) ? 366 : 365;
          const targetDay2 = Math.min(def.date_of_occurrence, daysInNextYear);
          next.setMonth(0, 1);
          next.setDate(targetDay2);
        }
      } else {
        // Same month/day, N years later
        next.setFullYear(from.getFullYear() + actualInterval);
        // Handle leap year edge case (Feb 29)
        if (from.getMonth() === 1 && from.getDate() === 29) {
          if (!isLeapYear(next.getFullYear())) {
            next.setDate(28); // Feb 28 in non-leap year
          }
        }
      }
      break;
      
    default:
      throw new Error(`Unsupported frequency: ${actualFrequency}`);
  }
  
  // Check if next occurrence is past end_date
  if (def.end_date) {
    const end = new Date(def.end_date);
    if (next > end) {
      return null;
    }
  }
  
  return next.toISOString().split('T')[0];
}

/**
 * Generate all occurrences in a date range
 * @param def Recurrence definition
 * @param options Schedule generation options
 * @returns Array of occurrences
 */
export function generateSchedule(
  def: RecurrenceDefinition,
  options: ScheduleOptions = {}
): Occurrence[] {
  const startDate = options.startDate || def.start_date;
  const endDate = options.endDate || def.end_date;
  const currentDate = options.currentDate || new Date().toISOString().split('T')[0];
  const maxOccurrences = options.maxOccurrences;
  
  if (!endDate && !maxOccurrences) {
    throw new Error('Either endDate or maxOccurrences must be provided');
  }
  
  const occurrences: Occurrence[] = [];
  let current = startDate;
  let count = 0;
  
  while (true) {
    // Check if we've hit the limit
    if (maxOccurrences && count >= maxOccurrences) {
      break;
    }
    
    // Calculate next occurrence
    const next = calculateNextOccurrence(
      { ...def, start_date: def.start_date },
      current === startDate ? startDate : current
    );
    
    if (!next) {
      break; // Past end_date
    }
    
    // Check if past end_date
    if (endDate && next > endDate) {
      break;
    }
    
    // Calculate status
    const status = calculateStatus(next, currentDate);
    const daysFromNow = getDaysUntil(next, currentDate);
    
    occurrences.push({
      date: next,
      status,
      daysFromNow,
    });
    
    current = next;
    count++;
    
    // Safety limit (prevent infinite loops)
    if (count > 10000) {
      console.warn('Schedule generation hit safety limit (10000 occurrences)');
      break;
    }
  }
  
  return occurrences;
}

/**
 * Calculate status of an occurrence
 * @param dueDate Date of occurrence (ISO date string)
 * @param currentDate Current date (ISO date string)
 * @param existingStatus Existing status (if any)
 * @returns Status of the occurrence
 */
export function calculateStatus(
  dueDate: string,
  currentDate: string,
  existingStatus?: OccurrenceStatus
): OccurrenceStatus {
  // If already completed/skipped/cancelled, preserve that status
  if (existingStatus && ['completed', 'skipped', 'cancelled'].includes(existingStatus)) {
    return existingStatus;
  }
  
  const due = new Date(dueDate);
  const current = new Date(currentDate);
  
  // Reset time to compare dates only
  due.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((current.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) {
    return 'upcoming';
  } else if (diffDays === 0) {
    return 'due_today';
  } else {
    return 'overdue';
  }
}

/**
 * Calculate days until/since a date
 * @param targetDate Target date (ISO date string)
 * @param currentDate Current date (ISO date string)
 * @returns Days difference (negative = past, 0 = today, positive = future)
 */
export function getDaysUntil(targetDate: string, currentDate: string): number {
  const target = new Date(targetDate);
  const current = new Date(currentDate);
  
  target.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);
  
  return Math.floor((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if a date is overdue
 * @param dueDate Due date (ISO date string)
 * @param currentDate Current date (ISO date string)
 * @returns True if overdue
 */
export function isOverdue(dueDate: string, currentDate: string): boolean {
  return getDaysUntil(dueDate, currentDate) < 0;
}

/**
 * Get number of occurrences between two dates
 * @param def Recurrence definition
 * @param startDate Start date (ISO date string)
 * @param endDate End date (ISO date string)
 * @returns Number of occurrences
 */
export function calculateOccurrencesBetween(
  def: RecurrenceDefinition,
  startDate: string,
  endDate: string
): number {
  const occurrences = generateSchedule(def, {
    startDate,
    endDate,
  });
  return occurrences.length;
}

/**
 * Get human-readable recurrence description
 * @param def Recurrence definition
 * @returns Human-readable string (e.g., "Every 2 months on the 15th")
 */
export function getRecurrenceDescription(def: RecurrenceDefinition): string {
  const interval = def.frequency === 'custom' ? def.custom_interval! : def.interval;
  const unit = def.frequency === 'custom' ? def.custom_unit! : def.frequency;
  
  let description = `Every ${interval} ${getUnitName(unit, interval)}`;
  
  if (def.date_of_occurrence !== undefined) {
    if (unit === 'month' || unit === 'quarter') {
      description += ` on the ${def.date_of_occurrence}${getOrdinalSuffix(def.date_of_occurrence)}`;
    } else if (unit === 'week') {
      const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayIndex = def.date_of_occurrence % 7;
      description += ` on ${weekdays[dayIndex]}`;
    }
  }
  
  if (def.end_date) {
    description += ` until ${new Date(def.end_date).toLocaleDateString()}`;
  }
  
  return description;
}

// Helper functions

function getLastDayOfMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getUnitName(unit: RecurrenceUnit, interval: number): string {
  const plural = interval > 1;
  
  switch (unit) {
    case 'day':
      return plural ? 'days' : 'day';
    case 'week':
      return plural ? 'weeks' : 'week';
    case 'month':
      return plural ? 'months' : 'month';
    case 'quarter':
      return plural ? 'quarters' : 'quarter';
    case 'year':
      return plural ? 'years' : 'year';
    default:
      return unit;
  }
}

function getOrdinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

