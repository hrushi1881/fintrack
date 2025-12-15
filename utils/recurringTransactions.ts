/**
 * Recurring Transactions Utilities
 * CRUD operations for recurring transactions (Netflix, Rent, etc.)
 * Uses recurrence engine for schedule generation
 */

import { supabase } from '@/lib/supabase';
import { 
  RecurrenceDefinition,
  calculateNextOccurrence,
  generateSchedule,
  calculateStatus as calculateRecurrenceStatus,
  getDaysUntil
} from '@/utils/recurrence';
import { mapUiToDbFrequency, mapDbToUiFrequency } from '@/utils/frequency';

export interface RecurringTransaction {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category_id?: string;
  direction: 'income' | 'expense';
  amount?: number;
  amount_type: 'fixed' | 'variable';
  estimated_amount?: number;
  currency: string;
  frequency: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  interval: number;
  start_date: string;
  end_date?: string;
  date_of_occurrence?: number;
  custom_unit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  custom_interval?: number;
  account_id?: string; // Account will be selected when creating bills/payments
  fund_type: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  nature?: 'subscription' | 'bill' | 'payment' | 'income';
  is_subscription: boolean;
  subscription_provider?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  paused_until?: string;
  auto_create: boolean;
  auto_create_days_before: number;
  payment_tracking_method?: 'bill' | 'scheduled_transaction' | 'direct' | 'manual';
  remind_before: boolean;
  reminder_days: number[];
  color: string;
  icon: string;
  total_occurrences: number;
  completed_occurrences: number;
  skipped_occurrences: number;
  total_paid: number;
  average_amount: number;
  last_transaction_date?: string;
  next_transaction_date?: string;
  tags?: string[];
  notes?: string;
  metadata?: any;
  // is_active is computed from status (status === 'active')
  is_active?: boolean; // Optional, computed property
  // is_deleted is computed from status (status === 'cancelled' or deleted_at is set)
  is_deleted?: boolean; // Optional, computed property
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringTransactionData {
  title: string;
  description?: string;
  category_id?: string;
  direction?: 'income' | 'expense';
  amount?: number;
  amount_type?: 'fixed' | 'variable';
  estimated_amount?: number;
  currency: string;
  frequency: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  interval?: number;
  start_date: string;
  end_date?: string;
  date_of_occurrence?: number;
  custom_unit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  custom_interval?: number;
  account_id?: string; // Account will be selected when creating bills/payments
  fund_type?: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  nature?: 'subscription' | 'bill' | 'payment' | 'income';
  is_subscription?: boolean;
  subscription_provider?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  auto_create?: boolean;
  auto_create_days_before?: number;
  payment_tracking_method?: 'bill' | 'scheduled_transaction' | 'direct' | 'manual';
  remind_before?: boolean;
  reminder_days?: number[];
  color?: string;
  icon?: string;
  tags?: string[];
  notes?: string;
  metadata?: any;
}

export interface UpdateRecurringTransactionData extends Partial<CreateRecurringTransactionData> {
  id: string;
}

/**
 * Fetch all recurring transactions for a user
 */
export async function fetchRecurringTransactions(
  userId: string,
  filters: {
    status?: string[];
    nature?: string[];
    direction?: 'income' | 'expense';
    is_active?: boolean;
  } = {}
): Promise<RecurringTransaction[]> {
  try {
    let query = supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('next_transaction_date', { ascending: true, nullsLast: true });

    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    // Note: nature is stored as a direct column in the database
    // We'll filter by nature after fetching if needed
    // For now, we fetch all and filter in memory if nature filter is provided

    if (filters.direction) {
      // Database column is 'direction'
      query = query.eq('direction', filters.direction);
    }

    if (filters.is_active !== undefined) {
      // Map is_active filter to status filter
      if (filters.is_active) {
        query = query.eq('status', 'active');
      } else {
        query = query.neq('status', 'active');
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching recurring transactions from database:', error);
      throw error;
    }

    // Map frequency from database format to interface format
    // Database stores: 'daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'custom'
    // Interface expects: 'day', 'week', 'month', 'quarter', 'year', 'custom'
    // Calculate next_transaction_date for each if not set
    // Map database columns to interface fields
    const transactions = (data || []).map(tx => ({
      ...tx,
      title: tx.title, // Database uses 'title'
      direction: tx.direction, // Database uses 'direction'
      account_id: tx.linked_account_id || undefined, // Map linked_account_id to account_id for interface
      frequency: tx.frequency as any, // Database stores UI format directly, no mapping needed
      // Extract from custom_pattern JSONB
      date_of_occurrence: tx.custom_pattern?.date_of_occurrence?.toString() || undefined,
      custom_unit: tx.custom_pattern?.custom_unit || undefined,
      custom_interval: tx.custom_pattern?.custom_interval?.toString() || undefined,
      // Nature is stored directly in database column, not in custom_pattern
      nature: tx.nature || undefined,
    })).filter(tx => {
      // Filter by nature if provided (stored as direct column)
      if (filters.nature && filters.nature.length > 0) {
        const txNature = tx.nature;
        return txNature && filters.nature.includes(txNature);
      }
      return true;
    }).map(tx => {
      if (!tx.next_transaction_date && tx.status === 'active') {
        // Map frequency from database format to interface format for RecurrenceDefinition
        // Database: 'daily', 'weekly', 'monthly', etc.
        // RecurrenceDefinition expects: 'day', 'week', 'month', etc.
        // Database stores frequency in UI format, use directly
        const def: RecurrenceDefinition = {
          frequency: tx.frequency as any,
          interval: tx.interval || 1,
          start_date: tx.start_date,
          end_date: tx.end_date || undefined,
          // Extract from custom_pattern JSONB if it exists
          date_of_occurrence: tx.custom_pattern?.date_of_occurrence || undefined,
          custom_unit: tx.custom_pattern?.custom_unit || undefined,
          custom_interval: tx.custom_pattern?.custom_interval || undefined,
        };
        const next = calculateNextOccurrence(def, new Date().toISOString().split('T')[0]);
        tx.next_transaction_date = next || undefined;
      }
      return tx;
    });

    return transactions as RecurringTransaction[];
  } catch (error) {
    console.error('Error fetching recurring transactions:', error);
    throw error;
  }
}

/**
 * Fetch a single recurring transaction by ID
 */
export async function fetchRecurringTransactionById(id: string): Promise<RecurringTransaction | null> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.user.id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }
    if (!data) return null;

