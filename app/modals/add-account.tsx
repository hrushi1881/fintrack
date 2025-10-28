import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  SafeAreaView,
  Alert,
  Modal,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBackgroundMode } from '@/contexts/BackgroundModeContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import { formatCurrencyAmount } from '@/utils/currency';
import GlassmorphCard from '@/components/GlassmorphCard';
import iOSGradientBackground from '@/components/iOSGradientBackground';
import { theme, BACKGROUND_MODES } from '@/theme';

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface AccountFormData {
  name: string;
  type: 'bank' | 'card' | 'wallet' | 'cash';
  balance: string;
  description: string;
  color: string;
  icon: string;
  includeInTotals: boolean;
}

const ACCOUNT_TYPES = [
  { id: 'bank', label: 'Bank', icon: 'business' as const, color: '#3B82F6' },
  { id: 'card', label: 'Card', icon: 'card' as const, color: '#10B981' },
  { id: 'wallet', label: 'UPI Wallet', icon: 'wallet' as const, color: '#8B5CF6' },
  { id: 'cash', label: 'Cash', icon: 'cash' as const, color: '#F59E0B' },
];

const ACCOUNT_COLORS = [
  '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4', '#84CC16', '#F97316'
];

const ACCOUNT_ICONS = [
  'business', 'card', 'wallet', 'cash', 'home', 'car', 'airplane', 'gift'
];

