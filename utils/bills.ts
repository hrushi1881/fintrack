import { supabase } from '../lib/supabase';
import { Bill, BillPayment } from '../types';

export interface BillFilters {
  status?: string;
  billType?: string;
  categoryId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface CreateBillData {
  title: string;
  description?: string;
  amount?: number;
  currency: string;
  category_id?: string;
  bill_type: 'one_time' | 'recurring_fixed' | 'recurring_variable' | 'goal_linked';
  recurrence_pattern?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  recurrence_interval?: number;
  custom_recurrence_config?: any;
  due_date: string;
  original_due_date?: string;
  recurrence_end_date?: string;
  goal_id?: string;
  linked_account_id?: string;
  color: string;
  icon: string;
  reminder_days: number[];
  notes?: string;
  metadata?: any;
}

export interface UpdateBillData extends Partial<CreateBillData> {
  id: string;
}

export interface PaymentData {
  amount: number;
  currency: string;
  payment_date: string;
  actual_due_date: string;
  account_id: string; // Required - no longer optional
  payment_status: 'completed' | 'partial' | 'failed';
  notes?: string;
  // create_transaction removed - always create transaction now
  generate_next?: boolean;
}

/**
 * Calculate bill status based on due date and current status
 */
export function calculateBillStatus(bill: Bill): Bill['status'] {
  const today = new Date();
  const dueDate = new Date(bill.due_date);
  
  if (bill.status === 'paid') return 'paid';
  if (bill.status === 'cancelled') return 'cancelled';
  if (bill.status === 'skipped') return 'skipped';
  if (bill.status === 'postponed') return 'postponed';
  
  if (today > dueDate) return 'overdue';
  if (today.toDateString() === dueDate.toDateString()) return 'due_today';
  return 'upcoming';
}

/**
 * Fetch bills for a user with optional filtering
 */
export async function fetchBills(
  userId: string, 
  filters: BillFilters = {}
): Promise<Bill[]> {
  try {
    let query = supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('due_date', { ascending: true });

    // Apply status filter
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // Apply bill type filter
    if (filters.billType) {
      query = query.eq('bill_type', filters.billType);
    }

    // Apply category filter
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    // Apply search filter
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    // Apply date filters
    if (filters.startDate) {
      query = query.gte('due_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('due_date', filters.endDate);
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching bills:', error);
      throw error;
    }

    // Calculate status for each bill
    const bills = (data || []).map(bill => ({
      ...bill,
      status: calculateBillStatus(bill)
    }));

    return bills;
  } catch (error) {
    console.error('Error in fetchBills:', error);
    throw error;
  }
}

/**
 * Fetch a single bill by ID
 */
export async function fetchBillById(billId: string): Promise<Bill | null> {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('id', billId)
      .eq('is_deleted', false)
      .single();

    if (error) {
      console.error('Error fetching bill:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      status: calculateBillStatus(data)
    };
  } catch (error) {
    console.error('Error in fetchBillById:', error);
    throw error;
  }
}

/**
 * Create a new bill
 */
export async function createBill(data: CreateBillData): Promise<Bill> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: bill, error } = await supabase
      .from('bills')
      .insert({
        user_id: user.user.id,
        title: data.title,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        category_id: data.category_id || null,
        bill_type: data.bill_type,
        recurrence_pattern: data.recurrence_pattern,
        recurrence_interval: data.recurrence_interval || 1,
        custom_recurrence_config: data.custom_recurrence_config,
        due_date: data.due_date,
        original_due_date: data.original_due_date || data.due_date,
        recurrence_end_date: data.recurrence_end_date || null,
        goal_id: data.goal_id || null,
        linked_account_id: data.linked_account_id || null,
        color: data.color,
        icon: data.icon,
        reminder_days: data.reminder_days,
        notes: data.notes,
        metadata: data.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bill:', error);
      throw error;
    }

    return {
      ...bill,
      status: calculateBillStatus(bill)
    };
  } catch (error) {
    console.error('Error in createBill:', error);
    throw error;
  }
}

/**
 * Update an existing bill
 */
