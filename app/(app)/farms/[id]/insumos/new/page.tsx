'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { todayISO } from '@/lib/utils'
import { use } from 'react'

export default function NewInsumoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: farmId } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [form, setForm] = useState({
    title: '', description: '', unit: 'kg', quantity: '0',
    min_quantity: '', date: todayISO(),
  })

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch(`/api/farms/${farmId}/insumos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        quantity: Number(form.quantity),
        min_quantity: form.min_quantity ? Number(form.min_quantity) : null,
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error); return }
    router.push(`/farms/${farmId}/insumos/${data.id}`)
    router.refresh()
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/farms/${farmId}`}
          className="mb-4 flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Voltar para a fazenda
        </Link>
        <h1 className="text-2xl font-bold text-gray-100">Novo Insumo</h1>
        <p className="mt-1 text-sm text-gray-500">Cadastre um insumo e defina o estoque inicial</p>
      </div>

      <div className="max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <Input
            label="Nome do Insumo *"
            placeholder="ex: Ureia, MAP, Calcário..."
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            required
          />
          <Textarea
            label="Descrição"
            placeholder="Informações adicionais sobre o insumo..."
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />

<div className="grid grid-cols-2 gap-4">
            <Input
              label="Estoque Inicial (kg)"
              type="number"
              min="0"
              step="0.001"
              placeholder="0"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
            <Input
              label="Qtd Mínima (kg)"
              type="number"
              min="0"
              step="0.001"
              placeholder="opcional"
              value={form.min_quantity}
              onChange={(e) => set('min_quantity', e.target.value)}
              hint="Dispara alerta âmbar"
            />
          </div>

          <Input
            label="Data de Entrada *"
            type="date"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={loading}>Cadastrar Insumo</Button>
            <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
