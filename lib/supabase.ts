import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Validate that we have the required environment variables
// During build time on Vercel, if these aren't set, we'll use placeholders
// that match Supabase's expected format to allow the build to succeed
const url = supabaseUrl || (typeof window === 'undefined' 
  ? 'https://xxxxxxxxxxxxx.supabase.co' // Build-time placeholder
  : '')

const key = supabaseAnonKey || (typeof window === 'undefined'
  ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder' // Build-time placeholder JWT
  : '')

// Get the site URL for redirects
const getSiteUrl = () => {
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  // Server-side: use environment variable or fallback
  return process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : 'http://localhost:3000'
}

// Create Supabase client
// Note: During build, if env vars aren't set, this will use placeholders
// At runtime on Vercel, the actual environment variables will be used
export const supabase = createClient(url, key, {
  auth: {
    persistSession: typeof window !== 'undefined',
    autoRefreshToken: typeof window !== 'undefined',
    detectSessionInUrl: typeof window !== 'undefined',
    redirectTo: getSiteUrl()
  }
})

