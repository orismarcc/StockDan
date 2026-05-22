import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { FarmTabs } from '@/components/FarmTabs'
import { DeleteFarmButton } from '@/components/DeleteFarmButton'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const { data } = await supabase.from('farms').select('name').eq('id', id).single()
  return { title: data?.name ?? 'Fazenda' }
}

export default async function FarmPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id } = await params
  const supabase = createServerClient()

  const { data: farm } = await supabase.from('farms').select('*').eq('id', id).single()
  if (!farm) notFound()

  const [{ data: insumos }, { data: talhoes }, { data: transactions }] = await Promise.all([
    supabase.from('insumos').select('*').eq('farm_id', id).order('title'),
    supabase.from('talhoes').select('*').eq('farm_id', id).order('name'),
    supabase
      .from('transactions')
      .select('*, insumos(title, unit), talhoes(id, name), users(name)')
      .eq('farm_id', id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  return (
    <div>
      {/* Header — responsivo: empilha no mobile */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
            </svg>
            Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-gray-100 truncate">{farm.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <span>{farm.farmer_name}</span>
            <span className="text-gray-700">·</span>
            <span>{farm.city}, {farm.state}</span>
          </p>
        </div>

        {/* Ações (somente admin) */}
        {session.role === 'admin' && (
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
            <Link href={`/farms/${id}/edit`}>
              <button className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 sm:py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                  <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                </svg>
                Editar
              </button>
            </Link>
            <DeleteFarmButton farmId={id} />
          </div>
        )}
      </div>

      <FarmTabs
        farm={farm}
        insumos={insumos ?? []}
        talhoes={talhoes ?? []}
        transactions={transactions ?? []}
        userRole={session.role}
        userId={session.id}
      />
    </div>
  )
}
