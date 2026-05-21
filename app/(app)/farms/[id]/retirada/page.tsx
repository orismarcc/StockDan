import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { WithdrawalForm } from '@/components/WithdrawalForm'
import Link from 'next/link'

export const metadata = { title: 'Registrar Retirada' }

export default async function RetiradaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { id } = await params
  const supabase = createServerClient()

  const [{ data: farm }, { data: insumos }, { data: talhoes }] = await Promise.all([
    supabase.from('farms').select('id, name').eq('id', id).single(),
    supabase.from('insumos').select('id, title, unit, quantity').eq('farm_id', id).order('title'),
    supabase.from('talhoes').select('id, name, area_ha').eq('farm_id', id).order('name'),
  ])

  if (!farm) notFound()

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/farms/${id}`}
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          {farm.name}
        </Link>
        <h1 className="text-2xl font-bold text-gray-100">Registrar Retirada</h1>
        <p className="mt-1 text-sm text-gray-500">
          Informe o insumo, quantidade e talhão de destino
        </p>
      </div>

      <div className="max-w-xl">
        <WithdrawalForm
          farmId={id}
          insumos={insumos ?? []}
          talhoes={talhoes ?? []}
        />
      </div>
    </div>
  )
}
