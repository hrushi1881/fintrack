// ============================================================================
// ACCOUNTS FUNCTIONALITY
// ============================================================================
// All account-related business logic, CRUD operations, and utilities

import { supabase } from '@/lib/supabase';
import type { Account } from '@/types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateAccountData {
  name: string;
  type: 'bank' | 'card' | 'wallet' | 'cash' | 'investment' | 'loan' | 'goals_savings' | 'liability' | 'other';
  organization_id?: string | null;
  balance?: number;
  currency?: string;
  credit_limit?: number;
  description?: string;
  icon?: string;
  color?: string;
  include_in_totals?: boolean;
}

export interface UpdateAccountData {
  id: string;
  name?: string;
  type?: 'bank' | 'card' | 'wallet' | 'cash' | 'investment' | 'loan' | 'goals_savings' | 'liability' | 'other';
  organization_id?: string | null;
  balance?: number;
  currency?: string;
  credit_limit?: number;
  description?: string;
  icon?: string;
  color?: string;
  include_in_totals?: boolean;
}

export interface AccountFilters {
  organization_id?: string;
  type?: string;
  include_in_totals?: boolean;
  is_active?: boolean;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new account
 */
export async function createAccount(data: CreateAccountData, userId: string): Promise<Account> {
  if (!userId) {
    throw new Error('User ID is required to create an account');
  }

  if (!data.name || !data.name.trim()) {
    throw new Error('Account name is required');
  }

  if (!data.type) {
    throw new Error('Account type is required');
  }

  const payload: any = {
    user_id: userId,
    name: data.name.trim(),
    type: data.type,
    balance: data.balance ?? 0,
    currency: data.currency || 'USD',
    include_in_totals: data.include_in_totals ?? true,
    is_active: true,
    is_deleted: false,
  };

  if (data.organization_id !== undefined) {
    payload.organization_id = data.organization_id || null;
  }

  if (data.credit_limit !== undefined && data.credit_limit !== null) {
    payload.credit_limit = data.credit_limit;
  }

  if (data.description) {
    payload.description = data.description.trim();
  }

  if (data.icon) {
    payload.icon = data.icon;
  }

  if (data.color) {
    payload.color = data.color;
  }

  const { data: account, error } = await supabase
    .from('accounts')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('Error creating account:', error);
    throw error;
  }

  return account as Account;
}

/**
 * Get account by ID
 */
export async function getAccountById(accountId: string, userId: string): Promise<Account | null> {
  if (!accountId || !userId) return null;

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error fetching account:', error);
    throw error;
  }

  return data as Account;
}

/**
 * Get all accounts for a user
 */
export async function getAllAccounts(
  userId: string,
  filters?: AccountFilters
): Promise<Account[]> {
  if (!userId) return [];

  let query = supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  } else {
    query = query.eq('is_active', true);
  }

  query = query.eq('is_deleted', false);

  if (filters?.organization_id !== undefined) {
    if (filters.organization_id === null) {
      query = query.is('organization_id', null);
    } else {
      query = query.eq('organization_id', filters.organization_id);
    }
  }

  if (filters?.type) {
    query = query.eq('type', filters.type);
  }

  if (filters?.include_in_totals !== undefined) {
    query = query.eq('include_in_totals', filters.include_in_totals);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching accounts:', error);
    throw error;
  }

  return (data || []) as Account[];
}

/**
 * Get accounts by organization
 */
export async function getAccountsByOrganization(
  organizationId: string | null,
  userId: string
): Promise<Account[]> {
  return getAllAccounts(userId, { organization_id: organizationId || undefined });
}

/**
 * Update account
 */
export async function updateAccount(
  data: UpdateAccountData,
  userId: string
): Promise<Account> {
  if (!data.id || !userId) {
    throw new Error('Account ID and User ID are required');
  }

  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.type !== undefined) payload.type = data.type;
  if (data.organization_id !== undefined) payload.organization_id = data.organization_id || null;
  if (data.balance !== undefined) payload.balance = data.balance;
  if (data.currency !== undefined) payload.currency = data.currency;
  if (data.credit_limit !== undefined) payload.credit_limit = data.credit_limit ?? null;
  if (data.description !== undefined) payload.description = data.description?.trim() || null;
  if (data.icon !== undefined) payload.icon = data.icon;
  if (data.color !== undefined) payload.color = data.color;
  if (data.include_in_totals !== undefined) payload.include_in_totals = data.include_in_totals;

  const { data: account, error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('id', data.id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error updating account:', error);
    throw error;
  }

  return account as Account;
}

/**
 * Archive account (soft delete)
 */
export async function archiveAccount(accountId: string, userId: string): Promise<void> {
  if (!accountId || !userId) {
    throw new Error('Account ID and User ID are required');
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error archiving account:', error);
    throw error;
  }
}

/**
 * Delete account (soft delete - sets is_active to false)
 * Note: accounts table doesn't have is_deleted or deleted_at columns
 */
