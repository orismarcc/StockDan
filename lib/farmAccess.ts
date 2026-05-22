import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionUser } from './auth'

export async function checkFarmAccess(
  supabase: SupabaseClient,
  session: SessionUser,
  farmId: string
): Promise<boolean> {
  if (session.role === 'admin') {
    // Admin acessa somente suas próprias fazendas (ou legadas com owner_id NULL)
    const { data } = await supabase
      .from('farms')
      .select('id, owner_id')
      .eq('id', farmId)
      .single()
    if (!data) return false
    // Pode acessar sua própria fazenda ou fazenda sem dono (para reivindicação)
    return data.owner_id === null || data.owner_id === session.id
  }

  const { data } = await supabase
    .from('farm_users')
    .select('farm_id')
    .eq('user_id', session.id)
    .eq('farm_id', farmId)
    .single()

  return !!data
}
