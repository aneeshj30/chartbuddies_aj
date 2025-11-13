import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { getCurrentUserProfile } from '../../lib/auth'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Redirect if already logged in
    const checkSession = async () => {
      const profile = await getCurrentUserProfile()
      if (profile) {
        router.push('/dashboard')
      }
    }
    checkSession()
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')

    const { data, error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (loginError) {
      setError(loginError.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Wait a moment for any triggers to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Try to get profile using function first (bypasses RLS)
      let profile = null
      
      // First, try using the function that bypasses RLS
      const { data: functionProfile, error: functionError } = await supabase
        .rpc('get_user_profile_safe', { p_user_id: data.user.id })
      
      if (!functionError && functionProfile && functionProfile.length > 0) {
        profile = functionProfile[0]
        console.log('Profile found via function')
      } else {
        // Fallback to regular query
        profile = await getCurrentUserProfile()
      }
      
      // If profile still doesn't exist, try to create it
      if (!profile) {
        console.log('Profile not found, attempting to create via function...')
        
        // Try using the database function first (bypasses RLS)
        const { data: profileId, error: createError } = await supabase
          .rpc('create_user_profile_safe', {
            p_user_id: data.user.id,
            p_email: data.user.email!,
            p_full_name: data.user.user_metadata?.full_name || data.user.email || 'User'
          })
        
        if (!createError && profileId) {
          console.log('Profile created, fetching again...')
          // Wait a moment and fetch again
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Try function again
          const { data: newProfile } = await supabase
            .rpc('get_user_profile_safe', { p_user_id: data.user.id })
          
          if (newProfile && newProfile.length > 0) {
            profile = newProfile[0]
          } else {
            profile = await getCurrentUserProfile()
          }
        } else if (createError) {
          // If it's a duplicate key error, profile exists - fetch it
          if (createError.code === '23505' || createError.message?.includes('duplicate')) {
            console.log('Profile already exists, fetching via function...')
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const { data: existingProfile } = await supabase
              .rpc('get_user_profile_safe', { p_user_id: data.user.id })
            
            if (existingProfile && existingProfile.length > 0) {
              profile = existingProfile[0]
            } else {
              profile = await getCurrentUserProfile()
            }
          } else {
            console.error('Failed to create profile:', createError)
          }
        }
      }
      
      if (profile) {
        router.push('/dashboard')
      } else {
        setError('User profile not found. Please contact administrator.')
      }
    }
    setLoading(false)
  }

  return (
    <>
      <Head>
        <title>Login - Chartbuddies</title>
      </Head>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-6 text-center text-gray-800 dark:text-white">
            Welcome Back
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-center mb-8">
            Sign in to access your dashboard
          </p>

          {error && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
              <p className="text-green-800 dark:text-green-200 text-sm">{message}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="your@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link href="/auth/signup" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-medium">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

