/**
 * Recurring Cycle Scheduling Utilities
 * Functions for scheduling payments and assigning custom dates/amounts to specific cycles
 */

import { supabase } from '@/lib/supabase';
import { createScheduledPayment, ScheduledPayment } from '@/utils/scheduledPayments';
import { RecurringTransaction } from '@/utils/recurringTransactions';
import { Cycle } from '@/utils/cycles';

export interface CycleOverride {
  cycleNumber: number;
  expectedDate?: string; // Override the expected date for this cycle
  expectedAmount?: number; // Override the expected amount for this cycle
  minimumAmount?: number; // Minimum payment required to avoid late status
  notes?: string;
}

export interface CycleSchedule {
  cycleNumber: number;
  scheduledPaymentId?: string; // If a scheduled payment exists for this cycle
  override?: CycleOverride; // Custom override for this cycle
}

/**
 * Get cycle overrides from recurring transaction custom_pattern
 */
export function getCycleOverrides(recurringTransaction: RecurringTransaction): Record<number, CycleOverride> {
  const customPattern = recurringTransaction.custom_pattern || {};
  return customPattern.cycle_overrides || {};
}

/**
 * Set cycle override for a specific cycle
 */
export async function setCycleOverride(
  recurringTransactionId: string,
  cycleNumber: number,
  override: Partial<CycleOverride>
): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Fetch current recurring transaction
    const { data: rt, error: fetchError } = await supabase
      .from('recurring_transactions')
      .select('custom_pattern')
      .eq('id', recurringTransactionId)
      .eq('user_id', user.user.id)
      .single();

    if (fetchError) throw fetchError;

    const customPattern = rt?.custom_pattern || {};
    const cycleOverrides = customPattern.cycle_overrides || {};

    // Update or create override for this cycle
    cycleOverrides[cycleNumber] = {
      ...cycleOverrides[cycleNumber],
      ...override,
      cycleNumber,
    };

    // Update custom_pattern
    const { error: updateError } = await supabase
      .from('recurring_transactions')
      .update({
        custom_pattern: {
          ...customPattern,
          cycle_overrides: cycleOverrides,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', recurringTransactionId)
      .eq('user_id', user.user.id);

    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error setting cycle override:', error);
    throw error;
  }
}

/**
 * Remove cycle override
 */
export async function removeCycleOverride(
  recurringTransactionId: string,
  cycleNumber: number
): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Fetch current recurring transaction
    const { data: rt, error: fetchError } = await supabase
      .from('recurring_transactions')
      .select('custom_pattern')
      .eq('id', recurringTransactionId)
      .eq('user_id', user.user.id)
      .single();

    if (fetchError) throw fetchError;

    const customPattern = rt?.custom_pattern || {};
    const cycleOverrides = customPattern.cycle_overrides || {};

    // Remove override for this cycle
    delete cycleOverrides[cycleNumber];

    // Update custom_pattern
    const { error: updateError } = await supabase
      .from('recurring_transactions')
      .update({
        custom_pattern: {
          ...customPattern,
          cycle_overrides: cycleOverrides,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', recurringTransactionId)
      .eq('user_id', user.user.id);

    if (updateError) throw updateError;
  } catch (error) {
    console.error('Error removing cycle override:', error);
    throw error;
  }
}

/**
 * Schedule a payment for a specific cycle
 */
export async function scheduleCyclePayment(
  recurringTransaction: RecurringTransaction,
  cycle: Cycle,
  options: {
    amount?: number; // Override amount (defaults to cycle expectedAmount)
    dueDate?: string; // Override due date (defaults to cycle expectedDate)
    accountId?: string;
    notes?: string;
  } = {}
): Promise<ScheduledPayment> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const amount = options.amount ?? cycle.expectedAmount;
    const dueDate = options.dueDate ?? cycle.expectedDate;
    const accountId = options.accountId ?? recurringTransaction.account_id;

    // Create scheduled payment using only valid columns
    const scheduledPayment = await createScheduledPayment({
      title: recurringTransaction.title || recurringTransaction.name || `Cycle ${cycle.cycleNumber}`,
      category_id: recurringTransaction.category_id,
      amount: amount,
      type: recurringTransaction.type as 'income' | 'expense',
      due_date: dueDate,
      linked_account_id: accountId,
      fund_type: recurringTransaction.fund_type as 'personal' | 'liability' | 'goal',
      linked_recurring_transaction_id: recurringTransaction.id,
      recurring_transaction_id: recurringTransaction.id,
      notes: options.notes || `Scheduled payment for cycle ${cycle.cycleNumber}`,
    });

    // Also set cycle override to link to this scheduled payment
    await setCycleOverride(recurringTransaction.id, cycle.cycleNumber, {
      expectedDate: dueDate,
      expectedAmount: amount,
      notes: options.notes,
    });

    return scheduledPayment;
  } catch (error) {
    console.error('Error scheduling cycle payment:', error);
    throw error;
  }
}

/**
 * Get scheduled payments for a recurring transaction
 */
export async function getScheduledPaymentsForRecurring(
  recurringTransactionId: string
): Promise<ScheduledPayment[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('scheduled_transactions')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('linked_recurring_transaction_id', recurringTransactionId)
      .in('status', ['scheduled', 'due_today', 'overdue'])
      .order('due_date', { ascending: true });

    if (error) throw error;

    // Map database fields to interface
    return (data || []).map(payment => ({
      ...payment,
      title: payment.name,
      linked_account_id: payment.account_id,
      related_transaction_id: payment.transaction_id,
    })) as ScheduledPayment[];
  } catch (error) {
    console.error('Error fetching scheduled payments:', error);
    throw error;
  }
}

/**
 * Apply cycle overrides to cycles
 * This modifies the cycles array to include override values
 */
export function applyCycleOverrides(
  cycles: Cycle[],
  overrides: Record<number, CycleOverride>
): Cycle[] {
  return cycles.map((cycle) => {
    const override = overrides[cycle.cycleNumber];
    if (!override) return cycle;

    return {
      ...cycle,
      expectedDate: override.expectedDate || cycle.expectedDate,
      expectedAmount: override.expectedAmount ?? cycle.expectedAmount,
      minimumAmount: override.minimumAmount ?? cycle.minimumAmount,
      notes: override.notes || cycle.notes,
    };
  });
}

/**
 * Match scheduled payments to cycles
 */
export function matchScheduledPaymentsToCycles(
  cycles: Cycle[],
  scheduledPayments: ScheduledPayment[]
): Cycle[] {
  return cycles.map((cycle) => {
    // Find scheduled payment for this cycle
    const scheduledPayment = scheduledPayments.find((sp) => {
      const cycleNumber = sp.metadata?.cycle_number;
      return cycleNumber === cycle.cycleNumber;
    });

    if (!scheduledPayment) return cycle;

    // Update cycle with scheduled payment info
    return {
      ...cycle,
      expectedDate: scheduledPayment.due_date,
      expectedAmount: scheduledPayment.amount,
      notes: scheduledPayment.notes || cycle.notes,
      scheduledBill: {
        id: scheduledPayment.id,
        title: scheduledPayment.title || 'Scheduled Payment',
        dueDate: scheduledPayment.due_date,
        status: scheduledPayment.status || 'scheduled',
        amount: scheduledPayment.amount || 0,
      },
    };
  });
}

