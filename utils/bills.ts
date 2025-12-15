import { supabase } from '../lib/supabase';
import { Bill, BillPayment, RecurringFrequency, RecurringNature, RecurringAmountType } from '../types';
import { 
  RecurrenceDefinition,
  calculateNextOccurrence,
  calculateStatus as calculateRecurrenceStatus,
  generateSchedule,
  getDaysUntil
} from './recurrence';

export interface BillFilters {
  status?: string;
  billType?: string;
  categoryId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface CreateBillData {
  title: string;
  description?: string;
  amount?: number;
  currency: string;
  category_id?: string;
  bill_type: 'one_time' | 'recurring_fixed' | 'recurring_variable' | 'goal_linked' | 'liability_linked';
  recurrence_pattern?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'halfyearly' | 'yearly' | 'custom';
  recurrence_interval?: number;
  custom_recurrence_config?: any;
  due_date: string;
  original_due_date?: string;
  recurrence_end_date?: string;
  goal_id?: string;
  linked_account_id?: string;
  liability_id?: string;
  interest_amount?: number;
  principal_amount?: number;
  payment_number?: number;
  interest_included?: boolean;
  color: string;
  icon: string;
  reminder_days: number[];
  notes?: string;
  metadata?: any;
  
  // New recurring transaction fields
  direction?: 'income' | 'expense';
  nature?: RecurringNature;
  amount_type?: RecurringAmountType;
  estimated_amount?: number;
  fund_type?: 'personal' | 'liability' | 'goal';
  specific_fund_id?: string;
  frequency?: RecurringFrequency;
  custom_pattern?: {
    type?: 'specific_days' | 'specific_dates';
    days?: number[];
    weekdays?: string[];
  };
  end_type?: 'never' | 'on_date' | 'after_count';
  occurrence_count?: number;
  auto_create?: boolean;
  auto_create_days_before?: number;
  remind_before?: boolean;
  is_subscription?: boolean;
  subscription_provider?: string;
  subscription_plan?: string;
  subscription_start_date?: string;
  linked_budget_id?: string;
  day_of_month?: number;
}


/**
 * Upsert a bill for a given liability and cycle_number.
 * Ensures one bill per cycle. If exists, updates amounts/date/account/category and metadata.
 */
/**
 * Upsert a bill for a given liability and cycle_number.
 * Ensures one bill per cycle. If exists, updates amounts/date/account/category and metadata.
 * 
 * ENFORCES: cycle_number must be present in metadata for liability-linked bills.
 */
export async function upsertBillWithCycle(params: {
  userId: string;
  liabilityId: string;
  cycleNumber: number;
  amount: number;
  currency: string;
  dueDate: string;
  originalDueDate?: string | null;
  linkedAccountId?: string | null;
  categoryId?: string | null;
  interestAmount?: number | null;
  principalAmount?: number | null;
  interestIncluded?: boolean;
  paymentNumber?: number | null;
  frequency?: string | null;
  recurrencePattern?: string | null;
  recurrenceInterval?: number | null;
  description?: string | null;
  title?: string | null;
  totalAmount?: number | null;
  metadata?: any;
  color?: string | null;
  icon?: string | null;
}): Promise<{ id: string }> {
  const {
    userId,
    liabilityId,
    cycleNumber,
    amount,
    currency,
    dueDate,
    originalDueDate = dueDate,
    linkedAccountId = null,
    categoryId = null,
    interestAmount = null,
    principalAmount = null,
    interestIncluded = true,
    paymentNumber = null,
    frequency = 'monthly',
    recurrencePattern = 'monthly',
    recurrenceInterval = 1,
    description = null,
    title = null,
    totalAmount = null,
    metadata = {},
    color = '#10B981',
    icon = 'receipt-outline',
  } = params;

  // Ensure recurrence_pattern/frequency to satisfy constraints
  const freq = frequency || 'monthly';
  const recPattern = recurrencePattern || 'monthly';

  // Try to find existing bill for this liability + cycle_number
  const { data: existing } = await supabase
    .from('bills')
    .select('id, metadata')
    .eq('user_id', userId)
    .eq('liability_id', liabilityId)
    .contains('metadata', { cycle_number: cycleNumber })
    .limit(1);

  const billPayload: any = {
    user_id: userId,
    liability_id: liabilityId,
    title: title || `Payment #${paymentNumber ?? cycleNumber}`,
    description,
    amount,
    currency,
    due_date: dueDate,
    original_due_date: originalDueDate,
    status: 'upcoming',
    bill_type: 'liability_linked',
    recurrence_pattern: recPattern,
    recurrence_interval: recurrenceInterval ?? 1,
    frequency: freq,
    nature: 'payment',
    linked_account_id: linkedAccountId,
    interest_amount: interestAmount,
    principal_amount: principalAmount,
    total_amount: totalAmount ?? amount,
    payment_number: paymentNumber ?? cycleNumber,
    interest_included: interestIncluded,
    category_id: categoryId,
    color,
    icon,
    reminder_days: [1, 3, 7],
    metadata: {
      ...(existing?.[0]?.metadata || {}),
      ...metadata,
      // ENFORCE: cycle_number must always be present for liability-linked bills
      cycle_number: cycleNumber,
      liability_id: liabilityId, // Also store liability_id in metadata for easier querying
    },
    is_active: true,
    is_deleted: false,
    parent_bill_id: null,
    updated_at: new Date().toISOString(),
  };

  if (existing && existing.length > 0) {
    const billId = existing[0].id;
    const { error: updateError } = await supabase
      .from('bills')
      .update(billPayload)
      .eq('id', billId);
    if (updateError) throw updateError;
    return { id: billId };
  }

  const { data: created, error: insertError } = await supabase
    .from('bills')
    .insert(billPayload)
    .select('id')
    .single();
  if (insertError) throw insertError;
  return { id: created!.id };
}

export interface UpdateBillData extends Partial<CreateBillData> {
  id: string;
}

export interface PaymentData {
  amount: number;
  currency: string;
  payment_date: string;
  actual_due_date: string;
  account_id: string; // Required - no longer optional
  payment_status: 'completed' | 'partial' | 'failed';
  notes?: string;
  // create_transaction removed - always create transaction now
  generate_next?: boolean;
}

/**
 * Calculate bill status based on due date and current status
 * Uses recurrence engine for accurate status calculation
 */
export function calculateBillStatus(bill: Bill): Bill['status'] {
  // Preserve terminal states
  if (bill.status === 'paid') return 'paid';
  if (bill.status === 'cancelled') return 'cancelled';
  if (bill.status === 'skipped') return 'skipped';
  if (bill.status === 'postponed') return 'postponed';
  
  // Use recurrence engine for status calculation
  const today = new Date().toISOString().split('T')[0];
  const status = calculateRecurrenceStatus(bill.due_date, today, bill.status as any);
  
  // Map recurrence status to bill status
  switch (status) {
    case 'upcoming':
      return 'upcoming';
    case 'due_today':
      return 'due_today';
    case 'overdue':
      return 'overdue';
    default:
      return bill.status;
  }
}

/**
 * Fetch bills for a user with optional filtering
 */
export async function fetchBills(
  userId: string, 
  filters: BillFilters = {},
  includePaymentBills: boolean = false // If false, only return containers (parent_bill_id IS NULL)
): Promise<Bill[]> {
  try {
    let query = supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false);

    // By default, only show container bills (parent_bill_id IS NULL)
    // Unless explicitly requested to include payment bills
    // This is CRITICAL: payment bills have parent_bill_id set, containers have it NULL
    if (!includePaymentBills) {
      query = query.is('parent_bill_id', null);
    }
    
    // Order by next_transaction_date for containers (when they're due next)
    // or due_date for payment bills
    query = query.order('due_date', { ascending: true });

    // Apply status filter
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // Apply bill type filter
    if (filters.billType) {
      query = query.eq('bill_type', filters.billType);
    }

    // Apply category filter
    if (filters.categoryId) {
      query = query.eq('category_id', filters.categoryId);
    }

    // Apply search filter
    if (filters.search) {
      query = query.ilike('title', `%${filters.search}%`);
    }

    // Apply date filters
    if (filters.startDate) {
      query = query.gte('due_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('due_date', filters.endDate);
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
      console.error('Error fetching bills:', error);
      throw error;
    }

    // Calculate status for each bill
    const bills = (data || []).map(bill => ({
      ...bill,
      status: calculateBillStatus(bill)
    }));

    return bills;
  } catch (error) {
    console.error('Error in fetchBills:', error);
    throw error;
  }
}

/**
 * Fetch a single bill by ID
 */
export async function fetchBillById(billId: string): Promise<Bill | null> {
  try {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .eq('id', billId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (error) {
      // If it's a "no rows" error, return null instead of throwing
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching bill:', error);
      throw error;
    }

    if (!data) return null;

    return {
      ...data,
      status: calculateBillStatus(data)
    };
  } catch (error: any) {
    // Handle "no rows" error gracefully
    if (error?.code === 'PGRST116') {
      return null;
    }
    console.error('Error in fetchBillById:', error);
    throw error;
  }
}

/**
 * Map old recurrence_pattern to new frequency format
 */
function mapOldPatternToFrequency(pattern: string): 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom' {
  switch (pattern) {
    case 'daily':
      return 'day';
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
    case 'quarterly':
      return 'quarter';
    case 'yearly':
      return 'year';
    case 'custom':
      return 'custom';
    default:
      return 'month';
  }
}

/**
 * Map new frequency to old recurrence_pattern for backward compatibility
 */
function mapFrequencyToRecurrencePattern(frequency?: RecurringFrequency): 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | undefined {
  if (!frequency) return undefined;
  
  // Map new frequencies to old values
  switch (frequency) {
    case 'daily':
      return 'daily';
    case 'weekly':
    case 'biweekly':
      return 'weekly';
    case 'monthly':
    case 'bimonthly':
      return 'monthly';
    case 'quarterly':
    case 'halfyearly':
      return 'monthly'; // Store as monthly, use interval for differentiation
    case 'yearly':
      return 'yearly';
    case 'custom':
      return 'custom';
    default:
      return 'monthly';
  }
}

/**
 * Determine bill_type from nature, amount_type, and liability_id
 */
function determineBillTypeFromNature(
  nature?: RecurringNature,
  amountType?: RecurringAmountType,
  hasLiabilityId?: boolean
): 'one_time' | 'recurring_fixed' | 'recurring_variable' | 'goal_linked' | 'liability_linked' {
  if (hasLiabilityId) {
    return 'liability_linked';
  }
  
  if (!nature) {
    return 'recurring_fixed'; // Default for recurring
  }
  
  switch (nature) {
    case 'subscription':
      return 'recurring_fixed';
    case 'bill':
      return amountType === 'variable' ? 'recurring_variable' : 'recurring_fixed';
    case 'payment':
      return 'recurring_fixed';
    case 'income':
      return 'recurring_fixed';
    default:
      return 'recurring_fixed';
  }
}

/**
 * Calculate next transaction date based on frequency, interval, and start date
 */
function calculateNextTransactionDate(
  frequency: RecurringFrequency,
  interval: number,
  startDate: string,
  customPattern?: {
    type?: 'specific_days' | 'specific_dates';
    days?: number[];
    weekdays?: string[];
  },
  dayOfMonth?: number
): string {
  const start = new Date(startDate);
  const next = new Date(start);
  
  switch (frequency) {
    case 'daily':
      next.setDate(start.getDate() + interval);
      break;
    case 'weekly':
      next.setDate(start.getDate() + (interval * 7));
      break;
    case 'biweekly':
      next.setDate(start.getDate() + (interval * 14));
      break;
    case 'monthly':
      // Use day_of_month if provided, otherwise use the same day next month
      if (dayOfMonth) {
        next.setMonth(start.getMonth() + interval);
        next.setDate(dayOfMonth);
      } else {
        next.setMonth(start.getMonth() + interval);
      }
      break;
    case 'bimonthly':
      next.setMonth(start.getMonth() + (interval * 2));
      if (dayOfMonth) {
        next.setDate(dayOfMonth);
      }
      break;
    case 'quarterly':
      next.setMonth(start.getMonth() + (interval * 3));
      if (dayOfMonth) {
        next.setDate(dayOfMonth);
      }
      break;
    case 'halfyearly':
      next.setMonth(start.getMonth() + (interval * 6));
      if (dayOfMonth) {
        next.setDate(dayOfMonth);
      }
      break;
    case 'yearly':
      next.setFullYear(start.getFullYear() + interval);
      break;
    case 'custom':
      // For custom patterns, calculate based on custom_pattern
      if (customPattern?.type === 'specific_days' && customPattern.days) {
        // Find next matching day in the month
        const days = customPattern.days.sort((a, b) => a - b);
        const currentDay = start.getDate();
        const nextDay = days.find(d => d > currentDay) || days[0];
        if (nextDay > currentDay) {
          next.setDate(nextDay);
        } else {
          next.setMonth(start.getMonth() + 1);
          next.setDate(days[0]);
        }
      } else {
        // Default to monthly for custom
        next.setMonth(start.getMonth() + interval);
      }
      break;
    default:
      next.setMonth(start.getMonth() + interval);
  }
  
  return next.toISOString().split('T')[0];
}

/**
 * Create a new bill
 */
export async function createBill(data: CreateBillData): Promise<Bill> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Determine bill_type from nature if not explicitly provided
    const billType = data.bill_type || determineBillTypeFromNature(
      data.nature,
      data.amount_type,
      !!data.liability_id
    );

