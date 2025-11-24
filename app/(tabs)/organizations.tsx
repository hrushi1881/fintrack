import React, { useMemo, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { useSettings } from '@/contexts/SettingsContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount } from '@/utils/currency';
import {
  getAllOrganizationsWithAccounts,
  deleteOrganization,
  archiveOrganization,
  type OrganizationWithAccounts,
} from '@/utils/organizations';
import AddOrganizationModal from '../modals/add-organization';
import EditOrganizationModal from '../modals/edit-organization';
import ActionSheet, { ActionSheetItem } from '@/components/ActionSheet';

export default function OrganizationsScreen() {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { globalRefresh } = useRealtimeData();

  const [organizations, setOrganizations] = useState<OrganizationWithAccounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOrganizationModalVisible, setAddOrganizationModalVisible] = useState(false);
  const [editOrganizationModalVisible, setEditOrganizationModalVisible] = useState(false);
  const [selectedOrganization, setSelectedOrganization] = useState<OrganizationWithAccounts | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);

  const loadOrganizations = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const orgs = await getAllOrganizationsWithAccounts(user.id, currency);
      setOrganizations(orgs);
    } catch (error) {
      console.error('Error loading organizations:', error);
      Alert.alert('Error', 'Failed to load organizations. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, currency]);

  useFocusEffect(
    useCallback(() => {
      loadOrganizations();
    }, [loadOrganizations])
  );

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  const handleAddOrganization = () => {
    setAddOrganizationModalVisible(true);
  };

  const handleOrganizationCreated = async () => {
    await globalRefresh();
    await loadOrganizations();
    setAddOrganizationModalVisible(false);
  };

  const handleMoreOptions = (org: OrganizationWithAccounts, event: any) => {
    event?.stopPropagation?.();
    setSelectedOrganization(org);
    setShowActionSheet(true);
  };

  const handleEdit = () => {
    if (!selectedOrganization) return;
    setEditOrganizationModalVisible(true);
    setShowActionSheet(false);
  };

  const handleArchive = async () => {
    if (!selectedOrganization || !user?.id) return;

    Alert.alert(
      'Archive Organization',
      `Archive "${selectedOrganization.name}"? Archived organizations won't appear in your main list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              await archiveOrganization(selectedOrganization.id, user.id);
              await globalRefresh();
              await loadOrganizations();
              setShowActionSheet(false);
              Alert.alert('Success', 'Organization archived successfully!');
            } catch (error: any) {
              console.error('Error archiving organization:', error);
              Alert.alert('Error', error.message || 'Failed to archive organization. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    if (!selectedOrganization || !user?.id) return;

    Alert.alert(
      'Delete Organization',
      `Are you sure you want to delete "${selectedOrganization.name}"? This action cannot be undone.${
        selectedOrganization.accountCount > 0
          ? `\n\nThis organization has ${selectedOrganization.accountCount} account(s). Please move or delete them first.`
          : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteOrganization(selectedOrganization.id, user.id);
              await globalRefresh();
              await loadOrganizations();
              setShowActionSheet(false);
            } catch (error: any) {
              console.error('Error deleting organization:', error);
              Alert.alert('Error', error.message || 'Failed to delete organization. Please try again.');
            }
          },
        },
      ]
    );
  };

  const getActionSheetItems = (org: OrganizationWithAccounts): ActionSheetItem[] => {
    const items: ActionSheetItem[] = [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'create-outline',
        onPress: handleEdit,
      },
    ];

    items.push({
      id: 'separator',
      label: '',
      icon: 'ellipsis-horizontal',
      onPress: () => {},
      separator: true,
      disabled: true,
    });

    if (org.is_active) {
      items.push({
        id: 'archive',
        label: 'Archive',
        icon: 'archive-outline',
        onPress: handleArchive,
      });
    }

    items.push({
      id: 'delete',
      label: 'Delete',
      icon: 'trash-outline',
      onPress: handleDelete,
      destructive: true,
    });

    return items;
  };

  const totalNetWorth = useMemo(() => {
    return organizations.reduce((sum, org) => sum + org.totalBalance, 0);
  }, [organizations]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4F6F3E" />
          <Text style={styles.loadingText}>Loading organizations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={styles.title}>Organizations</Text>
            <TouchableOpacity
              style={styles.headerIconButton}
              onPress={handleAddOrganization}
              accessibilityRole="button"
            >
              <Ionicons name="add-outline" size={22} color="#0E401C" />
            </TouchableOpacity>
          </View>

          <View style={styles.netWorthCard}>
            <Text style={styles.netWorthLabel}>Total Net Worth</Text>
            <Text style={styles.netWorthValue}>{formatCurrency(totalNetWorth)}</Text>
            <Text style={styles.netWorthSubtext}>
              Across {organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}
            </Text>
          </View>

          <View style={styles.organizationsSection}>
            {organizations.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="business-outline" size={48} color="#8BA17B" />
                <Text style={styles.emptyTitle}>No organizations yet</Text>
                <Text style={styles.emptyDescription}>
                  Create an organization to start grouping your accounts by bank, wallet, or institution.
                </Text>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleAddOrganization}
                >
                  <Text style={styles.primaryButtonText}>Add Organization</Text>
                </TouchableOpacity>
              </View>
            ) : (
              organizations.map((org) => {
                const orgColor = org.theme_color || '#4F6F3E';
                return (
                  <TouchableOpacity
                    key={org.id}
                    style={[styles.organizationCard, { borderLeftColor: orgColor }]}
                    onPress={() => router.push({ pathname: '/organization/[id]', params: { id: org.id } })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.organizationHeader}>
                      <View style={[styles.organizationAvatar, { backgroundColor: `${orgColor}20` }]}>
                        {org.logo_url ? (
                          <View style={styles.logoPlaceholder}>
                            <Text style={[styles.logoText, { color: orgColor }]}>
                              {org.name.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                        ) : (
                          <Ionicons name="business-outline" size={22} color={orgColor} />
                        )}
                      </View>
                      <View style={styles.organizationInfo}>
                        <Text style={styles.organizationName}>{org.name}</Text>
                        <Text style={styles.organizationBalance}>{org.formattedBalance}</Text>
                        <Text style={styles.organizationSubtext}>
                          {org.accountCount} {org.accountCount === 1 ? 'account' : 'accounts'}
                          {org.type && ` · ${org.type}`}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.moreButton}
                        onPress={(e) => handleMoreOptions(org, e)}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="ellipsis-horizontal" size={18} color="rgba(0, 0, 0, 0.6)" />
                      </TouchableOpacity>
                    </View>

                    {org.accounts.length > 0 && (
                      <View style={styles.accountsPreview}>
                        {org.accounts.slice(0, 3).map((account: any) => (
                          <View key={account.id} style={styles.accountChip}>
                            <Ionicons
                              name={account.icon || 'card-outline'}
                              size={14}
                              color={orgColor}
                            />
                            <Text style={[styles.accountChipText, { color: orgColor }]}>
                              {account.name}
                            </Text>
                          </View>
                        ))}
                        {org.accounts.length > 3 && (
                          <Text style={styles.moreAccountsText}>
                            +{org.accounts.length - 3} more
                          </Text>
                        )}
                      </View>
                    )}

                    <TouchableOpacity
                      style={styles.addAccountButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        router.push({
                          pathname: '/organization/[id]',
                          params: { id: org.id, action: 'add-account' },
                        });
                      }}
                    >
                      <Ionicons name="add" size={16} color={orgColor} />
                      <Text style={[styles.addAccountText, { color: orgColor }]}>Add Account</Text>
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      </View>

      <AddOrganizationModal
        visible={addOrganizationModalVisible}
        onClose={() => setAddOrganizationModalVisible(false)}
        onSuccess={handleOrganizationCreated}
      />

      <EditOrganizationModal
        visible={editOrganizationModalVisible}
        onClose={() => {
          setEditOrganizationModalVisible(false);
          setSelectedOrganization(null);
        }}
        organization={selectedOrganization}
        onSuccess={async () => {
          await globalRefresh();
          await loadOrganizations();
          setEditOrganizationModalVisible(false);
          setSelectedOrganization(null);
        }}
      />

      <ActionSheet
        visible={showActionSheet}
        onClose={() => {
          setShowActionSheet(false);
          setSelectedOrganization(null);
        }}
        items={selectedOrganization ? getActionSheetItems(selectedOrganization) : []}
        title={selectedOrganization?.name}
      />
    </SafeAreaView>
  );
}

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
    borderLeftWidth: 4,
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
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    fontWeight: 'bold',
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
    fontSize: 16,
    color: '#3B5230',
    marginTop: 2,
    fontFamily: 'Poppins-SemiBold',
  },
  organizationSubtext: {
    fontSize: 12,
    color: '#6B7D5D',
    marginTop: 4,
    fontFamily: 'InstrumentSerif-Regular',
  },
  moreButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  accountsPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EDF1E7',
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAF4',
  },
  accountChipText: {
    fontSize: 11,
    fontFamily: 'Poppins-Medium',
  },
  moreAccountsText: {
    fontSize: 11,
    color: '#6B7D5D',
    fontFamily: 'InstrumentSerif-Regular',
    alignSelf: 'center',
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAF4',
    borderWidth: 1,
    borderColor: '#E5ECD6',
    borderStyle: 'dashed',
  },
  addAccountText: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7D5D',
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

