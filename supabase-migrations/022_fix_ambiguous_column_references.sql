-- Fix ambiguous column references in all functions
-- This fixes the "column reference 'id' is ambiguous" error

-- ============================================
-- 1. FIX create_hospital_safe FUNCTION
-- ============================================
DROP FUNCTION IF EXISTS create_hospital_safe(VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION create_hospital_safe(
  p_name VARCHAR(255),
  p_facility_type VARCHAR(100),
  p_invite_code VARCHAR(20)
)
RETURNS TABLE(id UUID, name VARCHAR, facility_type VARCHAR, invite_code VARCHAR, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hospital_id UUID;
  v_user_id UUID;
  v_hospital_record RECORD;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  -- If auth.uid() is NULL, try to get from JWT claims
  IF v_user_id IS NULL THEN
    BEGIN
      v_user_id := (current_setting('request.jwt.claims', true)::json->>'sub')::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_user_id := NULL;
    END;
  END IF;
  
  -- If we have a user_id, check if they already have a hospital (prevent duplicates)
  -- Use explicit table alias to avoid ambiguity
  IF v_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = v_user_id
      AND up.hospital_id IS NOT NULL
      AND up.role != 'superadmin'
    ) THEN
      RAISE EXCEPTION 'User already has a hospital assigned';
    END IF;
  END IF;
  
  -- Create hospital (bypasses RLS due to SECURITY DEFINER)
  INSERT INTO hospitals (name, facility_type, invite_code)
  VALUES (p_name, p_facility_type, p_invite_code)
  RETURNING * INTO v_hospital_record;
  
  -- Return the created hospital
  RETURN QUERY SELECT 
    v_hospital_record.id,
    v_hospital_record.name,
    v_hospital_record.facility_type,
    v_hospital_record.invite_code,
    v_hospital_record.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION create_hospital_safe TO authenticated;
GRANT EXECUTE ON FUNCTION create_hospital_safe TO anon;

-- ============================================
-- 2. FIX update_user_profile_on_signup FUNCTION
-- ============================================
DROP FUNCTION IF EXISTS update_user_profile_on_signup(UUID, UUID, VARCHAR, VARCHAR);

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
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'Can only update own profile';
    END IF;
  END IF;
  
  -- Update the profile - use explicit table name to avoid ambiguity
  UPDATE user_profiles up
  SET 
    hospital_id = p_hospital_id,
    role = p_role,
    full_name = COALESCE(p_full_name, up.full_name),
    updated_at = NOW()
  WHERE up.id = p_user_id;
  
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION update_user_profile_on_signup TO authenticated;
GRANT EXECUTE ON FUNCTION update_user_profile_on_signup TO anon;

-- ============================================
-- 3. VERIFY
-- ============================================
SELECT 'Functions fixed - ambiguous columns resolved' as status;

