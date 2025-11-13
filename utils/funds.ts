import { supabase } from '@/lib/supabase';
import { AccountFundType } from '@/types';

type AdjustFundBalanceArgs = {
  accountId: string;
  fundType: AccountFundType;
  referenceId?: string | null;
  delta: number;
  metadata?: Record<string, any>;
};

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

const parseNumeric = (value: any): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  const parsed = parseFloat(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function adjustFundBalance({
  accountId,
  fundType,
  referenceId,
  delta,
  metadata,
}: AdjustFundBalanceArgs) {
  if (!accountId) {
    throw new Error('Missing accountId for fund adjustment');
  }

  if (!fundType) {
    throw new Error('Missing fundType for fund adjustment');
  }

  if (delta === 0) {
    return;
  }

  try {
    let query = supabase
      .from('account_funds')
      .select('id, balance')
      .eq('account_id', accountId)
      .eq('type', fundType)
      .limit(1);

    if (referenceId) {
      query = query.eq('reference_id', referenceId);
    } else {
      query = query.is('reference_id', null);
    }

    const { data: existingFund, error: lookupError } = await query.maybeSingle();

    if (lookupError && lookupError.code !== 'PGRST116') {
      throw lookupError;
    }

    let currentBalance = 0;
    let fundId: string | null = null;

    if (existingFund) {
      currentBalance = parseNumeric(existingFund.balance);
      fundId = existingFund.id;
    } else {
      const { data: insertedFund, error: insertError } = await supabase
        .from('account_funds')
        .insert({
          account_id: accountId,
          type: fundType,
          reference_id: referenceId ?? null,
          balance: 0,
          metadata: metadata ? metadata : { seeded_via: 'adjustFundBalance' },
        })
        .select('id, balance')
        .single();

      if (insertError) {
        throw insertError;
      }

      fundId = insertedFund.id;
      currentBalance = parseNumeric(insertedFund.balance);
    }

    const newBalance = parseFloat((currentBalance + delta).toFixed(2));

    if (newBalance < -0.005) {
      throw new Error('Insufficient funds for this operation');
    }

    const updatePayload: Record<string, any> = {
      balance: newBalance < 0 ? 0 : newBalance,
      updated_at: new Date().toISOString(),
    };

    if (metadata) {
      updatePayload.metadata = metadata;
    }

    await supabase
      .from('account_funds')
      .update(updatePayload)
      .eq('id', fundId);

    return newBalance < 0 ? 0 : newBalance;
  } catch (error) {
    console.error('Error adjusting fund balance:', error);
    throw error;
  }
}

export async function getAccountFundTotal(accountId: string) {
  if (!accountId) return 0;
  try {
    const { data, error } = await supabase
      .from('account_funds')
      .select('balance')
      .eq('account_id', accountId);

    if (error) {
      throw error;
    }

    return (data || []).reduce((sum, fund) => sum + parseNumeric(fund.balance), 0);
  } catch (error) {
    console.error('Error calculating account fund total:', error);
    return 0;
  }
}

export function normaliseReferenceId(referenceId?: string | null) {
  if (!referenceId) return null;
  return referenceId === ZERO_UUID ? null : referenceId;
}


