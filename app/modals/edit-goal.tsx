import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { Goal, Account } from '@/types';
import { formatCurrencyAmount } from '@/utils/currency';
import { updateGoal, transferGoalFunds, getGoalAccounts, getLinkedAccountsForGoal, linkAccountsToGoal } from '@/utils/goals';
import CalendarDatePicker from '@/components/CalendarDatePicker';

interface EditGoalModalProps {
  visible: boolean;
  goal: Goal | null;
  onClose: () => void;
  onUpdate: () => void;
  initialTab?: 'details' | 'accounts';
}

const GOAL_CATEGORIES = [
  { id: 'emergency', name: 'Emergency Fund', icon: 'shield', color: '#10B981' },
  { id: 'vacation', name: 'Vacation', icon: 'airplane', color: '#3B82F6' },
  { id: 'car', name: 'New Car', icon: 'car', color: '#8B5CF6' },
  { id: 'home', name: 'Home Down Payment', icon: 'home', color: '#F59E0B' },
  { id: 'education', name: 'Education', icon: 'school', color: '#EF4444' },
  { id: 'wedding', name: 'Wedding', icon: 'heart', color: '#EC4899' },
  { id: 'retirement', name: 'Retirement', icon: 'time', color: '#6B7280' },
  { id: 'debt', name: 'Debt Payoff', icon: 'card', color: '#DC2626' },
  { id: 'investment', name: 'Investment', icon: 'trending-up', color: '#059669' },
  { id: 'business', name: 'Business Startup', icon: 'business', color: '#7C3AED' },
  { id: 'health', name: 'Health & Medical', icon: 'medical', color: '#10B981' },
  { id: 'technology', name: 'Technology', icon: 'laptop', color: '#3B82F6' },
  { id: 'furniture', name: 'Furniture', icon: 'bed', color: '#8B5CF6' },
  { id: 'appliance', name: 'Appliances', icon: 'tv', color: '#F59E0B' },
  { id: 'jewelry', name: 'Jewelry', icon: 'diamond', color: '#EC4899' },
  { id: 'sports', name: 'Sports & Fitness', icon: 'fitness', color: '#10B981' },
  { id: 'hobby', name: 'Hobby & Recreation', icon: 'game-controller', color: '#3B82F6' },
  { id: 'pet', name: 'Pet Care', icon: 'paw', color: '#8B5CF6' },
  { id: 'gift', name: 'Gifts & Celebrations', icon: 'gift', color: '#EC4899' },
  { id: 'travel', name: 'Travel & Adventure', icon: 'map', color: '#059669' },
  { id: 'other', name: 'Other', icon: 'ellipsis-horizontal', color: '#6B7280' },
];

const COLOR_PALETTE = [
  '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
  '#EC4899', '#6B7280', '#DC2626', '#059669', '#7C3AED',
  '#DB2777', '#0891B2', '#CA8A04', '#9333EA', '#F97316'
];

