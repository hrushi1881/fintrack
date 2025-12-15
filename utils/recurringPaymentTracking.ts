/**
 * Recurring Transaction Payment Tracking
 * 
 * Flexible payment tracking system for recurring transaction containers.
 * Supports multiple tracking methods:
 * - 'bill': Creates bills
 * - 'scheduled_transaction': Creates scheduled transactions
 * - 'direct': Creates transactions directly
 * - 'manual': Just tracks cycles, user creates payments manually
 */

import { supabase } from '@/lib/supabase';
import { Cycle } from './cycles';
import { RecurringTransaction } from './recurringTransactions';
import { 
  generateCyclesForRecurringTransaction,
  findBillForCycle,
  getCyclesNeedingBillsToday 
} from './recurringTransactionCycles';
import { createBill, CreateBillData } from './bills';
import { DEFAULT_CURRENCY } from './currency';
import { createScheduledPayment, CreateScheduledPaymentData } from './scheduledPayments';
import { mapUiToDbFrequency } from './frequency';

/**
 * Create payment tracking for a cycle based on container's payment_tracking_method
 */
export async function createPaymentTrackingForCycle(
  container: RecurringTransaction,
  cycle: Cycle,
  userId: string
): Promise<{ id: string; type: 'bill' | 'scheduled_transaction' | 'direct' | 'manual' }> {
  const trackingMethod = container.payment_tracking_method || 'scheduled_transaction';
  validateFundType(container.fund_type);
  validateCategory(container.category_id);

  // Stop generation for non-active containers
  if (container.status && container.status !== 'active') {
    return { id: `cycle-${cycle.cycleNumber}`, type: 'manual' };
  }

  switch (trackingMethod) {
    case 'bill': {
      // Prefer scheduled transaction; if it exists, reuse instead of creating a bill
      const existingScheduled = await findScheduledForCycle(container.id, cycle.cycleNumber, userId);
      if (existingScheduled) {
        return { id: existingScheduled.id, type: 'scheduled_transaction' };
      }
      return await createBillForCycle(container, cycle, userId);
    }
    
    case 'scheduled_transaction':
      return await createScheduledTransactionForCycle(container, cycle, userId);
    
    case 'direct':
      return await createDirectTransactionForCycle(container, cycle, userId);
    
    case 'manual':
      // Manual mode - just return cycle info, no payment tracking created
      return {
        id: `cycle-${cycle.cycleNumber}`,
        type: 'manual'
      };
    
    default:
      // Default to bill
      return await createBillForCycle(container, cycle, userId);
  }
}

/**
 * Create bill for a cycle
 */
async function createBillForCycle(
  container: RecurringTransaction,
  cycle: Cycle,
  userId: string
): Promise<{ id: string; type: 'bill' }> {
  validateFundType(container.fund_type);
  validateCategory(container.category_id);
  // Require account when creating a bill from a cycle (enforces payability)
  if (!container.linked_account_id) {
    throw new Error('Cannot create bill without a linked account');
  }
  // Check if bill already exists
  const existingBill = await findBillForCycle(container.id, cycle.cycleNumber);
  if (existingBill) {
    return { id: existingBill.id, type: 'bill' };
  }
  // Guard against scheduled already present
  const existingScheduled = await findScheduledForCycle(container.id, cycle.cycleNumber, userId);
  if (existingScheduled) {
    return { id: existingScheduled.id, type: 'scheduled_transaction' };
  }

  // Get cycle overrides if any
  const { getCycleOverrides } = await import('./recurringCycleScheduling');
  const overrides = getCycleOverrides(container);
  const override = overrides[cycle.cycleNumber];

  const billAmount = override?.expectedAmount ?? cycle.expectedAmount;
  const billDate = override?.expectedDate ?? cycle.expectedDate;

  // Determine bill type
  const billType = container.amount_type === 'variable' 
    ? 'recurring_variable' 
    : 'recurring_fixed';

  const frequency = mapUiToDbFrequency(container.frequency);

  const billTitle = container.title || (container as any).name || 'Recurring payment';
  const billData: CreateBillData = {
    user_id: userId,
    title: billTitle,
    description: `${billTitle} - Cycle ${cycle.cycleNumber}`,
    amount: billAmount,
    currency: container.currency || DEFAULT_CURRENCY,
    due_date: billDate,
    original_due_date: billDate,
    bill_type: billType,
    recurrence_pattern: frequency,
    recurrence_interval: container.interval || 1,
    category_id: container.category_id || null,
    linked_account_id: container.linked_account_id || null,
    metadata: {
      recurring_transaction_id: container.id,
      cycle_number: cycle.cycleNumber,
      cycle_start_date: cycle.startDate,
      cycle_end_date: cycle.endDate,
      expected_date: cycle.expectedDate,
      payment_tracking_method: 'bill',
    },
  };

  const bill = await createBill(billData);
  return { id: bill.id, type: 'bill' };
}

