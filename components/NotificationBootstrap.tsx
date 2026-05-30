// components/NotificationBootstrap.tsx
//
// Componente nulo (não renderiza nada) que ativa o hook de push
// notifications. Inserido no layout para rodar uma vez por sessão.
// Precisa ser 'use client' porque usa useEffect.

'use client'

import { useNotifications } from '@/hooks/useNotifications'

export function NotificationBootstrap() {
  useNotifications()
  return null
}
