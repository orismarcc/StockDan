import { cn } from '@/lib/utils'

interface StockBadgeProps {
  quantity: number
  minQuantity?: number | null
  unit?: string
  className?: string
}

export function StockBadge({ quantity, minQuantity, unit, className }: StockBadgeProps) {
  let level: 'ok' | 'low' | 'empty' = 'ok'
  if (quantity <= 0) level = 'empty'
  else if (minQuantity != null && quantity <= minQuantity) level = 'low'

  const styles = {
    ok:    'bg-green-500/10 text-green-400 border-green-500/20',
    low:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    empty: 'bg-red-500/10 text-red-400 border-red-500/20',
  }

  const label = {
    ok:    'Normal',
    low:   'Baixo',
    empty: 'Zerado',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        styles[level],
        className
      )}
    >
      <span className={cn(
        'h-1.5 w-1.5 rounded-full',
        level === 'ok'    && 'bg-green-400',
        level === 'low'   && 'bg-amber-400',
        level === 'empty' && 'bg-red-400',
      )} />
      {label[level]}
    </span>
  )
}
