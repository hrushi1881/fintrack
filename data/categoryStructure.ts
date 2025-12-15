/**
 * Main Category Structure
 * 
 * This defines the hierarchical category system used throughout the app.
 * Main categories contain predefined subcategories that users can select.
 * 
 * When a subcategory is selected, it becomes a category in the database,
 * but conceptually it's a subcategory of the main category.
 */

export interface MainCategory {
  id: string;
  name: string;
  subs: string[]; // Predefined subcategories
  icon: string;
  color: string;
  defaultActivityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
  availableActivityTypes: ('income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget')[];
}

export const MAIN_CATEGORIES: MainCategory[] = [
  {
    id: 'food',
    name: 'Food & Dining',
    subs: ['Groceries', 'Lunch', 'Dinner', 'Restaurants', 'Coffee', 'Delivery'],
    icon: 'restaurant',
    color: '#EF4444',
    defaultActivityTypes: ['expense'],
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
    defaultActivityTypes: ['expense', 'bill'],
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
    availableActivityTypes: ['expense', 'goal', 'budget'],
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
    defaultActivityTypes: ['income'],
    availableActivityTypes: ['income'],
  },
  {
    id: 'savings',
    name: 'Savings & Investments',
    subs: ['Emergency Fund', 'Mutual Funds', 'FD', 'Gold'],
    icon: 'trending-up',
    color: '#059669',
    defaultActivityTypes: ['goal'],
    availableActivityTypes: ['goal', 'expense', 'income'],
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

/**
 * Get icon and color for a subcategory
 * Maps subcategory names to specific icons
 */
export function getSubcategorySettings(mainId: string, subName: string): { icon: string; color: string } {
  const mainCat = MAIN_CATEGORIES.find((c) => c.id === mainId);
  const defaultColor = mainCat?.color || '#3B82F6';
  const defaultIcon = mainCat?.icon || 'folder';

  // Subcategory-specific icon mappings
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
}

/**
 * Find which main category a subcategory belongs to
 */
export function findMainCategoryForSubcategory(subcategoryName: string): MainCategory | null {
  for (const mainCat of MAIN_CATEGORIES) {
    if (mainCat.subs.some(sub => sub.toLowerCase() === subcategoryName.toLowerCase())) {
      return mainCat;
    }
  }
  return null;
}

/**
 * Get main categories filtered by activity type
 */
export function getMainCategoriesByActivityType(
  activityType: 'income' | 'expense' | 'goal' | 'bill' | 'liability' | 'budget'
): MainCategory[] {
  return MAIN_CATEGORIES.filter(cat => 
    cat.availableActivityTypes.includes(activityType)
  );
}

