-- Fix the hospital INSERT policy that may have been created incorrectly
-- This ensures the WITH CHECK clause is properly set

-- Drop the policy if it exists (in case it was created without proper conditions)
DROP POLICY IF EXISTS "Users can create hospitals" ON hospitals;

-- Recreate with proper security checks
-- Note: This policy allows authenticated users to create hospitals if:
-- 1. They don't have a hospital_id (new signups)
-- 2. They are superadmins
-- The policy handles cases where profile might not exist yet (new signups)
CREATE POLICY "Users can create hospitals" ON hospitals
  FOR INSERT
  WITH CHECK (
    -- Must be authenticated
    auth.uid() IS NOT NULL 
    AND
    (
      -- Allow if user profile doesn't exist (new signup) OR has NULL hospital_id
      -- This handles the signup flow where profile might be created but hospital_id is NULL
      NOT EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.hospital_id IS NOT NULL
      )
      OR
      -- Allow superadmins to create hospitals (even if they have a hospital_id)
      EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'superadmin'
      )
    )
  );

-- Verify the policy was created correctly
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'hospitals'
AND policyname = 'Users can create hospitals';

