/**
 * Utility functions for handling liability payment adjustments:
 * - Skipping payments
 * - Postponing payments
 * - Extra payments with different application strategies
 * - Editing payment amounts
 * - Editing payment dates
 */

import { supabase } from '@/lib/supabase';
import { calculateRemainingPayments, calculateTotalInterest } from './liabilityCalculations';
import { recalculateLiabilitySchedules } from './liabilityRecalculation';
import { generateLiabilityBills, LiabilityBillGenerationOptions } from './liabilityBills';
import { calculateLoanTerm, calculateMonthlyPayment } from './liabilityAmortization';
import { fetchLiabilityBills } from './liabilityBills';

export type SkipPaymentOption = 'addToNext' | 'addToEnd' | 'spreadAcross';

export type ExtraPaymentOption = 'reducePayment' | 'reduceTerm' | 'skipPayments' | 'reducePrincipal';

export type AmountChangeOption = 'oneTime' | 'updateAll' | 'addToNext';

export interface SkipPaymentResult {
  success: boolean;
  message: string;
  updatedSchedules?: number;
}

export interface PostponePaymentResult {
  success: boolean;
  message: string;
  newDueDate?: string;
}

export interface ExtraPaymentResult {
  success: boolean;
  message: string;
  impact?: {
    paymentChange?: number;
    termChangeMonths?: number;
    interestSaved?: number;
    paymentsSkipped?: number;
  };
}

export interface AmountChangeResult {
  success: boolean;
  message: string;
  impact?: {
    scheduleUpdated?: boolean;
    nextScheduleUpdated?: boolean;
    allSchedulesUpdated?: boolean;
    balanceImpact?: number;
  };
}

export interface DateChangeResult {
  success: boolean;
  message: string;
  newDueDate?: string;
  nextDueDateUpdated?: boolean;
}

/**
 * Skip a liability schedule (bill)
 */
export async function skipLiabilitySchedule(
  scheduleId: string,
  liabilityId: string,
  userId: string,
  option: SkipPaymentOption
): Promise<SkipPaymentResult> {
  try {
    // Get the schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('liability_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .eq('liability_id', liabilityId)
      .single();

    if (scheduleError || !schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.status !== 'pending') {
      throw new Error('Can only skip pending payments');
    }

    const skippedAmount = Number(schedule.amount || 0);

    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('*')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Mark schedule as cancelled (skipped)
    const { error: updateError } = await supabase
      .from('liability_schedules')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
        metadata: {
          ...schedule.metadata,
          skipped: true,
          skip_option: option,
          skipped_at: new Date().toISOString(),
        },
      })
      .eq('id', scheduleId);

    if (updateError) throw updateError;

    let updatedCount = 0;

    // Apply skip option
    if (option === 'addToNext') {
      // Add skipped amount to next pending schedule
      const { data: nextSchedule } = await supabase
        .from('liability_schedules')
        .select('*')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextSchedule) {
        const newAmount = Number(nextSchedule.amount || 0) + skippedAmount;
        await supabase
          .from('liability_schedules')
          .update({
            amount: newAmount,
            updated_at: new Date().toISOString(),
            metadata: {
              ...nextSchedule.metadata,
              includes_skipped: true,
              skipped_amount: skippedAmount,
            },
          })
          .eq('id', nextSchedule.id);
        updatedCount = 1;
      }
    } else if (option === 'addToEnd') {
      // Add a new schedule at the end
      const { data: lastSchedule } = await supabase
        .from('liability_schedules')
        .select('due_date')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .order('due_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const lastDueDate = lastSchedule?.due_date 
        ? new Date(lastSchedule.due_date)
        : liability.targeted_payoff_date 
        ? new Date(liability.targeted_payoff_date)
        : new Date();

      const newDueDate = new Date(lastDueDate);
      newDueDate.setMonth(newDueDate.getMonth() + 1);

      await supabase
        .from('liability_schedules')
        .insert({
          user_id: userId,
          liability_id: liabilityId,
          due_date: newDueDate.toISOString().split('T')[0],
          amount: skippedAmount,
          status: 'pending',
          auto_pay: false,
          reminder_days: [1, 3, 7],
          metadata: {
            principal_component: skippedAmount,
            interest_component: 0,
            payment_number: 0,
            total_payments: 0,
            remaining_balance: 0,
            is_skipped_payment: true,
            original_schedule_id: scheduleId,
          },
        });
      updatedCount = 1;
    } else if (option === 'spreadAcross') {
      // Spread skipped amount across remaining pending schedules
      const { data: remainingSchedules } = await supabase
        .from('liability_schedules')
        .select('*')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true });

      if (remainingSchedules && remainingSchedules.length > 0) {
        const amountPerSchedule = skippedAmount / remainingSchedules.length;

        for (const remainingSchedule of remainingSchedules) {
          const newAmount = Number(remainingSchedule.amount || 0) + amountPerSchedule;
          await supabase
            .from('liability_schedules')
            .update({
              amount: newAmount,
              updated_at: new Date().toISOString(),
              metadata: {
                ...remainingSchedule.metadata,
                includes_skipped: true,
                skipped_amount_portion: amountPerSchedule,
              },
            })
            .eq('id', remainingSchedule.id);
        }
        updatedCount = remainingSchedules.length;
      }
    }

    return {
      success: true,
      message: 'Payment skipped successfully',
      updatedSchedules: updatedCount,
    };
  } catch (error: any) {
    console.error('Error skipping payment:', error);
    return {
      success: false,
      message: error.message || 'Failed to skip payment',
    };
  }
}

