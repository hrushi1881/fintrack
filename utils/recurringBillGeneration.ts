/**
 * Recurring Transaction Bill Generation
 * 
 * Generates bills from recurring transaction cycles (containers).
 * Each cycle gets one bill, created 3 days before cycle's expected date.
 * Bills respect cycle overrides (custom amounts and dates).
 */

import { supabase } from '@/lib/supabase';
import { Cycle } from './cycles';
import { createBill, CreateBillData } from './bills';
import { RecurringTransaction } from './recurringTransactions';
import { getCycleOverrides } from './recurringCycleScheduling';
import { 
  generateCyclesForRecurringTransaction,
  findBillForCycle,
  getCyclesNeedingBillsToday 
} from './recurringTransactionCycles';

export interface GenerateBillsFromRecurringOptions {
  recurringTransactionId: string;
  userId: string;
  cycles: Cycle[];
  maxBills?: number;
}

/**
 * Generate bills from recurring transaction cycles
 * Respects cycle overrides (custom amounts and dates)
 */
export async function generateBillsFromRecurringCycles(
  options: GenerateBillsFromRecurringOptions
): Promise<{ billsCreated: number; billIds: string[] }> {
  try {
    const { recurringTransactionId, userId, cycles, maxBills = 12 } = options;

    // Fetch recurring transaction
    const { data: recurringTransaction, error: rtError } = await supabase
      .from('recurring_transactions')
      .select('*')
      .eq('id', recurringTransactionId)
      .eq('user_id', userId)
      .single();

    if (rtError || !recurringTransaction) {
      throw new Error('Recurring transaction not found');
    }

    // Get cycle overrides
    const overrides = getCycleOverrides(recurringTransaction);

    // Check for existing bills linked to this recurring transaction
    const { data: existingBills } = await supabase
      .from('bills')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .not('metadata', 'is', null);

    // Extract existing cycle numbers from bills
    const existingCycleNumbers = new Set<number>();
    existingBills?.forEach(bill => {
      const cycleNumber = bill.metadata?.cycle_number;
      const rtId = bill.metadata?.recurring_transaction_id;
      if (cycleNumber && rtId === recurringTransactionId) {
        existingCycleNumbers.add(cycleNumber);
      }
    });

    const billIds: string[] = [];
    const cyclesToProcess = cycles.slice(0, maxBills);

    for (const cycle of cyclesToProcess) {
      // Skip if bill already exists for this cycle
      if (existingCycleNumbers.has(cycle.cycleNumber)) {
        continue;
      }

      // Apply cycle override if exists
      const override = overrides[cycle.cycleNumber];
      const billAmount = override?.expectedAmount ?? cycle.expectedAmount;
      const billDate = override?.expectedDate ?? cycle.expectedDate;

      // Determine bill type based on recurring transaction nature
      let billType: 'recurring_fixed' | 'recurring_variable' = 'recurring_fixed';
      if (recurringTransaction.amount_type === 'variable') {
        billType = 'recurring_variable';
      }

      // Map frequency
      const frequencyMap: Record<string, 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom'> = {
        'day': 'daily',
        'week': 'weekly',
        'month': 'monthly',
        'quarter': 'quarterly',
        'year': 'yearly',
        'custom': 'custom',
        'daily': 'daily',
        'weekly': 'weekly',
        'biweekly': 'biweekly',
        'monthly': 'monthly',
        'bimonthly': 'bimonthly',
        'quarterly': 'quarterly',
        'halfyearly': 'halfyearly',
        'yearly': 'yearly',
      };

      const dbFrequency = String(recurringTransaction.frequency || 'month').toLowerCase();
      const frequency = frequencyMap[dbFrequency] || 'monthly';

      // Create bill data
      const billTitle = recurringTransaction.title || (recurringTransaction as any).name || 'Recurring payment';
      const billData: CreateBillData = {
        user_id: userId,
        title: billTitle,
        description: `${billTitle} - Cycle ${cycle.cycleNumber} (${cycle.startDate} to ${cycle.endDate})`,
        amount: billAmount,
        currency: recurringTransaction.currency || DEFAULT_CURRENCY,
        due_date: billDate,
        original_due_date: billDate,
        bill_type: billType,
        recurrence_pattern: frequency === 'biweekly' || frequency === 'bimonthly' || frequency === 'quarterly' || frequency === 'halfyearly' 
          ? 'custom' 
          : frequency,
        recurrence_interval: recurringTransaction.interval || 1,
        category_id: recurringTransaction.category_id || null,
        linked_account_id: recurringTransaction.linked_account_id || null,
        frequency: frequency,
        nature: recurringTransaction.custom_pattern?.nature || 'subscription',
        amount_type: recurringTransaction.amount_type || 'fixed',
        estimated_amount: recurringTransaction.estimated_amount || null,
        metadata: {
          recurring_transaction_id: recurringTransactionId,
          cycle_number: cycle.cycleNumber,
          cycle_start_date: cycle.startDate,
          cycle_end_date: cycle.endDate,
          expected_date: cycle.expectedDate,
          has_override: !!override,
          override_amount: override?.expectedAmount,
          override_date: override?.expectedDate,
        },
      };

      try {
        const bill = await createBill(billData);
        billIds.push(bill.id);
      } catch (error) {
        console.error(`Error creating bill for cycle ${cycle.cycleNumber}:`, error);
        // Continue with next cycle
      }
    }

    return {
      billsCreated: billIds.length,
      billIds,
    };
  } catch (error: any) {
    console.error('Error generating bills from recurring cycles:', error);
    throw error;
  }
}

/**
 * Create a single bill from a specific cycle
 */
