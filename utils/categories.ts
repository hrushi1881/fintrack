import { supabase } from '../lib/supabase';
import { Category, CategoryStats } from '../types';

export interface CategoryFilters {
  activityType?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface CreateCategoryData {
  name: string;
  color: string;
  icon: string;
  activity_types: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  parent_id?: string | null; // Optional parent category ID for subcategories
}

export interface UpdateCategoryData extends Partial<CreateCategoryData> {
  id: string;
}

/**
 * Fetch categories for a user with optional filtering
 */
export async function fetchCategories(
  userId: string, 
  filters: CategoryFilters = {}
): Promise<Category[]> {
  try {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('name');

    // Apply activity type filter
    if (filters.activityType) {
      query = query.contains('activity_types', [filters.activityType]);
    }

    // Apply search filter
    if (filters.search) {
      query = query.ilike('name', `%${filters.search}%`);
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchCategories:', error);
    throw error;
  }
}

/**
 * Check if a category name exists and suggest updating instead of creating
 */
export async function checkCategoryExists(
  userId: string, 
  name: string, 
  requestedActivityTypes: string[],
  parentId?: string | null
): Promise<{ exists: boolean; existingCategory?: Category; suggestion?: string }> {
  try {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('name', name.trim())
      .eq('is_deleted', false);

    // Parent scoping: allow same name under different parents
    if (parentId) {
      query = query.eq('parent_id', parentId);
    } else {
      query = query.is('parent_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    if (!existing) {
      return { exists: false };
    }

    const existingTypes = existing.activity_types || [];
    const hasAllTypes = requestedActivityTypes.every(type => existingTypes.includes(type));
    
    if (hasAllTypes) {
      return { 
        exists: true, 
        existingCategory: existing,
        suggestion: 'Category already exists with the same activity types'
      };
    } else {
      const missingTypes = requestedActivityTypes.filter(type => !existingTypes.includes(type));
      return { 
        exists: true, 
        existingCategory: existing,
        suggestion: `Category exists with activity types: ${existingTypes.join(', ')}. You can edit it to add: ${missingTypes.join(', ')}`
      };
    }
  } catch (error) {
    console.error('Error checking category existence:', error);
    return { exists: false };
  }
}

/**
 * Create a new category
 */
export async function createCategory(data: CreateCategoryData): Promise<Category> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Check for duplicate name
    let dupQuery = supabase
      .from('categories')
      .select('id, activity_types')
      .eq('user_id', user.user.id)
      .eq('name', data.name.trim())
      .eq('is_deleted', false);

    if (data.parent_id) {
      dupQuery = dupQuery.eq('parent_id', data.parent_id);
    } else {
      dupQuery = dupQuery.is('parent_id', null);
    }

    const { data: existing } = await dupQuery.maybeSingle();

    if (existing) {
      // Check if the existing category already has the requested activity types
      const existingTypes = existing.activity_types || [];
      const requestedTypes = data.activity_types || [];
      const hasAllTypes = requestedTypes.every(type => existingTypes.includes(type));
      
      if (hasAllTypes) {
        throw new Error('Category with this name already exists with the same activity types');
      } else {
        throw new Error(`Category "${data.name}" already exists. You can edit it to add more activity types (${existingTypes.join(', ')}) or choose a different name.`);
      }
    }

    const { data: category, error } = await supabase
      .from('categories')
      .insert({
        user_id: user.user.id,
        name: data.name,
        color: data.color,
        icon: data.icon,
        activity_types: data.activity_types,
        parent_id: data.parent_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating category:', error);
      if (error.code === '23505') {
        throw new Error('A category with this name already exists. Please choose a different name.');
      }
      throw error;
    }

    return category;
  } catch (error) {
    console.error('Error in createCategory:', error);
    throw error;
  }
}

/**
 * Update an existing category
 */
export async function updateCategory(data: UpdateCategoryData): Promise<Category> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Check for duplicate name if name is being updated
    if (data.name) {
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.user.id)
        .eq('name', data.name)
        .eq('is_deleted', false)
        .neq('id', data.id)
        .single();

      if (existing) {
        throw new Error('Category with this name already exists');
      }
    }

    const { data: category, error } = await supabase
      .from('categories')
      .update({
        name: data.name,
        color: data.color,
        icon: data.icon,
        activity_types: data.activity_types,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating category:', error);
      if (error.code === '23505') {
        throw new Error('A category with this name already exists. Please choose a different name.');
      }
      throw error;
    }

    return category;
  } catch (error) {
    console.error('Error in updateCategory:', error);
    throw error;
  }
}

/**
 * Delete a category (soft delete)
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Check if category is in use
    const { data: inUse } = await supabase
      .from('transactions')
      .select('id')
      .eq('category_id', categoryId)
      .limit(1)
      .single();

    if (inUse) {
      throw new Error('Cannot delete category that is being used by transactions');
    }

    const { error } = await supabase
      .from('categories')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', categoryId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error deleting category:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    throw error;
  }
}


/**
 * Get all transactions for a specific category
 */
