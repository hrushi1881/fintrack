import { supabase } from '@/lib/supabase';
import { Goal, GoalContribution, GoalContributionWithTransaction, Account, Transaction } from '@/types';

export interface CreateGoalData {
  title: string;
  description?: string;
  target_amount: number;
  target_date?: string;
  category: string;
  color: string;
  icon: string;
  currency: string;
}

export interface AddContributionData {
  goal_id: string;
  amount: number;
  source_account_id: string;
  description?: string;
}

export interface WithdrawFromGoalData {
  goal_id: string;
  amount: number;
  destination_account_id: string;
  description?: string;
}

/**
 * Get or create the Goals Savings Account for a user
 */
export async function getOrCreateGoalsSavingsAccount(userId: string, currency: string): Promise<Account> {
  // First, try to find existing Goals Savings Account
  const { data: existingAccount, error: findError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'goals_savings')
    .single();

  if (existingAccount && !findError) {
    return existingAccount;
  }

  // If not found, create a new Goals Savings Account
  const { data: newAccount, error: createError } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      name: 'Goals Savings',
      type: 'goals_savings',
      balance: 0,
      currency: currency,
      color: '#10B981',
      icon: 'trophy',
      is_active: true,
      include_in_totals: true,
    })
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create Goals Savings Account: ${createError.message}`);
  }

  return newAccount;
}

/**
 * Create a new goal
 */
export async function createGoal(userId: string, goalData: CreateGoalData): Promise<Goal> {
  // Get or create Goals Savings Account
  const goalsAccount = await getOrCreateGoalsSavingsAccount(userId, goalData.currency);

  // Create the goal
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      title: goalData.title,
      description: goalData.description,
      target_amount: goalData.target_amount,
      current_amount: 0,
      currency: goalData.currency,
      target_date: goalData.target_date,
      category: goalData.category,
      color: goalData.color,
      icon: goalData.icon,
      is_achieved: false,
    })
    .select()
    .single();

  if (goalError) {
    throw new Error(`Failed to create goal: ${goalError.message}`);
  }

  return goal;
}

/**
 * Add a contribution to a goal
 */
export async function addContributionToGoal(contributionData: AddContributionData): Promise<{ goal: Goal; contribution: GoalContribution }> {
  const { goal_id, amount, source_account_id, description } = contributionData;

  // Get goal details
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goal_id)
    .single();

  if (goalError || !goal) {
    throw new Error(`Goal not found: ${goalError?.message}`);
  }

  // Get Goals Savings Account
  const { data: goalsAccount, error: accountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', goal.user_id)
    .eq('type', 'goals_savings')
    .single();

  if (accountError || !goalsAccount) {
    throw new Error(`Goals Savings Account not found: ${accountError?.message}`);
  }

  // Get source account
  const { data: sourceAccount, error: sourceError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', source_account_id)
    .single();

  if (sourceError || !sourceAccount) {
    throw new Error(`Source account not found: ${sourceError?.message}`);
  }

  // Validate source account has sufficient balance
  if (sourceAccount.balance < amount) {
    throw new Error('Insufficient balance in source account');
  }

  // Validate source account is not the Goals Savings Account
  if (sourceAccount.type === 'goals_savings') {
    throw new Error('Cannot contribute from Goals Savings Account');
  }

  // Get the Goal Savings category
  const { data: goalCategory, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('name', 'Goal Savings')
    .contains('activity_types', ['goal'])
    .eq('is_deleted', false)
    .single();

  if (categoryError) {
    throw new Error(`Failed to find Goal Savings category: ${categoryError.message}`);
  }

  // Spend from source account (personal bucket)
  const { data: spendResult, error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: source_account_id,
    p_bucket: { type: 'personal', id: null },
    p_amount: amount,
    p_category: goalCategory.id,
    p_description: description || `Contribution to ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (spendError) {
    throw new Error(`Failed to spend from source account: ${spendError.message}`);
  }

  const createdExpenseId = (spendResult as any)?.id || (spendResult as any)?.transaction_id || null;

  // Receive into Goals Savings account as goal bucket for this goal
  const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: goalsAccount.id,
    p_bucket: { type: 'goal', id: goal_id },
    p_amount: amount,
    p_category: goalCategory.id,
    p_description: description || `Contribution to ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (receiveError) {
    throw new Error(`Failed to receive into goal bucket: ${receiveError.message}`);
  }

  // Update goal current amount
  const newCurrentAmount = goal.current_amount + amount;
  const isAchieved = newCurrentAmount >= goal.target_amount;
  const { data: updatedGoal, error: goalUpdateError } = await supabase
    .from('goals')
    .update({ 
      current_amount: newCurrentAmount,
      is_achieved: isAchieved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goal_id)
    .select()
    .single();

  if (goalUpdateError) {
    throw new Error(`Failed to update goal: ${goalUpdateError.message}`);
  }

  // Create goal contribution record
  const { data: contribution, error: contributionError } = await supabase
    .from('goal_contributions')
    .insert({
      goal_id: goal_id,
      transaction_id: createdExpenseId,
      amount: amount,
      source_account_id: source_account_id,
      contribution_type: 'manual',
    })
    .select()
    .single();

  if (contributionError) {
    throw new Error(`Failed to create goal contribution: ${contributionError.message}`);
  }

  return { goal: updatedGoal, contribution };
}


/**
 * Get all goals for a user
 */
export async function getUserGoals(userId: string): Promise<Goal[]> {
  const { data: goals, error } = await supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch goals: ${error.message}`);
  }

  return goals || [];
}

