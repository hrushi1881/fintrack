/**
 * Goal Contribution Schedules
 * Manages scheduled contributions to goals with recurring patterns
 * Similar to liability schedules but for goal contributions
 */

import { supabase } from '@/lib/supabase';
import { 
  RecurrenceDefinition,
  generateSchedule,
  calculateStatus as calculateRecurrenceStatus,
  getDaysUntil
} from '@/utils/recurrence';
import { generateCycles, Cycle, matchTransactionsToCycles } from '@/utils/cycles';

export interface GoalContributionSchedule {
  id: string;
  user_id: string;
  goal_id: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  frequency: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  interval: number;
  start_date: string;
  end_date?: string;
  date_of_occurrence?: number;
  custom_unit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  custom_interval?: number;
  source_account_id?: string; // Account to deduct from
  destination_account_id?: string; // Account to store goal funds in
  fund_type: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  auto_create: boolean;
  auto_create_days_before: number;
  remind_before: boolean;
  reminder_days: number[];
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  paused_until?: string;
  color?: string;
  icon?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface CreateGoalScheduleData {
  goal_id: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  frequency: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  interval?: number;
  start_date: string;
  end_date?: string;
  date_of_occurrence?: number;
  custom_unit?: 'day' | 'week' | 'month' | 'quarter' | 'year';
  custom_interval?: number;
  source_account_id?: string;
  destination_account_id?: string;
  fund_type?: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  auto_create?: boolean;
  auto_create_days_before?: number;
  remind_before?: boolean;
  reminder_days?: number[];
  color?: string;
  icon?: string;
}

export interface UpdateGoalScheduleData {
  title?: string;
  description?: string;
  amount?: number;
  frequency?: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  interval?: number;
  start_date?: string;
  end_date?: string;
  date_of_occurrence?: number;
  source_account_id?: string;
  destination_account_id?: string;
  auto_create?: boolean;
  auto_create_days_before?: number;
  remind_before?: boolean;
  reminder_days?: number[];
  status?: 'active' | 'paused' | 'completed' | 'cancelled';
  paused_until?: string;
}

/**
 * Create a new goal contribution schedule
 */
export async function createGoalSchedule(
  userId: string,
  scheduleData: CreateGoalScheduleData
): Promise<GoalContributionSchedule> {
  try {
    // Validate goal exists
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('id, user_id, title, currency')
      .eq('id', scheduleData.goal_id)
      .eq('user_id', userId)
      .single();

    if (goalError || !goal) {
      throw new Error(`Goal not found: ${goalError?.message}`);
    }

    // Insert schedule
    const { data: schedule, error: scheduleError } = await supabase
      .from('goal_contribution_schedules')
      .insert({
        user_id: userId,
        goal_id: scheduleData.goal_id,
        title: scheduleData.title,
        description: scheduleData.description,
        amount: scheduleData.amount,
        currency: scheduleData.currency || goal.currency,
        frequency: scheduleData.frequency,
        interval: scheduleData.interval || 1,
        start_date: scheduleData.start_date,
        end_date: scheduleData.end_date,
        date_of_occurrence: scheduleData.date_of_occurrence,
        custom_unit: scheduleData.custom_unit,
        custom_interval: scheduleData.custom_interval,
        source_account_id: scheduleData.source_account_id,
        destination_account_id: scheduleData.destination_account_id,
        fund_type: scheduleData.fund_type || 'personal',
        specific_fund_id: scheduleData.specific_fund_id,
        auto_create: scheduleData.auto_create !== false,
        auto_create_days_before: scheduleData.auto_create_days_before || 3,
        remind_before: scheduleData.remind_before !== false,
        reminder_days: scheduleData.reminder_days || [7, 3, 1],
        status: 'active',
        color: scheduleData.color || goal.color,
        icon: scheduleData.icon || 'calendar',
      })
      .select()
      .single();

    if (scheduleError) {
      throw new Error(`Failed to create goal schedule: ${scheduleError.message}`);
    }

    return schedule as GoalContributionSchedule;
  } catch (error) {
    console.error('Error creating goal schedule:', error);
    throw error;
  }
}

/**
 * Fetch all goal contribution schedules for a user
 * Includes retry logic for schema cache refresh issues
 */
export async function fetchGoalSchedules(
  userId: string,
  filters?: {
    goal_id?: string;
    status?: string[];
  }
): Promise<GoalContributionSchedule[]> {
  const maxRetries = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let query = supabase
        .from('goal_contribution_schedules')
        .select('*')
        .eq('user_id', userId)
        .order('start_date', { ascending: true });

      if (filters?.goal_id) {
        query = query.eq('goal_id', filters.goal_id);
      }

      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      const { data, error } = await query;

      if (error) {
        // Handle schema cache issue gracefully - table might exist but cache not refreshed
        const isSchemaCacheError =
          error.message?.includes('schema cache') ||
          error.message?.includes('Could not find the table') ||
          error.code === 'PGRST301';

        if (isSchemaCacheError && attempt < maxRetries) {
          // Wait a bit for schema cache to refresh, then retry
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
          lastError = error;
          continue;
        }

        if (isSchemaCacheError) {
          console.warn(
            'Schema cache issue for goal_contribution_schedules after retries. Table exists but PostgREST cache may need refresh. Returning empty array.'
          );
          return [];
        }

        throw new Error(`Failed to fetch goal schedules: ${error.message}`);
      }

      return (data || []) as GoalContributionSchedule[];
    } catch (error: any) {
      // Handle schema cache errors gracefully
      const isSchemaCacheError =
        error?.message?.includes('schema cache') ||
        error?.message?.includes('Could not find the table') ||
        error?.code === 'PGRST301';

      if (isSchemaCacheError && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        lastError = error;
        continue;
      }

      if (isSchemaCacheError) {
        console.warn('Schema cache issue for goal_contribution_schedules, returning empty array.');
        return [];
      }

      console.error('Error fetching goal schedules:', error);
      throw error;
    }
  }

  // Fallback: return empty array if all retries failed
  console.warn('Failed to fetch goal schedules after retries, returning empty array.');
  return [];
}

