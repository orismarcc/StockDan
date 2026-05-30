'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()

  // --- Perfil ---
  const [name, setName]           = useState('')
  const [age, setAge]             = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileFetching, setProfileFetching] = useState(true)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError]     = useState('')

  // Pré-preenche nome e idade do usuário ao carregar
  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(d => {
        if (d.name) setName(d.name)
        if (d.age)  setAge(String(d.age))
      })
      .catch(() => {})
      .finally(() => setProfileFetching(false))
  }, [])

  // --- Senha ---
  const [currentPwd, setCurrentPwd]   = useState('')
  const [newPwd, setNewPwd]           = useState('')
  const [confirmPwd, setConfirmPwd]   = useState('')
  const [pwdLoading, setPwdLoading]   = useState(false)
  const [pwdSuccess, setPwdSuccess]   = useState(false)
  const [pwdError, setPwdError]       = useState('')

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault()
    setProfileError(''); setProfileSuccess(false)

    if (!name.trim() || name.trim().length < 2) {
      setProfileError('Nome deve ter pelo menos 2 caracteres.')
      return
    }
    if (age && (isNaN(Number(age)) || Number(age) < 1 || Number(age) > 120)) {
      setProfileError('Idade inválida (1–120).')
      return
    }

    setProfileLoading(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        age:  age ? Number(age) : null,
      }),
    })
    setProfileLoading(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setProfileError(d.error ?? 'Erro ao salvar.')
      return
    }
    setProfileSuccess(true)
    router.refresh()
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault()
    setPwdError(''); setPwdSuccess(false)

    if (newPwd.length < 8) {
      setPwdError('A nova senha deve ter pelo menos 8 caracteres.')
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdError('As senhas não coincidem.')
      return
    }

    setPwdLoading(true)
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
    })
    setPwdLoading(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setPwdError(d.error ?? 'Erro ao alterar senha.')
      return
    }
    setPwdSuccess(true)
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
  }

  return (
    <div className="mx-auto max-w-lg">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors shrink-0"
          aria-label="Voltar"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-100">Configurações</h1>
          <p className="text-sm text-gray-500">Gerencie seu perfil e segurança</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* ── Informações pessoais ── */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Informações pessoais
          </h2>
          <form onSubmit={handleProfileSave} className="flex flex-col gap-4">
            {profileFetching ? (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-24 rounded bg-gray-800 animate-pulse" />
                  <div className="h-11 w-full rounded-lg bg-gray-800 animate-pulse" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-16 rounded bg-gray-800 animate-pulse" />
                  <div className="h-11 w-full rounded-lg bg-gray-800 animate-pulse" />
                </div>
                <div className="h-11 w-full rounded-lg bg-gray-800 animate-pulse" />
              </div>
            ) : (
              <>
                {/* Nome */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-300">Nome completo</label>
                  <input
                    type="text"
                    placeholder="Seu nome"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setProfileSuccess(false) }}
                    required
                    minLength={2}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60 transition-colors min-h-[44px]"
                  />
                </div>

                {/* Idade */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-300">
                    Idade <span className="text-gray-600 font-normal">(opcional)</span>
                  </label>
                  <input
                    type="number"
                    placeholder="Ex: 32"
                    value={age}
                    onChange={(e) => { setAge(e.target.value); setProfileSuccess(false) }}
                    min={1}
                    max={120}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60 transition-colors min-h-[44px]"
                  />
                </div>

                {profileError && (
                  <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                    {profileError}
                  </p>
                )}
                {profileSuccess && (
                  <p className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                    Perfil atualizado com sucesso.
                  </p>
                )}

                <button
                  type="submit"
                  disabled={profileLoading}
                  className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {profileLoading ? 'Salvando…' : 'Salvar informações'}
                </button>
              </>
            )}
          </form>
        </section>

        {/* ── Alterar senha ── */}
        <section className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Alterar senha
          </h2>
          <form onSubmit={handlePasswordSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Senha atual</label>
              <input
                type="password"
                placeholder="••••••••"
                value={currentPwd}
                onChange={(e) => { setCurrentPwd(e.target.value); setPwdSuccess(false) }}
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60 transition-colors min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Nova senha</label>
              <input
                type="password"
                placeholder="Mínimo 8 caracteres"
                value={newPwd}
                onChange={(e) => { setNewPwd(e.target.value); setPwdSuccess(false) }}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60 transition-colors min-h-[44px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-300">Confirmar nova senha</label>
              <input
                type="password"
                placeholder="Repita a nova senha"
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); setPwdSuccess(false) }}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500/60 transition-colors min-h-[44px]"
              />
            </div>

            {pwdError && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {pwdError}
              </p>
            )}
            {pwdSuccess && (
              <p className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm text-green-400">
                Senha alterada com sucesso.
              </p>
            )}

            <button
              type="submit"
              disabled={pwdLoading}
              className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              {pwdLoading ? 'Alterando…' : 'Alterar senha'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