/**
 * Get goal contributions
 */
export async function getGoalContributions(goalId: string): Promise<GoalContribution[]> {
  const { data: contributions, error } = await supabase
    .from('goal_contributions')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch goal contributions: ${error.message}`);
  }

  return contributions || [];
}

/**
 * Calculate goal progress percentage
 */
export function calculateGoalProgress(currentAmount: number, targetAmount: number): number {
  if (targetAmount <= 0) return 0;
  return Math.min(100, Math.round((currentAmount / targetAmount) * 100));
}

/**
 * Calculate monthly need for a goal
 */
export function calculateMonthlyNeed(currentAmount: number, targetAmount: number, targetDate?: string): number | null {
  if (!targetDate) return null;
  
  const today = new Date();
  const deadline = new Date(targetDate);
  const daysRemaining = Math.max(1, Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  const monthsRemaining = Math.max(1, daysRemaining / 30);
  
  const remainingAmount = targetAmount - currentAmount;
  return remainingAmount / monthsRemaining;
}

/**
 * Get progress color based on percentage
 */
export function getProgressColor(progress: number): string {
  if (progress >= 100) return '#10B981'; // Green
  if (progress >= 75) return '#3B82F6';  // Blue
  if (progress >= 50) return '#F59E0B';  // Orange
  return '#EF4444'; // Red
}

/**
 * Check for milestone achievements
 */
export function checkMilestoneAchievements(currentAmount: number, targetAmount: number): {
  milestone: string;
  achieved: boolean;
}[] {
  const milestones = [
    { threshold: 0.25, name: '25% Complete' },
    { threshold: 0.5, name: '50% Complete' },
    { threshold: 0.75, name: '75% Complete' },
    { threshold: 1.0, name: 'Goal Achieved' },
  ];

  const progress = currentAmount / targetAmount;
  
  return milestones.map(milestone => ({
    milestone: milestone.name,
    achieved: progress >= milestone.threshold,
  }));
}

/**
 * Get the next milestone to achieve
 */
export function getNextMilestone(currentAmount: number, targetAmount: number): {
  milestone: string;
  amount: number;
  progress: number;
} | null {
  const milestones = [
    { threshold: 0.25, name: '25% Complete' },
    { threshold: 0.5, name: '50% Complete' },
    { threshold: 0.75, name: '75% Complete' },
    { threshold: 1.0, name: 'Goal Achieved' },
  ];

  const progress = currentAmount / targetAmount;
  
  for (const milestone of milestones) {
    if (progress < milestone.threshold) {
      return {
        milestone: milestone.name,
        amount: targetAmount * milestone.threshold,
        progress: milestone.threshold * 100,
      };
    }
  }
  
  return null; // All milestones achieved
}

/**
 * Update goal progress and check for achievement
 */
export async function updateGoalProgress(goalId: string): Promise<{ goal: Goal; isNewlyAchieved: boolean }> {
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  // Calculate total contributions
  const { data: contributions, error: contributionsError } = await supabase
    .from('goal_contributions')
    .select('amount')
    .eq('goal_id', goalId);

  if (contributionsError) {
    throw new Error(`Failed to fetch contributions: ${contributionsError.message}`);
  }

  const totalContributions = contributions?.length || 0;
  const currentAmount = contributions?.reduce((sum, c) => sum + c.amount, 0) || 0;
  const isAchieved = currentAmount >= goal.target_amount;
  const wasAchieved = goal.is_achieved;
  const isNewlyAchieved = isAchieved && !wasAchieved;

  // Calculate average monthly saving
  const createdDate = new Date(goal.created_at);
  const now = new Date();
  const monthsElapsed = Math.max(1, Math.ceil((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const avgMonthlySaving = currentAmount / monthsElapsed;

  // Update goal with new data
  const updateData: any = {
    current_amount: currentAmount,
    total_contributions: totalContributions,
    avg_monthly_saving: avgMonthlySaving,
    updated_at: new Date().toISOString(),
  };

  if (isNewlyAchieved) {
    updateData.is_achieved = true;
    updateData.completed_at = new Date().toISOString();
    updateData.achievement_date = new Date().toISOString();
  }

  const { data: updatedGoal, error: updateError } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', goalId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update goal: ${updateError.message}`);
  }

  return { goal: updatedGoal, isNewlyAchieved };
}

/**
 * Check if a goal is completed and trigger celebration if needed
 */
