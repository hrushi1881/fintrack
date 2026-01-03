import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { createGoal, CreateGoalData } from '@/utils/goals';
import { formatCurrencyAmount } from '@/utils/currency';
import CategoryPicker from '@/components/CategoryPicker';
import { Category } from '@/types';

interface AddGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const COLOR_PALETTE = [
  '#4F6F3E', '#0E401C', '#8BA17B', '#D7DECC', '#E5ECD6',
  '#F2F5EC', '#F7F9F2', '#FF6B35', '#F59E0B', '#3B82F6',
  '#8B5CF6', '#EC4899', '#059669', '#1E40AF', '#6B7280'
];

const palette = {
  background: '#FFFFFF',
  surface: '#F7F9F2',
  surfaceAlt: '#F2F5EC',
  border: '#E5ECD6',
  borderMuted: '#D7DECC',
  primary: '#4F6F3E',
  primaryStrong: '#0E401C',
  text: '#1F3A24',
  muted: '#637050',
  mutedLight: '#9AA18E',
};

export default function AddGoalModal({ visible, onClose, onSuccess }: AddGoalModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { accounts, globalRefresh } = useRealtimeData();
  
  const [formData, setFormData] = useState<CreateGoalData>({
    title: '',
    description: '',
    target_amount: 0,
    target_date: '',
    category: '',
    color: '#4F6F3E',
    icon: 'flag',
    currency: currency,
  });
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [linkedAccountIds, setLinkedAccountIds] = useState<string[]>([]);

  const handleInputChange = (field: keyof CreateGoalData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCategoryChange = (category: Category | null) => {
    setFormData(prev => ({
      ...prev,
      category: category?.id || '',
      icon: category?.icon || 'flag',
      color: category?.color || '#4F6F3E',
    }));
  };

  const handleColorSelect = (color: string) => {
    setFormData(prev => ({ ...prev, color }));
  };

  const handleDateSelect = (date: Date) => {
    const formattedDate = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    setFormData(prev => ({ ...prev, target_date: formattedDate }));
    setShowDatePicker(false);
  };

  const formatDateDisplay = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Calendar utility functions
  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getMonthName = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else {
        newDate.setMonth(newDate.getMonth() + 1);
      }
      return newDate;
    });
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isSelected = (date: Date) => {
    if (!formData.target_date) return false;
    const selected = new Date(formData.target_date);
    return date.toDateString() === selected.toDateString();
  };

  const isPastDate = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  const selectDate = (day: number) => {
    const newDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
    handleDateSelect(newDate);
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a goal title');
      return false;
    }
    if (formData.target_amount <= 0) {
      Alert.alert('Error', 'Please enter a valid target amount');
      return false;
    }
    if (!formData.category) {
      Alert.alert('Error', 'Please select a category');
      return false;
    }
    return true;
  };

  // Filter accounts for linking (exclude liability and goals_savings, match currency from settings)
  const linkableAccounts = accounts || [];

  const handleSubmit = async () => {
    if (!user || !validateForm()) return;

    setLoading(true);
    try {
      const goalDataWithAccounts: CreateGoalData = {
        ...formData,
        linked_account_ids: linkedAccountIds,
      };
      const goal = await createGoal(user.id, goalDataWithAccounts);
      
      showNotification({
        type: 'success',
        title: 'Goal Created',
        description: `"${goal.title}" is ready to start saving!`,
      });

      // Global refresh to update all data
      await globalRefresh();

      onSuccess?.();
      
      // Reset form but keep modal open
      setFormData({
        title: '',
        description: '',
        target_amount: 0,
        target_date: '',
        category: '',
        color: '#4F6F3E',
        icon: 'flag',
        currency: currency,
      });
      setLinkedAccountIds([]);
      
      // Modal stays open - user can add another goal
    } catch (error) {
      console.error('Error creating goal:', error);
      Alert.alert('Error', 'Failed to create goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return formatCurrencyAmount(amount, currency);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Create Goal</Text>
              <TouchableOpacity 
                style={[styles.createButton, loading && styles.createButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.createText}>Create</Text>
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={styles.form}>
              {/* Title */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Goal title</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.title}
                  onChangeText={(value) => handleInputChange('title', value)}
                  placeholder="e.g., Emergency Fund"
                  placeholderTextColor="#9AA18E"
                />
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.multilineInput]}
                  value={formData.description}
                  onChangeText={(value) => handleInputChange('description', value)}
                  placeholder="Describe your goal..."
                  placeholderTextColor="#9AA18E"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Target Amount */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target amount</Text>
                <View style={styles.amountInputContainer}>
                  <Text style={styles.currencySymbol}>
                    {formatCurrencyAmount(0, currency).charAt(0)}
                  </Text>
                  <TextInput
                    style={styles.amountInput}
                    value={formData.target_amount > 0 ? formData.target_amount.toString() : ''}
                    onChangeText={(value) => {
                      const numValue = parseFloat(value) || 0;
                      handleInputChange('target_amount', numValue);
                    }}
                    placeholder="0"
                    placeholderTextColor="#9AA18E"
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.amountPreview}>
                  {formData.target_amount > 0 && formatCurrency(formData.target_amount)}
                </Text>
              </View>

              {/* Target Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target date (optional)</Text>
                <TouchableOpacity
                  style={styles.dateInput}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Text style={[
                    styles.dateInputText,
                    !formData.target_date && styles.dateInputPlaceholder
                  ]}>
                    {formData.target_date ? formatDateDisplay(formData.target_date) : 'Select target date'}
                  </Text>
                  <Ionicons name="calendar" size={20} color="#637050" />
                </TouchableOpacity>
                {formData.target_date && (
                  <TouchableOpacity
                    style={styles.clearDateButton}
                    onPress={() => handleInputChange('target_date', '')}
                  >
                    <Ionicons name="close-circle" size={16} color="#A33A3A" />
                    <Text style={styles.clearDateText}>Clear date</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Category Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category</Text>
                <CategoryPicker
                  activityType="goal"
                  selectedCategoryId={formData.category}
                  onCategorySelect={handleCategoryChange}
                  placeholder="Select a goal category"
                />
                <Text style={styles.helperText}>
                  Use the new category system — pick a main or subcategory. You can change it later.
                </Text>
              </View>

              {/* Color Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Accent colour</Text>
                <View style={styles.colorGrid}>
                  {COLOR_PALETTE.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorItem,
                        { backgroundColor: color },
                        formData.color === color && styles.colorItemSelected
                      ]}
                      onPress={() => handleColorSelect(color)}
                    >
                      {formData.color === color && (
                        <Ionicons name="checkmark" size={16} color="white" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Account Linking */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Link accounts (optional)</Text>
                <Text style={styles.inputSubLabel}>
                  Select where you want to store goal funds now. You can add more when contributing later.
                </Text>
                {linkableAccounts.length > 0 ? (
                  <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.accountsScroll}>
                      {linkableAccounts.map((account) => {
                        const isSelected = linkedAccountIds.includes(account.id);
                        return (
                          <TouchableOpacity
                            key={account.id}
                            style={[
                              styles.accountChip,
                              isSelected && styles.accountChipSelected,
                            ]}
                            onPress={() => {
                              // Toggle account selection
                              if (linkedAccountIds.includes(account.id)) {
                                setLinkedAccountIds(linkedAccountIds.filter(id => id !== account.id));
                              } else {
                                setLinkedAccountIds([...linkedAccountIds, account.id]);
                              }
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={isSelected ? '#FFFFFF' : '#4F6F3E'}
                              style={styles.accountChipIcon}
                            />
                            <View style={styles.accountChipInfo}>
                              <Text style={[styles.accountChipName, isSelected && styles.accountChipNameSelected]}>
                                {account.name}
                              </Text>
                              <Text style={[styles.accountChipBalance, isSelected && styles.accountChipBalanceSelected]}>
                                {formatCurrency(account.balance)}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    {linkedAccountIds.length > 0 && (
                      <View style={styles.linkedAccountsInfo}>
                        <Ionicons name="checkmark-circle" size={16} color={palette.primary} />
                        <Text style={styles.linkedAccountsText}>
                          {linkedAccountIds.length} account{linkedAccountIds.length !== 1 ? 's' : ''} selected
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.noAccountsBanner}>
                    <Ionicons name="information-circle-outline" size={20} color={palette.muted} />
                    <Text style={styles.noAccountsText}>
                      No accounts available. Please create an account first.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Calendar Date Picker Modal */}
      <Modal
        visible={showDatePicker}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.datePickerOverlay}>
          <View style={styles.calendarContainer}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => navigateMonth('prev')}
              >
                <Ionicons name="chevron-back" size={24} color={palette.primary} />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{getMonthName(selectedDate)}</Text>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => navigateMonth('next')}
              >
                <Ionicons name="chevron-forward" size={24} color={palette.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarContent}>
              {/* Day headers */}
              <View style={styles.calendarDaysHeader}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <Text key={day} style={styles.calendarDayHeader}>{day}</Text>
                ))}
              </View>

              {/* Calendar grid */}
              <View style={styles.calendarGrid}>
                {Array.from({ length: getFirstDayOfMonth(selectedDate) }, (_, i) => (
                  <View key={`empty-${i}`} style={styles.calendarDay} />
                ))}
                {Array.from({ length: getDaysInMonth(selectedDate) }, (_, i) => {
                  const day = i + 1;
                  const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
                  const isPast = isPastDate(date);
                  const isTodayDate = isToday(date);
                  const isSelectedDate = isSelected(date);

                  return (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.calendarDay,
                        isTodayDate && styles.calendarToday,
                        isSelectedDate && styles.calendarSelected,
                        isPast && styles.calendarPast,
                      ]}
                      onPress={() => !isPast && selectDate(day)}
                      disabled={isPast}
                    >
                      <Text style={[
                        styles.calendarDayText,
                        isTodayDate && styles.calendarTodayText,
                        isSelectedDate && styles.calendarSelectedText,
                        isPast && styles.calendarPastText,
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Quick date buttons */}
              <View style={styles.quickDateButtons}>
                <TouchableOpacity
                  style={styles.quickDateButton}
                  onPress={() => {
                    const today = new Date();
                    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
                    handleDateSelect(nextMonth);
                  }}
                >
                  <Text style={styles.quickDateButtonText}>Next Month</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickDateButton}
                  onPress={() => {
                    const today = new Date();
                    const nextYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
                    handleDateSelect(nextYear);
                  }}
                >
                  <Text style={styles.quickDateButtonText}>Next Year</Text>
                </TouchableOpacity>
              </View>

              {/* Manual date input */}
              <View style={styles.manualDateInput}>
                <Text style={styles.manualDateLabel}>Or enter date manually:</Text>
                <TextInput
                  style={styles.dateTextInput}
                  value={formData.target_date}
                  onChangeText={(value) => handleInputChange('target_date', value)}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.calendarFooter}>
              <TouchableOpacity
                style={styles.calendarCancelButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.calendarCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.calendarConfirmButton}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.calendarConfirmText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: palette.background,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  cancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 16,
    color: palette.muted,
    fontFamily: 'Poppins-SemiBold',
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: 'Archivo Black',
    color: palette.primaryStrong,
  },
  createButton: {
    backgroundColor: palette.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createButtonDisabled: {
    backgroundColor: palette.borderMuted,
  },
  createText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: palette.text,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.border,
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: palette.border,
  },
  currencySymbol: {
    fontSize: 18,
    color: palette.primaryStrong,
    fontFamily: 'Poppins-SemiBold',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    color: palette.text,
    paddingVertical: 16,
  },
  amountPreview: {
    fontSize: 14,
    color: palette.muted,
    marginTop: 4,
    textAlign: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryItem: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 80,
  },
  categoryItemSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryIconSelected: {
    borderWidth: 2,
    borderColor: 'white',
  },
  categoryText: {
    fontSize: 12,
    color: 'white',
    textAlign: 'center',
    fontWeight: '500',
  },
  categoryTextSelected: {
    color: '#10B981',
    fontWeight: '600',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorItemSelected: {
    borderColor: palette.primary,
  },
  dateInput: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: palette.border,
  },
  dateInputText: {
    fontSize: 16,
    color: palette.text,
    flex: 1,
  },
  dateInputPlaceholder: {
    color: palette.mutedLight,
  },
  clearDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearDateText: {
    fontSize: 12,
    color: '#A33A3A',
    marginLeft: 4,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  datePickerContainer: {
    backgroundColor: palette.background,
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  datePickerTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: palette.text,
  },
  datePickerCloseButton: {
    padding: 4,
  },
  datePickerContent: {
    alignItems: 'center',
  },
  datePickerDescription: {
    fontSize: 14,
    color: palette.muted,
    textAlign: 'center',
    marginBottom: 20,
  },
  datePickerButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  datePickerButton: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
  },
  datePickerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  datePickerNote: {
    fontSize: 12,
    color: palette.muted,
    textAlign: 'center',
    marginBottom: 12,
  },
  dateTextInput: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: palette.text,
    borderWidth: 1,
    borderColor: palette.border,
    width: '100%',
    textAlign: 'center',
  },
  calendarContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  calendarNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: palette.surfaceAlt,
  },
  calendarTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: palette.text,
  },
  calendarContent: {
    flex: 1,
  },
  calendarDaysHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  calendarDayHeader: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: palette.muted,
    textAlign: 'center',
    width: 40,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  calendarDay: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 8,
  },
  calendarToday: {
    backgroundColor: palette.surfaceAlt,
  },
  calendarSelected: {
    backgroundColor: palette.primary,
  },
  calendarPast: {
    opacity: 0.35,
  },
  calendarDayText: {
    fontSize: 16,
    color: palette.text,
    fontFamily: 'Poppins-SemiBold',
  },
  calendarTodayText: {
    color: palette.primaryStrong,
    fontFamily: 'Poppins-SemiBold',
  },
  calendarSelectedText: {
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  calendarPastText: {
    color: palette.mutedLight,
  },
  quickDateButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  quickDateButton: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  quickDateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  manualDateInput: {
    marginBottom: 20,
  },
  manualDateLabel: {
    fontSize: 14,
    color: palette.muted,
    marginBottom: 8,
    textAlign: 'center',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  calendarCancelButton: {
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flex: 1,
    marginRight: 8,
  },
  calendarCancelText: {
    color: palette.text,
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  calendarConfirmButton: {
    backgroundColor: palette.primary,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flex: 1,
    marginLeft: 8,
  },
  calendarConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
  },
  accountsScroll: {
    marginTop: 8,
  },
  accountChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: palette.surfaceAlt,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginRight: 12,
    borderWidth: 2,
    borderColor: palette.border,
    minWidth: 120,
  },
  accountChipSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  accountChipIcon: {
    marginRight: 8,
  },
  accountChipInfo: {
    flex: 1,
  },
  accountChipName: {
    fontSize: 14,
    color: palette.text,
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 2,
  },
  accountChipNameSelected: {
    color: '#FFFFFF',
  },
  accountChipBalance: {
    fontSize: 12,
    color: palette.muted,
  },
  accountChipBalanceSelected: {
    color: '#FFFFFF',
  },
  linkedAccountsInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
  },
  linkedAccountsText: {
    fontSize: 14,
    color: palette.text,
    fontFamily: 'Poppins-SemiBold',
    marginLeft: 8,
  },
  noAccountsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: palette.surfaceAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.border,
    gap: 12,
  },
  noAccountsText: {
    flex: 1,
    fontSize: 14,
    color: palette.muted,
  },
  inputSubLabel: {
    fontSize: 13,
    color: palette.muted,
    marginTop: 4,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: palette.muted,
    marginTop: 6,
  },
});
