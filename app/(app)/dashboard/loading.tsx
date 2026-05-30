export default function DashboardLoading() {
  return (
    <div className="animate-pulse">
      {/* Header skeleton */}
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-36 rounded-lg bg-gray-800" />
          <div className="h-4 w-52 rounded bg-gray-800" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-gray-800" />
      </div>

      {/* Farm cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-gray-800" />
                <div className="h-3 w-24 rounded bg-gray-800" />
              </div>
              <div className="h-8 w-8 rounded-lg bg-gray-800" />
            </div>
            <div className="flex gap-3">
              <div className="h-16 flex-1 rounded-lg bg-gray-800" />
              <div className="h-16 flex-1 rounded-lg bg-gray-800" />
            </div>
            <div className="h-4 w-20 rounded-full bg-gray-800" />
          </div>
        ))}
      </div>

      {/* Info section */}
      <div className="mt-10 rounded-xl border border-gray-800 bg-gray-900/40 p-6 space-y-4">
        <div className="h-4 w-32 rounded bg-gray-800" />
        <div className="h-3 w-full rounded bg-gray-800" />
        <div className="h-3 w-3/4 rounded bg-gray-800" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-7 w-7 rounded-full bg-gray-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-full rounded bg-gray-800" />
                <div className="h-3 w-5/6 rounded bg-gray-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
