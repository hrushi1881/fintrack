import { supabase } from '@/lib/supabase';
import { Liability } from '@/types';
import { DEFAULT_CURRENCY } from './currency';

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

  // Get all liability funds in accounts for this liability (from account_funds - single source of truth)
  const { data: funds, error: fundsError } = await supabase
    .from('account_funds')
    .select(`
      account_id,
      balance,
      account:accounts!account_funds_account_id_fkey(
        id,
        name
      )
    `)
    .eq('type', 'borrowed')
    .eq('reference_id', liabilityId);

  if (fundsError) {
    console.error('Error fetching liability funds:', fundsError);
  }

  const liabilityFundsInAccounts = (funds || []).reduce((sum, f: any) => {
    return sum + parseFloat(f.balance?.toString() || '0');
  }, 0);

  const accountsWithFunds = (funds || [])
    .filter((f: any) => parseFloat(f.balance?.toString() || '0') > 0)
    .map((f: any) => ({
      accountId: f.account_id,
      accountName: f.account?.name || 'Unknown Account',
      amount: parseFloat(f.balance?.toString() || '0'),
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

  const currency = liability.currency || DEFAULT_CURRENCY;

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
          // Remove liability funds from account (reduce account balance and fund)
          // Use RPC to handle balance + fund updates atomically
          if (adjustment.accountId) {
            // Get current fund balance (from account_funds - single source of truth)
            const { data: fund } = await supabase
              .from('account_funds')
              .select('balance')
              .eq('account_id', adjustment.accountId)
              .eq('type', 'borrowed')
              .eq('reference_id', liabilityId)
              .single();

            if (fund) {
              const currentAmount = parseFloat(fund.balance?.toString() || '0');
              const refundAmount = Math.min(adjustment.amount, currentAmount);

              if (refundAmount > 0) {
                // Use RPC to spend from borrowed fund (reduces both account balance and fund)
                const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
                  p_user_id: userId,
                  p_account_id: adjustment.accountId,
                  p_bucket: { type: 'borrowed', id: liabilityId },
                  p_amount: refundAmount,
                  p_category: 'Liability Refund',
                  p_description: adjustment.note || 'Liability fund refund',
                  p_date: adjustment.date,
                  p_currency: currency,
                });

                if (spendError) throw spendError;
              }
            }
          }
          break;

        case 'convert_to_personal':
          // Convert liability funds to personal (reclassify, don't change account balance)
          // Reduce borrowed fund balance in account_funds (personal increases automatically)
          if (adjustment.accountId) {
            // Get current borrowed fund (from account_funds - single source of truth)
            const { data: fund } = await supabase
              .from('account_funds')
              .select('balance')
              .eq('account_id', adjustment.accountId)
              .eq('type', 'borrowed')
              .eq('reference_id', liabilityId)
              .single();

            if (!fund) {
              throw new Error('No liability fund found for this account');
            }

            const currentAmount = parseFloat(fund.balance?.toString() || '0');
            const convertAmount = Math.min(adjustment.amount, currentAmount);

            if (convertAmount <= 0) {
              throw new Error('Invalid conversion amount');
            }

            // Reduce borrowed fund balance (personal fund increases automatically)
            // Personal fund = account.balance - sum(borrowed) - sum(goal)
            const { error: updateError } = await supabase
              .from('account_funds')
              .update({ 
                balance: currentAmount - convertAmount,
                updated_at: new Date().toISOString()
              })
              .eq('account_id', adjustment.accountId)
              .eq('type', 'borrowed')
              .eq('reference_id', liabilityId);

            if (updateError) throw updateError;

            // Delete fund if balance reaches zero
            if (currentAmount - convertAmount <= 0) {
              await supabase
                .from('account_funds')
                .delete()
                .eq('account_id', adjustment.accountId)
                .eq('type', 'borrowed')
                .eq('reference_id', liabilityId);
            }

            // Create transaction record for tracking (no balance change, just reclassification)
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
          // Mark money as spent (reduce account balance and fund, but don't reduce liability balance)
          // Use RPC to handle balance + fund updates atomically
          if (adjustment.accountId) {
            // Get current fund balance (from account_funds - single source of truth)
            const { data: fund } = await supabase
              .from('account_funds')
              .select('balance')
              .eq('account_id', adjustment.accountId)
              .eq('type', 'borrowed')
              .eq('reference_id', liabilityId)
              .single();

            if (fund) {
              const currentAmount = parseFloat(fund.balance?.toString() || '0');
              const writeoffAmount = Math.min(adjustment.amount, currentAmount);

              if (writeoffAmount > 0) {
                // Use RPC to spend from borrowed fund (reduces both account balance and fund)
                const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
                  p_user_id: userId,
                  p_account_id: adjustment.accountId,
                  p_bucket: { type: 'borrowed', id: liabilityId },
                  p_amount: writeoffAmount,
                  p_category: 'Liability Write-off',
                  p_description: adjustment.note || 'Liability fund write-off',
                  p_date: adjustment.date,
                  p_currency: currency,
                });

                if (spendError) throw spendError;
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
      // Remove funds from accounts (reduce account balances and funds)
      // Query from account_funds (single source of truth)
      const { data: funds } = await supabase
        .from('account_funds')
        .select('account_id, balance')
        .eq('type', 'borrowed')
        .eq('reference_id', liabilityId)
        .gt('balance', 0);

      let remainingToErase = unaccountedAmount;
      for (const fund of funds || []) {
        if (remainingToErase <= 0) break;

        const fundAmount = parseFloat(fund.balance?.toString() || '0');
        const eraseAmount = Math.min(remainingToErase, fundAmount);

        if (eraseAmount > 0) {
          // Use RPC to spend from borrowed fund (reduces both account balance and fund)
          const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
            p_user_id: userId,
            p_account_id: fund.account_id,
            p_bucket: { type: 'borrowed', id: liabilityId },
            p_amount: eraseAmount,
            p_category: 'Liability Settlement',
            p_description: 'Liability fund erased during settlement',
            p_date: new Date().toISOString().split('T')[0],
            p_currency: currency,
          });

          if (spendError) {
            console.error(`Error erasing funds from account ${fund.account_id}:`, spendError);
            // Continue with other accounts even if one fails
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

