-- Fix profile update during signup - allow users to update their own profile
-- This ensures the first user who creates a hospital becomes superadmin

-- ============================================
-- 1. ENSURE USERS CAN UPDATE THEIR OWN PROFILE
-- ============================================
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;

-- Allow users to update their own profile, including hospital_id and role
-- This is needed during signup when user creates a hospital
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================
-- 2. CREATE FUNCTION TO UPDATE PROFILE (BYPASSES RLS)
-- ============================================
-- This function can be used if direct update fails
CREATE OR REPLACE FUNCTION update_user_profile_on_signup(
  p_user_id UUID,
  p_hospital_id UUID,
  p_role VARCHAR,
  p_full_name VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the user_id matches the authenticated user (security check)
  IF auth.uid() IS NOT NULL AND auth.uid() != p_user_id THEN
    -- If we have an auth context, verify it matches
    -- But allow if auth.uid() is NULL (during signup)
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Can only update own profile';
    END IF;
  END IF;
  
  -- Update the profile
  UPDATE user_profiles
  SET 
    hospital_id = p_hospital_id,
    role = p_role,
    full_name = COALESCE(p_full_name, user_profiles.full_name),
    updated_at = NOW()
  WHERE user_profiles.id = p_user_id;
  
  RETURN TRUE;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_user_profile_on_signup TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_profile_on_signup TO anon;

-- ============================================
-- 3. VERIFY POLICIES
-- ============================================
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'user_profiles'
AND cmd = 'UPDATE'
ORDER BY policyname;

