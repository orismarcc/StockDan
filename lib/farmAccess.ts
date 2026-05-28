import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionUser } from './auth'

/**
 * Retorna true se a session tem acesso a esta fazenda.
 *
 * P7 + P8:
 * - Gestor: dono direto (owner_id = session.id)
 * - Admin / Agrônomo / Operário: precisa de farm_users (user_id=session.id)
 *   E a fazenda tem que pertencer ao Gestor do tenant (owner_id = session.gestor_id).
 *   Defesa em profundidade: bloqueia mesmo que alguém manipule farm_users.
 */
export async function checkFarmAccess(
  supabase: SupabaseClient,
  session: SessionUser,
  farmId: string
): Promise<boolean> {
  if (session.role === 'gestor') {
    const { data } = await supabase
      .from('farms')
      .select('id')
      .eq('id', farmId)
      .eq('owner_id', session.id)
      .maybeSingle()
    return !!data
  }

  // Join farm_users → farms, filtrando por tenant
  const { data } = await supabase
    .from('farm_users')
    .select('farm_id, farms!inner(owner_id)')
    .eq('user_id', session.id)
    .eq('farm_id', farmId)
    .eq('farms.owner_id', session.gestor_id)
    .maybeSingle()
  return !!data
}
