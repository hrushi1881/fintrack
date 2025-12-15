/**
 * Scheduled Payments Utilities
 * CRUD operations for one-time future payments
 */

import { supabase } from '@/lib/supabase';
import { calculateStatus as calculateRecurrenceStatus, getDaysUntil } from '@/utils/recurrence';

export interface ScheduledPayment {
  id: string;
  user_id: string;
  name: string; // Database column name (maps to title in UI)
  category_id?: string;
  amount: number;
  type?: 'income' | 'expense';
  account_id?: string; // Database column name (maps to linked_account_id in UI)
  fund_type?: string;
  scheduled_date: string;
  due_date: string;
  created_date?: string;
  status: 'scheduled' | 'due_today' | 'overdue' | 'paid' | 'cancelled' | 'skipped' | 'postponed';
  status_changed_at?: string;
  confirmed?: boolean;
  confirmed_date?: string;
  actual_amount?: number;
  actual_date?: string;
  transaction_id?: string; // Database column name (maps to related_transaction_id)
  skip_reason?: string;
  notes?: string;
  reminder_sent?: boolean;
  reminder_sent_at?: string;
  notification_ids?: string[];
  linked_recurring_transaction_id?: string;
  recurring_transaction_id?: string;
  // Computed properties for backward compatibility
  title?: string; // Alias for name
  linked_account_id?: string; // Alias for account_id
  related_transaction_id?: string; // Alias for transaction_id
}

export interface CreateScheduledPaymentData {
  title: string; // Will be saved as 'name' in database
  category_id?: string;
  amount: number;
  type?: 'income' | 'expense';
  due_date: string;
  linked_account_id?: string; // Will be saved as 'account_id' in database
  fund_type?: 'personal' | 'liability' | 'goal';
  linked_recurring_transaction_id?: string;
  recurring_transaction_id?: string;
  notes?: string;
}

export interface UpdateScheduledPaymentData {
  id: string;
  title?: string;
  category_id?: string;
  amount?: number;
  type?: 'income' | 'expense';
  due_date?: string;
  linked_account_id?: string;
  fund_type?: 'personal' | 'liability' | 'goal';
  linked_recurring_transaction_id?: string;
  notes?: string;
  status?: ScheduledPayment['status'];
}

/**
 * Calculate scheduled payment status
 */
export function calculateScheduledPaymentStatus(payment: ScheduledPayment): ScheduledPayment['status'] {
  if (payment.status === 'paid') return 'paid';
  if (payment.status === 'cancelled') return 'cancelled';
  if (payment.status === 'skipped') return 'skipped';
  if (payment.status === 'postponed') return 'postponed';

  const today = new Date().toISOString().split('T')[0];
  const status = calculateRecurrenceStatus(payment.due_date, today, payment.status as any);

  switch (status) {
    case 'upcoming':
      return 'scheduled';
    case 'due_today':
      return 'due_today';
    case 'overdue':
      return 'overdue';
    default:
      return payment.status;
  }
}

/**
 * Fetch all scheduled payments for a user
 */
export async function fetchScheduledPayments(
  userId: string,
  filters: {
    status?: string[];
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
  } = {}
): Promise<ScheduledPayment[]> {
  try {
    let query = supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('due_date', { ascending: true });

    if (filters.status && filters.status.length > 0) {
      query = query.in('status', filters.status);
    }

    if (filters.start_date) {
      query = query.gte('due_date', filters.start_date);
    }

    if (filters.end_date) {
      query = query.lte('due_date', filters.end_date);
    }

    if (filters.is_active !== undefined) {
      // Map is_active filter to status filter
      if (filters.is_active) {
        query = query.in('status', ['scheduled', 'due_today', 'overdue']);
      } else {
        query = query.in('status', ['paid', 'cancelled', 'skipped']);
      }
    }

    const { data, error } = await query;

    if (error) throw error;

    // Calculate status for each payment and map fields
    const payments = (data || []).map(payment => ({
      ...payment,
      title: payment.name, // Map name to title
      linked_account_id: payment.account_id, // Map account_id to linked_account_id
      related_transaction_id: payment.transaction_id, // Map transaction_id to related_transaction_id
      status: calculateScheduledPaymentStatus(payment as ScheduledPayment),
    }));

    return payments as ScheduledPayment[];
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    throw error;
  }
}

/**
 * Fetch a single scheduled payment by ID
 */
