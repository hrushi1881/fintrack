import React, { useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useOrganizations } from '@/contexts/OrganizationsContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { formatCurrencyAmount } from '@/utils/currency';
import AddAccountModal from '../modals/add-account';

const OrganizationDetailScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { organizations, organizationsWithAccounts, getOrganizationById, defaultOrganizationId } = useOrganizations();
  const { refreshAccounts } = useRealtimeData();

  const organization = useMemo(
    () => (id ? getOrganizationById(id) : undefined),
    [getOrganizationById, id, organizationsWithAccounts]
  );
  const [addAccountVisible, setAddAccountVisible] = useState(false);

  const creditSummary = useMemo(() => {
    if (!organization) return { current: 0, limit: 0 };
    return organization.accounts.reduce(
      (acc, account: any) => {
        const accountType = String(account.type || '');
        if (accountType === 'credit_card' || accountType === 'card' || accountType === 'credit') {
          acc.current += Number(account.balance ?? 0);
          acc.limit += Number(account.credit_limit ?? 0);
        }
        return acc;
      },
      { current: 0, limit: 0 }
    );
  }, [organization]);

  const handleAddAccount = () => setAddAccountVisible(true);

  const handleAccountCreated = (_account: any, orgId: string | null) => {
    refreshAccounts();
    setAddAccountVisible(false);
    if (orgId && orgId !== organization?.id) {
      router.replace({ pathname: '/organization/[id]', params: { id: orgId } });
    }
  };

  if (!organization) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyState}>
          <Ionicons name="business-outline" size={48} color="#8BA17B" />
          <Text style={styles.emptyTitle}>Organization not found</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formattedBalance = formatCurrencyAmount(organization.totalBalance, organization.currency);

  const organizationOptions = useMemo(() => {
    if (!organizations) return [];
    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      currency: org.currency,
    }));
  }, [organizations]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerBar}>
            <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={20} color="#0E401C" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{organization.name}</Text>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="ellipsis-horizontal" size={20} color="#0E401C" />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>Total Balance</Text>
            <Text style={styles.heroAmount}>{formattedBalance}</Text>
            <View style={styles.heroMetricsRow}>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel}>Accounts</Text>
                <Text style={styles.heroMetricValue}>{organization.accounts.length}</Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel}>Credit Usage</Text>
                <Text style={styles.heroMetricValue}>
                  {creditSummary.limit > 0
                    ? `${formatCurrencyAmount(creditSummary.current, organization.currency)} / ${formatCurrencyAmount(creditSummary.limit, organization.currency)}`
                    : '—'}
                </Text>
              </View>
              <View style={styles.heroMetric}>
                <Text style={styles.heroMetricLabel}>Currency</Text>
                <Text style={styles.heroMetricValue}>{organization.currency}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {organization.id !== defaultOrganizationId && (
              <TouchableOpacity style={[styles.primaryButton, styles.flexOne]} onPress={handleAddAccount}>
                <Ionicons name="add" size={16} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>Add Account</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.secondaryButton}>
              <Ionicons name="stats-chart-outline" size={18} color="#4F6F3E" />
              <Text style={styles.secondaryText}>Analytics</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton}>
              <Ionicons name="create-outline" size={18} color="#4F6F3E" />
              <Text style={styles.secondaryText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Accounts</Text>
            {organization.accounts.map((account: any) => (
              <TouchableOpacity
                key={account.id}
                style={styles.accountRow}
                onPress={() => router.push(`/account/${account.id}`)}
                activeOpacity={0.85}
              >
                <View style={styles.accountIcon}>
                  <Ionicons name="card-outline" size={18} color="#0E401C" />
                </View>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountType}>{String(account.type || '').replace(/_/g, ' ')}</Text>
                </View>
                <View style={styles.accountBalanceBlock}>
                  <Text style={styles.accountBalance}>
                    {formatCurrencyAmount(Number(account.balance ?? 0), organization.currency)}
                  </Text>
                  {String(account.type || '') === 'credit_card' && account.credit_limit ? (
                    <Text style={styles.accountLimit}>
                      {formatCurrencyAmount(Number(account.credit_limit ?? 0), organization.currency)} limit
                    </Text>
                  ) : null}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <View style={styles.placeholderChart}>
              <Text style={styles.placeholderText}>Charts coming soon</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Insights</Text>
            <View style={styles.insightCard}>
              <Ionicons name="information-circle-outline" size={18} color="#4F6F3E" />
              <View style={styles.insightTextContainer}>
                <Text style={styles.insightTitle}>High Checking Balance</Text>
                <Text style={styles.insightSubtitle}>
                  Consider moving some funds into savings to earn more interest.
                </Text>
              </View>
            </View>
            <View style={styles.insightCard}>
              <Ionicons name="warning-outline" size={18} color="#B83228" />
              <View style={styles.insightTextContainer}>
                <Text style={styles.insightTitle}>Unusual Spending</Text>
                <Text style={styles.insightSubtitle}>
                  Review recent transactions in your credit accounts.
                </Text>
              </View>
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </View>

      <AddAccountModal
        visible={addAccountVisible}
        onClose={() => setAddAccountVisible(false)}
        onSuccess={handleAccountCreated}
        organizationId={organization.id === defaultOrganizationId ? undefined : organization.id}
        organizationName={organization.id === defaultOrganizationId ? undefined : organization.name}
        organizationOptions={organizationOptions}
        defaultOrganizationId={defaultOrganizationId}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D7DECC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  heroCard: {
    backgroundColor: '#F7F9F2',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    gap: 18,
  },
  heroLabel: {
    fontSize: 13,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  heroAmount: {
    fontSize: 32,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  heroMetricsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  heroMetric: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  heroMetricLabel: {
    fontSize: 11,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  heroMetricValue: {
    fontSize: 15,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
    marginTop: 4,
  },
  actionsRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F6F3E',
    paddingVertical: 14,
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  flexOne: {
    flex: 1,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7DECC',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  secondaryText: {
    fontSize: 13,
    color: '#4F6F3E',
    fontFamily: 'Poppins-SemiBold',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    padding: 20,
    marginTop: 20,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF3E6',
  },
  accountIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#E7EDDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
    gap: 2,
  },
  accountName: {
    fontSize: 14,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
  },
  accountType: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  accountBalanceBlock: {
    alignItems: 'flex-end',
    gap: 4,
  },
  accountBalance: {
    fontSize: 14,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
  },
  accountLimit: {
    fontSize: 11,
    color: '#6B7D5D',
    fontFamily: 'InstrumentSerif-Regular',
  },
  placeholderChart: {
    height: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    backgroundColor: '#F7F9F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#9AA88B',
    fontFamily: 'InstrumentSerif-Regular',
  },
  insightCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#F7F9F2',
    borderWidth: 1,
    borderColor: '#E5ECD6',
  },
  insightTextContainer: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontSize: 14,
    color: '#1F3A24',
    fontFamily: 'Poppins-SemiBold',
  },
  insightSubtitle: {
    fontSize: 12,
    color: '#637050',
    fontFamily: 'InstrumentSerif-Regular',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#0E401C',
    fontFamily: 'Archivo Black',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4F6F3E',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  primaryButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
});

export default OrganizationDetailScreen;