    // Use frequency if provided, otherwise use recurrence_pattern
    const frequency = data.frequency || (data.recurrence_pattern as RecurringFrequency) || 'monthly';
    const recurrenceInterval = data.recurrence_interval || 1;
    
    // Map frequency to recurrence_pattern for backward compatibility
    const recurrencePattern = data.recurrence_pattern || mapFrequencyToRecurrencePattern(frequency);

    // Calculate next_transaction_date if frequency and start_date are provided
    let nextTransactionDate: string | null = null;
    if (frequency && data.due_date && billType !== 'one_time') {
      try {
        nextTransactionDate = calculateNextTransactionDate(
          frequency,
          recurrenceInterval,
          data.due_date,
          data.custom_pattern,
          data.day_of_month
        );
      } catch (err) {
        console.warn('Error calculating next transaction date:', err);
        // Fallback: calculate from recurrence_pattern if available
        if (data.recurrence_pattern === 'monthly' && data.due_date) {
          const next = new Date(data.due_date);
          next.setMonth(next.getMonth() + recurrenceInterval);
          nextTransactionDate = next.toISOString().split('T')[0];
        }
      }
    }

    // Handle end_type and recurrence_end_date
    let recurrenceEndDate: string | null = null;
    let occurrenceCount: number | null = null;
    const endType = data.end_type || 'never';
    
