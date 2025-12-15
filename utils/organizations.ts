// ============================================================================
// ORGANIZATIONS FUNCTIONALITY
// ============================================================================
// All organization-related business logic, CRUD operations, and utilities

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Organization } from '@/types';
import { formatCurrencyAmount, DEFAULT_CURRENCY } from '@/utils/currency';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateOrganizationData {
  name: string;
  type?: 'bank' | 'wallet' | 'investment' | 'cash' | 'custom';
  logo_url?: string;
  color_theme?: string; // Maps to theme_color in database
  description?: string;
  currency?: string;
  country?: string;
}

export interface UpdateOrganizationData {
  id: string;
  name?: string;
  type?: 'bank' | 'wallet' | 'investment' | 'cash' | 'custom';
  logo_url?: string;
  color_theme?: string; // Maps to theme_color in database
  description?: string;
  currency?: string;
  country?: string;
}

export interface OrganizationFilters {
  type?: 'bank' | 'wallet' | 'investment' | 'cash' | 'custom';
  is_active?: boolean;
}

export interface OrganizationWithAccounts extends Organization {
  totalBalance: number;
  accounts: any[];
  formattedBalance: string;
  accountCount: number;
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Create a new organization
 */
export async function createOrganization(
  data: CreateOrganizationData,
  userId: string
): Promise<Organization> {
  if (!userId) {
    throw new Error('User ID is required to create an organization');
  }

  if (!data.name || !data.name.trim()) {
    throw new Error('Organization name is required');
  }

  const payload: any = {
    user_id: userId,
    name: data.name.trim(),
    type: data.type || 'custom',
    currency: data.currency || DEFAULT_CURRENCY,
    is_active: true,
  };

  if (data.logo_url) payload.logo_url = data.logo_url;
  if (data.color_theme) payload.theme_color = data.color_theme;
  if (data.description) payload.description = data.description.trim();
  if (data.country) payload.country = data.country;

  const { data: organization, error } = await supabase
    .from('organizations')
    .insert(payload)
    .select('id, user_id, name, type, country, currency, logo_url, theme_color, description, is_active, is_deleted, deleted_at, created_at, updated_at')
    .single();

  if (error) {
    console.error('Error creating organization:', error);
    throw error;
  }

  return organization as Organization;
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(
  organizationId: string,
  userId: string
): Promise<Organization | null> {
  if (!organizationId || !userId) return null;

  const { data, error } = await supabase
    .from('organizations')
    .select('id, user_id, name, type, country, currency, logo_url, theme_color, description, is_active, is_deleted, deleted_at, created_at, updated_at')
    .eq('id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error fetching organization:', error);
    throw error;
  }

  return data as Organization;
}

/**
 * Get all organizations for a user
 */
export async function getAllOrganizations(
  userId: string,
  filters?: OrganizationFilters
): Promise<Organization[]> {
  if (!userId) return [];

  let query = supabase
    .from('organizations')
    .select('id, user_id, name, type, country, currency, logo_url, theme_color, description, is_active, is_deleted, deleted_at, created_at, updated_at')
    .eq('user_id', userId);

  if (filters?.is_active !== undefined) {
    query = query.eq('is_active', filters.is_active);
  } else {
    query = query.eq('is_active', true);
  }

  if (filters?.type) {
    query = query.eq('type', filters.type);
  }

  query = query.order('created_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching organizations:', error);
    throw error;
  }

  return (data || []) as Organization[];
}

/**
 * Get organization with accounts and calculated totals
 */
export async function getOrganizationWithAccounts(
  organizationId: string,
  userId: string,
  currency: string = DEFAULT_CURRENCY
): Promise<OrganizationWithAccounts | null> {
  const organization = await getOrganizationById(organizationId, userId);
  if (!organization) return null;

  // Fetch accounts for this organization
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true);

  if (accountsError) {
    console.error('Error fetching accounts for organization:', accountsError);
    throw accountsError;
  }

  // Calculate total balance
  const totalBalance = (accounts || []).reduce((sum, account) => {
    return sum + Number(account.balance ?? 0);
  }, 0);

  const orgCurrency = organization.currency || currency;

  return {
    ...organization,
    accounts: accounts || [],
    totalBalance,
    formattedBalance: formatCurrencyAmount(totalBalance, orgCurrency),
    accountCount: (accounts || []).length,
  };
}

