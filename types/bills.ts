/**
 * Unified Bills Types
 * Bills is now an aggregated view of upcoming payments from multiple sources
 */

import { RecurrenceDefinition } from './recurrence';

/**
 * Source types for upcoming payments in bills view
 */
export type PaymentSourceType = 
  | 'recurring_transaction'  // Netflix, Rent, etc.
  | 'liability'              // Home Loan EMI, Car Loan, etc.
  | 'scheduled_payment'      // One-time future payments
  | 'goal_contribution'      // Goal contribution schedules
  | 'budget';                // Budget tracking periods

/**
 * Unified Upcoming Payment interface
 * Represents a payment that needs to be made (shown in Bills view)
 */
export interface UpcomingPayment {
  /** Unique ID for this upcoming payment */
  id: string;
  
  /** Source type: where this payment comes from */
  source_type: PaymentSourceType;
  
  /** ID of the source (recurring_transaction_id, liability_id, etc.) */
  source_id: string;
  
  /** Title/name of the payment */
  title: string;
  
  /** Description */
  description?: string;
  
  /** Amount to pay */
  amount?: number;
  
  /** Currency */
  currency: string;
  
  /** Due date (ISO date string) */
  due_date: string;
  
  /** Status */
  status: 'upcoming' | 'due_today' | 'overdue' | 'paid' | 'skipped' | 'cancelled' | 'postponed';
  
  /** Category ID */
  category_id?: string;
  
  /** Category name (optional, for display) */
  category_name?: string;
  
  /** Linked account ID */
  linked_account_id?: string;
  
  /** Account name (optional, for display) */
  account_name?: string;
  
  /** Fund type */
  fund_type?: 'personal' | 'liability' | 'goal';
  
  /** Specific fund ID (if applicable) */
  specific_fund_id?: string;
  
  /** Visual styling */
  color?: string;
  icon?: string;
  
  /** Tags */
  tags?: string[];
  
  /** Notes */
  notes?: string;
  
  /** Additional metadata from source */
  metadata?: {
    nature?: 'subscription' | 'bill' | 'payment' | 'income';
    amount_type?: 'fixed' | 'variable';
    estimated_amount?: number;
    principal_amount?: number;
    interest_amount?: number;
    payment_number?: number;
    [key: string]: any;
  };
  
  /** Days until/since due date */
  days_until?: number;
  
  /** Created at */
  created_at?: string;
}

/**
 * Bills view filter options
 */
export interface BillsViewFilters {
  /** Filter by source type */
  source_type?: PaymentSourceType[];
  
  /** Filter by status */
  status?: string[];
  
  /** Filter by date range */
  start_date?: string;
  end_date?: string;
  
  /** Filter by category */
  category_id?: string;
  
  /** Filter by account */
  account_id?: string;
  
  /** Search query */
  search?: string;
  
  /** View type: day, week, month, year */
  view_type?: 'day' | 'week' | 'month' | 'year';
}

/**
 * Bills view options
 */
export interface BillsViewOptions {
  /** View type */
  view_type: 'day' | 'week' | 'month' | 'year';
  
  /** Current date for the view */
  current_date?: string;
  
  /** Include paid payments */
  include_paid?: boolean;
  
  /** Include cancelled payments */
  include_cancelled?: boolean;
}

