import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'
import { can } from '@/lib/permissions'
import { ReportScheduleForm } from '@/components/ReportScheduleForm'

export const metadata = { title: 'Relatórios Agendados' }

export default async function ReportsPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (!can(session.role, 'reports.schedule')) redirect('/dashboard')

  const supabase = createServerClient()

  // E-mail default = do próprio Gestor
  const { data: me } = await supabase
    .from('users')
    .select('email')
    .eq('id', session.id)
    .single()

  const { data: schedule } = await supabase
    .from('report_schedules')
    .select('*')
    .eq('gestor_id', session.gestor_id)
    .maybeSingle()

  return (
    <div>
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-gray-100">Relatórios Agendados</h1>
        <p className="mt-1 text-sm text-gray-500">
          Receba automaticamente um relatório do seu tenant por e-mail. Opt-in:
          desativado por padrão — ative apenas se quiser receber.
        </p>
      </div>

      {/* Aviso sobre domínio Resend — remover quando domínio for verificado */}
      <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
        <p className="text-sm font-medium text-amber-400">⚠️ Verificação de domínio pendente</p>
        <p className="mt-1 text-xs text-amber-500/80 leading-relaxed">
          Para enviar relatórios para qualquer e-mail, é necessário verificar um domínio em{' '}
          <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer"
            className="underline hover:text-amber-400">resend.com/domains</a>.
          Sem verificação, os e-mails só chegam ao endereço da conta Resend cadastrada.
        </p>
      </div>

      <ReportScheduleForm
        initial={schedule ?? null}
        defaultEmail={me?.email ?? ''}
      />
    </div>
  )
}
