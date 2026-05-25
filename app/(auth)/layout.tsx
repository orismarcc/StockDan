export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4">
      <div className="w-full max-w-sm">
        {/* Logo centralizada */}
        <div className="mb-8 flex flex-col items-center">
          <img
            src="/icons/icon-192.png"
            alt="StockDan"
            width={64}
            height={64}
            className="rounded-2xl shadow-lg shadow-green-500/20"
          />
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
