import { supabase } from '@/lib/supabase';
import { Liability } from '@/types';

/**
 * Settlement status for a liability
 */
export interface LiabilitySettlementStatus {
  isBalanced: boolean;
  remainingOwed: number;
  liabilityFundsInAccounts: number;
  totalLoan: number;
  overfundedBy: number;
  needsSettlement: boolean;
  accountsWithFunds: Array<{
    accountId: string;
    accountName: string;
    amount: number;
  }>;
}

/**
 * Check if a liability is balanced and ready for deletion
 */
export async function checkLiabilitySettlementStatus(
  liabilityId: string,
  userId: string
): Promise<LiabilitySettlementStatus> {
  // Get liability details
  const { data: liability, error: liabilityError } = await supabase
    .from('liabilities')
    .select('current_balance, original_amount, disbursed_amount, currency')
    .eq('id', liabilityId)
    .eq('user_id', userId)
    .single();

  if (liabilityError || !liability) {
    throw new Error(`Liability not found: ${liabilityError?.message}`);
  }

  const remainingOwed = parseFloat(liability.current_balance?.toString() || '0');
  const totalLoan = parseFloat(liability.original_amount?.toString() || liability.current_balance?.toString() || '0');

  // Get all liability funds in accounts for this liability
  const { data: portions, error: portionsError } = await supabase
    .from('account_liability_portions')
    .select(`
      account_id,
      amount,
      account:accounts!account_liability_portions_account_id_fkey(
        id,
        name
      )
    `)
    .eq('liability_id', liabilityId);

  if (portionsError) {
    console.error('Error fetching liability portions:', portionsError);
  }

  const liabilityFundsInAccounts = (portions || []).reduce((sum, p: any) => {
    return sum + parseFloat(p.amount?.toString() || '0');
  }, 0);

  const accountsWithFunds = (portions || [])
    .filter((p: any) => parseFloat(p.amount?.toString() || '0') > 0)
    .map((p: any) => ({
      accountId: p.account_id,
      accountName: p.account?.name || 'Unknown Account',
      amount: parseFloat(p.amount?.toString() || '0'),
    }));

  const overfundedBy = Math.max(0, liabilityFundsInAccounts - remainingOwed);
  const isBalanced = remainingOwed === 0 && liabilityFundsInAccounts === 0;
  const needsSettlement = !isBalanced && (remainingOwed > 0 || liabilityFundsInAccounts > 0);

  return {
    isBalanced,
    remainingOwed,
    liabilityFundsInAccounts,
    totalLoan,
    overfundedBy,
    needsSettlement,
    accountsWithFunds,
  };
}

/**
 * Adjustment transaction types for liability settlement
 */
export type SettlementAdjustmentType =
  | 'repayment' // Reduce remaining liability
  | 'refund' // Remove/refund liability-tagged money from account
  | 'convert_to_personal' // Reclassify borrowed to personal
  | 'expense_writeoff'; // Mark used-up money as spent

export interface SettlementAdjustment {
  id: string;
  type: SettlementAdjustmentType;
  amount: number;
  date: string;
  accountId: string | null;
  note?: string;
}

/**
 * Execute settlement adjustments and delete liability
 */