export async function getCategoryTransactions(
  categoryId: string,
  filters: {
    startDate?: string;
    endDate?: string;
    accountId?: string;
    type?: 'income' | 'expense' | 'transfer';
    limit?: number;
    offset?: number;
  } = {}
) {
  try {
    let query = supabase
      .from('transactions')
      .select(`
        *,
        account:accounts!transactions_account_id_fkey(id, name, type, color, icon),
        from_account:accounts!transactions_from_account_id_fkey(id, name, type, color, icon),
        to_account:accounts!transactions_to_account_id_fkey(id, name, type, color, icon)
      `)
      .eq('category_id', categoryId)
      .order('date', { ascending: false });

    // Apply date filters
    if (filters.startDate) {
      query = query.gte('date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('date', filters.endDate);
    }

    // Apply account filter
    if (filters.accountId) {
      query = query.eq('account_id', filters.accountId);
    }

    // Apply type filter
    if (filters.type) {
      query = query.eq('type', filters.type);
    }

    // Apply pagination
    if (filters.limit) {
      query = query.limit(filters.limit);
    }
    if (filters.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching category transactions:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getCategoryTransactions:', error);
    throw error;
  }
}

/**
 * Get connected items for a category (budgets, bills, goals, liabilities)
 */
export async function getCategoryConnectedItems(categoryId: string) {
  try {
    const [budgets, bills, goals, liabilities] = await Promise.all([
      // Budgets
      supabase
        .from('budgets')
        .select('id, name, amount, spent_amount, budget_type, start_date, end_date')
        .eq('category_id', categoryId)
        .eq('is_deleted', false),
      
      // Bills
      supabase
        .from('bills')
        .select('id, title, amount, due_date, status, bill_type')
        .eq('category_id', categoryId)
        .eq('is_deleted', false),
      
      // Goals
      supabase
        .from('goals')
        .select('id, title, target_amount, current_amount, target_date, is_achieved')
        .eq('category_id', categoryId)
        .eq('is_deleted', false),
      
      // Liabilities (if they have category_id field)
      supabase
        .from('liabilities')
        .select('id, title, amount, interest_rate, due_date')
        .eq('category_id', categoryId)
        .eq('is_deleted', false)
    ]);

    return {
      budgets: budgets.data || [],
      bills: bills.data || [],
      goals: goals.data || [],
      liabilities: liabilities.data || [],
    };
  } catch (error) {
    console.error('Error in getCategoryConnectedItems:', error);
    throw error;
  }
}

/**
 * Update category statistics (recalculate cached values)
 */
export async function updateCategoryStatistics(categoryId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('update_category_statistics', {
      category_id: categoryId
    });

    if (error) {
      console.error('Error updating category statistics:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in updateCategoryStatistics:', error);
    throw error;
  }
}

/**
 * Seed default categories for a new user
 */
export async function seedDefaultCategories(userId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('seed_default_categories', {
      user_uuid: userId
    });

    if (error) {
      console.error('Error seeding default categories:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in seedDefaultCategories:', error);
    throw error;
  }
}

/**
 * Get categories by activity type
 */
export async function getCategoriesByActivityType(
  userId: string, 
  activityType: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget'
): Promise<Category[]> {
  return fetchCategories(userId, { activityType });
}

/**
 * Get parent categories (main categories) - categories without a parent
 */
export async function getParentCategories(
  userId: string,
  activityType?: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget'
): Promise<Category[]> {
  try {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .is('parent_id', null) // Only parent categories
      .eq('is_deleted', false)
      .order('name');

    // Apply activity type filter if provided
    if (activityType) {
      query = query.contains('activity_types', [activityType]);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching parent categories:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getParentCategories:', error);
    throw error;
  }
}

/**
 * Get subcategories for a parent category
 */
export async function getSubcategories(
  userId: string,
  parentCategoryId: string
): Promise<Category[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('parent_id', parentCategoryId)
      .eq('is_deleted', false)
      .order('name');

    if (error) {
      console.error('Error fetching subcategories:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getSubcategories:', error);
    throw error;
  }
}

/**
 * Get categories grouped by parent (hierarchical structure)
 * Returns a map of parent category ID -> array of subcategories
 */
export async function getCategoriesGroupedByParent(
  userId: string,
  activityType?: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget'
): Promise<Map<string, { parent: Category; subcategories: Category[] }>> {
  try {
    // Get all parent categories
    const parents = await getParentCategories(userId, activityType);
    
    // Get all categories (including subcategories)
    const allCategories = await fetchCategories(userId, activityType ? { activityType } : {});
    
    // Group subcategories by parent
    const grouped = new Map<string, { parent: Category; subcategories: Category[] }>();
    
    parents.forEach(parent => {
      const subcategories = allCategories.filter(cat => cat.parent_id === parent.id);
      grouped.set(parent.id, {
        parent,
        subcategories,
      });
    });
    
    return grouped;
  } catch (error) {
    console.error('Error in getCategoriesGroupedByParent:', error);
    throw error;
  }
}

/**
 * Find or create a category with parent relationship
 * If category exists, returns it. If not, creates it with parent_id if provided.
 */
export async function findOrCreateCategory(
  userId: string,
  categoryName: string,
  activityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[],
  options?: {
    color?: string;
    icon?: string;
    parent_id?: string | null;
  }
): Promise<Category> {
  try {
    // Check if category already exists
    let existingQuery = supabase
      .from('categories')
      .select('*')
      .eq('user_id', userId)
      .eq('name', categoryName.trim())
      .eq('is_deleted', false);

    if (options?.parent_id) {
      existingQuery = existingQuery.eq('parent_id', options.parent_id);
    } else {
      existingQuery = existingQuery.is('parent_id', null);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      // Check if we need to update activity types or parent_id
      const existingTypes = existing.activity_types || [];
      const mergedTypes = Array.from(new Set([...existingTypes, ...activityTypes]));
      const needsUpdate = 
        mergedTypes.length !== existingTypes.length ||
        (options?.parent_id !== undefined && existing.parent_id !== options.parent_id);

      if (needsUpdate) {
        const updateData: any = {};
        if (mergedTypes.length !== existingTypes.length) {
          updateData.activity_types = mergedTypes;
        }
        if (options?.parent_id !== undefined && existing.parent_id !== options.parent_id) {
          updateData.parent_id = options.parent_id;
        }

        const { data: updated, error: updateError } = await supabase
          .from('categories')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        return updated;
      }

      return existing;
    }

    // Create new category
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: newCategory, error: createError } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name: categoryName.trim(),
        color: options?.color || '#3B82F6',
        icon: options?.icon || 'folder',
        activity_types: activityTypes,
        parent_id: options?.parent_id || null,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating category:', createError);
      throw createError;
    }

    return newCategory;
  } catch (error) {
    console.error('Error in findOrCreateCategory:', error);
    throw error;
  }
}

/**
 * Delete a category and all its subcategories (cascade delete)
 */
export async function deleteCategoryWithSubcategories(categoryId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get all subcategories
    const { data: subcategories } = await supabase
      .from('categories')
      .select('id')
      .eq('parent_id', categoryId)
      .eq('is_deleted', false);

    // Delete all subcategories first
    if (subcategories && subcategories.length > 0) {
      const subcategoryIds = subcategories.map(sub => sub.id);
      const { error: subError } = await supabase
        .from('categories')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in('id', subcategoryIds)
        .eq('user_id', user.user.id);

      if (subError) {
        console.error('Error deleting subcategories:', subError);
        throw subError;
      }
    }

    // Delete parent category
    await deleteCategory(categoryId);
  } catch (error) {
    console.error('Error in deleteCategoryWithSubcategories:', error);
    throw error;
  }
}

