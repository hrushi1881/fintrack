import { supabase } from '@/lib/supabase';
import { Budget, BudgetAccount, BudgetTransaction, BudgetEvent, Transaction, Account, Goal } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';

/**
 * Create a new budget with account associations
 */
export async function createBudget(
  data: {
    user_id: string;
    name: string;
    amount: number;
    currency: string;
    budget_type: 'monthly' | 'category' | 'goal_based' | 'smart';
    start_date: string;
    end_date: string;
    recurrence_pattern?: 'monthly' | 'weekly' | 'yearly' | 'custom';
    rollover_enabled?: boolean;
    category_id?: string;
    goal_id?: string;
    metadata?: any;
    alert_settings?: any;
    account_ids: string[];
  },
  idempotencyKey?: string
): Promise<Budget> {
  // Check for idempotency if key provided
  if (idempotencyKey) {
    const { data: existing } = await supabase
      .from('budgets')
      .select('*')
      .eq('metadata->>idempotency_key', idempotencyKey)
      .single();
    
    if (existing) {
      return existing as Budget;
    }
  }

  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .insert({
      user_id: data.user_id,
      name: data.name,
      amount: data.amount,
      currency: data.currency,
      created_by: data.user_id,
      budget_type: data.budget_type,
      period: data.recurrence_pattern || 'monthly', // Add required period field
      start_date: data.start_date,
      end_date: data.end_date,
      recurrence_pattern: data.recurrence_pattern,
      rollover_enabled: data.rollover_enabled || false,
      category_id: data.category_id,
      goal_id: data.goal_id,
      is_active: true,
      is_deleted: false,
      spent_amount: 0,
      remaining_amount: data.amount,
      metadata: { ...data.metadata, idempotency_key: idempotencyKey },
      alert_settings: data.alert_settings || {}
    })
    .select()
    .single();

  if (budgetError) {
    throw new Error(`Failed to create budget: ${budgetError.message}`);
  }

  // Link accounts to budget
  if (data.account_ids.length > 0) {
    const budgetAccounts = data.account_ids.map(accountId => ({
      budget_id: budget.id,
      account_id: accountId,
      account_role: 'owner',
      last_synced_at: new Date().toISOString()
    }));

    const { error: accountsError } = await supabase
      .from('budget_accounts')
      .insert(budgetAccounts);

    if (accountsError) {
      console.error('Failed to link accounts to budget:', accountsError);
    }
  }

  // Log budget creation event
  await logBudgetEvent(budget.id, 'budget_created', data.user_id, 'Budget created');

  return budget as Budget;
}

/**
 * Update goal progress based on budget spending for goal-based budgets
 */
async function updateGoalProgressFromBudget(budgetId: string) {
  try {
    // Get the budget with goal_id
    const { data: budget, error: budgetError } = await supabase
      .from('budgets')
      .select('goal_id, budget_type, spent_amount')
      .eq('id', budgetId)
      .single();

    if (budgetError || !budget || budget.budget_type !== 'goal_based' || !budget.goal_id) {
      return;
    }

    // For goal-based budgets, we need to sync the goal progress with budget progress
    // The goal should reflect how much has been saved through this budget
    const { data: goal, error: goalError } = await supabase
      .from('goals')
      .select('*')
      .eq('id', budget.goal_id)
      .single();

    if (goalError || !goal) {
      return;
    }

    // Update goal current_amount based on budget progress
    // This is a simplified approach - in production, you might want more sophisticated logic
    const { error: updateError } = await supabase
      .from('goals')
      .update({
        current_amount: Math.min(goal.current_amount, goal.target_amount),
        updated_at: new Date().toISOString()
      })
      .eq('id', goal.id);

    if (updateError) {
      console.error('Error updating goal progress:', updateError);
    }
  } catch (error) {
    console.error('Error in updateGoalProgressFromBudget:', error);
  }
}

/**
 * Update budget progress by recalculating spent and remaining amounts
 */
