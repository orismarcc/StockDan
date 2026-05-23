/**
 * Interpreta erros lançados pelas RPCs de estoque (RAISE EXCEPTION)
 * e os converte em status HTTP + mensagem adequada para o cliente.
 *
 * Formato dos erros esperados nas RPCs:
 *   'INSUMO_NOT_FOUND'
 *   'INSUFFICIENT_STOCK:<valor_disponível>'
 *   'TX_NOT_FOUND'
 *   'INSUMO_NOT_FOUND'
 *   'STOCK_WOULD_BE_NEGATIVE'
 *   'NEGATIVE_STOCK'
 */
export function parseRpcError(error: { message?: string }): { status: number; message: string } {
  const msg = error?.message ?? ''

  if (msg.includes('INSUMO_NOT_FOUND')) {
    return { status: 404, message: 'Insumo não encontrado.' }
  }
  if (msg.includes('INSUFFICIENT_STOCK')) {
    const available = msg.split(':')[1]?.trim()
    return {
      status:  422,
      message: available
        ? `Estoque insuficiente. Disponível: ${available}`
        : 'Estoque insuficiente.',
    }
  }
  if (msg.includes('TX_NOT_FOUND')) {
    return { status: 404, message: 'Transação não encontrada.' }
  }
  if (msg.includes('STOCK_WOULD_BE_NEGATIVE')) {
    return { status: 422, message: 'Não é possível: estoque ficaria negativo.' }
  }
  if (msg.includes('NEGATIVE_STOCK')) {
    return { status: 400, message: 'Estoque não pode ser negativo.' }
  }
  if (msg.includes('Integridade violada')) {
    // Trigger de cross-farm consistency
    return { status: 422, message: 'Dados inconsistentes: insumo ou talhão não pertencem a esta fazenda.' }
  }

  return { status: 500, message: 'Erro interno. Tente novamente.' }
}
