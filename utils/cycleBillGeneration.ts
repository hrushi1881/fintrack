/**
 * Cycle-Based Bill Generation
 * 
 * Generates bills from cycles for liabilities.
 * Each cycle gets one bill, and bills are linked to cycles via metadata.
 */

import { supabase } from '@/lib/supabase';
import { generateCycles, Cycle } from './cycles';
import { createBill, CreateBillData } from './bills';
import { generateAmortizationSchedule, AmortizationBill } from './liabilityAmortization';
import { DEFAULT_CURRENCY } from './currency';

export interface CycleBillGenerationOptions {
  liabilityId: string;
  userId: string;
  startDate: string;
  endDate?: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom';
  interval: number;
  dueDay?: number;
  paymentAmount: number;
  interestRate: number;
  currency: string;
  categoryId?: string;
  linkedAccountId?: string;
  maxCycles?: number;
}

/**
 * Generate bills from cycles for a liability
 */
export async function generateBillsFromCycles(
  options: CycleBillGenerationOptions
): Promise<{ billsCreated: number; cycles: Cycle[] }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    if (!options.linkedAccountId) {
      throw new Error('linkedAccountId is required to create payable bills for cycles');
    }

    // Normalize frequency/interval to the cycles engine vocabulary
    const mapFrequency = (
      freq: CycleBillGenerationOptions['frequency']
    ): { frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom'; interval: number } => {
      const f = freq.toLowerCase();
      switch (f) {
        case 'daily':
          return { frequency: 'daily', interval: 1 };
        case 'weekly':
          return { frequency: 'weekly', interval: 1 };
        case 'biweekly':
          return { frequency: 'weekly', interval: 2 };
        case 'bimonthly':
          return { frequency: 'monthly', interval: 2 };
        case 'quarterly':
          return { frequency: 'quarterly', interval: 1 };
        case 'halfyearly':
          return { frequency: 'monthly', interval: 6 };
        case 'yearly':
          return { frequency: 'yearly', interval: 1 };
        case 'custom':
          return { frequency: 'custom', interval: options.interval || 1 };
        default:
          return { frequency: 'monthly', interval: options.interval || 1 };
      }
    };

    const { frequency: normalizedFrequency, interval: normalizedInterval } = mapFrequency(options.frequency);

    // Generate cycles
    const cycles = generateCycles({
      startDate: options.startDate,
      endDate: options.endDate || null,
      frequency: normalizedFrequency,
      interval: normalizedInterval,
      dueDay: options.dueDay,
      amount: options.paymentAmount,
      maxCycles: options.maxCycles || 12,
    });

    // Get liability details for bill metadata
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('title, category_id, currency')
      .eq('id', options.liabilityId)
      .eq('user_id', options.userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Get current balance for amortization calculation
    const { data: liabilityData } = await supabase
      .from('liabilities')
      .select('current_balance, original_amount')
      .eq('id', options.liabilityId)
      .single();

    const principalBalance = liabilityData 
      ? Number(liabilityData.current_balance || liabilityData.original_amount || 0)
      : 0;

    // Generate amortization schedule for principal/interest breakdown
    // Note: We'll use cycle's interest breakdown if available, but keep schedule as fallback
    const amortizationSchedule = principalBalance > 0 && options.interestRate > 0
      ? generateAmortizationSchedule(
          principalBalance,
          options.interestRate,
          options.paymentAmount,
          new Date(options.startDate),
          options.liabilityId,
          true, // interest included
          options.frequency as any
        )
      : [];

    // Create bills for each cycle
    const billsCreated: string[] = [];
    let currentBalance = principalBalance; // Track balance for interest calculation

    for (let i = 0; i < cycles.length; i++) {
      const cycle = cycles[i];
      
      // Skip if a bill already exists for this liability + cycle
      const { data: existingBill, error: existingBillError } = await supabase
        .from('bills')
        .select('id, metadata')
        .eq('liability_id', options.liabilityId)
        .eq('user_id', options.userId)
        .limit(1)
        .contains('metadata', { cycle_number: cycle.cycleNumber });

      if (!existingBillError && existingBill && existingBill.length > 0) {
        continue;
      }
      
      // Calculate principal and interest for this cycle
      // Priority: Use cycle's calculated interest breakdown if available, then amortization schedule, then estimate
      let principalAmount = 0;
      let interestAmount = 0;

      if (cycle.expectedPrincipal !== undefined && cycle.expectedInterest !== undefined) {
        // Use interest breakdown from cycle (calculated by generateCycles)
        principalAmount = cycle.expectedPrincipal;
        interestAmount = cycle.expectedInterest;
        currentBalance = cycle.remainingBalance || 0;
      } else if (amortizationSchedule.length > i) {
        // Use amortization schedule
        const scheduleItem = amortizationSchedule[i];
        principalAmount = scheduleItem.principalAmount;
        interestAmount = scheduleItem.interestAmount;
        currentBalance = scheduleItem.remainingBalance;
      } else if (options.interestRate > 0 && currentBalance > 0) {
        // Estimate: calculate interest on current balance
        const periodsPerYear = {
          daily: 365,
          weekly: 52,
          monthly: 12,
          quarterly: 4,
          yearly: 1,
        }[options.frequency] || 12;
        const periodRate = options.interestRate / 100 / periodsPerYear;
        interestAmount = Math.round(currentBalance * periodRate * 100) / 100;
        principalAmount = Math.max(0, options.paymentAmount - interestAmount);
        currentBalance = Math.max(0, currentBalance - principalAmount);
      } else {
        // No interest: entire payment is principal
        principalAmount = options.paymentAmount;
        interestAmount = 0;
        currentBalance = Math.max(0, currentBalance - principalAmount);
      }

      // Create bill data
      const billData: CreateBillData = {
        user_id: options.userId,
        title: `${liability.title} - Payment #${i + 1}`,
        description: `Payment for cycle ${cycle.cycleNumber} (${cycle.startDate} to ${cycle.endDate})`,
        amount: options.paymentAmount,
        currency: options.currency || liability.currency,
        due_date: cycle.expectedDate,
        bill_type: 'liability_linked',
        liability_id: options.liabilityId,
        category_id: options.categoryId || liability.category_id || null,
        linked_account_id: options.linkedAccountId,
        frequency: normalizedFrequency,
        recurrence_interval: normalizedInterval,
        interest_amount: interestAmount,
        principal_amount: principalAmount,
        interest_included: true,
        payment_number: i + 1,
        metadata: {
          cycle_number: cycle.cycleNumber,
          cycle_start_date: cycle.startDate,
          cycle_end_date: cycle.endDate,
          expected_date: cycle.expectedDate,
        },
      };

      try {
        const bill = await createBill(billData);
        billsCreated.push(bill.id);
      } catch (error) {
        console.error(`Error creating bill for cycle ${cycle.cycleNumber}:`, error);
        // Continue with next cycle
      }
    }

    return {
      billsCreated: billsCreated.length,
      cycles,
    };
  } catch (error: any) {
    console.error('Error generating bills from cycles:', error);
    throw error;
  }
}

