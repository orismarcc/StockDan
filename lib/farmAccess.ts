import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionUser } from './auth'

export async function checkFarmAccess(
  supabase: SupabaseClient,
  session: SessionUser,
  farmId: string
): Promise<boolean> {
  if (session.role === 'admin') return true

  const { data } = await supabase
    .from('farm_users')
    .select('farm_id')
    .eq('user_id', session.id)
    .eq('farm_id', farmId)
    .single()

  return !!data
}
