/**
 * Utility functions for recalculating liability schedules when terms change
 */

import { supabase } from '@/lib/supabase';
import { calculatePaymentBreakdown, calculateRemainingPayments, calculateTotalInterest } from './liabilityCalculations';

export interface LiabilityUpdateImpact {
  oldPayment: number;
  newPayment: number;
  paymentChange: number;
  oldTermMonths: number;
  newTermMonths: number;
  termChangeMonths: number;
  oldTotalInterest: number;
  newTotalInterest: number;
  interestChange: number;
  oldEndDate: Date;
  newEndDate: Date;
  endDateChange: number; // days
}

export interface RecalculateSchedulesOptions {
  keepPaymentSame?: boolean; // Keep monthly payment same, adjust term
  keepEndDateSame?: boolean; // Keep end date same, adjust payment
  customPayment?: number; // Custom payment amount
  customEndDate?: Date; // Custom end date
}

/**
 * Calculate impact of updating liability terms
 */
export function calculateLiabilityUpdateImpact(
  currentBalance: number,
  currentPayment: number,
  currentInterestRate: number,
  currentEndDate: Date,
  newTotalAmount?: number,
  newInterestRate?: number,
  newEndDate?: Date,
  newPayment?: number,
  options?: RecalculateSchedulesOptions
): LiabilityUpdateImpact {
  // Calculate current term and interest
  const oldTermMonths = calculateRemainingPayments(currentBalance, currentPayment, currentInterestRate);
  const oldTotalInterest = calculateTotalInterest(currentBalance, currentPayment, currentInterestRate);
  
  // Determine new values
  const effectiveBalance = newTotalAmount !== undefined ? newTotalAmount : currentBalance;
  const effectiveRate = newInterestRate !== undefined ? newInterestRate : currentInterestRate;
  
  let newPaymentAmount = currentPayment;
  let newEndDateValue = currentEndDate;
  let newTermMonths = oldTermMonths;
  
  // Apply options
  if (options?.keepPaymentSame) {
    // Keep payment same, calculate new term
    newPaymentAmount = currentPayment;
    newTermMonths = calculateRemainingPayments(effectiveBalance, newPaymentAmount, effectiveRate);
    if (newEndDate) {
      newEndDateValue = newEndDate;
    } else {
      // Calculate new end date from current date + new term
      newEndDateValue = new Date();
      newEndDateValue.setMonth(newEndDateValue.getMonth() + newTermMonths);
    }
  } else if (options?.keepEndDateSame) {
    // Keep end date same, calculate new payment
    newEndDateValue = newEndDate || currentEndDate;
    const monthsFromNow = Math.ceil((newEndDateValue.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30));
    newTermMonths = Math.max(1, monthsFromNow);
    
    // Calculate payment needed to pay off in this term
    if (effectiveRate > 0) {
      const monthlyRate = effectiveRate / 12 / 100;
      const numerator = effectiveBalance * monthlyRate * Math.pow(1 + monthlyRate, newTermMonths);
      const denominator = Math.pow(1 + monthlyRate, newTermMonths) - 1;
      newPaymentAmount = numerator / denominator;
    } else {
      newPaymentAmount = effectiveBalance / newTermMonths;
    }
  } else if (options?.customPayment) {
    // Use custom payment
    newPaymentAmount = options.customPayment;
    newTermMonths = calculateRemainingPayments(effectiveBalance, newPaymentAmount, effectiveRate);
    if (options.customEndDate) {
      newEndDateValue = options.customEndDate;
    } else {
      newEndDateValue = new Date();
      newEndDateValue.setMonth(newEndDateValue.getMonth() + newTermMonths);
    }
  } else if (options?.customEndDate) {
    // Use custom end date
    newEndDateValue = options.customEndDate;
    const monthsFromNow = Math.ceil((newEndDateValue.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30));
    newTermMonths = Math.max(1, monthsFromNow);
    
    // Calculate payment needed
    if (effectiveRate > 0) {
      const monthlyRate = effectiveRate / 12 / 100;
      const numerator = effectiveBalance * monthlyRate * Math.pow(1 + monthlyRate, newTermMonths);
      const denominator = Math.pow(1 + monthlyRate, newTermMonths) - 1;
      newPaymentAmount = numerator / denominator;
    } else {
      newPaymentAmount = effectiveBalance / newTermMonths;
    }
  } else if (newPayment !== undefined) {
    // Direct payment update
    newPaymentAmount = newPayment;
    newTermMonths = calculateRemainingPayments(effectiveBalance, newPaymentAmount, effectiveRate);
    newEndDateValue = new Date();
    newEndDateValue.setMonth(newEndDateValue.getMonth() + newTermMonths);
  } else if (newEndDate) {
    // Direct end date update
    newEndDateValue = newEndDate;
    const monthsFromNow = Math.ceil((newEndDateValue.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 30));
    newTermMonths = Math.max(1, monthsFromNow);
    
    // Calculate payment needed
    if (effectiveRate > 0) {
      const monthlyRate = effectiveRate / 12 / 100;
      const numerator = effectiveBalance * monthlyRate * Math.pow(1 + monthlyRate, newTermMonths);
      const denominator = Math.pow(1 + monthlyRate, newTermMonths) - 1;
      newPaymentAmount = numerator / denominator;
    } else {
      newPaymentAmount = effectiveBalance / newTermMonths;
    }
  }
  
  // Calculate new total interest
  const newTotalInterest = calculateTotalInterest(effectiveBalance, newPaymentAmount, effectiveRate);
  
  // Calculate changes
  const paymentChange = newPaymentAmount - currentPayment;
  const termChangeMonths = newTermMonths - oldTermMonths;
  const interestChange = newTotalInterest - oldTotalInterest;
  const endDateChange = Math.ceil((newEndDateValue.getTime() - currentEndDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    oldPayment: currentPayment,
    newPayment: newPaymentAmount,
    paymentChange,
    oldTermMonths,
    newTermMonths,
    termChangeMonths,
    oldTotalInterest,
    newTotalInterest,
    interestChange,
    oldEndDate: currentEndDate,
    newEndDate: newEndDateValue,
    endDateChange,
  };
}

/**
 * Recalculate and regenerate liability schedules
 * Deletes existing pending schedules and generates new ones
 */
export async function recalculateLiabilitySchedules(
  liabilityId: string,
  currentBalance: number,
  monthlyPayment: number,
  annualInterestRate: number,
  startDate: Date,
  endDate: Date,
  userId: string
): Promise<void> {
  try {
    // Get the next payment date before deleting schedules
    // First, try to get from liability's next_due_date
    let firstPaymentDate: Date;
    try {
      const { data: liability } = await supabase
        .from('liabilities')
        .select('next_due_date')
        .eq('id', liabilityId)
        .eq('user_id', userId)
        .single();
      
      if (liability?.next_due_date) {
        firstPaymentDate = new Date(liability.next_due_date);
        // Ensure it's not in the past
        if (firstPaymentDate < new Date()) {
          // If in the past, use today
          firstPaymentDate = new Date();
          // Round to next month's same day
          const dayOfMonth = firstPaymentDate.getDate();
          firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
          firstPaymentDate.setDate(Math.min(dayOfMonth, new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + 1, 0).getDate()));
        }
      } else {
        // No next_due_date, try to get from pending schedules
        const { data: nextSchedule } = await supabase
          .from('liability_schedules')
          .select('due_date')
          .eq('liability_id', liabilityId)
          .eq('user_id', userId)
          .eq('status', 'pending')
          .order('due_date', { ascending: true })
          .limit(1)
          .maybeSingle();
        
        if (nextSchedule?.due_date) {
          firstPaymentDate = new Date(nextSchedule.due_date);
          // Ensure it's not in the past
          if (firstPaymentDate < new Date()) {
            firstPaymentDate = new Date();
            const dayOfMonth = firstPaymentDate.getDate();
            firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
            firstPaymentDate.setDate(Math.min(dayOfMonth, new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + 1, 0).getDate()));
          }
        } else {
          // No schedules found, use today or start date, whichever is later
          firstPaymentDate = startDate > new Date() ? startDate : new Date();
          // Round to next month's same day
          const dayOfMonth = firstPaymentDate.getDate();
          firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
          firstPaymentDate.setDate(Math.min(dayOfMonth, new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + 1, 0).getDate()));
        }
      }
    } catch (error) {
      // Error getting next due date, use today or start date
      firstPaymentDate = startDate > new Date() ? startDate : new Date();
      const dayOfMonth = firstPaymentDate.getDate();
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() + 1);
      firstPaymentDate.setDate(Math.min(dayOfMonth, new Date(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + 1, 0).getDate()));
    }
    
    // Delete all pending schedules for this liability
    const { error: deleteError } = await supabase
      .from('liability_schedules')
      .delete()
      .eq('liability_id', liabilityId)
      .eq('user_id', userId)
      .eq('status', 'pending');
    
    if (deleteError) throw deleteError;
    
    // Calculate number of payments
    const numberOfPayments = calculateRemainingPayments(currentBalance, monthlyPayment, annualInterestRate);
    
    // Generate new schedules
    const bills = [];
    let remainingBalance = currentBalance;
    const monthlyRate = annualInterestRate > 0 ? annualInterestRate / 12 / 100 : 0;
    
    for (let i = 0; i < numberOfPayments; i++) {
      const dueDate = new Date(firstPaymentDate);
      dueDate.setMonth(dueDate.getMonth() + i);
      
      // Don't create schedules beyond end date
      if (dueDate > endDate) break;
      
      // Calculate interest for this payment
      const interest = monthlyRate > 0 ? remainingBalance * monthlyRate : 0;
      
      // Calculate principal
      const isLastPayment = i === numberOfPayments - 1 || dueDate >= endDate;
      let principal: number;
      let paymentAmount: number;
      
      if (isLastPayment) {
        // Last payment: pay remaining balance plus interest
        paymentAmount = remainingBalance + interest;
        principal = remainingBalance;
      } else {
        // Regular payment
        paymentAmount = monthlyPayment;
        principal = paymentAmount - interest;
      }
      
      // Update remaining balance
      remainingBalance = Math.max(0, remainingBalance - principal);
      
      bills.push({
        user_id: userId,
        liability_id: liabilityId,
        due_date: dueDate.toISOString().split('T')[0],
        amount: Math.round(paymentAmount * 100) / 100,
        status: 'pending',
        auto_pay: false,
        reminder_days: [1, 3, 7],
        metadata: {
          principal_component: Math.round(principal * 100) / 100,
          interest_component: Math.round(interest * 100) / 100,
          payment_number: i + 1,
          total_payments: numberOfPayments,
          remaining_balance: Math.round(remainingBalance * 100) / 100,
        },
      });
      
      // Stop if balance is zero
      if (remainingBalance <= 0) break;
    }
    
    // Insert new schedules in batches
    const chunkSize = 50;
    for (let i = 0; i < bills.length; i += chunkSize) {
      const chunk = bills.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('liability_schedules')
        .insert(chunk);
      
      if (error) {
        console.error('Error inserting liability schedules:', error);
        throw error;
      }
    }
    
    // Update liability's next_due_date to the first payment date
    if (bills.length > 0 && bills[0].due_date) {
      const { error: updateError } = await supabase
        .from('liabilities')
        .update({
          next_due_date: bills[0].due_date,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);
      
      if (updateError) {
        console.error('Error updating liability next_due_date:', updateError);
        // Don't throw, as schedules were created successfully
      }
    }
  } catch (error) {
    console.error('Error recalculating liability schedules:', error);
    throw error;
  }
}

