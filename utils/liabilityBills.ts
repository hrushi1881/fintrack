/**
 * Utility functions for managing liability bills
 * Bills are the primary entity for liability payments
 */

import { supabase } from '@/lib/supabase';
import { CreateBillData, createBill } from './bills';
import { calculatePaymentBreakdown } from './liabilityCalculations';
import { 
  generateAmortizationSchedule, 
  calculateMonthlyPayment,
  calculateLoanTerm,
  AmortizationBill 
} from './liabilityAmortization';

export interface LiabilityBillGenerationOptions {
  liabilityId: string;
  userId: string;
  startDate: Date;
  endDate: Date;
  frequency: 'daily' | 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'yearly';
  paymentAmount?: number;
  interestRate: number;
  totalAmount: number;
  interestIncluded: boolean;
  currency: string;
  categoryId?: string;
  linkedAccountId?: string;
  startingPaymentNumber?: number; // Optional: starting payment number (for regenerating bills)
}

export interface BillPaymentImpact {
  accountBalanceBefore: number;
  accountBalanceAfter: number;
  fundBalanceBefore: number;
  fundBalanceAfter: number;
  liabilityBalanceBefore: number;
  liabilityBalanceAfter: number;
  principalPaid: number;
  interestPaid: number;
  totalPaid: number;
  remainingBalance: number;
  nextPaymentDue?: Date;
  nextPaymentAmount?: number;
}

/**
 * Generate bills for a liability
 * Uses the database function or creates bills directly
 */
export async function generateLiabilityBills(options: LiabilityBillGenerationOptions): Promise<number> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('title, category_id, currency')
      .eq('id', options.liabilityId)
      .eq('user_id', options.userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Use database function to generate bills
    const { data, error } = await supabase.rpc('generate_liability_bills', {
      p_liability_id: options.liabilityId,
      p_user_id: options.userId,
      p_start_date: options.startDate.toISOString().split('T')[0],
      p_end_date: options.endDate.toISOString().split('T')[0],
      p_frequency: options.frequency,
      p_payment_amount: options.paymentAmount || 0,
      p_interest_rate: options.interestRate,
      p_total_amount: options.totalAmount,
      p_interest_included: options.interestIncluded,
      p_currency: options.currency || liability.currency,
    });

    if (error) {
      console.error('Error generating liability bills:', error);
      // Fallback to manual generation if RPC fails
      return await generateLiabilityBillsManually(options);
    }

    return data || 0;
  } catch (error: any) {
    console.error('Error in generateLiabilityBills:', error);
    throw error;
  }
}

/**
 * Generate bills manually (fallback if RPC not available)
 * Uses amortization schedule generation for accurate calculations
 */