    // Map frequency from database format to interface format
    // Map database columns to interface fields
    return {
      ...data,
      title: data.title, // Database uses 'title'
      direction: data.direction, // Database uses 'direction'
      frequency: mapDbToUiFrequency(data.frequency), // Map frequency back
      date_of_occurrence: data.custom_pattern?.date_of_occurrence?.toString() || undefined,
      custom_unit: data.custom_pattern?.custom_unit || undefined,
      custom_interval: data.custom_pattern?.custom_interval?.toString() || undefined,
      nature: data.nature || undefined, // Nature is stored directly in database column
    } as RecurringTransaction;
  } catch (error) {
    console.error('Error fetching recurring transaction:', error);
    throw error;
  }
}

/**
 * Create a new recurring transaction
 */
export async function createRecurringTransaction(
  data: CreateRecurringTransactionData
): Promise<RecurringTransaction> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Sanitize recurrence inputs
    const sanitizedInterval = Math.max(1, data.interval || 1);
    const sanitizedCustomInterval = Math.max(1, data.custom_interval || data.interval || 1);
    const sanitizedCustomUnit = data.custom_unit
      ? mapDbToUiFrequency(mapUiToDbFrequency(data.custom_unit)) // normalize to known token
      : undefined;

    // Calculate next_transaction_date using recurrence engine
    const def: RecurrenceDefinition = {
      frequency: data.frequency,
      interval: sanitizedInterval,
      start_date: data.start_date,
      end_date: data.end_date,
      date_of_occurrence: data.date_of_occurrence,
      custom_unit: sanitizedCustomUnit,
      custom_interval: sanitizedCustomInterval,
    };

    const nextDate = calculateNextOccurrence(def, data.start_date);

    // Database stores frequency in UI format ('day', 'week', 'month', etc.), not DB format
    // So we don't need to map - use frequency directly
    const { data: transaction, error } = await supabase
      .from('recurring_transactions')
      .insert({
        user_id: user.user.id,
        title: data.title, // Database column is 'title'
        description: data.description,
        category_id: data.category_id,
        direction: data.direction || 'expense', // Database column is 'direction'
        amount: data.amount,
        amount_type: data.amount_type || 'fixed',
        estimated_amount: data.estimated_amount,
        currency: data.currency,
        frequency: data.frequency, // Database stores UI format directly
        interval: sanitizedInterval,
        start_date: data.start_date,
        end_date: data.end_date,
        // Store date_of_occurrence, custom_unit, custom_interval in custom_pattern JSONB
        // Note: nature is stored as a direct column, not in custom_pattern
        custom_pattern: (data.date_of_occurrence || data.custom_unit || data.custom_interval) ? {
          date_of_occurrence: data.date_of_occurrence ? parseInt(data.date_of_occurrence.toString()) : undefined,
          custom_unit: sanitizedCustomUnit,
          custom_interval: sanitizedCustomInterval,
        } : null,
        nature: data.nature, // Store nature as direct column
        linked_account_id: data.account_id || null, // Database uses 'linked_account_id', required for income, optional for expenses (selected when paying)
        fund_type: data.fund_type || 'personal',
        specific_fund_id: data.specific_fund_id,
        is_subscription: data.is_subscription || false,
        subscription_provider: data.subscription_provider,
        subscription_plan: data.subscription_plan,
        subscription_start_date: data.subscription_start_date,
        status: 'active',
        auto_create: data.auto_create !== false,
        auto_create_days_before: data.auto_create_days_before || 3,
        payment_tracking_method: data.payment_tracking_method || 'scheduled_transaction',
        remind_before: data.remind_before !== false,
        reminder_days: data.reminder_days || [7, 3, 1],
        color: data.color || '#F59E0B',
        icon: data.icon || 'repeat',
        tags: data.tags,
        notes: data.notes,
        next_transaction_date: nextDate,
      })
      .select()
      .single();

    if (error) throw error;
    if (!transaction) throw new Error('Transaction not found after creation');

    // Map database columns to interface fields
    return {
      ...transaction,
      title: transaction.title, // Database uses 'title'
      direction: transaction.direction, // Database uses 'direction'
      account_id: transaction.linked_account_id || undefined, // Map linked_account_id to account_id for interface
      date_of_occurrence: transaction.custom_pattern?.date_of_occurrence?.toString() || undefined,
      custom_unit: transaction.custom_pattern?.custom_unit || undefined,
      custom_interval: transaction.custom_pattern?.custom_interval?.toString() || undefined,
    } as RecurringTransaction;
  } catch (error) {
    console.error('Error creating recurring transaction:', error);
    throw error;
  }
}

