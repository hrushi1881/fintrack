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
          },
        });

      if (createFundError && createFundError.code !== '23505') {
        // Ignore unique constraint errors (fund might already exist)
        console.warn('Could not create account_funds entry:', createFundError);
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
        p_notes: `Loan disbursement for ${liability.title}`,
        p_currency: account.currency || 'INR',
      }
    );

    if (transactionError) throw transactionError;

    return { success: true };
  } catch (error: any) {
    console.error('Error allocating liability funds:', error);
    return { success: false, error: error.message };
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
  } catch (error: any) {
    console.error('Error getting liability funds:', error);
    return { total: 0, funds: [] };
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
  } catch (error: any) {
    console.error('Error getting liability fund for account:', error);
    return { fund: null, error: error.message };
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
    const { error: transactionError } = await supabase.rpc(
      'spend_from_account_bucket',
      {
        p_user_id: userId,
        p_account_id: accountId,
        p_bucket_id: fund.id,
        p_amount: amount,
        p_description: description,
        p_transaction_date: new Date().toISOString().split('T')[0],
        p_category_id: categoryId || null,
      }
    );

    if (transactionError) throw transactionError;

    return { success: true };
  } catch (error: any) {
    console.error('Error drawing liability funds:', error);
    return { success: false, error: error.message };
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

    // Get or create personal fund
    const { data: personalFund, error: getPersonalError } = await supabase
      .from('account_funds')
      .select('*')
      .eq('account_id', accountId)
      .eq('fund_type', 'personal')
      .single();

    if (getPersonalError) throw getPersonalError;

    // Transfer between funds
    const { error: transferError } = await supabase.rpc('transfer_between_buckets', {
      p_user_id: userId,
      p_from_bucket_id: liabilityFund.id,
      p_to_bucket_id: personalFund.id,
      p_amount: amount,
      p_description: 'Converted liability funds to personal funds',
    });

    if (transferError) throw transferError;

    return { success: true };
  } catch (error: any) {
    console.error('Error converting liability to personal fund:', error);
    return { success: false, error: error.message };
  }
}

