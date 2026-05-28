'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { can, roleLabel, type Role } from '@/lib/permissions'

interface SidebarProps {
  role: Role
  userName: string
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ role, userName, isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)
  const [showInstallOption, setShowInstallOption] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true
    setShowInstallOption(!standalone)
  }, [])

  useEffect(() => {
    if (!profileOpen) return
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [profileOpen])

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  function handleInstallClick() {
    setProfileOpen(false)
    onClose?.()
    window.__pwaInstallOpen?.()
  }

  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-shrink-0 flex-col border-r border-gray-800 bg-gray-950 transition-transform duration-200',
        'lg:static lg:z-auto lg:w-60 lg:translate-x-0',
        isOpen ? 'translate-x-0' : '-translate-x-full'
      )}
    >
      {/* Logo + close button (mobile) */}
      <div className="flex items-center justify-between border-b border-gray-800 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500">
            <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
            </svg>
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white">Stock</span>
            <span className="text-base font-bold tracking-tight text-green-400">Dan</span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Fechar menu"
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors lg:hidden"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <NavItem
          href="/dashboard"
          active={isActive('/dashboard')}
          onClick={onClose}
          icon={
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          }
          label="Dashboard"
        />

        {can(role, 'analysis.view') && (
          <NavItem
            href="/analise"
            active={isActive('/analise')}
            onClick={onClose}
            icon={
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            }
            label="Análise"
          />
        )}

        {(can(role, 'user.list') || can(role, 'farm.edit')) && (
          <>
            <p className="mt-5 mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
              Gestão
            </p>
            {can(role, 'farm.edit') && (
              <NavItem
                href="/farms"
                active={isActive('/farms')}
                onClick={onClose}
                icon={
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
                  </svg>
                }
                label="Fazendas"
              />
            )}
            {can(role, 'user.list') && (
              <NavItem
                href="/admin/users"
                active={pathname.startsWith('/admin/users')}
                onClick={onClose}
                icon={
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                }
                label="Usuários"
              />
            )}
            {can(role, 'audit.view') && (
              <NavItem
                href="/admin/audit"
                active={pathname.startsWith('/admin/audit')}
                onClick={onClose}
                icon={
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                  </svg>
                }
                label="Auditoria"
              />
            )}
            {can(role, 'reports.schedule') && (
              <NavItem
                href="/admin/reports"
                active={pathname.startsWith('/admin/reports')}
                onClick={onClose}
                icon={
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                }
                label="Relatórios"
              />
            )}
          </>
        )}
      </nav>

      {/* Perfil + Logout */}
      <div className="border-t border-gray-800 p-3">
        <div ref={profileRef} className="relative mb-2">
          {profileOpen && (
            <div className="absolute bottom-full mb-2 left-0 right-0 rounded-xl border border-gray-700 bg-gray-900 py-1 shadow-xl z-10">
              <Link
                href="/change-password"
                onClick={() => { setProfileOpen(false); onClose?.() }}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
              >
                <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                </svg>
                Alterar Senha
              </Link>
              {showInstallOption && (
                <button
                  onClick={handleInstallClick}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  <svg className="h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 00-2.25 2.25v9a2.25 2.25 0 002.25 2.25h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25H15m0-3l-3-3m0 0l-3 3m3-3V15" />
                  </svg>
                  Instalar App
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="w-full rounded-lg bg-gray-800/50 px-3 py-2.5 text-left hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-200 truncate">{userName}</p>
                <p className="text-xs text-gray-500">{roleLabel(role)}</p>
              </div>
              <svg
                className={cn('h-3.5 w-3.5 shrink-0 text-gray-600 transition-transform', profileOpen && 'rotate-180')}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
        </div>

        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-9A2.25 2.25 0 002.25 5.25v13.5A2.25 2.25 0 004.5 21h9a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          Sair
        </button>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  active,
  icon,
  label,
  onClick,
}: {
  href: string
  active: boolean
  icon: React.ReactNode
  label: string
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-green-500/10 text-green-400'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
      )}
    >
      <span className={active ? 'text-green-400' : 'text-gray-500'}>{icon}</span>
      {label}
    </Link>
  )
}
