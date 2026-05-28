'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { BR_STATES } from '@/lib/utils'

export function NewFarmForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm] = useState({
    name: '', city: '', state: '', farmer_name: '',
  })

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/farms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()
      setLoading(false)

      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) { setError(data.error); return }
      router.push(`/farms/${data.id}`)
      router.refresh()
    } catch {
      setLoading(false)
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    }
  }

  return (
    <div>
      <div className="mb-8">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Voltar
        </button>
        <h1 className="text-2xl font-bold text-gray-100">Nova Fazenda</h1>
        <p className="mt-1 text-sm text-gray-500">Cadastre uma nova propriedade rural</p>
      </div>

      <div className="max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Nome da Fazenda *"
            placeholder="ex: Fazenda Santa Clara"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <Input
            label="Nome do Fazendeiro *"
            placeholder="ex: João da Silva"
            value={form.farmer_name}
            onChange={(e) => set('farmer_name', e.target.value)}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Cidade *"
              placeholder="ex: Goiânia"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              required
            />
            <Select
              label="Estado *"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
              required
            >
              <option value="">Selecione</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </Select>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>Cadastrar Fazenda</Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
