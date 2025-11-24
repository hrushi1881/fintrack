-- Migration 019: Auto-create user profile trigger
-- Description: Automatically create users_profile when a new user signs up
-- This bypasses RLS issues during signup

-- Function to automatically create user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  full_name_text TEXT;
BEGIN
  -- Build full name from metadata
  IF NEW.raw_user_meta_data->>'first_name' IS NOT NULL AND NEW.raw_user_meta_data->>'last_name' IS NOT NULL THEN
    full_name_text := NEW.raw_user_meta_data->>'first_name' || ' ' || NEW.raw_user_meta_data->>'last_name';
  ELSIF NEW.raw_user_meta_data->>'full_name' IS NOT NULL THEN
    full_name_text := NEW.raw_user_meta_data->>'full_name';
  ELSE
    full_name_text := NEW.email;
  END IF;

  INSERT INTO public.users_profile (user_id, full_name, base_currency, phone)
  VALUES (
    NEW.id,
    full_name_text,
    COALESCE(NEW.raw_user_meta_data->>'base_currency', 'USD'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET 
    full_name = COALESCE(EXCLUDED.full_name, users_profile.full_name),
    phone = COALESCE(EXCLUDED.phone, users_profile.phone);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

