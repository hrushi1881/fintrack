import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrencyAmount } from '@/utils/currency';

type LiabilityInput = {
  type: 'loan' | 'emi' | 'one_time';
  name: string;
  description?: string;
  totalAmount?: number | null;
  remainingAmount: number;
  interestRate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  // EMI specific
  emiAmount?: number | null;
  paymentDay?: number | null;
  totalInstallments?: number | null;
  paidInstallments?: number | null;
  // One-time specific
  borrowedFrom?: string | null;
  plannedPayback?: string | null;
};

type Allocation = { accountId: string; amount: number; description?: string };
type InitialPayment = { date: string; accountId: string | null; amount: number; mode: 'data_only' | 'affect_balance' };

type Liability = {
  id: string;
  title: string;
  description?: string;
  liability_type: string;
  current_balance: number;
  original_amount?: number;
  disbursed_amount?: number;
  interest_rate_apy?: number;
  periodical_payment?: number;
  start_date?: string;
  targeted_payoff_date?: string;
  next_due_date?: string;
  last_payment_date?: string;
  status: string;
  color?: string;
  icon?: string;
  metadata?: any;
};

type AccountBreakdown = {
  accountId: string;
  total: number;
  personal: number;
  liabilityPortions: Array<{
    liabilityId: string;
    liabilityName: string;
    amount: number;
  }>;
  totalLiability: number;
  goalPortions?: Array<{
    goalId: string;
    amount: number;
  }>;
  totalGoal?: number;
};

type LiabilitiesContextValue = {
  liabilities: Liability[];
  loading: boolean;
  fetchLiabilities: () => Promise<void>;
  createLiability: (input: LiabilityInput, allocations?: Allocation[], payments?: InitialPayment[]) => Promise<{ id: string }>;
  updateLiability: (id: string, updates: Partial<LiabilityInput>) => Promise<void>;
  deleteLiability: (id: string) => Promise<void>;
  allocateReceivedFunds: (liabilityId: string, allocations: Allocation[]) => Promise<void>;
  recordInitialPayments: (liabilityId: string, payments: InitialPayment[]) => Promise<void>;
  getAccountBreakdown: (accountId: string) => Promise<AccountBreakdown | null>;
  fetchLiabilityAllocations: (liabilityId: string) => Promise<Array<{ accountId: string; amount: number; liabilityName?: string }>>;
  fetchLiability: (id: string) => Promise<Liability | null>;
  convertLiabilityToPersonal: (accountId: string, liabilityId: string, amount: number, notes?: string) => Promise<void>;
  getAccountsWithLiabilityPortions: () => Promise<Array<{
    accountId: string;
    accountName: string;
    total: number;
    personal: number;
    liabilityPortions: Array<{
      liabilityId: string;
      liabilityName: string;
      amount: number;
    }>;
  }>>;
};

const LiabilitiesContext = createContext<LiabilitiesContextValue | undefined>(undefined);