export default function EditGoalModal({
  visible,
  goal,
  onClose,
  onUpdate,
  initialTab = 'details',
}: EditGoalModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { accounts, refreshGoals, globalRefresh } = useRealtimeData();

  const [activeTab, setActiveTab] = useState<'details' | 'accounts'>(initialTab);
  const [loading, setLoading] = useState(false);

  // Goal details form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState('#10B981');
  const [selectedIcon, setSelectedIcon] = useState('flag');
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Account management
  const [goalAccounts, setGoalAccounts] = useState<{ account: Account; balance: number }[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<Account[]>([]);
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>([]);
  const [loadingLinkedAccounts, setLoadingLinkedAccounts] = useState(false);
  const [transferFromAccount, setTransferFromAccount] = useState<string | null>(null);
  const [transferToAccount, setTransferToAccount] = useState<string | null>(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);

  const loadGoalAccounts = async () => {
    if (!goal) return;

    setLoadingAccounts(true);
    try {
      const accounts = await getGoalAccounts(goal.id);
      setGoalAccounts(accounts);
    } catch (error: any) {
      console.error('Error loading goal accounts:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to load goal accounts',
      });
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadLinkedAccounts = async () => {
    if (!goal || !user) return;

    setLoadingLinkedAccounts(true);
    try {
      const linked = await getLinkedAccountsForGoal(goal.id);
      setLinkedAccounts(linked);
      setLinkedAccountIds(linked.map(acc => acc.id));
    } catch (error: any) {
      console.error('Error loading linked accounts:', error);
    } finally {
      setLoadingLinkedAccounts(false);
    }
  };

  // Load goal data when modal opens
  useEffect(() => {
    if (visible && goal) {
      setTitle(goal.title || '');
      setDescription(goal.description || '');
      setTargetAmount(goal.target_amount.toString());
      setTargetDate(goal.target_date || '');
      setSelectedCategory(goal.category || '');
      setSelectedColor(goal.color || '#10B981');
      setSelectedIcon(goal.icon || 'flag');
      setActiveTab(initialTab);
      loadGoalAccounts();
      loadLinkedAccounts();
    }
  }, [visible, goal, initialTab]);

  const handleSaveLinkedAccounts = async () => {
    if (!goal || !user) return;

    try {
      setLoadingLinkedAccounts(true);
      await linkAccountsToGoal(goal.id, linkedAccountIds, user.id);
      
      showNotification({
        type: 'success',
        title: 'Success',
        description: 'Linked accounts updated successfully',
      });

      await loadLinkedAccounts();
      await globalRefresh();
    } catch (error: any) {
      console.error('Error updating linked accounts:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to update linked accounts',
      });
    } finally {
      setLoadingLinkedAccounts(false);
    }
  };

  // Filter accounts for linking (exclude liability and goals_savings, match currency from settings)
  const linkableAccounts = accounts?.filter(
    (account) => 
      account.type !== 'liability' && 
      account.type !== 'goals_savings' &&
      (account.is_active === true || account.is_active === undefined || account.is_active === null) &&
      (!currency || account.currency === currency) // Match currency from settings
  ) || [];

  // Accounts that have goal funds (cannot be removed)
  const accountsWithFunds = new Set(goalAccounts.map(ga => ga.account.id));

  const handleUpdate = async () => {
    if (!goal || !user) return;

    // Validation
    if (!title.trim()) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Goal title is required',
      });
      return;
    }

    if (!targetAmount || parseFloat(targetAmount) <= 0) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Target amount must be greater than 0',
      });
      return;
    }

    setLoading(true);
    try {
      await updateGoal(goal.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        target_amount: parseFloat(targetAmount),
        target_date: targetDate || null,
        category: selectedCategory,
        color: selectedColor,
        icon: selectedIcon,
      });

      showNotification({
        type: 'success',
        title: 'Success',
        description: 'Goal updated successfully',
      });

      await refreshGoals();
      await globalRefresh();
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error updating goal:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to update goal',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTransferFunds = async () => {
    if (!goal || !user || !transferFromAccount || !transferToAccount || !transferAmount) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Please fill in all transfer fields',
      });
      return;
    }

    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) {
      showNotification({
        type: 'error',
        title: 'Validation Error',
        description: 'Transfer amount must be greater than 0',
      });
      return;
    }

    setLoading(true);
    try {
      await transferGoalFunds(
        goal.id,
        transferFromAccount,
        transferToAccount,
        amount,
        user.id,
        `Transfer goal funds between accounts`
      );

      showNotification({
        type: 'success',
        title: 'Success',
        description: 'Goal funds transferred successfully',
      });

      await loadGoalAccounts();
      await refreshGoals();
      await globalRefresh();
      
      // Reset transfer form
      setTransferFromAccount(null);
      setTransferToAccount(null);
      setTransferAmount('');
      setShowTransferModal(false);
    } catch (error: any) {
      console.error('Error transferring goal funds:', error);
      showNotification({
        type: 'error',
        title: 'Error',
        description: error.message || 'Failed to transfer goal funds',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (date: Date) => {
    setTargetDate(date.toISOString().split('T')[0]);
    setShowDatePicker(false);
  };

  // Filter accounts by currency from settings (not goal currency)
  const availableAccounts = accounts.filter(
    account => 
      (!currency || account.currency === currency) && 
      (account.is_active === true || account.is_active === undefined || account.is_active === null)
  );

  // Accounts available for transfer (all accounts with matching currency)
  const accountsForTransfer = availableAccounts.filter(acc => acc.id !== transferFromAccount);

  if (!goal) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Goal</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Tab Selector */}
        <View style={styles.tabSelector}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'details' && styles.activeTab]}
            onPress={() => setActiveTab('details')}
          >
            <Ionicons 
              name={activeTab === 'details' ? 'create' : 'create-outline'} 
              size={20} 
              color={activeTab === 'details' ? '#10B981' : '#6B7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'details' && styles.activeTabText]}>
              Details
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'accounts' && styles.activeTab]}
            onPress={() => setActiveTab('accounts')}
          >
            <Ionicons 
              name={activeTab === 'accounts' ? 'wallet' : 'wallet-outline'} 
              size={20} 
              color={activeTab === 'accounts' ? '#10B981' : '#6B7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'accounts' && styles.activeTabText]}>
              Accounts
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {activeTab === 'details' && (
            <View style={styles.tabContent}>
              {/* Title */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Goal Title</Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Emergency Fund"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Description */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Description (Optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe your goal..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Target Amount */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Target Amount ({currency || goal.currency})</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.amountPrefix}>
                    {currency === 'USD' ? '$' : currency === 'INR' ? '₹' : currency || goal.currency}
                  </Text>
                  <TextInput
                    style={styles.amountInput}
                    value={targetAmount}
                    onChangeText={setTargetAmount}
                    placeholder="0.00"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Target Date */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Target Date (Optional)</Text>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Ionicons name="calendar-outline" size={20} color="#6B7280" />
                  <Text style={styles.dateText}>
                    {targetDate 
                      ? new Date(targetDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                      : 'Select target date'}
                  </Text>
                  {targetDate && (
                    <TouchableOpacity
                      onPress={() => setTargetDate('')}
                      style={styles.clearDateButton}
                    >
                      <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              {/* Category Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Category</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                >
                  {GOAL_CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryChip,
                        selectedCategory === category.id && styles.categoryChipActive,
                        { borderColor: category.color }
                      ]}
                      onPress={() => {
                        setSelectedCategory(category.id);
                        setSelectedIcon(category.icon);
                        setSelectedColor(category.color);
                      }}
                    >
                      <Ionicons 
                        name={category.icon as any} 
                        size={20} 
                        color={selectedCategory === category.id ? category.color : '#6B7280'} 
                      />
                      <Text
                        style={[
                          styles.categoryChipText,
                          selectedCategory === category.id && { color: category.color }
                        ]}
                      >
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Color Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Color</Text>
                <View style={styles.colorGrid}>
                  {COLOR_PALETTE.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedColor === color && styles.colorOptionActive
                      ]}
                      onPress={() => setSelectedColor(color)}
                    >
                      {selectedColor === color && (
                        <Ionicons name="checkmark" size={16} color="white" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {activeTab === 'accounts' && (
            <View style={styles.tabContent}>
              {/* Linked Accounts Management */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Linked Accounts</Text>
                <Text style={styles.sectionSubtitle}>
                  Accounts where goal funds can be stored. Accounts with funds cannot be removed.
                </Text>
                {loadingLinkedAccounts ? (
                  <Text style={styles.emptyText}>Loading linked accounts...</Text>
                ) : linkableAccounts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="information-circle-outline" size={48} color="#D1D5DB" />
                    <Text style={styles.emptyText}>
                      No accounts available for linking.
                    </Text>
                    <Text style={styles.emptySubtext}>
                      Please create an account first.
                    </Text>
                  </View>
                ) : (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
                      {linkableAccounts.map((account) => {
                        const isSelected = linkedAccountIds.includes(account.id);
                        const hasFunds = accountsWithFunds.has(account.id);
                        const cannotRemove = hasFunds && isSelected;
                        
                        return (
                          <TouchableOpacity
                            key={account.id}
                            style={[
                              styles.linkedAccountChip,
                              isSelected && styles.linkedAccountChipSelected,
                              cannotRemove && styles.linkedAccountChipLocked,
                            ]}
                            onPress={() => {
                              if (cannotRemove) {
                                Alert.alert(
                                  'Cannot Remove Account',
                                  'This account has goal funds and cannot be unlinked. Withdraw all funds first.',
                                );
                                return;
                              }
                              
                              // Toggle account selection
                              if (linkedAccountIds.includes(account.id)) {
                                setLinkedAccountIds(linkedAccountIds.filter(id => id !== account.id));
                              } else {
                                setLinkedAccountIds([...linkedAccountIds, account.id]);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            {cannotRemove && (
                              <Ionicons name="lock-closed" size={16} color="#F59E0B" style={styles.lockedIcon} />
                            )}
                            <View style={[styles.accountChipIcon, { backgroundColor: account.color }]}>
                              <Ionicons name={account.icon as any} size={24} color="white" />
                            </View>
                            <View style={styles.accountChipInfo}>
                              <Text style={[styles.accountChipName, isSelected && styles.accountChipNameSelected]}>
                                {account.name}
                              </Text>
                              {hasFunds && (
                                <Text style={styles.accountChipBalance}>
                                  {formatCurrencyAmount(goalAccounts.find(ga => ga.account.id === account.id)?.balance || 0, currency)}
                                </Text>
                              )}
                            </View>
                            <Ionicons
                              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={isSelected ? (cannotRemove ? '#F59E0B' : '#10B981') : '#9CA3AF'}
                            />
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    {linkedAccountIds.length > 0 && (
                      <View style={styles.linkedAccountsInfo}>
                        <Ionicons name="information-circle-outline" size={16} color="#4F6F3E" />
                        <Text style={styles.linkedAccountsText}>
                          {linkedAccountIds.length} account{linkedAccountIds.length !== 1 ? 's' : ''} linked
                          {goalAccounts.length > 0 && ` • ${goalAccounts.length} account${goalAccounts.length !== 1 ? 's' : ''} with funds`}
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={[
                        styles.saveLinkedButton,
                        loadingLinkedAccounts && styles.saveLinkedButtonDisabled
                      ]}
                      onPress={handleSaveLinkedAccounts}
                      disabled={loadingLinkedAccounts}
                    >
                      <Text style={styles.saveLinkedButtonText}>
                        {loadingLinkedAccounts ? 'Saving...' : 'Save Linked Accounts'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>

              {/* Accounts with Goal Funds */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Accounts Holding Goal Funds</Text>
                <Text style={styles.sectionSubtitle}>
                  Accounts that currently have goal funds. You can link these accounts to the goal.
                </Text>
                {loadingAccounts ? (
                  <Text style={styles.emptyText}>Loading accounts...</Text>
                ) : goalAccounts.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="wallet-outline" size={48} color="#D1D5DB" />
                    <Text style={styles.emptyText}>
                      No accounts holding funds for this goal yet.
                    </Text>
                    <Text style={styles.emptySubtext}>
                      Add a contribution to start saving in an account.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.accountList}>
                    {goalAccounts.map(({ account, balance }) => {
                      const isLinked = linkedAccountIds.includes(account.id);
                      const shouldShowAddButton = !isLinked;
                      
                      return (
                        <View key={account.id} style={styles.accountCard}>
                          <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                            <Ionicons name={account.icon as any} size={24} color="white" />
                          </View>
                          <View style={styles.accountInfo}>
                            <View style={styles.accountHeader}>
                              <Text style={styles.accountName}>{account.name}</Text>
                              {isLinked && (
                                <View style={styles.linkedBadge}>
                                  <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                                  <Text style={styles.linkedBadgeText}>Linked</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.accountBalance}>
                              {formatCurrencyAmount(balance, currency || goal.currency)}
                            </Text>
                          </View>
                          <View style={styles.accountActions}>
                            {shouldShowAddButton && (
                              <TouchableOpacity
                                style={styles.addToGoalButton}
                                onPress={async () => {
                                  // Add account to linked accounts
                                  const newLinkedIds = [...linkedAccountIds, account.id];
                                  setLinkedAccountIds(newLinkedIds);
                                  // Auto-save
                                  try {
                                    await linkAccountsToGoal(goal.id, newLinkedIds, user.id);
                                    await loadLinkedAccounts();
                                    await globalRefresh();
                                    showNotification({
                                      type: 'success',
                                      title: 'Success',
                                      description: `${account.name} added to linked accounts`,
                                    });
                                  } catch (error: any) {
                                    // Revert on error
                                    setLinkedAccountIds(linkedAccountIds);
                                    showNotification({
                                      type: 'error',
                                      title: 'Error',
                                      description: error.message || 'Failed to link account',
                                    });
                                  }
                                }}
                              >
                                <Ionicons name="add-circle-outline" size={20} color="#10B981" />
                                <Text style={styles.addToGoalText}>Link</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={styles.transferButton}
                              onPress={() => {
                                setTransferFromAccount(account.id);
                                setShowTransferModal(true);
                              }}
                            >
                              <Ionicons name="swap-horizontal-outline" size={20} color="#10B981" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Transfer Funds Modal */}
              {showTransferModal && transferFromAccount && (
                <View style={styles.transferModal}>
                  <View style={styles.transferModalHeader}>
                    <Text style={styles.transferModalTitle}>Transfer Goal Funds</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowTransferModal(false);
                        setTransferFromAccount(null);
                        setTransferToAccount(null);
                        setTransferAmount('');
                      }}
                    >
                      <Ionicons name="close" size={24} color="#6B7280" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.transferForm}>
                    <View style={styles.formGroup}>
                      <Text style={styles.label}>From Account</Text>
                      <View style={styles.accountSelector}>
                        <Text style={styles.accountSelectorText}>
                          {goalAccounts.find(ga => ga.account.id === transferFromAccount)?.account.name || 'Select account'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>To Account</Text>
                      <ScrollView style={styles.accountList} nestedScrollEnabled>
                        {accountsForTransfer.map((account) => (
                          <TouchableOpacity
                            key={account.id}
                            style={[
                              styles.accountOption,
                              transferToAccount === account.id && styles.accountOptionActive
                            ]}
                            onPress={() => setTransferToAccount(account.id)}
                          >
                            <View style={[styles.accountIcon, { backgroundColor: account.color }]}>
                              <Ionicons name={account.icon as any} size={20} color="white" />
                            </View>
                            <View style={styles.accountInfo}>
                              <Text style={styles.accountName}>{account.name}</Text>
                              <Text style={styles.accountBalance}>
                                {formatCurrencyAmount(account.balance, currency || goal.currency)}
                              </Text>
                            </View>
                            {transferToAccount === account.id && (
                              <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      {accountsForTransfer.length === 0 && (
                        <Text style={styles.emptyText}>
                          No other accounts available for transfer
                        </Text>
                      )}
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={styles.label}>Amount ({currency || goal.currency})</Text>
                      <View style={styles.amountInputContainer}>
                        <Text style={styles.amountPrefix}>
                          {currency === 'USD' ? '$' : currency === 'INR' ? '₹' : currency || goal.currency}
                        </Text>
                        <TextInput
                          style={styles.amountInput}
                          value={transferAmount}
                          onChangeText={setTransferAmount}
                          placeholder="0.00"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                        />
                      </View>
                      {transferFromAccount && (
                        <Text style={styles.helperText}>
                          Available: {formatCurrencyAmount(
                            goalAccounts.find(ga => ga.account.id === transferFromAccount)?.balance || 0,
                            currency || goal.currency
                          )}
                        </Text>
                      )}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.transferButtonLarge,
                        (!transferToAccount || !transferAmount || loading) && styles.transferButtonDisabled
                      ]}
                      onPress={handleTransferFunds}
                      disabled={!transferToAccount || !transferAmount || loading}
                    >
                      <Text style={styles.transferButtonText}>
                        {loading ? 'Transferring...' : 'Transfer Funds'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        {activeTab === 'details' && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleUpdate}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>
                {loading ? 'Saving...' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Date Picker */}
        <CalendarDatePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          onDateSelect={handleDateSelect}
          title="Select Target Date"
          initialDate={targetDate ? new Date(targetDate) : new Date()}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Archivo Black',
    fontWeight: '900',
    color: '#000000',
  },
  headerRight: {
    width: 40,
  },
  tabSelector: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    backgroundColor: '#F9FAFB',
  },
  activeTab: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  tabText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#10B981',
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  tabContent: {
    paddingBottom: 24,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  amountPrefix: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    paddingHorizontal: 16,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 16,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
  },
  clearDateButton: {
    padding: 4,
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
    gap: 6,
    backgroundColor: '#FFFFFF',
  },
  categoryChipActive: {
    backgroundColor: '#ECFDF5',
  },
  categoryChipText: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorOptionActive: {
    borderColor: '#000000',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  accountList: {
    gap: 12,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 12,
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
    gap: 12,
  },
  accountOptionActive: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  accountIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
    marginBottom: 4,
  },
  accountBalance: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
  },
  transferButton: {
    padding: 8,
  },
  transferModal: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  transferModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  transferModalTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#000000',
  },
  transferForm: {
    gap: 16,
  },
  accountSelector: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  accountSelectorText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#000000',
  },
  helperText: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 4,
  },
  transferButtonLarge: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  transferButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  transferButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#6B7280',
    marginBottom: 16,
  },
  accountsScroll: {
    marginTop: 8,
  },
  linkedAccountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minWidth: 140,
    gap: 8,
  },
  linkedAccountChipSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  linkedAccountChipLocked: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  lockedIcon: {
    marginRight: -4,
  },
  accountChipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountChipInfo: {
    flex: 1,
  },
  accountChipName: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#1F3A24',
    marginBottom: 2,
  },
  accountChipNameSelected: {
    color: '#10B981',
    fontWeight: '600',
  },
  accountChipBalance: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#637050',
  },
  linkedAccountsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F7F9F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECD6',
    gap: 8,
  },
  linkedAccountsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#637050',
  },
  saveLinkedButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  saveLinkedButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveLinkedButtonText: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#FFFFFF',
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 4,
  },
  linkedBadgeText: {
    fontSize: 10,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  accountActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addToGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  addToGoalText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    fontWeight: '600',
    color: '#10B981',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  saveButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    fontWeight: '400',
    color: '#FFFFFF',
  },
});

