// app/(app)/analise/types.ts

export interface TxRow {
  id: string
  farm_id: string
  insumo_id: string
  talhao_id: string | null
  user_id: string | null
  quantity: number
  area_ha: number | null
  date: string        // 'YYYY-MM-DD'
  notes: string | null
}

export interface FarmOption {
  id: string
  name: string
}

export interface TalhaoOption {
  id: string
  farm_id: string
  name: string
  area_ha: number
}

export interface InsumoOption {
  id: string
  farm_id: string
  title: string
  unit: string
}

export interface OperatorOption {
  id: string
  name: string
}

export interface AnaliseData {
  farms: FarmOption[]
  talhoes: TalhaoOption[]
  insumos: InsumoOption[]
  transactions: TxRow[]
  operators: OperatorOption[]
  currentUserId: string
  currentUserRole: 'admin' | 'operario'
}