/**
 * Validate that new total amount is not less than current balance
 */
export function validateLiabilityAmountUpdate(
  currentBalance: number,
  newTotalAmount: number
): { valid: boolean; error?: string } {
  if (newTotalAmount < currentBalance) {
    return {
      valid: false,
      error: `Cannot reduce total amount below current balance (${currentBalance.toLocaleString()}). You must pay off at least ${(currentBalance - newTotalAmount).toLocaleString()} first.`,
    };
  }
  return { valid: true };
}

/**
 * Calculate monthly payment for a given term and balance
 */
export function calculateMonthlyPayment(
  balance: number,
  annualInterestRate: number,
  termMonths: number
): number {
  if (termMonths <= 0) return 0;
  if (balance <= 0) return 0;
  
  const monthlyRate = annualInterestRate > 0 ? annualInterestRate / 12 / 100 : 0;
  
  if (monthlyRate === 0) {
    // No interest, simple division
    return balance / termMonths;
  }
  
  // Amortization formula: P = (r * PV) / (1 - (1 + r)^(-n))
  // Where:
  // P = monthly payment
  // r = monthly rate
  // PV = present value (balance)
  // n = number of payments
  
  const numerator = balance * monthlyRate * Math.pow(1 + monthlyRate, termMonths);
  const denominator = Math.pow(1 + monthlyRate, termMonths) - 1;
  
  return numerator / denominator;
}

/**
 * Calculate number of months between two dates
 */
export function calculateMonthsBetween(startDate: Date, endDate: Date): number {
  const years = endDate.getFullYear() - startDate.getFullYear();
  const months = endDate.getMonth() - startDate.getMonth();
  return years * 12 + months;
}

