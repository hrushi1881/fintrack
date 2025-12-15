/**
 * Category Mapping Utilities
 * 
 * Maps database categories to the main category structure
 * and handles finding/creating categories based on main category selections
 */

import { Category } from '../types';
import { MAIN_CATEGORIES, getSubcategorySettings, findMainCategoryForSubcategory } from '../data/categoryStructure';
import { supabase } from '../lib/supabase';
import { createCategory } from './categories';

/**
 * Group database categories by their main category
 * Returns a map of mainCategoryId -> array of database categories
 */
export function groupCategoriesByMainCategory(
  dbCategories: Category[]
): Map<string, Category[]> {
  const grouped = new Map<string, Category[]>();

  // Initialize all main categories
  MAIN_CATEGORIES.forEach(mainCat => {
    grouped.set(mainCat.id, []);
  });

  // Group database categories
  dbCategories.forEach(dbCat => {
    const mainCat = findMainCategoryForSubcategory(dbCat.name);
    if (mainCat) {
      const existing = grouped.get(mainCat.id) || [];
      grouped.set(mainCat.id, [...existing, dbCat]);
    } else {
      // Custom category - add to 'other'
      const existing = grouped.get('other') || [];
      grouped.set(mainCat.id, [...existing, dbCat]);
    }
  });

  return grouped;
}

/**
 * Find or create a category for a selected subcategory
 * Returns the database category ID
 */
export async function findOrCreateSubcategory(
  userId: string,
  mainCategoryId: string,
  subcategoryName: string,
  activityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[]
): Promise<string> {
  const mainCat = MAIN_CATEGORIES.find(c => c.id === mainCategoryId);
  if (!mainCat) {
    throw new Error(`Main category ${mainCategoryId} not found`);
  }

  const categoryName = subcategoryName.trim();
  const settings = getSubcategorySettings(mainCategoryId, categoryName);

  // Check if category already exists
  const { data: existingCategory } = await supabase
    .from('categories')
    .select('id, activity_types, parent_id')
    .eq('user_id', userId)
    .eq('name', categoryName)
    .eq('is_deleted', false)
    .maybeSingle();

  if (existingCategory) {
    // Check if we need to update activity types
    const existingTypes = existingCategory.activity_types || [];
    const mergedTypes = Array.from(new Set([...existingTypes, ...activityTypes]));
    
    if (mergedTypes.length !== existingTypes.length) {
      // Update activity types
      await supabase
        .from('categories')
        .update({ activity_types: mergedTypes })
        .eq('id', existingCategory.id);
    }

    return existingCategory.id;
  }

  // Create new category
  // First, check if we need to create the main category as a parent
  let parentId: string | null = null;
  
  // Check if main category exists as a category in database
  const { data: mainCategoryDb } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', mainCat.name)
    .eq('is_deleted', false)
    .maybeSingle();

  if (mainCategoryDb) {
    parentId = mainCategoryDb.id;
  } else {
    // Create main category as parent (only if it doesn't exist)
    try {
      const mainCategoryCreated = await createCategory({
        name: mainCat.name,
        color: mainCat.color,
        icon: mainCat.icon,
        activity_types: mainCat.defaultActivityTypes,
      });
      parentId = mainCategoryCreated.id;
    } catch (error: any) {
      // If main category already exists (race condition), fetch it
      if (error?.message?.includes('already exists')) {
        const { data: existingMain } = await supabase
          .from('categories')
          .select('id')
          .eq('user_id', userId)
          .eq('name', mainCat.name)
          .eq('is_deleted', false)
          .maybeSingle();
        if (existingMain) {
          parentId = existingMain.id;
        }
      } else {
        throw error;
      }
    }
  }

  // Create subcategory
  const newCategory = await createCategory({
    name: categoryName,
    color: settings.color,
    icon: settings.icon,
    activity_types: activityTypes,
  });

  // Update parent_id if we have a parent
  if (parentId) {
    await supabase
      .from('categories')
      .update({ parent_id: parentId })
      .eq('id', newCategory.id);
  }

  return newCategory.id;
}

/**
 * Get all subcategories for a main category from database
 * Returns database categories that match the main category's subcategories
 */
export async function getSubcategoriesForMainCategory(
  userId: string,
  mainCategoryId: string
): Promise<Category[]> {
  const mainCat = MAIN_CATEGORIES.find(c => c.id === mainCategoryId);
  if (!mainCat) {
    return [];
  }

  // Find main category in database
  const { data: mainCategoryDb } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', mainCat.name)
    .eq('is_deleted', false)
    .maybeSingle();

  if (!mainCategoryDb) {
    // Main category doesn't exist yet, return empty
    return [];
  }

  // Get all subcategories (categories with this parent_id)
  const { data: subcategories, error } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', userId)
    .eq('parent_id', mainCategoryDb.id)
    .eq('is_deleted', false)
    .order('name');

  if (error) {
    console.error('Error fetching subcategories:', error);
    return [];
  }

  return subcategories || [];
}

/**
 * Get all available subcategories for a main category
 * Returns both predefined subcategories and any custom ones from database
 */
export async function getAvailableSubcategories(
  userId: string,
  mainCategoryId: string
): Promise<Array<{ name: string; exists: boolean; categoryId?: string }>> {
  const mainCat = MAIN_CATEGORIES.find(c => c.id === mainCategoryId);
  if (!mainCat) {
    return [];
  }

  // Get existing subcategories from database
  const dbSubcategories = await getSubcategoriesForMainCategory(userId, mainCategoryId);
  const dbSubcategoryNames = new Set(dbSubcategories.map(c => c.name.toLowerCase()));

  // Combine predefined and database subcategories
  const allSubcategories = new Map<string, { exists: boolean; categoryId?: string }>();

  // Add predefined subcategories
  mainCat.subs.forEach(subName => {
    const exists = dbSubcategoryNames.has(subName.toLowerCase());
    const dbCategory = dbSubcategories.find(c => 
      c.name.toLowerCase() === subName.toLowerCase()
    );
    allSubcategories.set(subName, {
      exists,
      categoryId: dbCategory?.id,
    });
  });

  // Add custom subcategories from database that aren't in predefined list
  dbSubcategories.forEach(dbCat => {
    if (!mainCat.subs.some(sub => sub.toLowerCase() === dbCat.name.toLowerCase())) {
      allSubcategories.set(dbCat.name, {
        exists: true,
        categoryId: dbCat.id,
      });
    }
  });

  return Array.from(allSubcategories.entries()).map(([name, data]) => ({
    name,
    ...data,
  }));
}

