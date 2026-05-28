'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { roleLabel, type Role } from '@/lib/permissions'

const ASSIGNABLE_ROLES: Role[] = ['admin', 'agronomo', 'operario']

export default function NewUserPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'operario' as Role,
  })

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    router.push(`/admin/users/${data.id}`)
    router.refresh()
  }

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
        <h1 className="text-2xl font-bold text-gray-100">Novo Usuário</h1>
        <p className="mt-1 text-sm text-gray-500">
          O usuário será obrigado a redefinir a senha no primeiro acesso.
        </p>
      </div>

      <div className="max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Nome *"
            placeholder="João da Silva"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <Input
            label="E-mail *"
            type="email"
            placeholder="joao@email.com"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            required
          />
          <Input
            label="Senha Temporária *"
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            hint="O usuário será forçado a criar uma nova senha no primeiro acesso"
            required
          />
          <Select
            label="Cargo *"
            value={form.role}
            onChange={(e) => set('role', e.target.value as Role)}
            hint="Admin: gestão completa (exceto excluir Gestor). Agrônomo: opera fazenda sem deletar/criar users. Operário: só registra retiradas."
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </Select>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>Criar Usuário</Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