/**
 * Get all organizations with accounts and calculated totals
 */
export async function getAllOrganizationsWithAccounts(
  userId: string,
  currency: string = DEFAULT_CURRENCY,
  filters?: OrganizationFilters
): Promise<OrganizationWithAccounts[]> {
  const organizations = await getAllOrganizations(userId, filters);

  // Fetch all accounts for these organizations
  const organizationIds = organizations.map((org) => org.id);
  if (organizationIds.length === 0) return [];

  const { data: allAccounts, error: accountsError } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('organization_id', organizationIds);

  if (accountsError) {
    console.error('Error fetching accounts:', accountsError);
    throw accountsError;
  }

  // Group accounts by organization
  const accountsByOrg = new Map<string, any[]>();
  (allAccounts || []).forEach((account) => {
    const orgId = account.organization_id || 'unassigned';
    if (!accountsByOrg.has(orgId)) {
      accountsByOrg.set(orgId, []);
    }
    accountsByOrg.get(orgId)!.push(account);
  });

  // Calculate totals for each organization
  return organizations.map((org) => {
    const accounts = accountsByOrg.get(org.id) || [];
    const totalBalance = accounts.reduce((sum, account) => {
      return sum + Number(account.balance ?? 0);
    }, 0);

    const orgCurrency = org.currency || currency;

    return {
      ...org,
      accounts,
      totalBalance,
      formattedBalance: formatCurrencyAmount(totalBalance, orgCurrency),
      accountCount: accounts.length,
    };
  });
}

/**
 * Update organization
 */
export async function updateOrganization(
  data: UpdateOrganizationData,
  userId: string
): Promise<Organization> {
  if (!data.id || !userId) {
    throw new Error('Organization ID and User ID are required');
  }

  const payload: any = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) payload.name = data.name.trim();
  if (data.type !== undefined) payload.type = data.type;
  if (data.logo_url !== undefined) payload.logo_url = data.logo_url;
  if (data.color_theme !== undefined) payload.theme_color = data.color_theme;
  if (data.description !== undefined) payload.description = data.description?.trim() || null;
  if (data.currency !== undefined) payload.currency = data.currency;
  if (data.country !== undefined) payload.country = data.country;

  const { data: organization, error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', data.id)
    .eq('user_id', userId)
    .select('id, user_id, name, type, country, currency, logo_url, theme_color, description, is_active, is_deleted, deleted_at, created_at, updated_at')
    .single();

  if (error) {
    console.error('Error updating organization:', error);
    throw error;
  }

  return organization as Organization;
}

/**
 * Archive organization (soft delete - only if no accounts)
 */
export async function archiveOrganization(
  organizationId: string,
  userId: string
): Promise<void> {
  if (!organizationId || !userId) {
    throw new Error('Organization ID and User ID are required');
  }

  // Check if organization has active accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .eq('is_deleted', false)
    .limit(1);

  if (accountsError) {
    console.error('Error checking accounts:', accountsError);
    throw accountsError;
  }

  if (accounts && accounts.length > 0) {
    throw new Error(
      'Cannot archive organization with active accounts. Please move or archive accounts first.'
    );
  }

  const { error } = await supabase
    .from('organizations')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error archiving organization:', error);
    throw error;
  }
}

/**
 * Delete organization (hard delete - only if no accounts)
 */
