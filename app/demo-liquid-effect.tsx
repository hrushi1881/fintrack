/**
 * Demo Screen for Liquid Effect Component
 * 
 * Showcase the liquid effect animation
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import LiquidEffectBackground from '@/components/LiquidEffectBackground';
import LiquidGlassCard from '@/components/LiquidGlassCard';

export default function DemoLiquidEffect() {
  const [metalness, setMetalness] = useState(0.75);
  const [roughness, setRoughness] = useState(0.25);
  const [displacementScale, setDisplacementScale] = useState(5);
  const [rain, setRain] = useState(false);

  const colorPresets = [
    {
      name: 'Ocean',
      colors: ['#667eea', '#764ba2', '#4facfe', '#00f2fe'],
    },
    {
      name: 'Sunset',
      colors: ['#f093fb', '#f5576c', '#ff9a9e', '#fecfef'],
    },
    {
      name: 'Forest',
      colors: ['#11998e', '#38ef7d', '#56ab2f', '#a8e063'],
    },
    {
      name: 'Purple Dream',
      colors: ['#667eea', '#764ba2', '#f093fb', '#4facfe'],
    },
  ];

  const [selectedPreset, setSelectedPreset] = useState(0);

  return (
    <LiquidEffectBackground
      colors={colorPresets[selectedPreset].colors}
      metalness={metalness}
      roughness={roughness}
      displacementScale={displacementScale}
      rain={rain}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Liquid Effect</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Section */}
          <LiquidGlassCard variant="premium" style={styles.heroCard}>
            <Text style={styles.heroTitle}>Liquid Effect</Text>
            <Text style={styles.heroSubtitle}>
              Beautiful animated liquid background effect
            </Text>
          </LiquidGlassCard>

          {/* Color Presets */}
          <LiquidGlassCard variant="frosted" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Color Presets</Text>
            <View style={styles.presetGrid}>
              {colorPresets.map((preset, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.presetButton,
                    selectedPreset === index && styles.presetButtonActive,
                  ]}
                  onPress={() => setSelectedPreset(index)}
                >
                  <View style={styles.presetColors}>
                    {preset.colors.map((color, i) => (
                      <View
                        key={i}
                        style={[styles.colorDot, { backgroundColor: color }]}
                      />
                    ))}
                  </View>
                  <Text
                    style={[
                      styles.presetName,
                      selectedPreset === index && styles.presetNameActive,
                    ]}
                  >
                    {preset.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </LiquidGlassCard>

          {/* Controls */}
          <LiquidGlassCard variant="frosted" style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Effect Controls</Text>

            {/* Metalness */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Metalness</Text>
              <Text style={styles.controlValue}>{metalness.toFixed(2)}</Text>
            </View>
            <View style={styles.sliderContainer}>
              <TouchableOpacity
                style={styles.sliderTrack}
                onPress={(e) => {
                  const x = e.nativeEvent.locationX;
                  const newValue = Math.max(0, Math.min(1, x / 200));
                  setMetalness(newValue);
                }}
              >
                <View style={[styles.sliderFill, { width: `${metalness * 100}%` }]} />
              </TouchableOpacity>
            </View>

            {/* Roughness */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Roughness</Text>
              <Text style={styles.controlValue}>{roughness.toFixed(2)}</Text>
            </View>
            <View style={styles.sliderContainer}>
              <TouchableOpacity
                style={styles.sliderTrack}
                onPress={(e) => {
                  const x = e.nativeEvent.locationX;
                  const newValue = Math.max(0, Math.min(1, x / 200));
                  setRoughness(newValue);
                }}
              >
                <View style={[styles.sliderFill, { width: `${roughness * 100}%` }]} />
              </TouchableOpacity>
            </View>

            {/* Displacement Scale */}
            <View style={styles.controlRow}>
              <Text style={styles.controlLabel}>Displacement Scale</Text>
              <Text style={styles.controlValue}>{displacementScale.toFixed(0)}</Text>
            </View>
            <View style={styles.sliderContainer}>
              <TouchableOpacity
                style={styles.sliderTrack}
                onPress={(e) => {
                  const x = e.nativeEvent.locationX;
                  const newValue = Math.max(1, Math.min(10, (x / 200) * 10));
                  setDisplacementScale(newValue);
                }}
              >
                <View style={[styles.sliderFill, { width: `${(displacementScale / 10) * 100}%` }]} />
              </TouchableOpacity>
            </View>

            {/* Rain Toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setRain(!rain)}
            >
              <Text style={styles.controlLabel}>Rain Effect</Text>
              <View style={[styles.toggle, rain && styles.toggleActive]}>
                <View style={[styles.toggleThumb, rain && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>
          </LiquidGlassCard>

          {/* Info */}
          <LiquidGlassCard variant="subtle" style={styles.infoCard}>
            <Ionicons name="information-circle" size={20} color="#10B981" />
            <Text style={styles.infoText}>
              This liquid effect uses native React Native animations for smooth
              performance. Adjust the controls above to customize the appearance.
            </Text>
          </LiquidGlassCard>
        </ScrollView>
      </SafeAreaView>
    </LiquidEffectBackground>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-Bold',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  heroCard: {
    padding: 24,
    marginBottom: 20,
    borderRadius: 24,
  },
  heroTitle: {
    fontSize: 32,
    fontFamily: 'Poppins-Bold',
    color: '#041B11',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.6)',
  },
  sectionCard: {
    padding: 20,
    marginBottom: 16,
    borderRadius: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Poppins-SemiBold',
    color: '#041B11',
    marginBottom: 16,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  presetButton: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(4,27,17,0.04)',
    alignItems: 'center',
    minWidth: 80,
  },
  presetButtonActive: {
    backgroundColor: '#10B981',
  },
  presetColors: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 6,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  presetName: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(4,27,17,0.6)',
  },
  presetNameActive: {
    color: '#FFFFFF',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  controlLabel: {
    fontSize: 14,
    fontFamily: 'Poppins-Medium',
    color: '#041B11',
  },
  controlValue: {
    fontSize: 14,
    fontFamily: 'Poppins-SemiBold',
    color: '#10B981',
  },
  sliderContainer: {
    marginBottom: 20,
  },
  sliderTrack: {
    height: 6,
    backgroundColor: 'rgba(4,27,17,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  toggle: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(4,27,17,0.1)',
    padding: 2,
  },
  toggleActive: {
    backgroundColor: '#10B981',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    transform: [{ translateX: 0 }],
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  infoCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'InstrumentSerif-Regular',
    color: 'rgba(4,27,17,0.7)',
    lineHeight: 20,
  },
});
