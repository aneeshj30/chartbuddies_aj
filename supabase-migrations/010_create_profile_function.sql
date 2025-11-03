-- Create a function that can be called from the client to create a user profile
-- This function uses SECURITY DEFINER to bypass RLS, so it can create profiles even if the user isn't fully authenticated yet

-- Drop the function first if it exists (in case return type changed)
DROP FUNCTION IF EXISTS create_user_profile_safe(UUID, TEXT, TEXT);

-- Create the function with UUID return type
CREATE FUNCTION create_user_profile_safe(
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_user_profile_safe(UUID, TEXT, TEXT) TO authenticated, anon;

-- Also ensure the trigger is still set up as a backup
CREATE OR REPLACE FUNCTION create_user_profile()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role, hospital_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'User'),
    'nurse',
    NULL
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error creating user profile: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION create_user_profile();