export async function createBillFromCycle(
  recurringTransaction: RecurringTransaction,
  cycle: Cycle,
  userId: string
): Promise<string> {
  try {
    // Get cycle overrides
    const overrides = getCycleOverrides(recurringTransaction);
    const override = overrides[cycle.cycleNumber];

    // Apply cycle override if exists
    const billAmount = override?.expectedAmount ?? cycle.expectedAmount;
    const billDate = override?.expectedDate ?? cycle.expectedDate;

    // Determine bill type
    let billType: 'recurring_fixed' | 'recurring_variable' = 'recurring_fixed';
    if (recurringTransaction.amount_type === 'variable') {
      billType = 'recurring_variable';
    }

    // Map frequency
    const frequencyMap: Record<string, 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom'> = {
      'day': 'daily',
      'week': 'weekly',
      'month': 'monthly',
      'quarter': 'quarterly',
      'year': 'yearly',
      'custom': 'custom',
      'daily': 'daily',
      'weekly': 'weekly',
      'biweekly': 'biweekly',
      'monthly': 'monthly',
      'bimonthly': 'bimonthly',
      'quarterly': 'quarterly',
      'halfyearly': 'halfyearly',
      'yearly': 'yearly',
    };

    const dbFrequency = String(recurringTransaction.frequency || 'month').toLowerCase();
    const frequency = frequencyMap[dbFrequency] || 'monthly';

    // Check if bill already exists for this cycle
    const { data: existingBill } = await supabase
      .from('bills')
      .select('id')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .eq('metadata->>recurring_transaction_id', recurringTransaction.id)
      .eq('metadata->>cycle_number', cycle.cycleNumber.toString())
      .maybeSingle();

    if (existingBill) {
      throw new Error(`Bill already exists for cycle ${cycle.cycleNumber}`);
    }

    // Create bill data
    const billTitle = recurringTransaction.title || (recurringTransaction as any).name || 'Recurring payment';
    const billData: CreateBillData = {
      user_id: userId,
      title: billTitle,
      description: `${billTitle} - Cycle ${cycle.cycleNumber}`,
      amount: billAmount,
      currency: recurringTransaction.currency || 'USD',
      due_date: billDate,
      original_due_date: billDate,
      bill_type: billType,
      recurrence_pattern: frequency === 'biweekly' || frequency === 'bimonthly' || frequency === 'quarterly' || frequency === 'halfyearly' 
        ? 'custom' 
        : frequency,
      recurrence_interval: recurringTransaction.interval || 1,
        category_id: recurringTransaction.category_id || null,
        linked_account_id: recurringTransaction.linked_account_id || null,
      frequency: frequency,
      nature: recurringTransaction.custom_pattern?.nature || 'subscription',
      amount_type: recurringTransaction.amount_type || 'fixed',
      estimated_amount: recurringTransaction.estimated_amount || null,
      metadata: {
        recurring_transaction_id: recurringTransaction.id,
        cycle_number: cycle.cycleNumber,
        cycle_start_date: cycle.startDate,
        cycle_end_date: cycle.endDate,
        expected_date: cycle.expectedDate,
        has_override: !!override,
        override_amount: override?.expectedAmount,
        override_date: override?.expectedDate,
      },
    };

    const bill = await createBill(billData);
    return bill.id;
  } catch (error: any) {
    console.error('Error creating bill from cycle:', error);
    throw error;
  }
}

/**
 * Process recurring transactions and create payment tracking for cycles that need them today
 * This function now delegates to the flexible payment tracking system
 * @deprecated Use processRecurringTransactionsForToday from recurringPaymentTracking.ts instead
 */
export async function processRecurringTransactionsForToday(
  today: string = new Date().toISOString().split('T')[0]
): Promise<{ processed: number; billsCreated: number; errors: string[] }> {
  // Delegate to flexible payment tracking system
  const { processRecurringTransactionsForToday: processFlexible } = await import('./recurringPaymentTracking');
  const result = await processFlexible(today);
  
  return {
    processed: result.processed,
    billsCreated: result.created,
    errors: result.errors,
  };
}

/**
 * Update existing bill when cycle override changes
 */
export async function updateBillFromCycleOverride(
  recurringTransactionId: string,
  cycleNumber: number,
  userId: string,
  override: { amount?: number; date?: string; minimumAmount?: number }
): Promise<void> {
  try {
    // Find bill for this cycle
    const { data: bills, error: fetchError } = await supabase
      .from('bills')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .eq('metadata->>recurring_transaction_id', recurringTransactionId)
      .eq('metadata->>cycle_number', cycleNumber.toString());

    if (fetchError) throw fetchError;

    if (!bills || bills.length === 0) {
      // No bill exists yet, nothing to update
      return;
    }

    // Update each bill (should only be one)
    for (const bill of bills) {
      const updateData: any = {
        metadata: {
          ...(bill.metadata || {}),
          has_override: true,
          override_amount: override.amount,
          override_date: override.date,
          minimum_amount: override.minimumAmount,
        },
        updated_at: new Date().toISOString(),
      };

      if (override.amount !== undefined) {
        updateData.amount = override.amount;
        updateData.total_amount = override.amount; // Update total amount too
      }

      if (override.date !== undefined) {
        updateData.due_date = override.date;
      }

      const { error: updateError } = await supabase
        .from('bills')
        .update(updateData)
        .eq('id', bill.id);

      if (updateError) {
        console.error(`Error updating bill ${bill.id}:`, updateError);
      }
    }
  } catch (error: any) {
    console.error('Error updating bill from cycle override:', error);
    throw error;
  }
}

