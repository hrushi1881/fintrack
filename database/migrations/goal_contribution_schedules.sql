-- Create goal_contribution_schedules table
-- Manages recurring contribution schedules for goals

CREATE TABLE IF NOT EXISTS goal_contribution_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  
  -- Recurrence pattern
  frequency TEXT NOT NULL CHECK (frequency IN ('day', 'week', 'month', 'quarter', 'year', 'custom')),
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval > 0),
  start_date DATE NOT NULL,
  end_date DATE,
  date_of_occurrence INTEGER,
  custom_unit TEXT CHECK (custom_unit IN ('day', 'week', 'month', 'quarter', 'year')),
  custom_interval INTEGER CHECK (custom_interval > 0),
  
  -- Source and destination accounts
  source_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  destination_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  
  -- Fund bucket configuration
  fund_type TEXT NOT NULL DEFAULT 'personal' CHECK (fund_type IN ('personal', 'liability', 'goal')),
  specific_fund_id UUID, -- ID of specific fund (goal_id or liability_id)
  
  -- Auto-creation settings
  auto_create BOOLEAN NOT NULL DEFAULT TRUE,
  auto_create_days_before INTEGER NOT NULL DEFAULT 3,
  
  -- Reminder settings
  remind_before BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[7, 3, 1],
  
  -- Status and lifecycle
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  paused_until DATE,
  
  -- Visual customization
  color TEXT,
  icon TEXT,
  
  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_goal_schedules_user_id ON goal_contribution_schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_goal_schedules_goal_id ON goal_contribution_schedules(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_schedules_status ON goal_contribution_schedules(status);
CREATE INDEX IF NOT EXISTS idx_goal_schedules_start_date ON goal_contribution_schedules(start_date);
CREATE INDEX IF NOT EXISTS idx_goal_schedules_source_account ON goal_contribution_schedules(source_account_id);

-- RLS Policies
ALTER TABLE goal_contribution_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own goal schedules"
  ON goal_contribution_schedules
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create goal schedules"
  ON goal_contribution_schedules
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own goal schedules"
  ON goal_contribution_schedules
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own goal schedules"
  ON goal_contribution_schedules
  FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_goal_schedule_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_goal_schedule_updated_at
  BEFORE UPDATE ON goal_contribution_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_goal_schedule_updated_at();

-- Comments
COMMENT ON TABLE goal_contribution_schedules IS 'Recurring contribution schedules for goals';
COMMENT ON COLUMN goal_contribution_schedules.frequency IS 'Recurrence frequency: day, week, month, quarter, year, custom';
COMMENT ON COLUMN goal_contribution_schedules.fund_type IS 'Type of fund to deduct from: personal, liability, goal';
COMMENT ON COLUMN goal_contribution_schedules.auto_create IS 'Whether to auto-create bills/transactions for contributions';
COMMENT ON COLUMN goal_contribution_schedules.status IS 'Schedule status: active, paused, completed, cancelled';