export async function deleteOrganization(
  organizationId: string,
  userId: string
): Promise<void> {
  if (!organizationId || !userId) {
    throw new Error('Organization ID and User ID are required');
  }

  // Check if organization has any accounts
  const { data: accounts, error: accountsError } = await supabase
    .from('accounts')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .limit(1);

  if (accountsError) {
    console.error('Error checking accounts:', accountsError);
    throw accountsError;
  }

  if (accounts && accounts.length > 0) {
    throw new Error(
      'Cannot delete organization with accounts. Please move or delete accounts first.'
    );
  }

  const { error } = await supabase
    .from('organizations')
    .update({
      is_active: false,
      is_deleted: true,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting organization:', error);
    throw error;
  }
}

// ============================================================================
// UTILITIES & HELPERS
// ============================================================================

/**
 * Get organization statistics
 */
export async function getOrganizationStatistics(
  organizationId: string,
  userId: string
): Promise<{
  accountCount: number;
  totalBalance: number;
  creditSummary: { current: number; limit: number };
  accountTypes: Record<string, number>;
}> {
  const orgWithAccounts = await getOrganizationWithAccounts(organizationId, userId);
  if (!orgWithAccounts) {
    return {
      accountCount: 0,
      totalBalance: 0,
      creditSummary: { current: 0, limit: 0 },
      accountTypes: {},
    };
  }

  const creditSummary = orgWithAccounts.accounts.reduce(
    (acc, account: any) => {
      const accountType = String(account.type || '').toLowerCase();
      if (accountType === 'credit_card' || accountType === 'card' || accountType === 'credit') {
        acc.current += Number(account.balance ?? 0);
        acc.limit += Number(account.credit_limit ?? 0);
      }
      return acc;
    },
    { current: 0, limit: 0 }
  );

  const accountTypes: Record<string, number> = {};
  orgWithAccounts.accounts.forEach((account: any) => {
    const type = String(account.type || 'other');
    accountTypes[type] = (accountTypes[type] || 0) + 1;
  });

  return {
    accountCount: orgWithAccounts.accountCount,
    totalBalance: orgWithAccounts.totalBalance,
    creditSummary,
    accountTypes,
  };
}

/**
 * Get suggested organization settings based on name/type
 */
export function getSuggestedOrganizationSettings(
  name: string,
  type?: 'bank' | 'wallet' | 'investment' | 'cash' | 'custom'
): {
  color_theme?: string;
  logo_url?: string;
} {
  const nameLower = name.toLowerCase().trim();

  // Bank color suggestions
  const bankColors: Record<string, string> = {
    hdfc: '#0E4D8B',
    icici: '#FF6B35',
    sbi: '#2E7D32',
    axis: '#E4002B',
    kotak: '#FBBF24',
    citi: '#0066CC',
  };

  // Wallet color suggestions
  const walletColors: Record<string, string> = {
    paytm: '#00BAF2',
    gpay: '#4285F4',
    phonepe: '#5F259F',
    amazon: '#FF9900',
  };

  const suggestions: { color_theme?: string; logo_url?: string } = {};

  // Check bank names
  for (const [bank, color] of Object.entries(bankColors)) {
    if (nameLower.includes(bank)) {
      suggestions.color_theme = color;
      break;
    }
  }

  // Check wallet names
  if (!suggestions.color_theme) {
    for (const [wallet, color] of Object.entries(walletColors)) {
      if (nameLower.includes(wallet)) {
        suggestions.color_theme = color;
        break;
      }
    }
  }

  // Type-based defaults
  if (!suggestions.color_theme) {
    switch (type) {
      case 'bank':
        suggestions.color_theme = '#0E4D8B'; // Default bank blue
        break;
      case 'wallet':
        suggestions.color_theme = '#00BAF2'; // Default wallet cyan
        break;
      case 'investment':
        suggestions.color_theme = '#10B981'; // Default investment green
        break;
      case 'cash':
        suggestions.color_theme = '#F59E0B'; // Default cash orange
        break;
      default:
        suggestions.color_theme = '#4F6F3E'; // Default custom green
    }
  }

  return suggestions;
}

/**
 * Validate organization data
 */
export function validateOrganizationData(data: CreateOrganizationData | UpdateOrganizationData): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if ('name' in data && data.name !== undefined) {
    if (!data.name || !data.name.trim()) {
      errors.push('Organization name is required');
    } else if (data.name.trim().length < 2) {
      errors.push('Organization name must be at least 2 characters');
    } else if (data.name.trim().length > 100) {
      errors.push('Organization name must be less than 100 characters');
    }
  }

  if ('color_theme' in data && data.color_theme) {
    // Validate HEX color
    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!hexPattern.test(data.color_theme)) {
      errors.push('Color theme must be a valid HEX color (e.g., #4F6F3E)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

