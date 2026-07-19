/**
 * Recurring Payment Actions
 *
 * Shared helpers to:
 * - Ensure a scheduled payment exists for a recurring transaction cycle
 * - Record an actual payment using the account/fund-bucket RPC
 * - Mark the scheduled payment as paid and link the transaction
 *
 * This is the single orchestration point for “record recurring payment” flows.
 */

import { supabase } from '@/lib/supabase';
import {
  createScheduledPayment,
  CreateScheduledPaymentData,
  markScheduledPaymentPaid,
} from '@/utils/scheduledPayments';
import {
  fetchRecurringTransactionById,
  RecurringTransaction,
} from '@/utils/recurringTransactions';

export type BucketType = 'personal' | 'liability' | 'goal';

export interface BucketRef {
  type: BucketType;
  id: string | null;
}

export interface RecordRecurringPaymentParams {
  /** ID of an existing scheduled payment, if any */
  scheduledPaymentId?: string;
  /** Recurring container this payment belongs to */
  recurringTransactionId: string;
  /** Optional cycle number metadata */
  cycleNumber?: number;
  /** Account to pay from / receive into */
  accountId: string;
  /** Fund bucket to debit/credit via RPC */
  bucket: BucketRef;
  /** Monetary amount to record */
  amount: number;
  /** ISO date (YYYY-MM-DD) for the payment */
  date: string;
  /** UI currency code (falls back to recurring.currency if omitted) */
  currency?: string;
  /** Human readable description */
  description?: string;
}

export interface RecordRecurringPaymentResult {
  scheduledPaymentId: string;
  transactionId: string | null;
}

/**
 * Ensure there is a scheduled_transactions row for this recurring transaction / cycle.
 * Returns the scheduled payment id.
 */
async function ensureScheduledPaymentForRecurring(
  recurring: RecurringTransaction,
  params: Omit<RecordRecurringPaymentParams, 'bucket' | 'accountId'>
): Promise<string> {
  const { scheduledPaymentId, recurringTransactionId, cycleNumber, amount, date } = params;

  if (scheduledPaymentId) {
    return scheduledPaymentId;
  }

  // Try to locate an existing scheduled payment by metadata (cycle_number)
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('User not authenticated');
  }

  let existingId: string | undefined;

  if (cycleNumber !== undefined) {
    const { data: existing } = await supabase
      .from('scheduled_transactions')
      .select('id')
      .eq('user_id', user.user.id)
      .eq('linked_recurring_transaction_id', recurringTransactionId)
      .eq('metadata->>cycle_number', cycleNumber.toString())
      .maybeSingle();

    if (existing?.id) {
      existingId = existing.id;
    }
  }

  if (existingId) {
    return existingId;
  }

  // Create a new scheduled payment as the underlying container for this payment
  const payload: CreateScheduledPaymentData = {
    title: params.description || recurring.title || 'Recurring payment',
    category_id: recurring.category_id,
    amount,
    type: (recurring.type as 'income' | 'expense') || 'expense',
    due_date: date,
    linked_account_id: recurring.account_id,
    fund_type: (recurring.fund_type || 'personal') as 'personal' | 'liability' | 'goal',
    linked_recurring_transaction_id: recurringTransactionId,
    recurring_transaction_id: recurringTransactionId,
    notes: cycleNumber
      ? `Cycle ${cycleNumber} - ${params.description || recurring.title || 'payment'}`
      : params.description || recurring.title || 'payment',
  };

  const created = await createScheduledPayment(payload);
  return created.id;
}

/**
 * Record a recurring payment by:
 * 1. Ensuring a scheduled payment exists
 * 2. Calling spend_from_account_bucket RPC
 * 3. Marking the scheduled payment as paid and linking the transaction
 */
export async function recordRecurringPayment(
  params: RecordRecurringPaymentParams
): Promise<RecordRecurringPaymentResult> {
  const {
    scheduledPaymentId,
    recurringTransactionId,
    cycleNumber,
    accountId,
    bucket,
    amount,
    date,
    currency,
    description,
  } = params;

  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    throw new Error('User not authenticated');
  }

  if (!accountId) {
    throw new Error('Account is required to record payment');
  }

  if (amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  // Fetch recurring container for defaults
  const recurring = await fetchRecurringTransactionById(recurringTransactionId);
  if (!recurring) {
    throw new Error('Recurring transaction not found');
  }

  // 1. Ensure there is a scheduled payment row
  const ensuredScheduledId = await ensureScheduledPaymentForRecurring(recurring, {
    scheduledPaymentId,
    recurringTransactionId,
    cycleNumber,
    amount,
    date,
    currency,
    description,
  });

  // 2. Spend from account bucket (creates the underlying transaction & adjusts balances)
  const bucketParam = {
    type: bucket.type === 'liability' ? 'liability' : bucket.type,
    id: bucket.type === 'personal' ? null : bucket.id,
  };

  const { data: rpcResult, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
    p_user_id: user.user.id,
    p_account_id: accountId,
    p_bucket: bucketParam,
    p_amount: amount,
    p_category: recurring.category_id || null,
    p_description: description || recurring.title || 'Recurring payment',
    p_date: date,
    p_currency: currency || recurring.currency,
  });

  if (rpcError) {
    console.error('Bucket RPC error (spend_from_account_bucket):', rpcError);
    throw rpcError;
  }

  const transactionId = (rpcResult as string) || null;

  // 3. Mark scheduled payment as paid and link transaction
  await markScheduledPaymentPaid(ensuredScheduledId, transactionId || undefined);

  // Attach richer metadata to the transaction if present
  if (transactionId) {
    const { error: metaErr } = await supabase
      .from('transactions')
      .update({
        metadata: {
          recurring_transaction_id: recurringTransactionId,
          cycle_number: cycleNumber,
          payment_tracking_method: 'scheduled_transaction',
        },
      })
      .eq('id', transactionId);

    if (metaErr) {
      console.warn('Failed to attach recurring metadata to transaction:', metaErr);
    }
  }

  return {
    scheduledPaymentId: ensuredScheduledId,
    transactionId,
  };
}

