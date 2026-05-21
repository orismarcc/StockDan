export function formatQuantity(value: number, unit: 'kg' | 'bag'): string {
  const formatted = Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })
  if (unit === 'bag') {
    const kg = value * 1000
    const kgFormatted = kg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
    return `${formatted} sc (${kgFormatted} kg)`
  }
  return `${formatted} kg`
}

export function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

export const BR_STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO',
  'MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
