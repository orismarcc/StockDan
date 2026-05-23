'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ConnectionStatus } from './ConnectionStatus'
import { PWAInstallPrompt } from './PWAInstallPrompt'

interface AppShellProps {
  role: 'admin' | 'operario'
  userName: string
  children: React.ReactNode
}

export function AppShell({ role, userName, children }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <PWAInstallPrompt />

      {/* Mobile backdrop */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/60 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <Sidebar
        role={role}
        userName={userName}
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <ConnectionStatus />
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-950 px-4 py-3 lg:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir menu"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-base font-bold tracking-tight">
            <span className="text-white">Stock</span>
            <span className="text-green-400">Dan</span>
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6 lg:py-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
