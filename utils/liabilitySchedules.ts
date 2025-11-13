/**
 * Utility functions for managing liability schedules (bills)
 */

import { supabase } from '@/lib/supabase';

export interface LiabilitySchedule {
  id: string;
  user_id: string;
  liability_id: string;
  account_id?: string;
  due_date: string;
  amount: number;
  auto_pay: boolean;
  reminder_days: number[];
  status: 'pending' | 'completed' | 'cancelled' | 'overdue';
  completed_at?: string;
  created_at: string;
  updated_at: string;
  metadata?: any;
}

export interface UpdateLiabilityScheduleData {
  due_date?: string;
  amount?: number;
  status?: 'pending' | 'completed' | 'cancelled' | 'overdue';
  auto_pay?: boolean;
  reminder_days?: number[];
  account_id?: string;
  metadata?: any;
}

/**
 * Fetch liability schedules for a liability
 */
export async function fetchLiabilitySchedules(liabilityId: string): Promise<LiabilitySchedule[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('liability_schedules')
      .select('*')
      .eq('liability_id', liabilityId)
      .eq('user_id', user.user.id)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return (data || []) as LiabilitySchedule[];
  } catch (error) {
    console.error('Error fetching liability schedules:', error);
    throw error;
  }
}

/**
 * Update a liability schedule (bill)
 */
export async function updateLiabilitySchedule(
  scheduleId: string,
  updates: UpdateLiabilityScheduleData
): Promise<LiabilitySchedule> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Validate dates if provided
    if (updates.due_date) {
      const dueDate = new Date(updates.due_date);
      // Validate date is not in the past (or allow if user wants)
      // This validation can be customized based on requirements
    }

    // Validate amount if provided
    if (updates.amount !== undefined) {
      if (updates.amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
    }

    const { data, error } = await supabase
      .from('liability_schedules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) throw error;
    return data as LiabilitySchedule;
  } catch (error) {
    console.error('Error updating liability schedule:', error);
    throw error;
  }
}

/**
 * Delete a liability schedule (bill)
 */
export async function deleteLiabilitySchedule(scheduleId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('liability_schedules')
      .delete()
      .eq('id', scheduleId)
      .eq('user_id', user.user.id);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting liability schedule:', error);
    throw error;
  }
}

/**
 * Validate schedule dates against liability start and end dates
 */
export function validateScheduleDate(
  dueDate: string,
  liabilityStartDate?: string,
  liabilityEndDate?: string
): { valid: boolean; error?: string } {
  const date = new Date(dueDate);
  
  if (liabilityStartDate) {
    const startDate = new Date(liabilityStartDate);
    if (date < startDate) {
      return {
        valid: false,
        error: `Due date must be after liability start date (${startDate.toLocaleDateString()})`,
      };
    }
  }

  if (liabilityEndDate) {
    const endDate = new Date(liabilityEndDate);
    if (date > endDate) {
      return {
        valid: false,
        error: `Due date must be before liability end date (${endDate.toLocaleDateString()})`,
      };
    }
  }

  return { valid: true };
}

/**
 * Calculate payment breakdown for a schedule
 */
export function calculateScheduleBreakdown(
  amount: number,
  currentBalance: number,
  annualInterestRate: number,
  dueDate: Date,
  lastPaymentDate?: Date
): {
  principal: number;
  interest: number;
  remainingBalance: number;
} {
  const monthlyRate = annualInterestRate > 0 ? annualInterestRate / 12 / 100 : 0;
  
  let interest = 0;
  if (monthlyRate > 0) {
    if (lastPaymentDate) {
      const daysBetween = Math.max(1, Math.floor((dueDate.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysInMonth = 30;
      interest = currentBalance * monthlyRate * (daysBetween / daysInMonth);
    } else {
      interest = currentBalance * monthlyRate;
    }
  }

  const principal = Math.min(amount - interest, currentBalance);
  const remainingBalance = Math.max(0, currentBalance - principal);

  return {
    principal: Math.max(0, principal),
    interest: Math.max(0, interest),
    remainingBalance: Math.max(0, remainingBalance),
  };
}

/**
 * Fetch upcoming schedules for calendar display
 */
export async function fetchUpcomingSchedules(
  startDate?: Date,
  endDate?: Date
): Promise<LiabilitySchedule[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    let query = supabase
      .from('liability_schedules')
      .select('*')
      .eq('user_id', user.user.id)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    if (startDate) {
      query = query.gte('due_date', startDate.toISOString().split('T')[0]);
    }

    if (endDate) {
      query = query.lte('due_date', endDate.toISOString().split('T')[0]);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []) as LiabilitySchedule[];
  } catch (error) {
    console.error('Error fetching upcoming schedules:', error);
    throw error;
  }
}