async function generateLiabilityBillsManually(options: LiabilityBillGenerationOptions): Promise<number> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('title, category_id, currency')
      .eq('id', options.liabilityId)
      .eq('user_id', options.userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Calculate payment amount if not provided
    let paymentAmount = options.paymentAmount;
    if (!paymentAmount) {
      // Calculate number of payments based on frequency
      const numberOfPayments = calculateNumberOfPayments(
        options.startDate,
        options.endDate,
        options.frequency
      );
      
      // Calculate payment using amortization formula
      // For non-monthly frequencies, we need to calculate the payment for that frequency
      const periodsPerYear = {
        daily: 365,
        weekly: 52,
        'bi-weekly': 26,
        monthly: 12,
        quarterly: 4,
        yearly: 1,
      }[options.frequency] || 12;
      
      const periodRate = options.interestRate > 0 ? options.interestRate / 100 / periodsPerYear : 0;
      
      if (periodRate > 0 && numberOfPayments > 0) {
        // Use amortization formula for this frequency
        const numerator = options.totalAmount * periodRate * Math.pow(1 + periodRate, numberOfPayments);
        const denominator = Math.pow(1 + periodRate, numberOfPayments) - 1;
        paymentAmount = numerator / denominator;
      } else {
        // No interest or zero interest, divide equally
        paymentAmount = options.totalAmount / numberOfPayments;
      }
    }

    // Get starting payment number (if regenerating, start from last paid bill's payment number + 1)
    let startingPaymentNumber = options.startingPaymentNumber || 1;
    if (!options.startingPaymentNumber) {
      // Get last paid bill's payment number
      const { data: lastPaidBill } = await supabase
        .from('bills')
        .select('payment_number')
        .eq('liability_id', options.liabilityId)
        .eq('user_id', options.userId)
        .eq('status', 'paid')
        .order('payment_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastPaidBill && lastPaidBill.payment_number) {
        startingPaymentNumber = lastPaidBill.payment_number + 1;
      }
    }

    // Generate amortization schedule with frequency
    const amortizationBills = generateAmortizationSchedule(
      options.totalAmount,
      options.interestRate,
      paymentAmount,
      options.startDate,
      options.liabilityId,
      options.interestIncluded,
      options.frequency,
      startingPaymentNumber
    );
    
    // Filter bills to end date (in case we generated too many)
    const filteredBills = amortizationBills.filter(bill => {
      const billDate = new Date(bill.dueDate);
      billDate.setHours(0, 0, 0, 0);
      const endDate = new Date(options.endDate);
      endDate.setHours(0, 0, 0, 0);
      return billDate <= endDate;
    });
    
    const adjustedBills = filteredBills;

    // Convert to CreateBillData format
    const bills: CreateBillData[] = adjustedBills.map((bill) => ({
      title: `${liability.title} - Payment ${bill.paymentNumber}`,
      description: `Payment ${bill.paymentNumber} of ${liability.title}`,
      amount: bill.amount,
      currency: options.currency || liability.currency,
      category_id: options.categoryId || liability.category_id || undefined,
      bill_type: 'liability_linked',
      due_date: bill.dueDate.toISOString().split('T')[0],
      original_due_date: bill.dueDate.toISOString().split('T')[0],
      liability_id: options.liabilityId,
      interest_amount: bill.interestAmount,
      principal_amount: bill.principalAmount,
      payment_number: bill.paymentNumber,
      interest_included: options.interestIncluded,
      linked_account_id: options.linkedAccountId || undefined,
      color: '#EF4444',
      icon: 'card',
      reminder_days: [1, 3, 7],
      metadata: {
        principal_component: bill.principalAmount,
        interest_component: bill.interestAmount,
        payment_number: bill.paymentNumber,
        remaining_balance: bill.remainingBalance,
      },
    }));

    // Insert bills in batches
    const chunkSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < bills.length; i += chunkSize) {
      const chunk = bills.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('bills')
        .insert(chunk);

      if (error) {
        console.error('Error inserting bills:', error);
        throw error;
      }

      insertedCount += chunk.length;
    }

    return insertedCount;
  } catch (error: any) {
    console.error('Error in generateLiabilityBillsManually:', error);
    throw error;
  }
}

/**
 * Calculate number of payments based on frequency
 */
function calculateNumberOfPayments(
  startDate: Date,
  endDate: Date,
  frequency: string
): number {
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  switch (frequency) {
    case 'daily':
      return Math.ceil(daysDiff / 1);
    case 'weekly':
      return Math.ceil(daysDiff / 7);
    case 'bi-weekly':
      return Math.ceil(daysDiff / 14);
    case 'monthly':
      // More accurate monthly calculation
      const start = new Date(startDate);
      const end = new Date(endDate);
      const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      return Math.max(1, monthsDiff + 1); // +1 to include both start and end months
    case 'quarterly':
      return Math.ceil(daysDiff / 90);
    case 'yearly':
      return Math.ceil(daysDiff / 365);
    default:
      return Math.ceil(daysDiff / 30);
  }
}

/**
 * Calculate payment impact before paying a bill
 */
