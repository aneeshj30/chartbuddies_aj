-- Comprehensive fix for RLS policies for hospitals and patients
-- This fixes both signup and patient registration issues

-- ============================================
-- 1. FIX HOSPITAL INSERT POLICY
-- ============================================
-- Drop existing policy
DROP POLICY IF EXISTS "Users can create hospitals" ON hospitals;

-- Create a more permissive policy for signups
-- Allows authenticated users to create hospitals if they don't have one yet
CREATE POLICY "Users can create hospitals" ON hospitals
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL 
    AND
    (
      -- Allow if user doesn't have a hospital_id (handles new signups and auto-fix)
      -- This works even if profile doesn't exist yet (returns true)
      NOT EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.hospital_id IS NOT NULL
      )
      OR
      -- Allow superadmins to create hospitals
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'superadmin'
      )
    )
  );

-- ============================================
-- 2. FIX PATIENTS INSERT POLICY
-- ============================================
-- Drop existing policies
DROP POLICY IF EXISTS "Nurses can insert patients" ON patients;
DROP POLICY IF EXISTS "Head nurses can manage patients" ON patients;

-- Policy for nurses to insert patients
-- Allows nurses to insert patients into their own hospital
CREATE POLICY "Nurses can insert patients" ON patients
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.hospital_id = patients.hospital_id
      AND user_profiles.role = 'nurse'
      AND user_profiles.hospital_id IS NOT NULL
    )
  );

-- Policy for head nurses and superadmins to manage patients
CREATE POLICY "Head nurses can manage patients" ON patients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.hospital_id = patients.hospital_id
      AND user_profiles.role IN ('superadmin', 'head_nurse')
      AND user_profiles.hospital_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.hospital_id = patients.hospital_id
      AND user_profiles.role IN ('superadmin', 'head_nurse')
      AND user_profiles.hospital_id IS NOT NULL
    )
  );

-- ============================================
-- 3. VERIFY POLICIES
-- ============================================
-- Check hospital policies
SELECT 
  'hospitals' as table_name,
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'hospitals'
AND policyname = 'Users can create hospitals';

-- Check patients policies
SELECT 
  'patients' as table_name,
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename = 'patients'
AND policyname IN ('Nurses can insert patients', 'Head nurses can manage patients')
ORDER BY policyname;

