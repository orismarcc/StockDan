/**
 * Health-check endpoint — publicamente acessível e sem autenticação (intencional).
 * Usado pelo service worker e por healthchecks externos (ex.: Vercel Cron, UptimeRobot).
 * Não expõe nenhuma informação sensível além de { ok: true }.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ ok: true }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
