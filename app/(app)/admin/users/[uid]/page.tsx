import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { UserEditor } from '@/components/UserEditor'

export const metadata = { title: 'Gerenciar Usuário' }

export default async function UserDetailPage({ params }: { params: Promise<{ uid: string }> }) {
  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/dashboard')

  const { uid } = await params
  const supabase = createServerClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password')
    .eq('id', uid)
    .eq('created_by', session.id)
    .single()

  if (!user) notFound()

  const { data: farmLinks } = await supabase
    .from('farm_users')
    .select('farm_id')
    .eq('user_id', uid)

  const { data: allFarms } = await supabase.from('farms').select('id, name, city, state').order('name')

  const assignedFarmIds = (farmLinks ?? []).map((f: any) => f.farm_id)

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/admin/users"
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Usuários
        </Link>
        <h1 className="text-2xl font-bold text-gray-100">{user.name}</h1>
        <p className="mt-1 text-sm text-gray-500">{user.email}</p>
      </div>

      <UserEditor
        user={user}
        allFarms={allFarms ?? []}
        assignedFarmIds={assignedFarmIds}
        currentUserId={session.id}
      />
    </div>
  )
}
