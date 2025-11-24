// ============================================================================
// GOALS FUNCTIONALITY
// ============================================================================
// All goal-related business logic, CRUD operations, and utilities
// Goals act as virtual money containers - users save money for specific targets

import { supabase } from '@/lib/supabase';
import { Goal, GoalContribution, GoalContributionWithTransaction, Account, Transaction } from '@/types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateGoalData {
  title: string;
  description?: string
  target_amount: number;
  target_date?: string;
  category: string;
  color: string;
  icon: string;
  currency: string;
  linked_account_ids?: string[]; // Accounts where goal funds can be stored
}

export interface UpdateGoalData {
  id: string;
  title?: string;
  description?: string;
  target_amount?: number;
  target_date?: string | null;
  category?: string;
  color?: string;
  icon?: string;
}

export interface AddContributionData {
  goal_id: string;
  amount: number;
  source_account_id: string;
  destination_account_id: string; // Account where goal funds will be stored
  description?: string;
  date?: string; // Optional date override
  currency?: string; // Currency from settings (defaults to goal currency if not provided)
  fund_bucket?: {
    type: 'personal' | 'borrowed' | 'goal' | 'reserved' | 'sinking';
    id: string | null;
  }; // Optional: specific fund bucket to deduct from (defaults to personal)
}

export interface WithdrawFromGoalData {
  goal_id: string;
  amount: number;
  source_account_id: string; // Account where the goal fund is located
  destination_account_id: string; // Account where money goes (personal funds)
  date?: string; // Optional date override
  description?: string;
}

export interface TransferGoalFundsData {
  goal_id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  description?: string;
}

export interface GoalFilters {
  is_achieved?: boolean;
  is_archived?: boolean;
  is_deleted?: boolean;
  category?: string;
}

export interface CompleteGoalData {
  goal_id: string;
  destination_account_id: string;
  description?: string;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new goal
 */
export async function createGoal(userId: string, goalData: CreateGoalData): Promise<Goal> {
  if (!userId) {
    throw new Error('User ID is required to create a goal');
  }

  if (!goalData.title || !goalData.title.trim()) {
    throw new Error('Goal title is required');
  }

  if (!goalData.target_amount || goalData.target_amount <= 0) {
    throw new Error('Target amount must be greater than 0');
  }

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .insert({
      user_id: userId,
      title: goalData.title.trim(),
      description: goalData.description?.trim(),
      target_amount: goalData.target_amount,
      current_amount: 0,
      currency: goalData.currency,
      target_date: goalData.target_date,
      category: goalData.category,
      color: goalData.color,
      icon: goalData.icon,
      is_achieved: false,
      is_archived: false,
      is_deleted: false,
    })
    .select()
    .single();

  if (goalError) {
    console.error('Error creating goal:', goalError);
    throw new Error(`Failed to create goal: ${goalError.message}`);
  }

  // Link accounts if provided
  if (goalData.linked_account_ids && goalData.linked_account_ids.length > 0) {
    await linkAccountsToGoal(goal.id, goalData.linked_account_ids, userId);
  }

  return goal;
}

/**
 * Get goal by ID
 */
export async function getGoalById(goalId: string, userId?: string): Promise<Goal | null> {
  if (!goalId) return null;

  let query = supabase
    .from('goals')
    .select('*')
    .eq('id', goalId);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error fetching goal:', error);
    throw error;
  }

  return data as Goal;
}

/**
 * Get all goals for a user
 */
export async function getUserGoals(userId: string, filters?: GoalFilters): Promise<Goal[]> {
  if (!userId) return [];

  let query = supabase
    .from('goals')
    .select('*')
    .eq('user_id', userId);

  if (filters?.is_achieved !== undefined) {
    query = query.eq('is_achieved', filters.is_achieved);
  }

  if (filters?.is_archived !== undefined) {
    query = query.eq('is_archived', filters.is_archived);
  }

  if (filters?.is_deleted !== undefined) {
    query = query.eq('is_deleted', filters.is_deleted);
  }

  if (filters?.category) {
    query = query.eq('category', filters.category);
  }

  // Default: show only non-archived, non-deleted goals
  if (filters?.is_archived === undefined) {
    query = query.eq('is_archived', false);
  }

  if (filters?.is_deleted === undefined) {
    query = query.eq('is_deleted', false);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching goals:', error);
    throw error;
  }

  return (data || []) as Goal[];
}

/**
 * Update goal
 */