export function LiabilitiesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [loading, setLoading] = useState(false);

  // Map frontend types to DB types
  const mapLiabilityType = (type: 'loan' | 'emi' | 'one_time'): string => {
    switch (type) {
      case 'loan': return 'personal_loan'; // Default, can be changed later
      case 'emi': return 'personal_loan'; // EMI is handled via metadata
      case 'one_time': return 'other';
      default: return 'other';
    }
  };

  // Fetch all liabilities
  const fetchLiabilities = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLiabilities(data || []);
    } catch (error) {
      console.error('Error fetching liabilities:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchLiabilities();
    }
  }, [user]);

  const value = useMemo<LiabilitiesContextValue>(() => ({
    liabilities,
    loading,
    fetchLiabilities,
    async createLiability(input: LiabilityInput, allocations?: Allocation[], payments?: InitialPayment[]) {
      if (!user) throw new Error('User not authenticated');

      // Map metadata for type-specific fields
      const metadata: any = {};
      if (input.type === 'emi') {
        metadata.emi_amount = input.emiAmount;
        metadata.payment_day = input.paymentDay;
        metadata.total_installments = input.totalInstallments;
        metadata.paid_installments = input.paidInstallments;
        metadata.is_emi = true;
      }
      if (input.type === 'one_time') {
        metadata.borrowed_from = input.borrowedFrom;
        metadata.planned_payback = input.plannedPayback;
      }

      // Determine periodical payment - for loans and EMIs
      let periodicalPayment: number | null = null;
      if (input.type === 'loan' || input.type === 'emi') {
        if (input.type === 'emi' && input.emiAmount) {
          periodicalPayment = input.emiAmount;
        } else if (input.type === 'loan') {
          // Check if monthlyPayment is provided in the input (from modal)
          periodicalPayment = (input as any).monthlyPayment || null;
          if (periodicalPayment) {
            metadata.monthly_payment = periodicalPayment;
          }
        }
      }

      // Create liability
      const { data: liability, error: liabilityError } = await supabase
        .from('liabilities')
        .insert({
          user_id: user.id,
          title: input.name,
          description: input.description || null,
          liability_type: mapLiabilityType(input.type),
          current_balance: input.remainingAmount,
          original_amount: input.totalAmount || input.remainingAmount,
          disbursed_amount: null, // Will be updated after allocations
          interest_rate_apy: input.interestRate || 0,
          periodical_payment: periodicalPayment,
          start_date: input.startDate || null,
          targeted_payoff_date: input.endDate || null,
          next_due_date: input.startDate || null, // Set first payment as next due date
          status: 'active',
          metadata: metadata,
          is_active: true,
          is_deleted: false,
        })
        .select()
        .single();

      if (liabilityError) throw liabilityError;

      const liabilityId = liability.id;

      // Allocate funds to accounts if provided
      if (allocations && allocations.length > 0) {
        // Inline allocation logic to avoid circular dependency
        let totalDisbursed = 0;
        
        for (const allocation of allocations) {
          if (allocation.amount <= 0) continue;
          totalDisbursed += allocation.amount;

          // Check for existing allocation
          const { data: existing, error: existingError } = await supabase
            .from('account_liability_portions')
            .select('id, amount')
            .eq('account_id', allocation.accountId)
            .eq('liability_id', liabilityId)
            .maybeSingle();

          if (existingError && existingError.code !== 'PGRST116') {
            console.error('Error checking existing allocation:', existingError);
            throw existingError;
          }

          if (existing) {
            // Update existing allocation
            const { error: updateError } = await supabase
              .from('account_liability_portions')
              .update({
                amount: (parseFloat(existing.amount || '0') + allocation.amount).toString(),
                notes: allocation.description || null,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (updateError) {
              console.error('Error updating allocation:', updateError);
              throw updateError;
            }
          } else {
            // Create new allocation
            const { error: insertError } = await supabase
              .from('account_liability_portions')
              .insert({
                account_id: allocation.accountId,
                liability_id: liabilityId,
                liability_account_id: null,
                amount: allocation.amount.toString(),
                notes: allocation.description || null,
              });

            if (insertError) {
              console.error('Error inserting allocation:', insertError);
              throw insertError;
            }
          }

          // Update account balance
          const { data: account, error: accountError } = await supabase
            .from('accounts')
            .select('balance')
            .eq('id', allocation.accountId)
            .single();

          if (accountError) {
            console.error('Error fetching account:', accountError);
            throw accountError;
          }

          if (account) {
            const currentBalance = parseFloat(account.balance || '0');
            const newBalance = (currentBalance + allocation.amount).toString();
            
            const { error: balanceUpdateError } = await supabase
              .from('accounts')
              .update({ 
                balance: newBalance,
                updated_at: new Date().toISOString(),
              })
              .eq('id', allocation.accountId);

            if (balanceUpdateError) {
              console.error('Error updating account balance:', balanceUpdateError);
              throw balanceUpdateError;
            }
          }
        }

        // Update liability disbursed amount
        const { error: liabilityUpdateError } = await supabase
          .from('liabilities')
          .update({ 
            disbursed_amount: totalDisbursed.toString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', liabilityId);

        if (liabilityUpdateError) {
          console.error('Error updating liability disbursed amount:', liabilityUpdateError);
          throw liabilityUpdateError;
        }

        // Log initial draw activity
        const { error: activityError } = await supabase
          .from('liability_activity_log')
          .insert({
            liability_id: liabilityId,
            user_id: user.id,
            activity_type: 'draw',
            amount: totalDisbursed.toString(),
            notes: `Drawn ${formatCurrencyAmount(totalDisbursed, input.currency || 'INR')} to account(s) during creation`,
            date: new Date().toISOString().split('T')[0],
          });

        if (activityError) {
          console.error('Error logging initial draw activity:', activityError);
          // Don't throw - this is non-critical
        }
      }

      // Record initial payments if provided
      if (payments && payments.length > 0) {
        let totalPaid = 0;
        for (const payment of payments) {
          if (payment.amount <= 0) continue;

          const { data: paymentRecord } = await supabase
            .from('liability_payments')
            .insert({
              user_id: user.id,
              liability_id: liabilityId,
              account_id: payment.accountId,
              amount: payment.amount,
              payment_date: payment.date,
              payment_type: payment.mode === 'data_only' ? 'mock' : 'historical',
              is_mock: payment.mode === 'data_only',
              method: 'historical_import',
              description: 'Initial payment',
            })
            .select()
            .single();

          totalPaid += payment.amount;

          if (payment.mode === 'affect_balance' && payment.accountId) {
            const { data: account } = await supabase
              .from('accounts')
              .select('balance')
              .eq('id', payment.accountId)
              .single();

            if (account) {
              const newBalance = Math.max(0, parseFloat(account.balance || '0') - payment.amount);
              await supabase
                .from('accounts')
                .update({ balance: newBalance })
                .eq('id', payment.accountId);

              const { data: portion } = await supabase
                .from('account_liability_portions')
                .select('id, amount')
                .eq('account_id', payment.accountId)
                .eq('liability_id', liabilityId)
                .maybeSingle();

              if (portion) {
                const newPortionAmount = Math.max(0, parseFloat(portion.amount || '0') - payment.amount);
                if (newPortionAmount <= 0) {
                  await supabase
                    .from('account_liability_portions')
                    .delete()
                    .eq('id', portion.id);
                } else {
                  await supabase
                    .from('account_liability_portions')
                    .update({ amount: newPortionAmount })
                    .eq('id', portion.id);
                }
              }
            }

            if (paymentRecord) {
              await supabase
                .from('transactions')
                .insert({
                  user_id: user.id,
                  account_id: payment.accountId,
                  amount: payment.amount,
                  type: 'expense',
                  description: 'Liability payment',
                  date: payment.date,
                  metadata: { liability_payment_id: paymentRecord.id },
                });
            }
          }
        }

        if (totalPaid > 0) {
          const { data: liability } = await supabase
            .from('liabilities')
            .select('current_balance')
            .eq('id', liabilityId)
            .single();

          if (liability) {
            const newBalance = Math.max(0, parseFloat(liability.current_balance || '0') - totalPaid);
            await supabase
              .from('liabilities')
              .update({
                current_balance: newBalance,
                last_payment_date: payments[0]?.date || null,
                status: newBalance === 0 ? 'paid_off' : 'active',
              })
              .eq('id', liabilityId);
          }
        }
      }

      // Refresh liabilities list to show the new liability
      await fetchLiabilities();
      
      return { id: liabilityId };
    },
    async updateLiability(id: string, updates: Partial<LiabilityInput>) {
      if (!user) throw new Error('User not authenticated');

      const updateData: any = {};
      if (updates.name) updateData.title = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.remainingAmount !== undefined) updateData.current_balance = updates.remainingAmount;
      if (updates.totalAmount !== undefined) updateData.original_amount = updates.totalAmount;
      if (updates.interestRate !== undefined) updateData.interest_rate_apy = updates.interestRate;
      if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
      if (updates.endDate !== undefined) updateData.targeted_payoff_date = updates.endDate;

      const { error } = await supabase
        .from('liabilities')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      await fetchLiabilities();
    },
    async deleteLiability(id: string) {
      if (!user) throw new Error('User not authenticated');

      // Soft delete
      const { error } = await supabase
        .from('liabilities')
        .update({ is_deleted: true, deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;

      // Optionally remove allocations (or keep for history)
      // For now, we'll keep allocations for audit trail

      await fetchLiabilities();
    },
    async allocateReceivedFunds(liabilityId: string, allocations: Allocation[]) {
      if (!user) throw new Error('User not authenticated');

      // Get liability details
      const { data: liability } = await supabase
        .from('liabilities')
        .select('current_balance, disbursed_amount')
        .eq('id', liabilityId)
        .single();

      if (!liability) throw new Error('Liability not found');

      // Create allocation records and update account balances
      for (const allocation of allocations) {
        if (allocation.amount <= 0) continue;

        // Create or update account_liability_portions
        const { data: existing } = await supabase
          .from('account_liability_portions')
          .select('id, amount')
          .eq('account_id', allocation.accountId)
          .eq('liability_id', liabilityId)
          .single();

        if (existing) {
          // Update existing
          await supabase
            .from('account_liability_portions')
            .update({
              amount: parseFloat(existing.amount || '0') + allocation.amount,
              notes: allocation.description || null,
            })
            .eq('id', existing.id);
        } else {
          // Create new
          await supabase
            .from('account_liability_portions')
            .insert({
              account_id: allocation.accountId,
              liability_id: liabilityId,
              liability_account_id: null,
              amount: allocation.amount,
              notes: allocation.description || null,
            });
        }

        // Update account balance (increase total)
        const { data: account } = await supabase
          .from('accounts')
          .select('balance')
          .eq('id', allocation.accountId)
          .single();

        if (account) {
          const newBalance = parseFloat(account.balance || '0') + allocation.amount;
          await supabase
            .from('accounts')
            .update({ balance: newBalance })
            .eq('id', allocation.accountId);
        }
      }

      // Update liability disbursed_amount
      const totalDisbursed = allocations.reduce((sum, a) => sum + a.amount, 0);
      await supabase
        .from('liabilities')
        .update({ disbursed_amount: totalDisbursed })
        .eq('id', liabilityId);
    },
    async recordInitialPayments(liabilityId: string, payments: InitialPayment[]) {
      if (!user) throw new Error('User not authenticated');

      let totalPaid = 0;

      for (const payment of payments) {
        if (payment.amount <= 0) continue;

        // Create liability_payment record
        const { data: paymentRecord, error: paymentError } = await supabase
          .from('liability_payments')
          .insert({
            user_id: user.id,
            liability_id: liabilityId,
            account_id: payment.accountId,
            amount: payment.amount,
            payment_date: payment.date,
            payment_type: payment.mode === 'data_only' ? 'mock' : 'historical',
            is_mock: payment.mode === 'data_only',
            method: 'historical_import',
            description: 'Initial payment',
          })
          .select()
          .single();

        if (paymentError) {
          console.error('Error recording payment:', paymentError);
          continue;
        }

        totalPaid += payment.amount;

        // If affect_balance and has account, update account balance
        if (payment.mode === 'affect_balance' && payment.accountId) {
          const { data: account } = await supabase
            .from('accounts')
            .select('balance')
            .eq('id', payment.accountId)
            .single();

          if (account) {
            const newBalance = Math.max(0, parseFloat(account.balance || '0') - payment.amount);
            await supabase
              .from('accounts')
              .update({ balance: newBalance })
              .eq('id', payment.accountId);

            // Also reduce liability portion if exists
            const { data: portion } = await supabase
              .from('account_liability_portions')
              .select('id, amount')
              .eq('account_id', payment.accountId)
              .eq('liability_id', liabilityId)
              .single();

            if (portion) {
              const newPortionAmount = Math.max(0, parseFloat(portion.amount || '0') - payment.amount);
              if (newPortionAmount <= 0) {
                await supabase
                  .from('account_liability_portions')
                  .delete()
                  .eq('id', portion.id);
              } else {
                await supabase
                  .from('account_liability_portions')
                  .update({ amount: newPortionAmount })
                  .eq('id', portion.id);
              }
            }
          }
        }

        // Create transaction if affect_balance
        if (payment.mode === 'affect_balance' && payment.accountId) {
          await supabase
            .from('transactions')
            .insert({
              user_id: user.id,
              account_id: payment.accountId,
              amount: payment.amount,
              type: 'expense',
              description: 'Liability payment',
              date: payment.date,
              metadata: { liability_payment_id: paymentRecord.id },
            });
        }
      }

      // Update liability balance
      if (totalPaid > 0) {
        const { data: liability } = await supabase
          .from('liabilities')
          .select('current_balance')
          .eq('id', liabilityId)
          .single();

        if (liability) {
          const newBalance = Math.max(0, parseFloat(liability.current_balance || '0') - totalPaid);
          await supabase
            .from('liabilities')
            .update({
              current_balance: newBalance,
              last_payment_date: payments[0]?.date || null,
              status: newBalance === 0 ? 'paid_off' : 'active',
            })
            .eq('id', liabilityId);
        }
      }
    },
    async getAccountBreakdown(accountId: string): Promise<AccountBreakdown | null> {
      if (!user) return null;
      
      // Get account
      const { data: account, error: accError } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', accountId)
        .eq('user_id', user.id)
        .single();
      
      if (accError || !account) return null;
      
      // Get liability portions for this account
      const { data: portions, error: portionsError } = await supabase
        .from('account_liability_portions')
        .select(`
          liability_id,
          amount,
          liability:liabilities!account_liability_portions_liability_id_fkey(title)
        `)
        .eq('account_id', accountId);
      
      if (portionsError) {
        console.error('Error fetching liability portions:', portionsError);
      }
      
      // Get goal portions for this account
      const { data: goalPortions, error: goalPortionsError } = await supabase
        .from('account_goal_portions')
        .select(`
          goal_id,
          amount
        `)
        .eq('account_id', accountId);
      
      if (goalPortionsError) {
        console.error('Error fetching goal portions:', goalPortionsError);
      }
      
      const liabilityPortions = (portions || []).map((p: any) => ({
        liabilityId: p.liability_id,
        liabilityName: p.liability?.title || 'Unknown',
        amount: parseFloat(p.amount || '0'),
      }));
      
      const goalPortionItems = (goalPortions || []).map((gp: any) => ({
        goalId: gp.goal_id,
        amount: parseFloat(gp.amount || '0'),
      }));
      
      const totalLiability = liabilityPortions.reduce((sum, p) => sum + p.amount, 0);
      const totalGoal = goalPortionItems.reduce((sum, gp) => sum + gp.amount, 0);
      const personal = parseFloat(account.balance || '0') - totalLiability - totalGoal;
      
      return {
        accountId,
        total: parseFloat(account.balance || '0'),
        personal: Math.max(0, personal),
        liabilityPortions,
        totalLiability,
        goalPortions: goalPortionItems,
        totalGoal,
      };
    },
    async fetchLiabilityAllocations(liabilityId: string) {
      if (!user) return [];
      
      const { data, error } = await supabase
        .from('account_liability_portions')
        .select(`
          account_id,
          amount,
          liability:liabilities!account_liability_portions_liability_id_fkey(title)
        `)
        .eq('liability_id', liabilityId);
      
      if (error) {
        console.error('Error fetching liability allocations:', error);
        return [];
      }
      
      return (data || []).map((p: any) => ({
        accountId: p.account_id,
        amount: parseFloat(p.amount || '0'),
        liabilityName: p.liability?.title,
      }));
    },
    async convertLiabilityToPersonal(accountId: string, liabilityId: string, amount: number, notes?: string) {
      if (!user) throw new Error('User not authenticated');
      
      // Get current portion
      const { data: portion } = await supabase
        .from('account_liability_portions')
        .select('amount')
        .eq('account_id', accountId)
        .eq('liability_id', liabilityId)
        .single();
      
      if (!portion || parseFloat(portion.amount || '0') < amount) {
        throw new Error('Insufficient liability funds to convert');
      }
      
      // Reduce liability portion (conversion reduces the allocation, but debt stays same)
      const newAmount = parseFloat(portion.amount || '0') - amount;
      
      if (newAmount <= 0) {
        // Delete portion if fully converted
        await supabase
          .from('account_liability_portions')
          .delete()
          .eq('account_id', accountId)
          .eq('liability_id', liabilityId);
      } else {
        // Update portion
        await supabase
          .from('account_liability_portions')
          .update({ amount: newAmount })
          .eq('account_id', accountId)
          .eq('liability_id', liabilityId);
      }
      
      // Note: Account balance unchanged, debt unchanged - only portion tracking changes
      // This is a psychological/tracking operation only
    },
    async fetchLiability(id: string): Promise<Liability | null> {
      if (!user) return null;

      const { data, error } = await supabase
        .from('liabilities')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !data) return null;
      return data;
    },
    async getAccountsWithLiabilityPortions() {
      if (!user) return [];

      // First get all user account IDs
      const { data: userAccounts } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (!userAccounts || userAccounts.length === 0) return [];

      const accountIds = userAccounts.map(a => a.id);

      // Get all account_liability_portions for this user's accounts
      const { data: portions } = await supabase
        .from('account_liability_portions')
        .select(`
          account_id,
          liability_id,
          amount,
          liability:liabilities!account_liability_portions_liability_id_fkey(title),
          account:accounts!account_liability_portions_account_id_fkey(id, name, balance)
        `)
        .in('account_id', accountIds);

      if (!portions) return [];

      // Group by account
      const accountsMap = new Map<string, {
        accountId: string;
        accountName: string;
        total: number;
        personal: number;
        liabilityPortions: Array<{
          liabilityId: string;
          liabilityName: string;
          amount: number;
        }>;
      }>();

      for (const portion of portions) {
        const accountId = portion.account_id;
        const account = portion.account as any;

        if (!accountsMap.has(accountId)) {
          accountsMap.set(accountId, {
            accountId,
            accountName: account?.name || 'Unknown',
            total: parseFloat(account?.balance || '0'),
            personal: 0,
            liabilityPortions: [],
          });
        }

        const accountData = accountsMap.get(accountId)!;
        accountData.liabilityPortions.push({
          liabilityId: portion.liability_id,
          liabilityName: portion.liability?.title || 'Unknown',
          amount: parseFloat(portion.amount || '0'),
        });
      }

      // Calculate personal funds
      for (const accountData of accountsMap.values()) {
        const totalLiability = accountData.liabilityPortions.reduce((sum, p) => sum + p.amount, 0);
        accountData.personal = Math.max(0, accountData.total - totalLiability);
      }

      return Array.from(accountsMap.values());
    },
  }), [liabilities, loading, user]);

  return (
    <LiabilitiesContext.Provider value={value}>
      {children}
    </LiabilitiesContext.Provider>
  );
}

export function useLiabilities() {
  const ctx = useContext(LiabilitiesContext);
  if (!ctx) throw new Error('useLiabilities must be used within LiabilitiesProvider');
  return ctx;
}


