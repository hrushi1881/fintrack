import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import { useSettings } from '@/contexts/SettingsContext';
import type { Account, Organization } from '@/types';

type OrganizationFormValues = {
  name: string;
  currency: string;
  logoUrl?: string;
  themeColor?: string;
};

export interface OrganizationWithAccounts extends Organization {
  totalBalance: number;
  accounts: Account[];
  formattedBalance: string;
}

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
  } = useRealtimeData();

  const organizationsWithAccounts = useMemo<OrganizationWithAccounts[]>(() => {
    const map = new Map<string, OrganizationWithAccounts>();

    (dbOrganizations || []).forEach((org) => {
      map.set(org.id, {
        ...org,
        totalBalance: 0,
        accounts: [],
        formattedBalance: formatCurrencyAmount(0, org.currency),
      });
    });

    const fallbackOrg: OrganizationWithAccounts = {
      id: DEFAULT_ORGANIZATION_ID,
      user_id: user?.id || '',
      name: 'Unassigned',
      currency: userCurrency ?? 'USD',
      country: undefined,
      logo_url: undefined,
      theme_color: undefined,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
      totalBalance: 0,
      accounts: [],
      formattedBalance: formatCurrencyAmount(0, userCurrency ?? 'USD'),
    };

    accounts.forEach((account) => {
      const orgId = account.organization_id || DEFAULT_ORGANIZATION_ID;
      const targetOrg =
        map.get(orgId) ||
        (orgId === DEFAULT_ORGANIZATION_ID ? fallbackOrg : undefined);
      if (!targetOrg) return;
      targetOrg.accounts.push(account);
      targetOrg.totalBalance += Number(account.balance ?? 0);
      targetOrg.formattedBalance = formatCurrencyAmount(
        targetOrg.totalBalance,
        targetOrg.currency || userCurrency || 'USD'
      );
    });

    const result = Array.from(map.values());
    if (fallbackOrg.accounts.length > 0) {
      fallbackOrg.formattedBalance = formatCurrencyAmount(
        fallbackOrg.totalBalance,
        fallbackOrg.currency
      );
      result.push(fallbackOrg);
    }
    return result;
  }, [accounts, dbOrganizations, userCurrency, user?.id]);

  const createOrganization = useCallback(
    async (values: OrganizationFormValues) => {
      if (!user) {
        throw new Error('You must be signed in to create an organization.');
      }

      const { data, error } = await supabase
        .from('organizations')
        .insert({
          user_id: user.id,
          name: values.name.trim(),
          currency: values.currency || userCurrency || 'USD',
          logo_url: values.logoUrl,
          theme_color: values.themeColor,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating organization', error);
        throw error;
      }

      await refreshOrganizations();
      return data as Organization;
    },
    [user, userCurrency, refreshOrganizations]
  );

  const assignAccountToOrganization = useCallback(
    async (accountId: string, organizationId: string | null) => {
      try {
        await supabase
          .from('accounts')
          .update({ organization_id: organizationId })
          .eq('id', accountId);
        await refreshAccounts();
      } catch (error) {
        console.error('Error assigning account to organization', error);
      }
    },
    [refreshAccounts]
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
