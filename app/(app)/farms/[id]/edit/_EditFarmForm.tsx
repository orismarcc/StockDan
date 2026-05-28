'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { BR_STATES } from '@/lib/utils'

interface EditFarmFormProps {
  farmId: string
}

export function EditFarmForm({ farmId }: EditFarmFormProps) {
  const router = useRouter()
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [form, setForm] = useState({ name: '', city: '', state: '', farmer_name: '' })

  useEffect(() => {
    setLoading(true)
    fetch(`/api/farms/${farmId}`)
      .then((r) => {
        if (r.status === 401) { router.push('/login'); return null }
        if (!r.ok) { setError('Erro ao carregar fazenda.'); setLoading(false); return null }
        return r.json()
      })
      .then((d) => {
        if (!d) return
        setForm({ name: d.name, city: d.city, state: d.state, farmer_name: d.farmer_name })
        setLoading(false)
      })
      .catch(() => { setError('Erro de conexão.'); setLoading(false) })
  }, [farmId, router])

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)

    try {
      const res = await fetch(`/api/farms/${farmId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()
      setSaving(false)

      if (res.status === 401) { router.push('/login'); return }
      if (!res.ok) { setError(data.error); return }
      router.push(`/farms/${farmId}`)
      router.refresh()
    } catch {
      setSaving(false)
      setError('Erro de conexão. Verifique sua internet e tente novamente.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-700 border-t-green-500" />
      </div>
    )
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
        <h1 className="text-2xl font-bold text-gray-100">Editar Fazenda</h1>
      </div>

      <div className="max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input label="Nome da Fazenda *" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          <Input label="Nome do Fazendeiro *" value={form.farmer_name} onChange={(e) => set('farmer_name', e.target.value)} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Cidade *" value={form.city} onChange={(e) => set('city', e.target.value)} required />
            <Select label="Estado *" value={form.state} onChange={(e) => set('state', e.target.value)} required>
              <option value="">Selecione</option>
              {BR_STATES.map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </Select>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={saving}>Salvar Alterações</Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
