export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo centralizada */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-500 shadow-lg shadow-green-500/30">
            <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
            </svg>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold tracking-tight text-white">Stock</span>
            <span className="text-2xl font-bold tracking-tight text-green-400">Dan</span>
          </div>
          <p className="mt-1 text-xs text-gray-600 tracking-wide uppercase">Gestão de Insumos Agrícolas</p>
        </div>
        {children}
      </div>
    </div>
  )
}