export async function updateGoal(
  goalId: string,
  updates: UpdateGoalData
): Promise<Goal> {
  if (!goalId) {
    throw new Error('Goal ID is required');
  }

  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) {
    updateData.title = updates.title.trim();
  }

  if (updates.description !== undefined) {
    updateData.description = updates.description?.trim() || null;
  }

  if (updates.category !== undefined) {
    updateData.category = updates.category;
  }

  if (updates.color !== undefined) {
    updateData.color = updates.color;
  }

  if (updates.icon !== undefined) {
    updateData.icon = updates.icon;
  }

  if (updates.target_date !== undefined) {
    updateData.target_date = updates.target_date;
  }

  if (updates.target_amount !== undefined) {
    const { data: goal } = await supabase
      .from('goals')
      .select('current_amount, is_achieved')
      .eq('id', goalId)
      .single();

    if (goal) {
      // Only update is_achieved if it was already achieved and target increased above current
      // Otherwise keep user's manual completion status
      if (goal.is_achieved && goal.current_amount >= updates.target_amount) {
        // Already achieved and still achieved - keep it
      } else if (goal.is_achieved && goal.current_amount < updates.target_amount) {
        // Was achieved but target increased above current - reset achievement status
        updateData.is_achieved = false;
        updateData.completed_at = null;
        updateData.achievement_date = null;
      }
      // If not achieved, don't auto-achieve based on target change (manual completion)
    }
    updateData.target_amount = updates.target_amount;
  }

  const { data: updatedGoal, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', goalId)
    .select()
    .single();

  if (error) {
    console.error('Error updating goal:', error);
    throw new Error(`Failed to update goal: ${error.message}`);
  }

  return updatedGoal as Goal;
}

/**
 * Archive goal (soft delete)
 */
export async function archiveGoal(goalId: string): Promise<Goal> {
  if (!goalId) {
    throw new Error('Goal ID is required');
  }

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
    console.error('Error archiving goal:', updateError);
    throw new Error(`Failed to archive goal: ${updateError.message}`);
  }

  return updatedGoal;
}

/**
 * Delete goal (soft delete)
 * Prevents deletion if goal has remaining funds - user must withdraw first
 */