/**
 * Create scheduled transaction for a cycle
 */
async function createScheduledTransactionForCycle(
  container: RecurringTransaction,
  cycle: Cycle,
  userId: string
): Promise<{ id: string; type: 'scheduled_transaction' }> {
  validateFundType(container.fund_type);
  validateCategory(container.category_id);
  if (!container.linked_account_id) {
    throw new Error('Cannot create scheduled transaction without a linked account');
  }
  // Check if scheduled transaction already exists
  const { data: existing } = await supabase
    .from('scheduled_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('linked_recurring_transaction_id', container.id)
    .eq('metadata->>cycle_number', cycle.cycleNumber.toString())
    .maybeSingle();

  if (existing) {
    return { id: existing.id, type: 'scheduled_transaction' };
  }

  // Get cycle overrides if any
  const { getCycleOverrides } = await import('./recurringCycleScheduling');
  const overrides = getCycleOverrides(container);
  const override = overrides[cycle.cycleNumber];

  const amount = override?.expectedAmount ?? cycle.expectedAmount;
  const dueDate = override?.expectedDate ?? cycle.expectedDate;

  const scheduledTitle = container.title || (container as any).name || 'Recurring payment';
  const scheduledPaymentData: CreateScheduledPaymentData = {
    title: scheduledTitle,
    category_id: container.category_id,
    amount: amount,
    type: container.type as 'income' | 'expense',
    due_date: dueDate,
    linked_account_id: container.linked_account_id,
    fund_type: (container.fund_type || 'personal') as 'personal' | 'liability' | 'goal',
    linked_recurring_transaction_id: container.id,
    recurring_transaction_id: container.id,
    notes: `${scheduledTitle} - Cycle ${cycle.cycleNumber}`,
  };

  const scheduledPayment = await createScheduledPayment(scheduledPaymentData);
  return { id: scheduledPayment.id, type: 'scheduled_transaction' };
}

/**
 * Create direct transaction for a cycle
 */
async function createDirectTransactionForCycle(
  container: RecurringTransaction,
  cycle: Cycle,
  userId: string
): Promise<{ id: string; type: 'direct' }> {
  validateFundType(container.fund_type);
  validateCategory(container.category_id);
  if (!container.linked_account_id) {
    throw new Error('Cannot create direct transaction without a linked account');
  }
  // Check if transaction already exists
  const { data: existing } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('metadata->>recurring_transaction_id', container.id)
    .eq('metadata->>cycle_number', cycle.cycleNumber.toString())
    .maybeSingle();

  if (existing) {
    return { id: existing.id, type: 'direct' };
  }

  // Get cycle overrides if any
  const { getCycleOverrides } = await import('./recurringCycleScheduling');
  const overrides = getCycleOverrides(container);
  const override = overrides[cycle.cycleNumber];

  const amount = override?.expectedAmount ?? cycle.expectedAmount;
  const transactionDate = override?.expectedDate ?? cycle.expectedDate;

  // Create transaction directly
  const { data: transaction, error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: container.linked_account_id,
      category_id: container.category_id,
      type: container.direction,
      amount: container.direction === 'expense' ? -Math.abs(amount) : Math.abs(amount),
      currency: container.currency || DEFAULT_CURRENCY,
      date: transactionDate,
      description: `${container.title} - Cycle ${cycle.cycleNumber}`,
      fund_type: container.fund_type || 'personal',
      specific_fund_id: container.specific_fund_id,
      metadata: {
        recurring_transaction_id: container.id,
        cycle_number: cycle.cycleNumber,
        cycle_start_date: cycle.startDate,
        cycle_end_date: cycle.endDate,
        expected_date: cycle.expectedDate,
        payment_tracking_method: 'direct',
        auto_created: true,
      },
    })
    .select()
    .single();

  if (error) throw error;
  return { id: transaction.id, type: 'direct' };
}

