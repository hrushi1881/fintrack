import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { formatCurrencyAmount } from '@/utils/currency';
import AddAccountModal from '../modals/add-account';
import AddOrganizationModal from '../modals/add-organization';
import { useOrganizations } from '@/contexts/OrganizationsContext';

export default function AccountsScreen() {
  const { accounts, totalBalance, loading, refreshAccounts } = useRealtimeData();
  const { currency } = useSettings();
  const { organizations, organizationsWithAccounts, createOrganization, defaultOrganizationId } = useOrganizations();

  const [addAccountModalVisible, setAddAccountModalVisible] = useState(false);
  const [addOrganizationModalVisible, setAddOrganizationModalVisible] = useState(false);
  const [expandedOrganizations, setExpandedOrganizations] = useState<Record<string, boolean>>({});
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string | undefined>(undefined);

  useFocusEffect(
    React.useCallback(() => {
      refreshAccounts().catch(console.error);
    }, [refreshAccounts])
  );

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const organizationChoices = useMemo(() => {
    if (!organizations) return [];
    const defaults: Array<{ id: string; name: string; currency: string }> = [];
    const defaultOrg = organizations.find((org) => org.id === defaultOrganizationId);
    if (defaultOrg) {
      defaults.push({ id: defaultOrg.id, name: defaultOrg.name, currency: defaultOrg.currency });
    } else if (defaultOrganizationId) {
      defaults.push({
        id: defaultOrganizationId,
        name: 'Unassigned',
        currency: currency,
      });
    }

    const remaining = organizations
      .filter((org) => org.id !== defaultOrganizationId)
      .map((org) => ({ id: org.id, name: org.name, currency: org.currency }));

    return [...defaults, ...remaining];
  }, [organizations, defaultOrganizationId, currency]);

  const organizationViews = useMemo(() => organizationsWithAccounts, [organizationsWithAccounts]);

  const toggleOrganization = (id: string) => {
    setExpandedOrganizations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleAddAccount = (organizationId?: string) => {
    setSelectedOrganizationId(organizationId);
    setAddAccountModalVisible(true);
  };

  const handleAccountCreated = (_account: any, orgId: string | null) => {
    if (orgId) {
      setExpandedOrganizations((prev) => ({ ...prev, [orgId]: true }));
    }
  };

  const handleOrganizationCreated = async (values: any) => {
    try {
      const newOrg = await createOrganization(values);
      setExpandedOrganizations((prev) => ({ ...prev, [newOrg.id]: true }));
      setSelectedOrganizationId(newOrg.id);
      setAddOrganizationModalVisible(false);
      setTimeout(() => {
        setAddAccountModalVisible(true);
      }, 300);
    } catch (error: any) {
      console.error('Unable to create organization', error);
      const message =
        (error && typeof error === 'object' && 'message' in error && error.message) ||
        'Something went wrong while creating the organization.';
      Alert.alert('Could not create organization', String(message));
    }
  };

  const selectedOrganization = useMemo(
    () => (selectedOrganizationId ? organizationViews.find((org) => org.id === selectedOrganizationId) : undefined),
    [selectedOrganizationId, organizationViews]
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
            <Text style={styles.title}>Accounts</Text>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.headerIconButton}
                onPress={() => setAddOrganizationModalVisible(true)}
                accessibilityRole="button"
              >
                <Ionicons name="business-outline" size={20} color="#0E401C" />
              </TouchableOpacity>
          <TouchableOpacity 
                style={styles.headerIconButton}
                onPress={() => handleAddAccount(undefined)}
                accessibilityRole="button"
          >
                <Ionicons name="add-outline" size={22} color="#0E401C" />
          </TouchableOpacity>
            </View>
        </View>

          <View style={styles.netWorthCard}>
            <Text style={styles.netWorthLabel}>Net Worth</Text>
            <Text style={styles.netWorthValue}>{formatCurrency(totalBalance)}</Text>
            <Text style={styles.netWorthSubtext}>Last updated just now</Text>
          </View>

          <View style={styles.organizationsSection}>
            {loading ? (
              <Text style={styles.loadingText}>Loading accounts...</Text>
            ) : organizationViews.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={48} color="#8BA17B" />
                <Text style={styles.emptyTitle}>Nothing tracked yet</Text>
                <Text style={styles.emptyDescription}>
                  Create an organization to start grouping accounts.
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setAddOrganizationModalVisible(true)}
                >
                  <Text style={styles.primaryButtonText}>Add Organization</Text>
                </TouchableOpacity>
              </View>
            ) : (
              organizationViews.map((org) => {
                const isExpanded = expandedOrganizations[org.id] ?? true;
                  return (
                  <View key={org.id} style={styles.organizationCard}>
                    <TouchableOpacity
                      style={styles.organizationHeader}
                      onPress={() => router.push({ pathname: '/organization/[id]', params: { id: org.id } })}
                      activeOpacity={0.85}
                    >
                      <View style={styles.organizationAvatar}>
                        <Ionicons name="business-outline" size={22} color="#0E401C" />
                      </View>
                      <View style={styles.organizationInfo}>
                        <Text style={styles.organizationName}>{org.name}</Text>
                        <Text style={styles.organizationBalance}>{org.formattedBalance}</Text>
                        <Text style={styles.organizationSubtext}>
                          {org.accounts.length} {org.accounts.length === 1 ? 'account' : 'accounts'}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleOrganization(org.id)} style={styles.expandButton}>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={20}
                          color="#0E401C"
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.accountsList}>
                        {org.accounts.map((account) => {
                          const accountType = (account as any).type || 'bank';
                          const isCreditAccount = accountType === 'credit_card' || accountType === 'card' || accountType === 'credit';
                return (
                            <TouchableOpacity
                    key={account.id}
                              style={styles.accountRow}
                              onPress={() => router.push(`/account/${account.id}`)}
                              activeOpacity={0.85}
                            >
                              <View style={styles.accountIconWrapper}>
                                <Ionicons name="card-outline" size={18} color="#0E401C" />
                              </View>
                              <View style={styles.accountInfo}>
                                <Text style={styles.accountName}>{account.name}</Text>
                                <Text style={styles.accountType}>
                                  {String(accountType).replace(/_/g, ' ')}
                                </Text>
                              </View>
                              <View style={styles.accountBalanceColumn}>
                                <Text style={styles.accountBalance}>{formatCurrency(Number(account.balance ?? 0))}</Text>
                                {isCreditAccount && (account as any).credit_limit ? (
                                  <Text style={styles.creditUsage}>
                                    {formatCurrency(Number(account.balance ?? 0))} /
                                    {formatCurrency(Number((account as any).credit_limit ?? 0))}
                                  </Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })}

                        {org.id !== defaultOrganizationId && (
                <TouchableOpacity
                            style={styles.addAccountRow}
                            onPress={() => handleAddAccount(org.id)}
                          >
                            <Ionicons name="add" size={18} color="#4F6F3E" />
                            <Text style={styles.addAccountText}>Add Account</Text>
                </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>

           <AddAccountModal
             visible={addAccountModalVisible}
        onClose={() => setAddAccountModalVisible(false)}
        onSuccess={handleAccountCreated}
        organizationId={selectedOrganizationId}
        organizationName={selectedOrganization?.name}
        organizationOptions={organizationChoices}
        defaultOrganizationId={defaultOrganizationId}
      />

      <AddOrganizationModal
        visible={addOrganizationModalVisible}
        onClose={() => setAddOrganizationModalVisible(false)}
        onSubmit={handleOrganizationCreated}
      />
        </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    color: '#101010',
    fontFamily: 'Archivo Black',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DADFD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  netWorthCard: {
    backgroundColor: '#F3F7ED',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  netWorthLabel: {
    fontSize: 14,
    color: '#6B7D5D',
    fontFamily: 'InstrumentSerif-Regular',
  },
  netWorthValue: {
    fontSize: 32,
    color: '#101010',
    marginTop: 8,
    fontFamily: 'Archivo Black',
  },
  netWorthSubtext: {
    fontSize: 12,
    color: '#6B7D5D',
    marginTop: 6,
    fontFamily: 'Poppins-Regular',
  },
  organizationsSection: {
    gap: 16,
  },
  organizationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#EDF1E7',
    padding: 16,
    shadowColor: '#1A331F',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  organizationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  organizationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E7EDDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  organizationInfo: {
    flex: 1,
  },
  organizationName: {
    fontSize: 16,
    color: '#101010',
    fontFamily: 'Poppins-SemiBold',
  },
  organizationBalance: {
    fontSize: 14,
    color: '#3B5230',
    marginTop: 2,
    fontFamily: 'Poppins-Medium',
  },
  organizationSubtext: {
    fontSize: 12,
    color: '#6B7D5D',
    fontFamily: 'InstrumentSerif-Regular',
  },
  expandButton: {
    padding: 8,
  },
  accountsList: {
    marginTop: 16,
    gap: 12,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAF4',
    borderRadius: 16,
  },
  accountIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E7EDDD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 15,
    color: '#101010',
    fontFamily: 'Poppins-Medium',
  },
  accountType: {
    fontSize: 12,
    color: '#6B7D5D',
    fontFamily: 'InstrumentSerif-Regular',
  },
  accountBalanceColumn: {
    alignItems: 'flex-end',
    gap: 4,
  },
  accountBalance: {
    fontSize: 14,
    color: '#101010',
    fontFamily: 'Poppins-SemiBold',
  },
  creditUsage: {
    fontSize: 11,
    color: '#6B7D5D',
    fontFamily: 'InstrumentSerif-Regular',
  },
  addAccountRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  addAccountText: {
    fontSize: 13,
    color: '#4F6F3E',
    fontFamily: 'Poppins-SemiBold',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7D5D',
    textAlign: 'center',
    paddingVertical: 40,
    fontFamily: 'Poppins-Regular',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAF4',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E7EDDD',
  },
  emptyTitle: {
    fontSize: 16,
    color: '#101010',
    fontFamily: 'Poppins-SemiBold',
  },
  emptyDescription: {
    fontSize: 13,
    color: '#6B7D5D',
    textAlign: 'center',
    paddingHorizontal: 32,
    fontFamily: 'InstrumentSerif-Regular',
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#4F6F3E',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
  },
});