/**
 * Postpone a liability schedule to a new date
 */
export async function postponeLiabilitySchedule(
  scheduleId: string,
  liabilityId: string,
  userId: string,
  newDueDate: Date
): Promise<PostponePaymentResult> {
  try {
    // Get the schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('liability_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .eq('liability_id', liabilityId)
      .single();

    if (scheduleError || !schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.status !== 'pending') {
      throw new Error('Can only postpone pending payments');
    }

    // Validate new date is not in the past
    if (newDueDate < new Date()) {
      throw new Error('New due date cannot be in the past');
    }

    // Get liability to check end date
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('targeted_payoff_date')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Check if new date is after liability end date
    if (liability.targeted_payoff_date && newDueDate > new Date(liability.targeted_payoff_date)) {
      throw new Error(`New due date cannot be after liability end date (${new Date(liability.targeted_payoff_date).toLocaleDateString()})`);
    }

    // Update schedule
    const { error: updateError } = await supabase
      .from('liability_schedules')
      .update({
        due_date: newDueDate.toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
        metadata: {
          ...schedule.metadata,
          postponed: true,
          original_due_date: schedule.due_date,
          postponed_at: new Date().toISOString(),
        },
      })
      .eq('id', scheduleId);

    if (updateError) throw updateError;

    // Update liability's next_due_date if this was the next payment
    const { data: nextSchedule } = await supabase
      .from('liability_schedules')
      .select('due_date')
      .eq('liability_id', liabilityId)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('due_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    let nextDueDateUpdated = false;
    if (nextSchedule) {
      await supabase
        .from('liabilities')
        .update({
          next_due_date: nextSchedule.due_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);
      nextDueDateUpdated = true;
    }

    return {
      success: true,
      message: 'Payment postponed successfully',
      newDueDate: newDueDate.toISOString().split('T')[0],
    };
  } catch (error: any) {
    console.error('Error postponing payment:', error);
    return {
      success: false,
      message: error.message || 'Failed to postpone payment',
    };
  }
}

/**
 * Change payment amount with different options
 */
export async function changePaymentAmount(
  scheduleId: string,
  liabilityId: string,
  userId: string,
  newAmount: number,
  option: AmountChangeOption
): Promise<AmountChangeResult> {
  try {
    if (newAmount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    // Get the schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('liability_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .eq('liability_id', liabilityId)
      .single();

    if (scheduleError || !schedule) {
      throw new Error('Schedule not found');
    }

    if (schedule.status !== 'pending') {
      throw new Error('Can only change pending payments');
    }

    const oldAmount = Number(schedule.amount || 0);
    const difference = newAmount - oldAmount;

    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('*')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    let impact: AmountChangeResult['impact'] = {
      scheduleUpdated: false,
      nextScheduleUpdated: false,
      allSchedulesUpdated: false,
      balanceImpact: 0,
    };

    if (option === 'oneTime') {
      // Only update this schedule
      const { error: updateError } = await supabase
        .from('liability_schedules')
        .update({
          amount: newAmount,
          updated_at: new Date().toISOString(),
          metadata: {
            ...schedule.metadata,
            amount_changed: true,
            original_amount: oldAmount,
            changed_at: new Date().toISOString(),
          },
        })
        .eq('id', scheduleId);

      if (updateError) throw updateError;
      impact.scheduleUpdated = true;
      impact.balanceImpact = difference;
    } else if (option === 'updateAll') {
      // Update all remaining pending schedules
      const { data: remainingSchedules } = await supabase
        .from('liability_schedules')
        .select('*')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true });

      if (remainingSchedules && remainingSchedules.length > 0) {
        for (const remainingSchedule of remainingSchedules) {
          await supabase
            .from('liability_schedules')
            .update({
              amount: newAmount,
              updated_at: new Date().toISOString(),
              metadata: {
                ...remainingSchedule.metadata,
                amount_changed: true,
                original_amount: remainingSchedule.amount,
                changed_at: new Date().toISOString(),
                bulk_update: true,
              },
            })
            .eq('id', remainingSchedule.id);
        }
        impact.allSchedulesUpdated = true;
        impact.balanceImpact = difference * remainingSchedules.length;
      }
    } else if (option === 'addToNext') {
      // Update this schedule and add difference to next
      const { error: updateError } = await supabase
        .from('liability_schedules')
        .update({
          amount: newAmount,
          updated_at: new Date().toISOString(),
          metadata: {
            ...schedule.metadata,
            amount_changed: true,
            original_amount: oldAmount,
            changed_at: new Date().toISOString(),
          },
        })
        .eq('id', scheduleId);

      if (updateError) throw updateError;
      impact.scheduleUpdated = true;

      // Add difference to next schedule
      const { data: nextSchedule } = await supabase
        .from('liability_schedules')
        .select('*')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextSchedule && nextSchedule.id !== scheduleId) {
        const nextNewAmount = Number(nextSchedule.amount || 0) + Math.abs(difference);
        await supabase
          .from('liability_schedules')
          .update({
            amount: nextNewAmount,
            updated_at: new Date().toISOString(),
            metadata: {
              ...nextSchedule.metadata,
              includes_adjustment: true,
              adjustment_amount: Math.abs(difference),
              adjusted_at: new Date().toISOString(),
            },
          })
          .eq('id', nextSchedule.id);
        impact.nextScheduleUpdated = true;
      }
    }

    return {
      success: true,
      message: 'Payment amount updated successfully',
      impact,
    };
  } catch (error: any) {
    console.error('Error changing payment amount:', error);
    return {
      success: false,
      message: error.message || 'Failed to change payment amount',
    };
  }
}

