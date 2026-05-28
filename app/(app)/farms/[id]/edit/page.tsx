import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { checkFarmAccess } from '@/lib/farmAccess'
import { createServerClient } from '@/lib/supabase'
import { EditFarmForm } from './_EditFarmForm'

export const metadata = { title: 'Editar Fazenda' }

/** Server component: verifica sessão, permissão e acesso à fazenda antes de renderizar. */
export default async function EditFarmPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.role, 'farm.edit')) redirect('/dashboard')

  const { id } = await params
  const supabase = createServerClient()
  if (!(await checkFarmAccess(supabase, session, id))) redirect('/dashboard')

  return <EditFarmForm farmId={id} />
}
