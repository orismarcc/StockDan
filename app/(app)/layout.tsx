import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { AppShell } from '@/components/AppShell'
import { NotificationBootstrap } from '@/components/NotificationBootstrap'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.mustChangePassword) redirect('/change-password')

  return (
    <>
      {/* Registra FCM token silenciosamente — só ativo no APK Android */}
      <NotificationBootstrap />
      <AppShell role={session.role} userName={session.name}>
        {children}
      </AppShell>
    </>
  )
}