    if (endType === 'on_date' && data.recurrence_end_date) {
      recurrenceEndDate = data.recurrence_end_date;
    } else if (endType === 'after_count' && data.occurrence_count) {
      occurrenceCount = data.occurrence_count;
      // Calculate end date from occurrence count (approximate)
      if (frequency && data.due_date) {
        const startDate = new Date(data.due_date);
        const count = data.occurrence_count;
        let endDate = new Date(startDate);
        
        switch (frequency) {
          case 'daily':
            endDate.setDate(startDate.getDate() + (count * recurrenceInterval));
            break;
          case 'weekly':
          case 'biweekly':
            endDate.setDate(startDate.getDate() + (count * (frequency === 'biweekly' ? 14 : 7) * recurrenceInterval));
            break;
          case 'monthly':
          case 'bimonthly':
            endDate.setMonth(startDate.getMonth() + (count * (frequency === 'bimonthly' ? 2 : 1) * recurrenceInterval));
            break;
          case 'quarterly':
            endDate.setMonth(startDate.getMonth() + (count * 3 * recurrenceInterval));
            break;
          case 'halfyearly':
            endDate.setMonth(startDate.getMonth() + (count * 6 * recurrenceInterval));
            break;
          case 'yearly':
            endDate.setFullYear(startDate.getFullYear() + (count * recurrenceInterval));
            break;
          default:
            endDate.setMonth(startDate.getMonth() + (count * recurrenceInterval));
        }
        recurrenceEndDate = endDate.toISOString().split('T')[0];
      }
    }