export async function updateBill(data: UpdateBillData): Promise<Bill> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: bill, error } = await supabase
      .from('bills')
      .update({
        title: data.title,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        category_id: data.category_id || null,
        bill_type: data.bill_type,
        recurrence_pattern: data.recurrence_pattern,
        recurrence_interval: data.recurrence_interval,
        custom_recurrence_config: data.custom_recurrence_config,
        due_date: data.due_date,
        original_due_date: data.original_due_date,
        recurrence_end_date: data.recurrence_end_date || null,
        goal_id: data.goal_id || null,
        linked_account_id: data.linked_account_id || null,
        color: data.color,
        icon: data.icon,
        reminder_days: data.reminder_days,
        notes: data.notes,
        metadata: data.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating bill:', error);
      throw error;
    }

    return {
      ...bill,
      status: calculateBillStatus(bill)
    };
  } catch (error) {
    console.error('Error in updateBill:', error);
    throw error;
  }
}

/**
 * Delete a bill (soft delete)
 */
export async function deleteBill(billId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error deleting bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in deleteBill:', error);
    throw error;
  }
}

/**
 * Mark a bill as paid
 */
export async function markBillAsPaid(billId: string, paymentData: PaymentData): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get the bill
    const bill = await fetchBillById(billId);
    if (!bill) throw new Error('Bill not found');

    // Use unified fund-bucket RPC to create the expense transaction and adjust balances
    // Default to personal funds when called from utility (UI flow uses FundPicker directly)
    const bucketParam = { type: 'personal', id: null } as const;

    // Ensure category id (can be null)
    const categoryId = bill.category_id && typeof bill.category_id === 'string'
      ? bill.category_id.trim()
      : null;

    const { data: rpcResult, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
      p_user_id: user.user.id,
      p_account_id: paymentData.account_id,
      p_bucket: bucketParam,
      p_amount: paymentData.amount,
      p_category: categoryId,
      p_description: `Payment for ${bill.title}`,
      p_date: paymentData.payment_date,
      p_currency: paymentData.currency,
    });

    if (rpcError) {
      console.error('Bucket RPC error (spend_from_account_bucket):', rpcError);
      throw rpcError;
    }

    const createdTransactionId = (rpcResult as any)?.id || (rpcResult as any)?.transaction_id || null;

    // If we got a transaction id, attach bill metadata for richer context
    if (createdTransactionId) {
      const { error: metaErr } = await supabase
        .from('transactions')
        .update({
          metadata: {
            bill_id: billId,
            bucket: 'personal',
          },
        })
        .eq('id', createdTransactionId);
      if (metaErr) {
        // Non-fatal: continue but log
        console.warn('Failed to attach bill metadata to transaction:', metaErr);
      }
    }

    // Create bill payment record (linking transaction if present)
    const { error: paymentError } = await supabase
      .from('bill_payments')
      .insert({
        bill_id: billId,
        user_id: user.user.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_date: paymentData.payment_date,
        actual_due_date: paymentData.actual_due_date,
        account_id: paymentData.account_id,
        payment_status: paymentData.payment_status,
        notes: paymentData.notes,
        transaction_id: createdTransactionId,
      });

    if (paymentError) {
      console.error('Error creating bill payment:', paymentError);
      throw paymentError;
    }

    // Update bill status
    const { error: billError } = await supabase
      .from('bills')
      .update({
        status: 'paid',
        last_paid_date: paymentData.payment_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId);

    if (billError) {
      console.error('Error updating bill status:', billError);
      throw billError;
    }

    // Generate next bill occurrence if requested and bill is recurring
    if (paymentData.generate_next && bill.bill_type !== 'one_time') {
      try {
        await supabase.rpc('generate_next_bill_instance', {
          bill_uuid: billId
        });
      } catch (error) {
        console.error('Error generating next bill occurrence:', error);
        // Don't throw here, as the payment was successful
      }
    }
  } catch (error) {
    console.error('Error in markBillAsPaid:', error);
    throw error;
  }
}

/**
 * Postpone a bill to a new due date
 */
export async function postponeBill(billId: string, newDueDate: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        due_date: newDueDate,
        status: 'postponed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error postponing bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in postponeBill:', error);
    throw error;
  }
}

/**
 * Skip a bill for the current cycle
 */
export async function skipBill(billId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        status: 'skipped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error skipping bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in skipBill:', error);
    throw error;
  }
}

/**
 * Cancel a recurring bill
 */
export async function cancelBill(billId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error cancelling bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in cancelBill:', error);
    throw error;
  }
}

/**
 * Get payment history for a bill
 */
export async function getBillPaymentHistory(billId: string): Promise<BillPayment[]> {
  try {
    const { data, error } = await supabase
      .from('bill_payments')
      .select(`
        *,
        accounts!inner(name, type, color, icon)
      `)
      .eq('bill_id', billId)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('Error fetching bill payment history:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getBillPaymentHistory:', error);
    throw error;
  }
}

