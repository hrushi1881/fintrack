-- Migration: Create budget_events table
-- Description: Audit trail for budget operations and events

CREATE TABLE IF NOT EXISTS budget_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_budget_events_budget_id ON budget_events(budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_events_event_type ON budget_events(event_type);
CREATE INDEX IF NOT EXISTS idx_budget_events_actor_id ON budget_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_budget_events_created_at ON budget_events(created_at);
CREATE INDEX IF NOT EXISTS idx_budget_events_metadata ON budget_events USING GIN(metadata);

-- Add RLS (Row Level Security)
ALTER TABLE budget_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only access budget_events for their own budgets
CREATE POLICY "Users can view budget_events for their budgets" ON budget_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_events.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert budget_events for their budgets" ON budget_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_events.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update budget_events for their budgets" ON budget_events
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_events.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete budget_events for their budgets" ON budget_events
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM budgets 
      WHERE budgets.id = budget_events.budget_id 
      AND budgets.user_id = auth.uid()
    )
  );

-- Add updated_at trigger
CREATE TRIGGER update_budget_events_updated_at
  BEFORE UPDATE ON budget_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
