import { supabase } from './supabase'
import type { UserProfile, Role } from '../types/auth'

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function getUserProfile(userId?: string): Promise<UserProfile | null> {
  const user = userId ? { id: userId } : await getCurrentUser()
  if (!user) return null

  const targetUserId = userId || user.id

  // First try direct query
  let { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', targetUserId)
    .single()

  // If that fails, try using the function that bypasses RLS
  if (error || !data) {
    console.log('Direct query failed, trying function...', error)
    const { data: functionData, error: functionError } = await supabase
      .rpc('get_user_profile_safe', { p_user_id: targetUserId })
    
    if (functionError) {
      console.error('Function error:', functionError)
      return null
    }
    
    if (functionData && functionData.length > 0) {
      return functionData[0] as UserProfile
    }
    
    return null
  }
  
  return data as UserProfile
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = await getCurrentUser()
  if (!user) return null
  return getUserProfile(user.id)
}

export function hasRole(userProfile: UserProfile | null, roles: Role[]): boolean {
  if (!userProfile) return false
  return roles.includes(userProfile.role)
}

export function canAccessHospital(userProfile: UserProfile | null, hospitalId: string): boolean {
  if (!userProfile) return false
  if (userProfile.role === 'superadmin') return true
  return userProfile.hospital_id === hospitalId
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

