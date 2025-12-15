import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useUser } from '@/contexts/UserContext';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { supabase } from '@/lib/supabase';
import CustomDropdown from '@/components/CustomDropdown';
import { COUNTRIES, PROFESSIONS } from '@/data/countries';
import { createOrganization , getSuggestedOrganizationSettings } from '@/utils/organizations';
import { createCategory } from '@/utils/categories';
import { formatCurrency, CURRENCY_CONFIGS } from '@/utils/currency';

interface OrganizationData {
  name: string;
  currency: string;
  accounts: AccountData[];
}

interface AccountData {
  name: string;
  type: 'debit' | 'credit' | 'savings' | 'wallet';
  balance: string;
  creditLimit?: string; // Only for credit accounts
}

export default function OnboardingScreen() {
  const params = useLocalSearchParams();
  const isPreview = params.preview === 'true';
  const { user } = useAuth();
  const { refreshProfile } = useUser();
  const { currency: userCurrency, setCurrency } = useSettings();
  const { globalRefresh, refreshAccounts: fetchAccounts } = useRealtimeData();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [checkingExisting, setCheckingExisting] = useState(!isPreview);
  
  // Progress tracking states
  const [progressStep, setProgressStep] = useState<'profile' | 'organizations' | 'accounts' | 'categories' | 'finalizing' | null>(null);
  const [progressMessage, setProgressMessage] = useState('');
  
  // Success/Error states
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorState, setErrorState] = useState<{ message: string; canRetry: boolean } | null>(null);
  const [successSummary, setSuccessSummary] = useState<{
    organizationsCount: number;
    accountsCount: number;
    categoriesCount: number;
  } | null>(null);

  // Step 1: Profile Information
  const [profileData, setProfileData] = useState({
    name: user?.user_metadata?.full_name || '',
    country: null as string | null,
    profession: null as string | null,
    currency: userCurrency || 'USD', // Initialize from settings
  });

  // Step 2: Organizations & Accounts (hierarchical structure)
  const [organizations, setOrganizations] = useState<OrganizationData[]>([]);
  const [expandedOrgIndex, setExpandedOrgIndex] = useState<number | null>(null);
  
  // Organization form
  const [newOrgName, setNewOrgName] = useState('');
  // Currency is locked to profileData.currency - no longer editable
  const [editingOrgIndex, setEditingOrgIndex] = useState<number | null>(null);

  // Account form (for adding to organization)
  const [addingAccountToOrg, setAddingAccountToOrg] = useState<number | null>(null);
  const [newAccountData, setNewAccountData] = useState<AccountData>({
    name: '',
    type: 'debit',
    balance: '',
    creditLimit: '',
  });
  const [editingAccount, setEditingAccount] = useState<{ orgIndex: number; accountIndex: number } | null>(null);

  // Step 3: Category Settings - will be initialized after MAIN_CATEGORIES is defined
  const [categories, setCategories] = useState<{
    [mainId: string]: string[]; // mainId -> array of selected subcategory names
  }>({
    food: ['Groceries', 'Dinner', 'Coffee'],
    transport: ['Fuel', 'Rideshare'],
    bills: ['Phone', 'Netflix'],
  });
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [customSubInput, setCustomSubInput] = useState<{ [mainId: string]: string }>({});
  
  // Custom categories (user-created main categories)
  const [customCategories, setCustomCategories] = useState<{
    id: string;
    name: string;
    icon: string;
    color: string;
    subs: string[];
    defaultActivityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
    availableActivityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  }[]>([]);
  const [addingCustomCategory, setAddingCustomCategory] = useState(false);
  const [newCategoryData, setNewCategoryData] = useState<{
    name: string;
    icon: string;
    color: string;
    subs: string[];
    activityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  }>({
    name: '',
    icon: 'folder',
    color: '#3B82F6',
    subs: [],
    activityTypes: ['expense'],
  });
  const [newCategorySubInput, setNewCategorySubInput] = useState('');

  // Create currencies array from CURRENCY_CONFIGS for dropdown
  const currencies = Object.entries(CURRENCY_CONFIGS).map(([code, config]) => ({
    label: `${code} (${config.symbol})`,
    value: code,
  }));

  const steps = [
    {
      title: 'PROFILE INFORMATION',
      subtitle: 'Tell us about yourself',
      icon: 'person',
    },
    {
      title: 'ORGANIZATIONS & ACCOUNTS',
      subtitle: 'Set up your financial structure',
      icon: 'business',
    },
    {
      title: 'CATEGORY SETTINGS',
      subtitle: 'Customize your categories',
      icon: 'grid',
    },
    {
      title: 'REVIEW & CONFIRM',
      subtitle: 'Review your setup',
      icon: 'checkmark-circle',
    },
  ];

  const MAIN_CATEGORIES = [
    {
      id: 'food',
      name: 'Food & Dining',
      subs: ['Groceries', 'Lunch', 'Dinner', 'Restaurants', 'Coffee', 'Delivery'],
      icon: 'restaurant',
      color: '#EF4444',
      defaultActivityTypes: ['expense'], // Mainly expense, optionally budget
      availableActivityTypes: ['expense', 'budget'],
    },
    {
      id: 'transport',
      name: 'Transportation',
      subs: ['Public Transport', 'Fuel', 'Rideshare', 'Parking', 'Flights', 'Maintenance'],
      icon: 'car',
      color: '#F59E0B',
      defaultActivityTypes: ['expense'],
      availableActivityTypes: ['expense', 'budget'],
    },
    {
      id: 'housing',
      name: 'Housing & Utilities',
      subs: ['Rent', 'Electricity', 'Water', 'Internet', 'Repairs'],
      icon: 'home',
      color: '#F97316',
      defaultActivityTypes: ['expense', 'bill'], // Can be both expense and bill
      availableActivityTypes: ['expense', 'bill', 'budget'],
    },
    {
      id: 'bills',
      name: 'Subscriptions & Bills',
      subs: ['Netflix', 'Spotify', 'Phone', 'Insurance', 'EMI', 'SaaS'],
      icon: 'receipt',
      color: '#3B82F6',
      defaultActivityTypes: ['expense', 'bill'],
      availableActivityTypes: ['expense', 'bill'],
    },
    {
      id: 'lifestyle',
      name: 'Personal & Lifestyle',
      subs: ['Clothing', 'Gym', 'Grooming', 'Health'],
      icon: 'person',
      color: '#8B5CF6',
      defaultActivityTypes: ['expense'],
      availableActivityTypes: ['expense', 'budget'],
    },
    {
      id: 'education',
      name: 'Education & Work',
      subs: ['Tuition', 'Courses', 'Books', 'Software'],
      icon: 'school',
      color: '#6366F1',
      defaultActivityTypes: ['expense'],
      availableActivityTypes: ['expense', 'goal', 'budget'], // Can be expense or goal (education savings)
    },
    {
      id: 'entertainment',
      name: 'Entertainment & Leisure',
      subs: ['Movies', 'Travel', 'Hobbies', 'Events'],
      icon: 'musical-notes',
      color: '#EC4899',
      defaultActivityTypes: ['expense'],
      availableActivityTypes: ['expense', 'budget'],
    },
    {
      id: 'income',
      name: 'Income',
      subs: ['Salary', 'Freelance', 'Business', 'Stipend', 'Investments'],
      icon: 'trending-up',
      color: '#10B981',
      defaultActivityTypes: ['income'], // ONLY income
      availableActivityTypes: ['income'],
    },
    {
      id: 'savings',
      name: 'Savings & Investments',
      subs: ['Emergency Fund', 'Mutual Funds', 'FD', 'Gold'],
      icon: 'trending-up',
      color: '#059669',
      defaultActivityTypes: ['goal'],
      availableActivityTypes: ['goal', 'expense', 'income'], // Goal (save), expense (withdraw), income (returns)
    },
    {
      id: 'other',
      name: 'Other / Misc',
      subs: ['Uncategorized'],
      icon: 'ellipsis-horizontal',
      color: '#6B7280',
      defaultActivityTypes: ['expense'],
      availableActivityTypes: ['expense', 'budget'],
    },
  ];

  // Activity types for each category - what this category can be used for
  // Initialize after MAIN_CATEGORIES is defined
  const [categoryActivityTypes, setCategoryActivityTypes] = useState<{
    [mainId: string]: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  }>(() => {
    const defaults: { [key: string]: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[] } = {};
    MAIN_CATEGORIES.forEach((cat) => {
      defaults[cat.id] = cat.defaultActivityTypes;
    });
    return defaults;
  });

  // Helper function to get icon and color for subcategory
  const getSubcategorySettings = (mainId: string, subName: string) => {
    const mainCat = MAIN_CATEGORIES.find((c) => c.id === mainId);
    const defaultColor = mainCat?.color || '#3B82F6';
    const defaultIcon = mainCat?.icon || 'folder';

    // Subcategory-specific mappings (using valid Ionicons names)
    const subLower = subName.toLowerCase();
    const iconMap: { [key: string]: string } = {
      groceries: 'bag',
      lunch: 'restaurant',
      dinner: 'restaurant',
      restaurants: 'restaurant',
      coffee: 'cafe',
      delivery: 'restaurant',
      'public transport': 'bus',
      fuel: 'flash',
      rideshare: 'car',
      parking: 'square',
      flights: 'airplane',
      maintenance: 'construct',
      rent: 'home',
      electricity: 'flash',
      water: 'water',
      internet: 'wifi',
      repairs: 'construct',
      netflix: 'play',
      spotify: 'musical-notes',
      phone: 'call',
      insurance: 'shield',
      emi: 'card',
      saas: 'cloud',
      clothing: 'shirt',
      gym: 'fitness',
      grooming: 'cut',
      health: 'medical',
      tuition: 'school',
      courses: 'book',
      books: 'book',
      software: 'laptop',
      movies: 'film',
      travel: 'airplane',
      hobbies: 'game-controller',
      events: 'calendar',
      salary: 'briefcase',
      freelance: 'laptop',
      business: 'business',
      stipend: 'cash',
      investments: 'trending-up',
      'emergency fund': 'shield',
      'mutual funds': 'trending-up',
      fd: 'lock-closed',
      gold: 'diamond',
      uncategorized: 'ellipsis-horizontal',
    };

    const icon = iconMap[subLower] || defaultIcon;
    return { icon, color: defaultColor };
  };

  const accountTypes = [
    { label: 'Debit', value: 'debit', icon: 'card-outline' },
    { label: 'Credit', value: 'credit', icon: 'card' },
    { label: 'Savings', value: 'savings', icon: 'cash-outline' },
    { label: 'Wallet', value: 'wallet', icon: 'wallet-outline' },
  ];

  // Check if onboarding already completed (skip if preview mode)
  useEffect(() => {
    if (isPreview) {
      setCheckingExisting(false);
      return;
    }

    const checkOnboardingStatus = async () => {
      if (!user) {
        router.replace('/auth/signin');
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('users_profile')
          .select('onboarding_completed')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error checking onboarding status:', error);
          setCheckingExisting(false);
          return;
        }

        if (profile?.onboarding_completed) {
          router.replace('/(tabs)');
        } else {
          setCheckingExisting(false);
        }
      } catch (error) {
        console.error('Error during onboarding check:', error);
        setCheckingExisting(false);
      }
    };

    // Delay navigation until after first paint to avoid "navigate before mounting root layout"
    const timer = setTimeout(() => {
      checkOnboardingStatus();
    }, 0);

    return () => clearTimeout(timer);
  }, [user, isPreview]);

  const handleNext = () => {
    // Validate current step before proceeding
    // Note: Validation applies in both preview and normal mode to ensure proper flow
    if (currentStep === 0) {
      // Step 1: Profile Information - Name and currency are required
      if (!profileData.name || profileData.name.trim().length < 2) {
        Alert.alert('Error', 'Please enter your full name (at least 2 characters) to continue');
        return;
      }
      if (!profileData.currency) {
        Alert.alert('Error', 'Please select your currency to continue');
        return;
      }
    } else if (currentStep === 1) {
      // Step 2: Organizations & Accounts - Require at least one organization with at least one account
      if (organizations.length === 0) {
        Alert.alert('Error', 'Please add at least one organization with at least one account');
        return;
      }
      
      // Validate all organizations have names
      for (const org of organizations) {
        if (!org.name || org.name.trim().length === 0) {
          Alert.alert('Error', 'All organizations must have a name');
          return;
        }
      }
      
      // Check if we have at least one account across all organizations
      const totalAccounts = organizations.reduce((sum, org) => sum + org.accounts.length, 0);
      if (totalAccounts === 0) {
        Alert.alert('Error', 'Please add at least one account to an organization');
        return;
      }
      
      // Verify at least one organization has at least one account
      const hasOrgWithAccount = organizations.some((org) => org.accounts.length > 0);
      if (!hasOrgWithAccount) {
        Alert.alert('Error', 'Please add at least one account to an organization');
        return;
      }
      
      // Validate all accounts have names and valid balances
      for (const org of organizations) {
        for (const account of org.accounts) {
          if (!account.name || account.name.trim().length === 0) {
            Alert.alert('Error', `Account in "${org.name}" must have a name`);
            return;
          }
          const balance = parseFloat(account.balance || '0') || 0;
          if (isNaN(balance) || balance < 0) {
            Alert.alert('Error', `Account "${account.name}" must have a valid balance (≥ 0)`);
            return;
          }
          if (account.type === 'credit') {
            const creditLimit = parseFloat(account.creditLimit || '0') || 0;
            if (isNaN(creditLimit) || creditLimit <= 0) {
              Alert.alert('Error', `Credit account "${account.name}" must have a valid credit limit (> 0)`);
              return;
            }
          }
        }
      }
    } else if (currentStep === 2) {
      // Step 3: Categories - Require at least one category selected
      const selectedCategoriesCount = Object.values(categories).reduce((sum, subs) => sum + subs.length, 0);
      const customCategoriesCount = customCategories.reduce((sum, cat) => sum + cat.subs.length, 0);
      if (selectedCategoriesCount === 0 && customCategoriesCount === 0) {
        Alert.alert('Error', 'Please select at least one category to continue');
        return;
      }
    } else if (currentStep === 3) {
      // Preview step - no validation needed, just proceed to completion
      handleComplete();
      return;
    }

    // Move to next step
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Phase 1: Comprehensive Validation Function
  const validateOnboardingData = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Validate profile
    if (!profileData.name || profileData.name.trim().length < 2) {
      errors.push('Name must be at least 2 characters');
    }
    
    if (!profileData.currency || !CURRENCY_CONFIGS[profileData.currency]) {
      errors.push('Invalid currency selected');
    }
    
    // Validate organizations
    if (!organizations || organizations.length === 0) {
      errors.push('At least one organization is required');
    }
    
    for (const org of organizations) {
      if (!org.name || org.name.trim().length === 0) {
        errors.push(`Organization "${org.name || 'Unnamed'}" needs a name`);
      }
      
      // Org currency must match profile currency
      if (org.currency !== profileData.currency) {
        errors.push(`Organization "${org.name}" currency must match selected currency`);
      }
    }
    
    // Validate accounts (at least 1 total, at least 1 per org)
    const totalAccounts = organizations.reduce((sum, org) => sum + org.accounts.length, 0);
    if (totalAccounts === 0) {
      errors.push('At least one account is required');
    }
    
    for (const org of organizations) {
      for (const account of org.accounts) {
        if (!account.name || account.name.trim().length === 0) {
          errors.push(`Account in "${org.name}" needs a name`);
        }
        
        const balance = parseFloat(account.balance || '0') || 0;
        if (balance < 0) {
          errors.push(`Account "${account.name}" balance cannot be negative`);
        }
        
        if (account.type === 'credit') {
          const creditLimit = parseFloat(account.creditLimit || '0') || 0;
          if (creditLimit <= 0) {
            errors.push(`Credit account "${account.name}" needs a valid credit limit`);
          }
        }
      }
    }
    
    // Validate categories
    const totalCategories = Object.keys(categories).reduce((sum, mainId) => {
      return sum + (categories[mainId]?.length || 0);
    }, 0);
    const customCategoriesCount = customCategories.reduce((sum, cat) => sum + cat.subs.length, 0);
    if (totalCategories === 0 && customCategoriesCount === 0) {
      errors.push('At least one category is required');
    }
    
    return { valid: errors.length === 0, errors };
  };

  const handleComplete = async () => {
    if (!user && !isPreview) {
      Alert.alert('Error', 'Please sign in to continue');
      return;
    }

    // In preview mode, just show success message and go back
    if (isPreview) {
      Alert.alert(
        'Onboarding Preview Complete!',
        'This is a preview of the onboarding flow. No data was saved.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
      return;
    }

    setIsLoading(true);
    setErrorState(null);
    setShowSuccess(false);

    try {
      // Phase 1: Validate all data before submission
      const validation = validateOnboardingData();
      if (!validation.valid) {
        Alert.alert('Invalid Data', validation.errors.join('\n'));
        setIsLoading(false);
        return;
      }

      // Phase 10: Use profileData.currency everywhere (no hardcoded 'USD')
      const selectedCurrency = profileData.currency || userCurrency || 'USD';
      
      // Update settings first so it's synced
      await setCurrency(selectedCurrency);

      // ===================================================================
      // STEP 1: UPDATE USER PROFILE
      // ===================================================================
      setProgressStep('profile');
      setProgressMessage('Setting up your profile...');

      const profileDataToSave: any = {
        user_id: user!.id,
        full_name: profileData.name.trim(),
        default_currency: selectedCurrency,
        base_currency: selectedCurrency,
        onboarding_completed: false, // Will set to true only after all data is saved
      };

      // Add country if provided
      if (profileData.country) {
        profileDataToSave.country = profileData.country;
      }

      // Add profession if provided
      if (profileData.profession) {
        profileDataToSave.profession = profileData.profession;
      }

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from('users_profile')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      let profileError: any = null;
      if (existingProfile) {
        // Profile exists - update it
        const { error } = await supabase
          .from('users_profile')
          .update(profileDataToSave)
          .eq('user_id', user!.id);
        profileError = error;
      } else {
        // Profile doesn't exist - create it
        const { error } = await supabase
          .from('users_profile')
          .insert(profileDataToSave);
        profileError = error;
      }

      if (profileError) {
        console.error('Error creating/updating profile:', profileError);
        throw new Error(`Failed to save profile: ${profileError.message || 'Unknown error'}`);
      }

      // ===================================================================
      // STEP 2: CREATE OPENING BALANCE CATEGORY (SYSTEM CATEGORY)
      // ===================================================================
      setProgressMessage('Preparing categories...');

      // Check if "Opening Balance" category already exists
      const { data: existingOpeningCategory } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user!.id)
        .eq('name', 'Opening Balance')
        .eq('is_deleted', false)
        .maybeSingle();

      let openingBalanceCategoryId: string;

      if (existingOpeningCategory) {
        openingBalanceCategoryId = existingOpeningCategory.id;
      } else {
        // Create "Opening Balance" system category
        const { data: newCategory, error: catError } = await supabase
          .from('categories')
          .insert({
            user_id: user!.id,
            name: 'Opening Balance',
            color: '#9CA3AF', // Gray
            icon: 'calendar-outline',
            activity_types: ['income'], // Used for opening balance transactions
            is_default: false, // System category, not default
          })
          .select('id')
          .single();
        
        if (catError) {
          throw new Error(`Failed to create Opening Balance category: ${catError.message}`);
        }
        
        openingBalanceCategoryId = newCategory.id;
      }

      // ===================================================================
      // STEP 3: CREATE ORGANIZATIONS (WITH RECOVERY)
      // ===================================================================
      setProgressStep('organizations');
      setProgressMessage('Creating organizations...');

      // Phase 5: Check for existing organizations (recovery mechanism)
      const { data: existingOrgs } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('user_id', user!.id)
        .eq('is_deleted', false);

      const createdOrgs: { id: string; name: string; accounts: AccountData[] }[] = [];
      let organizationsCreated = 0;

      for (const org of organizations) {
        // Check if org already exists (by name)
        const existing = existingOrgs?.find(e => e.name === org.name);
        
        if (existing) {
          console.log(`Organization "${org.name}" already exists, reusing`);
          createdOrgs.push({ ...existing, accounts: org.accounts });
        } else {
          // Phase 4: Create new organization (NO balance, NO funds, NO transactions)
          const suggestions = getSuggestedOrganizationSettings(org.name.trim(), 'bank');
          const hardcodedThemeColor = suggestions.color_theme || '#4F6F3E';

          try {
            const newOrg = await createOrganization(
              {
                name: org.name.trim(),
                type: 'bank', // Hardcoded for onboarding
                currency: selectedCurrency, // Must match Step 1
                color_theme: hardcodedThemeColor,
                description: 'Created during onboarding',
              },
              user!.id
            );
            createdOrgs.push({ ...newOrg, accounts: org.accounts });
            // organizationsCreated++;
          } catch (orgError: any) {
            console.error(`Error creating organization ${org.name}:`, orgError);
            throw new Error(`Failed to create organization "${org.name}": ${orgError?.message || 'Unknown error'}`);
          }
        }
      }

      // Verify at least one organization was created or reused
      if (createdOrgs.length === 0) {
        throw new Error('Failed to create any organizations. Please try again.');
      }

      // ===================================================================
      // STEP 4: CREATE ACCOUNTS & INITIALIZE FUNDS (WITH RECOVERY)
      // ===================================================================
      setProgressStep('accounts');
      setProgressMessage('Setting up accounts and initial balances...');

      // Get existing accounts for recovery
      const { data: existingAccounts } = await supabase
        .from('accounts')
        .select('id, name, organization_id')
        .eq('user_id', user!.id)
        .eq('is_deleted', false);

      let accountsCreated = 0;

      for (const org of createdOrgs) {
        // Get existing accounts for this org
        const orgExistingAccounts = existingAccounts?.filter(a => a.organization_id === org.id) || [];

        for (const accountData of org.accounts) {
          // Phase 5: Check if account already exists (by name in this org)
          const existingAccount = orgExistingAccounts.find(a => a.name === accountData.name.trim());
          
          if (existingAccount) {
            console.log(`Account "${accountData.name}" already exists in "${org.name}", skipping`);
            continue;
          }

          // Phase 2: Create account with initial balance directly
          const balanceAmount = parseFloat(accountData.balance || '0') || 0;
          const creditLimitNumber = accountData.type === 'credit' ? parseFloat(accountData.creditLimit || '0') || null : null;

          // Map account type to database type
          const accountTypeForDb =
            accountData.type === 'credit'
              ? 'card'
              : accountData.type === 'wallet'
              ? 'wallet'
              : 'bank'; // debit and savings both map to 'bank'

          // Determine icon based on account type
          let accountIcon = 'card-outline';
          if (accountTypeForDb === 'card') {
            accountIcon = 'card';
          } else if (accountTypeForDb === 'wallet') {
            accountIcon = 'wallet';
          } else if (accountData.type === 'savings') {
            accountIcon = 'cash-outline';
          }

          try {
            // Step 1: Create account with balance = 0 initially
            // The opening balance transaction will update it via trigger
            console.log(`Creating account "${accountData.name}" for organization "${org.name}"...`);
            const { data: newAccount, error: accountError } = await supabase
              .from('accounts')
              .insert({
                user_id: user!.id,
                organization_id: org.id,
                name: accountData.name.trim(),
                type: accountTypeForDb,
                balance: 0, // ✅ Start with 0 - opening balance transaction will set it correctly
                currency: selectedCurrency, // Must match Step 1
                icon: accountIcon,
                color: '#3B82F6',
                is_active: true,
                include_in_totals: true,
                credit_limit: creditLimitNumber,
              })
              .select()
              .single();

            if (accountError) {
              console.error(`Account creation error for "${accountData.name}":`, accountError);
              throw new Error(`Failed to create account "${accountData.name}": ${accountError.message}`);
            }

            if (!newAccount) {
              throw new Error(`Account "${accountData.name}" was not created (no data returned)`);
            }

            console.log(`✅ Account created: ${newAccount.id} - ${newAccount.name} (initial balance: 0)`);
            accountsCreated++;

            // Step 2: Create opening balance transaction (if balance > 0)
            // This transaction will update the account balance via trigger
            // The trigger does: balance = balance + amount for income transactions
            if (balanceAmount > 0 && openingBalanceCategoryId) {
              console.log(`Creating opening balance transaction for "${accountData.name}": ${balanceAmount}`);
              const { error: txError } = await supabase
                .from('transactions')
                .insert({
                  user_id: user!.id,
                  account_id: newAccount.id,
                  type: 'income',
                  amount: balanceAmount,
                  category_id: openingBalanceCategoryId,
                  description: 'Opening Balance',
                  date: new Date().toISOString().split('T')[0],
                  currency: selectedCurrency,
                  balance_before: 0,
                  balance_after: balanceAmount,
                });
              
              if (txError) {
                console.error(`Transaction insert error for "${accountData.name}":`, txError);
                throw new Error(`Failed to record opening balance for "${accountData.name}": ${txError.message}`);
              }

              // Verify account balance was updated by trigger
              const { data: updatedAccount, error: verifyError } = await supabase
                .from('accounts')
                .select('balance')
                .eq('id', newAccount.id)
                .single();

              if (verifyError || !updatedAccount) {
                console.warn(`Could not verify account balance for "${accountData.name}"`);
              } else {
                const actualBalance = parseFloat(updatedAccount.balance || '0');
                if (Math.abs(actualBalance - balanceAmount) > 0.01) {
                  console.warn(`Account balance mismatch for "${accountData.name}": expected ${balanceAmount}, got ${actualBalance}`);
                  // Fix the balance manually if trigger didn't update it correctly
                  await supabase
                    .from('accounts')
                    .update({ balance: balanceAmount })
                    .eq('id', newAccount.id);
                  console.log(`✅ Manually corrected balance to ${balanceAmount}`);
                } else {
                  console.log(`✅ Account balance verified: ${actualBalance}`);
                }
              }
            } else if (balanceAmount === 0) {
              console.log(`Account "${accountData.name}" created with zero balance (no opening balance transaction needed)`);
            }

            // Step 3: Trigger should auto-create personal fund (migration 023)
            // Wait a moment for trigger to fire
            await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay for trigger
            
            const { data: existingFund } = await supabase
              .from('account_funds')
              .select('id')
              .eq('account_id', newAccount.id)
              .eq('type', 'personal')
              .maybeSingle();

            if (!existingFund) {
              // Trigger didn't fire - this is OK, personal funds are calculated dynamically
              // Log warning but don't fail - account balance is the source of truth
              console.warn(`Personal fund not found for account "${accountData.name}" - this is OK, personal funds are calculated dynamically`);
            }
          } catch (accountError: any) {
            console.error(`Error creating account ${accountData.name}:`, accountError);
            throw new Error(`Failed to create account "${accountData.name}": ${accountError?.message || 'Unknown error'}`);
          }
        }
      }

      // Verify at least one account was created
      if (accountsCreated === 0) {
        throw new Error('Failed to create any accounts. Please try again.');
      }

      // ===================================================================
      // STEP 5: CREATE USER CATEGORIES
      // ===================================================================
      setProgressStep('categories');
      setProgressMessage('Creating categories...');

      const categoriesCreated: string[] = [];
      const categoriesSkipped: string[] = [];
      const categoryErrors: string[] = [];
      const allCategories = [...MAIN_CATEGORIES, ...customCategories];

      for (const [mainId, subcategories] of Object.entries(categories)) {
        if (!subcategories || subcategories.length === 0) continue;

        // Get activity types for this main category
        const mainCat = allCategories.find((c) => c.id === mainId);
        const activityTypes = categoryActivityTypes[mainId] || mainCat?.defaultActivityTypes || ['expense'];
        
        // Must have at least one activity type
        if (activityTypes.length === 0) continue;

        for (const subName of subcategories) {
          const categoryName = subName.trim();
          
          // Skip if already processed
          if (categoriesCreated.includes(categoryName) || categoriesSkipped.includes(categoryName)) {
            continue;
          }

          try {
            // For custom categories, use category's icon/color for subcategories
            // For main categories, use subcategory-specific mapping
            let icon: string;
            let color: string;
            
            if (mainId.startsWith('custom_') && mainCat) {
              icon = mainCat.icon;
              color = mainCat.color;
            } else {
              const settings = getSubcategorySettings(mainId, subName);
              icon = settings.icon;
              color = settings.color;
            }

            // Check if category already exists for this user
            const { data: existingCategory } = await supabase
              .from('categories')
              .select('id, activity_types')
              .eq('user_id', user!.id)
              .eq('name', categoryName)
              .eq('is_deleted', false)
              .maybeSingle();

            if (existingCategory) {
              // Category exists - check if we need to update activity types
              const existingTypes = existingCategory.activity_types || [];
              const requestedTypes = activityTypes;
              
              // Check if existing category has all requested types
              const hasAllTypes = requestedTypes.every((type) => existingTypes.includes(type));
              
              if (!hasAllTypes) {
                // Update activity types to include both existing and new
                const mergedTypes = Array.from(new Set([...existingTypes, ...requestedTypes]));
                await supabase
                  .from('categories')
                  .update({ activity_types: mergedTypes })
                  .eq('id', existingCategory.id);
                categoriesCreated.push(categoryName);
              } else {
                // Category already exists with all requested types
                categoriesSkipped.push(categoryName);
              }
            } else {
              // Create new category
              // First, check if we need to create the main category as a parent
              let parentId: string | null = null;
              
              if (!mainId.startsWith('custom_') && mainCat) {
                // For predefined main categories, check if parent exists
                const { data: mainCategoryDb } = await supabase
                  .from('categories')
                  .select('id')
                  .eq('user_id', user!.id)
                  .eq('name', mainCat.name)
                  .eq('is_deleted', false)
                  .maybeSingle();

                if (mainCategoryDb) {
                  parentId = mainCategoryDb.id;
                } else {
                  // Create main category as parent first
                  try {
                    const mainCategoryCreated = await createCategory({
                      name: mainCat.name,
                      color: mainCat.color,
                      icon: mainCat.icon,
                      activity_types: mainCat.defaultActivityTypes,
                      parent_id: null,
                    });
                    parentId = mainCategoryCreated.id;
                  } catch (mainError: any) {
                    // If main category already exists (race condition), fetch it
                    if (mainError?.message?.includes('already exists')) {
                      const { data: existingMain } = await supabase
                        .from('categories')
                        .select('id')
                        .eq('user_id', user!.id)
                        .eq('name', mainCat.name)
                        .eq('is_deleted', false)
                        .maybeSingle();
                      if (existingMain) {
                        parentId = existingMain.id;
                      }
                    }
                  }
                }
              }

              // Create subcategory with parent_id
              await createCategory({
                name: categoryName,
                color,
                icon,
                activity_types: activityTypes as any,
                parent_id: parentId,
              });
              categoriesCreated.push(categoryName);
            }
          } catch (categoryError: any) {
            // Log error but continue with other categories
            const errorMsg = categoryError?.message || 'Unknown error';
            categoryErrors.push(`${categoryName}: ${errorMsg}`);
            console.error(`Error creating category ${categoryName}:`, categoryError);
          }
        }
      }

      // Log results (helpful for debugging)
      if (categoriesCreated.length > 0) {
        console.log(`✅ Created/Updated ${categoriesCreated.length} categories:`, categoriesCreated);
      }
      if (categoriesSkipped.length > 0) {
        console.log(`⏭️ Skipped ${categoriesSkipped.length} existing categories:`, categoriesSkipped);
      }
      if (categoryErrors.length > 0) {
        console.warn(`⚠️ Errors creating ${categoryErrors.length} categories:`, categoryErrors);
      }

      // ===================================================================
      // STEP 6: REFRESH ALL CONTEXTS
      // ===================================================================
      setProgressStep('finalizing');
      setProgressMessage('Refreshing your data...');

      // Phase 9: Refresh contexts to load new data
      try {
        console.log('🔄 Refreshing all contexts...');
        
        // Refresh accounts first to ensure they're visible
        await fetchAccounts();
        
        // Then refresh everything else
        await globalRefresh(); // This refreshes organizations, accounts, categories, etc.
        await refreshProfile(); // From useUser
        
        console.log('✅ All contexts refreshed');
        
        // Verify accounts are visible
        const { data: verifyAccounts } = await supabase
          .from('accounts')
          .select('id, name, balance')
          .eq('user_id', user!.id)
          .or('is_active.eq.true,is_active.is.null')
          .order('name');
        
        console.log(`✅ Verified ${verifyAccounts?.length || 0} accounts in database`);
        if (verifyAccounts && verifyAccounts.length > 0) {
          console.log('   Accounts:', verifyAccounts.map(a => `${a.name} (${a.balance})`).join(', '));
        }
      } catch (refreshError) {
        console.error('Error refreshing contexts:', refreshError);
        // Don't fail onboarding if refresh fails - data is already saved
      }

      // ===================================================================
      // STEP 7: MARK ONBOARDING AS COMPLETED (ONLY AFTER ALL DATA SAVED)
      // ===================================================================
      // Phase 11: Only mark onboarding_completed after ALL critical data is saved
      const { error: completionError } = await supabase
        .from('users_profile')
        .update({
          onboarding_completed: true,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user!.id);

      if (completionError) {
        console.error('Error marking onboarding as completed:', completionError);
        // Don't throw - we've already saved the important data
      }

      // ===================================================================
      // STEP 8: SHOW SUCCESS & NAVIGATE
      // ===================================================================
      // Phase 7: Success state UI
      setProgressMessage('Welcome to FinTrack!');
      
      // Store success summary for display
      setSuccessSummary({
        organizationsCount: createdOrgs.length,
        accountsCount: accountsCreated,
        categoriesCount: categoriesCreated.length,
      });
      
      setSuccessMessage(`Welcome to FinTrack, ${profileData.name}!`);
      setShowSuccess(true);
      setIsLoading(false);

    } catch (error: any) {
      console.error('Error completing onboarding:', error);
      
      // Phase 8: Error state UI
      const errorMsg = error?.message || 'Failed to complete onboarding. Please try again.';
      setErrorState({
        message: errorMsg,
        canRetry: true,
      });
      setIsLoading(false);
    }
  };

  // Organization management
  const handleAddOrganization = () => {
    if (!newOrgName.trim()) {
      Alert.alert('Error', 'Please enter organization name');
      return;
    }
    setOrganizations([
      ...organizations,
      {
        name: newOrgName.trim(),
        currency: profileData.currency, // Lock to selected currency from Step 1
        accounts: [],
      },
    ]);
    setNewOrgName('');
  };

  const handleEditOrganization = (index: number) => {
    setEditingOrgIndex(index);
    setNewOrgName(organizations[index].name);
    // Currency is locked - don't allow editing
  };

  const handleSaveOrganization = () => {
    if (editingOrgIndex === null || !newOrgName.trim()) {
      Alert.alert('Error', 'Please enter organization name');
      return;
    }
    const updated = [...organizations];
    updated[editingOrgIndex] = {
      ...updated[editingOrgIndex],
      name: newOrgName.trim(),
      currency: profileData.currency, // Lock to selected currency from Step 1
    };
    setOrganizations(updated);
    setEditingOrgIndex(null);
    setNewOrgName('');
  };

  const handleRemoveOrganization = (index: number) => {
    Alert.alert('Remove Organization', 'Are you sure you want to remove this organization and all its accounts?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setOrganizations(organizations.filter((_, i) => i !== index));
          if (expandedOrgIndex === index) {
            setExpandedOrgIndex(null);
          }
        },
      },
    ]);
  };

  const toggleOrganization = (index: number) => {
    setExpandedOrgIndex(expandedOrgIndex === index ? null : index);
    setAddingAccountToOrg(null);
    setEditingAccount(null);
  };

  // Account management (under organization)
  const handleAddAccount = (orgIndex: number) => {
    if (!newAccountData.name.trim()) {
      Alert.alert('Error', 'Please enter account name');
      return;
    }
    if (newAccountData.balance && isNaN(parseFloat(newAccountData.balance))) {
      Alert.alert('Error', 'Please enter a valid balance');
      return;
    }
    if (newAccountData.type === 'credit' && (!newAccountData.creditLimit || isNaN(parseFloat(newAccountData.creditLimit || '0')))) {
      Alert.alert('Error', 'Please enter a valid credit limit');
      return;
    }

    const updated = [...organizations];
    updated[orgIndex].accounts.push({ ...newAccountData });
    setOrganizations(updated);
    setNewAccountData({
      name: '',
      type: 'debit',
      balance: '',
      creditLimit: '',
    });
    setAddingAccountToOrg(null);
  };

  const handleEditAccount = (orgIndex: number, accountIndex: number) => {
    setEditingAccount({ orgIndex, accountIndex });
    setNewAccountData({ ...organizations[orgIndex].accounts[accountIndex] });
  };

  const handleSaveAccount = () => {
    if (!editingAccount || !newAccountData.name.trim()) {
      Alert.alert('Error', 'Please enter account name');
      return;
    }
    if (newAccountData.balance && isNaN(parseFloat(newAccountData.balance))) {
      Alert.alert('Error', 'Please enter a valid balance');
      return;
    }
    if (newAccountData.type === 'credit' && (!newAccountData.creditLimit || isNaN(parseFloat(newAccountData.creditLimit || '0')))) {
      Alert.alert('Error', 'Please enter a valid credit limit');
      return;
    }

    const updated = [...organizations];
    updated[editingAccount.orgIndex].accounts[editingAccount.accountIndex] = { ...newAccountData };
    setOrganizations(updated);
    setEditingAccount(null);
    setNewAccountData({
      name: '',
      type: 'debit',
      balance: '',
      creditLimit: '',
    });
  };

  const handleRemoveAccount = (orgIndex: number, accountIndex: number) => {
    Alert.alert('Remove Account', 'Are you sure you want to remove this account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const updated = [...organizations];
          updated[orgIndex].accounts.splice(accountIndex, 1);
          setOrganizations(updated);
        },
      },
    ]);
  };

  // Step 3: Category management
  const toggleMainCategory = (mainId: string) => {
    const current = categories[mainId] || [];
    if (current.length > 0) {
      // Turning off - remove all selections
      const updated = { ...categories };
      delete updated[mainId];
      setCategories(updated);
    } else {
      // Turning on - preselect first 2 subcategories
      const allCats = [...MAIN_CATEGORIES, ...customCategories];
      const mainCat = allCats.find((c) => c.id === mainId);
      const defaults = mainCat ? mainCat.subs.slice(0, Math.min(2, mainCat.subs.length)) : [];
      setCategories({ ...categories, [mainId]: defaults });
    }
  };

  const toggleSubcategory = (mainId: string, subName: string) => {
    const current = categories[mainId] || [];
    if (current.includes(subName)) {
      // Remove subcategory
      const updated = current.filter((s) => s !== subName);
      if (updated.length === 0) {
        // Remove main category if no subs left
        const newCats = { ...categories };
        delete newCats[mainId];
        setCategories(newCats);
      } else {
        setCategories({ ...categories, [mainId]: updated });
      }
    } else {
      // Add subcategory
      setCategories({ ...categories, [mainId]: [...current, subName] });
    }
  };

  const addCustomSubcategory = (mainId: string) => {
    const value = (customSubInput[mainId] || '').trim();
    if (!value) return;

    const current = categories[mainId] || [];
    if (current.includes(value)) {
      setCustomSubInput({ ...customSubInput, [mainId]: '' });
      return;
    }

    setCategories({ ...categories, [mainId]: [...current, value] });
    setCustomSubInput({ ...customSubInput, [mainId]: '' });
  };

  // Toggle activity type for a category
  const toggleActivityType = (mainId: string, activityType: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget') => {
    const current = categoryActivityTypes[mainId] || [];
    const mainCat = MAIN_CATEGORIES.find((c) => c.id === mainId);
    
    // Don't allow toggling if it's not available for this category
    if (mainCat && !mainCat.availableActivityTypes.includes(activityType)) {
      return;
    }

    if (current.includes(activityType)) {
      // Remove activity type
      const updated = current.filter((t) => t !== activityType);
      if (updated.length === 0) {
        // Don't allow removing all activity types - keep at least the default
        if (mainCat && mainCat.defaultActivityTypes.length > 0) {
          setCategoryActivityTypes({ ...categoryActivityTypes, [mainId]: mainCat.defaultActivityTypes });
        }
      } else {
        setCategoryActivityTypes({ ...categoryActivityTypes, [mainId]: updated });
      }
    } else {
      // Add activity type
      setCategoryActivityTypes({ ...categoryActivityTypes, [mainId]: [...current, activityType] });
    }
  };

  // Activity type labels and icons
  const activityTypeConfig = {
    income: { label: 'Receive', icon: 'arrow-down-circle', color: '#10B981' },
    expense: { label: 'Pay', icon: 'arrow-up-circle', color: '#EF4444' },
    goal: { label: 'Goal', icon: 'flag', color: '#3B82F6' },
    bill: { label: 'Bill', icon: 'receipt', color: '#F59E0B' },
    liability: { label: 'Liability', icon: 'card', color: '#8B5CF6' },
    budget: { label: 'Budget', icon: 'pie-chart', color: '#6366F1' },
  };

  // Preset colors and icons for custom categories
  const PRESET_COLORS = [
    '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899',
    '#F97316', '#6366F1', '#84CC16', '#06B6D4', '#F43F5E', '#8B5A2B'
  ];

  const COMMON_ICONS = [
    'home', 'car', 'restaurant', 'bag', 'medical', 'school',
    'airplane', 'gift', 'card', 'cash', 'trending-up', 'receipt',
    'wifi', 'call', 'flash', 'shield', 'play', 'time', 'flag',
    'briefcase', 'laptop', 'musical-notes', 'ellipsis-horizontal',
    'pizza', 'beer', 'game-controller', 'book', 'fitness', 'camera',
    'heart', 'star', 'moon', 'sunny', 'rainy', 'snow', 'basket', 'cafe',
    'build', 'water', 'cloud', 'shirt', 'cut', 'film', 'train', 'bus',
    'square', 'calendar', 'business', 'diamond', 'lock-closed',
  ];

  // Handle adding custom category
  const handleAddCustomCategory = () => {
    if (!newCategoryData.name.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }
    if (newCategoryData.subs.length === 0) {
      Alert.alert('Error', 'Please add at least one subcategory');
      return;
    }
    if (newCategoryData.activityTypes.length === 0) {
      Alert.alert('Error', 'Please select at least one activity type');
      return;
    }

    const newCategory = {
      id: `custom_${Date.now()}`,
      name: newCategoryData.name.trim(),
      icon: newCategoryData.icon,
      color: newCategoryData.color,
      subs: newCategoryData.subs,
      defaultActivityTypes: newCategoryData.activityTypes,
      availableActivityTypes: newCategoryData.activityTypes, // Can be expanded later
    };

    setCustomCategories([...customCategories, newCategory]);
    
    // Initialize category selection and activity types
    setCategories({ ...categories, [newCategory.id]: newCategoryData.subs });
    setCategoryActivityTypes({ ...categoryActivityTypes, [newCategory.id]: newCategoryData.activityTypes });

    // Reset form
    setNewCategoryData({
      name: '',
      icon: 'folder',
      color: '#3B82F6',
      subs: [],
      activityTypes: ['expense'],
    });
    setNewCategorySubInput('');
    setAddingCustomCategory(false);
  };

  const addSubcategoryToNewCategory = () => {
    const value = newCategorySubInput.trim();
    if (!value) return;
    if (newCategoryData.subs.includes(value)) {
      setNewCategorySubInput('');
      return;
    }
    setNewCategoryData({ ...newCategoryData, subs: [...newCategoryData.subs, value] });
    setNewCategorySubInput('');
  };

  const removeSubcategoryFromNewCategory = (sub: string) => {
    setNewCategoryData({ ...newCategoryData, subs: newCategoryData.subs.filter((s) => s !== sub) });
  };

  const toggleActivityTypeForNewCategory = (activityType: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget') => {
    const current = newCategoryData.activityTypes;
    if (current.includes(activityType)) {
      if (current.length === 1) {
        Alert.alert('Error', 'At least one activity type must be selected');
        return;
      }
      setNewCategoryData({ ...newCategoryData, activityTypes: current.filter((t) => t !== activityType) });
    } else {
      setNewCategoryData({ ...newCategoryData, activityTypes: [...current, activityType] });
    }
  };

  const removeCustomCategory = (categoryId: string) => {
    Alert.alert('Remove Category', 'Are you sure you want to remove this category?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setCustomCategories(customCategories.filter((c) => c.id !== categoryId));
          const updatedCategories = { ...categories };
          delete updatedCategories[categoryId];
          setCategories(updatedCategories);
          const updatedActivityTypes = { ...categoryActivityTypes };
          delete updatedActivityTypes[categoryId];
          setCategoryActivityTypes(updatedActivityTypes);
        },
      },
    ]);
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <View style={styles.stepContent}>
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>FULL NAME</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter your full name"
                placeholderTextColor="#666666"
                value={profileData.name}
                onChangeText={(value) => setProfileData((prev) => ({ ...prev, name: value }))}
                autoCapitalize="words"
              />
            </View>

            <CustomDropdown
              label="COUNTRY"
              value={profileData.country}
              options={COUNTRIES}
              onSelect={(value) => setProfileData((prev) => ({ ...prev, country: value }))}
              placeholder="Select your country"
              searchable
            />

            <CustomDropdown
              label="PROFESSION"
              value={profileData.profession}
              options={PROFESSIONS}
              onSelect={(value) => setProfileData((prev) => ({ ...prev, profession: value }))}
              placeholder="Select your profession"
            />

            <CustomDropdown
              label="CURRENCY"
              value={profileData.currency}
              options={currencies}
              onSelect={(value) => setProfileData((prev) => ({ ...prev, currency: value }))}
              placeholder="Select your currency"
              searchable
            />
          </View>
        );

      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionDescription}>
              Add organizations (banks, wallets, etc.) and their accounts. You can modify these later.
            </Text>

            {/* Organizations List */}
            {organizations.map((org, orgIndex) => (
              <View key={orgIndex} style={styles.orgContainer}>
                {/* Organization Header */}
                <TouchableOpacity
                  style={styles.orgHeader}
                  onPress={() => toggleOrganization(orgIndex)}
                >
                  <View style={styles.orgHeaderContent}>
                    <View style={styles.orgHeaderLeft}>
                      <View style={styles.orgIcon}>
                        <Ionicons name="business" size={20} color="#FFFFFF" />
                      </View>
                      <View>
                        <Text style={styles.orgName}>{org.name}</Text>
                        <Text style={styles.orgSubtext}>
                          {profileData.currency} ({CURRENCY_CONFIGS[profileData.currency]?.symbol || ''}) • {org.accounts.length} {org.accounts.length === 1 ? 'account' : 'accounts'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.orgHeaderActions}>
                      {editingOrgIndex === orgIndex ? (
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={handleSaveOrganization}
                        >
                          <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleEditOrganization(orgIndex)}
                          >
                            <Ionicons name="create-outline" size={20} color="#000000" />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.actionButton, styles.deleteButton]}
                            onPress={() => handleRemoveOrganization(orgIndex)}
                          >
                            <Ionicons name="trash-outline" size={20} color="#EF4444" />
                          </TouchableOpacity>
                        </>
                      )}
                      <Ionicons
                        name={expandedOrgIndex === orgIndex ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#666666"
                      />
                    </View>
                  </View>
                </TouchableOpacity>

                {/* Organization Edit Form */}
                {editingOrgIndex === orgIndex && (
                  <View style={styles.orgEditForm}>
                    <TextInput
                      style={styles.editInput}
                      value={newOrgName}
                      onChangeText={setNewOrgName}
                      placeholder="Organization name"
                      placeholderTextColor="#666666"
                    />
                    {/* Currency is locked - display readonly */}
                    <View style={styles.inputContainer}>
                      <Text style={styles.inputLabel}>CURRENCY (LOCKED)</Text>
                      <View style={styles.lockedCurrency}>
                        <Text style={styles.lockedCurrencyText}>
                          {profileData.currency} ({CURRENCY_CONFIGS[profileData.currency]?.symbol || ''})
                        </Text>
                        <Ionicons name="lock-closed" size={16} color="#666666" />
                      </View>
                      <Text style={styles.lockedCurrencyHint}>
                        Currency is set in Step 1 and cannot be changed here
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        setEditingOrgIndex(null);
                        setNewOrgName('');
                      }}
                    >
                      <Text style={styles.cancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Accounts under Organization (when expanded) */}
                {expandedOrgIndex === orgIndex && (
                  <View style={styles.accountsContainer}>
                    {org.accounts.map((account, accountIndex) => (
                      <View key={accountIndex} style={styles.accountItem}>
                        {editingAccount?.orgIndex === orgIndex && editingAccount?.accountIndex === accountIndex ? (
                          <View style={styles.accountEditForm}>
                            <TextInput
                              style={styles.editInput}
                              value={newAccountData.name}
                              onChangeText={(value) =>
                                setNewAccountData((prev) => ({ ...prev, name: value }))
                              }
                              placeholder="Account name"
                              placeholderTextColor="#666666"
                            />
                            <View style={styles.accountTypeRow}>
                              {accountTypes.map((type) => {
                                const isSelected = newAccountData.type === type.value;
                                return (
                                  <TouchableOpacity
                                    key={type.value}
                                    style={[
                                      styles.typeButtonSmall,
                                      isSelected && styles.typeButtonSelected,
                                    ]}
                                    onPress={() =>
                                      setNewAccountData((prev) => ({ ...prev, type: type.value as any, creditLimit: type.value === 'credit' ? prev.creditLimit : '' }))
                                    }
                                  >
                                    <Ionicons
                                      name={type.icon as any}
                                      size={16}
                                      color={isSelected ? '#FFFFFF' : '#FFFFFF'}
                                    />
                                    <Text
                                      style={[
                                        styles.typeButtonTextSmall,
                                        isSelected && styles.typeButtonTextSelected,
                                      ]}
                                    >
                                      {type.label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                            <TextInput
                              style={styles.editInput}
                              value={newAccountData.balance}
                              onChangeText={(value) =>
                                setNewAccountData((prev) => ({ ...prev, balance: value }))
                              }
                              placeholder="Initial balance (optional)"
                              placeholderTextColor="#666666"
                              keyboardType="numeric"
                            />
                            {newAccountData.type === 'credit' && (
                              <TextInput
                                style={styles.editInput}
                                value={newAccountData.creditLimit || ''}
                                onChangeText={(value) =>
                                  setNewAccountData((prev) => ({ ...prev, creditLimit: value }))
                                }
                                placeholder="Credit limit (required)"
                                placeholderTextColor="#666666"
                                keyboardType="numeric"
                              />
                            )}
                            <View style={styles.formActions}>
                              <TouchableOpacity
                                style={styles.saveButton}
                                onPress={handleSaveAccount}
                              >
                                <Text style={styles.saveButtonText}>Save</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={styles.cancelButton}
                                onPress={() => {
                                  setEditingAccount(null);
                                  setNewAccountData({
                                    name: '',
                                    type: 'debit',
                                    balance: '',
                                    creditLimit: '',
                                  });
                                }}
                              >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <View style={styles.accountItemContent}>
                            <View style={styles.accountItemInfo}>
                              <Text style={styles.accountItemName}>{account.name}</Text>
                              <Text style={styles.accountItemSubtext}>
                                {accountTypes.find((t) => t.value === account.type)?.label}
                                {account.balance ? ` • ${profileData.currency} ${account.balance}` : ''}
                                {account.type === 'credit' && account.creditLimit
                                  ? ` • Limit: ${profileData.currency} ${account.creditLimit}`
                                  : ''}
                              </Text>
                            </View>
                            <View style={styles.accountItemActions}>
                              <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => handleEditAccount(orgIndex, accountIndex)}
                              >
                                <Ionicons name="create-outline" size={20} color="#000000" />
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.actionButton, styles.deleteButton]}
                                onPress={() => handleRemoveAccount(orgIndex, accountIndex)}
                              >
                                <Ionicons name="trash-outline" size={20} color="#EF4444" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    ))}

                    {/* Add Account Form */}
                    {addingAccountToOrg === orgIndex ? (
                      <View style={styles.addAccountForm}>
                        <TextInput
                          style={styles.editInput}
                          value={newAccountData.name}
                          onChangeText={(value) =>
                            setNewAccountData((prev) => ({ ...prev, name: value }))
                          }
                          placeholder="Account name (e.g., Main Checking)"
                          placeholderTextColor="#666666"
                        />
                            <View style={styles.accountTypeRow}>
                              {accountTypes.map((type) => {
                                const isSelected = newAccountData.type === type.value;
                                return (
                                  <TouchableOpacity
                                    key={type.value}
                                    style={[
                                      styles.typeButtonSmall,
                                      isSelected && styles.typeButtonSelected,
                                    ]}
                                    onPress={() =>
                                      setNewAccountData((prev) => ({ ...prev, type: type.value as any, creditLimit: type.value === 'credit' ? prev.creditLimit : '' }))
                                    }
                                  >
                                    <Ionicons
                                      name={type.icon as any}
                                      size={16}
                                      color={isSelected ? '#FFFFFF' : '#FFFFFF'}
                                    />
                                    <Text
                                      style={[
                                        styles.typeButtonTextSmall,
                                        isSelected && styles.typeButtonTextSelected,
                                      ]}
                                    >
                                      {type.label}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                        </View>
                        <TextInput
                          style={styles.editInput}
                          value={newAccountData.balance}
                          onChangeText={(value) =>
                            setNewAccountData((prev) => ({ ...prev, balance: value }))
                          }
                          placeholder={`Initial balance (${profileData.currency}) - optional`}
                          placeholderTextColor="#666666"
                          keyboardType="numeric"
                        />
                        {newAccountData.type === 'credit' && (
                          <TextInput
                            style={styles.editInput}
                            value={newAccountData.creditLimit || ''}
                            onChangeText={(value) =>
                              setNewAccountData((prev) => ({ ...prev, creditLimit: value }))
                            }
                            placeholder={`Credit limit (${profileData.currency}) - required`}
                            placeholderTextColor="#666666"
                            keyboardType="numeric"
                          />
                        )}
                        <View style={styles.formActions}>
                          <TouchableOpacity
                            style={styles.addButton}
                            onPress={() => handleAddAccount(orgIndex)}
                          >
                            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                            <Text style={styles.addButtonText}>Add Account</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => {
                              setAddingAccountToOrg(null);
                              setNewAccountData({
                                name: '',
                                type: 'debit',
                                balance: '',
                                creditLimit: '',
                              });
                            }}
                          >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addAccountButton}
                        onPress={() => {
                          setAddingAccountToOrg(orgIndex);
                          setEditingAccount(null);
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={24} color="#000000" />
                        <Text style={styles.addAccountButtonText}>Add Account</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ))}

            {/* Add Organization Form */}
            <View style={styles.addOrgForm}>
              {editingOrgIndex === null && (
                <>
                  <TextInput
                    style={styles.addInput}
                    value={newOrgName}
                    onChangeText={setNewOrgName}
                    placeholder="Organization name (e.g., Bank of America, Chase)"
                    placeholderTextColor="#666666"
                  />
                  {/* Currency is locked - display readonly */}
                  <View style={styles.inputContainer}>
                    <Text style={styles.inputLabel}>CURRENCY (LOCKED)</Text>
                    <View style={styles.lockedCurrency}>
                      <Text style={styles.lockedCurrencyText}>
                        {profileData.currency} ({CURRENCY_CONFIGS[profileData.currency]?.symbol || ''})
                      </Text>
                      <Ionicons name="lock-closed" size={16} color="#666666" />
                    </View>
                    <Text style={styles.lockedCurrencyHint}>
                      Currency is set in Step 1 and applies to all organizations
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.addOrgButton} onPress={handleAddOrganization}>
                    <Ionicons name="add-circle-outline" size={24} color="#FFFFFF" />
                    <Text style={styles.addOrgButtonText}>Add Organization</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.sectionDescription}>
              Select how you want to organize your finances. You can customize everything later.
            </Text>

            {/* Categories Grid */}
            {[...MAIN_CATEGORIES, ...customCategories].map((cat) => {
              const isExpanded = expandedCategory === cat.id;
              const selectedSubs = categories[cat.id] || [];
              const hasSelection = selectedSubs.length > 0;

              return (
                <View key={cat.id} style={styles.categoryCard}>
                  {/* Category Header */}
                  <TouchableOpacity
                    style={[
                      styles.categoryHeader,
                      hasSelection && styles.categoryHeaderSelected,
                    ]}
                    onPress={() => setExpandedCategory(isExpanded ? null : cat.id)}
                  >
                    <View style={styles.categoryHeaderLeft}>
                      <View style={[styles.categoryIcon, { backgroundColor: cat.color }]}>
                        <Ionicons name={cat.icon as any} size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.categoryInfo}>
                        <Text style={styles.categoryName}>{cat.name}</Text>
                        <Text style={styles.categorySubtext}>
                          {hasSelection
                            ? `${selectedSubs.length} ${selectedSubs.length === 1 ? 'selected' : 'selected'}`
                            : 'Tap to expand'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.categoryHeaderRight}>
                      {cat.id.startsWith('custom_') && (
                        <TouchableOpacity
                          style={styles.deleteCategoryButton}
                          onPress={(e) => {
                            e.stopPropagation();
                            removeCustomCategory(cat.id);
                          }}
                        >
                          <Ionicons name="trash-outline" size={20} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={[
                          styles.categoryToggleButton,
                          hasSelection && styles.categoryToggleButtonSelected,
                        ]}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleMainCategory(cat.id);
                        }}
                      >
                        <Text
                          style={[
                            styles.categoryToggleText,
                            hasSelection && styles.categoryToggleTextSelected,
                          ]}
                        >
                          {hasSelection ? 'Selected' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#666666"
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Subcategories */}
                  {isExpanded && (
                    <View style={styles.subcategoriesContainer}>
                      <View style={styles.subcategoriesGrid}>
                        {cat.subs.map((sub) => {
                          const isSelected = selectedSubs.includes(sub);
                          return (
                            <TouchableOpacity
                              key={sub}
                              style={[
                                styles.subcategoryPill,
                                isSelected && styles.subcategoryPillSelected,
                              ]}
                              onPress={() => toggleSubcategory(cat.id, sub)}
                            >
                              <Text
                                style={[
                                  styles.subcategoryText,
                                  isSelected && styles.subcategoryTextSelected,
                                ]}
                              >
                                {sub}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Custom Subcategory Input */}
                      <View style={styles.customSubcategoryRow}>
                        <TextInput
                          style={styles.customSubcategoryInput}
                          value={customSubInput[cat.id] || ''}
                          onChangeText={(value) =>
                            setCustomSubInput({ ...customSubInput, [cat.id]: value })
                          }
                          placeholder="Add custom"
                          placeholderTextColor="#666666"
                        />
                        <TouchableOpacity
                          style={styles.addCustomButton}
                          onPress={() => addCustomSubcategory(cat.id)}
                        >
                          <Text style={styles.addCustomButtonText}>Add</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.selectedSubsText}>
                        Selected: {selectedSubs.join(', ') || 'None'}
                      </Text>

                      {/* Activity Types Selection */}
                      {hasSelection && (
                        <View style={styles.activityTypesSection}>
                          <Text style={styles.activityTypesLabel}>Use this category for:</Text>
                          <View style={styles.activityTypesGrid}>
                            {(cat.availableActivityTypes || cat.defaultActivityTypes).map((activityType) => {
                              const config = activityTypeConfig[activityType];
                              const isSelected = (categoryActivityTypes[cat.id] || []).includes(activityType);
                              return (
                                <TouchableOpacity
                                  key={activityType}
                                  style={[
                                    styles.activityTypePill,
                                    isSelected && styles.activityTypePillSelected,
                                  ]}
                                  onPress={() => toggleActivityType(cat.id, activityType)}
                                >
                                  <Ionicons
                                    name={config.icon as any}
                                    size={16}
                                    color={isSelected ? '#FFFFFF' : config.color}
                                    style={{ marginRight: 6 }}
                                  />
                                  <Text
                                    style={[
                                      styles.activityTypeText,
                                      isSelected && styles.activityTypeTextSelected,
                                    ]}
                                  >
                                    {config.label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <Text style={styles.activityTypesHint}>
                            Select how you&apos;ll use these categories (e.g., Pay for expenses, Set goals, etc.)
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add Custom Category */}
            {addingCustomCategory ? (
              <View style={styles.addCustomCategoryCard}>
                <View style={styles.addCustomCategoryHeader}>
                  <Text style={styles.addCustomCategoryTitle}>Create New Category</Text>
                  <TouchableOpacity onPress={() => setAddingCustomCategory(false)}>
                    <Ionicons name="close" size={24} color="#000000" />
                  </TouchableOpacity>
                </View>

                <View style={styles.addCustomCategoryForm}>
                  <Text style={styles.inputLabel}>Category Name</Text>
                  <TextInput
                    style={styles.addInput}
                    value={newCategoryData.name}
                    onChangeText={(value) => setNewCategoryData({ ...newCategoryData, name: value })}
                    placeholder="e.g., Pets, Gaming, etc."
                    placeholderTextColor="#666666"
                  />

                  <Text style={styles.inputLabel}>Color</Text>
                  <View style={styles.colorGrid}>
                    {PRESET_COLORS.map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          { backgroundColor: color },
                          newCategoryData.color === color && styles.selectedColorOption,
                        ]}
                        onPress={() => setNewCategoryData({ ...newCategoryData, color })}
                      >
                        {newCategoryData.color === color && (
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Icon</Text>
                  <View style={styles.iconGrid}>
                    {COMMON_ICONS.map((icon) => (
                      <TouchableOpacity
                        key={icon}
                        style={[
                          styles.iconOption,
                          newCategoryData.icon === icon && styles.selectedIconOption,
                        ]}
                        onPress={() => setNewCategoryData({ ...newCategoryData, icon })}
                      >
                        <Ionicons
                          name={icon as any}
                          size={24}
                          color={newCategoryData.icon === icon ? newCategoryData.color : '#6B7280'}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inputLabel}>Activity Types</Text>
                  <View style={styles.activityTypesGrid}>
                    {Object.entries(activityTypeConfig).map(([key, config]) => {
                      const activityType = key as 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget';
                      const isSelected = newCategoryData.activityTypes.includes(activityType);
                      return (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.activityTypePill,
                            isSelected && styles.activityTypePillSelected,
                          ]}
                          onPress={() => toggleActivityTypeForNewCategory(activityType)}
                        >
                          <Ionicons
                            name={config.icon as any}
                            size={16}
                            color={isSelected ? '#FFFFFF' : config.color}
                            style={{ marginRight: 6 }}
                          />
                          <Text
                            style={[
                              styles.activityTypeText,
                              isSelected && styles.activityTypeTextSelected,
                            ]}
                          >
                            {config.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text style={styles.inputLabel}>Subcategories</Text>
                  <View style={styles.subcategoriesGrid}>
                    {newCategoryData.subs.map((sub) => (
                      <View key={sub} style={styles.subcategoryPillSelected}>
                        <Text style={styles.subcategoryTextSelected}>{sub}</Text>
                        <TouchableOpacity
                          onPress={() => removeSubcategoryFromNewCategory(sub)}
                          style={{ marginLeft: 8 }}
                        >
                          <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                  <View style={styles.customSubcategoryRow}>
                    <TextInput
                      style={styles.customSubcategoryInput}
                      value={newCategorySubInput}
                      onChangeText={setNewCategorySubInput}
                      placeholder="Add subcategory"
                      placeholderTextColor="#666666"
                      onSubmitEditing={addSubcategoryToNewCategory}
                    />
                    <TouchableOpacity style={styles.addCustomButton} onPress={addSubcategoryToNewCategory}>
                      <Text style={styles.addCustomButtonText}>Add</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.addCustomCategoryButton} onPress={handleAddCustomCategory}>
                    <Text style={styles.addCustomCategoryButtonText}>Add Category</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addCategoryButton}
                onPress={() => setAddingCustomCategory(true)}
              >
                <Ionicons name="add-circle-outline" size={24} color="#000000" />
                <Text style={styles.addCategoryButtonText}>Add Custom Category</Text>
              </TouchableOpacity>
            )}

            {/* Bottom Message */}
            <View style={styles.categoryFooter}>
              <Text style={styles.categoryFooterText}>
                Your budgets, goals, bills, and reports will use these categories. You can edit
                them later.
              </Text>
            </View>
          </View>
        );

      case 3:
        // Preview/Summary Step
        const allCategoriesForPreview = [...MAIN_CATEGORIES, ...customCategories];
        const totalAccounts = organizations.reduce((sum, org) => sum + org.accounts.length, 0);
        const totalBalance = organizations.reduce((sum, org) => {
          const orgBalance = org.accounts.reduce((accSum, acc) => {
            const balance = parseFloat(acc.balance || '0') || 0;
            return accSum + balance;
          }, 0);
          return sum + orgBalance;
        }, 0);
        const selectedCategoriesCount = Object.values(categories).reduce((sum, subs) => sum + subs.length, 0);

        return (
          <View style={styles.stepContent}>
            <Text style={styles.previewTitle}>Review Your Setup</Text>
            <Text style={styles.previewSubtitle}>
              Please review all the information below. You can go back to make changes.
            </Text>

            {/* Personal Information Section */}
            <View style={styles.previewSection}>
              <View style={styles.previewSectionHeader}>
                <Ionicons name="person" size={24} color="#000000" />
                <Text style={styles.previewSectionTitle}>Personal Information</Text>
              </View>
              <View style={styles.previewCard}>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Full Name</Text>
                  <Text style={styles.previewValue}>{profileData.name || 'Not provided'}</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Country</Text>
                  <Text style={styles.previewValue}>
                    {profileData.country
                      ? COUNTRIES.find((c) => c.value === profileData.country)?.label || profileData.country
                      : 'Not provided'}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Profession</Text>
                  <Text style={styles.previewValue}>
                    {profileData.profession
                      ? PROFESSIONS.find((p) => p.value === profileData.profession)?.label || profileData.profession
                      : 'Not provided'}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Currency</Text>
                  <Text style={styles.previewValue}>
                    {profileData.currency} ({CURRENCY_CONFIGS[profileData.currency]?.symbol || ''})
                  </Text>
                </View>
              </View>
            </View>

            {/* Organizations & Accounts Section */}
            <View style={styles.previewSection}>
              <View style={styles.previewSectionHeader}>
                <Ionicons name="business" size={24} color="#000000" />
                <Text style={styles.previewSectionTitle}>Organizations & Accounts</Text>
              </View>
              {organizations.length === 0 ? (
                <View style={styles.previewCard}>
                  <Text style={styles.previewEmptyText}>No organizations added</Text>
                </View>
              ) : (
                organizations.map((org, orgIndex) => (
                  <View key={orgIndex} style={styles.previewCard}>
                    <View style={styles.previewOrgHeader}>
                      <View style={styles.previewOrgIcon}>
                        <Ionicons name="business" size={20} color="#FFFFFF" />
                      </View>
                      <View style={styles.previewOrgInfo}>
                        <Text style={styles.previewOrgName}>{org.name}</Text>
                        <Text style={styles.previewOrgSubtext}>
                          {profileData.currency} ({CURRENCY_CONFIGS[profileData.currency]?.symbol || ''}) • {org.accounts.length} {org.accounts.length === 1 ? 'account' : 'accounts'}
                        </Text>
                      </View>
                    </View>
                    {org.accounts.length > 0 ? (
                      <View style={styles.previewAccountsList}>
                        {org.accounts.map((account, accIndex) => {
                          const balance = parseFloat(account.balance || '0') || 0;
                          const accountType = accountTypes.find((t) => t.value === account.type);
                          return (
                            <View key={accIndex} style={styles.previewAccountItem}>
                              <View style={styles.previewAccountLeft}>
                                <Ionicons
                                  name={accountType?.icon as any || 'card-outline'}
                                  size={18}
                                  color="#666666"
                                />
                                <View style={styles.previewAccountInfo}>
                                  <Text style={styles.previewAccountName}>{account.name}</Text>
                                  <Text style={styles.previewAccountType}>{accountType?.label || account.type}</Text>
                                </View>
                              </View>
                              <View style={styles.previewAccountRight}>
                                {balance > 0 && (
                                  <Text style={styles.previewAccountBalance}>
                                    {formatCurrency(balance, profileData.currency)}
                                  </Text>
                                )}
                                {account.type === 'credit' && account.creditLimit && (
                                  <Text style={styles.previewAccountLimit}>
                                    Limit: {formatCurrency(parseFloat(account.creditLimit), profileData.currency)}
                                  </Text>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.previewEmptyText}>No accounts in this organization</Text>
                    )}
                  </View>
                ))
              )}
              {organizations.length > 0 && (
                <View style={styles.previewSummaryCard}>
                  <View style={styles.previewSummaryRow}>
                    <Text style={styles.previewSummaryLabel}>Total Organizations</Text>
                    <Text style={styles.previewSummaryValue}>{organizations.length}</Text>
                  </View>
                  <View style={styles.previewSummaryRow}>
                    <Text style={styles.previewSummaryLabel}>Total Accounts</Text>
                    <Text style={styles.previewSummaryValue}>{totalAccounts}</Text>
                  </View>
                  {totalBalance > 0 && (
                    <View style={styles.previewSummaryRow}>
                      <Text style={styles.previewSummaryLabel}>Total Initial Balance</Text>
                      <Text style={[styles.previewSummaryValue, styles.previewSummaryAmount]}>
                        {formatCurrency(totalBalance, profileData.currency)}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* Categories Section */}
            <View style={styles.previewSection}>
              <View style={styles.previewSectionHeader}>
                <Ionicons name="grid" size={24} color="#000000" />
                <Text style={styles.previewSectionTitle}>Categories</Text>
              </View>
              {selectedCategoriesCount === 0 ? (
                <View style={styles.previewCard}>
                  <Text style={styles.previewEmptyText}>No categories selected</Text>
                </View>
              ) : (
                <>
                  {allCategoriesForPreview.map((cat) => {
                    const selectedSubs = categories[cat.id] || [];
                    if (selectedSubs.length === 0) return null;

                    const activityTypes = categoryActivityTypes[cat.id] || cat.defaultActivityTypes || [];
                    const activityTypeLabels = activityTypes
                      .map((type) => activityTypeConfig[type]?.label)
                      .filter(Boolean)
                      .join(', ');

                    return (
                      <View key={cat.id} style={styles.previewCard}>
                        <View style={styles.previewCategoryHeader}>
                          <View style={[styles.previewCategoryIcon, { backgroundColor: cat.color }]}>
                            <Ionicons name={cat.icon as any} size={18} color="#FFFFFF" />
                          </View>
                          <View style={styles.previewCategoryInfo}>
                            <Text style={styles.previewCategoryName}>{cat.name}</Text>
                            {activityTypeLabels && (
                              <Text style={styles.previewCategoryActivityTypes}>
                                Used for: {activityTypeLabels}
                              </Text>
                            )}
                          </View>
                        </View>
                        <View style={styles.previewCategorySubs}>
                          {selectedSubs.map((sub, index) => (
                            <View key={index} style={styles.previewCategorySubPill}>
                              <Text style={styles.previewCategorySubText}>{sub}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                  <View style={styles.previewSummaryCard}>
                    <View style={styles.previewSummaryRow}>
                      <Text style={styles.previewSummaryLabel}>Total Categories Selected</Text>
                      <Text style={styles.previewSummaryValue}>{selectedCategoriesCount}</Text>
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Final Message */}
            <View style={styles.previewFooter}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
              <Text style={styles.previewFooterTitle}>Ready to Get Started!</Text>
              <Text style={styles.previewFooterText}>
                Everything looks good. Click &quot;Complete Setup&quot; to finish onboarding and start managing your finances.
              </Text>
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  // Auto-navigate on success (Phase 7)
  // IMPORTANT: This hook must be called BEFORE any conditional returns
  // to maintain consistent hook order between renders
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        router.replace('/(tabs)');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showSuccess]);

  // Show loading while checking onboarding status
  // This early return must come AFTER all hooks
  if (checkingExisting) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFF0F0" />
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Ionicons name="wallet" size={60} color="#000000" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF0F0" />
      
      {/* Loading Overlay (Phase 6) */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color="#000000" />
            <Text style={styles.progressMessage}>{progressMessage || 'Processing...'}</Text>
          </View>
        </View>
      )}

      {/* Success Overlay (Phase 7) */}
      {showSuccess && (
        <View style={styles.successOverlay}>
          <View style={styles.successContent}>
            <Animated.View style={styles.checkmarkContainer}>
              <Ionicons name="checkmark-circle" size={80} color="#10B981" />
            </Animated.View>
            <Text style={styles.welcomeMessage}>{successMessage || `Welcome to FinTrack, ${profileData.name}!`}</Text>
            {successSummary && (
              <Text style={styles.successDetails}>
                {successSummary.organizationsCount} organization{successSummary.organizationsCount !== 1 ? 's' : ''} • 
                {successSummary.accountsCount} account{successSummary.accountsCount !== 1 ? 's' : ''} • 
                {successSummary.categoriesCount} categor{successSummary.categoriesCount !== 1 ? 'ies' : 'y'}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Error Overlay (Phase 8) */}
      {errorState && (
        <View style={styles.errorOverlay}>
          <View style={styles.errorContent}>
            <Ionicons name="alert-circle" size={60} color="#EF4444" />
            <Text style={styles.errorTitle}>Setup Failed</Text>
            <Text style={styles.errorMessageText}>{errorState.message}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={() => {
                  setErrorState(null);
                  setCurrentStep(3); // Go back to review step
                }}
              >
                <Text style={styles.secondaryButtonText}>Go Back</Text>
              </TouchableOpacity>
              {errorState.canRetry && (
                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={() => {
                    setErrorState(null);
                    handleComplete();
                  }}
                >
                  <Text style={styles.primaryButtonText}>Try Again</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${((currentStep + 1) / steps.length) * 100}%` },
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
                disabled={currentStep === 0 || isLoading}
              >
                <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
                <Text style={styles.navButtonText}>Back</Text>
              </TouchableOpacity>

              {currentStep === 2 && (
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleComplete}
                  disabled={isLoading}
                >
                  <Text style={styles.skipButtonText}>Skip</Text>
                </TouchableOpacity>
              )}
              {currentStep === 3 && (
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={() => setCurrentStep(2)}
                  disabled={isLoading}
                >
                  <Text style={styles.skipButtonText}>Edit</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.navButton, isLoading && styles.navButtonDisabled]}
                onPress={handleNext}
                disabled={isLoading}
              >
                <Text style={styles.navButtonText}>
                  {isLoading
                    ? 'Saving...'
                    : currentStep === steps.length - 1
                    ? 'Complete Setup'
                    : 'Next'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF0F0',
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
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
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 2,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#000000',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'InstrumentSerif-Regular',
  },
  content: {
    flex: 1,
    paddingVertical: 20,
  },
  stepHeader: {
    marginBottom: 40,
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    fontFamily: 'InstrumentSerif-Regular',
  },
  stepContent: {
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 8,
    fontFamily: 'Poppins-SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    backgroundColor: '#2E2E2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
    minHeight: 52,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 24,
    fontFamily: 'InstrumentSerif-Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  orgContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  orgHeader: {
    padding: 16,
  },
  orgHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orgHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  orgIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  orgName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  orgSubtext: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  orgHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orgEditForm: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    gap: 12,
  },
  accountsContainer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
    padding: 16,
    paddingTop: 12,
  },
  accountItem: {
    marginBottom: 12,
  },
  accountItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  accountItemInfo: {
    flex: 1,
    marginLeft: 32,
  },
  accountItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  accountItemSubtext: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  accountItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  accountEditForm: {
    marginLeft: 32,
    gap: 12,
  },
  addAccountForm: {
    marginLeft: 32,
    marginTop: 8,
    gap: 12,
  },
  addAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.2)',
    borderStyle: 'dashed',
    borderRadius: 12,
    gap: 8,
  },
  addAccountButtonText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  editInput: {
    backgroundColor: '#2E2E2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
    minHeight: 52,
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  typeButtonSmall: {
    flex: 1,
    minWidth: 80,
    backgroundColor: '#2E2E2E',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonSelected: {
    backgroundColor: '#000000',
    borderColor: '#000000',
  },
  typeButtonTextSmall: {
    fontSize: 12,
    color: '#FFFFFF',
    fontFamily: 'Poppins-SemiBold',
  },
  typeButtonTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 50,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  addOrgForm: {
    marginTop: 24,
    gap: 12,
  },
  addInput: {
    backgroundColor: '#2E2E2E',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'InstrumentSerif-Regular',
    minHeight: 52,
  },
  addOrgButton: {
    backgroundColor: '#000000',
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 8,
  },
  addOrgButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  addButton: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 50,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 50,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  placeholderText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    fontFamily: 'InstrumentSerif-Regular',
    paddingVertical: 40,
  },
  navigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 20,
    marginBottom: 20,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 50,
    paddingHorizontal: 24,
    paddingVertical: 16,
    minWidth: 120,
    justifyContent: 'center',
    gap: 8,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#000000',
    marginTop: 20,
    fontWeight: '600',
    fontFamily: 'Poppins-SemiBold',
  },
  // Loading Overlay (Phase 6)
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 240, 240, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  progressMessage: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    textAlign: 'center',
    marginTop: 16,
  },
  // Success Overlay (Phase 7)
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 240, 240, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  successContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  checkmarkContainer: {
    marginBottom: 8,
  },
  welcomeMessage: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  successDetails: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  // Error Overlay (Phase 8)
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 240, 240, 0.98)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1002,
  },
  errorContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
    maxWidth: '80%',
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000000',
    fontFamily: 'Poppins-Bold',
    textAlign: 'center',
    marginTop: 8,
  },
  errorMessageText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  button: {
    flex: 1,
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryButton: {
    backgroundColor: '#000000',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  secondaryButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  categoryHeaderSelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  categoryHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  categorySubtext: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  categoryHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryToggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  categoryToggleButtonSelected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#648687',
  },
  categoryToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
    fontFamily: 'Poppins-SemiBold',
  },
  categoryToggleTextSelected: {
    color: '#000000',
  },
  subcategoriesContainer: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  subcategoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  subcategoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'transparent',
  },
  subcategoryPillSelected: {
    backgroundColor: '#648687',
    borderColor: '#648687',
  },
  subcategoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Poppins-Medium',
  },
  subcategoryTextSelected: {
    color: '#FFFFFF',
  },
  customSubcategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  customSubcategoryInput: {
    flex: 1,
    backgroundColor: '#F8F8F8',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: '#000000',
    fontFamily: 'InstrumentSerif-Regular',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 40,
  },
  addCustomButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#000000',
    minHeight: 40,
    justifyContent: 'center',
  },
  addCustomButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  selectedSubsText: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 4,
  },
  categoryFooter: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  categoryFooterText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    lineHeight: 20,
    textAlign: 'center',
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 50,
    backgroundColor: 'transparent',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    fontFamily: 'Poppins-SemiBold',
  },
  activityTypesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  activityTypesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 12,
  },
  activityTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  activityTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  activityTypePillSelected: {
    backgroundColor: '#648687',
    borderColor: '#648687',
  },
  activityTypeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#000000',
    fontFamily: 'Poppins-Medium',
  },
  activityTypeTextSelected: {
    color: '#FFFFFF',
  },
  activityTypesHint: {
    fontSize: 11,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    marginTop: 4,
    fontStyle: 'italic',
  },
  addCategoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E6E6E6',
    borderStyle: 'dashed',
    marginBottom: 12,
    gap: 8,
  },
  addCategoryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  addCustomCategoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    overflow: 'hidden',
  },
  addCustomCategoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  addCustomCategoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'Poppins-Bold',
  },
  addCustomCategoryForm: {
    padding: 16,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedColorOption: {
    borderColor: '#000000',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F8F8',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedIconOption: {
    borderColor: '#648687',
    backgroundColor: '#FFFFFF',
  },
  addCustomCategoryButton: {
    backgroundColor: '#000000',
    borderRadius: 50,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  addCustomCategoryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins-Bold',
  },
  deleteCategoryButton: {
    padding: 4,
    marginRight: 8,
  },
  previewTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'HelveticaNeue-Bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  previewSubtitle: {
    fontSize: 16,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 22,
  },
  previewSection: {
    marginBottom: 32,
  },
  previewSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  previewSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'HelveticaNeue-Bold',
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    marginBottom: 12,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  previewLabel: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    flex: 1,
  },
  previewValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    flex: 1,
    textAlign: 'right',
  },
  previewOrgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewOrgIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#648687',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  previewOrgInfo: {
    flex: 1,
  },
  previewOrgName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  previewOrgSubtext: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  previewAccountsList: {
    marginTop: 8,
  },
  previewAccountItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingLeft: 28,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  previewAccountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  previewAccountInfo: {
    flex: 1,
  },
  previewAccountName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 2,
  },
  previewAccountType: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  previewAccountRight: {
    alignItems: 'flex-end',
  },
  previewAccountBalance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 2,
  },
  previewAccountLimit: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  previewSummaryCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  previewSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  previewSummaryLabel: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  previewSummaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
  },
  previewSummaryAmount: {
    color: '#10B981',
    fontSize: 18,
  },
  previewCategoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  previewCategoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  previewCategoryInfo: {
    flex: 1,
  },
  previewCategoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    fontFamily: 'Poppins-SemiBold',
    marginBottom: 4,
  },
  previewCategoryActivityTypes: {
    fontSize: 12,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
  },
  previewCategorySubs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  previewCategorySubPill: {
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  previewCategorySubText: {
    fontSize: 13,
    color: '#000000',
    fontFamily: 'Poppins-Medium',
  },
  previewEmptyText: {
    fontSize: 14,
    color: '#999999',
    fontFamily: 'InstrumentSerif-Regular',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 20,
  },
  previewFooter: {
    alignItems: 'center',
    padding: 32,
    marginTop: 16,
  },
  previewFooterTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#000000',
    fontFamily: 'HelveticaNeue-Bold',
    marginTop: 16,
    marginBottom: 8,
  },
  previewFooterText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: 'InstrumentSerif-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  lockedCurrency: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    minHeight: 52,
  },
  lockedCurrencyText: {
    fontSize: 16,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#000000',
    flex: 1,
  },
  lockedCurrencyHint: {
    fontSize: 12,
    fontFamily: 'InstrumentSerif-Regular',
    color: '#999999',
    marginTop: 6,
    fontStyle: 'italic',
  },
});

