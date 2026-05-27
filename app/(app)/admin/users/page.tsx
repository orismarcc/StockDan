import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Usuários' }

export default async function UsersPage() {
  const session = await getSession()
  if (!session || session.role !== 'admin') redirect('/dashboard')

  const supabase = createServerClient()
  const { data: users } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password, created_at')
    .eq('created_by', session.id)
    .order('name')

  return (
    <div>
      {/* Cabeçalho */}
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Usuários</h1>
          <p className="mt-1 text-sm text-gray-500">{users?.length ?? 0} usuário(s) cadastrado(s)</p>
        </div>
        <Link href="/admin/users/new" className="self-start sm:self-auto">
          <Button>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Novo Usuário
          </Button>
        </Link>
      </div>

      {/* ── Mobile: cards (< sm) ────────────────────────────────────────────── */}
      <div className="sm:hidden space-y-3">
        {(users ?? []).map((user) => (
          <div key={user.id} className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-200 truncate">{user.name}</p>
                <p className="mt-0.5 text-xs text-gray-500 truncate">{user.email}</p>
              </div>
              <span className={`shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                user.role === 'admin'
                  ? 'border-green-500/20 bg-green-500/10 text-green-400'
                  : 'border-gray-700 bg-gray-800 text-gray-400'
              }`}>
                {user.role === 'admin' ? 'Admin' : 'Operador'}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div>
                {user.must_change_password ? (
                  <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    Troca de senha pendente
                  </span>
                ) : (
                  <span className="text-xs text-green-400">Ativo</span>
                )}
                <p className="mt-0.5 text-[11px] text-gray-600">Desde {formatDate(user.created_at.split('T')[0])}</p>
              </div>
              <Link
                href={`/admin/users/${user.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-700 bg-gray-800/60 px-3 py-2 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
              >
                Gerenciar
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop: tabela (≥ sm) ───────────────────────────────────────────── */}
      <div className="hidden sm:block overflow-hidden rounded-xl border border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '600px' }}>
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">E-mail</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Perfil</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Criado em</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((user) => (
                <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-200">{user.name}</td>
                  <td className="px-4 py-3 text-gray-400">{user.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                      user.role === 'admin'
                        ? 'border-green-500/20 bg-green-500/10 text-green-400'
                        : 'border-gray-700 bg-gray-800 text-gray-400'
                    }`}>
                      {user.role === 'admin' ? 'Admin' : 'Operador'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.must_change_password ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                        </svg>
                        Troca pendente
                      </span>
                    ) : (
                      <span className="text-xs text-green-400">Ativo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(user.created_at.split('T')[0])}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-800/60 px-2.5 py-1 text-xs font-medium text-gray-300 hover:border-gray-600 hover:bg-gray-700 hover:text-gray-100 transition-colors"
                    >
                      Gerenciar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