/**
 * Search categories by name
 */
export async function searchCategories(
  userId: string, 
  searchTerm: string
): Promise<Category[]> {
  return fetchCategories(userId, { search: searchTerm });
}

/**
 * Get category statistics for rankings and analytics
 */
export async function getCategoryStats(userId: string, timeRange: string = '1 month'): Promise<CategoryStats[]> {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select(`
        id,
        name,
        color,
        icon,
        total_spent,
        total_received,
        total_saved,
        transaction_count,
        activity_types
      `)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('total_spent', { ascending: false });

    if (error) throw error;

    // Calculate total amounts for percentage calculations
    const totalSpent = data?.reduce((sum, cat) => sum + (cat.total_spent || 0), 0) || 0;
    const totalReceived = data?.reduce((sum, cat) => sum + (cat.total_received || 0), 0) || 0;
    const totalSaved = data?.reduce((sum, cat) => sum + (cat.total_saved || 0), 0) || 0;

    return data?.map(category => {
      const totalAmount = (category.total_spent || 0) + (category.total_received || 0) + (category.total_saved || 0);
      const percentage = totalAmount > 0 ? (totalAmount / (totalSpent + totalReceived + totalSaved)) * 100 : 0;
      
      // Determine activity type based on which amount is highest
      let activityType = 'expense';
      if ((category.total_received || 0) > (category.total_spent || 0) && (category.total_received || 0) > (category.total_saved || 0)) {
        activityType = 'income';
      } else if ((category.total_saved || 0) > (category.total_spent || 0) && (category.total_saved || 0) > (category.total_received || 0)) {
        activityType = 'goal';
      }
      
      return {
        category_id: category.id,
        category_name: category.name,
        total_amount: totalAmount,
        transaction_count: category.transaction_count || 0,
        percentage: Math.round(percentage * 100) / 100,
        color: category.color,
        icon: category.icon,
        activity_type: activityType
      };
    }) || [];
  } catch (error) {
    console.error('Error fetching category stats:', error);
    return [];
  }
}
