-- Ensure users can see their own profile immediately after creation
-- This fixes 406 errors during signup

-- Drop conflicting policies
DROP POLICY IF EXISTS "Users see profiles in their hospital" ON user_profiles;
DROP POLICY IF EXISTS "Users can see own profile" ON user_profiles;

-- CRITICAL: Users MUST be able to see their own profile (simple check, no dependencies)
-- This must come first and be simple to avoid circular dependencies
CREATE POLICY "Users can see own profile" ON user_profiles
  FOR SELECT
  USING (id = auth.uid());

-- Also allow users to see profiles in their hospital (for later use)
CREATE POLICY "Users see profiles in their hospital" ON user_profiles
  FOR SELECT
  USING (
    -- Allow if it's their own profile (already covered above, but explicit)
    id = auth.uid()
    OR
    -- Allow if user is superadmin
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.role = 'superadmin'
    )
    OR
    -- Allow if both users are in the same hospital
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid()
      AND up.hospital_id IS NOT NULL
      AND up.hospital_id = user_profiles.hospital_id
    )
  );

-- Verify policies
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'user_profiles'
AND cmd = 'SELECT'
ORDER BY policyname;