/**
 * Fetch a single goal contribution schedule by ID
 */
export async function fetchGoalScheduleById(
  scheduleId: string,
  userId: string
): Promise<GoalContributionSchedule | null> {
  try {
    const { data, error } = await supabase
      .from('goal_contribution_schedules')
      .select('*')
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') return null;
      // Handle schema cache issue gracefully
      if (error.message?.includes('schema cache') || error.code === 'PGRST301') {
        console.warn('Schema cache issue for goal_contribution_schedules, returning null.');
        return null;
      }
      throw error;
    }

    return data as GoalContributionSchedule | null;
  } catch (error: any) {
    // Handle schema cache errors gracefully
    if (error?.message?.includes('schema cache') || error?.code === 'PGRST301') {
      console.warn('Schema cache issue for goal_contribution_schedules, returning null.');
      return null;
    }
    console.error('Error fetching goal schedule:', error);
    throw error;
  }
}

/**
 * Update a goal contribution schedule
 */
export async function updateGoalSchedule(
  scheduleId: string,
  userId: string,
  updates: UpdateGoalScheduleData
): Promise<GoalContributionSchedule> {
  try {
    const { data, error } = await supabase
      .from('goal_contribution_schedules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update goal schedule: ${error.message}`);
    }

    return data as GoalContributionSchedule;
  } catch (error) {
    console.error('Error updating goal schedule:', error);
    throw error;
  }
}

/**
 * Delete a goal contribution schedule (soft delete)
 */
export async function deleteGoalSchedule(
  scheduleId: string,
  userId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('goal_contribution_schedules')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to delete goal schedule: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deleting goal schedule:', error);
    throw error;
  }
}

/**
 * Pause a goal contribution schedule
 */
export async function pauseGoalSchedule(
  scheduleId: string,
  userId: string,
  pausedUntil?: string
): Promise<GoalContributionSchedule> {
  try {
    const { data, error } = await supabase
      .from('goal_contribution_schedules')
      .update({
        status: 'paused',
        paused_until: pausedUntil || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to pause goal schedule: ${error.message}`);
    }

    return data as GoalContributionSchedule;
  } catch (error) {
    console.error('Error pausing goal schedule:', error);
    throw error;
  }
}

/**
 * Resume a paused goal contribution schedule
 */
export async function resumeGoalSchedule(
  scheduleId: string,
  userId: string
): Promise<GoalContributionSchedule> {
  try {
    const { data, error } = await supabase
      .from('goal_contribution_schedules')
      .update({
        status: 'active',
        paused_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', scheduleId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to resume goal schedule: ${error.message}`);
    }

    return data as GoalContributionSchedule;
  } catch (error) {
    console.error('Error resuming goal schedule:', error);
    throw error;
  }
}

/**
 * Generate cycles for a goal contribution schedule
 */
