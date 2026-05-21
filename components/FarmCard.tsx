import Link from 'next/link'
import { StockBadge } from './StockBadge'

interface FarmCardProps {
  id: string
  name: string
  farmerName: string
  city: string
  state: string
  insumoCount: number
  emptyCount: number
  lowCount: number
}

export function FarmCard({
  id,
  name,
  farmerName,
  city,
  state,
  insumoCount,
  emptyCount,
  lowCount,
}: FarmCardProps) {
  return (
    <Link
      href={`/farms/${id}`}
      className="group block rounded-xl border border-gray-800 bg-gray-900 p-5 transition-all duration-200 hover:border-green-500/40 hover:bg-gray-800/60 hover:shadow-lg hover:shadow-green-500/5"
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-gray-100 group-hover:text-green-400 transition-colors">
            {name}
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            {farmerName}
          </p>
        </div>
        <div className="flex-shrink-0 rounded-full bg-green-500/10 p-2">
          <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
          </svg>
        </div>
      </div>

      {/* Localização */}
      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C14.97 14.756 17 11.979 17 8a7 7 0 10-14 0c0 3.979 2.03 6.756 3.354 8.585a13.731 13.731 0 002.274 1.765 11.842 11.842 0 00.757.433 7.01 7.01 0 00.281.14l.018.008.006.003zM10 11a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
        {city}, {state}
      </div>

      {/* Estatísticas */}
      <div className="mt-4 flex items-center justify-between border-t border-gray-800 pt-4">
        <div className="text-center">
          <p className="text-xl font-bold text-gray-100">{insumoCount}</p>
          <p className="text-xs text-gray-500">Insumos</p>
        </div>
        <div className="flex gap-2">
          {emptyCount > 0 && (
            <StockBadge quantity={0} unit="kg" />
          )}
          {lowCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {lowCount} baixo{lowCount !== 1 ? 's' : ''}
            </span>
          )}
          {emptyCount === 0 && lowCount === 0 && insumoCount > 0 && (
            <StockBadge quantity={1} unit="kg" />
          )}
          {insumoCount === 0 && (
            <span className="text-xs text-gray-600">Sem insumos</span>
          )}
        </div>
      </div>
    </Link>
  )
}