export async function executeLiabilitySettlement(
  liabilityId: string,
  userId: string,
  adjustments: SettlementAdjustment[],
  finalAction?: 'forgive_debt' | 'erase_funds' | null,
  unaccountedAmount?: number
): Promise<void> {
  // Get liability details
  const { data: liability, error: liabilityError } = await supabase
    .from('liabilities')
    .select('current_balance, currency')
    .eq('id', liabilityId)
    .eq('user_id', userId)
    .single();

  if (liabilityError || !liability) {
    throw new Error(`Liability not found: ${liabilityError?.message}`);
  }

  const currency = liability.currency || 'USD';

  // Process each adjustment
  for (const adjustment of adjustments) {
    try {
      switch (adjustment.type) {
        case 'repayment':
          if (adjustment.accountId) {
            // Use repay_liability RPC
            const { error: repayError } = await supabase.rpc('repay_liability', {
              p_user_id: userId,
              p_account_id: adjustment.accountId,
              p_liability_id: liabilityId,
              p_amount: adjustment.amount,
              p_date: adjustment.date,
              p_notes: adjustment.note || 'Settlement repayment',
            });
            if (repayError) throw repayError;
          }
          break;

        case 'refund':
          // Remove liability funds from account (reduce account balance and portion)
          if (adjustment.accountId) {
            // Get current portion
            const { data: portion } = await supabase
              .from('account_liability_portions')
              .select('amount')
              .eq('account_id', adjustment.accountId)
              .eq('liability_id', liabilityId)
              .single();

            if (portion) {
              const currentAmount = parseFloat(portion.amount?.toString() || '0');
              const refundAmount = Math.min(adjustment.amount, currentAmount);

              if (refundAmount > 0) {
                // Reduce account balance
                const { data: account } = await supabase
                  .from('accounts')
                  .select('balance')
                  .eq('id', adjustment.accountId)
                  .single();

                if (account) {
                  const newBalance = Math.max(0, parseFloat(account.balance?.toString() || '0') - refundAmount);
                  await supabase
                    .from('accounts')
                    .update({ balance: newBalance })
                    .eq('id', adjustment.accountId);

                  // Reduce or delete portion
                  const newPortionAmount = currentAmount - refundAmount;
                  if (newPortionAmount <= 0) {
                    await supabase
                      .from('account_liability_portions')
                      .delete()
                      .eq('account_id', adjustment.accountId)
                      .eq('liability_id', liabilityId);
                  } else {
                    await supabase
                      .from('account_liability_portions')
                      .update({ amount: newPortionAmount })
                      .eq('account_id', adjustment.accountId)
                      .eq('liability_id', liabilityId);
                  }

                  // Create transaction record
                  await supabase.from('transactions').insert({
                    user_id: userId,
                    account_id: adjustment.accountId,
                    amount: -refundAmount,
                    currency: currency,
                    type: 'expense',
                    description: adjustment.note || 'Liability fund refund',
                    date: adjustment.date,
                    metadata: {
                      liability_settlement: true,
                      liability_id: liabilityId,
                      adjustment_type: 'refund',
                    },
                  });
                }
              }
            }
          }
          break;

        case 'convert_to_personal':
          // Convert liability funds to personal (reclassify, don't change account balance)
          if (adjustment.accountId) {
            // Manual conversion: reduce portion, account balance stays same
            const { data: portion } = await supabase
              .from('account_liability_portions')
              .select('amount')
              .eq('account_id', adjustment.accountId)
              .eq('liability_id', liabilityId)
              .single();

            if (!portion) {
              throw new Error('No liability portion found for this account');
            }

            const currentAmount = parseFloat(portion.amount?.toString() || '0');
            const convertAmount = Math.min(adjustment.amount, currentAmount);

            if (convertAmount <= 0) {
              throw new Error('Invalid conversion amount');
            }

            const newAmount = currentAmount - convertAmount;

            if (newAmount <= 0) {
              await supabase
                .from('account_liability_portions')
                .delete()
                .eq('account_id', adjustment.accountId)
                .eq('liability_id', liabilityId);
            } else {
              await supabase
                .from('account_liability_portions')
                .update({ amount: newAmount })
                .eq('account_id', adjustment.accountId)
                .eq('liability_id', liabilityId);
            }

            // Create transaction record for tracking (no balance change)
            await supabase.from('transactions').insert({
              user_id: userId,
              account_id: adjustment.accountId,
              amount: 0, // No balance change
              currency: currency,
              type: 'transfer',
              description: adjustment.note || 'Convert liability funds to personal',
              date: adjustment.date,
              metadata: {
                liability_settlement: true,
                liability_id: liabilityId,
                adjustment_type: 'convert_to_personal',
                converted_amount: convertAmount,
              },
            });
          }
          break;

        case 'expense_writeoff':
          // Mark money as spent (reduce account balance and portion, but don't reduce liability)
          if (adjustment.accountId) {
            // Use settle_liability_portion but don't reduce liability balance
            // Instead, create an expense transaction that reduces account and portion
            const { data: portion } = await supabase
              .from('account_liability_portions')
              .select('amount')
              .eq('account_id', adjustment.accountId)
              .eq('liability_id', liabilityId)
              .single();

            if (portion) {
              const currentAmount = parseFloat(portion.amount?.toString() || '0');
              const writeoffAmount = Math.min(adjustment.amount, currentAmount);

              if (writeoffAmount > 0) {
                // Reduce account balance
                const { data: account } = await supabase
                  .from('accounts')
                  .select('balance')
                  .eq('id', adjustment.accountId)
                  .single();

                if (account) {
                  const newBalance = Math.max(0, parseFloat(account.balance?.toString() || '0') - writeoffAmount);
                  await supabase.from('accounts').update({ balance: newBalance }).eq('id', adjustment.accountId);

                  // Reduce or delete portion
                  const newPortionAmount = currentAmount - writeoffAmount;
                  if (newPortionAmount <= 0) {
                    await supabase
                      .from('account_liability_portions')
                      .delete()
                      .eq('account_id', adjustment.accountId)
                      .eq('liability_id', liabilityId);
                  } else {
                    await supabase
                      .from('account_liability_portions')
                      .update({ amount: newPortionAmount })
                      .eq('account_id', adjustment.accountId)
                      .eq('liability_id', liabilityId);
                  }

                  // Create expense transaction
                  await supabase.from('transactions').insert({
                    user_id: userId,
                    account_id: adjustment.accountId,
                    amount: -writeoffAmount,
                    currency: currency,
                    type: 'expense',
                    description: adjustment.note || 'Liability fund write-off',
                    date: adjustment.date,
                    metadata: {
                      liability_settlement: true,
                      liability_id: liabilityId,
                      adjustment_type: 'expense_writeoff',
                    },
                  });
                }
              }
            }
          }
          break;
      }
    } catch (error: any) {
      console.error(`Error processing adjustment ${adjustment.id}:`, error);
      throw new Error(`Failed to process adjustment: ${error.message}`);
    }
  }

  // Handle final action for unaccounted amounts
  if (finalAction && unaccountedAmount && unaccountedAmount > 0) {
    if (finalAction === 'forgive_debt') {
      // Reduce liability balance (debt forgiven, but funds stay in accounts)
      await supabase
        .from('liabilities')
        .update({
          current_balance: Math.max(0, parseFloat(liability.current_balance?.toString() || '0') - unaccountedAmount),
        })
        .eq('id', liabilityId);

      // Note: Activity log table may not exist, skip logging for now
      // The transaction records will serve as the audit trail
    } else if (finalAction === 'erase_funds') {
      // Remove funds from accounts (reduce account balances and portions)
      const { data: portions } = await supabase
        .from('account_liability_portions')
        .select('account_id, amount')
        .eq('liability_id', liabilityId);

      let remainingToErase = unaccountedAmount;
      for (const portion of portions || []) {
        if (remainingToErase <= 0) break;

        const portionAmount = parseFloat(portion.amount?.toString() || '0');
        const eraseAmount = Math.min(remainingToErase, portionAmount);

        if (eraseAmount > 0) {
          // Reduce account balance
          const { data: account } = await supabase
            .from('accounts')
            .select('balance')
            .eq('id', portion.account_id)
            .single();

          if (account) {
            const newBalance = Math.max(0, parseFloat(account.balance?.toString() || '0') - eraseAmount);
            await supabase.from('accounts').update({ balance: newBalance }).eq('id', portion.account_id);

            // Reduce or delete portion
            const newPortionAmount = portionAmount - eraseAmount;
            if (newPortionAmount <= 0) {
              await supabase
                .from('account_liability_portions')
                .delete()
                .eq('account_id', portion.account_id)
                .eq('liability_id', liabilityId);
            } else {
              await supabase
                .from('account_liability_portions')
                .update({ amount: newPortionAmount })
                .eq('account_id', portion.account_id)
                .eq('liability_id', liabilityId);
            }

            // Create transaction
            await supabase.from('transactions').insert({
              user_id: userId,
              account_id: portion.account_id,
              amount: -eraseAmount,
              currency: currency,
              type: 'expense',
              description: 'Liability fund erased during settlement',
              date: new Date().toISOString().split('T')[0],
              metadata: {
                liability_settlement: true,
                liability_id: liabilityId,
                adjustment_type: 'erase_funds',
              },
            });
          }

          remainingToErase -= eraseAmount;
        }
      }
    }
  }

  // Finally, soft delete the liability
  await supabase
    .from('liabilities')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', liabilityId)
    .eq('user_id', userId);

  // Log final deletion (if table exists)
  try {
    await supabase.from('liability_activity_log').insert({
      liability_id: liabilityId,
      user_id: userId,
      activity_type: 'deleted',
      notes: 'Liability deleted after settlement',
    });
  } catch (error) {
    // Table might not exist, skip logging
    console.log('Activity log table not available, skipping log entry');
  }
}