    // Set subscription details
    const isSubscription = data.is_subscription !== undefined 
      ? data.is_subscription 
      : (data.nature === 'subscription');

    // Set defaults for reminder settings based on nature
    const remindBefore = data.remind_before !== undefined ? data.remind_before : true;
    const autoCreate = data.auto_create !== undefined ? data.auto_create : true;
    const autoCreateDaysBefore = data.auto_create_days_before !== undefined ? data.auto_create_days_before : 3;
    
    // Default reminder days based on nature
    let defaultReminderDays = data.reminder_days || [3, 1];
    if (!data.reminder_days && data.nature) {
      switch (data.nature) {
        case 'subscription':
          defaultReminderDays = [3, 1];
          break;
        case 'bill':
          defaultReminderDays = [7, 3, 1];
          break;
        case 'payment':
          defaultReminderDays = [7, 3, 1];
          break;
        case 'income':
          defaultReminderDays = [1];
          break;
        default:
          defaultReminderDays = [3, 1];
      }
    }

    // Set fund_type defaults
    const fundType = data.fund_type || 'personal';
    
    // Set status for recurring bills
    // Note: Database constraint only allows: 'upcoming', 'due_today', 'overdue', 'paid', 'skipped', 'cancelled', 'postponed'
    // For recurring bills, we use 'upcoming' as the initial status
    const billStatus = 'upcoming';

    // Store custom_pattern as JSONB
    let customPatternJson: any = null;
    if (data.custom_pattern || (frequency === 'custom' && data.custom_recurrence_config)) {
      customPatternJson = data.custom_pattern || data.custom_recurrence_config;
    }