export async function fetchScheduledPaymentById(id: string): Promise<ScheduledPayment | null> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.user.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw error;
    }

    const payment = data as ScheduledPayment;
    return {
      ...payment,
      title: payment.name, // Map name to title
      linked_account_id: payment.account_id, // Map account_id to linked_account_id
      related_transaction_id: payment.transaction_id, // Map transaction_id to related_transaction_id
      status: calculateScheduledPaymentStatus(payment),
    };
  } catch (error) {
    console.error('Error fetching scheduled payment:', error);
    throw error;
  }
}

/**
 * Create a new scheduled payment
 */
export async function createScheduledPayment(
  data: CreateScheduledPaymentData
): Promise<ScheduledPayment> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const today = new Date().toISOString().split('T')[0];
    const status = calculateRecurrenceStatus(data.due_date, today);

    const { data: payment, error } = await supabase
      .from('scheduled_transactions')
      .insert({
        user_id: user.user.id,
        name: data.title, // Map title to name column
        category_id: data.category_id,
        amount: data.amount,
        type: data.type || 'expense',
        due_date: data.due_date,
        scheduled_date: today,
        account_id: data.linked_account_id, // Map linked_account_id to account_id column
        fund_type: data.fund_type || 'personal',
        linked_recurring_transaction_id: data.linked_recurring_transaction_id,
        recurring_transaction_id: data.recurring_transaction_id,
        status: status === 'upcoming' ? 'scheduled' : (status === 'due_today' ? 'due_today' : 'overdue'),
        notes: data.notes,
      })
      .select()
      .single();

    if (error) throw error;

    // Map database fields back to interface for consistency
    return {
      ...payment,
      title: payment.name,
      linked_account_id: payment.account_id,
      related_transaction_id: payment.transaction_id,
    } as ScheduledPayment;
  } catch (error) {
    console.error('Error creating scheduled payment:', error);
    throw error;
  }
}

/**
 * Update a scheduled payment
 */
export async function updateScheduledPayment(
  data: UpdateScheduledPaymentData
): Promise<ScheduledPayment> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Recalculate status if due_date changed
    let status: ScheduledPayment['status'] | undefined = data.status;
    if (data.due_date && !data.status) {
      const today = new Date().toISOString().split('T')[0];
      const current = await fetchScheduledPaymentById(data.id);
      const calculatedStatus = calculateRecurrenceStatus(
        data.due_date, 
        today,
        current?.status as any
      );
      
      switch (calculatedStatus) {
        case 'upcoming':
          status = 'scheduled';
          break;
        case 'due_today':
          status = 'due_today';
          break;
        case 'overdue':
          status = 'overdue';
          break;
      }
    }

    // Build update object with correct column names
    const updateData: Record<string, any> = {};
    if (data.title !== undefined) updateData.name = data.title;
    if (data.category_id !== undefined) updateData.category_id = data.category_id;
    if (data.amount !== undefined) updateData.amount = data.amount;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.due_date !== undefined) updateData.due_date = data.due_date;
    if (data.linked_account_id !== undefined) updateData.account_id = data.linked_account_id;
    if (data.fund_type !== undefined) updateData.fund_type = data.fund_type;
    if (data.linked_recurring_transaction_id !== undefined) updateData.linked_recurring_transaction_id = data.linked_recurring_transaction_id;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (status !== undefined) updateData.status = status;
    updateData.status_changed_at = new Date().toISOString();

    const { data: payment, error } = await supabase
      .from('scheduled_transactions')
      .update(updateData)
      .eq('id', data.id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    return {
      ...payment,
      title: payment.name,
      linked_account_id: payment.account_id,
      related_transaction_id: payment.transaction_id,
      status: calculateScheduledPaymentStatus(payment as ScheduledPayment),
    } as ScheduledPayment;
  } catch (error) {
    console.error('Error updating scheduled payment:', error);
    throw error;
  }
}

/**
 * Delete a scheduled payment (soft delete)
 */
export async function deleteScheduledPayment(id: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('scheduled_transactions')
      .update({
        status: 'cancelled',
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.user.id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting scheduled payment:', error);
    throw error;
  }
}

/**
 * Mark a scheduled payment as paid
 */
export async function markScheduledPaymentPaid(
  id: string,
  transactionId?: string
): Promise<ScheduledPayment> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: payment, error } = await supabase
      .from('scheduled_transactions')
      .update({
        status: 'paid',
        confirmed: true,
        confirmed_date: new Date().toISOString(),
        transaction_id: transactionId, // Correct column name
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    return {
      ...payment,
      title: payment.name,
      linked_account_id: payment.account_id,
      related_transaction_id: payment.transaction_id,
    } as ScheduledPayment;
  } catch (error) {
    console.error('Error marking scheduled payment as paid:', error);
    throw error;
  }
}

