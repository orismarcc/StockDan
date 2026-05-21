import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { FarmCard } from '@/components/FarmCard'
import { Button } from '@/components/ui/Button'

export const metadata = { title: 'Fazendas' }

async function getFarmsWithStats(userId: string, role: string) {
  const supabase = createServerClient()
  let farmsData: any[] = []

  if (role === 'admin') {
    const { data } = await supabase.from('farms').select('*').order('name')
    farmsData = data ?? []
  } else {
    const { data } = await supabase
      .from('farm_users')
      .select('farms(*)')
      .eq('user_id', userId)
    farmsData = (data ?? []).map((r: any) => r.farms).filter(Boolean)
  }

  return Promise.all(
    farmsData.map(async (farm) => {
      const [{ data: insumos }, { count: talhaoCount }] = await Promise.all([
        supabase.from('insumos').select('quantity, min_quantity').eq('farm_id', farm.id),
        supabase.from('talhoes').select('*', { count: 'exact', head: true }).eq('farm_id', farm.id),
      ])

      const list = insumos ?? []
      return {
        ...farm,
        insumoCount: list.length,
        talhaoCount: talhaoCount ?? 0,
        emptyCount: list.filter((i: any) => Number(i.quantity) <= 0).length,
        lowCount: list.filter(
          (i: any) =>
            Number(i.quantity) > 0 &&
            i.min_quantity != null &&
            Number(i.quantity) <= Number(i.min_quantity)
        ).length,
      }
    })
  )
}

export default async function FarmsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const farms = await getFarmsWithStats(session.id, session.role)

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Fazendas</h1>
          <p className="mt-1 text-sm text-gray-500">
            {farms.length === 0
              ? 'Nenhuma fazenda cadastrada'
              : `${farms.length} fazenda${farms.length !== 1 ? 's' : ''} cadastrada${farms.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {session.role === 'admin' && (
          <Link href="/farms/new">
            <Button>
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Nova Fazenda
            </Button>
          </Link>
        )}
      </div>

      {farms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
            <svg className="h-7 w-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-400">Nenhuma fazenda cadastrada ainda</p>
          <p className="mt-1 text-xs text-gray-600">Adicione a primeira fazenda para começar a gerenciar insumos.</p>
          {session.role === 'admin' && (
            <Link href="/farms/new" className="mt-4">
              <Button>Cadastrar primeira fazenda</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {farms.map((farm) => (
            <FarmCard
              key={farm.id}
              id={farm.id}
              name={farm.name}
              farmerName={farm.farmer_name}
              city={farm.city}
              state={farm.state}
              insumoCount={farm.insumoCount}
              talhaoCount={farm.talhaoCount}
              emptyCount={farm.emptyCount}
              lowCount={farm.lowCount}
            />
          ))}
        </div>
      )}
    </div>
  )
}