    // Prepare metadata
    const metadata = {
      ...(data.metadata || {}),
      ...(data.nature && { nature: data.nature }),
      ...(data.direction && { direction: data.direction }),
    };

    // For recurring bills, create as container (parent_bill_id = NULL)
    // For one-time bills, also create as standalone (parent_bill_id = NULL)
    // Only payment bills generated from containers will have parent_bill_id set
    const parentBillId = null; // Always NULL when creating a new bill (container or one-time)

    const { data: bill, error } = await supabase
      .from('bills')
      .insert({
        user_id: user.user.id,
        title: data.title,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        category_id: data.category_id || null,
        bill_type: billType,
        recurrence_pattern: recurrencePattern,
        recurrence_interval: recurrenceInterval,
        custom_recurrence_config: customPatternJson,
        due_date: data.due_date,
        original_due_date: data.original_due_date || data.due_date,
        recurrence_end_date: recurrenceEndDate,
        goal_id: data.goal_id || null,
        linked_account_id: data.linked_account_id || null,
        liability_id: data.liability_id || null,
        interest_amount: data.interest_amount || null,
        principal_amount: data.principal_amount || null,
        payment_number: data.payment_number || null,
        interest_included: data.interest_included !== undefined ? data.interest_included : true,
        color: data.color,
        icon: data.icon,
        reminder_days: defaultReminderDays,
        notes: data.notes,
        metadata: metadata,
        
        // Bill container support
        parent_bill_id: parentBillId, // NULL for containers/one-time bills
        
        // New recurring transaction fields
        direction: data.direction || 'expense',
        nature: data.nature || null,
        amount_type: data.amount_type || 'fixed',
        estimated_amount: data.amount_type === 'variable' ? (data.estimated_amount || data.amount || null) : null,
        fund_type: fundType,
        specific_fund_id: data.specific_fund_id || null,
        frequency: frequency,
        custom_pattern: customPatternJson,
        end_type: endType,
        occurrence_count: occurrenceCount,
        auto_create: autoCreate,
        auto_create_days_before: autoCreateDaysBefore,
        remind_before: remindBefore,
        is_subscription: isSubscription,
        subscription_provider: isSubscription ? (data.subscription_provider || null) : null,
        subscription_plan: isSubscription ? (data.subscription_plan || null) : null,
        subscription_start_date: isSubscription ? (data.subscription_start_date || data.due_date) : null,
        linked_budget_id: data.linked_budget_id || null,
        status: billStatus,
        paused_until: null,
        total_occurrences: 0,
        completed_occurrences: 0,
        skipped_occurrences: 0,
        total_paid: 0,
        average_amount: data.amount || 0,
        last_transaction_date: null,
        next_transaction_date: nextTransactionDate,
        next_due_date: nextTransactionDate || data.due_date,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bill:', error);
      throw error;
    }

    const createdBill = {
      ...bill,
      status: calculateBillStatus(bill) || 'upcoming'
    };

    // If this is a recurring bill container (not one-time), generate the first payment bill
    if (billType !== 'one_time' && autoCreate && createdBill.next_transaction_date) {
      try {
        await generatePaymentBillFromContainer(createdBill.id, createdBill.next_transaction_date);
      } catch (err) {
        console.warn('Error generating first payment bill from container:', err);
        // Don't fail the creation if payment bill generation fails
      }
    }

    return createdBill;
  } catch (error) {
    console.error('Error in createBill:', error);
    throw error;
  }
}

/**
 * Generate a payment bill from a bill container (similar to liability bills)
 * This creates a child bill that can be paid
 */
