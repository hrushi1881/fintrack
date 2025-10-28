import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, TextInput, SafeAreaView, StatusBar, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

export default function OnboardingScreen() {
  const params = useLocalSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [onboardingData, setOnboardingData] = useState({
    monthlyIncome: '',
    monthlyExpenses: '',
    financialGoals: [] as string[],
    investmentExperience: '',
    riskTolerance: '',
    notificationPreferences: [] as string[],
  });

  const steps = [
    {
      title: 'Financial Overview',
      subtitle: 'Tell us about your current financial situation',
      icon: 'trending-up',
      color: '#10B981',
    },
    {
      title: 'Financial Goals',
      subtitle: 'What are you working towards?',
      icon: 'flag',
      color: '#3B82F6',
    },
    {
      title: 'Investment Profile',
      subtitle: 'Help us understand your investment style',
      icon: 'analytics',
      color: '#F59E0B',
    },
    {
      title: 'Preferences',
      subtitle: 'Customize your FinTrack experience',
      icon: 'settings',
      color: '#8B5CF6',
    },
  ];

  const financialGoals = [
    { id: 'emergency', label: 'Emergency Fund', icon: 'shield' },
    { id: 'retirement', label: 'Retirement Planning', icon: 'time' },
    { id: 'house', label: 'Buy a House', icon: 'home' },
    { id: 'education', label: 'Education Fund', icon: 'school' },
    { id: 'vacation', label: 'Travel & Vacation', icon: 'airplane' },
    { id: 'debt', label: 'Pay Off Debt', icon: 'card' },
  ];

  const investmentExperience = [
    { id: 'beginner', label: 'Beginner', description: 'New to investing' },
    { id: 'intermediate', label: 'Intermediate', description: 'Some experience' },
    { id: 'advanced', label: 'Advanced', description: 'Experienced investor' },
  ];

  const riskTolerance = [
    { id: 'conservative', label: 'Conservative', description: 'Low risk, stable returns' },
    { id: 'moderate', label: 'Moderate', description: 'Balanced risk and return' },
    { id: 'aggressive', label: 'Aggressive', description: 'High risk, high potential returns' },
  ];

  const notificationTypes = [
    { id: 'transactions', label: 'Transaction Alerts', icon: 'swap-horizontal' },
    { id: 'budgets', label: 'Budget Updates', icon: 'pie-chart' },
    { id: 'goals', label: 'Goal Progress', icon: 'flag' },
    { id: 'bills', label: 'Bill Reminders', icon: 'receipt' },
    { id: 'market', label: 'Market Updates', icon: 'trending-up' },
    { id: 'security', label: 'Security Alerts', icon: 'shield' },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    // Here you would typically save the onboarding data
    console.log('Onboarding completed with data:', {
      userInfo: params,
      onboardingData,
    });
    
    Alert.alert(
      'Welcome to FinTrack!',
      'Your account has been set up successfully. Let\'s start managing your finances!',
      [
        {
          text: 'Get Started',
          onPress: () => router.replace('/(tabs)'),
        },
      ]
    );
  };

  const toggleArrayItem = (array: string[], item: string) => {
    if (array.includes(item)) {
      return array.filter(i => i !== item);
    } else {
      return [...array, item];
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Monthly Income</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="trending-up" size={20} color="#10B981" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your monthly income"
                  placeholderTextColor="#9CA3AF"
                  value={onboardingData.monthlyIncome}
                  onChangeText={(value) => setOnboardingData(prev => ({ ...prev, monthlyIncome: value }))}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Monthly Expenses</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="trending-down" size={20} color="#EF4444" style={styles.inputIcon} />
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter your monthly expenses"
                  placeholderTextColor="#9CA3AF"
                  value={onboardingData.monthlyExpenses}
                  onChangeText={(value) => setOnboardingData(prev => ({ ...prev, monthlyExpenses: value }))}
                  keyboardType="numeric"
                />
              </View>
            </View>
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>Select your financial goals (you can choose multiple):</Text>
            <View style={styles.goalsGrid}>
              {financialGoals.map((goal) => (
                <TouchableOpacity
                  key={goal.id}
                  style={[
                    styles.goalCard,
                    onboardingData.financialGoals.includes(goal.id) && styles.goalCardSelected,
                  ]}
                  onPress={() => setOnboardingData(prev => ({
                    ...prev,
                    financialGoals: toggleArrayItem(prev.financialGoals, goal.id),
                  }))}
                >
                  <Ionicons 
                    name={goal.icon as any} 
                    size={24} 
                    color={onboardingData.financialGoals.includes(goal.id) ? '#10B981' : '#9CA3AF'} 
                  />
                  <Text style={[
                    styles.goalLabel,
                    onboardingData.financialGoals.includes(goal.id) && styles.goalLabelSelected,
                  ]}>
                    {goal.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Investment Experience</Text>
              {investmentExperience.map((exp) => (
                <TouchableOpacity
                  key={exp.id}
                  style={[
                    styles.optionCard,
                    onboardingData.investmentExperience === exp.id && styles.optionCardSelected,
                  ]}
                  onPress={() => setOnboardingData(prev => ({ ...prev, investmentExperience: exp.id }))}
                >
                  <Text style={[
                    styles.optionLabel,
                    onboardingData.investmentExperience === exp.id && styles.optionLabelSelected,
                  ]}>
                    {exp.label}
                  </Text>
                  <Text style={styles.optionDescription}>{exp.description}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sectionContainer}>
              <Text style={styles.sectionTitle}>Risk Tolerance</Text>
              {riskTolerance.map((risk) => (
                <TouchableOpacity
                  key={risk.id}
                  style={[
                    styles.optionCard,
                    onboardingData.riskTolerance === risk.id && styles.optionCardSelected,
                  ]}
                  onPress={() => setOnboardingData(prev => ({ ...prev, riskTolerance: risk.id }))}
                >
                  <Text style={[
                    styles.optionLabel,
                    onboardingData.riskTolerance === risk.id && styles.optionLabelSelected,
                  ]}>
                    {risk.label}
                  </Text>
                  <Text style={styles.optionDescription}>{risk.description}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>Choose your notification preferences:</Text>
            <View style={styles.notificationsGrid}>
              {notificationTypes.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  style={[
                    styles.notificationCard,
                    onboardingData.notificationPreferences.includes(notification.id) && styles.notificationCardSelected,
                  ]}
                  onPress={() => setOnboardingData(prev => ({
                    ...prev,
                    notificationPreferences: toggleArrayItem(prev.notificationPreferences, notification.id),
                  }))}
                >
                  <Ionicons 
                    name={notification.icon as any} 
                    size={20} 
                    color={onboardingData.notificationPreferences.includes(notification.id) ? '#10B981' : '#9CA3AF'} 
                  />
                  <Text style={[
                    styles.notificationLabel,
                    onboardingData.notificationPreferences.includes(notification.id) && styles.notificationLabelSelected,
                  ]}>
                    {notification.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#99D795" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${((currentStep + 1) / steps.length) * 100}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {currentStep + 1} of {steps.length}
              </Text>
            </View>
          </View>

          {/* Step Content */}
          <View style={styles.content}>
            <View style={styles.stepHeader}>
              <View style={[styles.stepIcon, { backgroundColor: steps[currentStep].color + '20' }]}>
                <Ionicons 
                  name={steps[currentStep].icon as any} 
                  size={32} 
                  color={steps[currentStep].color} 
                />
              </View>
              <Text style={styles.stepTitle}>{steps[currentStep].title}</Text>
              <Text style={styles.stepSubtitle}>{steps[currentStep].subtitle}</Text>
            </View>

            {renderStepContent()}
          </View>

          {/* Navigation */}
          <View style={styles.navigation}>
            <TouchableOpacity 
              style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
              onPress={handleBack}
              disabled={currentStep === 0}
            >
              <Ionicons name="arrow-back" size={20} color="white" />
              <Text style={styles.navButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.navButton}
              onPress={handleNext}
            >
              <Text style={styles.navButtonText}>
                {currentStep === steps.length - 1 ? 'Complete' : 'Next'}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
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
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
    paddingVertical: 20,
  },
  stepHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  stepIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },
  stepContent: {
    marginBottom: 40,
  },
  stepDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  inputIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: 'white',
  },
  goalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  goalCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  goalCardSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  goalLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
  },
  goalLabelSelected: {
    color: '#10B981',
    fontWeight: '600',
  },
  sectionContainer: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  optionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  optionCardSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 4,
  },
  optionLabelSelected: {
    color: '#10B981',
  },
  optionDescription: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  notificationsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  notificationCard: {
    width: '48%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  notificationCardSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
  },
  notificationLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 8,
    textAlign: 'center',
  },
  notificationLabelSelected: {
    color: '#10B981',
    fontWeight: '600',
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginHorizontal: 8,
  },
});