async function findScheduledForCycle(
  recurringId: string,
  cycleNumber: number,
  userId: string
) {
  const { data } = await supabase
    .from('scheduled_transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('linked_recurring_transaction_id', recurringId)
    .eq('metadata->>cycle_number', cycleNumber.toString())
    .maybeSingle();
  return data;
}

function validateFundType(fundType?: string) {
  const allowed = ['personal', 'borrowed', 'goal'];
  if (fundType && !allowed.includes(fundType)) {
    throw new Error('Invalid fund type. Allowed: personal, borrowed, goal');
  }
}

function validateCategory(categoryId?: string | null) {
  if (!categoryId) return;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(categoryId)) {
    throw new Error('Invalid category id; must be a UUID');
  }
}

/**
 * Process recurring transactions and create payment tracking for cycles that need them today
 * This is the main function called by the daily background job
 */
export async function processRecurringTransactionsForToday(
  today: string = new Date().toISOString().split('T')[0]
): Promise<{ processed: number; created: number; errors: string[] }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      throw new Error('User not authenticated');
    }

    // Fetch all active recurring transactions
    const { data: containers, error: fetchError } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('status', 'active')
      .eq('is_active', true)
      .eq('is_deleted', false)
      .eq('auto_create', true);

    if (fetchError) throw fetchError;
    if (!containers || containers.length === 0) {
      return { processed: 0, created: 0, errors: [] };
    }

    let created = 0;
    const errors: string[] = [];

    for (const container of containers) {
      try {
        // Generate cycles for this container
        const cycles = generateCyclesForRecurringTransaction(container as RecurringTransaction);

        // Get days_before setting (default: 3)
        const daysBefore = container.auto_create_days_before || 3;

        // Find cycles that need payment tracking created today
        const cyclesNeedingTracking = getCyclesNeedingBillsToday(cycles, today, daysBefore);

        // Create payment tracking for each cycle based on container's method
        for (const cycle of cyclesNeedingTracking) {
          await createPaymentTrackingForCycle(
            container as RecurringTransaction,
            cycle,
            user.user.id
          );
          created++;
        }
      } catch (error: any) {
        console.error(`Error processing container ${container.id}:`, error);
        errors.push(`Container ${container.title}: ${error.message}`);
      }
    }

    return {
      processed: containers.length,
      created,
      errors,
    };
  } catch (error: any) {
    console.error('Error processing recurring transactions:', error);
    throw error;
  }
}

/**
 * Get payment tracking for a cycle
 * Returns the payment tracking entity (bill, scheduled transaction, or transaction) if it exists
 */
export async function getPaymentTrackingForCycle(
  containerId: string,
  cycleNumber: number,
  trackingMethod: 'bill' | 'scheduled_transaction' | 'direct' | 'manual'
): Promise<any | null> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return null;

  switch (trackingMethod) {
    case 'bill':
      return await findBillForCycle(containerId, cycleNumber);
    
    case 'scheduled_transaction':
      const { data: scheduled } = await supabase
        .from('scheduled_transactions')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('linked_recurring_transaction_id', containerId)
        .eq('metadata->>cycle_number', cycleNumber.toString())
        .maybeSingle();
      return scheduled;
    
    case 'direct':
      const { data: transaction } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.user.id)
        .eq('metadata->>recurring_transaction_id', containerId)
        .eq('metadata->>cycle_number', cycleNumber.toString())
        .maybeSingle();
      return transaction;
    
    case 'manual':
      // Manual mode - no tracking entity, just return cycle info
      return { type: 'manual', cycleNumber };
    
    default:
      return null;
  }
}


