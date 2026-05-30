export default function AnaliseLoading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-28 rounded-lg bg-gray-800" />
          <div className="h-4 w-48 rounded bg-gray-800" />
        </div>
        <div className="h-10 w-44 rounded-lg bg-gray-800" />
      </div>

      {/* Filtros */}
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-10 w-36 rounded-lg bg-gray-800" />
        <div className="h-10 w-36 rounded-lg bg-gray-800" />
        <div className="h-10 w-36 rounded-lg bg-gray-800" />
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 space-y-2">
            <div className="h-3 w-24 rounded bg-gray-800" />
            <div className="h-8 w-20 rounded bg-gray-800" />
          </div>
        ))}
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div className="mb-4 h-4 w-40 rounded bg-gray-800" />
          <div className="h-56 rounded-lg bg-gray-800" />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div className="mb-4 h-4 w-40 rounded bg-gray-800" />
          <div className="h-56 rounded-lg bg-gray-800" />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div className="mb-4 h-4 w-40 rounded bg-gray-800" />
          <div className="h-56 rounded-lg bg-gray-800" />
        </div>
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-5">
          <div className="mb-4 h-4 w-40 rounded bg-gray-800" />
          <div className="h-56 rounded-lg bg-gray-800" />
        </div>
      </div>
    </div>
  )
}