/**
 * Update a recurring transaction
 */
export async function updateRecurringTransaction(
  data: UpdateRecurringTransactionData
): Promise<RecurringTransaction> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Sanitize recurrence inputs
    const sanitizedInterval = data.interval !== undefined ? Math.max(1, data.interval) : undefined;
    const sanitizedCustomInterval = data.custom_interval !== undefined
      ? Math.max(1, data.custom_interval)
      : undefined;
    // Database stores custom_unit in UI format ('day', 'week', etc.), normalize to ensure valid token
    const sanitizedCustomUnit = data.custom_unit
      ? (['day', 'week', 'month', 'quarter', 'year'].includes(data.custom_unit) ? data.custom_unit : 'month')
      : undefined;

    // Recalculate next_transaction_date if recurrence fields changed
    let nextDate: string | undefined = undefined;
    if (data.frequency || data.interval || data.start_date || data.end_date || data.date_of_occurrence) {
      const current = await fetchRecurringTransactionById(data.id);
      if (current) {
        const def: RecurrenceDefinition = {
          frequency: data.frequency || current.frequency,
          interval: sanitizedInterval ?? current.interval,
          start_date: data.start_date || current.start_date,
          end_date: data.end_date !== undefined ? data.end_date : current.end_date,
          date_of_occurrence: data.date_of_occurrence !== undefined ? data.date_of_occurrence : current.date_of_occurrence,
          custom_unit: sanitizedCustomUnit !== undefined ? sanitizedCustomUnit : current.custom_unit,
          custom_interval: sanitizedCustomInterval !== undefined ? sanitizedCustomInterval : current.custom_interval,
        };
        const next = calculateNextOccurrence(def, new Date().toISOString().split('T')[0]);
        nextDate = next || undefined;
      }
    }

    const updateData: any = {
      ...data,
      id: undefined, // Remove id from update data
    };

    // Map interface fields to database columns
    // Database uses 'title' and 'direction' directly, no mapping needed
    // But map account_id to linked_account_id
    if (updateData.account_id !== undefined) {
      updateData.linked_account_id = updateData.account_id;
      delete updateData.account_id;
    }
    
    // Database stores frequency in UI format, no mapping needed
    // if (updateData.frequency !== undefined) {
    //   updateData.frequency = mapUiToDbFrequency(updateData.frequency);
    // }
    if (sanitizedInterval !== undefined) {
      updateData.interval = sanitizedInterval;
    }
    
    // Store custom fields in custom_pattern JSONB
    if (updateData.date_of_occurrence !== undefined || updateData.custom_unit !== undefined || updateData.custom_interval !== undefined || sanitizedCustomUnit !== undefined || sanitizedCustomInterval !== undefined) {
      updateData.custom_pattern = {
        ...(updateData.custom_pattern || {}),
        date_of_occurrence: updateData.date_of_occurrence ? parseInt(updateData.date_of_occurrence) : undefined,
        custom_unit: sanitizedCustomUnit ?? updateData.custom_unit,
        custom_interval: sanitizedCustomInterval !== undefined
          ? sanitizedCustomInterval
          : updateData.custom_interval
            ? parseInt(updateData.custom_interval)
            : undefined,
      };
      delete updateData.date_of_occurrence;
      delete updateData.custom_unit;
      delete updateData.custom_interval;
    }

    if (nextDate !== undefined) {
      updateData.next_transaction_date = nextDate;
    }

    const { data: transaction, error } = await supabase
      .from('recurring_transactions')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;
    if (!transaction) throw new Error('Transaction not found after update');

    // Map database columns to interface fields
    return {
      ...transaction,
      title: transaction.title, // Database uses 'title'
      direction: transaction.direction, // Database uses 'direction'
      account_id: transaction.linked_account_id || undefined, // Map linked_account_id to account_id for interface
      date_of_occurrence: transaction.custom_pattern?.date_of_occurrence?.toString() || undefined,
      custom_unit: transaction.custom_pattern?.custom_unit || undefined,
      custom_interval: transaction.custom_pattern?.custom_interval?.toString() || undefined,
    } as RecurringTransaction;
  } catch (error) {
    console.error('Error updating recurring transaction:', error);
    throw error;
  }
}

