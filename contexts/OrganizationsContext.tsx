import React, { createContext, useCallback, useContext, useMemo } from 'react';
 import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import {
  createOrganization as createOrgUtil,
  type OrganizationWithAccounts,
  type CreateOrganizationData,
} from '@/utils/organizations';
import { assignAccountToOrganization as assignAccountToOrgUtil } from '@/utils/accounts';
import type { Account, Organization } from '@/types';

type OrganizationFormValues = {
  name: string;
  currency: string;
  logoUrl?: string;
  themeColor?: string;
};

// OrganizationWithAccounts is exported from utils/organizations.ts
// Re-exporting here for backwards compatibility
export type { OrganizationWithAccounts } from '@/utils/organizations';

interface OrganizationsContextValue {
  organizations: Organization[];
  organizationsWithAccounts: OrganizationWithAccounts[];
  defaultOrganizationId: string;
  createOrganization: (values: OrganizationFormValues) => Promise<Organization>;
  assignAccountToOrganization: (accountId: string, organizationId: string | null) => Promise<void>;
  getOrganizationById: (id: string) => OrganizationWithAccounts | undefined;
}

const OrganizationsContext = createContext<OrganizationsContextValue | undefined>(undefined);

const DEFAULT_ORGANIZATION_ID = 'unassigned';

export const OrganizationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { currency: userCurrency } = useSettings();
  const {
    organizations: dbOrganizations,
    accounts,
    refreshAccounts,
    refreshOrganizations,
    globalRefresh,
  } = useRealtimeData();

  // Get all organizations with accounts - computed from existing data
  const organizationsWithAccounts = useMemo<OrganizationWithAccounts[]>(() => {
    if (!user?.id || !dbOrganizations) return [];

    const map = new Map<string, OrganizationWithAccounts>();

    // Add real organizations
    (dbOrganizations || []).forEach((org) => {
      if (org.is_active && !org.is_deleted) {
        map.set(org.id, {
          ...org,
          totalBalance: 0,
          accounts: [],
          formattedBalance: formatCurrencyAmount(0, org.currency),
          accountCount: 0,
        });
      }
    });

    // Create "Unassigned" organization for accounts without organization_id
    const fallbackOrg: OrganizationWithAccounts = {
      id: DEFAULT_ORGANIZATION_ID,
      user_id: user?.id || '',
      name: 'Unassigned',
      type: 'custom',
      currency: userCurrency ?? 'USD',
      country: undefined,
      logo_url: undefined,
      theme_color: undefined,
      description: undefined,
      is_active: true,
      is_deleted: false,
      deleted_at: undefined,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      totalBalance: 0,
      accounts: [],
      formattedBalance: formatCurrencyAmount(0, userCurrency ?? 'USD'),
      accountCount: 0,
    };

    // Group accounts by organization
    const activeAccounts = accounts.filter(
      (acc) => acc.is_active
    );

    activeAccounts.forEach((account) => {
      // TypeScript type assertion - organization_id exists on Account but may not be in type definition
      const accountWithOrgId = account as Account & { organization_id?: string | null };
      const orgId = accountWithOrgId.organization_id || DEFAULT_ORGANIZATION_ID;
      const targetOrg =
        map.get(orgId) ||
        (orgId === DEFAULT_ORGANIZATION_ID ? fallbackOrg : undefined);
      if (!targetOrg) return;
      targetOrg.accounts.push(account);
      targetOrg.totalBalance += Number(account.balance ?? 0);
      targetOrg.accountCount = targetOrg.accounts.length;
      targetOrg.formattedBalance = formatCurrencyAmount(
        targetOrg.totalBalance,
        targetOrg.currency || userCurrency || 'USD'
      );
    });

    const result = Array.from(map.values());
    
    // Only include "Unassigned" if it has accounts
    if (fallbackOrg.accounts.length > 0) {
      fallbackOrg.formattedBalance = formatCurrencyAmount(
        fallbackOrg.totalBalance,
        fallbackOrg.currency
      );
      result.push(fallbackOrg);
    }

    // Sort: Unassigned first (if exists), then by name
    return result.sort((a, b) => {
      if (a.id === DEFAULT_ORGANIZATION_ID) return -1;
      if (b.id === DEFAULT_ORGANIZATION_ID) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [accounts, dbOrganizations, userCurrency, user?.id]);

  const createOrganization = useCallback(
    async (values: OrganizationFormValues) => {
      if (!user?.id) {
        throw new Error('You must be signed in to create an organization.');
      }

      const createData: CreateOrganizationData = {
        name: values.name.trim(),
        currency: values.currency || userCurrency || 'USD',
        logo_url: values.logoUrl,
        color_theme: values.themeColor,
      };

      const organization = await createOrgUtil(createData, user.id);
      await globalRefresh();
      return organization;
    },
    [user, userCurrency, globalRefresh]
  );

  const assignAccountToOrganization = useCallback(
    async (accountId: string, organizationId: string | null) => {
      if (!user?.id) {
        throw new Error('You must be signed in to assign accounts.');
      }

      try {
        await assignAccountToOrgUtil(accountId, organizationId, user.id);
        await globalRefresh();
      } catch (error) {
        console.error('Error assigning account to organization', error);
        throw error;
      }
    },
    [user?.id, globalRefresh]
  );

  const getOrganizationById = useCallback(
    (orgId: string) => organizationsWithAccounts.find((org) => org.id === orgId),
    [organizationsWithAccounts]
  );

  const value: OrganizationsContextValue = {
    organizations: dbOrganizations || [],
    organizationsWithAccounts,
    defaultOrganizationId: DEFAULT_ORGANIZATION_ID,
    createOrganization,
    assignAccountToOrganization,
    getOrganizationById,
  };

  return <OrganizationsContext.Provider value={value}>{children}</OrganizationsContext.Provider>;
};

export const useOrganizations = () => {
  const context = useContext(OrganizationsContext);
  if (!context) {
    throw new Error('useOrganizations must be used within an OrganizationsProvider');
  }
  return context;
};
