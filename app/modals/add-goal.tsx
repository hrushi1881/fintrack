import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useNotification } from '@/contexts/NotificationContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { createGoal, CreateGoalData } from '@/utils/goals';
import CalendarDatePicker from '@/components/CalendarDatePicker';
import { formatCurrencyAmount } from '@/utils/currency';

interface AddGoalModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
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

export default function AddGoalModal({ visible, onClose, onSuccess }: AddGoalModalProps) {
  const { user } = useAuth();
  const { currency } = useSettings();
  const { showNotification } = useNotification();
  const { globalRefresh } = useRealtimeData();
  
  const [formData, setFormData] = useState<CreateGoalData>({
    title: '',
    description: '',
    target_amount: 0,
    target_date: '',
    category: '',
    color: '#10B981',
    icon: 'flag',
    currency: currency,
  });
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const handleInputChange = (field: keyof CreateGoalData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleCategorySelect = (category: typeof GOAL_CATEGORIES[0]) => {
    setFormData(prev => ({
      ...prev,
      category: category.id,
      icon: category.icon,
      color: category.color,
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

  const handleSubmit = async () => {
    if (!user || !validateForm()) return;

    setLoading(true);
    try {
      const goal = await createGoal(user.id, formData);
      
      showNotification({
        type: 'success',
        title: 'Goal Created',
        description: `"${goal.title}" is ready to start saving!`,
      });

      // Global refresh to update all data
      await globalRefresh();

      onSuccess?.();
      onClose();
      
      // Reset form
      setFormData({
        title: '',
        description: '',
        target_amount: 0,
        target_date: '',
        category: '',
        color: '#10B981',
        icon: 'flag',
        currency: currency,
      });
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
      <LinearGradient
        colors={['#99D795', '#99D795', '#99D795']}
        style={styles.container}
      >
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
                <Text style={styles.inputLabel}>Goal Title</Text>
                <TextInput
                  style={styles.textInput}
                  value={formData.title}
                  onChangeText={(value) => handleInputChange('title', value)}
                  placeholder="e.g., Emergency Fund"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description (Optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.multilineInput]}
                  value={formData.description}
                  onChangeText={(value) => handleInputChange('description', value)}
                  placeholder="Describe your goal..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Target Amount */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Amount</Text>
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
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.amountPreview}>
                  {formData.target_amount > 0 && formatCurrency(formData.target_amount)}
                </Text>
              </View>

              {/* Target Date */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Target Date (Optional)</Text>
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
                  <Ionicons name="calendar" size={20} color="#9CA3AF" />
                </TouchableOpacity>
                {formData.target_date && (
                  <TouchableOpacity
                    style={styles.clearDateButton}
                    onPress={() => handleInputChange('target_date', '')}
                  >
                    <Ionicons name="close-circle" size={16} color="#EF4444" />
                    <Text style={styles.clearDateText}>Clear date</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Category Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Category</Text>
                <View style={styles.categoryGrid}>
                  {GOAL_CATEGORIES.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryItem,
                        formData.category === category.id && styles.categoryItemSelected
                      ]}
                      onPress={() => handleCategorySelect(category)}
                    >
                      <View style={[
                        styles.categoryIcon,
                        { backgroundColor: category.color },
                        formData.category === category.id && styles.categoryIconSelected
                      ]}>
                        <Ionicons name={category.icon as any} size={20} color="white" />
                      </View>
                      <Text style={[
                        styles.categoryText,
                        formData.category === category.id && styles.categoryTextSelected
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Color Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Color</Text>
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
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>

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
                <Ionicons name="chevron-back" size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{getMonthName(selectedDate)}</Text>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => navigateMonth('next')}
              >
                <Ionicons name="chevron-forward" size={24} color="white" />
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
  },
  safeArea: {
    flex: 1,
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
    color: 'white',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  createButton: {
    backgroundColor: '#10B981',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#6B7280',
  },
  createText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  currencySymbol: {
    fontSize: 18,
    color: 'white',
    fontWeight: '600',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    color: 'white',
    paddingVertical: 16,
  },
  amountPreview: {
    fontSize: 14,
    color: '#9CA3AF',
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
    borderColor: 'white',
  },
  dateInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  dateInputText: {
    fontSize: 16,
    color: 'white',
    flex: 1,
  },
  dateInputPlaceholder: {
    color: '#9CA3AF',
  },
  clearDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearDateText: {
    fontSize: 12,
    color: '#EF4444',
    marginLeft: 4,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  datePickerContainer: {
    backgroundColor: '#000000',
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
    fontWeight: 'bold',
    color: 'white',
  },
  datePickerCloseButton: {
    padding: 4,
  },
  datePickerContent: {
    alignItems: 'center',
  },
  datePickerDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
  },
  datePickerButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  datePickerNote: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 12,
  },
  dateTextInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    width: '100%',
    textAlign: 'center',
  },
  calendarContainer: {
    backgroundColor: '#000000',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
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
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
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
    backgroundColor: '#10B981',
  },
  calendarSelected: {
    backgroundColor: '#3B82F6',
  },
  calendarPast: {
    opacity: 0.3,
  },
  calendarDayText: {
    fontSize: 16,
    color: 'white',
    fontWeight: '500',
  },
  calendarTodayText: {
    color: 'white',
    fontWeight: 'bold',
  },
  calendarSelectedText: {
    color: 'white',
    fontWeight: 'bold',
  },
  calendarPastText: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  quickDateButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  quickDateButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  quickDateButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  manualDateInput: {
    marginBottom: 20,
  },
  manualDateLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
    textAlign: 'center',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  calendarCancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flex: 1,
    marginRight: 8,
  },
  calendarCancelText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  calendarConfirmButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    flex: 1,
    marginLeft: 8,
  },
  calendarConfirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