export async function checkGoalCompletion(goalId: string): Promise<{ isCompleted: boolean; goal: Goal }> {
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  const isCompleted = goal.current_amount >= goal.target_amount && !goal.is_achieved;
  
  if (isCompleted) {
    // Update goal to mark as achieved
    const { data: updatedGoal, error: updateError } = await supabase
      .from('goals')
      .update({
        is_achieved: true,
        completed_at: new Date().toISOString(),
        achievement_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalId)
      .select()
      .single();

    if (updateError) {
      throw new Error(`Failed to update goal completion: ${updateError.message}`);
    }

    return { isCompleted: true, goal: updatedGoal };
  }

  return { isCompleted: false, goal };
}

/**
 * Extend goal with new target or date
 */
export async function extendGoal(
  goalId: string, 
  newTarget?: number, 
  newDate?: string
): Promise<Goal> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (newTarget) {
    updateData.target_amount = newTarget;
    updateData.is_achieved = false; // Reset achievement status
    updateData.completed_at = null;
    updateData.achievement_date = null;
  }

  if (newDate) {
    updateData.target_date = newDate;
  }

  const { data: updatedGoal, error: updateError } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', goalId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to extend goal: ${updateError.message}`);
  }

  return updatedGoal;
}

/**
 * Archive goal
 */
export async function archiveGoal(goalId: string): Promise<Goal> {
  const { data: updatedGoal, error: updateError } = await supabase
    .from('goals')
    .update({ 
      is_archived: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to archive goal: ${updateError.message}`);
  }

  return updatedGoal;
}

/**
 * Delete goal (soft delete)
 */
export async function deleteGoal(goalId: string): Promise<void> {
  const { error: updateError } = await supabase
    .from('goals')
    .update({ 
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);

  if (updateError) {
    throw new Error(`Failed to delete goal: ${updateError.message}`);
  }
}

/**
 * Withdraw funds from goal
 */
export async function withdrawFromGoal(
  goalId: string,
  amount: number,
  destinationAccountId: string,
  note?: string
): Promise<{ goal: Goal; transaction: Transaction }> {
  // Get goal details
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  if (amount > goal.current_amount) {
    throw new Error('Withdrawal amount exceeds available balance');
  }

  // Get Goals Savings Account
  const { data: goalsAccount, error: goalsAccountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', goal.user_id)
    .eq('type', 'goals_savings')
    .single();

  if (goalsAccountError) {
    throw new Error(`Failed to find Goals Savings Account: ${goalsAccountError.message}`);
  }

  // Get destination account
  const { data: destAccount, error: destAccountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', destinationAccountId)
    .single();

  if (destAccountError) {
    throw new Error(`Failed to find destination account: ${destAccountError.message}`);
  }

  // Get Goal Savings category
  const { data: goalCategory, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('name', 'Goal Savings')
    .contains('activity_types', ['goal'])
    .eq('is_deleted', false)
    .single();

  if (categoryError) {
    throw new Error(`Failed to find Goal Savings category: ${categoryError.message}`);
  }

  // Spend from goal bucket in Goals Savings account
  const { data: spendResult, error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: goalsAccount.id,
    p_bucket: { type: 'goal', id: goalId },
    p_amount: amount,
    p_category: goalCategory.id,
    p_description: note || `Withdrawal from ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (spendError) {
    throw new Error(`Failed to spend from goal bucket: ${spendError.message}`);
  }

  const createdWithdrawalTxnId = (spendResult as any)?.id || (spendResult as any)?.transaction_id || null;

  // Receive into destination account (personal funds)
  const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: destinationAccountId,
    p_bucket: { type: 'personal', id: null },
    p_amount: amount,
    p_category: goalCategory.id,
    p_description: note || `Withdrawal from ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (receiveError) {
    throw new Error(`Failed to receive into destination account: ${receiveError.message}`);
  }

  // Update goal current amount
  const newCurrentAmount = goal.current_amount - amount;
  const { data: updatedGoal, error: goalUpdateError } = await supabase
    .from('goals')
    .update({ 
      current_amount: newCurrentAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .select()
    .single();

  if (goalUpdateError) {
    throw new Error(`Failed to update goal: ${goalUpdateError.message}`);
  }

  // Return stub transaction with id if created; otherwise return updated goal
  return { goal: updatedGoal, transaction: { id: createdWithdrawalTxnId } as any };
}

/**
 * Fetch goal contributions
 */
export async function fetchGoalContributions(goalId: string): Promise<GoalContributionWithTransaction[]> {
  const { data: contributions, error } = await supabase
    .from('goal_contributions')
    .select(`
      *,
      transactions!inner(
        id,
        amount,
        description,
        date,
        account_id
      )
    `)
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch goal contributions: ${error.message}`);
  }

  // If we need account names, we can fetch them separately
  if (contributions && contributions.length > 0) {
    const accountIds = [...new Set(contributions.map(c => c.transactions?.account_id).filter(Boolean))];
    
    if (accountIds.length > 0) {
      const { data: accounts } = await supabase
        .from('accounts')
        .select('id, name')
        .in('id', accountIds);
      
      // Add account names to contributions
      contributions.forEach(contribution => {
        if (contribution.transactions?.account_id) {
          const account = accounts?.find(a => a.id === contribution.transactions.account_id);
          if (account) {
            contribution.transactions.account_name = account.name;
          }
        }
      });
    }
  }

  return contributions || [];
}
