export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo centralizada */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500 shadow-lg shadow-green-500/20">
            <svg className="h-7 w-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
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
