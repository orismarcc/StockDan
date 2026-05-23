import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getActiveSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

export async function GET() {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password, created_at')
    .eq('created_by', session.id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getActiveSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const body = await req.json()
  const { email, password, role } = body

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Preencha todos os campos.' }, { status: 400 })
  }
  if (!['admin', 'operario'].includes(role)) {
    return NextResponse.json({ error: 'Role inválida.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existing) {
    return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 10)
  const placeholderName = email.toLowerCase().trim().split('@')[0]

  const { data, error } = await supabase
    .from('users')
    .insert({
      name: placeholderName,
      email: email.toLowerCase().trim(),
      password_hash: hash,
      role,
      must_change_password: true,
      created_by: session.id,
    })
    .select('id, name, email, role, must_change_password, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
