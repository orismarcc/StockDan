import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return NextResponse.json({
      ok: false,
      env: { url: !!url, key: !!key },
      error: 'Env vars ausentes',
    })
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } })
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })

    return NextResponse.json({
      ok: !error,
      env: { url: url.slice(0, 30) + '...', keyPrefix: key.slice(0, 20) + '...' },
      userCount: count,
      dbError: error?.message ?? null,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, thrown: e.message })
  }
}
