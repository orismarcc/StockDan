import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { NewFarmForm } from './_NewFarmForm'

export const metadata = { title: 'Nova Fazenda' }

/** Server component: verifica sessão e permissão antes de renderizar o formulário. */
export default async function NewFarmPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.role, 'farm.create')) redirect('/dashboard')

  return <NewFarmForm />
}
