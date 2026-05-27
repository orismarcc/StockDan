'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from './ui/Input'
import { Select } from './ui/Select'
import { Button } from './ui/Button'
import { cn } from '@/lib/utils'

interface UserEditorProps {
  user: { id: string; name: string; email: string; role: string; must_change_password: boolean }
  allFarms: { id: string; name: string; city: string; state: string }[]
  assignedFarmIds: string[]
  currentUserId: string
}

export function UserEditor({ user, allFarms, assignedFarmIds, currentUserId }: UserEditorProps) {
  const router = useRouter()
  const [name, setName]         = useState(user.name)
  const [role, setRole]         = useState(user.role)
  const [password, setPassword] = useState('')
  const [farms, setFarms]       = useState<string[]>(assignedFarmIds)
  const [saving, setSaving]     = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const roleChanged = role !== user.role

  function toggleFarm(id: string) {
    setFarms((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]
    )
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    const body: Record<string, unknown> = { name, role }
    if (password) body.password = password
    if (role === 'operario') body.farm_ids = farms

    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError(data.error); return }
    setSuccess(
      roleChanged
        ? `Cargo alterado para ${role === 'admin' ? 'Administrador' : 'Operador'}. O usuário precisará fazer login novamente para que a mudança tenha efeito.`
        : 'Alterações salvas com sucesso.'
    )
    setPassword('')
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm(`Excluir o usuário "${user.name}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(true)

    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    const data = await res.json()

    if (!res.ok) { setError(data.error); setDeleting(false); return }
    router.push('/admin/users')
    router.refresh()
  }

  return (
    <div className="max-w-xl space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="mb-5 text-sm font-semibold text-gray-400 uppercase tracking-wider">Dados do Usuário</h2>
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <Input label="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
          <div>
            <Select
              label="Cargo"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={user.id === currentUserId}
              hint={
                user.id === currentUserId
                  ? 'Você não pode alterar seu próprio cargo.'
                  : roleChanged
                  ? `Será alterado de ${user.role === 'admin' ? 'Administrador' : 'Operador'} para ${role === 'admin' ? 'Administrador' : 'Operador'}. O usuário precisará relogar.`
                  : 'Administrador gerencia fazendas, insumos e usuários. Operador apenas registra retiradas.'
              }
            >
              <option value="operario">Operador</option>
              <option value="admin">Administrador</option>
            </Select>
          </div>
          <Input
            label="Nova Senha"
            type="password"
            placeholder="Deixe em branco para não alterar"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="O usuário será forçado a redefinir a senha no próximo acesso"
          />

          {error   && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          {success && <p className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-400">{success}</p>}

          <Button type="submit" loading={saving}>Salvar Alterações</Button>
        </form>
      </div>

      {/* Fazendas vinculadas (apenas operários) */}
      {role === 'operario' && allFarms.length > 0 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6">
          <h2 className="mb-1 text-sm font-semibold text-gray-400 uppercase tracking-wider">Fazendas Vinculadas</h2>
          <p className="mb-4 text-xs text-gray-600">
            Selecione as fazendas que este operador pode acessar.
          </p>
          <div className="space-y-2">
            {allFarms.map((farm) => {
              const checked = farms.includes(farm.id)
              return (
                <label
                  key={farm.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors',
                    checked ? 'border-green-500/30 bg-green-500/5' : 'border-gray-800 hover:bg-gray-800/50'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleFarm(farm.id)}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-800 text-green-500 focus:ring-green-500/30"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-200">{farm.name}</p>
                    <p className="text-xs text-gray-500">{farm.city}, {farm.state}</p>
                  </div>
                </label>
              )
            })}
          </div>
          <Button className="mt-4" onClick={handleSave as any} loading={saving} type="button" size="sm">
            Salvar vínculos
          </Button>
        </div>
      )}

      {/* Excluir */}
      {user.id !== currentUserId && (
        <div className="rounded-xl border border-red-500/10 bg-red-500/5 p-5">
          <h2 className="mb-1 text-sm font-semibold text-red-400">Zona de Perigo</h2>
          <p className="mb-3 text-xs text-gray-500">Esta ação é irreversível.</p>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete} type="button">
            Excluir usuário
          </Button>
        </div>
      )}
    </div>
  )
}
