import { supabase } from '@/lib/supabase';
import { Budget, BudgetAccount, BudgetTransaction, BudgetEvent, Transaction, Account, Goal, BudgetPeriodSummary, RenewalDecision } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';

/**
 * Create a new budget with account associations
 */
/**
 * Calculate monthly target for goal-based budget (Subtype A)
 */
export async function calculateMonthlyTargetForGoal(goalId: string): Promise<number> {
  const { data: goal, error } = await supabase
    .from('goals')
    .select('target_amount, current_amount, target_date')
    .eq('id', goalId)
    .single();

  if (error || !goal) {
    throw new Error(`Goal not found: ${error?.message}`);
  }

  const remaining = goal.target_amount - goal.current_amount;
  if (remaining <= 0) {
    return 0;
  }

  if (!goal.target_date) {
    // If no target date, assume 12 months
    return remaining / 12;
  }

  const today = new Date();
  const targetDate = new Date(goal.target_date);
  const monthsRemaining = Math.max(1, (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30));

  return remaining / monthsRemaining;
}

/**
 * Create a new budget
 */
export async function createBudget(budgetData: {
  user_id: string;
  name: string;
  amount: number;
  currency: string;
  created_by: string;
  budget_type: 'monthly' | 'category' | 'goal_based' | 'smart' | 'custom';
  budget_mode?: 'spend_cap' | 'save_target';
  start_date: string;
  end_date: string;
  recurrence_pattern?: 'monthly' | 'weekly' | 'yearly' | 'custom' | null;
  rollover_enabled: boolean;
  category_id?: string | null;
  goal_id?: string | null;
  metadata?: any;
  alert_settings?: any;
  account_ids?: string[];
}): Promise<Budget> {
  // Auto-determine budget_mode for goal_based budgets
  let budgetMode = budgetData.budget_mode;
  if (budgetData.budget_type === 'goal_based' && !budgetMode) {
    // Check goal subtype from metadata
    const goalSubtype = budgetData.metadata?.goal_subtype;
    if (goalSubtype === 'A') {
      // Subtype A: Saving Target Mode - track contributions
      budgetMode = 'save_target';
    } else {
      // Subtype B or C: Under Budget Saving or Category-Linked - track expenses
      budgetMode = 'spend_cap';
    }
  }

  // Auto-calculate amount for goal_based subtype A (Saving Target Mode)
  let amount = budgetData.amount;
  if (budgetData.budget_type === 'goal_based' && budgetData.goal_id && budgetData.metadata?.goal_subtype === 'A' && budgetData.metadata?.auto_calculate_amount) {
    amount = await calculateMonthlyTargetForGoal(budgetData.goal_id);
  }

  const { data: budget, error } = await supabase
    .from('budgets')
    .insert({
      user_id: budgetData.user_id,
      name: budgetData.name,
      amount: amount,
      currency: budgetData.currency,
      created_by: budgetData.created_by,
      budget_type: budgetData.budget_type,
      budget_mode: budgetMode || 'spend_cap',
      start_date: budgetData.start_date,
      end_date: budgetData.end_date,
      recurrence_pattern: budgetData.recurrence_pattern || null,
      rollover_enabled: budgetData.rollover_enabled,
      category_id: budgetData.category_id || null,
      goal_id: budgetData.goal_id || null,
      metadata: budgetData.metadata || {},
      alert_settings: budgetData.alert_settings || {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create budget: ${error.message}`);
  }

  // Link accounts if provided
  if (budgetData.account_ids && budgetData.account_ids.length > 0) {
    const accountLinks = budgetData.account_ids.map(accountId => ({
      budget_id: budget.id,
      account_id: accountId,
      account_role: 'owner' as const,
      last_synced_at: new Date().toISOString(),
    }));

    const { error: linkError } = await supabase
      .from('budget_accounts')
      .insert(accountLinks);

    if (linkError) {
      console.error('Failed to link accounts to budget:', linkError);
    }
  }

  // Log budget creation event
  await logBudgetEvent(
    budget.id,
    'budget_created',
    budgetData.created_by,
    `Budget "${budgetData.name}" created`,
    { budget_type: budgetData.budget_type, amount: amount }
  );

  return budget as Budget;
}

/**
 * Update an existing budget
 */
export async function updateBudget(
  budgetId: string,
  updates: Partial<{
    name: string;
    amount: number;
    start_date: string;
    end_date: string;
    recurrence_pattern: 'monthly' | 'weekly' | 'yearly' | 'custom' | null;
    rollover_enabled: boolean;
    budget_mode: 'spend_cap' | 'save_target';
    category_id: string | null;
    goal_id: string | null;
    account_ids: string[];
    alert_settings: any;
  }>,
  actorId: string
): Promise<Budget> {
  const updateData: any = {
    updated_at: new Date().toISOString(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.amount !== undefined) updateData.amount = updates.amount;
  if (updates.start_date !== undefined) updateData.start_date = updates.start_date;
  if (updates.end_date !== undefined) updateData.end_date = updates.end_date;
  if (updates.recurrence_pattern !== undefined) {
    updateData.recurrence_pattern = updates.recurrence_pattern === null ? null : updates.recurrence_pattern;
  }
  if (updates.rollover_enabled !== undefined) updateData.rollover_enabled = updates.rollover_enabled;
  if (updates.budget_mode !== undefined) updateData.budget_mode = updates.budget_mode;
  if (updates.category_id !== undefined) updateData.category_id = updates.category_id;
  if (updates.goal_id !== undefined) updateData.goal_id = updates.goal_id;
  if (updates.alert_settings !== undefined) updateData.alert_settings = updates.alert_settings;

  const { data: budget, error } = await supabase
    .from('budgets')
    .update(updateData)
    .eq('id', budgetId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update budget: ${error.message}`);
  }

  // Update account links if provided
  if (updates.account_ids !== undefined) {
    // Get current account IDs
    const currentAccountIds = await getBudgetAccountIds(budgetId);

    // Determine which accounts to add and remove
    const accountsToAdd = updates.account_ids.filter(id => !currentAccountIds.includes(id));
    const accountsToRemove = currentAccountIds.filter(id => !updates.account_ids.includes(id));

    // Remove accounts
    if (accountsToRemove.length > 0) {
      await supabase
        .from('budget_accounts')
        .delete()
        .eq('budget_id', budgetId)
        .in('account_id', accountsToRemove);
    }

    // Add new accounts
    if (accountsToAdd.length > 0) {
      const accountLinks = accountsToAdd.map(accountId => ({
        budget_id: budgetId,
        account_id: accountId,
        account_role: 'owner' as const,
        last_synced_at: new Date().toISOString(),
      }));

      await supabase
        .from('budget_accounts')
        .insert(accountLinks);
    }
  }

  // Update budget progress if amount or dates changed
  if (updates.amount !== undefined || updates.start_date !== undefined || updates.end_date !== undefined) {
    await updateBudgetProgress(budgetId);
  }

  // Log budget update event
  await logBudgetEvent(
    budgetId,
    'budget_updated',
    actorId,
    'Budget updated',
    { updates }
  );

  return budget as Budget;
}

/**
 * Delete a budget (soft delete)
 */
export async function deleteBudget(budgetId: string, actorId: string): Promise<void> {
  const { error } = await supabase
    .from('budgets')
    .update({
      is_deleted: true,
      is_active: false,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetId);

  if (error) {
    throw new Error(`Failed to delete budget: ${error.message}`);
  }

  // Log budget deletion event
  await logBudgetEvent(
    budgetId,
    'budget_deleted',
    actorId,
    'Budget deleted'
  );
}

/**
 * Update goal progress from budget (for goal-based budgets)
 */
export async function updateGoalProgressFromBudget(budgetId: string): Promise<void> {
  const { data: budget, error } = await supabase
    .from('budgets')
    .select('goal_id, spent_amount, budget_mode')
    .eq('id', budgetId)
    .single();

  if (error || !budget || !budget.goal_id) {
    return; // Not a goal-based budget or goal not found
  }

  // For goal-based budgets with save_target mode, update goal progress
  if (budget.budget_mode === 'save_target') {
    const { data: goal } = await supabase
      .from('goals')
      .select('current_amount, target_amount')
      .eq('id', budget.goal_id)
      .single();

    if (goal) {
      // Update goal's current_amount based on budget's spent_amount (which is actually contributions)
      const newCurrentAmount = Math.min(goal.target_amount, goal.current_amount + (budget.spent_amount - (goal.current_amount || 0)));
      
      await supabase
        .from('goals')
        .update({ current_amount: newCurrentAmount })
        .eq('id', budget.goal_id);
    }
  }
}

/**
 * Update budget progress based on transactions
 */
export async function updateBudgetProgress(budgetId: string): Promise<void> {
  // Get all non-excluded budget transactions
  const { data: budgetTransactions, error: btError } = await supabase
    .from('budget_transactions')
    .select('amount_counted')
    .eq('budget_id', budgetId)
    .eq('is_excluded', false);

  if (btError) {
    console.error('Error fetching budget transactions:', btError);
    return;
  }

  const spentAmount = budgetTransactions?.reduce((sum, bt) => sum + (bt.amount_counted || 0), 0) || 0;

  // Update budget
  const { error: updateError } = await supabase
    .from('budgets')
    .update({
      spent_amount: spentAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetId);

  if (updateError) {
    console.error('Error updating budget progress:', updateError);
    return;
  }

  // Update goal progress if this is a goal-based budget
  await updateGoalProgressFromBudget(budgetId);
}

/**
 * Get budget transactions with exclusion handling
 */
export async function getBudgetTransactions(
  budgetId: string,
  includeExcluded: boolean = false
): Promise<BudgetTransaction[]> {
  let query = supabase
    .from('budget_transactions')
    .select('*')
    .eq('budget_id', budgetId);

  if (!includeExcluded) {
    query = query.eq('is_excluded', false);
  }

  const { data: budgetTransactions, error } = await query.order('applied_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch budget transactions: ${error.message}`);
  }

  return budgetTransactions || [];
}

/**
 * Exclude transaction from budget
 */
export async function excludeTransactionFromBudget(
  budgetTransactionId: string,
  reason: string,
  actorId: string
): Promise<void> {
  const { error } = await supabase
    .from('budget_transactions')
    .update({
      is_excluded: true,
      excluded_at: new Date().toISOString(),
      excluded_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetTransactionId);

  if (error) {
    throw new Error(`Failed to exclude transaction: ${error.message}`);
  }

  // Get budget ID from transaction
  const { data: budgetTransaction } = await supabase
    .from('budget_transactions')
    .select('budget_id')
    .eq('id', budgetTransactionId)
    .single();

  if (budgetTransaction) {
    // Update budget progress
    await updateBudgetProgress(budgetTransaction.budget_id);

    // Log event
    await logBudgetEvent(
      budgetTransaction.budget_id,
      'transaction_excluded',
      actorId,
      `Transaction excluded: ${reason}`
    );
  }
}

/**
 * Include transaction in budget
 */
export async function includeTransactionInBudget(
  budgetTransactionId: string,
  actorId: string
): Promise<void> {
  const { error } = await supabase
    .from('budget_transactions')
    .update({
      is_excluded: false,
      excluded_at: null,
      excluded_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetTransactionId);

  if (error) {
    throw new Error(`Failed to include transaction: ${error.message}`);
  }

  // Get budget ID from transaction
  const { data: budgetTransaction } = await supabase
    .from('budget_transactions')
    .select('budget_id')
    .eq('id', budgetTransactionId)
    .single();

  if (budgetTransaction) {
    // Update budget progress
    await updateBudgetProgress(budgetTransaction.budget_id);

    // Log event
    await logBudgetEvent(
      budgetTransaction.budget_id,
      'transaction_included',
      actorId,
      'Transaction included in budget'
    );
  }
}

/**
 * Get budgets by account
 */
export async function getBudgetsByAccount(accountId: string): Promise<Budget[]> {
  const { data: budgetAccounts, error } = await supabase
    .from('budget_accounts')
    .select('budget_id')
    .eq('account_id', accountId);

  if (error) {
    throw new Error(`Failed to fetch budget accounts: ${error.message}`);
  }

  if (!budgetAccounts || budgetAccounts.length === 0) {
    return [];
  }

  const budgetIds = budgetAccounts.map(ba => ba.budget_id);

  const { data: budgets, error: budgetError } = await supabase
    .from('budgets')
    .select('*')
    .in('id', budgetIds)
    .eq('is_active', true)
    .eq('is_deleted', false);

  if (budgetError) {
    throw new Error(`Failed to fetch budgets: ${budgetError.message}`);
  }

  return budgets || [];
}

/**
 * Get account IDs linked to a budget
 */
export async function getBudgetAccountIds(budgetId: string): Promise<string[]> {
  const { data: budgetAccounts, error } = await supabase
    .from('budget_accounts')
    .select('account_id')
    .eq('budget_id', budgetId);

  if (error) {
    console.error('Error fetching budget accounts:', error);
    return [];
  }

  return budgetAccounts?.map(ba => ba.account_id) || [];
}

/**
 * Check budget alerts
 */
export async function checkBudgetAlerts(budgetId: string): Promise<{ alerts: string[] }> {
  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (error || !budget) {
    return { alerts: [] };
  }

  const alerts: string[] = [];
  const percentage = budget.amount > 0 ? (budget.spent_amount / budget.amount) * 100 : 0;

  // Check threshold alerts
  if (budget.alert_settings?.thresholds) {
    for (const threshold of budget.alert_settings.thresholds) {
      if (percentage >= threshold && percentage < threshold + 10) {
        alerts.push(`Budget ${threshold}% used`);
      }
    }
  }

  // Check if over budget
  if (budget.spent_amount > budget.amount) {
    alerts.push('Budget exceeded');
  }

  return { alerts };
}

/**
 * Calculate daily pace
 */
export async function calculateDailyPace(budgetId: string): Promise<{
  idealDailySpend: number;
  currentDailyAvg: number;
  onTrack: boolean;
}> {
  const { data: budget, error } = await supabase
    .from('budgets')
    .select('start_date, end_date, amount, spent_amount')
    .eq('id', budgetId)
    .single();

  if (error || !budget) {
    return { idealDailySpend: 0, currentDailyAvg: 0, onTrack: true };
  }

  const startDate = new Date(budget.start_date);
  const endDate = new Date(budget.end_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const daysElapsed = Math.max(1, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);

  const idealDailySpend = budget.amount / totalDays;
  const currentDailyAvg = budget.spent_amount / daysElapsed;
  const onTrack = currentDailyAvg <= idealDailySpend;

  return { idealDailySpend, currentDailyAvg, onTrack };
}

/**
 * Snooze alert
 */
export async function snoozeAlert(budgetId: string, hours: number): Promise<void> {
  const { data: budget } = await supabase
    .from('budgets')
    .select('alert_settings')
    .eq('id', budgetId)
    .single();

  if (!budget) {
    return;
  }

  const snoozeUntil = new Date();
  snoozeUntil.setHours(snoozeUntil.getHours() + hours);

  await supabase
    .from('budgets')
    .update({
      alert_settings: {
        ...budget.alert_settings,
        snooze_until: snoozeUntil.toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetId);
}

/**
 * Renew budget for next period
 */
export async function renewBudget(
  budgetId: string,
  actorId: string,
  rolloverAmount: number = 0
): Promise<Budget> {
  const { data: oldBudget, error: fetchError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (fetchError || !oldBudget) {
    throw new Error(`Budget not found: ${fetchError?.message}`);
  }

  if (!oldBudget.recurrence_pattern) {
    throw new Error('Budget is not recurring');
  }

  // Calculate next period dates
  const oldEndDate = new Date(oldBudget.end_date);
  const newStartDate = new Date(oldEndDate);
  newStartDate.setDate(newStartDate.getDate() + 1);

  let newEndDate = new Date(newStartDate);
  switch (oldBudget.recurrence_pattern) {
    case 'monthly':
      newEndDate.setMonth(newEndDate.getMonth() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1);
      break;
    case 'weekly':
      newEndDate.setDate(newEndDate.getDate() + 6);
      break;
    case 'yearly':
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1);
      break;
    case 'custom':
      const periodDuration = Math.ceil(
        (new Date(oldBudget.end_date).getTime() - new Date(oldBudget.start_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      newEndDate.setDate(newEndDate.getDate() + periodDuration);
      break;
  }

  // Calculate new amount (with rollover if enabled)
  const newAmount = oldBudget.amount + rolloverAmount;

  // Get account IDs
  const accountIds = await getBudgetAccountIds(budgetId);

  // Create new budget
  const newBudget = await createBudget({
    user_id: oldBudget.user_id,
    name: oldBudget.name,
    amount: newAmount,
    currency: oldBudget.currency,
    created_by: actorId,
    budget_type: oldBudget.budget_type,
    budget_mode: oldBudget.budget_mode || 'spend_cap',
    start_date: newStartDate.toISOString().split('T')[0],
    end_date: newEndDate.toISOString().split('T')[0],
    recurrence_pattern: oldBudget.recurrence_pattern,
    rollover_enabled: oldBudget.rollover_enabled,
    category_id: oldBudget.category_id,
    goal_id: oldBudget.goal_id,
    metadata: {
      ...oldBudget.metadata,
      renewed_from_budget_id: budgetId,
      rollover_amount: rolloverAmount,
    },
    alert_settings: oldBudget.alert_settings || {},
    account_ids: accountIds,
  });

  // Log event
  await logBudgetEvent(
    newBudget.id,
    'budget_renewed',
    actorId,
    `Budget renewed from ${budgetId}`,
    { previous_budget_id: budgetId, rollover_amount: rolloverAmount }
  );

  return newBudget;
}

/**
 * Close budget period and handle rollover
 * NOTE: This function is deprecated in favor of prepareBudgetForReflection + executeRenewalDecision
 * Kept for backward compatibility
 */
export async function closeBudgetPeriod(
  budgetId: string,
  rollover: boolean,
  actorId: string
): Promise<{ closedBudget: Budget; newBudget?: Budget }> {
  const { data: budget, error: fetchError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (fetchError || !budget) {
    throw new Error(`Budget not found: ${fetchError?.message}`);
  }

  // Prepare for reflection first (generates insights)
  await prepareBudgetForReflection(budgetId, actorId);

  // Mark current budget as inactive
  const { data: closedBudget, error: updateError } = await supabase
    .from('budgets')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to close budget period: ${updateError.message}`);
  }

  await logBudgetEvent(
    budgetId,
    'budget_period_closed',
    actorId,
    `Budget period ended. Rollover: ${rollover}`
  );

  let newBudget: Budget | undefined;
  if (budget.recurrence_pattern) {
    // Automatically renew if recurring
    newBudget = await renewBudget(budgetId, actorId, rollover ? budget.remaining_amount : 0);
  }

  return { closedBudget: closedBudget as Budget, newBudget };
}

/**
 * Reconcile refund
 */
export async function reconcileRefund(
  transactionId: string,
  budgetId: string,
  actorId: string
): Promise<void> {
  const { data: budgetTransaction, error: fetchError } = await supabase
    .from('budget_transactions')
    .select('*')
    .eq('transaction_id', transactionId)
    .eq('budget_id', budgetId)
    .single();

  if (fetchError || !budgetTransaction) {
    throw new Error(`Budget transaction not found: ${fetchError?.message}`);
  }

  // Mark as reconciled
  const { error: updateError } = await supabase
    .from('budget_transactions')
    .update({
      reconciled: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', budgetTransaction.id);

  if (updateError) {
    throw new Error(`Failed to reconcile refund: ${updateError.message}`);
  }

  // Update budget progress
  await updateBudgetProgress(budgetId);

  // Log event
  await logBudgetEvent(
    budgetId,
    'refund_reconciled',
    actorId,
    `Refund reconciled for transaction ${transactionId}`
  );
}

/**
 * Log budget event
 */
export async function logBudgetEvent(
  budgetId: string,
  eventType: string,
  actorId: string,
  reason?: string,
  metadata?: any
): Promise<void> {
  const { error } = await supabase
    .from('budget_events')
    .insert({
      budget_id: budgetId,
      event_type: eventType,
      actor_id: actorId,
      reason,
      metadata: metadata || {}
    });

  if (error) {
    console.error('Failed to log budget event:', error);
  }
}

/**
 * Get category breakdown for a budget period
 */
export async function getCategoryBreakdown(budgetId: string): Promise<{
  category_id: string;
  category_name: string;
  amount: number;
  percentage: number;
}[]> {
  // Get budget transactions
  const budgetTransactions = await getBudgetTransactions(budgetId, false);
  
  // Get transaction IDs
  const transactionIds = budgetTransactions.map(bt => bt.transaction_id);
  
  if (transactionIds.length === 0) {
    return [];
  }
  
  // Get transactions with categories
  const { data: transactions, error } = await supabase
    .from('transactions')
    .select(`
      id,
      category_id,
      amount
    `)
    .in('id', transactionIds)
    .eq('type', 'expense');
  
  if (error) {
    console.error('Error fetching transactions for category breakdown:', error);
    return [];
  }
  
  if (!transactions || transactions.length === 0) {
    return [];
  }
  
  // Get unique category IDs
  const categoryIds = [...new Set(transactions.map(t => t.category_id).filter(Boolean))];
  
  // Get category details - using categoryInfoMap to store category metadata
  const categoryInfoMap = new Map<string, { name: string; color: string; icon: string }>();
  if (categoryIds.length > 0) {
    const { data: categories } = await supabase
      .from('categories')
      .select('id, name, color, icon')
      .in('id', categoryIds);
    
    if (categories) {
      categories.forEach(cat => {
        categoryInfoMap.set(cat.id, { name: cat.name, color: cat.color, icon: cat.icon });
      });
    }
  }
  
  // Group transactions by category - using breakdownMap to accumulate amounts
  const breakdownMap = new Map<string, { category_id: string; category_name: string; amount: number }>();
  
  transactions.forEach((transaction: any) => {
    const categoryId = transaction.category_id || 'uncategorized';
    const categoryInfo = categoryInfoMap.get(categoryId);
    const categoryName = categoryInfo?.name || 'Uncategorized';
    const amount = Math.abs(transaction.amount); // Expenses are negative
    
    if (breakdownMap.has(categoryId)) {
      const existing = breakdownMap.get(categoryId)!;
      existing.amount += amount;
    } else {
      breakdownMap.set(categoryId, {
        category_id: categoryId,
        category_name: categoryName,
        amount: amount
      });
    }
  });
  
  // Calculate total and percentages
  const total = Array.from(breakdownMap.values()).reduce((sum, cat) => sum + cat.amount, 0);
  
  const breakdown = Array.from(breakdownMap.values())
    .map(cat => ({
      ...cat,
      percentage: total > 0 ? (cat.amount / total) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount); // Sort by amount descending
  
  return breakdown;
}

/**
 * Get previous period budget for comparison
 */
export async function getPreviousPeriodBudget(budgetId: string): Promise<Budget | null> {
  // Get current budget
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();
  
  if (budgetError || !budget) {
    return null;
  }
  
  // Find previous budget of same type and recurrence
  const { data: previousBudgets, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', budget.user_id)
    .eq('budget_type', budget.budget_type)
    .eq('is_deleted', false)
    .lt('end_date', budget.start_date)
    .order('end_date', { ascending: false })
    .limit(1);
  
  if (error || !previousBudgets || previousBudgets.length === 0) {
    return null;
  }
  
  // If recurring, match recurrence pattern
  if (budget.recurrence_pattern) {
    const matching = previousBudgets.find(p => p.recurrence_pattern === budget.recurrence_pattern);
    return matching as Budget || null;
  }
  
  return previousBudgets[0] as Budget;
}

/**
 * Calculate budget streak (consecutive periods tracked)
 */
export async function calculateBudgetStreak(budgetId: string): Promise<number> {
  // Get current budget
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();
  
  if (budgetError || !budget) {
    return 0;
  }
  
  // Find all previous budgets of same type, ordered by end_date descending
  const { data: previousBudgets, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('user_id', budget.user_id)
    .eq('budget_type', budget.budget_type)
    .eq('is_deleted', false)
    .lt('end_date', budget.start_date)
    .order('end_date', { ascending: false });
  
  if (error || !previousBudgets) {
    return 1; // Current budget is the first one
  }
  
  // Count consecutive completed periods
  let streak = 1; // Start with current budget
  let currentEndDate = budget.start_date;
  
  for (const prevBudget of previousBudgets) {
    // Check if this budget's end_date connects to the previous start_date
    const prevEndDate = new Date(prevBudget.end_date);
    const currentStartDate = new Date(currentEndDate);
    
    // Allow 1 day gap (in case of manual closures)
    const daysDiff = Math.abs((currentStartDate.getTime() - prevEndDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 1) {
      streak++;
      currentEndDate = prevBudget.start_date;
    } else {
      break; // Gap found, streak broken
    }
  }
  
  return streak;
}

/**
 * Generate comprehensive budget insights for a completed period
 */
export async function generateBudgetInsights(budgetId: string): Promise<BudgetPeriodSummary> {
  // Get budget
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();
  
  if (budgetError || !budget) {
    throw new Error(`Budget not found: ${budgetError?.message}`);
  }
  
  // Update budget progress to get latest spent_amount
  await updateBudgetProgress(budgetId);
  
  // Refresh budget data
  const { data: updatedBudget } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();
  
  if (!updatedBudget) {
    throw new Error('Failed to fetch updated budget');
  }
  
  const finalBudget = updatedBudget as Budget;
  
  // Calculate period duration
  const startDate = new Date(finalBudget.start_date);
  const endDate = new Date(finalBudget.end_date);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  
  // Calculate percentage used
  const percentageUsed = finalBudget.amount > 0 
    ? (finalBudget.spent_amount / finalBudget.amount) * 100 
    : 0;
  
  // Get category breakdown
  const categoryBreakdown = await getCategoryBreakdown(budgetId);
  
  // Get previous period for comparison
  const previousBudget = await getPreviousPeriodBudget(budgetId);
  
  // Calculate daily pace
  const dailyPaceData = await calculateDailyPace(budgetId);
  
  // Calculate achievements
  const streakCount = await calculateBudgetStreak(budgetId);
  const savingsAchieved = Math.max(0, finalBudget.remaining_amount);
  
  // Calculate consistency score (percentage of days with transactions)
  const budgetTransactions = await getBudgetTransactions(budgetId, false);
  const transactionIds = budgetTransactions.map(bt => bt.transaction_id);
  
  let uniqueDays = 0;
  if (transactionIds.length > 0) {
    // Get transaction dates
    const { data: transactions } = await supabase
      .from('transactions')
      .select('date')
      .in('id', transactionIds);
    
    if (transactions && transactions.length > 0) {
      uniqueDays = new Set(
        transactions.map(t => {
          // Handle both date formats (ISO string or date object)
          const dateStr = typeof t.date === 'string' ? t.date : t.date?.toISOString?.() || '';
          return dateStr.split('T')[0];
        }).filter(Boolean)
      ).size;
    }
  }
  
  // Consistency score: percentage of days with at least one transaction
  // Cap at 100% and ensure it's a valid number
  const consistencyScore = totalDays > 0 
    ? Math.min(100, Math.max(0, (uniqueDays / totalDays) * 100)) 
    : 0;
  
  // Build previous period comparison if exists
  let previousPeriodComparison;
  if (previousBudget) {
    const totalChangePercentage = previousBudget.spent_amount > 0
      ? ((finalBudget.spent_amount - previousBudget.spent_amount) / previousBudget.spent_amount) * 100
      : 0;
    
    // Get previous period category breakdown
    const previousCategoryBreakdown = await getCategoryBreakdown(previousBudget.id);
    const previousCategoryMap = new Map(
      previousCategoryBreakdown.map(cat => [cat.category_id, cat.amount])
    );
    
    // Calculate category changes
    const categoryChanges = categoryBreakdown.map(cat => {
      const previousAmount = previousCategoryMap.get(cat.category_id) || 0;
      const changePercentage = previousAmount > 0
        ? ((cat.amount - previousAmount) / previousAmount) * 100
        : 0;
      
      return {
        category_id: cat.category_id,
        category_name: cat.category_name,
        change_percentage: changePercentage
      };
    });
    
    previousPeriodComparison = {
      previous_budget_id: previousBudget.id,
      total_change_percentage: totalChangePercentage,
      category_changes: categoryChanges
    };
  }
  
  // Calculate improvement percentage if previous period exists
  let improvementPercentage;
  if (previousBudget) {
    // Improvement = reduction in spending or increase in savings
    if (finalBudget.spent_amount < previousBudget.spent_amount) {
      improvementPercentage = previousBudget.spent_amount > 0
        ? ((previousBudget.spent_amount - finalBudget.spent_amount) / previousBudget.spent_amount) * 100
        : 0;
    }
  }
  
  const summary: BudgetPeriodSummary = {
    budget_id: budgetId,
    period_start: finalBudget.start_date,
    period_end: finalBudget.end_date,
    total_amount: finalBudget.amount,
    spent_amount: finalBudget.spent_amount,
    remaining_amount: finalBudget.remaining_amount,
    percentage_used: percentageUsed,
    category_breakdown: categoryBreakdown,
    previous_period_comparison: previousPeriodComparison,
    daily_pace: {
      average_daily_spend: dailyPaceData.currentDailyAvg || 0,
      ideal_daily_pace: dailyPaceData.idealDailySpend || 0,
      days_ahead_behind: dailyPaceData.onTrack 
        ? 0 
        : dailyPaceData.idealDailySpend > 0 && finalBudget.spent_amount > 0
        ? Math.round(
            ((dailyPaceData.currentDailyAvg - dailyPaceData.idealDailySpend) / dailyPaceData.idealDailySpend) * totalDays
          )
        : 0,
      on_track: dailyPaceData.onTrack || false
    },
    achievements: {
      streak_count: streakCount,
      improvement_percentage: improvementPercentage,
      savings_achieved: savingsAchieved,
      consistency_score: consistencyScore
    },
    generated_at: new Date().toISOString()
  };
  
  return summary;
}

/**
 * Continue budget period - extend end date and optionally reset spent amount
 */
export async function continueBudgetPeriod(
  budgetId: string,
  newEndDate: string,
  resetSpent: boolean,
  actorId: string
): Promise<Budget> {
  const updateData: any = {
    end_date: newEndDate,
    is_active: true, // Reactivate if it was marked for reflection
    updated_at: new Date().toISOString()
  };
  
  if (resetSpent) {
    updateData.spent_amount = 0;
  }
  
  // Clear reflection_ready flag
  const { data: budget } = await supabase
    .from('budgets')
    .select('metadata')
    .eq('id', budgetId)
    .single();
  
  if (budget && budget.metadata) {
    updateData.metadata = {
      ...budget.metadata,
      reflection_ready: false
    };
  }
  
  const { data: updatedBudget, error } = await supabase
    .from('budgets')
    .update(updateData)
    .eq('id', budgetId)
    .select()
    .single();
  
  if (error) {
    throw new Error(`Failed to continue budget period: ${error.message}`);
  }
  
  // Log event
  await logBudgetEvent(
    budgetId,
    'budget_period_continued',
    actorId,
    `Budget period extended to ${newEndDate}. Reset spent: ${resetSpent}`
  );
  
  return updatedBudget as Budget;
}

/**
 * Repeat budget period - create new budget from template
 */
export async function repeatBudgetPeriod(
  budgetId: string,
  modifications: Partial<Budget>,
  actorId: string
): Promise<Budget> {
  // Get old budget
  const { data: oldBudget, error: fetchError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();
  
  if (fetchError || !oldBudget) {
    throw new Error(`Budget not found: ${fetchError?.message}`);
  }
  
  // Calculate new dates
  const oldEndDate = new Date(oldBudget.end_date);
  const newStartDate = modifications.start_date 
    ? new Date(modifications.start_date)
    : new Date(oldEndDate.getTime() + 24 * 60 * 60 * 1000); // Next day
  
  const periodDuration = Math.ceil(
    (new Date(oldBudget.end_date).getTime() - new Date(oldBudget.start_date).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const newEndDate = modifications.end_date
    ? new Date(modifications.end_date)
    : new Date(newStartDate.getTime() + periodDuration * 24 * 60 * 60 * 1000);
  
  // Calculate new amount (with rollover if enabled)
  let newAmount = modifications.amount !== undefined 
    ? modifications.amount 
    : oldBudget.amount;
  
  if (modifications.rollover_enabled && oldBudget.remaining_amount > 0) {
    newAmount = newAmount + oldBudget.remaining_amount;
  }
  
  // Get account IDs
  const accountIds = modifications.account_ids || await getBudgetAccountIds(budgetId);
  
  // Create new budget
  const newBudgetData = {
    user_id: oldBudget.user_id,
    name: modifications.name || oldBudget.name,
    amount: newAmount,
    currency: oldBudget.currency,
    created_by: actorId,
    budget_type: oldBudget.budget_type,
    budget_mode: modifications.budget_mode || oldBudget.budget_mode || 'spend_cap',
    start_date: newStartDate.toISOString().split('T')[0],
    end_date: newEndDate.toISOString().split('T')[0],
    recurrence_pattern: modifications.recurrence_pattern || oldBudget.recurrence_pattern || null,
    rollover_enabled: modifications.rollover_enabled !== undefined 
      ? modifications.rollover_enabled 
      : oldBudget.rollover_enabled,
    category_id: modifications.category_id !== undefined 
      ? modifications.category_id 
      : oldBudget.category_id,
    goal_id: modifications.goal_id !== undefined 
      ? modifications.goal_id 
      : oldBudget.goal_id,
    is_active: true,
    is_deleted: false,
    spent_amount: 0,
    remaining_amount: newAmount,
    metadata: {
      ...oldBudget.metadata,
      renewed_from_budget_id: budgetId,
      rollover_amount: modifications.rollover_enabled ? oldBudget.remaining_amount : 0,
      reflection_ready: false
    },
    alert_settings: modifications.alert_settings || oldBudget.alert_settings || {},
    account_ids: accountIds
  };
  
  const newBudget = await createBudget(newBudgetData as any);
  
  // Mark old budget as inactive (if not already)
  await supabase
    .from('budgets')
    .update({
      is_active: false,
      metadata: {
        ...oldBudget.metadata,
        reflection_ready: false
      }
    })
    .eq('id', budgetId);
  
  // Log event
  await logBudgetEvent(
    newBudget.id,
    'budget_period_repeated',
    actorId,
    `Budget repeated from ${budgetId}`,
    { previous_budget_id: budgetId, rollover_amount: oldBudget.remaining_amount }
  );
  
  return newBudget;
}

/**
 * Extend budget to recurring - convert single budget to recurring pattern
 */
export async function extendBudgetToRecurring(
  budgetId: string,
  recurrencePattern: 'monthly' | 'weekly' | 'yearly' | 'custom',
  rolloverEnabled: boolean,
  actorId: string
): Promise<{ updatedBudget: Budget; newBudget: Budget }> {
  // Get old budget
  const { data: oldBudget, error: fetchError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();
  
  if (fetchError || !oldBudget) {
    throw new Error(`Budget not found: ${fetchError?.message}`);
  }
  
  // Update old budget to be recurring
  const { data: updatedBudget, error: updateError } = await supabase
    .from('budgets')
    .update({
      recurrence_pattern: recurrencePattern,
      rollover_enabled: rolloverEnabled,
      is_active: false, // Mark current period as complete
      metadata: {
        ...oldBudget.metadata,
        reflection_ready: false
      },
      updated_at: new Date().toISOString()
    })
    .eq('id', budgetId)
    .select()
    .single();
  
  if (updateError) {
    throw new Error(`Failed to update budget: ${updateError.message}`);
  }
  
  // Calculate next period dates
  const oldEndDate = new Date(oldBudget.end_date);
  const newStartDate = new Date(oldEndDate.getTime() + 24 * 60 * 60 * 1000); // Next day
  
  let newEndDate = new Date(newStartDate);
  switch (recurrencePattern) {
    case 'monthly':
      newEndDate.setMonth(newEndDate.getMonth() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1); // End of month
      break;
    case 'weekly':
      newEndDate.setDate(newEndDate.getDate() + 6); // 7 days from start
      break;
    case 'yearly':
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1); // End of year
      break;
    case 'custom':
      // For custom, use same duration as previous period
      const periodDuration = Math.ceil(
        (new Date(oldBudget.end_date).getTime() - new Date(oldBudget.start_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      newEndDate.setDate(newEndDate.getDate() + periodDuration);
      break;
  }
  
  // Calculate new amount (with rollover if enabled)
  let newAmount = oldBudget.amount;
  if (rolloverEnabled && oldBudget.remaining_amount > 0) {
    newAmount = newAmount + oldBudget.remaining_amount;
  }
  
  // Get account IDs
  const accountIds = await getBudgetAccountIds(budgetId);
  
  // Create new budget instance
  const newBudgetData = {
    user_id: oldBudget.user_id,
    name: oldBudget.name,
    amount: newAmount,
    currency: oldBudget.currency,
    created_by: actorId,
    budget_type: oldBudget.budget_type,
    budget_mode: oldBudget.budget_mode || 'spend_cap',
    start_date: newStartDate.toISOString().split('T')[0],
    end_date: newEndDate.toISOString().split('T')[0],
    recurrence_pattern: recurrencePattern,
    rollover_enabled: rolloverEnabled,
    category_id: oldBudget.category_id,
    goal_id: oldBudget.goal_id,
    is_active: true,
    is_deleted: false,
    spent_amount: 0,
    remaining_amount: newAmount,
    metadata: {
      ...oldBudget.metadata,
      renewed_from_budget_id: budgetId,
      rollover_amount: rolloverEnabled ? oldBudget.remaining_amount : 0,
      reflection_ready: false
    },
    alert_settings: oldBudget.alert_settings || {},
    account_ids: accountIds
  };
  
  const newBudget = await createBudget(newBudgetData as any);
  
  // Log events
  await logBudgetEvent(
    budgetId,
    'budget_extended_to_recurring',
    actorId,
    `Budget converted to recurring ${recurrencePattern}`,
    { recurrence_pattern: recurrencePattern, rollover_enabled: rolloverEnabled }
  );
  
  await logBudgetEvent(
    newBudget.id,
    'budget_period_created_from_recurring',
    actorId,
    `New period created from recurring budget`,
    { previous_budget_id: budgetId, rollover_amount: oldBudget.remaining_amount }
  );
  
  return {
    updatedBudget: updatedBudget as Budget,
    newBudget
  };
}

/**
 * Prepare budget for reflection - generate insights and mark as reflection_ready
 */
export async function prepareBudgetForReflection(
  budgetId: string,
  actorId: string
): Promise<BudgetPeriodSummary> {
  // Generate insights
  const insights = await generateBudgetInsights(budgetId);
  
  // Mark budget as reflection_ready (don't mark as inactive yet)
  const { data: budget } = await supabase
    .from('budgets')
    .select('metadata')
    .eq('id', budgetId)
    .single();
  
  if (budget) {
    await supabase
      .from('budgets')
      .update({
        metadata: {
          ...budget.metadata,
          reflection_ready: true,
          period_summary: insights
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', budgetId);
  }
  
  // Log event
  await logBudgetEvent(
    budgetId,
    'budget_period_ended',
    actorId,
    'Budget period ended - ready for reflection',
    { insights }
  );
  
  return insights;
}

/**
 * Execute renewal decision - handles all three renewal paths
 */
export async function executeRenewalDecision(
  decision: RenewalDecision,
  actorId: string
): Promise<{ closedBudget: Budget; newBudget?: Budget }> {
  const { renewal_type, budget_id } = decision;
  
  switch (renewal_type) {
    case 'continue':
      if (!decision.new_end_date) {
        throw new Error('new_end_date is required for continue renewal');
      }
      const continuedBudget = await continueBudgetPeriod(
        budget_id,
        decision.new_end_date,
        decision.reset_spent || false,
        actorId
      );
      return { closedBudget: continuedBudget };
    
    case 'repeat':
      const modifications: Partial<Budget> = {
        start_date: decision.new_start_date,
        end_date: decision.new_end_date,
        amount: decision.new_amount,
        rollover_enabled: decision.rollover_enabled,
        account_ids: decision.account_ids,
        recurrence_pattern: decision.recurrence_pattern || undefined,
        alert_settings: undefined // Will use old budget's settings
      };
      const repeatedBudget = await repeatBudgetPeriod(budget_id, modifications, actorId);
      // Get the old budget (now inactive)
      const { data: oldBudget } = await supabase
        .from('budgets')
        .select('*')
        .eq('id', budget_id)
        .single();
      return { 
        closedBudget: oldBudget as Budget,
        newBudget: repeatedBudget
      };
    
    case 'extend':
      if (!decision.recurrence_pattern) {
        throw new Error('recurrence_pattern is required for extend renewal');
      }
      const { updatedBudget, newBudget } = await extendBudgetToRecurring(
        budget_id,
        decision.recurrence_pattern,
        decision.rollover_enabled || false,
        actorId
      );
      return {
        closedBudget: updatedBudget,
        newBudget
      };
    
    default:
      throw new Error(`Unknown renewal type: ${renewal_type}`);
  }
}