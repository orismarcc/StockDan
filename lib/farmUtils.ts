/**
 * Utilitários de fazenda compartilhados entre server components e API routes.
 *
 * Centraliza o padrão repetido de busca de fazendas por usuário:
 *   gestor  → direto em farms.owner_id
 *   outros  → via farm_users + filtro de tenant
 *
 * Evita duplicação em: dashboard/page.tsx, farms/page.tsx, analise/page.tsx,
 * api/farms/route.ts (e futuras adições).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const FARM_FIELDS = 'id, name, farmer_name, city, state, created_at'

export interface FarmSummary {
  id: string
  name: string
  farmer_name: string
  city: string
  state: string
  created_at: string
}

/**
 * Retorna as fazendas que o usuário pode acessar, respeitando o isolamento de tenant.
 *
 * @param supabase  - cliente Supabase server-side
 * @param userId    - session.id do usuário atual
 * @param role      - session.role do usuário atual
 * @param gestorId  - session.gestor_id do usuário atual
 */
export async function getFarmsForUser(
  supabase: SupabaseClient,
  userId: string,
  role: string,
  gestorId: string
): Promise<FarmSummary[]> {
  if (role === 'gestor') {
    const { data } = await supabase
      .from('farms')
      .select(FARM_FIELDS)
      .eq('owner_id', userId)
      .order('name')
    return (data ?? []) as FarmSummary[]
  }

  // Admin/Agrônomo/Operário: fazendas vinculadas via farm_users, dentro do tenant
  const { data } = await supabase
    .from('farm_users')
    .select(`farms!inner(${FARM_FIELDS})`)
    .eq('user_id', userId)
    .eq('farms.owner_id', gestorId)

  return ((data ?? []).map((r: { farms: unknown }) => r.farms).filter(Boolean)) as FarmSummary[]
}