export async function deleteAccount(accountId: string, userId: string): Promise<void> {
  if (!accountId || !userId) {
    throw new Error('Account ID and User ID are required');
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting account:', error);
    throw error;
  }
}

/**
 * Assign account to organization
 */
export async function assignAccountToOrganization(
  accountId: string,
  organizationId: string | null,
  userId: string
): Promise<Account> {
  if (!accountId || !userId) {
    throw new Error('Account ID and User ID are required');
  }

  const { data: account, error } = await supabase
    .from('accounts')
    .update({
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    console.error('Error assigning account to organization:', error);
    throw error;
  }

  return account as Account;
}

/**
 * Move account between organizations
 */
export async function moveAccount(
  accountId: string,
  fromOrganizationId: string | null,
  toOrganizationId: string | null,
  userId: string
): Promise<Account> {
  return assignAccountToOrganization(accountId, toOrganizationId, userId);
}

// ============================================================================
// UTILITIES & HELPERS
// ============================================================================

/**
 * Validate account data
 */
export function validateAccountData(data: CreateAccountData | UpdateAccountData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if ('name' in data && data.name !== undefined) {
    if (!data.name || !data.name.trim()) {
      errors.push('Account name is required');
    } else if (data.name.trim().length < 2) {
      errors.push('Account name must be at least 2 characters');
    } else if (data.name.trim().length > 100) {
      errors.push('Account name must be less than 100 characters');
    }
  }

  if ('type' in data && data.type) {
    const validTypes = ['bank', 'card', 'wallet', 'cash', 'investment', 'loan', 'goals_savings', 'liability', 'other'];
    if (!validTypes.includes(data.type)) {
      errors.push(`Account type must be one of: ${validTypes.join(', ')}`);
    }
  }

  if ('credit_limit' in data && data.credit_limit !== undefined && data.credit_limit !== null) {
    if (data.credit_limit <= 0) {
      errors.push('Credit limit must be greater than 0');
    }
  }

  if ('balance' in data && data.balance !== undefined) {
    if (isNaN(data.balance)) {
      errors.push('Balance must be a valid number');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get account type label
 */
export function getAccountTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    bank: 'Bank Account',
    card: 'Credit Card',
    wallet: 'Wallet',
    cash: 'Cash',
    investment: 'Investment',
    loan: 'Loan',
    other: 'Other',
  };

  return labels[type] || type;
}

/**
 * Get account type icon
 */
export function getAccountTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    bank: 'card-outline',
    card: 'card',
    wallet: 'wallet-outline',
    cash: 'cash-outline',
    investment: 'trending-up-outline',
    loan: 'document-text-outline',
    other: 'ellipse-outline',
  };

  return icons[type] || 'ellipse-outline';
}

/**
 * Check if account is credit account
 */
export function isCreditAccount(type: string): boolean {
  const creditTypes = ['card', 'credit_card', 'credit'];
  return creditTypes.includes(type.toLowerCase());
}

/**
 * Get total balance for multiple accounts
 */
export function getTotalBalance(accounts: Account[]): number {
  return accounts.reduce((sum, account) => {
    return sum + Number(account.balance ?? 0);
  }, 0);
}

/**
 * Get accounts statistics
 */
export function getAccountsStatistics(accounts: Account[]): {
  totalBalance: number;
  accountCount: number;
  creditSummary: { current: number; limit: number };
  accountsByType: Record<string, number>;
  accountsByOrganization: Record<string, number>;
} {
  const totalBalance = getTotalBalance(accounts);

  const creditSummary = accounts.reduce(
    (acc, account) => {
      if (isCreditAccount(account.type || '')) {
        acc.current += Number(account.balance ?? 0);
        acc.limit += Number((account as any).credit_limit ?? 0);
      }
      return acc;
    },
    { current: 0, limit: 0 }
  );

  const accountsByType: Record<string, number> = {};
  const accountsByOrganization: Record<string, number> = {};

  accounts.forEach((account) => {
    const type = account.type || 'other';
    accountsByType[type] = (accountsByType[type] || 0) + 1;

    const orgId = account.organization_id || 'unassigned';
    accountsByOrganization[orgId] = (accountsByOrganization[orgId] || 0) + 1;
  });

  return {
    totalBalance,
    accountCount: accounts.length,
    creditSummary,
    accountsByType,
    accountsByOrganization,
  };
}

/**
 * Recalculate account balance from transactions
 */
export async function recalculateAccountBalance(
  accountId: string,
  userId: string
): Promise<number | null> {
  if (!accountId || !userId) return null;

  try {
    const { data, error } = await supabase.rpc('recalculate_account_balance', {
      p_account_id: accountId,
      p_user_id: userId,
    });

    if (error) {
      console.error('Error recalculating account balance:', error);
      return null;
    }

    return data as number;
  } catch (error) {
    console.error('Error recalculating account balance:', error);
    return null;
  }
}

