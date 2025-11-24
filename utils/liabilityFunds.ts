import { supabase } from '@/lib/supabase';

/**
 * Allocate liability funds to an account
 * Creates a deposit transaction and liability fund in the specified account
 */
export async function allocateLiabilityFunds(
  userId: string,
  liabilityId: string,
  accountId: string,
  amount: number,
  date: Date
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get liability details
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('title, currency')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    // Get account currency
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('currency')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accountError || !account) {
      throw new Error('Account not found');
    }

    // 1. Check if liability fund exists in account_funds (for display purposes)
    // The actual tracking is in account_liability_portions, but we can create account_funds for UI
    const { data: existingFund, error: fundCheckError } = await supabase
      .from('account_funds')
      .select('*')
      .eq('account_id', accountId)
      .eq('type', 'borrowed')  // Updated to use 'borrowed' instead of 'liability'
      .eq('reference_id', liabilityId)
      .maybeSingle();

    // Create or update account_funds entry for UI display (optional, but helpful)
    // Name format: "{Liability Title} Funds" (e.g., "Home Loan Funds")
    if (!existingFund) {
      const { error: createFundError } = await supabase
        .from('account_funds')
        .insert({
          account_id: accountId,
          type: 'borrowed',  // Updated to use 'borrowed' instead of 'liability'
          reference_id: liabilityId,
          balance: 0, // Will be updated by the RPC
          metadata: {
            liability_name: liability.title,
            fund_name: `${liability.title} Funds`, // Store fund name for display
          },
        });

      if (createFundError && createFundError.code !== '23505') {
        // Ignore unique constraint errors (fund might already exist)
        console.warn('Could not create account_funds entry:', createFundError);
      }
    } else {
      // Update metadata if fund exists but doesn't have fund_name
      if (!existingFund.metadata?.fund_name) {
        await supabase
          .from('account_funds')
          .update({
            metadata: {
              ...existingFund.metadata,
              liability_name: liability.title,
              fund_name: `${liability.title} Funds`,
            },
          })
          .eq('id', existingFund.id);
      }
    }

    // 2. Create deposit transaction using receive_to_account_bucket with borrowed bucket type
    // This will update account_liability_portions automatically
    const { error: transactionError } = await supabase.rpc(
      'receive_to_account_bucket',
      {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket_type: 'borrowed',  // Updated to use 'borrowed' instead of 'liability'
        p_bucket_id: liabilityId, // Use liability ID
        p_amount: amount,
        p_category: 'Loan Received', // Category name
        p_description: `Loan disbursement: ${liability.title}`,
        p_date: date.toISOString().split('T')[0],
        p_currency: account.currency || 'INR',
      }
    );

    if (transactionError) throw transactionError;

    // Update liability available_funds (decrease by allocated amount)
    // When funds are allocated to accounts, they're no longer "available" to allocate
    // Get current available_funds first
    const { data: currentLiability, error: fetchError } = await supabase
      .from('liabilities')
      .select('available_funds, original_amount, disbursed_amount')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (!fetchError && currentLiability) {
      const currentAvailable = currentLiability.available_funds !== null && currentLiability.available_funds !== undefined
        ? parseFloat(currentLiability.available_funds.toString())
        : (currentLiability.original_amount || 0) - (currentLiability.disbursed_amount || 0);
      
      const newAvailable = Math.max(0, currentAvailable - amount);

      const { error: updateAvailableError } = await supabase
        .from('liabilities')
        .update({
          available_funds: newAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);

      if (updateAvailableError) {
        console.error('Error updating liability available_funds:', updateAvailableError);
        // Don't throw - the allocation was successful, just the available_funds update failed
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error allocating liability funds:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Get available liability funds across all accounts for a specific liability
 */
export async function getAvailableLiabilityFunds(
  userId: string,
  liabilityId: string
): Promise<{ total: number; funds: any[] }> {
  try {
    const { data: funds, error } = await supabase
      .from('account_funds')
      .select('*, accounts:account_id(name)')
      .eq('reference_id', liabilityId)  // Updated: use reference_id instead of linked_liability_id
      .eq('type', 'borrowed');  // Updated: use 'borrowed' and 'type' column

    if (error) throw error;

    const total = funds?.reduce((sum, fund) => sum + (fund.balance || 0), 0) || 0;

    return { total, funds: funds || [] };
  } catch (error) {
    console.error('Error getting liability funds:', error);
    return { total: 0, funds: [] };
  }
}

/**
 * Get accounts that have liability funds for a specific liability
 * Similar to getGoalAccounts for goals
 * Returns accounts with their liability fund balances
 */
export async function getLiabilityAccounts(
  liabilityId: string,
  includeZeroBalance: boolean = false
): Promise<Array<{ account: any; balance: number }>> {
  try {
    const { data: funds, error } = await supabase
      .from('account_funds')
      .select(`
        *,
        accounts:account_id(*)
      `)
      .eq('reference_id', liabilityId)
      .eq('type', 'borrowed');

    if (error) throw error;

    if (!funds || funds.length === 0) {
      return [];
    }

    const accountsWithFunds = funds
      .filter((fund) => {
        const balance = parseFloat(fund.balance?.toString() || '0');
        return includeZeroBalance || balance > 0;
      })
      .map((fund) => ({
        account: fund.accounts,
        balance: parseFloat(fund.balance?.toString() || '0'),
      }))
      .filter((item) => item.account); // Filter out any null accounts

    return accountsWithFunds;
  } catch (error) {
    console.error('Error getting liability accounts:', error);
    return [];
  }
}

/**
 * Get liability fund for a specific account
 */
export async function getLiabilityFundForAccount(
  accountId: string,
  liabilityId: string
): Promise<{ fund: any | null; error?: string }> {
  try {
    const { data: fund, error } = await supabase
      .from('account_funds')
      .select('*')
      .eq('account_id', accountId)
      .eq('reference_id', liabilityId)  // Updated: use reference_id instead of linked_liability_id
      .eq('type', 'borrowed')  // Updated: use 'borrowed' and 'type' column
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return { fund: fund || null };
  } catch (error) {
    console.error('Error getting liability fund for account:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { fund: null, error: errorMessage };
  }
}

/**
 * Draw funds from a liability fund (for withdrawals/usage)
 */
export async function drawLiabilityFunds(
  userId: string,
  liabilityId: string,
  accountId: string,
  amount: number,
  description: string,
  categoryId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the liability fund
    const { fund, error: getFundError } = await getLiabilityFundForAccount(accountId, liabilityId);

    if (getFundError || !fund) {
      throw new Error('Liability fund not found');
    }

    if (fund.balance < amount) {
      throw new Error('Insufficient funds in liability fund');
    }

    // Create expense transaction using the fund
    // Use bucket object format: {type: 'borrowed', id: liabilityId}
    const { error: transactionError } = await supabase.rpc(
      'spend_from_account_bucket',
      {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket: { type: 'borrowed', id: liabilityId },  // ✅ FIXED: Use bucket object, not bucket_id
        p_amount: amount,
        p_category: categoryId || 'Liability Withdrawal',
        p_description: description,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: fund.currency || 'INR',
      }
    );

    if (transactionError) throw transactionError;

    return { success: true };
  } catch (error) {
    console.error('Error drawing liability funds:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Transfer funds from liability fund to personal fund within the same account
 */
export async function convertLiabilityToPersonalFund(
  userId: string,
  accountId: string,
  liabilityId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get liability fund
    const { fund: liabilityFund, error: getLiabilityError } = await getLiabilityFundForAccount(
      accountId,
      liabilityId
    );

    if (getLiabilityError || !liabilityFund) {
      throw new Error('Liability fund not found');
    }

    if (liabilityFund.balance < amount) {
      throw new Error('Insufficient funds in liability fund');
    }

    // Convert borrowed fund to personal by reducing borrowed fund balance
    // Personal fund is calculated (account.balance - sum(borrowed) - sum(goal))
    // When we reduce borrowed fund, personal fund automatically increases
    // No need to update personal fund directly - it's calculated
    
    const currentBalance = parseFloat(liabilityFund.balance?.toString() || '0');
    const newBalance = currentBalance - amount;

    if (newBalance <= 0) {
      // Delete fund if fully converted
      const { error: deleteError } = await supabase
        .from('account_funds')
        .delete()
        .eq('id', liabilityFund.id);

      if (deleteError) throw deleteError;
    } else {
      // Update fund balance
      const { error: updateError } = await supabase
        .from('account_funds')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', liabilityFund.id);

      if (updateError) throw updateError;
    }
    
    // Note: No transaction created here as this is just reclassification
    // Account balance stays same, only fund type changes (borrowed → personal)

    return { success: true };
  } catch (error) {
    console.error('Error converting liability to personal fund:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

/**
 * Delete or transfer liability fund from an account
 * User can choose to transfer to personal fund or another account
 */
export async function deleteOrTransferLiabilityFund(
  userId: string,
  accountId: string,
  liabilityId: string,
  fundId: string,
  options: {
    action: 'delete' | 'transfer_to_personal' | 'transfer_to_account';
    transferToAccountId?: string;
    amount?: number; // If not provided, transfers entire fund balance
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get the liability fund
    const { fund, error: getFundError } = await getLiabilityFundForAccount(accountId, liabilityId);

    if (getFundError || !fund) {
      throw new Error('Liability fund not found');
    }

    const fundBalance = parseFloat(fund.balance?.toString() || '0');
    const transferAmount = options.amount || fundBalance;

    if (transferAmount <= 0) {
      throw new Error('Fund balance is zero or negative');
    }

    if (transferAmount > fundBalance) {
      throw new Error('Transfer amount exceeds fund balance');
    }

    // Get liability details for updating available_funds
    const { data: liability, error: liabilityError } = await supabase
      .from('liabilities')
      .select('title, available_funds, original_amount, disbursed_amount')
      .eq('id', liabilityId)
      .eq('user_id', userId)
      .single();

    if (liabilityError || !liability) {
      throw new Error('Liability not found');
    }

    if (options.action === 'transfer_to_personal') {
      // Transfer to personal fund in the same account
      const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket: { type: 'borrowed', id: liabilityId },
        p_amount: transferAmount,
        p_category: 'Fund Transfer',
        p_description: `Transfer from ${liability.title} Funds to Personal Fund`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: fund.currency || 'INR',
      });

      if (spendError) throw spendError;

      const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket_type: 'personal',
        p_bucket_id: null,
        p_amount: transferAmount,
        p_category: 'Fund Transfer',
        p_description: `Transfer from ${liability.title} Funds`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: fund.currency || 'INR',
      });

      if (receiveError) throw receiveError;

    } else if (options.action === 'transfer_to_account' && options.transferToAccountId) {
      // Transfer to another account's personal fund
      const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket: { type: 'borrowed', id: liabilityId },
        p_amount: transferAmount,
        p_category: 'Fund Transfer',
        p_description: `Transfer from ${liability.title} Funds to another account`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: fund.currency || 'INR',
      });

      if (spendError) throw spendError;

      const { data: destAccount, error: destAccountError } = await supabase
        .from('accounts')
        .select('currency')
        .eq('id', options.transferToAccountId)
        .eq('user_id', userId)
        .single();

      if (destAccountError || !destAccount) {
        throw new Error('Destination account not found');
      }

      const { error: receiveError } = await supabase.rpc('receive_to_account_bucket', {
        p_user_id: userId,
        p_account_id: options.transferToAccountId,
        p_bucket_type: 'personal',
        p_bucket_id: null,
        p_amount: transferAmount,
        p_category: 'Fund Transfer',
        p_description: `Transfer from ${liability.title} Funds`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: destAccount.currency || 'INR',
      });

      if (receiveError) throw receiveError;

    } else if (options.action === 'delete') {
      // Delete the fund (money goes back to available_funds)
      const { error: spendError } = await supabase.rpc('spend_from_account_bucket', {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket: { type: 'borrowed', id: liabilityId },
        p_amount: transferAmount,
        p_category: 'Fund Deletion',
        p_description: `Delete ${liability.title} Funds`,
        p_date: new Date().toISOString().split('T')[0],
        p_currency: fund.currency || 'INR',
      });

      if (spendError) throw spendError;

      // Increase available_funds (money is no longer allocated to account)
      const currentAvailable = liability.available_funds !== null && liability.available_funds !== undefined
        ? parseFloat(liability.available_funds.toString())
        : (liability.original_amount || 0) - (liability.disbursed_amount || 0);

      const { error: updateAvailableError } = await supabase
        .from('liabilities')
        .update({
          available_funds: currentAvailable + transferAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', liabilityId)
        .eq('user_id', userId);

      if (updateAvailableError) {
        console.error('Error updating liability available_funds:', updateAvailableError);
      }
    }

    // If fund balance becomes zero after transfer, delete the fund record
    const remainingBalance = fundBalance - transferAmount;
    if (remainingBalance <= 0) {
      const { error: deleteError } = await supabase
        .from('account_funds')
        .delete()
        .eq('id', fundId);

      if (deleteError) {
        console.error('Error deleting fund record:', deleteError);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting/transferring liability fund:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
}