export async function generateGoalScheduleCycles(
  schedule: GoalContributionSchedule,
  options?: {
    maxCycles?: number;
    startDate?: string;
    endDate?: string;
  }
): Promise<Cycle[]> {
  try {
    const cycles = generateCycles({
      startDate: options?.startDate || schedule.start_date,
      endDate: options?.endDate || schedule.end_date || undefined,
      frequency: schedule.frequency,
      interval: schedule.interval,
      customUnit: schedule.custom_unit,
      dueDay: schedule.date_of_occurrence,
      amount: schedule.amount,
      maxCycles: options?.maxCycles || 12,
      currentDate: new Date().toISOString().split('T')[0],
    });

    // Fetch actual contributions (transactions) for this schedule
    const { data: contributions, error: contributionsError } = await supabase
      .from('goal_contributions')
      .select(`
        *,
        transactions!inner(
          id,
          amount,
          date,
          description,
          metadata
        )
      `)
      .eq('goal_id', schedule.goal_id)
      .gte('transactions.date', schedule.start_date)
      .order('transactions.date', { ascending: true });

    if (contributionsError) {
      console.warn('Error fetching contributions for cycle matching:', contributionsError);
      return cycles;
    }

    // Map contributions to transactions format for cycle matching
    const transactions = (contributions || [])
      .filter(c => c.transactions)
      .map(c => ({
        id: c.transactions!.id,
        amount: Math.abs(c.transactions!.amount),
        date: c.transactions!.date,
        description: c.transactions!.description,
        metadata: {
          ...c.transactions!.metadata,
          goal_contribution_id: c.id,
        },
      }));

    // Match transactions to cycles
    const matchedCycles = matchTransactionsToCycles(cycles, transactions as any, {
      tolerance: 2,
      amountTolerance: 0.01,
    });

    return matchedCycles;
  } catch (error) {
    console.error('Error generating goal schedule cycles:', error);
    throw error;
  }
}

/**
 * Generate upcoming payment schedule for display in bills
 */
export async function generateUpcomingGoalPayments(
  scheduleId: string,
  userId: string,
  startDate: string,
  endDate: string
): Promise<Array<{ date: string; amount: number; status: string }>> {
  try {
    const schedule = await fetchGoalScheduleById(scheduleId, userId);
    if (!schedule || schedule.status !== 'active') {
      return [];
    }

    const def: RecurrenceDefinition = {
      frequency: schedule.frequency,
      interval: schedule.interval,
      start_date: schedule.start_date,
      end_date: schedule.end_date || undefined,
      date_of_occurrence: schedule.date_of_occurrence || undefined,
      custom_unit: schedule.custom_unit || undefined,
      custom_interval: schedule.custom_interval || undefined,
    };

    const occurrences = generateSchedule(def, {
      startDate,
      endDate,
      currentDate: new Date().toISOString().split('T')[0],
    });

    return occurrences.map(occurrence => ({
      date: occurrence.date,
      amount: schedule.amount,
      status: occurrence.status,
    }));
  } catch (error) {
    console.error('Error generating upcoming goal payments:', error);
    return [];
  }
}

/**
 * Get schedule statistics
 */
export async function getGoalScheduleStatistics(
  scheduleId: string,
  userId: string
): Promise<{
  totalCycles: number;
  completedCycles: number;
  upcomingCycles: number;
  totalContributed: number;
  totalExpected: number;
  completionRate: number;
  averageContribution: number;
}> {
  try {
    const schedule = await fetchGoalScheduleById(scheduleId, userId);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const cycles = await generateGoalScheduleCycles(schedule);

    const totalCycles = cycles.length;
    const completedCycles = cycles.filter(c => 
      c.status === 'paid_on_time' || 
      c.status === 'paid_early' || 
      c.status === 'paid_within_window' ||
      c.status === 'paid_late' ||
      c.status === 'overpaid'
    ).length;
    const upcomingCycles = cycles.filter(c => c.status === 'upcoming').length;

    const totalContributed = cycles.reduce((sum, c) => sum + c.actualAmount, 0);
    const totalExpected = cycles.reduce((sum, c) => sum + c.expectedAmount, 0);
    const completionRate = totalCycles > 0 ? (completedCycles / totalCycles) * 100 : 0;
    const averageContribution = completedCycles > 0 ? totalContributed / completedCycles : 0;

    return {
      totalCycles,
      completedCycles,
      upcomingCycles,
      totalContributed: Math.round(totalContributed * 100) / 100,
      totalExpected: Math.round(totalExpected * 100) / 100,
      completionRate: Math.round(completionRate * 10) / 10,
      averageContribution: Math.round(averageContribution * 100) / 100,
    };
  } catch (error) {
    console.error('Error getting goal schedule statistics:', error);
    throw error;
  }
}