export async function generatePaymentBillFromContainer(
  containerBillId: string,
  dueDate: string,
  actualAmount?: number
): Promise<Bill> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Fetch the container bill
    const { data: containerBill, error: containerError } = await supabase
      .from('bills')
      .select('*')
      .eq('id', containerBillId)
      .eq('user_id', user.user.id)
      .is('parent_bill_id', null) // Ensure it's a container
      .single();

    if (containerError || !containerBill) {
      throw new Error('Container bill not found');
    }

    // Determine the amount for this payment bill
    // Use actualAmount if provided, otherwise use container's amount
    // For variable bills (recurring_variable), amount might be null (user enters actual each time)
    const paymentAmount = actualAmount !== undefined 
      ? actualAmount 
      : (containerBill.amount || 0);

    // Derive frequency for constraint compliance
    const paymentFrequency =
      containerBill.frequency ||
      (containerBill.recurrence_pattern ? mapOldPatternToFrequency(containerBill.recurrence_pattern) : null);

    // Create payment bill (only use fields that exist in bills table)
    // Payment bills should NOT have recurrence_pattern (only containers do), but must carry frequency for check constraint
    const { data: paymentBill, error: paymentError } = await supabase
      .from('bills')
      .insert({
        user_id: user.user.id,
        parent_bill_id: containerBillId, // Link to container
        title: containerBill.title,
        description: containerBill.description,
        amount: paymentAmount,
        currency: containerBill.currency,
        category_id: containerBill.category_id,
        bill_type: containerBill.bill_type,
        due_date: dueDate, // Required for payment bills
        original_due_date: containerBill.original_due_date || containerBill.due_date,
        goal_id: containerBill.goal_id,
        linked_account_id: containerBill.linked_account_id,
        color: containerBill.color,
        icon: containerBill.icon,
        reminder_days: containerBill.reminder_days || [3, 1],
        notes: containerBill.notes,
        metadata: containerBill.metadata || {},
        frequency: paymentFrequency || 'monthly',
        
        // Payment bill doesn't have recurrence fields (only container has them)
        // Do NOT set recurrence_pattern, recurrence_interval, or recurrence_end_date
        status: 'upcoming',
        is_active: true,
        is_deleted: false,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Error creating payment bill:', paymentError);
      throw paymentError;
    }

    // Update container's next_due_date using recurrence engine
    let nextDueDate: string | null = null;
    if (containerBill.recurrence_pattern && containerBill.recurrence_interval) {
      // Convert old recurrence_pattern to new format
      const frequency = mapOldPatternToFrequency(containerBill.recurrence_pattern);
      const interval = containerBill.recurrence_interval || 1;
      
      const def: RecurrenceDefinition = {
        frequency,
        interval,
        start_date: containerBill.due_date || dueDate,
        end_date: containerBill.recurrence_end_date || undefined,
        date_of_occurrence: (containerBill as any).day_of_month || undefined,
      };
      
      // Calculate next occurrence from the payment bill's due date
      nextDueDate = calculateNextOccurrence(def, dueDate);
    }

    // Update container's next_due_date (if it exists in the table)
    if (nextDueDate) {
      await supabase
        .from('bills')
        .update({
          next_due_date: nextDueDate,
          last_paid_date: dueDate,
        })
        .eq('id', containerBillId);
    }

    return {
      ...paymentBill,
      status: calculateBillStatus(paymentBill) || 'upcoming'
    };
  } catch (error) {
    console.error('Error in generatePaymentBillFromContainer:', error);
    throw error;
  }
}

/**
 * Get all payment bills for a container bill
 */
export async function getPaymentBillsForContainer(containerBillId: string): Promise<Bill[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: paymentBills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('parent_bill_id', containerBillId)
      .eq('user_id', user.user.id)
      .eq('is_deleted', false)
      .order('due_date', { ascending: true });

    if (error) {
      console.error('Error fetching payment bills:', error);
      throw error;
    }

    return (paymentBills || []).map(bill => ({
      ...bill,
      status: calculateBillStatus(bill)
    }));
  } catch (error) {
    console.error('Error in getPaymentBillsForContainer:', error);
    throw error;
  }
}

/**
 * Update an existing bill
 */
export async function updateBill(data: UpdateBillData): Promise<Bill> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { data: bill, error } = await supabase
      .from('bills')
      .update({
        title: data.title,
        description: data.description,
        amount: data.amount,
        currency: data.currency,
        category_id: data.category_id || null,
        bill_type: data.bill_type,
        recurrence_pattern: data.recurrence_pattern,
        recurrence_interval: data.recurrence_interval,
        custom_recurrence_config: data.custom_recurrence_config,
        due_date: data.due_date,
        original_due_date: data.original_due_date,
        recurrence_end_date: data.recurrence_end_date || null,
        goal_id: data.goal_id || null,
        linked_account_id: data.linked_account_id || null,
        color: data.color,
        icon: data.icon,
        reminder_days: data.reminder_days,
        notes: data.notes,
        metadata: data.metadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.id)
      .eq('user_id', user.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating bill:', error);
      throw error;
    }

    return {
      ...bill,
      status: calculateBillStatus(bill)
    };
  } catch (error) {
    console.error('Error in updateBill:', error);
    throw error;
  }
}

/**
 * Delete a bill (soft delete)
 */
export async function deleteBill(billId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error deleting bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in deleteBill:', error);
    throw error;
  }
}

