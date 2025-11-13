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
  destination_account_id: string; // Account where goal funds will be stored
  description?: string;
}

export interface WithdrawFromGoalData {
  goal_id: string;
  amount: number;
  source_account_id: string; // Account where the goal fund is located
  destination_account_id: string; // Account where money goes (personal funds)
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
 * Note: Goals no longer require a Goals Savings account - funds can be stored in any account
 */
export async function createGoal(userId: string, goalData: CreateGoalData): Promise<Goal> {
  // Create the goal (no account required at creation time)
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
 * Money moves from source account to destination account as goal fund
 */
export async function addContributionToGoal(contributionData: AddContributionData): Promise<{ goal: Goal; contribution: GoalContribution }> {
  const { goal_id, amount, source_account_id, destination_account_id, description } = contributionData;

  // Get goal details
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goal_id)
    .single();

  if (goalError || !goal) {
    throw new Error(`Goal not found: ${goalError?.message}`);
  }

  // Get destination account (where goal funds will be stored)
  const { data: destinationAccount, error: destError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', destination_account_id)
    .eq('user_id', goal.user_id)
    .single();

  if (destError || !destinationAccount) {
    throw new Error(`Destination account not found: ${destError?.message}`);
  }

  // Get source account
  const { data: sourceAccount, error: sourceError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', source_account_id)
    .eq('user_id', goal.user_id)
    .single();

  if (sourceError || !sourceAccount) {
    throw new Error(`Source account not found: ${sourceError?.message}`);
  }

  // Allow same account - user can save goal funds in the same account they're paying from
  // The money will be deducted from personal funds and stored as goal funds in the same account

  // Validate currencies match
  if (sourceAccount.currency !== goal.currency || destinationAccount.currency !== goal.currency) {
    throw new Error('Account currencies must match goal currency');
  }

  // Get the Goal Savings category
  const { data: goalCategory, error: categoryError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('name', 'Goal Savings')
    .contains('activity_types', ['goal'])
    .eq('is_deleted', false)
    .single();

  if (categoryError) {
    throw new Error(`Failed to find Goal Savings category: ${categoryError.message}`);
  }

  // Spend from source account (personal bucket)
  // Contributions always come from personal funds
  const { data: spendResult, error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: source_account_id,
    p_bucket: { type: 'personal', id: null },
    p_amount: amount,
    p_category: categoryName, // Use category name, not ID
    p_description: description || `Contribution to ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (spendError) {
    throw new Error(`Failed to spend from source account: ${spendError.message}`);
  }

  const createdExpenseId = (spendResult as any)?.id || (spendResult as any)?.transaction_id || null;

  // Receive into destination account as goal bucket for this goal
  const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: destination_account_id,
    p_bucket_type: 'goal',
    p_bucket_id: goal_id,
    p_amount: amount,
    p_category: goalCategory.name || 'Goal Savings',
    p_description: description || `Contribution to ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (receiveError) {
    throw new Error(`Failed to receive into goal bucket: ${receiveError.message}`);
  }

  // Update goal current amount (sum all goal funds across all accounts)
  // Query account_funds using type='goal' and reference_id=goal_id
  const { data: goalFunds, error: fundsError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('type', 'goal')
    .or(`reference_id.eq.${goal_id},metadata->>goal_id.eq.${goal_id}`);
  
  const totalGoalAmount = goalFunds?.reduce((sum, fund) => {
    const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
    return sum + balance;
  }, 0) || (goal.current_amount + amount);

  const isAchieved = totalGoalAmount >= goal.target_amount;
  const { data: updatedGoal, error: goalUpdateError } = await supabase
    .from('goals')
    .update({ 
      current_amount: totalGoalAmount,
      is_achieved: isAchieved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goal_id)
    .select()
    .single();

  if (goalUpdateError) {
    throw new Error(`Failed to update goal: ${goalUpdateError.message}`);
  }

  // Create goal contribution record (with destination_account_id)
  const { data: contribution, error: contributionError } = await supabase
    .from('goal_contributions')
    .insert({
      goal_id: goal_id,
      transaction_id: createdExpenseId,
      amount: amount,
      source_account_id: source_account_id,
      destination_account_id: destination_account_id, // Account where goal funds are stored
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
 * Money moves from goal fund in source account to personal funds in destination account
 */
export async function withdrawFromGoal(
  goalId: string,
  amount: number,
  sourceAccountId: string, // Account where the goal fund is located
  destinationAccountId: string, // Account where money goes (personal funds)
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

  // Get source account (where goal fund is located)
  const { data: sourceAccount, error: sourceError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', sourceAccountId)
    .eq('user_id', goal.user_id)
    .single();

  if (sourceError) {
    throw new Error(`Failed to find source account: ${sourceError.message}`);
  }

  // Get destination account
  const { data: destAccount, error: destAccountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', destinationAccountId)
    .eq('user_id', goal.user_id)
    .single();

  if (destAccountError) {
    throw new Error(`Failed to find destination account: ${destAccountError.message}`);
  }

  // Validate source and destination are different
  if (sourceAccountId === destinationAccountId) {
    throw new Error('Source and destination accounts must be different');
  }

  // Validate currencies match goal currency
  // Both accounts must match goal currency for goal operations to maintain consistency
  // Goal funds are stored in accounts with matching currency, so withdrawals should also match
  if (sourceAccount.currency !== goal.currency) {
    throw new Error(`Source account currency (${sourceAccount.currency || 'undefined'}) must match goal currency (${goal.currency}). The goal fund is stored in an account with currency ${goal.currency}.`);
  }
  
  if (destAccount.currency !== goal.currency) {
    throw new Error(`Destination account currency (${destAccount.currency || 'undefined'}) must match goal currency (${goal.currency}). Please select an account with currency ${goal.currency} to receive the withdrawal.`);
  }

  // Check if goal fund exists in source account and has sufficient balance
  const { data: goalFund, error: fundError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('account_id', sourceAccountId)
    .eq('type', 'goal')
    .or(`reference_id.eq.${goalId},metadata->>goal_id.eq.${goalId}`)
    .single();

  if (fundError || !goalFund) {
    throw new Error(`Goal fund not found in source account: ${fundError?.message}`);
  }

  const fundBalance = typeof goalFund.balance === 'string' ? parseFloat(goalFund.balance) : goalFund.balance || 0;
  if (fundBalance < amount) {
    throw new Error('Withdrawal amount exceeds available goal fund balance');
  }

  // Get Goal Savings category
  const { data: goalCategory, error: categoryError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('name', 'Goal Savings')
    .contains('activity_types', ['goal'])
    .eq('is_deleted', false)
    .single();

  if (categoryError) {
    throw new Error(`Failed to find Goal Savings category: ${categoryError.message}`);
  }

  // Spend from goal bucket in source account
  // Goal funds are locked - can only be withdrawn, not spent/transferred
  const { data: spendResult, error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: sourceAccountId,
    p_bucket: { type: 'goal', id: goalId },
    p_amount: amount,
    p_category: goalCategory.name || 'Goal Savings', // Use category name
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
    p_bucket_type: 'personal',
    p_bucket_id: null,
    p_amount: amount,
    p_category: goalCategory.name || 'Goal Savings',
    p_description: note || `Withdrawal from ${goal.title}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });
  if (receiveError) {
    throw new Error(`Failed to receive into destination account: ${receiveError.message}`);
  }

  // Update goal current amount (sum all goal funds across all accounts)
  const { data: goalFunds, error: fundsError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('type', 'goal')
    .or(`reference_id.eq.${goalId},metadata->>goal_id.eq.${goalId}`);
  
  const totalGoalAmount = goalFunds?.reduce((sum, fund) => {
    const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
    return sum + balance;
  }, 0) || 0;

  const { data: updatedGoal, error: goalUpdateError } = await supabase
    .from('goals')
    .update({ 
      current_amount: totalGoalAmount,
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
 * Get all accounts that hold funds for a specific goal
 */
export async function getGoalAccounts(goalId: string): Promise<Array<{ account: Account; balance: number }>> {
  // Query account_funds to find all accounts with this goal's funds
  const { data: goalFunds, error } = await supabase
    .from('account_funds')
    .select(`
      account_id,
      balance,
      account:accounts!inner(*)
    `)
    .eq('type', 'goal')
    .or(`reference_id.eq.${goalId},metadata->>goal_id.eq.${goalId}`);

  if (error) {
    throw new Error(`Failed to fetch goal accounts: ${error.message}`);
  }

  if (!goalFunds || goalFunds.length === 0) {
    return [];
  }

  // Group by account and sum balances
  const accountMap = new Map<string, { account: Account; balance: number }>();
  
  goalFunds.forEach((fund: any) => {
    const accountId = fund.account_id;
    const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
    
    if (accountMap.has(accountId)) {
      accountMap.get(accountId)!.balance += balance;
    } else {
      accountMap.set(accountId, {
        account: fund.account,
        balance: balance,
      });
    }
  });

  return Array.from(accountMap.values());
}

/**
 * Update a goal
 */
export async function updateGoal(
  goalId: string,
  updates: Partial<{
    title: string;
    description: string;
    target_amount: number;
    target_date: string | null;
    category: string;
    color: string;
    icon: string;
  }>
): Promise<Goal> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) updateData.title = updates.title;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.target_amount !== undefined) updateData.target_amount = updates.target_amount;
  if (updates.target_date !== undefined) updateData.target_date = updates.target_date;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.color !== undefined) updateData.color = updates.color;
  if (updates.icon !== undefined) updateData.icon = updates.icon;

  // If target_amount changed, check if goal is achieved
  if (updates.target_amount !== undefined) {
    const { data: goal } = await supabase
      .from('goals')
      .select('current_amount')
      .eq('id', goalId)
      .single();

    if (goal) {
      updateData.is_achieved = goal.current_amount >= updates.target_amount;
    }
  }

  const { data: updatedGoal, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', goalId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update goal: ${error.message}`);
  }

  return updatedGoal as Goal;
}

/**
 * Transfer goal funds from one account to another
 */
export async function transferGoalFunds(
  goalId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  userId: string,
  description?: string
): Promise<void> {
  // Get goal details
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError || !goal) {
    throw new Error(`Goal not found: ${goalError?.message}`);
  }

  // Validate accounts
  const { data: fromAccount, error: fromError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', fromAccountId)
    .eq('user_id', userId)
    .single();

  if (fromError || !fromAccount) {
    throw new Error(`Source account not found: ${fromError?.message}`);
  }

  const { data: toAccount, error: toError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', toAccountId)
    .eq('user_id', userId)
    .single();

  if (toError || !toAccount) {
    throw new Error(`Destination account not found: ${toError?.message}`);
  }

  // Validate currencies match
  if (fromAccount.currency !== goal.currency || toAccount.currency !== goal.currency) {
    throw new Error('Account currencies must match goal currency');
  }

  // Validate source and destination are different
  if (fromAccountId === toAccountId) {
    throw new Error('Source and destination accounts must be different');
  }

  // Check if goal fund exists in source account and has sufficient balance
  const { data: sourceGoalFund, error: sourceFundError } = await supabase
    .from('account_funds')
    .select('balance, id')
    .eq('account_id', fromAccountId)
    .eq('type', 'goal')
    .or(`reference_id.eq.${goalId},metadata->>goal_id.eq.${goalId}`)
    .single();

  if (sourceFundError || !sourceGoalFund) {
    throw new Error(`Goal fund not found in source account: ${sourceFundError?.message}`);
  }

  const fundBalance = typeof sourceGoalFund.balance === 'string' 
    ? parseFloat(sourceGoalFund.balance) 
    : sourceGoalFund.balance || 0;
  
  if (fundBalance < amount) {
    throw new Error('Transfer amount exceeds available goal fund balance');
  }

  // Get Goal Savings category
  const { data: goalCategory, error: categoryError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('name', 'Goal Savings')
    .contains('activity_types', ['goal'])
    .eq('is_deleted', false)
    .single();

  if (categoryError) {
    throw new Error(`Failed to find Goal Savings category: ${categoryError.message}`);
  }

  // Spend from goal bucket in source account
  const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: userId,
    p_account_id: fromAccountId,
    p_bucket: { type: 'goal', id: goalId },
    p_amount: amount,
    p_category: goalCategory.name || 'Goal Savings',
    p_description: description || `Transfer goal funds from ${fromAccount.name} to ${toAccount.name}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });

  if (spendError) {
    throw new Error(`Failed to spend from goal bucket: ${spendError.message}`);
  }

  // Receive into goal bucket in destination account
  const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
    p_user_id: userId,
    p_account_id: toAccountId,
    p_bucket_type: 'goal',
    p_bucket_id: goalId,
    p_amount: amount,
    p_category: goalCategory.name || 'Goal Savings',
    p_description: description || `Transfer goal funds from ${fromAccount.name} to ${toAccount.name}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });

  if (receiveError) {
    throw new Error(`Failed to receive into goal bucket: ${receiveError.message}`);
  }

  // Update goal current amount (sum all goal funds across all accounts)
  const { data: goalFunds, error: fundsError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('type', 'goal')
    .or(`reference_id.eq.${goalId},metadata->>goal_id.eq.${goalId}`);
  
  const totalGoalAmount = goalFunds?.reduce((sum, fund) => {
    const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
    return sum + balance;
  }, 0) || 0;

  const isAchieved = totalGoalAmount >= goal.target_amount;
  await supabase
    .from('goals')
    .update({ 
      current_amount: totalGoalAmount,
      is_achieved: isAchieved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);
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
