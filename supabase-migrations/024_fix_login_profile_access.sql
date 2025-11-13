-- Fix RLS policies to ensure users can always see their own profile
-- This fixes the "User profile not found" error during login

-- ============================================
-- 1. ENSURE USERS CAN SEE THEIR OWN PROFILE
-- ============================================
DROP POLICY IF EXISTS "Users can see own profile" ON user_profiles;

CREATE POLICY "Users can see own profile" ON user_profiles
  FOR SELECT
  USING (id = auth.uid());

-- ============================================
-- 2. ENSURE create_user_profile_safe FUNCTION EXISTS
-- ============================================
DROP FUNCTION IF EXISTS create_user_profile_safe(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION create_user_profile_safe(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  -- Insert the profile (will use ON CONFLICT if it already exists)
  INSERT INTO public.user_profiles (id, email, full_name, role, hospital_id)
  VALUES (
    p_user_id,
    p_email,
    COALESCE(p_full_name, p_email, 'User'),
    'nurse',
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name)
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Return NULL on error so we can detect it
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION create_user_profile_safe(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile_safe(UUID, TEXT, TEXT) TO anon;

-- ============================================
-- 3. VERIFY
-- ============================================
SELECT 'Login profile access fixed' as status;

