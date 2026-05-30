// hooks/useNotifications.ts
//
// Solicita permissão de push notification e registra o FCM token
// no Supabase via /api/notifications/register.
//
// Só funciona no Capacitor nativo (Android). Em browsers web,
// Capacitor.isNativePlatform() retorna false e o hook não faz nada.
// Flag em localStorage evita re-registro a cada render.

'use client'

import { useEffect } from 'react'

const REGISTERED_KEY = 'stockdan_push_registered'

export function useNotifications() {
  useEffect(() => {
    async function registerPush() {
      // Importação dinâmica — evita erro no browser onde Capacitor não existe
      const { Capacitor } = await import('@capacitor/core')
      if (!Capacitor.isNativePlatform()) return

      // Evita re-registro desnecessário em cada mount
      if (localStorage.getItem(REGISTERED_KEY) === '1') return

      const { PushNotifications } = await import('@capacitor/push-notifications')

      // Verifica permissão atual
      let permStatus = await PushNotifications.checkPermissions()

      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions()
      }

      if (permStatus.receive !== 'granted') {
        console.warn('[push] Permissão negada.')
        return
      }

      // Registra com FCM — resultado vem via listener 'registration'
      await PushNotifications.register()

      PushNotifications.addListener('registration', async (token) => {
        try {
          const res = await fetch('/api/notifications/register', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ fcm_token: token.value, platform: 'android' }),
          })
          if (res.ok) {
            localStorage.setItem(REGISTERED_KEY, '1')
            console.log('[push] Token FCM registrado com sucesso.')
          }
        } catch (e) {
          console.error('[push] Erro ao registrar token:', e)
        }
      })

      PushNotifications.addListener('registrationError', (err) => {
        console.error('[push] Erro de registro FCM:', err.error)
      })
    }

    registerPush()
  }, [])
}