export async function calculateBillPaymentImpact(
  billId: string,
  accountId: string,
  fundBucketId: string,
  paymentAmount: number
): Promise<BillPaymentImpact | null> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get bill details
    const { data: bill, error: billError } = await supabase
      .from('bills')
      .select('*, liability:liabilities(*)')
      .eq('id', billId)
      .eq('user_id', user.user.id)
      .single();

    if (billError || !bill) {
      throw new Error('Bill not found');
    }

    if (!bill.liability_id) {
      throw new Error('Bill is not linked to a liability');
    }

    // Get account details
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('balance, currency')
      .eq('id', accountId)
      .eq('user_id', user.user.id)
      .single();

    if (accountError || !account) {
      throw new Error('Account not found');
    }

    // Get fund details
    const { data: fund, error: fundError } = await supabase
      .from('account_funds')
      .select('balance')
      .eq('id', fundBucketId)
      .eq('account_id', accountId)
      .single();

    if (fundError || !fund) {
      throw new Error('Fund not found');
    }

    // Get liability details
    const liability = bill.liability as any;
    if (!liability) {
      throw new Error('Liability not found');
    }

    // Calculate breakdown
    const principalAmount = bill.principal_amount || paymentAmount * 0.9;
    const interestAmount = bill.interest_amount || paymentAmount * 0.1;

    // Calculate impact
    const impact: BillPaymentImpact = {
      accountBalanceBefore: Number(account.balance || 0),
      accountBalanceAfter: Number(account.balance || 0) - paymentAmount,
      fundBalanceBefore: Number(fund.balance || 0),
      fundBalanceAfter: Number(fund.balance || 0) - paymentAmount,
      liabilityBalanceBefore: Number(liability.current_balance || 0),
      liabilityBalanceAfter: Number(liability.current_balance || 0) - principalAmount,
      principalPaid: principalAmount,
      interestPaid: interestAmount,
      totalPaid: paymentAmount,
      remainingBalance: Number(liability.current_balance || 0) - principalAmount,
    };

    // Get next payment
    const { data: nextBill } = await supabase
      .from('bills')
      .select('due_date, amount')
      .eq('liability_id', bill.liability_id)
      .eq('user_id', user.user.id)
      .eq('status', 'upcoming')
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextBill) {
      impact.nextPaymentDue = new Date(nextBill.due_date);
      impact.nextPaymentAmount = nextBill.amount;
    }

    return impact;
  } catch (error: any) {
    console.error('Error calculating payment impact:', error);
    return null;
  }
}

/**
 * Validate bill date is within liability date range
 */
export async function validateBillDate(
  billDate: Date,
  liabilityId: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('start_date, targeted_payoff_date')
      .eq('id', liabilityId)
      .eq('user_id', user.user.id)
      .single();

    if (liabilityError || !liability) {
      return { valid: false, error: 'Liability not found' };
    }

    const startDate = new Date(liability.start_date);
    const endDate = liability.targeted_payoff_date ? new Date(liability.targeted_payoff_date) : null;

    // Validate date
    if (billDate < startDate) {
      return {
        valid: false,
        error: `Bill date cannot be before liability start date (${startDate.toLocaleDateString()})`,
      };
    }

    if (endDate && billDate > endDate) {
      return {
        valid: false,
        error: `Bill date cannot be after liability end date (${endDate.toLocaleDateString()})`,
      };
    }

    return { valid: true };
  } catch (error: any) {
    console.error('Error validating bill date:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Fetch bills for a liability
 */
export async function fetchLiabilityBills(liabilityId: string): Promise<any[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('liability_id', liabilityId)
      .eq('user_id', user.user.id)
      .eq('is_deleted', false)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching liability bills:', error);
      throw error;
    }

    return data || [];
  } catch (error: any) {
    console.error('Error in fetchLiabilityBills:', error);
    throw error;
  }
}

/**
 * Auto-adjust bill amounts based on interest rate change
 */
export async function autoAdjustLiabilityBills(
  liabilityId: string,
  newInterestRate: number
): Promise<number> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Use database function if available
    const { data, error } = await supabase.rpc('auto_adjust_liability_bills', {
      p_liability_id: liabilityId,
      p_user_id: user.user.id,
      p_new_interest_rate: newInterestRate,
    });

    if (error) {
      console.error('Error auto-adjusting bills:', error);
      throw error;
    }

    return data || 0;
  } catch (error: any) {
    console.error('Error in autoAdjustLiabilityBills:', error);
    throw error;
  }
}

