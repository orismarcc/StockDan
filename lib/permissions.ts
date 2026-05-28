// lib/permissions.ts
//
// Fonte única de verdade para permissões. NUNCA compare role === 'admin'
// em route handlers ou componentes — use can(role, action).
//
// Padrão P9 (DEVELOPMENT-STANDARDS.md).

export type Role = 'gestor' | 'admin' | 'agronomo' | 'operario'

export type Action =
  | 'farm.create'
  | 'farm.edit'
  | 'farm.delete'
  | 'talhao.write'
  | 'insumo.write'
  | 'adjustment.write'
  | 'transaction.entrada'
  | 'transaction.saida'
  | 'transaction.edit'
  | 'user.list'
  | 'user.create'
  | 'user.edit'
  | 'user.delete'
  | 'analysis.view'
  | 'analysis.export'

const MATRIX: Record<Action, ReadonlyArray<Role>> = {
  'farm.create':         ['gestor', 'admin'],
  'farm.edit':           ['gestor', 'admin', 'agronomo'],
  'farm.delete':         ['gestor', 'admin'],
  'talhao.write':        ['gestor', 'admin', 'agronomo'],
  'insumo.write':        ['gestor', 'admin', 'agronomo'],
  'adjustment.write':    ['gestor', 'admin', 'agronomo'],
  'transaction.entrada': ['gestor', 'admin', 'agronomo'],
  'transaction.saida':   ['gestor', 'admin', 'agronomo', 'operario'],
  'transaction.edit':    ['gestor', 'admin', 'agronomo'],
  'user.list':           ['gestor', 'admin'],
  'user.create':         ['gestor', 'admin'],
  'user.edit':           ['gestor', 'admin'],
  'user.delete':         ['gestor', 'admin'],
  'analysis.view':       ['gestor', 'admin', 'agronomo'],
  'analysis.export':     ['gestor', 'admin', 'agronomo'],
}

/** Retorna true se o cargo `role` pode executar `action`. */
export function can(role: Role | string | null | undefined, action: Action): boolean {
  if (!role) return false
  const allowed = MATRIX[action]
  if (!allowed) return false
  return (allowed as ReadonlyArray<string>).includes(role)
}

/**
 * Pode `actor` gerenciar (criar/editar/excluir) o usuário `target`?
 *
 * Regras:
 * - Gestor pode mexer em qualquer um do seu tenant (verificação de tenant
 *   é feita separadamente via gestor_id).
 * - Admin pode mexer em todos EXCETO Gestor.
 * - Agrônomo e Operário não gerenciam usuários.
 */
export function canManageUser(actor: Role | string | null | undefined, target: Role | string): boolean {
  if (actor === 'gestor') return true
  if (actor === 'admin') return target !== 'gestor'
  return false
}

/**
 * Label legível em PT-BR. Centralizado para evitar inconsistências entre
 * Sidebar, badges, dropdowns, etc.
 */
export function roleLabel(role: Role | string): string {
  switch (role) {
    case 'gestor':   return 'Gestor'
    case 'admin':    return 'Administrador'
    case 'agronomo': return 'Agrônomo'
    case 'operario': return 'Operador'
    default:         return role
  }
}
