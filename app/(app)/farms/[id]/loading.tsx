export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-5 w-32 rounded bg-gray-800" />
      <div className="h-8 w-56 rounded bg-gray-800" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl bg-gray-800" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-gray-800" />
    </div>
  )
}