/**
 * Generate bills for EMI liability based on frequency
 * Creates bills for each payment period until end date
 */
export async function generateBillsForEmiLiability(
  userId: string,
  liabilityId: string,
  emiAmount: number,
  frequency: 'monthly' | 'weekly',
  firstPaymentDate: Date,
  endDate?: Date,
  linkedAccountId?: string
): Promise<{ success: boolean; billsCreated: number; error?: string }> {
  try {
    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('start_date, targeted_payoff_date, currency, title')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      return {
        success: false,
        billsCreated: 0,
        error: 'Liability not found',
      };
    }

    const startDate = new Date(liability.start_date);
    const finalEndDate = endDate || (liability.targeted_payoff_date ? new Date(liability.targeted_payoff_date) : null);

    // Validate dates are within range
    if (firstPaymentDate < startDate) {
      return {
        success: false,
        billsCreated: 0,
        error: 'First payment date cannot be before start date',
      };
    }

    if (finalEndDate && firstPaymentDate > finalEndDate) {
      return {
        success: false,
        billsCreated: 0,
        error: 'First payment date cannot be after end date',
      };
    }

    // Generate bill dates
    const billDates: Date[] = [];
    let currentDate = new Date(firstPaymentDate);
    const endDateToUse = finalEndDate || new Date(currentDate.getFullYear() + 10, currentDate.getMonth(), currentDate.getDate()); // Default to 10 years if no end date

    // Generate dates based on frequency
    while (currentDate <= endDateToUse) {
      // Validate date is within start_date and end_date range
      if (currentDate >= startDate && currentDate <= endDateToUse) {
        billDates.push(new Date(currentDate));
      }

      // Move to next payment date
      if (frequency === 'monthly') {
        currentDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
      } else {
        // weekly
        currentDate = new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
    }

    // Get existing bills count to determine starting payment number
    const { data: existingBills, error: existingBillsError } = await supabase
      .from('bills')
      .select('payment_number')
      .eq('liability_id', liabilityId)
      .eq('user_id', userId)
      .order('payment_number', { ascending: false })
      .limit(1);

    let startingPaymentNumber = 1;
    if (!existingBillsError && existingBills && existingBills.length > 0) {
      startingPaymentNumber = (existingBills[0].payment_number || 0) + 1;
    }

    // Create bills
    const billsToCreate: CreateBillData[] = billDates.map((dueDate, index) => ({
      title: `${liability.title} - Payment #${startingPaymentNumber + index}`,
      amount: emiAmount,
      currency: liability.currency,
      bill_type: 'liability_linked',
      due_date: dueDate.toISOString().split('T')[0],
      original_due_date: dueDate.toISOString().split('T')[0],
      liability_id: liabilityId,
      linked_account_id: linkedAccountId || null,
      payment_number: startingPaymentNumber + index,
      principal_amount: emiAmount, // For EMI, entire amount is principal (assuming no interest breakdown)
      interest_amount: 0,
      interest_included: true,
      color: '#10B981',
      icon: 'receipt-outline',
      reminder_days: [1, 3, 7],
      metadata: {
        source_type: 'emi',
        frequency: frequency,
        generated_automatically: true,
      },
    }));

    // Create bills in batch
    let billsCreated = 0;
    for (const billData of billsToCreate) {
      try {
        await createBill(billData);
        billsCreated++;
      } catch (error: any) {
        console.error(`Error creating bill for ${billData.due_date}:`, error);
        // Continue creating other bills even if one fails
      }
    }

    return {
      success: billsCreated > 0,
      billsCreated,
      error: billsCreated < billsToCreate.length ? `${billsToCreate.length - billsCreated} bills failed to create` : undefined,
    };
  } catch (error: any) {
    console.error('Error generating bills for EMI liability:', error);
    return {
      success: false,
      billsCreated: 0,
      error: error.message || 'Failed to generate bills',
    };
  }
}

