import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { FarmCard } from '@/components/FarmCard'
import { Button } from '@/components/ui/Button'

export const metadata = { title: 'Dashboard' }

async function getFarmsWithStats(userId: string, role: string) {
  const supabase = createServerClient()

  let farmsData: any[] = []

  if (role === 'admin') {
    // Admins veem apenas suas próprias fazendas
    const { data } = await supabase
      .from('farms')
      .select('*')
      .eq('owner_id', userId)
      .order('name')
    farmsData = data ?? []
  } else {
    const { data } = await supabase
      .from('farm_users')
      .select('farms(*)')
      .eq('user_id', userId)
    farmsData = (data ?? []).map((r: any) => r.farms).filter(Boolean)
  }

  // Para cada fazenda, busca contagem de insumos, talhões, área e status
  const farmsWithStats = await Promise.all(
    farmsData.map(async (farm) => {
      const [{ data: insumos }, { data: talhaoRows }] = await Promise.all([
        supabase.from('insumos').select('quantity, min_quantity').eq('farm_id', farm.id),
        supabase.from('talhoes').select('area_ha').eq('farm_id', farm.id),
      ])

      const list        = insumos ?? []
      const emptyCount  = list.filter((i: any) => Number(i.quantity) <= 0).length
      const lowCount    = list.filter((i: any) =>
        Number(i.quantity) > 0 &&
        i.min_quantity != null &&
        Number(i.quantity) <= Number(i.min_quantity)
      ).length

      const totalAreaHa = (talhaoRows ?? []).reduce((s, t) => s + Number(t.area_ha), 0)

      return {
        ...farm,
        insumoCount: list.length,
        talhaoCount: (talhaoRows ?? []).length,
        emptyCount,
        lowCount,
        totalAreaHa,
      }
    })
  )

  return farmsWithStats
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const farms = await getFarmsWithStats(session.id, session.role)

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            {farms.length} fazenda{farms.length !== 1 ? 's' : ''} cadastrada{farms.length !== 1 ? 's' : ''}
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

      {/* Grid de fazendas */}
      {farms.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-800">
            <svg className="h-7 w-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
            </svg>
          </div>
          <p className="mt-4 text-sm font-medium text-gray-400">Nenhuma fazenda cadastrada</p>
          {session.role === 'admin' && (
            <Link href="/farms/new" className="mt-3">
              <Button size="sm" variant="secondary">Cadastrar primeira fazenda</Button>
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
              totalAreaHa={farm.totalAreaHa}
            />
          ))}
        </div>
      )}

      {/* Instruções de uso */}
      <div className="mt-10 rounded-xl border border-gray-800 bg-gray-900/40 p-6">
        <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">Sobre o StockDan</h2>
        <p className="mb-5 text-sm text-gray-500 leading-relaxed">
          Sistema de gestão de insumos agrícolas — controle de estoque, retiradas por talhão e métricas de aplicação
          (kg/ha, área acumulada, % da área coberta).
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: '1',
              title: 'Cadastre a fazenda',
              desc: 'Registre nome, produtor e localização. Adicione os talhões com a área em hectares de cada um.',
            },
            {
              step: '2',
              title: 'Adicione insumos',
              desc: 'Cadastre os produtos (fertilizantes, defensivos etc.) e informe o estoque inicial em kg.',
            },
            {
              step: '3',
              title: 'Registre aplicações',
              desc: 'Em cada talhão, clique em "+ Aplicação" para registrar a retirada de estoque com data e quantidade.',
            },
            {
              step: '4',
              title: 'Acompanhe métricas',
              desc: 'Visualize o % da área coberta, kg/ha por talhão e o histórico completo de movimentações.',
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-xs font-bold text-green-400">
                {step}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-300">{title}</p>
                <p className="mt-1 text-xs text-gray-600 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