/**
 * Mark a bill as paid
 */
export async function markBillAsPaid(billId: string, paymentData: PaymentData): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    // Get the bill
    const bill = await fetchBillById(billId);
    if (!bill) throw new Error('Bill not found');

    // Use unified fund-bucket RPC to create the expense transaction and adjust balances
    // Default to personal funds when called from utility (UI flow uses FundPicker directly)
    const bucketParam = { type: 'personal', id: null } as const;

    // Ensure category id (can be null)
    const categoryId = bill.category_id && typeof bill.category_id === 'string'
      ? bill.category_id.trim()
      : null;

    const { data: rpcResult, error: rpcError } = await supabase.rpc('spend_from_account_bucket', {
      p_user_id: user.user.id,
      p_account_id: paymentData.account_id,
      p_bucket: bucketParam,
      p_amount: paymentData.amount,
      p_category: categoryId,
      p_description: `Payment for ${bill.title}`,
      p_date: paymentData.payment_date,
      p_currency: paymentData.currency,
    });

    if (rpcError) {
      console.error('Bucket RPC error (spend_from_account_bucket):', rpcError);
      throw rpcError;
    }

    const createdTransactionId = (rpcResult as string) || null;

    // If we got a transaction id, attach bill metadata for richer context
    if (createdTransactionId) {
      const { error: metaErr } = await supabase
        .from('transactions')
        .update({
          metadata: {
            bill_id: billId,
            bucket: 'personal',
          },
        })
        .eq('id', createdTransactionId);
      if (metaErr) {
        // Non-fatal: continue but log
        console.warn('Failed to attach bill metadata to transaction:', metaErr);
      }
    }

    // Create bill payment record (linking transaction if present)
    const { error: paymentError } = await supabase
      .from('bill_payments')
      .insert({
        bill_id: billId,
        user_id: user.user.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_date: paymentData.payment_date,
        actual_due_date: paymentData.actual_due_date,
        account_id: paymentData.account_id,
        payment_status: paymentData.payment_status,
        notes: paymentData.notes,
        transaction_id: createdTransactionId,
      });

    if (paymentError) {
      console.error('Error creating bill payment:', paymentError);
      throw paymentError;
    }

    // Update bill status
    const { error: billError } = await supabase
      .from('bills')
      .update({
        status: 'paid',
        last_paid_date: paymentData.payment_date,
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId);

    if (billError) {
      console.error('Error updating bill status:', billError);
      throw billError;
    }

    // Generate next bill occurrence if requested and bill is recurring
    if (paymentData.generate_next && bill.bill_type !== 'one_time') {
      try {
        await supabase.rpc('generate_next_bill_instance', {
          bill_uuid: billId
        });
      } catch (error) {
        console.error('Error generating next bill occurrence:', error);
        // Don't throw here, as the payment was successful
      }
    }
  } catch (error) {
    console.error('Error in markBillAsPaid:', error);
    throw error;
  }
}

/**
 * Postpone a bill to a new due date
 */
export async function postponeBill(billId: string, newDueDate: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        due_date: newDueDate,
        status: 'postponed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error postponing bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in postponeBill:', error);
    throw error;
  }
}

/**
 * Skip a bill for the current cycle
 */
export async function skipBill(billId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        status: 'skipped',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error skipping bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in skipBill:', error);
    throw error;
  }
}

/**
 * Cancel a recurring bill
 */
export async function cancelBill(billId: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('User not authenticated');

    const { error } = await supabase
      .from('bills')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', billId)
      .eq('user_id', user.user.id);

    if (error) {
      console.error('Error cancelling bill:', error);
      throw error;
    }
  } catch (error) {
    console.error('Error in cancelBill:', error);
    throw error;
  }
}

/**
 * Get payment history for a bill
 */
export async function getBillPaymentHistory(billId: string): Promise<BillPayment[]> {
  try {
    const { data, error } = await supabase
      .from('bill_payments')
      .select(`
        *,
        accounts!inner(name, type, color, icon)
      `)
      .eq('bill_id', billId)
      .order('payment_date', { ascending: false });

    if (error) {
      console.error('Error fetching bill payment history:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Error in getBillPaymentHistory:', error);
    throw error;
  }
}

/**
 * Get upcoming bills for a user
 */
export async function getUpcomingBills(userId: string, days: number = 7): Promise<Bill[]> {
  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    return fetchBills(userId, {
      startDate: new Date().toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      status: 'upcoming'
    });
  } catch (error) {
    console.error('Error in getUpcomingBills:', error);
    throw error;
  }
}


