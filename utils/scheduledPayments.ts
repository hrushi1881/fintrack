/**
 * Scheduled Payments Utilities
 * CRUD operations for one-time future payments
 */

import { supabase } from '@/lib/supabase';
import { calculateStatus as calculateRecurrenceStatus, getDaysUntil } from '@/utils/recurrence';

export interface ScheduledPayment {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  category_id?: string;
  amount: number;
  currency: string;
  due_date: string;
  scheduled_date: string;
  linked_account_id?: string;
  fund_type: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  linked_recurring_transaction_id?: string;
  status: 'scheduled' | 'due_today' | 'overdue' | 'paid' | 'cancelled' | 'skipped' | 'postponed';
  remind_before: boolean;
  reminder_days: number[];
  color: string;
  icon: string;
  tags?: string[];
  notes?: string;
  metadata?: any;
  related_transaction_id?: string;
  linked_bill_id?: string;
  // is_active is computed from status (status in ['scheduled', 'due_today', 'overdue'])
  is_active?: boolean; // Optional, computed property
  // is_deleted is computed from status (status === 'cancelled')
  is_deleted?: boolean; // Optional, computed property
  deleted_at?: string;
  paid_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduledPaymentData {
  title: string;
  description?: string;
  category_id?: string;
  amount: number;
  currency: string;
  due_date: string;
  linked_account_id?: string;
  fund_type?: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  linked_recurring_transaction_id?: string;
  remind_before?: boolean;
  reminder_days?: number[];
  color?: string;
  icon?: string;
  tags?: string[];
  notes?: string;
  metadata?: any;
}

export interface UpdateScheduledPaymentData extends Partial<CreateScheduledPaymentData> {
  id: string;
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

    // Calculate status for each payment
    const payments = (data || []).map(payment => ({
      ...payment,
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
        title: data.title,
        description: data.description,
        category_id: data.category_id,
        amount: data.amount,
        currency: data.currency,
        due_date: data.due_date,
        scheduled_date: today,
        linked_account_id: data.linked_account_id,
        fund_type: data.fund_type || 'personal',
        specific_fund_id: data.specific_fund_id,
        linked_recurring_transaction_id: data.linked_recurring_transaction_id,
        status: status === 'upcoming' ? 'scheduled' : (status === 'due_today' ? 'due_today' : 'overdue'),
        remind_before: data.remind_before !== false,
        reminder_days: data.reminder_days || [7, 3, 1],
        color: data.color || '#F59E0B',
        icon: data.icon || 'calendar',
        tags: data.tags,
        notes: data.notes,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;

    return payment as ScheduledPayment;
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
    let status: ScheduledPayment['status'] | undefined = undefined;
    if (data.due_date) {
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

    const updateData: any = {
      ...data,
      id: undefined, // Remove id from update data
    };

    if (status !== undefined) {
      updateData.status = status;
    }

    const { data: payment, error } = await supabase
      .from('scheduled_transactions')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    return {
      ...payment,
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
        updated_at: new Date().toISOString(),
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
        paid_at: new Date().toISOString(),
        related_transaction_id: transactionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;

    return payment as ScheduledPayment;
  } catch (error) {
    console.error('Error marking scheduled payment as paid:', error);
    throw error;
  }
}

