import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function LiabilitiesScreen() {
  const [activeTab, setActiveTab] = useState('active');

  const liabilities = [
    {
      id: 1,
      title: 'Credit Card Debt',
      amount: 2500,
      interestRate: 18.5,
      minimumPayment: 75,
      dueDate: '2024-02-15',
      color: '#EF4444',
      icon: 'card',
      type: 'credit_card',
    },
    {
      id: 2,
      title: 'Student Loan',
      amount: 15000,
      interestRate: 4.5,
      minimumPayment: 200,
      dueDate: '2024-02-01',
      color: '#3B82F6',
      icon: 'school',
      type: 'student_loan',
    },
    {
      id: 3,
      title: 'Car Loan',
      amount: 12000,
      interestRate: 6.2,
      minimumPayment: 350,
      dueDate: '2024-02-10',
      color: '#8B5CF6',
      icon: 'car',
      type: 'auto_loan',
    },
    {
      id: 4,
      title: 'Personal Loan',
      amount: 5000,
      interestRate: 12.0,
      minimumPayment: 150,
      dueDate: '2024-02-20',
      color: '#F59E0B',
      icon: 'cash',
      type: 'personal_loan',
    },
  ];

  const paidOffLiabilities = [
    {
      id: 5,
      title: 'Medical Bill',
      amount: 0,
      interestRate: 0,
      minimumPayment: 0,
      dueDate: '2023-12-15',
      color: '#10B981',
      icon: 'medical',
      type: 'medical',
      paidOffDate: '2023-12-10',
    },
  ];

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

  const renderLiabilityCard = (liability: any) => (
    <TouchableOpacity
      key={liability.id}
      style={styles.liabilityCard}
      onPress={() => router.push(`/liability/${liability.id}` as any)}
    >
      <View style={styles.liabilityHeader}>
        <View style={[styles.liabilityIcon, { backgroundColor: liability.color }]}>
          <Ionicons name={liability.icon as any} size={24} color="white" />
        </View>
        <View style={styles.liabilityInfo}>
          <Text style={styles.liabilityTitle}>{liability.title}</Text>
          <Text style={styles.liabilityType}>
            {getLiabilityType(liability.type)}
          </Text>
        </View>
        <View style={styles.liabilityAmount}>
          <Text style={styles.liabilityBalance}>
            {formatCurrency(liability.amount)}
          </Text>
          <Text style={styles.liabilityInterest}>
            {liability.interestRate}% APR
          </Text>
        </View>
      </View>

      <View style={styles.liabilityDetails}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Minimum Payment</Text>
          <Text style={styles.detailValue}>
            {formatCurrency(liability.minimumPayment)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Due Date</Text>
          <Text style={styles.detailValue}>
            {formatDate(liability.dueDate)}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Days Until Due</Text>
          <Text
            style={[
              styles.detailValue,
              {
                color:
                  getDaysUntilDue(liability.dueDate) <= 7
                    ? '#EF4444'
                    : getDaysUntilDue(liability.dueDate) <= 14
                    ? '#F59E0B'
                    : '#10B981',
              },
            ]}
          >
            {getDaysUntilDue(liability.dueDate)} days
          </Text>
        </View>
      </View>

      {liability.paidOffDate && (
        <View style={styles.paidOffBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={styles.paidOffText}>
            Paid off on {formatDate(liability.paidOffDate)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

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
            <View style={styles.headerLeft} />
            <Text style={styles.headerTitle}>Liabilities</Text>
            <TouchableOpacity style={styles.addButton}>
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Tab Selector */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'active' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('active')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'active' && styles.activeTabText,
                ]}
              >
                Active Debts
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === 'paid' && styles.activeTab,
              ]}
              onPress={() => setActiveTab('paid')}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === 'paid' && styles.activeTabText,
                ]}
              >
                Paid Off
              </Text>
            </TouchableOpacity>
          </View>

          {/* Liabilities List */}
          <View style={styles.liabilitiesList}>
            {activeTab === 'active' ? (
              liabilities.map(renderLiabilityCard)
            ) : (
              paidOffLiabilities.map(renderLiabilityCard)
            )}
          </View>

          {/* Add Liability Button */}
          <TouchableOpacity style={styles.addLiabilityButton}>
            <Ionicons name="add-circle" size={24} color="#10B981" />
            <Text style={styles.addLiabilityText}>Add New Liability</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 30,
  },
  headerLeft: {
    width: 40,
    height: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  addButton: {
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
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  activeTabText: {
    color: 'white',
  },
  liabilitiesList: {
    marginBottom: 20,
  },
  liabilityCard: {
    backgroundColor: '#000000',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  liabilityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  liabilityIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  liabilityInfo: {
    flex: 1,
  },
  liabilityTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  liabilityType: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  liabilityAmount: {
    alignItems: 'flex-end',
  },
  liabilityBalance: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  liabilityInterest: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  liabilityDetails: {
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  paidOffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  paidOffText: {
    fontSize: 12,
    color: '#10B981',
    marginLeft: 4,
    fontWeight: '600',
  },
  addLiabilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#10B981',
    borderStyle: 'dashed',
  },
  addLiabilityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
});