/**
 * Generate next bill occurrence for recurring bills
 */
export async function generateNextBillOccurrence(billId: string): Promise<string> {
  try {
    const { data, error } = await supabase.rpc('generate_next_bill_instance', {
      bill_uuid: billId
    });

    if (error) {
      console.error('Error generating next bill occurrence:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in generateNextBillOccurrence:', error);
    throw error;
  }
}

/**
 * Update bill statuses (run this periodically)
 */
export async function updateBillStatuses(): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('update_bill_statuses');

    if (error) {
      console.error('Error updating bill statuses:', error);
      throw error;
    }

    return data || 0;
  } catch (error) {
    console.error('Error in updateBillStatuses:', error);
    throw error;
  }
}

/**
 * Calculate bill statistics for analytics
 */
export async function calculateBillStatistics(userId: string, timeRange: string = '1 month') {
  try {
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_deleted', false);

    if (error) throw error;

    const now = new Date();
    const upcomingBills = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      return dueDate > now && bill.status !== 'paid' && bill.status !== 'cancelled';
    }) || [];

    const overdueBills = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      return dueDate < now && bill.status !== 'paid' && bill.status !== 'cancelled';
    }) || [];

    const dueTodayBills = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const today = new Date();
      return dueDate.toDateString() === today.toDateString() && bill.status !== 'paid';
    }) || [];

    const totalUpcoming = upcomingBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const totalOverdue = overdueBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    const totalDueToday = dueTodayBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    return {
      totalBills: bills?.length || 0,
      upcomingBills: upcomingBills.length,
      overdueBills: overdueBills.length,
      dueTodayBills: dueTodayBills.length,
      paidBills: bills?.filter(bill => bill.status === 'paid').length || 0,
      totalUpcomingAmount: totalUpcoming,
      totalOverdueAmount: totalOverdue,
      totalDueTodayAmount: totalDueToday,
      thisMonthTotal: bills?.reduce((sum, bill) => sum + (bill.amount || 0), 0) || 0
    };
  } catch (error) {
    console.error('Error calculating bill statistics:', error);
    return {
      totalBills: 0,
      upcomingBills: 0,
      overdueBills: 0,
      dueTodayBills: 0,
      paidBills: 0,
      totalUpcomingAmount: 0,
      totalOverdueAmount: 0,
      totalDueTodayAmount: 0,
      thisMonthTotal: 0
    };
  }
}

/**
 * Get bills that need notifications based on reminder days
 */
export async function getBillsForNotification(userId: string): Promise<{
  dueToday: Bill[];
  overdue: Bill[];
  upcoming: Bill[];
}> {
  try {
    const { data: bills, error } = await supabase
      .from('bills')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_deleted', false)
      .in('status', ['upcoming', 'due_today', 'overdue']);

    if (error) throw error;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const dueToday = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const billDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      return billDate.getTime() === today.getTime() && bill.status !== 'paid';
    }) || [];

    const overdue = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const billDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      return billDate < today && bill.status !== 'paid';
    }) || [];

    const upcoming = bills?.filter(bill => {
      const dueDate = new Date(bill.due_date);
      const billDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const daysUntilDue = Math.ceil((billDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilDue > 0 && daysUntilDue <= 7 && bill.status !== 'paid';
    }) || [];

    return { dueToday, overdue, upcoming };
  } catch (error) {
    console.error('Error getting bills for notification:', error);
    throw error;
  }
}

/**
 * Generate notification message for bills
 */
export function generateBillNotificationMessage(bills: {
  dueToday: Bill[];
  overdue: Bill[];
  upcoming: Bill[];
}): string[] {
  const messages: string[] = [];

  if (bills.overdue.length > 0) {
    const totalOverdue = bills.overdue.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    messages.push(`🚨 ${bills.overdue.length} overdue bill${bills.overdue.length > 1 ? 's' : ''} totaling $${totalOverdue.toFixed(2)}`);
  }

  if (bills.dueToday.length > 0) {
    const totalDueToday = bills.dueToday.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    messages.push(`⚠️ ${bills.dueToday.length} bill${bills.dueToday.length > 1 ? 's' : ''} due today totaling $${totalDueToday.toFixed(2)}`);
  }

  if (bills.upcoming.length > 0) {
    const totalUpcoming = bills.upcoming.reduce((sum, bill) => sum + (bill.amount || 0), 0);
    messages.push(`📅 ${bills.upcoming.length} bill${bills.upcoming.length > 1 ? 's' : ''} due this week totaling $${totalUpcoming.toFixed(2)}`);
  }

  return messages;
}
