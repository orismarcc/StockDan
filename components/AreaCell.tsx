'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface AreaCellProps {
  farmId: string
  txId: string
  area: number | null
}

export function AreaCell({ farmId, txId, area }: AreaCellProps) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function startEdit() {
    setValue(area != null ? String(area).replace('.', ',') : '')
    setError('')
    setEditing(true)
  }

  async function save() {
    const ha = parseFloat(value.replace(',', '.'))
    if (isNaN(ha) || ha <= 0) {
      setError('Valor inválido')
      return
    }

    setSaving(true)
    setError('')

    const res = await fetch(`/api/farms/${farmId}/transactions/${txId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ area_ha: ha }),
    })

    setSaving(false)

    if (res.ok) {
      setEditing(false)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Erro ao salvar')
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            min="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKey}
            className="w-20 rounded border border-gray-600 bg-gray-800 px-2 py-1.5 text-xs text-gray-100 focus:border-green-500 focus:outline-none"
            placeholder="0,00"
          />
          <span className="text-xs text-gray-500">ha</span>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center justify-center rounded bg-green-600 px-2 py-1.5 text-xs text-white hover:bg-green-500 disabled:opacity-50 transition-colors min-w-[28px]"
          >
            {saving ? (
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="flex items-center justify-center rounded bg-gray-700 px-2 py-1.5 text-xs text-gray-300 hover:bg-gray-600 transition-colors min-w-[28px]"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>
    )
  }

  if (area != null && area > 0) {
    return (
      <button
        onClick={startEdit}
        className="group flex items-center gap-1.5 whitespace-nowrap text-gray-300 hover:text-green-400 transition-colors"
      >
        <span className="font-mono text-sm">
          {Number(area).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
        </span>
        <svg
          className="h-3 w-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={startEdit}
      className="rounded border border-green-500/20 bg-green-500/5 px-2 py-0.5 text-xs text-green-500/70 hover:border-green-500/40 hover:text-green-400 transition-colors whitespace-nowrap"
    >
      + Registrar
    </button>
  )
}