/**
 * Get upcoming bills for a user
 */
export async function getUpcomingBills(userId: string, days: number = 7): Promise<Bill[]> {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    return fetchBills(userId, {
      startDate: new Date().toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      status: 'upcoming'
    });
  } catch (error) {
    console.error('Error in getUpcomingBills:', error);
    throw error;
  }
}


/**
 * Generate next bill occurrence for recurring bills
 */
export async function generateNextBillOccurrence(billId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('generate_next_bill_instance', {
      bill_uuid: billId
    });

    if (error) {
      console.error('Error generating next bill occurrence:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in generateNextBillOccurrence:', error);
    throw error;
  }
}

/**
 * Update bill statuses (run this periodically)
 */
export async function updateBillStatuses(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('update_bill_statuses');

    if (error) {
      console.error('Error updating bill statuses:', error);
      throw error;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in updateBillStatuses:', error);
    throw error;
  }
}

/**
 * Calculate bill statistics for analytics
 */
export async function calculateBillStatistics(userId: string, timeRange: string = '1 month') {
  try {
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_deleted', false);

    if (error) throw error;

    const now = new Date();
    const upcomingBills = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      return dueDate > now && bill.status !== 'paid' && bill.status !== 'cancelled';
    }) || [];

    const overdueBills = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      return dueDate < now && bill.status !== 'paid' && bill.status !== 'cancelled';
    }) || [];

    const dueTodayBills = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const today = new Date();
      return dueDate.toDateString() === today.toDateString() && bill.status !== 'paid';
    }) || [];

    const totalUpcoming = upcomingBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const totalOverdue = overdueBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const totalDueToday = dueTodayBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    return {
      totalBills: bills?.length || 0,
      upcomingBills: upcomingBills.length,
      overdueBills: overdueBills.length,
      dueTodayBills: dueTodayBills.length,
      paidBills: bills?.filter(bill => bill.status === 'paid').length || 0,
      totalUpcomingAmount: totalUpcoming,
      totalOverdueAmount: totalOverdue,
      totalDueTodayAmount: totalDueToday,
      thisMonthTotal: bills?.reduce((sum, bill) => sum + (bill.amount || 0), 0) || 0
    };
  } catch (error) {
    console.error('Error calculating bill statistics:', error);
    return {
      totalBills: 0,
      upcomingBills: 0,
      overdueBills: 0,
      dueTodayBills: 0,
      paidBills: 0,
      totalUpcomingAmount: 0,
      totalOverdueAmount: 0,
      totalDueTodayAmount: 0,
      thisMonthTotal: 0
    };
  }
}

/**
 * Get bills that need notifications based on reminder days
 */
export async function getBillsForNotification(userId: string): Promise<{
  dueToday: Bill[];
  overdue: Bill[];
  upcoming: Bill[];
}> {
  try {
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .in('status', ['upcoming', 'due_today', 'overdue']);

    if (error) throw error;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const dueToday = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const billDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      return billDate.getTime() === today.getTime() && bill.status !== 'paid';
    }) || [];

    const overdue = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const billDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      return billDate < today && bill.status !== 'paid';
    }) || [];

    const upcoming = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const billDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const daysUntilDue = Math.ceil((billDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilDue > 0 && daysUntilDue <= 7 && bill.status !== 'paid';
    }) || [];

    return { dueToday, overdue, upcoming };
  } catch (error) {
    console.error('Error getting bills for notification:', error);
    throw error;
  }
}

/**
 * Generate notification message for bills
 */
export function generateBillNotificationMessage(bills: {
  dueToday: Bill[];
  overdue: Bill[];
  upcoming: Bill[];
}): string[] {
  const messages: string[] = [];

  if (bills.overdue.length > 0) {
    const totalOverdue = bills.overdue.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    messages.push(`🚨 ${bills.overdue.length} overdue bill${bills.overdue.length > 1 ? 's' : ''} totaling $${totalOverdue.toFixed(2)}`);
  }

  if (bills.dueToday.length > 0) {
    const totalDueToday = bills.dueToday.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    messages.push(`⚠️ ${bills.dueToday.length} bill${bills.dueToday.length > 1 ? 's' : ''} due today totaling $${totalDueToday.toFixed(2)}`);
  }

  if (bills.upcoming.length > 0) {
    const totalUpcoming = bills.upcoming.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    messages.push(`📅 ${bills.upcoming.length} bill${bills.upcoming.length > 1 ? 's' : ''} due this week totaling $${totalUpcoming.toFixed(2)}`);
  }

  return messages;
}
