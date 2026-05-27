'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from './ui/Input'
import { Button } from './ui/Button'

interface Talhao {
  id: string
  name: string
  area_ha: number
}

interface TalhoesManagerProps {
  farmId: string
  initialTalhoes: Talhao[]
}

export function TalhoesManager({ farmId, initialTalhoes }: TalhoesManagerProps) {
  const router = useRouter()
  const [talhoes, setTalhoes]       = useState(initialTalhoes)
  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [name, setName]             = useState('')
  const [areaHa, setAreaHa]         = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  function startEdit(t: Talhao) {
    setEditingId(t.id)
    setName(t.name)
    setAreaHa(String(t.area_ha))
    setShowForm(false)
    setError('')
  }

  function resetForm() {
    setEditingId(null)
    setShowForm(false)
    setName('')
    setAreaHa('')
    setError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch(`/api/farms/${farmId}/talhoes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, area_ha: Number(areaHa) }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    setTalhoes((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    resetForm()
    router.refresh()
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId) return
    setError('')
    setLoading(true)

    const res = await fetch(`/api/farms/${farmId}/talhoes/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, area_ha: Number(areaHa) }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    setTalhoes((prev) =>
      prev.map((t) => (t.id === editingId ? data : t)).sort((a, b) => a.name.localeCompare(b.name))
    )
    resetForm()
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este talhão? As transações já registradas serão mantidas.')) return

    const res = await fetch(`/api/farms/${farmId}/talhoes/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTalhoes((prev) => prev.filter((t) => t.id !== id))
      router.refresh()
    }
  }

  return (
    <div className="max-w-xl">
      {/* Lista */}
      {talhoes.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Talhão</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Área (ha)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500" />
              </tr>
            </thead>
            <tbody>
              {talhoes.map((t) => (
                <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  {editingId === t.id ? (
                    <td colSpan={3} className="px-4 py-3">
                      <form onSubmit={handleEdit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <Input
                          label="Nome"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                          className="flex-1"
                        />
                        <Input
                          label="Área (ha)"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={areaHa}
                          onChange={(e) => setAreaHa(e.target.value)}
                          required
                          className="sm:w-32"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" size="sm" loading={loading}>Salvar</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
                        </div>
                      </form>
                      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-medium text-gray-200">{t.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-400">
                        {Number(t.area_ha).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => startEdit(t)} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">Editar</button>
                          <button onClick={() => handleDelete(t.id)} className="text-xs text-red-500/70 hover:text-red-400 transition-colors">Excluir</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Formulário de criação */}
      {showForm ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-200">Novo Talhão</h3>
          <form onSubmit={handleCreate} className="flex flex-col gap-4">
            <Input
              label="Nome do Talhão *"
              placeholder="ex: Talhão A, Quadra 01..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Área (ha) *"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={areaHa}
              onChange={(e) => setAreaHa(e.target.value)}
              required
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-3">
              <Button type="submit" loading={loading}>Criar Talhão</Button>
              <Button type="button" variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </form>
        </div>
      ) : (
        !editingId && (
          <Button onClick={() => setShowForm(true)}>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Novo Talhão
          </Button>
        )
      )}
    </div>
  )
}