/**
 * Regenerate bills for a liability based on current cycles
 * This is useful when payment behavior changes or cycles need to be updated
 */
export async function regenerateBillsFromCycles(
  liabilityId: string,
  userId: string,
  options?: {
    deleteExisting?: boolean;
    maxCycles?: number;
  }
): Promise<{ billsCreated: number; billsDeleted: number }> {
  try {
    // Fetch liability
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('*')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Delete existing bills if requested
    let billsDeleted = 0;
    if (options?.deleteExisting) {
      const { data: existingBills, error: fetchError } = await supabase
        .from('bills')
        .select('id')
        .eq('liability_id', liabilityId)
        .eq('status', 'upcoming'); // Only delete unpaid bills

      if (!fetchError && existingBills) {
        const { error: deleteError } = await supabase
          .from('bills')
          .delete()
          .in('id', existingBills.map(b => b.id));

        if (!deleteError) {
          billsDeleted = existingBills.length;
        }
      }
    }

    // Generate new bills from cycles
    if (!liability.start_date || !liability.periodical_payment) {
      throw new Error('Liability missing required fields for bill generation');
    }

    const frequency = (liability.periodical_frequency || 'monthly') as any;
    const interval = 1; // Default interval
    const dueDay = liability.due_day_of_month || 1;

    const result = await generateBillsFromCycles({
      liabilityId,
      userId,
      startDate: liability.start_date,
      endDate: liability.targeted_payoff_date || null,
      frequency,
      interval,
      dueDay,
      paymentAmount: Number(liability.periodical_payment),
      interestRate: Number(liability.interest_rate_apy || 0),
      currency: liability.currency || DEFAULT_CURRENCY,
      categoryId: liability.category_id || undefined,
      linkedAccountId: liability.linked_account_id || undefined,
      maxCycles: options?.maxCycles,
    });

    return {
      billsCreated: result.billsCreated,
      billsDeleted,
    };
  } catch (error: any) {
    console.error('Error regenerating bills from cycles:', error);
    throw error;
  }
}

/**
 * Link existing bills to cycles
 * Useful when bills already exist and we want to connect them to cycles
 */
export async function linkBillsToCycles(
  liabilityId: string,
  userId: string
): Promise<{ linked: number }> {
  try {
    // Fetch liability
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('*')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Generate cycles
    const frequency = (liability.periodical_frequency || 'monthly') as any;
    const interval = 1;
    const dueDay = liability.due_day_of_month || 1;

    const cycles = generateCycles({
      startDate: liability.start_date || new Date().toISOString().split('T')[0],
      endDate: liability.targeted_payoff_date || null,
      frequency,
      interval,
      dueDay,
      amount: Number(liability.periodical_payment || 0),
      maxCycles: 12,
    });

    // Fetch existing bills
    const { data: bills, error: billsError } = await supabase
      .from('bills')
      .select('*')
      .eq('liability_id', liabilityId)
      .order('due_date', { ascending: true });

    if (billsError) throw billsError;

    // Link bills to cycles by matching due dates
    let linked = 0;
    for (const bill of bills || []) {
      const billDate = new Date(bill.due_date);
      
      // Find matching cycle
      const matchingCycle = cycles.find(cycle => {
        const cycleDate = new Date(cycle.expectedDate);
        const diffDays = Math.abs((billDate.getTime() - cycleDate.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3; // Allow 3 days tolerance
      });

      if (matchingCycle) {
        // Update bill metadata with cycle info
        const metadata = bill.metadata || {};
        metadata.cycle_number = matchingCycle.cycleNumber;
        metadata.cycle_start_date = matchingCycle.startDate;
        metadata.cycle_end_date = matchingCycle.endDate;

        const { error: updateError } = await supabase
          .from('bills')
          .update({
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', bill.id);

        if (!updateError) {
          linked++;
        }
      }
    }

    return { linked };
  } catch (error: any) {
    console.error('Error linking bills to cycles:', error);
    throw error;
  }
}

