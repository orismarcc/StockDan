// app/(app)/analise/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { AnaliseClient } from './AnaliseClient'
import type { AnaliseData } from './types'

export const metadata = { title: 'Análise' }

export default async function AnalisePage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.role, 'analysis.view')) redirect('/dashboard')

  const supabase = createServerClient()

  // 1. Fetch farms this user can see
  let farmIds: string[] = []
  let farms: { id: string; name: string }[] = []

  if (session.role === 'gestor') {
    const { data } = await supabase
      .from('farms')
      .select('id, name')
      .eq('owner_id', session.id)
      .order('name')
    farms = data ?? []
    farmIds = farms.map((f) => f.id)
  } else {
    // Admin/Agrônomo/Operário: fazendas vinculadas, dentro do tenant
    const { data } = await supabase
      .from('farm_users')
      .select('farms!inner(id, name, owner_id)')
      .eq('user_id', session.id)
      .eq('farms.owner_id', session.gestor_id)
    farms = ((data ?? []).map((r: { farms: { id: string; name: string } | { id: string; name: string }[] }) => r.farms).flat().filter(Boolean) as { id: string; name: string }[])
    farmIds = farms.map((f) => f.id)
  }

  if (farmIds.length === 0) {
    const emptyData: AnaliseData = {
      farms: [],
      talhoes: [],
      insumos: [],
      transactions: [],
      operators: [],
      currentUserId: session.id,
      currentUserRole: session.role,
    }
    return <AnaliseClient data={emptyData} />
  }

  // 2. Fetch talhoes + insumos in parallel
  const [{ data: talhoesRaw }, { data: insumosRaw }] = await Promise.all([
    supabase.from('talhoes').select('id, farm_id, name, area_ha').in('farm_id', farmIds).order('name'),
    supabase.from('insumos').select('id, farm_id, title, unit').in('farm_id', farmIds).order('title'),
  ])

  // 3. Fetch transactions (saidas only)
  let txQuery = supabase
    .from('transactions')
    .select('id, farm_id, insumo_id, talhao_id, user_id, quantity, area_ha, date, notes')
    .in('farm_id', farmIds)
    .eq('type', 'saida')
    .order('date', { ascending: false })

  // Operários only see their own records
  if (session.role === 'operario') {
    txQuery = txQuery.eq('user_id', session.id)
  }

  const { data: txRaw } = await txQuery

  // 4. Fetch operator names for all unique user_ids in transactions
  const userIds = [...new Set((txRaw ?? []).map((t: { user_id: string }) => t.user_id).filter(Boolean))] as string[]
  const { data: usersRaw } = userIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', userIds)
    : { data: [] }

  const data: AnaliseData = {
    farms,
    talhoes: (talhoesRaw ?? []).map((t) => ({
      id: t.id,
      farm_id: t.farm_id,
      name: t.name,
      area_ha: Number(t.area_ha),
    })),
    insumos: insumosRaw ?? [],
    transactions: (txRaw ?? []).map((t) => ({
      id: t.id,
      farm_id: t.farm_id,
      insumo_id: t.insumo_id,
      talhao_id: t.talhao_id,
      user_id: t.user_id,
      date: t.date,
      notes: t.notes,
      quantity: Number(t.quantity),
      area_ha: t.area_ha != null ? Number(t.area_ha) : null,
    })),
    operators: usersRaw ?? [],
    currentUserId: session.id,
    currentUserRole: session.role,
  }

  return <AnaliseClient data={data} />
}