/**
 * Delete a recurring transaction (soft delete)
 */
export async function deleteRecurringTransaction(id: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('recurring_transactions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.user.id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting recurring transaction:', error);
    throw error;
  }
}

/**
 * Pause a recurring transaction
 */
export async function pauseRecurringTransaction(id: string, pausedUntil?: string): Promise<RecurringTransaction> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: transaction, error } = await supabase
      .from('recurring_transactions')
      .update({
        status: 'paused',
        paused_until: pausedUntil || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    return transaction as RecurringTransaction;
  } catch (error) {
    console.error('Error pausing recurring transaction:', error);
    throw error;
  }
}

/**
 * Resume a paused recurring transaction
 */
export async function resumeRecurringTransaction(id: string): Promise<RecurringTransaction> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Recompute next_transaction_date on resume so the series starts from “today”
    const current = await fetchRecurringTransactionById(id);
    let nextDate: string | undefined;
    if (current) {
      const def: RecurrenceDefinition = {
        frequency: current.frequency,
        interval: current.interval,
        start_date: current.start_date,
        end_date: current.end_date || undefined,
        date_of_occurrence: current.date_of_occurrence || undefined,
        custom_unit: current.custom_unit || undefined,
        custom_interval: current.custom_interval || undefined,
      };
      nextDate = calculateNextOccurrence(def, new Date().toISOString().split('T')[0]) || undefined;
    }

    const { data: transaction, error } = await supabase
      .from('recurring_transactions')
      .update({
        status: 'active',
        paused_until: null,
        ...(nextDate ? { next_transaction_date: nextDate } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    return transaction as RecurringTransaction;
  } catch (error) {
    console.error('Error resuming recurring transaction:', error);
    throw error;
  }
}

/**
 * Generate upcoming payments from a recurring transaction
 * Used by bills aggregator to get future occurrences
 */
export async function generateUpcomingPaymentsFromRecurring(
  transactionId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; amount?: number; status: string }>> {
  try {
    const transaction = await fetchRecurringTransactionById(transactionId);
    if (!transaction || transaction.status !== 'active') {
      return [];
    }

    const def: RecurrenceDefinition = {
      frequency: transaction.frequency,
      interval: transaction.interval,
      start_date: transaction.start_date,
      end_date: transaction.end_date || undefined,
      date_of_occurrence: transaction.date_of_occurrence || undefined,
      custom_unit: transaction.custom_unit || undefined,
      custom_interval: transaction.custom_interval || undefined,
    };

    const schedule = generateSchedule(def, {
      startDate,
      endDate,
      currentDate: new Date().toISOString().split('T')[0],
    });

    return schedule.map(occurrence => ({
      date: occurrence.date,
      amount: transaction.amount_type === 'variable' 
        ? (transaction.estimated_amount || transaction.amount || 0)
        : (transaction.amount || 0),
      status: occurrence.status,
    }));
  } catch (error) {
    console.error('Error generating upcoming payments:', error);
    return [];
  }
}