/**
 * Change payment date
 */
export async function changePaymentDate(
  scheduleId: string,
  liabilityId: string,
  userId: string,
  newDate: Date
): Promise<DateChangeResult> {
  // This is essentially the same as postpone, but can also move dates forward
  return postponeLiabilitySchedule(scheduleId, liabilityId, userId, newDate);
}

/**
 * Apply extra payment to liability with different strategies
 */
export async function applyExtraPayment(
  liabilityId: string,
  userId: string,
  extraAmount: number,
  option: ExtraPaymentOption,
  numberOfPaymentsToSkip?: number
): Promise<ExtraPaymentResult> {
  try {
    if (extraAmount <= 0) {
      throw new Error('Extra payment amount must be greater than 0');
    }

    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('*')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    const currentBalance = Number(liability.current_balance || 0);
    const currentPayment = Number(liability.periodical_payment || 0);
    const currentRate = Number(liability.interest_rate_apy || 0);
    const startDate = liability.start_date ? new Date(liability.start_date) : new Date();
    const endDate = liability.targeted_payoff_date 
      ? new Date(liability.targeted_payoff_date)
      : new Date(new Date().setFullYear(new Date().getFullYear() + 10));

    let impact: ExtraPaymentResult['impact'] = {};

    if (option === 'reducePayment') {
      // Keep same end date, reduce monthly payment
      const monthsRemaining = Math.ceil((endDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30));
      const newBalance = Math.max(0, currentBalance - extraAmount);
      
      // Calculate new payment needed using amortization formula
      const newPayment = currentRate > 0
        ? calculateMonthlyPayment(newBalance, currentRate, monthsRemaining)
        : newBalance / monthsRemaining;

      // Update liability
      await supabase
        .from('liabilities')
        .update({
          current_balance: newBalance,
          periodical_payment: newPayment,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);

      // Get first pending bill date
      const { data: firstPendingBill } = await supabase
        .from('bills')
        .select('due_date')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstPendingBill) {
        const firstPendingDate = new Date(firstPendingBill.due_date);
        
        // Get last paid bill's payment number
        const { data: lastPaidBill } = await supabase
          .from('bills')
          .select('payment_number')
          .eq('liability_id', liabilityId)
          .eq('user_id', userId)
          .eq('status', 'paid')
          .order('payment_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const startingPaymentNumber = lastPaidBill?.payment_number 
          ? lastPaidBill.payment_number + 1
          : 1;
        
        // Delete all pending bills (mark as deleted)
        await supabase
          .from('bills')
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .eq('liability_id', liabilityId)
          .eq('user_id', userId)
          .eq('status', 'upcoming');

        // Regenerate upcoming payments as cycles only; defer bill creation to user action per-cycle
        // (No bulk bill creation here to avoid instant bills on liability adjustments)
      }

      impact = {
        paymentChange: newPayment - currentPayment,
        termChangeMonths: 0,
        interestSaved: 0, // Will be calculated based on actual bills
      };
    } else if (option === 'reduceTerm') {
      // Keep same payment, reduce term
      const newBalance = Math.max(0, currentBalance - extraAmount);
      const newTermMonths = currentRate > 0
        ? calculateLoanTerm(newBalance, currentRate, currentPayment)
        : Math.ceil(newBalance / currentPayment);
      
      if (newTermMonths === Infinity || newTermMonths <= 0) {
        throw new Error('Cannot calculate new loan term with given parameters');
      }

      // Get first pending bill date
      const { data: firstPendingBill } = await supabase
        .from('bills')
        .select('due_date')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      const firstPendingDate = firstPendingBill?.due_date 
        ? new Date(firstPendingBill.due_date)
        : new Date();

      // Calculate new end date
      const newEndDate = new Date(firstPendingDate);
      newEndDate.setMonth(newEndDate.getMonth() + newTermMonths - 1);

      // Update liability
      await supabase
        .from('liabilities')
        .update({
          current_balance: newBalance,
          targeted_payoff_date: newEndDate.toISOString().split('T')[0],
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);

      // Delete all pending bills after new end date
      await supabase
        .from('bills')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .gt('due_date', newEndDate.toISOString().split('T')[0]);

      // Delete bills beyond new term; do not regenerate (user schedules via cycles)
      const { data: pendingBills } = await supabase
        .from('bills')
        .select('due_date')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .order('due_date', { ascending: true });

      // If any pending remain, mark them deleted; users will recreate per-cycle as needed
      if (pendingBills && pendingBills.length > 0) {
        await supabase
          .from('bills')
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .eq('liability_id', liabilityId)
          .eq('user_id', userId)
          .eq('status', 'upcoming');
      }

      // Calculate old term for comparison
      const oldTermMonths = currentRate > 0
        ? calculateLoanTerm(currentBalance, currentRate, currentPayment)
        : Math.ceil(currentBalance / currentPayment);

      impact = {
        paymentChange: 0,
        termChangeMonths: oldTermMonths !== Infinity ? (newTermMonths - oldTermMonths) : 0,
        interestSaved: 0, // Will be calculated based on actual bills
      };
    } else if (option === 'skipPayments') {
      // Skip next N payments (prepay for next N months)
      const paymentsToSkip = numberOfPaymentsToSkip || 1;

      // Get next N pending bills and mark them as cancelled/prepaid
      const { data: billsToSkip } = await supabase
        .from('bills')
        .select('*')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .order('due_date', { ascending: true })
        .limit(paymentsToSkip);

      if (billsToSkip && billsToSkip.length > 0) {
        for (const bill of billsToSkip) {
          await supabase
            .from('bills')
            .update({
              status: 'cancelled',
              updated_at: new Date().toISOString(),
              metadata: {
                ...bill.metadata,
                skipped: true,
                skip_option: 'prepaid',
                skipped_at: new Date().toISOString(),
                prepaid: true,
              },
            })
            .eq('id', bill.id);
        }
      }

      // Update liability balance (already updated in pay-bill modal, but ensure consistency)
      // Note: The balance was already updated when the bill was paid
      // We just mark the bills as prepaid

      impact = {
        paymentChange: 0,
        termChangeMonths: 0,
        interestSaved: 0, // Interest continues accruing, so no savings
        paymentsSkipped: paymentsToSkip,
      };
    } else if (option === 'reducePrincipal') {
      // Just reduce principal, recalculate remaining bills with new balance
      const newBalance = Math.max(0, currentBalance - extraAmount);

      // Update liability (balance already updated in pay-bill modal, but ensure consistency)
      await supabase
        .from('liabilities')
        .update({
          current_balance: newBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);

      // Get first pending bill date
      const { data: firstPendingBill } = await supabase
        .from('bills')
        .select('due_date')
        .eq('liability_id', liabilityId)
        .eq('user_id', userId)
        .eq('status', 'upcoming')
        .order('due_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstPendingBill) {
        const firstPendingDate = new Date(firstPendingBill.due_date);
        
        // Get last paid bill's payment number
        const { data: lastPaidBill } = await supabase
          .from('bills')
          .select('payment_number')
          .eq('liability_id', liabilityId)
          .eq('user_id', userId)
          .eq('status', 'paid')
          .order('payment_number', { ascending: false })
          .limit(1)
          .maybeSingle();

        const startingPaymentNumber = lastPaidBill?.payment_number 
          ? lastPaidBill.payment_number + 1
          : 1;
        
        // Delete all pending bills (mark as deleted)
        await supabase
          .from('bills')
          .update({ is_deleted: true, updated_at: new Date().toISOString() })
          .eq('liability_id', liabilityId)
          .eq('user_id', userId)
          .eq('status', 'upcoming');

        // Do not regenerate bills; users will create/schedule per cycle
      }

      // Calculate term change
      const oldTermMonths = currentRate > 0
        ? calculateLoanTerm(currentBalance, currentRate, currentPayment)
        : Math.ceil(currentBalance / currentPayment);
      const newTermMonths = currentRate > 0
        ? calculateLoanTerm(newBalance, currentRate, currentPayment)
        : Math.ceil(newBalance / currentPayment);

      impact = {
        paymentChange: 0,
        termChangeMonths: (oldTermMonths !== Infinity && newTermMonths !== Infinity) 
          ? (newTermMonths - oldTermMonths) 
          : 0,
        interestSaved: 0, // Will be calculated based on actual bills
      };
    }

    return {
      success: true,
      message: 'Extra payment applied successfully',
      impact,
    };
  } catch (error: any) {
    console.error('Error applying extra payment:', error);
    return {
      success: false,
      message: error.message || 'Failed to apply extra payment',
    };
  }
}
