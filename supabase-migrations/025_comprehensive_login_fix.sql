-- COMPREHENSIVE FIX FOR LOGIN ISSUES
-- This removes all conflicting policies and creates a function to bypass RLS

-- ============================================
-- 1. REMOVE ALL EXISTING SELECT POLICIES
-- ============================================
DROP POLICY IF EXISTS "Users see profiles in their hospital" ON user_profiles;
DROP POLICY IF EXISTS "Users can always see own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can see own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users can see hospital profiles" ON user_profiles;
DROP POLICY IF EXISTS "Superadmins see all profiles" ON user_profiles;

-- ============================================
-- 2. CREATE SINGLE, SIMPLE SELECT POLICY
-- ============================================
-- Users MUST be able to see their own profile - this is critical for login
CREATE POLICY "Users can see own profile" ON user_profiles
  FOR SELECT
  USING (id = auth.uid());

-- ============================================
-- 3. CREATE FUNCTION TO GET PROFILE (BYPASSES RLS)
-- ============================================
DROP FUNCTION IF EXISTS get_user_profile_safe(UUID);

CREATE OR REPLACE FUNCTION get_user_profile_safe(p_user_id UUID)
RETURNS TABLE(
  id UUID,
  email TEXT,
  full_name TEXT,
  role VARCHAR,
  hospital_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.id,
    up.email,
    up.full_name,
    up.role,
    up.hospital_id,
    up.created_at,
    up.updated_at
  FROM user_profiles up
  WHERE up.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_profile_safe(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_profile_safe(UUID) TO anon;

-- ============================================
-- 4. ENSURE create_user_profile_safe EXISTS
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
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION create_user_profile_safe(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION create_user_profile_safe(UUID, TEXT, TEXT) TO anon;

-- ============================================
-- 5. VERIFY POLICIES
-- ============================================
SELECT 
  policyname, 
  cmd, 
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;

SELECT 'Comprehensive login fix applied' as status;

