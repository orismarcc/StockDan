'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export default function ChangePasswordPage() {
  const router = useRouter()
  const [name, setName]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!name.trim() || name.trim().length < 2) {
      setError('Informe seu nome completo (mínimo 2 caracteres).')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), password }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Erro ao salvar dados.')
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl fade-in">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">
        <svg className="h-5 w-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <h1 className="mb-1 text-lg font-semibold text-gray-100">Complete seu cadastro</h1>
      <p className="mb-6 text-sm text-gray-500">
        Informe seu nome e crie uma senha pessoal antes de continuar.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Nome Completo"
          type="text"
          placeholder="João da Silva"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Nova Senha"
          type="password"
          placeholder="Mínimo 6 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Input
          label="Confirmar Senha"
          type="password"
          placeholder="Repita a nova senha"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <Button type="submit" loading={loading} size="lg" className="mt-1">
          Salvar e continuar
        </Button>
      </form>
    </div>
  )
}