export default function AddAccountModal({ visible, onClose, onSuccess }: AddAccountModalProps) {
  const { user } = useAuth();
  const { backgroundMode } = useBackgroundMode();
  const { globalRefresh } = useRealtimeData();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<AccountFormData>({
    name: '',
    type: 'bank',
    balance: '',
    description: '',
    color: '#3B82F6',
    icon: 'business',
    includeInTotals: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<AccountFormData>>({});

  const validateForm = () => {
    const newErrors: Partial<AccountFormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (formData.balance && isNaN(parseFloat(formData.balance))) {
      newErrors.balance = 'Please enter a valid number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    console.log('handleNext called, currentStep:', currentStep);
    console.log('formData:', formData);
    
    if (currentStep === 2) {
      if (!formData.name.trim()) {
        console.log('Name validation failed');
        setErrors({ name: 'Account name is required' });
        return;
      }
      setErrors({});
    }
    
    if (currentStep < 4) {
      console.log('Moving to step:', currentStep + 1);
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleCreateAccount = async () => {
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      const balance = parseFloat(formData.balance) || 0;
      
      // Create account in Supabase
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .insert({
          user_id: user?.id,
          name: formData.name.trim(),
          type: formData.type,
          balance: balance,
          description: formData.description.trim(),
          color: formData.color,
          icon: formData.icon,
          include_in_totals: formData.includeInTotals,
          is_active: true,
        })
        .select()
        .single();

      if (accountError) {
        throw accountError;
      }

      // Create initial balance transaction
      if (balance > 0) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .insert({
            account_id: accountData.id,
            user_id: user?.id,
            amount: balance,
            type: 'income',
            category: 'initial_balance',
            description: 'Initial Balance',
            date: new Date().toISOString(),
          });

        if (transactionError) {
          console.error('Error creating initial transaction:', transactionError);
        }
      }

      // Global refresh to update all data
      await globalRefresh();

      Alert.alert('Success', 'Account created successfully!', [
        { text: 'OK', onPress: () => {
          onSuccess?.(); // Call success callback for immediate UI update
          onClose();
          setCurrentStep(1);
          setFormData({
            name: '',
            type: 'bank',
            balance: '',
            description: '',
            color: '#3B82F6',
            icon: 'business',
            includeInTotals: true,
          });
          setErrors({});
        }}
      ]);

    } catch (error) {
      console.error('Error creating account:', error);
      Alert.alert('Error', 'Failed to create account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (value: string) => {
    const number = parseFloat(value);
    if (isNaN(number)) return value;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(number);
  };

  const renderStep1 = () => {
    console.log('Rendering Step 1');
    return (
      <GlassmorphCard style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Choose Account Type</Text>
        <Text style={styles.stepDescription}>Select the type of account you want to create</Text>
      
      <View style={styles.typeGrid}>
        {ACCOUNT_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={[
              styles.typeCard,
              formData.type === type.id && styles.typeCardSelected
            ]}
            onPress={() => setFormData({ ...formData, type: type.id as any, icon: type.icon })}
          >
            <View style={[styles.typeIcon, { backgroundColor: type.color }]}>
              <Ionicons name={type.icon} size={24} color="white" />
            </View>
            <Text style={styles.typeLabel}>{type.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </GlassmorphCard>
    );
  };

  const renderStep2 = () => (
    <GlassmorphCard style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Account Details</Text>
      <Text style={styles.stepDescription}>Enter the basic information for your account</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Account Name</Text>
        <TextInput
          style={[styles.input, errors.name && styles.inputError]}
          value={formData.name}
          onChangeText={(text) => setFormData({ ...formData, name: text })}
          placeholder="e.g., HDFC Bank, Axis Card, Paytm Wallet"
          placeholderTextColor="rgba(255,255,255,0.7)"
        />
        {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Starting Balance</Text>
        <TextInput
          style={[styles.input, errors.balance && styles.inputError]}
          value={formData.balance}
          onChangeText={(text) => setFormData({ ...formData, balance: text })}
          placeholder="0.00"
          placeholderTextColor="rgba(255,255,255,0.7)"
          keyboardType="numeric"
        />
        {errors.balance && <Text style={styles.errorText}>{errors.balance}</Text>}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Description (Optional)</Text>
        <TextInput
          style={styles.input}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          placeholder="Add a description for this account"
          placeholderTextColor="rgba(255,255,255,0.7)"
          multiline
          numberOfLines={2}
        />
      </View>
    </GlassmorphCard>
  );

  const renderStep3 = () => (
    <GlassmorphCard style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Visual Identity</Text>
      <Text style={styles.stepDescription}>Choose a color and icon for your account</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Color</Text>
        <View style={styles.colorGrid}>
          {ACCOUNT_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                styles.colorOption,
                { backgroundColor: color },
                formData.color === color && styles.colorOptionSelected
              ]}
              onPress={() => setFormData({ ...formData, color })}
            >
              {formData.color === color && (
                <Ionicons name="checkmark" size={16} color="white" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Icon</Text>
        <View style={styles.iconGrid}>
          {ACCOUNT_ICONS.map((icon) => (
            <TouchableOpacity
              key={icon}
              style={[
                styles.iconOption,
                formData.icon === icon && styles.iconOptionSelected
              ]}
              onPress={() => setFormData({ ...formData, icon })}
            >
              <Ionicons 
                name={icon as any} 
                size={20} 
                color={formData.icon === icon ? '#FFFFFF' : '#FFFFFF'} 
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </GlassmorphCard>
  );

  const renderStep4 = () => (
    <GlassmorphCard style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Settings</Text>
      <Text style={styles.stepDescription}>Configure how this account appears in your dashboard</Text>
      
      <View style={styles.settingRow}>
        <View style={styles.settingInfo}>
          <Text style={styles.settingTitle}>Include in Net Worth</Text>
          <Text style={styles.settingDescription}>
            This account balance will be included in your total net worth calculation
          </Text>
        </View>
        <Switch
          value={formData.includeInTotals}
          onValueChange={(value) => setFormData({ ...formData, includeInTotals: value })}
          trackColor={{ false: 'rgba(255,255,255,0.3)', true: '#FF6B35' }}
          thumbColor={formData.includeInTotals ? '#FFFFFF' : '#FFFFFF'}
        />
      </View>

      <GlassmorphCard style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Account Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Name:</Text>
          <Text style={styles.summaryValue}>{formData.name || 'Not set'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Type:</Text>
          <Text style={styles.summaryValue}>
            {ACCOUNT_TYPES.find(t => t.id === formData.type)?.label}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Balance:</Text>
          <Text style={styles.summaryValue}>
            {formData.balance ? formatCurrency(formData.balance) : formatCurrencyAmount(0, 'INR')}
          </Text>
        </View>
      </GlassmorphCard>
    </GlassmorphCard>
  );

  const renderBackground = () => {
    if (backgroundMode === BACKGROUND_MODES.IOS_GRADIENT) {
      return (
        <iOSGradientBackground gradientType="default" animated={true} shimmer={true}>
          {renderContent()}
        </iOSGradientBackground>
      );
    } else {
      return (
        <LinearGradient colors={['#99D795', '#99D795', '#99D795']} style={styles.container}>
          {renderContent()}
        </LinearGradient>
      );
    }
  };

  const renderContent = () => (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Account</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Progress Indicator */}
      <GlassmorphCard style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View 
            style={[
              styles.progressFill, 
              { width: `${(currentStep / 4) * 100}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressText}>Step {currentStep} of 4</Text>
      </GlassmorphCard>

      {/* Content */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {currentStep > 1 && (
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[
            styles.nextButton,
            currentStep === 4 && styles.createButton,
            isLoading && styles.disabledButton
          ]}
          onPress={() => {
            console.log('Button pressed, currentStep:', currentStep);
            if (currentStep === 4) {
              handleCreateAccount();
            } else {
              handleNext();
            }
          }}
          disabled={isLoading}
        >
          <Text style={styles.nextButtonText}>
            {isLoading ? 'Creating...' : currentStep === 4 ? 'Create Account' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      {renderBackground()}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    ...theme.typography.h2,
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  progressContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.6)',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    ...theme.typography.h2,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  stepDescription: {
    ...theme.typography.glassBody,
    marginBottom: 24,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  typeCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  typeCardSelected: {
    borderWidth: 2,
    borderColor: '#FF6B35',
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#99D795',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.4)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#000000',
    fontFamily: 'System',
  },
  inputError: {
    borderColor: '#EF4444',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    marginTop: 4,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: '#000000',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconOptionSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
    lineHeight: 20,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.7)',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
  },
  nextButton: {
    flex: 2,
    backgroundColor: '#FF6B35',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButton: {
    backgroundColor: '#00B37E',
  },
  disabledButton: {
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
