-- Migration: Add metadata column to liability_schedules
-- Description: Add metadata JSONB column to store principal/interest breakdown and other schedule details

-- Add metadata column to liability_schedules
ALTER TABLE liability_schedules 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add index on metadata for performance (if needed for queries)
CREATE INDEX IF NOT EXISTS idx_liability_schedules_metadata ON liability_schedules USING GIN(metadata);

-- Update existing schedules to have empty metadata
UPDATE liability_schedules 
SET metadata = '{}' 
WHERE metadata IS NULL;

