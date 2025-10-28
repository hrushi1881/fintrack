import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, TextInput, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

export default function LiabilityDetailScreen() {
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);

  // Mock liability data
  const liability = {
    id: id as string,
    title: 'Credit Card Debt',
    amount: 2500,
    interestRate: 18.5,
    minimumPayment: 75,
    dueDate: '2024-02-15',
    color: '#EF4444',
    icon: 'card',
    type: 'credit_card',
    description: 'High-interest credit card debt from emergency expenses',
    monthlyInterest: 38.54,
    payoffMonths: 42,
    totalInterest: 650,
    payments: [
      { id: 1, amount: 100, date: '2024-01-15', type: 'payment', description: 'Extra payment' },
      { id: 2, amount: 75, date: '2024-01-01', type: 'minimum', description: 'Minimum payment' },
      { id: 3, amount: 150, date: '2023-12-15', type: 'payment', description: 'Bonus payment' },
    ],
    payoffStrategies: [
      { id: 1, name: 'Debt Snowball', description: 'Pay minimums, extra to smallest debt', months: 38, totalInterest: 580 },
      { id: 2, name: 'Debt Avalanche', description: 'Pay minimums, extra to highest interest', months: 35, totalInterest: 520 },
      { id: 3, name: 'Aggressive Payoff', description: 'Pay ₹200/month consistently', months: 28, totalInterest: 420 },
    ],
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getLiabilityType = (type: string) => {
    const types = {
      credit_card: 'Credit Card',
      student_loan: 'Student Loan',
      auto_loan: 'Auto Loan',
      personal_loan: 'Personal Loan',
      medical: 'Medical Bill',
    };
    return types[type as keyof typeof types] || 'Other';
  };

  const handlePayment = () => {
    if (paymentAmount && parseFloat(paymentAmount) > 0) {
      console.log('Making payment:', paymentAmount);
      setShowPaymentModal(false);
      setPaymentAmount('');
    }
  };

  const renderOverview = () => (
    <View style={styles.tabContent}>
      {/* Liability Info Card */}
      <View style={styles.infoCard}>
        <View style={styles.infoHeader}>
          <View style={[styles.liabilityIcon, { backgroundColor: liability.color }]}>
            <Ionicons name={liability.icon as any} size={32} color="white" />
          </View>
          <View style={styles.liabilityInfo}>
            <Text style={styles.liabilityTitle}>{liability.title}</Text>
            <Text style={styles.liabilityType}>{getLiabilityType(liability.type)}</Text>
          </View>
        </View>

        <Text style={styles.liabilityDescription}>{liability.description}</Text>

        <View style={styles.liabilityStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Current Balance</Text>
            <Text style={styles.statValue}>{formatCurrency(liability.amount)}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Interest Rate</Text>
            <Text style={styles.statValue}>{liability.interestRate}% APR</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Minimum Payment</Text>
            <Text style={styles.statValue}>{formatCurrency(liability.minimumPayment)}</Text>
          </View>
        </View>
      </View>

      {/* Payment Timeline */}
      <View style={styles.timelineCard}>
        <Text style={styles.sectionTitle}>Payment Timeline</Text>
        <View style={styles.timelineItem}>
          <View style={styles.timelineIcon}>
            <Ionicons name="calendar" size={20} color="#EF4444" />
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>Due Date</Text>
            <Text style={styles.timelineValue}>
              {formatDate(liability.dueDate)} ({getDaysUntilDue(liability.dueDate)} days)
            </Text>
          </View>
        </View>
        <View style={styles.timelineItem}>
          <View style={styles.timelineIcon}>
            <Ionicons name="calculator" size={20} color="#F59E0B" />
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>Payoff Time</Text>
            <Text style={styles.timelineValue}>{liability.payoffMonths} months</Text>
          </View>
        </View>
        <View style={styles.timelineItem}>
          <View style={styles.timelineIcon}>
            <Ionicons name="trending-up" size={20} color="#3B82F6" />
          </View>
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>Monthly Interest</Text>
            <Text style={styles.timelineValue}>{formatCurrency(liability.monthlyInterest)}</Text>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.actionsCard}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowPaymentModal(true)}
          >
            <Ionicons name="card" size={20} color="white" />
            <Text style={styles.actionButtonText}>Make Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
            onPress={() => setShowCalculator(true)}
          >
            <Ionicons name="calculator" size={20} color="white" />
            <Text style={styles.actionButtonText}>Calculator</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderPayments = () => (
    <View style={styles.tabContent}>
      <View style={styles.addPaymentButton}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowPaymentModal(true)}
        >
          <Ionicons name="add" size={20} color="white" />
          <Text style={styles.addButtonText}>Record Payment</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.paymentsList}>
        {liability.payments.map((payment) => (
          <View key={payment.id} style={styles.paymentCard}>
            <View style={styles.paymentHeader}>
              <View style={styles.paymentIcon}>
                <Ionicons
                  name={payment.type === 'minimum' ? 'card' : 'checkmark-circle'}
                  size={20}
                  color={payment.type === 'minimum' ? '#F59E0B' : '#10B981'}
                />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentDescription}>
                  {payment.description}
                </Text>
                <Text style={styles.paymentDate}>
                  {formatDate(payment.date)}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>
                -{formatCurrency(payment.amount)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderStrategies = () => (
    <View style={styles.tabContent}>
      <View style={styles.strategiesList}>
        {liability.payoffStrategies.map((strategy) => (
          <View key={strategy.id} style={styles.strategyCard}>
            <View style={styles.strategyHeader}>
              <Text style={styles.strategyName}>{strategy.name}</Text>
              <Text style={styles.strategyMonths}>{strategy.months} months</Text>
            </View>
            <Text style={styles.strategyDescription}>{strategy.description}</Text>
            <View style={styles.strategyStats}>
              <View style={styles.strategyStat}>
                <Text style={styles.strategyStatLabel}>Total Interest</Text>
                <Text style={styles.strategyStatValue}>
                  {formatCurrency(strategy.totalInterest)}
                </Text>
              </View>
              <View style={styles.strategyStat}>
                <Text style={styles.strategyStatLabel}>Savings</Text>
                <Text style={[styles.strategyStatValue, { color: '#10B981' }]}>
                  {formatCurrency(liability.totalInterest - strategy.totalInterest)}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.strategyButton}>
              <Text style={styles.strategyButtonText}>Use This Strategy</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={['#99D795', '#99D795', '#99D795']}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scrollView}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Liability Details</Text>
            <TouchableOpacity style={styles.editButton}>
              <Ionicons name="create" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'overview' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('overview')}
            >
              <Ionicons 
                name={activeTab === 'overview' ? 'home' : 'home-outline'} 
                size={20} 
                color={activeTab === 'overview' ? '#EF4444' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'overview' && styles.activeTabText,
                ]}
              >
                Overview
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'payments' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('payments')}
            >
              <Ionicons 
                name={activeTab === 'payments' ? 'card' : 'card-outline'} 
                size={20} 
                color={activeTab === 'payments' ? '#EF4444' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'payments' && styles.activeTabText,
                ]}
              >
                Payments
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'strategies' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('strategies')}
            >
              <Ionicons 
                name={activeTab === 'strategies' ? 'calculator' : 'calculator-outline'} 
                size={20} 
                color={activeTab === 'strategies' ? '#EF4444' : 'rgba(255, 255, 255, 0.7)'} 
              />
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'strategies' && styles.activeTabText,
                ]}
              >
                Strategies
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab Content */}
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'payments' && renderPayments()}
          {activeTab === 'strategies' && renderStrategies()}
        </ScrollView>

        {/* Payment Modal */}
        <Modal
          visible={showPaymentModal}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Make Payment</Text>
                <TouchableOpacity
                  onPress={() => setShowPaymentModal(false)}
                >
                  <Ionicons name="close" size={24} color="white" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalBody}>
                <Text style={styles.inputLabel}>Payment Amount</Text>
                <TextInput
                  style={styles.amountInput}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  placeholder="Enter amount"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={styles.paymentButton}
                  onPress={handlePayment}
                >
                  <Text style={styles.paymentButtonText}>Make Payment</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
    marginLeft: 6,
  },
  activeTabText: {
    color: 'white',
  },
  tabContent: {
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  liabilityIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  liabilityInfo: {
    flex: 1,
  },
  liabilityTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  liabilityType: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  liabilityDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 20,
    lineHeight: 20,
  },
  liabilityStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  timelineCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 16,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  timelineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  timelineValue: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  actionsCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  addPaymentButton: {
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  paymentsList: {
    marginBottom: 20,
  },
  paymentCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    marginBottom: 2,
  },
  paymentDate: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  paymentAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#10B981',
  },
  strategiesList: {
    marginBottom: 20,
  },
  strategyCard: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  strategyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  strategyName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  strategyMonths: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  strategyDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 16,
  },
  strategyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  strategyStat: {
    alignItems: 'center',
  },
  strategyStatLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  strategyStatValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  strategyButton: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  strategyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: 'white',
    marginBottom: 20,
  },
  paymentButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  paymentButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