export async function updateBudgetProgress(budgetId: string): Promise<Budget> {
  const { data: budget, error: budgetError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (budgetError) {
    throw new Error(`Failed to fetch budget: ${budgetError.message}`);
  }

  // Get all non-excluded transactions for this budget
  const { data: budgetTransactions, error: transactionsError } = await supabase
    .from('budget_transactions')
    .select('transaction_id, amount_counted')
    .eq('budget_id', budgetId)
    .eq('is_excluded', false);

  if (transactionsError) {
    throw new Error(`Failed to fetch budget transactions: ${transactionsError.message}`);
  }

  // Calculate total spent amount
  const spentAmount = budgetTransactions?.reduce((sum, bt) => sum + bt.amount_counted, 0) || 0;
  const remainingAmount = Math.max(0, budget.amount - spentAmount);

  // Update budget with new amounts
  const { data: updatedBudget, error: updateError } = await supabase
    .from('budgets')
    .update({
      spent_amount: spentAmount,
      remaining_amount: remainingAmount,
      updated_at: new Date().toISOString()
    })
    .eq('id', budgetId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Failed to update budget progress: ${updateError.message}`);
  }

  // If this is a goal-based budget, update the goal progress
  if (updatedBudget.budget_type === 'goal_based' && updatedBudget.goal_id) {
    await updateGoalProgressFromBudget(budgetId);
  }

  return updatedBudget as Budget;
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
  budgetId: string,
  transactionId: string,
  reason?: string,
  actorId?: string
): Promise<void> {
  const { error } = await supabase
    .from('budget_transactions')
    .update({
      is_excluded: true,
      excluded_at: new Date().toISOString(),
      excluded_reason: reason,
      updated_at: new Date().toISOString()
    })
    .eq('budget_id', budgetId)
    .eq('transaction_id', transactionId);

  if (error) {
    throw new Error(`Failed to exclude transaction: ${error.message}`);
  }

  // Log exclusion event
  if (actorId) {
    await logBudgetEvent(budgetId, 'transaction_excluded', actorId, reason || 'Transaction excluded');
  }

  // Recalculate budget progress
  await updateBudgetProgress(budgetId);
}

/**
 * Include transaction in budget (undo exclusion)
 */
export async function includeTransactionInBudget(
  budgetId: string,
  transactionId: string,
  actorId?: string
): Promise<void> {
  const { error } = await supabase
    .from('budget_transactions')
    .update({
      is_excluded: false,
      excluded_at: null,
      excluded_reason: null,
      updated_at: new Date().toISOString()
    })
    .eq('budget_id', budgetId)
    .eq('transaction_id', transactionId);

  if (error) {
    throw new Error(`Failed to include transaction: ${error.message}`);
  }

  // Log inclusion event
  if (actorId) {
    await logBudgetEvent(budgetId, 'transaction_included', actorId, 'Transaction included');
  }

  // Recalculate budget progress
  await updateBudgetProgress(budgetId);
}

/**
 * Get budgets by account
 */
export async function getBudgetsByAccount(accountId: string): Promise<Budget[]> {
  const { data: budgetAccounts, error } = await supabase
    .from('budget_accounts')
    .select(`
      budgets (*)
    `)
    .eq('account_id', accountId)
    .eq('budgets.is_active', true)
    .eq('budgets.is_deleted', false);

  if (error) {
    throw new Error(`Failed to fetch budgets for account: ${error.message}`);
  }

  return budgetAccounts?.map(ba => ba.budgets).filter(Boolean) || [];
}

/**
 * Snooze budget alert
 */
export async function snoozeAlert(
  budgetId: string,
  durationHours: number,
  actorId: string
): Promise<void> {
  const snoozeUntil = new Date();
  snoozeUntil.setHours(snoozeUntil.getHours() + durationHours);

  const { error } = await supabase
    .from('budgets')
    .update({
      alert_settings: {
        snooze_until: snoozeUntil.toISOString()
      }
    })
    .eq('id', budgetId);

  if (error) {
    throw new Error(`Failed to snooze alert: ${error.message}`);
  }
}

/**
 * Check budget alerts and trigger notifications
 */
export async function checkBudgetAlerts(budgetId: string): Promise<{ alerts: string[]; triggered: boolean }> {
  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (error || !budget) {
    return { alerts: [], triggered: false };
  }

  const percentage = budget.amount > 0 ? (budget.spent_amount / budget.amount) * 100 : 0;
  const alerts: string[] = [];
  const alertSettings = budget.alert_settings || {};
  const thresholds = alertSettings.thresholds || [50, 80, 100];
  
  // Check if alerts are snoozed
  const snoozeUntil = alertSettings.snooze_until;
  if (snoozeUntil && new Date(snoozeUntil) > new Date()) {
    return { alerts: [], triggered: false };
  }

  // Check threshold alerts
  for (const threshold of thresholds) {
    if (percentage >= threshold) {
      if (threshold === 100) {
        alerts.push(`Budget limit reached: ${budget.name}`);
      } else if (percentage > 100) {
        const overAmount = budget.spent_amount - budget.amount;
        alerts.push(`Budget exceeded by ${formatCurrencyAmount(overAmount, budget.currency)}: ${budget.name}`);
      } else {
        alerts.push(`${threshold}% threshold reached: ${budget.name}`);
      }
    }
  }

  // Check daily pace alerts if enabled
  if (alertSettings.daily_pace_enabled) {
    const pace = await calculateDailyPace(budgetId);
    if (pace.currentDailyAvg > pace.idealDailySpend * 1.2) {
      alerts.push(`Spending too fast: ${budget.name}`);
    }
  }

  return { alerts, triggered: alerts.length > 0 };
}

/**
 * Calculate daily spending pace for a budget
 */
export async function calculateDailyPace(budgetId: string): Promise<{ idealDailySpend: number; currentDailyAvg: number; onTrack: boolean }> {
  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (error || !budget) {
    return { idealDailySpend: 0, currentDailyAvg: 0, onTrack: true };
  }

  const startDate = new Date(budget.start_date);
  const endDate = new Date(budget.end_date);
  const now = new Date();

  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  const idealDailySpend = daysRemaining > 0 ? budget.remaining_amount / daysRemaining : 0;
  const currentDailyAvg = daysElapsed > 0 ? budget.spent_amount / daysElapsed : 0;
  const onTrack = currentDailyAvg <= idealDailySpend * 1.2; // 20% tolerance

  return { idealDailySpend, currentDailyAvg, onTrack };
}


/**
 * Close budget period and handle rollover
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
 * Renew a recurring budget for the next period
 */
export async function renewBudget(
  oldBudgetId: string,
  actorId: string,
  rolloverAmount: number = 0
): Promise<Budget> {
  const { data: oldBudget, error: fetchError } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', oldBudgetId)
    .single();

  if (fetchError || !oldBudget) {
    throw new Error(`Old budget not found: ${fetchError?.message}`);
  }

  if (!oldBudget.recurrence_pattern) {
    throw new Error('Cannot renew a non-recurring budget.');
  }

  const newStartDate = new Date(oldBudget.end_date);
  newStartDate.setDate(newStartDate.getDate() + 1); // Start day after old budget ends

  let newEndDate = new Date(newStartDate);
  switch (oldBudget.recurrence_pattern) {
    case 'monthly':
      newEndDate.setMonth(newEndDate.getMonth() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1); // End of next month
      break;
    case 'weekly':
      newEndDate.setDate(newEndDate.getDate() + 6); // 7 days from start
      break;
    case 'yearly':
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1); // End of next year
      break;
    case 'custom':
      // For custom, assume user will define new end date or it's a one-off
      // For now, we'll just extend by a month if custom
      newEndDate.setMonth(newEndDate.getMonth() + 1);
      newEndDate.setDate(newEndDate.getDate() - 1);
      break;
  }

  const newBudgetAmount = oldBudget.amount + rolloverAmount;

  const newBudgetData = {
    user_id: oldBudget.user_id,
    name: oldBudget.name,
    amount: newBudgetAmount,
    currency: oldBudget.currency,
    created_by: actorId,
    budget_type: oldBudget.budget_type,
    start_date: newStartDate.toISOString().split('T')[0],
    end_date: newEndDate.toISOString().split('T')[0],
    recurrence_pattern: oldBudget.recurrence_pattern,
    rollover_enabled: oldBudget.rollover_enabled,
    category_id: oldBudget.category_id,
    goal_id: oldBudget.goal_id,
    is_active: true,
    is_deleted: false,
    spent_amount: 0,
    remaining_amount: newBudgetAmount,
    metadata: {
      ...oldBudget.metadata,
      renewed_from_budget_id: oldBudgetId,
      rollover_amount: rolloverAmount,
    },
    alert_settings: oldBudget.alert_settings,
  };

  const { data: newBudget, error: createError } = await supabase
    .from('budgets')
    .insert(newBudgetData)
    .select()
    .single();

  if (createError) {
    throw new Error(`Failed to create new budget period: ${createError.message}`);
  }

  // Copy budget_accounts from old budget
  const { data: oldBudgetAccounts, error: fetchAccountsError } = await supabase
    .from('budget_accounts')
    .select('*')
    .eq('budget_id', oldBudgetId);

  if (fetchAccountsError) {
    console.warn('Could not copy budget accounts for renewal:', fetchAccountsError.message);
  } else if (oldBudgetAccounts) {
    const newBudgetAccounts = oldBudgetAccounts.map((ba) => ({
      budget_id: newBudget.id,
      account_id: ba.account_id,
      account_role: ba.account_role,
      last_synced_at: new Date().toISOString(),
    }));
    const { error: insertAccountsError } = await supabase.from('budget_accounts').insert(newBudgetAccounts);
    if (insertAccountsError) {
      console.error('Error inserting new budget accounts:', insertAccountsError);
    }
  }

  await logBudgetEvent(
    newBudget.id,
    'budget_renewed',
    actorId,
    `Budget renewed from ${oldBudgetId}`,
    { old_budget_id: oldBudgetId, rollover_amount: rolloverAmount }
  );

  return newBudget as Budget;
}

/**
 * Reconcile refunded transactions across budgets
 */
export async function reconcileRefund(transactionId: string, actorId: string): Promise<void> {
  // Find all budget_transactions linked to this transaction
  const { data: budgetTransactions, error: fetchBtError } = await supabase
    .from('budget_transactions')
    .select('budget_id, is_excluded')
    .eq('transaction_id', transactionId);

  if (fetchBtError) {
    console.error('Error fetching budget transactions for refund:', fetchBtError);
    return;
  }

  for (const bt of budgetTransactions || []) {
    if (!bt.is_excluded) {
      // Mark as reconciled and update budget progress
      await supabase
        .from('budget_transactions')
        .update({ reconciled: true, updated_at: new Date().toISOString() })
        .eq('budget_id', bt.budget_id)
        .eq('transaction_id', transactionId);

      await updateBudgetProgress(bt.budget_id);
      await logBudgetEvent(
        bt.budget_id,
        'transaction_reconciled',
        actorId,
        `Transaction ${transactionId} reconciled (refund)`,
        { transaction_id: transactionId, type: 'refund' }
      );
    }
  }
}

/**
 * Log budget event for audit trail
 */
async function logBudgetEvent(
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