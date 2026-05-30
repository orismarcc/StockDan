import Link from 'next/link'
import { Sparkline } from '@/components/Sparkline'

interface FarmCardProps {
  id: string
  name: string
  farmerName: string
  city: string
  state: string
  insumoCount: number
  talhaoCount: number
  emptyCount: number
  lowCount: number
  totalAreaHa?: number
  /** 7 valores (kg saída/dia) para o mini-gráfico */
  sparkline?: number[]
}

export function FarmCard({
  id,
  name,
  farmerName,
  city,
  state,
  insumoCount,
  talhaoCount,
  emptyCount,
  lowCount,
  totalAreaHa = 0,
  sparkline,
}: FarmCardProps) {
  const allOk    = insumoCount > 0 && emptyCount === 0 && lowCount === 0
  const hasAlerts = emptyCount > 0 || lowCount > 0

  return (
    <Link
      href={`/farms/${id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 transition-all duration-200 hover:border-green-500/30 hover:shadow-lg hover:shadow-green-500/5"
    >
      {/* Corpo */}
      <div className="flex-1 p-5">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-100 group-hover:text-green-400 transition-colors">
              {name}
            </h3>
            <p className="mt-0.5 truncate text-sm text-gray-500">{farmerName}</p>
          </div>
          <div className="flex-shrink-0 rounded-lg bg-green-500/10 p-2">
            <svg className="h-5 w-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" />
            </svg>
          </div>
        </div>

        {/* Localização */}
        <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500">
          <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C14.97 14.756 17 11.979 17 8a7 7 0 10-14 0c0 3.979 2.03 6.756 3.354 8.585a13.731 13.731 0 002.274 1.765 11.842 11.842 0 00.757.433 7.01 7.01 0 00.281.14l.018.008.006.003zM10 11a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          {city}, {state}
        </div>

        {/* Stats — insumos + talhões */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2.5">
            <p className="text-lg font-bold text-gray-100">{insumoCount}</p>
            <p className="text-xs text-gray-500">Insumo{insumoCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2.5">
            <p className="text-lg font-bold text-gray-100">{talhaoCount}</p>
            <p className="text-xs text-gray-500">{talhaoCount === 1 ? 'Talhão' : 'Talhões'}</p>
          </div>
        </div>

        {/* Mini-gráfico — tendência de aplicações nos últimos 7 dias */}
        {sparkline && (
          <div className="mt-4 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">Aplicações — 7 dias</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {sparkline.some(v => v > 0)
                    ? `${sparkline.reduce((a, b) => a + b, 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg retirados`
                    : 'Sem movimentações'}
                </p>
              </div>
              <Sparkline data={sparkline} width={72} height={26} />
            </div>
          </div>
        )}

        {/* Área total cadastrada */}
        {totalAreaHa > 0 && (
          <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-gray-800 bg-gray-800/30 px-3 py-2">
            <svg className="h-3.5 w-3.5 shrink-0 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
            <span className="text-xs text-gray-500">
              Área total:{' '}
              <span className="font-medium text-gray-300">
                {totalAreaHa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ha
              </span>
            </span>
          </div>
        )}

        {/* Alertas de estoque */}
        {insumoCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {emptyCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                {emptyCount} zerado{emptyCount !== 1 ? 's' : ''}
              </span>
            )}
            {lowCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                {lowCount} baixo{lowCount !== 1 ? 's' : ''}
              </span>
            )}
            {allOk && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                Estoque OK
              </span>
            )}
          </div>
        )}
        {insumoCount === 0 && (
          <p className="mt-3 text-xs text-gray-700">Nenhum insumo cadastrado</p>
        )}
      </div>

      {/* Rodapé CTA */}
      <div className="flex items-center justify-between border-t border-gray-800 bg-gray-900/60 px-5 py-3">
        <span className="text-xs text-gray-600">
          {hasAlerts ? 'Requer atenção' : 'Ver detalhes'}
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-gray-500 group-hover:text-green-400 transition-colors">
          Acessar
          <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
          </svg>
        </span>
      </div>
    </Link>
  )
}
