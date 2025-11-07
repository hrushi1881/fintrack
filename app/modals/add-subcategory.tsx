import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export default function AddSubcategoryModal() {
  const { id: parentId } = useLocalSearchParams();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Please enter a subcategory name');
      return;
    }
    if (!user?.id) {
      Alert.alert('Error', 'You must be signed in');
      return;
    }
    try {
      setLoading(true);
      // Frontend-first scaffold: attempt insert if backend has parent_id; otherwise show info
      const { error } = await supabase
        .from('categories')
        .insert({ user_id: user.id, name: name.trim(), color: '#10B981', icon: 'folder', activity_types: ['expense'], parent_id: parentId }) as any;
      if (error) {
        // Likely missing parent_id column until backend migration
        Alert.alert(
          'Subcategories coming soon',
          'We are preparing the subcategory system. Backend migration will enable this shortly.'
        );
      } else {
        router.back();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#99D795", "#99D795", "#99D795"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Subcategory</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Groceries"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleCreate} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? 'Creating...' : 'Create Subcategory'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  closeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 8,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#000000',
    borderRadius: 16,
    marginHorizontal: 20,
    padding: 16,
  },
  label: {
    color: 'white',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: 'white',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});


