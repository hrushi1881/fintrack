import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import GlassCard from '@/components/GlassCard';

type HubItem = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
};

const HUB_ITEMS: HubItem[] = [
  {
    id: 'goals',
    label: 'Goals',
    description: 'Long-term savings, milestones, and progress.',
    icon: 'flag-outline',
    route: '/(tabs)/goals',
  },
  {
    id: 'liabilities',
    label: 'Liabilities',
    description: 'Loans, EMIs, payoff plans, and interest tracking.',
    icon: 'card-outline',
    route: '/(tabs)/liabilities',
  },
  {
    id: 'bills',
    label: 'Bills',
    description: 'Utilities, rent, and upcoming obligations.',
    icon: 'receipt-outline',
    route: '/(tabs)/bills',
  },
  {
    id: 'recurring',
    label: 'Recurring',
    description: 'Subscriptions, EMIs, and repeating flows.',
    icon: 'repeat-outline',
    route: '/(tabs)/recurring',
  },
  {
    id: 'budgets',
    label: 'Budgets',
    description: 'Planned monthly and annual spending.',
    icon: 'pie-chart-outline',
    route: '/(tabs)/budgets',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Bank accounts, cards, and cash balances.',
    icon: 'wallet-outline',
    route: '/(tabs)/accounts',
  },
  {
    id: 'organizations',
    label: 'Organizations',
    description: 'Personal vs. business spaces and entities.',
    icon: 'business-outline',
    route: '/(tabs)/organizations',
  },
];

const AllHubScreen: React.FC = () => {
  const handleNavigate = (route: string) => {
    router.push(route as any);
  };

  const handleOpenComponentsLab = () => {
    router.push('/components-lab' as any);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>All Controls</Text>
            <TouchableOpacity
              style={styles.labButton}
              onPress={handleOpenComponentsLab}
              accessibilityLabel="Open components lab"
            >
              <Ionicons name="flask-outline" size={18} color="#0E401C" />
              <Text style={styles.labButtonText}>Components Lab</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.headerSubtitle}>
            One place to manage your goals, liabilities, recurring payments, budgets, and more.
          </Text>

          <View style={styles.grid}>
            {HUB_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.9}
                onPress={() => handleNavigate(item.route)}
                style={styles.gridItem}
              >
                <GlassCard padding={18} borderRadius={22} style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.iconBadge}>
                      <Ionicons name={item.icon} size={20} color="#0E401C" />
                    </View>
                    <Text style={styles.cardTitle}>{item.label}</Text>
                  </View>
                  <Text style={styles.cardDescription}>{item.description}</Text>
                </GlassCard>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
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
    paddingBottom: 32,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
    marginBottom: 20,
  },
  labButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F2F5EC',
    borderWidth: 1,
    borderColor: '#D7DECC',
    gap: 6,
  },
  labButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins-SemiBold',
    color: '#0E401C',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
    marginTop: 8,
  },
  gridItem: {
    width: '48%',
  },
  card: {
    minHeight: 120,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#E7EDDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  cardDescription: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
});

export default AllHubScreen;


