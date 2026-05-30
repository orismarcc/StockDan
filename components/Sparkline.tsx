// components/Sparkline.tsx
//
// Mini-gráfico SVG inline para o card de fazenda — tendência de
// aplicações (saídas em kg) dos últimos 7 dias.
// Sem dependência de biblioteca — SVG puro, leve e rápido.

interface SparklineProps {
  /** 7 valores — um por dia (dia mais antigo → mais recente) */
  data:   number[]
  /** Largura do SVG (px). Default: 80 */
  width?: number
  /** Altura do SVG (px). Default: 28 */
  height?: number
  /** Cor da linha quando há atividade. Default: #22c55e */
  color?: string
}

export function Sparkline({ data, width = 80, height = 28, color = '#22c55e' }: SparklineProps) {
  const points = data.length >= 2 ? data : [...data, ...Array(Math.max(0, 2 - data.length)).fill(0)]

  const max = Math.max(...points, 1)          // evita divisão por zero
  const min = 0
  const range = max - min || 1

  const pad = { x: 2, y: 3 }
  const chartW = width  - pad.x * 2
  const chartH = height - pad.y * 2

  // Calcula coordenadas de cada ponto
  const coords = points.map((v, i) => {
    const x = pad.x + (i / (points.length - 1)) * chartW
    const y = pad.y + chartH - ((v - min) / range) * chartH
    return { x, y }
  })

  // Path suavizado (curva cubic bezier entre pontos)
  const path = coords
    .map((pt, i) => {
      if (i === 0) return `M${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
      const prev = coords[i - 1]
      const cpX  = ((pt.x + prev.x) / 2).toFixed(1)
      return `C${cpX},${prev.y.toFixed(1)} ${cpX},${pt.y.toFixed(1)} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`
    })
    .join(' ')

  // Área preenchida abaixo da linha
  const areaPath = `${path} L${coords[coords.length - 1].x.toFixed(1)},${(height - pad.y).toFixed(1)} L${coords[0].x.toFixed(1)},${(height - pad.y).toFixed(1)} Z`

  const hasActivity = max > 0
  const lineColor   = hasActivity ? color : '#374151'
  const areaColor   = hasActivity ? color : '#374151'

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Tendência de aplicações — últimos 7 dias"
    >
      <defs>
        <linearGradient id={`sg-${width}-${height}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={areaColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={areaColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Área preenchida */}
      <path
        d={areaPath}
        fill={`url(#sg-${width}-${height})`}
      />

      {/* Linha principal */}
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Ponto final (mais recente) */}
      {hasActivity && (
        <circle
          cx={coords[coords.length - 1].x}
          cy={coords[coords.length - 1].y}
          r="2"
          fill={lineColor}
        />
      )}
    </svg>
  )
}