export async function deleteGoal(goalId: string, force: boolean = false): Promise<void> {
  if (!goalId) {
    throw new Error('Goal ID is required');
  }

  // Check if goal has funds
  const { data: goalFunds, error: fundsError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('type', 'goal')
    .or(`reference_id.eq.${goalId},metadata->>goal_id.eq.${goalId}`)
    .gt('balance', 0);

  if (fundsError) {
    throw new Error(`Failed to check goal funds: ${fundsError.message}`);
  }

  if (!force && goalFunds && goalFunds.length > 0) {
    const totalFunds = goalFunds.reduce((sum, fund) => {
      const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
      return sum + balance;
    }, 0);
    throw new Error(`Cannot delete goal: It has ₹${totalFunds.toFixed(2)} in funds. Please withdraw all funds first or use force delete.`);
  }

  const { error: updateError } = await supabase
    .from('goals')
    .update({ 
      is_deleted: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);

  if (updateError) {
    console.error('Error deleting goal:', updateError);
    throw new Error(`Failed to delete goal: ${updateError.message}`);
  }
}

/**
 * Get or create the Goals Savings Account for a user
 * Note: This is legacy - goals no longer require a special account
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
 * Add a contribution to a goal
 * Money moves from source account to destination account as goal fund
 */
export async function addContributionToGoal(contributionData: AddContributionData): Promise<{ goal: Goal; contribution: GoalContribution }> {
  // ============================================================================
  // COMPREHENSIVE VALIDATION
  // ============================================================================
  
  // Validate required fields
  if (!contributionData.goal_id) throw new Error('Goal ID is required');
  if (!contributionData.source_account_id) throw new Error('Source account ID is required');
  if (!contributionData.destination_account_id) throw new Error('Destination account ID is required');
  if (!contributionData.amount || contributionData.amount <= 0) throw new Error('Amount must be positive');
  if (!contributionData.date) throw new Error('Date is required');
  
  // Validate fund bucket
  if (!contributionData.fund_bucket) {
    throw new Error('Fund bucket is required. Please select which fund to deduct from.');
  }
  
  if (!contributionData.fund_bucket.type || !['personal', 'borrowed', 'goal'].includes(contributionData.fund_bucket.type)) {
    throw new Error('Invalid fund bucket type');
  }
  
  // Validate source and destination are different OR same (both valid)
  // If same: money moves from personal/borrowed → goal in same account
  // If different: money moves from source account → destination account
  
  console.log('✅ Input validation passed');
  
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

  // ============================================================================
  // STEP 1.5: VALIDATE DESTINATION ACCOUNT IS ALLOWED
  // ============================================================================
  // Destination must be either:
  // 1. Linked to goal (in goal_accounts table), OR
  // 2. Already has goal funds for this goal
  // ============================================================================

  const { data: linkedAccounts, error: linkedError } = await supabase
    .from('goal_accounts')
    .select('account_id')
    .eq('goal_id', goal_id);

  if (linkedError) {
    throw new Error(`Failed to check linked accounts: ${linkedError.message}`);
  }

  const { data: fundsAccounts, error: fundsError } = await supabase
    .from('account_funds')
    .select('account_id')
    .eq('type', 'goal')
    .eq('reference_id', goal_id)
    .gt('balance', 0);

  if (fundsError) {
    throw new Error(`Failed to check goal funds: ${fundsError.message}`);
  }

  // Build set of allowed destination accounts
  const allowedDestinations = new Set([
    ...(linkedAccounts?.map(la => la.account_id) || []),
    ...(fundsAccounts?.map(fa => fa.account_id) || [])
  ]);

  // Validate destination is allowed
  if (!allowedDestinations.has(destination_account_id)) {
    throw new Error(
      `Destination account is not linked to this goal. ` +
      `Please select a linked account from the "Account to Stay In" dropdown. ` +
      `You can link new accounts by editing the goal settings.`
    );
  }

  console.log(`✅ Destination account validated (linked or has funds)`);

  // Allow same account - user can save goal funds in the same account they're paying from
  // The money will be deducted from personal funds and stored as goal funds in the same account

  // Validate that source and destination accounts have the same currency (they must match each other)
  if (sourceAccount.currency !== destinationAccount.currency) {
    throw new Error(`Source and destination accounts must have the same currency. Source: ${sourceAccount.currency}, Destination: ${destinationAccount.currency}`);
  }

  // Validate account currency matches goal currency
  if (sourceAccount.currency !== goal.currency) {
    throw new Error(`Account currency (${sourceAccount.currency}) doesn't match goal currency (${goal.currency})`);
  }

  // Use account currency (no fallbacks - validated above)
  const transactionCurrency = sourceAccount.currency;

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

  // Determine fund bucket to spend from
  // Default to personal fund if not specified
  const fundBucket = contributionData.fund_bucket || { type: 'personal' as const, id: null };
  
  // Map fund bucket type for RPC (RPC uses 'liability' for borrowed)
  const bucketType = fundBucket.type === 'borrowed' ? 'liability' : fundBucket.type;
  const bucketId = fundBucket.type === 'personal' ? null : fundBucket.id;

  const transactionDate = contributionData.date!; // Date is validated above as required
  const transactionDescription = description || `Contribution to ${goal.title}`;
  const isSameAccount = source_account_id === destination_account_id;

  // ============================================================================
  // STEP 2: IDEMPOTENCY CHECK
  // ============================================================================
  // Check if this exact contribution already exists
  // RPC functions handle transaction-level idempotency internally
  // ============================================================================

  // Check if contribution exists via transaction lookup (date from transaction, not contribution table)
  const { data: existingTransactions, error: txCheckError } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', goal.user_id)
    .eq('account_id', source_account_id)
    .eq('amount', -amount)
    .eq('date', transactionDate)
    .eq('type', 'expense')
    .ilike('description', `%${transactionDescription}%`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (txCheckError) {
    console.error('❌ Error checking existing transaction:', txCheckError);
    // Don't throw - proceed with new contribution
  }

  // If transaction exists, check if contribution exists for it
  let existingContrib: any = null;
  let contribCheckError: any = null;
  
  if (existingTransactions && existingTransactions.length > 0) {
    const txId = existingTransactions[0].id;
    const { data: contrib, error: checkError } = await supabase
      .from('goal_contributions')
      .select(`
        *,
        source_transaction:transactions!goal_contributions_source_transaction_id_fkey(*)
      `)
      .eq('goal_id', goal_id)
      .eq('source_account_id', source_account_id)
      .eq('destination_account_id', destination_account_id)
      .eq('amount', amount)
      .eq('transaction_id', txId)
      .maybeSingle();

    contribCheckError = checkError;
    if (!checkError && contrib) {
      existingContrib = contrib;
    }
  }

  if (contribCheckError) {
    console.error('❌ Error checking existing contribution:', contribCheckError);
    throw new Error(`Failed to check for existing contribution: ${contribCheckError.message}`);
  }

  if (existingContrib) {
    console.log('⚠️ Contribution already exists (idempotency check), returning existing');
    
    // Reload goal to ensure fresh data
    const { data: reloadedGoal, error: reloadError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', goal_id)
      .single();
    
    if (reloadError) {
      console.error('❌ Error reloading goal:', reloadError);
      return {
        goal: goal, // Return original if reload fails
        contribution: existingContrib
      };
    }
    
    return {
      goal: reloadedGoal,
      contribution: existingContrib
    };
  }

  console.log('✅ No existing contribution found, proceeding with new contribution');

  // ============================================================================
  // STEP 3: CREATE CONTRIBUTION RECORD
  // ============================================================================
  
  // Spend from source account (selected fund bucket)
  const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: source_account_id,
    p_bucket: { type: bucketType, id: bucketId },
    p_amount: amount,
    p_category: goalCategory.id,
    p_description: transactionDescription,
    p_date: transactionDate,
    p_currency: transactionCurrency,
  });
  if (spendError) {
    throw new Error(`Failed to spend from source account: ${spendError.message}`);
  }

  // Find the expense transaction that was just created
  const { data: expenseTransactions, error: expenseTxError } = await supabase
    .from('transactions')
    .select('id, created_at, metadata')
    .eq('user_id', goal.user_id)
    .eq('account_id', source_account_id)
    .eq('amount', -amount)
    .eq('date', transactionDate)
    .eq('type', 'expense')
    .order('created_at', { ascending: false })
    .limit(1);

  if (expenseTxError || !expenseTransactions || expenseTransactions.length === 0) {
    throw new Error(`Failed to find transaction created by spend operation: ${expenseTxError?.message}`);
  }

  const createdExpenseId = expenseTransactions[0].id;

  // Receive into destination account as goal bucket
  const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: destination_account_id,
    p_bucket_type: 'goal',
    p_bucket_id: goal_id,
    p_amount: amount,
    p_category: goalCategory.id,
    p_description: transactionDescription,
    p_date: transactionDate,
    p_currency: transactionCurrency,
  });
  if (receiveError) {
    throw new Error(`Failed to receive into goal bucket: ${receiveError.message}`);
  }
  
  // Small delay to ensure RPC write is visible (trigger will update goal.current_amount)
  await new Promise(resolve => setTimeout(resolve, 100));

  // Trigger will update goal.current_amount automatically whenever account_funds changes
  // Just reload to get updated value (trigger handles the calculation)
  
  const { data: updatedGoal, error: reloadError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goal_id)
    .single();

  if (reloadError) {
    throw new Error(`Failed to reload goal: ${reloadError.message}`);
  }

  if (!updatedGoal) {
    throw new Error('Goal not found after contribution');
  }

  // Create goal contribution record (with destination_account_id)
  const { data: newContribution, error: contributionError } = await supabase
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

  let contribution: GoalContribution;

  if (contributionError) {
    // Check if it's a duplicate key error (contribution already exists)
    if (contributionError.code === '23505') {
      // Unique constraint violation - contribution already exists, reload it
      const { data: reloadedContrib, error: reloadError } = await supabase
        .from('goal_contributions')
        .select('*')
        .eq('goal_id', goal_id)
        .eq('transaction_id', createdExpenseId)
        .single();

      if (reloadError) {
        throw new Error(`Failed to reload existing contribution: ${reloadError.message}`);
      }

      contribution = reloadedContrib as GoalContribution;
      console.log('Contribution already existed, reloaded:', contribution.id);
    } else {
      throw new Error(`Failed to create goal contribution: ${contributionError.message}`);
    }
  } else {
    contribution = newContribution as GoalContribution;
  }

  return { goal: updatedGoal, contribution };
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


// ============================================================================
// CALCULATIONS & PROGRESS
// ============================================================================

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
 * Update goal progress (recalculate current_amount from account_funds)
 * NOTE: Does NOT auto-mark as achieved - completion is MANUAL
 */
export async function updateGoalProgress(goalId: string): Promise<Goal> {
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  // Calculate total from account_funds (source of truth)
  const { data: goalFunds, error: fundsError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('type', 'goal')
    .eq('reference_id', goalId); // ✅ Only check reference_id

  if (fundsError) {
    throw new Error(`Failed to fetch goal funds: ${fundsError.message}`);
  }

  const totalGoalAmount = goalFunds?.reduce((sum, fund) => {
    const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
    return sum + balance;
  }, 0) || 0;

  // Calculate total contributions count
  const { data: contributions, error: contributionsError } = await supabase
    .from('goal_contributions')
    .select('id')
    .eq('goal_id', goalId);

  const totalContributions = contributions?.length || 0;

  // Calculate average monthly saving
  const createdDate = new Date(goal.created_at);
  const now = new Date();
  const monthsElapsed = Math.max(1, Math.ceil((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
  const avgMonthlySaving = totalGoalAmount / monthsElapsed;

  // Update goal with new data (but keep is_achieved as-is - manual completion)
  const updateData: any = {
    current_amount: totalGoalAmount,
    total_contributions: totalContributions,
    avg_monthly_saving: avgMonthlySaving,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedGoal, error: updateError } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', goalId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update goal: ${updateError.message}`);
  }

  return updatedGoal;
}

/**
 * Check if a goal can be completed (has reached target)
 * NOTE: This only checks eligibility - actual completion is MANUAL
 */
export async function checkGoalCompletion(goalId: string): Promise<{ canComplete: boolean; goal: Goal }> {
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  const canComplete = goal.current_amount >= goal.target_amount && !goal.is_achieved;

  return { canComplete, goal };
}

/**
 * Mark goal as complete manually (user action)
 * This does NOT withdraw funds - user must do that separately if desired
 */
export async function markGoalComplete(goalId: string): Promise<Goal> {
  if (!goalId) {
    throw new Error('Goal ID is required');
  }

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  if (goal.is_achieved) {
    throw new Error('Goal is already marked as complete');
  }

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
    console.error('Error marking goal as complete:', updateError);
    throw new Error(`Failed to mark goal as complete: ${updateError.message}`);
  }

  return updatedGoal;
}

/**
 * Complete goal and withdraw all funds to accounts
 * This marks the goal as complete AND withdraws all remaining funds
 */
export async function completeGoalWithWithdraw(
  goalId: string,
  destinationAccountId: string,
  description?: string
): Promise<{ goal: Goal; transactions: Transaction[] }> {
  if (!goalId || !destinationAccountId) {
    throw new Error('Goal ID and destination account ID are required');
  }

  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (goalError) {
    throw new Error(`Failed to fetch goal: ${goalError.message}`);
  }

  // Get all accounts holding goal funds
  const goalAccounts = await getGoalAccounts(goalId, true);

  if (goalAccounts.length === 0) {
    // No funds to withdraw - just mark as complete
    const updatedGoal = await markGoalComplete(goalId);
    return { goal: updatedGoal, transactions: [] };
  }

  const transactions: Transaction[] = [];

  // Withdraw all funds from each account
  for (const { account, balance } of goalAccounts) {
    if (balance <= 0) continue;

    try {
      const { transaction } = await withdrawFromGoal(
        goalId,
        balance,
        account.id,
        destinationAccountId,
        description || `Complete goal: ${goal.title} - withdraw all funds`
      );
      if (transaction) {
        transactions.push(transaction as Transaction);
      }
    } catch (error) {
      console.error(`Error withdrawing funds from account ${account.id}:`, error);
      // Continue with other accounts even if one fails
    }
  }

  // Mark goal as complete
  const updatedGoal = await markGoalComplete(goalId);

  return { goal: updatedGoal, transactions };
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
 * Withdraw funds from goal
 * Money moves from goal fund in source account to personal funds in destination account
 */
export async function withdrawFromGoal(
  goalId: string,
  amount: number,
  sourceAccountId: string, // Account where the goal fund is located
  destinationAccountId: string, // Account where money goes (personal funds)
  note?: string,
  date?: string // Optional date override
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
    throw new Error(`Failed to find source account: ${sourceError?.message}`);
  }

  // Get destination account
  const { data: destAccount, error: destAccountError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', destinationAccountId)
    .eq('user_id', goal.user_id)
    .single();

  if (destAccountError) {
    throw new Error(`Failed to find destination account: ${destAccountError?.message}`);
  }

  // Note: Same account is allowed for source and destination
  // - Source: Goal fund (where money is withdrawn from)
  // - Destination: Personal fund (where money goes to)
  // They are different fund sources within the same account

  // Validate that source and destination accounts have the same currency (they must match each other)
  // This ensures the withdrawal transaction can be processed correctly
  if (sourceAccount.currency !== destAccount.currency) {
    throw new Error(`Source and destination accounts must have the same currency. Source: ${sourceAccount.currency}, Destination: ${destAccount.currency}`);
  }

  // Validate source account currency matches goal currency
  // Source account must match goal currency since that's where the goal fund is stored
  if (sourceAccount.currency !== goal.currency) {
    throw new Error(`Source account currency (${sourceAccount.currency}) doesn't match goal currency (${goal.currency}). The goal fund is stored in an account with currency ${goal.currency}.`);
  }
  
  // Use currency from the accounts (they both have the same currency after validation above)
  const transactionCurrency = sourceAccount.currency;

  // Check if goal fund exists in source account and has sufficient balance
  // NOTE: Goal funds are stored with reference_id = goal_id (from receive_to_account_bucket RPC)
  // The metadata->bucket_id is NOT the goal_id - it's the same as reference_id, so we only check reference_id
  const { data: goalFund, error: fundError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('account_id', sourceAccountId)
    .eq('type', 'goal')
    .eq('reference_id', goalId) // Only check reference_id - RPC stores goal_id here
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
  const withdrawalDate = date || new Date().toISOString().split('T')[0];
  
  const { data: spendResult, error: spendError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: sourceAccountId,
    p_bucket: { type: 'goal', id: goalId },
    p_amount: amount,
    p_category: goalCategory.id, // Pass category ID (RPC will also accept name as fallback)
    p_description: note || `Withdrawal from ${goal.title}`,
    p_date: withdrawalDate,
    p_currency: transactionCurrency, // Use currency from accounts (they match after validation)
  });
  if (spendError) {
    throw new Error(`Failed to spend from goal bucket: ${spendError.message}`);
  }

  const createdWithdrawalTxnId = (spendResult as any)?.id || (spendResult as any)?.transaction_id || null;

  // Receive into destination account (personal funds)
  // Use currency from accounts (they match after validation)
  const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
    p_user_id: goal.user_id,
    p_account_id: destinationAccountId,
    p_bucket_type: 'personal',
    p_bucket_id: null,
    p_amount: amount,
    p_category: goalCategory.id, // Pass category ID (RPC will also accept name as fallback)
    p_description: note || `Withdrawal from ${goal.title}`,
    p_date: withdrawalDate,
    p_currency: transactionCurrency, // Use currency from accounts (they match after validation)
  });
  if (receiveError) {
    throw new Error(`Failed to receive into destination account: ${receiveError.message}`);
  }

  // Trigger will update goal.current_amount automatically whenever account_funds changes
  // Just reload to get updated value (trigger handles the calculation)
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const { data: updatedGoal, error: reloadError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .single();

  if (reloadError) {
    throw new Error(`Failed to reload goal: ${reloadError.message}`);
  }

  if (!updatedGoal) {
    throw new Error('Goal not found after withdrawal');
  }

  // Return stub transaction with id if created; otherwise return updated goal
  return { goal: updatedGoal, transaction: { id: createdWithdrawalTxnId } as any };
}

/**
 * Get all accounts that hold funds for a specific goal
 */
export async function getGoalAccounts(goalId: string, forceRefresh: boolean = false): Promise<Array<{ account: Account; balance: number }>> {
  // Query account_funds to find all accounts with this goal's funds
  // Include only funds with balance > 0 (active goal funds)
  // Use left join to ensure we get all accounts even if account lookup fails
  // 
  // NOTE: Goal funds are stored with reference_id = goal_id (from receive_to_account_bucket RPC)
  // The metadata->bucket_id is NOT the goal_id - it's the same as reference_id, so we only check reference_id
  let query = supabase
    .from('account_funds')
    .select(`
      account_id,
      balance,
      account:accounts(*)
    `)
    .eq('type', 'goal')
    .eq('reference_id', goalId) // Only check reference_id - RPC stores goal_id here
    .gt('balance', 0); // Only include funds with balance > 0
  
  // Force fresh data by adding cache-busting parameter
  if (forceRefresh) {
    query = query.order('updated_at', { ascending: false, nullsFirst: false });
  }
  
  const { data: goalFunds, error } = await query;

  if (error) {
    console.error('❌ Error fetching goal accounts:', error);
    throw new Error(`Failed to fetch goal accounts: ${error.message}`);
  }

  if (!goalFunds || goalFunds.length === 0) {
    console.log(`ℹ️ No goal funds found for goal ${goalId}`);
    return [];
  }

  console.log(`📊 Found ${goalFunds.length} goal fund record(s) for goal ${goalId}`);

  // Group by account and sum balances
  const accountMap = new Map<string, { account: Account; balance: number }>();
  
  goalFunds.forEach((fund: any) => {
    const accountId = fund.account_id;
    const balance = typeof fund.balance === 'string' ? parseFloat(fund.balance) : fund.balance || 0;
    
    // Skip zero or negative balances (shouldn't happen due to query filter, but safety check)
    if (balance <= 0) {
      console.warn(`⚠️ Skipping fund with zero/negative balance for account ${accountId}`);
      return;
    }
    
    // Check if account exists
    if (!fund.account) {
      console.warn(`⚠️ Account not found for account_id ${accountId}, skipping`);
      return;
    }
    
    // Only include active accounts
    if (fund.account.is_active === false) {
      console.log(`ℹ️ Skipping inactive account: ${fund.account.name}`);
      return;
    }
    
    if (accountMap.has(accountId)) {
      accountMap.get(accountId)!.balance += balance;
    } else {
      accountMap.set(accountId, {
        account: fund.account,
        balance: balance,
      });
    }
  });

  const result = Array.from(accountMap.values());
  
  // Debug log to help troubleshoot
  console.log(`✅ getGoalAccounts for goal ${goalId}: Found ${result.length} account(s) with funds`);
  result.forEach((item) => {
    console.log(`  - Account: ${item.account.name} (${item.account.id}), Balance: ${item.balance}, Currency: ${item.account.currency}`);
  });

  return result;
}

// ============================================================================
// ACCOUNT LINKING
// ============================================================================

/**
 * Link accounts to a goal (where goal funds can be stored)
 */
export async function linkAccountsToGoal(
  goalId: string,
  accountIds: string[],
  userId: string
): Promise<void> {
  if (!goalId || !userId) {
    throw new Error('Goal ID and User ID are required');
  }

  // Verify goal belongs to user
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id, user_id')
    .eq('id', goalId)
    .eq('user_id', userId)
    .single();

  if (goalError || !goal) {
    throw new Error(`Goal not found or access denied: ${goalError?.message}`);
  }

  // Verify all accounts belong to user
  if (accountIds.length > 0) {
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id')
      .in('id', accountIds)
      .eq('user_id', userId);

    if (accountsError || !accounts || accounts.length !== accountIds.length) {
      throw new Error('Some accounts not found or access denied');
    }
  }

  // Delete existing links for this goal
  const { error: deleteError } = await supabase
    .from('goal_accounts')
    .delete()
    .eq('goal_id', goalId);

  if (deleteError) {
    console.error('Error deleting existing goal_accounts links:', deleteError);
    throw new Error(`Failed to remove existing account links: ${deleteError.message}`);
  }

  // Insert new links
  if (accountIds.length > 0) {
    const links = accountIds.map(accountId => ({
      goal_id: goalId,
      account_id: accountId,
    }));

    const { error: insertError } = await supabase
      .from('goal_accounts')
      .insert(links);

    if (insertError) {
      console.error('Error linking accounts to goal:', insertError);
      throw new Error(`Failed to link accounts: ${insertError.message}`);
    }
  }

  console.log(`✅ Linked ${accountIds.length} account(s) to goal ${goalId}`);
}

/**
 * Get all accounts linked to a goal
 */
export async function getLinkedAccountsForGoal(goalId: string): Promise<Account[]> {
  if (!goalId) {
    return [];
  }

  const { data: goalAccounts, error } = await supabase
    .from('goal_accounts')
    .select(`
      account:accounts (
        id,
        user_id,
        name,
        type,
        balance,
        currency,
        color,
        icon,
        description,
        include_in_totals,
        is_active,
        organization_id,
        credit_limit,
        linked_liability_id,
        created_at,
        updated_at
      )
    `)
    .eq('goal_id', goalId);

  if (error) {
    console.error('Error fetching linked accounts:', error);
    throw new Error(`Failed to fetch linked accounts: ${error.message}`);
  }

  if (!goalAccounts || goalAccounts.length === 0) {
    return [];
  }

  // Extract accounts from the nested structure
  const accounts = goalAccounts
    .map(ga => {
      const account = ga.account;
      if (!account) return null;
      return account as unknown as Account;
    })
    .filter((account): account is Account => account !== null && account.is_active !== false);

  return accounts;
}

/**
 * Unlink an account from a goal
 */
export async function unlinkAccountFromGoal(goalId: string, accountId: string): Promise<void> {
  if (!goalId || !accountId) {
    throw new Error('Goal ID and Account ID are required');
  }

  // Check if account has goal funds (cannot unlink if it has funds)
  const { data: goalFunds, error: fundsError } = await supabase
    .from('account_funds')
    .select('balance')
    .eq('account_id', accountId)
    .eq('type', 'goal')
    .eq('reference_id', goalId) // ✅ Only check reference_id
    .gt('balance', 0)
    .limit(1);

  if (fundsError) {
    throw new Error(`Failed to check goal funds: ${fundsError.message}`);
  }

  if (goalFunds && goalFunds.length > 0) {
    throw new Error('Cannot unlink account that has goal funds. Withdraw all funds first.');
  }

  const { error } = await supabase
    .from('goal_accounts')
    .delete()
    .eq('goal_id', goalId)
    .eq('account_id', accountId);

  if (error) {
    console.error('Error unlinking account from goal:', error);
    throw new Error(`Failed to unlink account: ${error.message}`);
  }
}

/**
 * Transfer goal funds from one account to another
 */
export async function transferGoalFunds(
  goalId: string,
  data: TransferGoalFundsData,
  userId: string
): Promise<void> {
  const { from_account_id, to_account_id, amount, description } = data;
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
    .eq('id', from_account_id)
    .eq('user_id', userId)
    .single();

  if (fromError || !fromAccount) {
    throw new Error(`Source account not found: ${fromError?.message}`);
  }

  const { data: toAccount, error: toError } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', to_account_id)
    .eq('user_id', userId)
    .single();

  if (toError || !toAccount) {
    throw new Error(`Destination account not found: ${toError?.message}`);
  }

  // Validate currencies match
  if (fromAccount.currency !== goal.currency || toAccount.currency !== goal.currency) {
    throw new Error('Account currencies must match goal currency');
  }

  // Note: Same account is allowed - transferring goal funds within the same account
  // This is valid since we're moving funds between different fund buckets (goal to goal)
  // Both source and destination use goal fund type, but this is a transfer operation

  // Check if goal fund exists in source account and has sufficient balance
  const { data: sourceGoalFund, error: sourceFundError } = await supabase
    .from('account_funds')
    .select('balance, id')
    .eq('account_id', from_account_id)
    .eq('type', 'goal')
    .eq('reference_id', goalId) // ✅ Only check reference_id
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
    p_account_id: from_account_id,
    p_bucket: { type: 'goal', id: goalId },
    p_amount: amount,
    p_category: goalCategory.id, // Pass category ID (RPC will also accept name as fallback)
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
    p_account_id: to_account_id,
    p_bucket_type: 'goal',
    p_bucket_id: goalId,
    p_amount: amount,
    p_category: goalCategory.id, // Pass category ID (RPC will also accept name as fallback)
    p_description: description || `Transfer goal funds from ${fromAccount.name} to ${toAccount.name}`,
    p_date: new Date().toISOString().split('T')[0],
    p_currency: goal.currency,
  });

  if (receiveError) {
    throw new Error(`Failed to receive into goal bucket: ${receiveError.message}`);
  }

  // Update goal current amount (sum all goal funds across all accounts)
  // NOTE: Do NOT update is_achieved - completion is manual
  await updateGoalProgress(goalId);
}

/**
 * Fetch goal contributions and withdrawals with transaction data
 * Returns both contributions (from goal_contributions) and withdrawals (from transactions with goal bucket metadata)
 */
export async function fetchGoalContributions(goalId: string): Promise<GoalContributionWithTransaction[]> {
  // Get goal to check user_id
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('user_id')
    .eq('id', goalId)
    .single();

  if (goalError || !goal) {
    throw new Error(`Goal not found: ${goalError?.message}`);
  }

  // Fetch contributions with transaction data
  const { data: contributions, error: contributionsError } = await supabase
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

  if (contributionsError) {
    throw new Error(`Failed to fetch goal contributions: ${contributionsError.message}`);
  }

  // Fetch withdrawals from transactions
  // Withdrawals are expense transactions with metadata indicating goal bucket spending
  const { data: withdrawalTransactions, error: withdrawalsError } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', goal.user_id)
    .eq('type', 'expense')
    .eq('metadata->>bucket_type', 'goal')
    .eq('metadata->>bucket_id', goalId)
    .order('created_at', { ascending: false });

  if (withdrawalsError) {
    console.warn('Error fetching withdrawal transactions:', withdrawalsError);
    // Don't throw - continue with contributions only
  }

  // Convert contributions to GoalContributionWithTransaction
  const contributionEntries: GoalContributionWithTransaction[] = (contributions || []).map(contrib => ({
    ...contrib,
    transactions: contrib.transactions ? {
      id: contrib.transactions.id,
      amount: contrib.transactions.amount,
      description: contrib.transactions.description,
      date: contrib.transactions.date,
      account_id: contrib.transactions.account_id,
    } : undefined,
  }));

  // Convert withdrawal transactions to GoalContributionWithTransaction format
  // Withdrawals have negative amounts (expenses) and use 'manual' type
  const withdrawalEntries: GoalContributionWithTransaction[] = (withdrawalTransactions || []).map(tx => ({
    id: `withdrawal_${tx.id}`, // Unique ID for withdrawal
    goal_id: goalId,
    transaction_id: tx.id,
    amount: -Math.abs(tx.amount), // Negative amount for withdrawal
    source_account_id: tx.account_id,
    contribution_type: 'manual', // Use 'manual' type for withdrawals
    created_at: tx.created_at,
    updated_at: tx.updated_at,
    transactions: {
      id: tx.id,
      amount: tx.amount,
      description: tx.description,
      date: tx.date,
      account_id: tx.account_id,
    },
  }));

  // If we need account names, we can fetch them separately
  const allAccountIds = [
    ...new Set([
      ...(contributions || []).map(c => c.transactions?.account_id).filter(Boolean),
      ...(withdrawalTransactions || []).map(tx => tx.account_id).filter(Boolean),
    ])
  ];
  
  if (allAccountIds.length > 0) {
    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name')
      .in('id', allAccountIds);
    
    // Add account names to contributions
    contributionEntries.forEach(contribution => {
      if (contribution.transactions?.account_id) {
        const account = accounts?.find(a => a.id === contribution.transactions!.account_id);
        if (account && contribution.transactions) {
          contribution.transactions.account_name = account.name;
        }
      }
    });
    
    // Add account names to withdrawals
    withdrawalEntries.forEach(withdrawal => {
      if (withdrawal.transactions?.account_id) {
        const account = accounts?.find(a => a.id === withdrawal.transactions!.account_id);
        if (account && withdrawal.transactions) {
          withdrawal.transactions.account_name = account.name;
        }
      }
    });
  }

  // Combine and sort by date (most recent first)
  const allEntries = [...contributionEntries, ...withdrawalEntries];
  allEntries.sort((a, b) => {
    const dateA = new Date(a.created_at).getTime();
    const dateB = new Date(b.created_at).getTime();
    return dateB - dateA;
  });

  return allEntries;
}

// ============================================================================
// UTILITIES & HELPERS
// ============================================================================

/**
 * Validate contribution data
 */
export function validateContributionData(data: AddContributionData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.goal_id) {
    errors.push('Goal ID is required');
  }

  if (!data.amount || data.amount <= 0) {
    errors.push('Amount must be greater than 0');
  }

  if (!data.source_account_id) {
    errors.push('Source account is required');
  }

  if (!data.destination_account_id) {
    errors.push('Destination account is required');
  }

  // Validate fund_bucket if provided
  if (data.fund_bucket) {
    if (!['personal', 'borrowed', 'goal', 'reserved', 'sinking'].includes(data.fund_bucket.type)) {
      errors.push('Invalid fund bucket type');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate goal data
 */
export function validateGoalData(data: CreateGoalData | UpdateGoalData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if ('title' in data && (!data.title || !data.title.trim())) {
    errors.push('Goal title is required');
  }

  if ('target_amount' in data && (!data.target_amount || data.target_amount <= 0)) {
    errors.push('Target amount must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate withdrawal data
 */
export function validateWithdrawalData(data: WithdrawFromGoalData): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!data.goal_id) {
    errors.push('Goal ID is required');
  }

  if (!data.amount || data.amount <= 0) {
    errors.push('Withdrawal amount must be greater than 0');
  }

  if (!data.source_account_id) {
    errors.push('Source account is required');
  }

  if (!data.destination_account_id) {
    errors.push('Destination account is required');
  }

  // Note: Same account is allowed for withdrawals
  // - Source: Goal fund (where money is withdrawn from)
  // - Destination: Personal fund (where money goes to)
  // They are different fund sources within the same account
  // No validation needed for same account

  return {
    valid: errors.length === 0,
    errors,
  };
}
