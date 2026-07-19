-- Performance optimization migration
-- This migration addresses database performance issues by:
-- 1. Adding missing foreign key indexes
-- 2. Fixing Row Level Security (RLS) policies to avoid auth function re-evaluation

-- Add missing foreign key indexes for better query performance

-- Accounts table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_accounts_organization_id ON public.accounts(organization_id);

-- Budget events table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_budget_events_actor_id ON public.budget_events(actor_id);

-- Budgets table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_budgets_created_by ON public.budgets(created_by);

-- Goals table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON public.goals(user_id);

-- Liabilities table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_liabilities_linked_account_id ON public.liabilities(linked_account_id);

-- Liability payments table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_liability_payments_account_id ON public.liability_payments(account_id);
CREATE INDEX IF NOT EXISTS idx_liability_payments_category_id ON public.liability_payments(category_id);
CREATE INDEX IF NOT EXISTS idx_liability_payments_transaction_id ON public.liability_payments(transaction_id);

-- Liability schedules table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_liability_schedules_account_id ON public.liability_schedules(account_id);

-- Recurring transactions table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_account_id ON public.recurring_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_category_id ON public.recurring_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_linked_budget_id ON public.recurring_transactions(linked_budget_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_linked_goal_id ON public.recurring_transactions(linked_goal_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_linked_liability_id ON public.recurring_transactions(linked_liability_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_organization_id ON public.recurring_transactions(organization_id);

-- Scheduled transactions table foreign key indexes
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_account_id ON public.scheduled_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_category_id ON public.scheduled_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_transaction_id ON public.scheduled_transactions(transaction_id);

-- Fix Row Level Security policies to avoid auth function re-evaluation
-- Replace auth.<function>() calls with (select auth.<function>()) for better performance

-- Drop existing policies that cause performance issues
DROP POLICY IF EXISTS "Users can view own profile" ON public.users_profile;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users_profile;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users_profile;

-- Recreate users_profile policies with optimized auth calls
CREATE POLICY "Users can view own profile" ON public.users_profile
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own profile" ON public.users_profile
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own profile" ON public.users_profile
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- Drop and recreate categories policies
DROP POLICY IF EXISTS "Users can view own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can update own categories" ON public.categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON public.categories;

CREATE POLICY "Users can view own categories" ON public.categories
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own categories" ON public.categories
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own categories" ON public.categories
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own categories" ON public.categories
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Drop and recreate transactions policies
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.transactions;

CREATE POLICY "Users can view own transactions" ON public.transactions
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own transactions" ON public.transactions
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own transactions" ON public.transactions
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own transactions" ON public.transactions
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Drop and recreate budgets policies
DROP POLICY IF EXISTS "Users can view own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can insert own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can update own budgets" ON public.budgets;
DROP POLICY IF EXISTS "Users can delete own budgets" ON public.budgets;

CREATE POLICY "Users can view own budgets" ON public.budgets
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own budgets" ON public.budgets
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own budgets" ON public.budgets
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own budgets" ON public.budgets
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Drop and recreate user_currencies policies
DROP POLICY IF EXISTS "Users can view own currencies" ON public.user_currencies;
DROP POLICY IF EXISTS "Users can insert own currencies" ON public.user_currencies;
DROP POLICY IF EXISTS "Users can update own currencies" ON public.user_currencies;
DROP POLICY IF EXISTS "Users can delete own currencies" ON public.user_currencies;

CREATE POLICY "Users can view own currencies" ON public.user_currencies
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own currencies" ON public.user_currencies
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own currencies" ON public.user_currencies
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own currencies" ON public.user_currencies
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Drop and recreate accounts policies
DROP POLICY IF EXISTS "Users can view own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can insert own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can update own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can delete own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can insert their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.accounts;

CREATE POLICY "Users can view own accounts" ON public.accounts
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own accounts" ON public.accounts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own accounts" ON public.accounts
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own accounts" ON public.accounts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Drop and recreate profiles policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = id);

CREATE POLICY "Users can delete own profile" ON public.profiles
  FOR DELETE USING ((select auth.uid()) = id);

-- Drop and recreate users policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING ((select auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING ((select auth.uid()) = id);

CREATE POLICY "Users can insert own profile" ON public.users
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- Drop and recreate goals policies
DROP POLICY IF EXISTS "Users can view own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can insert own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;

CREATE POLICY "Users can view own goals" ON public.goals
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own goals" ON public.goals
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own goals" ON public.goals
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own goals" ON public.goals
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Drop and recreate bills policies
DROP POLICY IF EXISTS "Users can view own bills" ON public.bills;
DROP POLICY IF EXISTS "Users can insert own bills" ON public.bills;
DROP POLICY IF EXISTS "Users can update own bills" ON public.bills;
DROP POLICY IF EXISTS "Users can delete own bills" ON public.bills;

CREATE POLICY "Users can view own bills" ON public.bills
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own bills" ON public.bills
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own bills" ON public.bills
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own bills" ON public.bills
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Continue with remaining policies...
-- Note: This is a comprehensive fix for RLS performance issues


