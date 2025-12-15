import React, { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GlassCard from '@/components/GlassCard';
import Button from '@/components/Button';

const ComponentsLabScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'typography' | 'components' | 'layouts'>('typography');

  const renderContent = () => {
    if (activeTab === 'typography') {
      return (
        <GlassCard padding={20} borderRadius={22} style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Typography Scale</Text>
          <View style={styles.typographyGroup}>
            <View style={styles.typographyItem}>
              <Text style={styles.typoLabel}>Page Title / H1</Text>
              <Text style={styles.typoH1}>Monthly Cash Flow</Text>
            </View>
            <View style={styles.typographyItem}>
              <Text style={styles.typoLabel}>Section Title / H2</Text>
              <Text style={styles.typoH2}>Upcoming (next 7 days)</Text>
            </View>
            <View style={styles.typographyItem}>
              <Text style={styles.typoLabel}>Card Title</Text>
              <Text style={styles.typoCardTitle}>Netflix Subscription</Text>
            </View>
            <View style={styles.typographyItem}>
              <Text style={styles.typoLabel}>Body</Text>
              <Text style={styles.typoBody}>
                Fixed monthly payment with auto-created transactions and smart reminders.
              </Text>
            </View>
            <View style={styles.typographyItem}>
              <Text style={styles.typoLabel}>Label / Caption</Text>
              <Text style={styles.typoCaption}>Next due · 11 Dec 2025 · HDFC Credit Card</Text>
            </View>
            <View style={styles.typographyItem}>
              <Text style={styles.typoLabel}>Numeric Emphasis</Text>
              <Text style={styles.typoNumber}>₹ 58,268</Text>
            </View>
          </View>
        </GlassCard>
      );
    }

    if (activeTab === 'components') {
      return (
        <>
          {/* Buttons Section */}
          <GlassCard padding={20} borderRadius={22} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Buttons</Text>
            <Text style={styles.sectionBody}>
              Professional button components with variants, sizes, and states.
            </Text>

            <View style={styles.componentGroup}>
              <Text style={styles.componentSubtitle}>Variants</Text>
              
              <View style={styles.buttonRow}>
                <Button variant="primary" size="medium" onPress={() => {}}>
                  Primary
                </Button>
                <Button variant="secondary" size="medium" onPress={() => {}}>
                  Secondary
                </Button>
              </View>

              <View style={styles.buttonRow}>
                <Button variant="tertiary" size="medium" onPress={() => {}}>
                  Tertiary
                </Button>
                <Button variant="danger" size="medium" onPress={() => {}}>
                  Danger
                </Button>
              </View>

              <Text style={styles.componentSubtitle}>Sizes</Text>
              
              <View style={styles.buttonColumn}>
                <Button variant="primary" size="small" onPress={() => {}}>
                  Small Button
                </Button>
                <Button variant="primary" size="medium" onPress={() => {}}>
                  Medium Button
                </Button>
                <Button variant="primary" size="large" onPress={() => {}}>
                  Large Button
                </Button>
              </View>

              <Text style={styles.componentSubtitle}>States</Text>
              
              <View style={styles.buttonColumn}>
                <Button variant="primary" size="medium" onPress={() => {}}>
                  Normal
                </Button>
                <Button variant="primary" size="medium" disabled onPress={() => {}}>
                  Disabled
                </Button>
                <Button variant="primary" size="medium" loading onPress={() => {}}>
                  Loading
                </Button>
              </View>

              <Text style={styles.componentSubtitle}>With Icons</Text>
              
              <View style={styles.buttonColumn}>
                <Button
                  variant="primary"
                  size="medium"
                  icon={<Ionicons name="add" size={20} color="#0A2E2E" />}
                  onPress={() => {}}
                >
                  Add Account
                </Button>
                <Button
                  variant="secondary"
                  size="medium"
                  icon={<Ionicons name="checkmark" size={20} color="#C4B5FD" />}
                  onPress={() => {}}
                >
                  Confirm Payment
                </Button>
              </View>

              <Text style={styles.componentSubtitle}>Full Width</Text>
              
              <Button variant="primary" size="medium" fullWidth onPress={() => {}}>
                Full Width Button
              </Button>
            </View>
          </GlassCard>

          {/* Input Fields Placeholder */}
          <GlassCard padding={20} borderRadius={22} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Input Fields</Text>
            <Text style={styles.sectionBody}>
              Input components coming next – text fields, amount inputs, date pickers, and selectors.
            </Text>
          </GlassCard>

          {/* List Rows Placeholder */}
          <GlassCard padding={20} borderRadius={22} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>List Rows</Text>
            <Text style={styles.sectionBody}>
              Reusable list row components for transactions, accounts, bills, and recurring items.
            </Text>
          </GlassCard>
        </>
      );
    }

    return (
      <GlassCard padding={20} borderRadius={22} style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Layouts & Patterns</Text>
        <Text style={styles.sectionBody}>
          Here we’ll prototype page layouts like the recurring dashboard, liability detail, and
          subscription overview using the shared components.
        </Text>
      </GlassCard>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Components Lab</Text>
          </View>
          <Text style={styles.headerSubtitle}>
            Sandbox to experiment with the new FinTrack design system – buttons, cards, inputs,
            and complex flows like recurring transactions and liabilities.
          </Text>

          <View style={styles.tabRow}>
            <Text
              style={[styles.tabItem, activeTab === 'typography' && styles.tabItemActive]}
              onPress={() => setActiveTab('typography')}
            >
              Typography
            </Text>
            <Text
              style={[styles.tabItem, activeTab === 'components' && styles.tabItemActive]}
              onPress={() => setActiveTab('components')}
            >
              Components
            </Text>
            <Text
              style={[styles.tabItem, activeTab === 'layouts' && styles.tabItemActive]}
              onPress={() => setActiveTab('layouts')}
            >
              Layouts
            </Text>
          </View>

          {renderContent()}
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
  sectionCard: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#637050',
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F2F5EC',
    borderRadius: 999,
    padding: 4,
    marginBottom: 16,
    marginTop: 4,
  },
  tabItem: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    borderRadius: 999,
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#4F6F3E',
  },
  tabItemActive: {
    backgroundColor: '#4F6F3E',
    color: '#FFFFFF',
  },
  typographyGroup: {
    marginTop: 8,
    gap: 16,
  },
  typographyItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5ECD6',
    paddingBottom: 10,
  },
  typoLabel: {
    fontSize: 11,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#94A3B8',
    marginBottom: 4,
  },
  typoH1: {
    fontSize: 28,
    fontFamily: 'Archivo Black',
    color: '#0E401C',
  },
  typoH2: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  typoCardTitle: {
    fontSize: 15,
    fontFamily: 'Poppins-SemiBold',
    color: '#1F3A24',
  },
  typoBody: {
    fontSize: 14,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#374151',
  },
  typoCaption: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#6B7280',
  },
  typoNumber: {
    fontSize: 22,
    fontFamily: 'Poppins-SemiBold',
    color: '#0E401C',
  },
  componentGroup: {
    marginTop: 16,
    gap: 20,
  },
  componentSubtitle: {
    fontSize: 13,
    fontFamily: 'Poppins-SemiBold',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  buttonColumn: {
    gap: 12,
    marginBottom: 12,
  },
});

export default ComponentsLabScreen;


