import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase'

type Params = { params: Promise<{ uid: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { uid } = await params
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, must_change_password, created_at')
    .eq('id', uid)
    .eq('created_by', session.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

  const { data: farmLinks } = await supabase
    .from('farm_users')
    .select('farms(id, name, city, state)')
    .eq('user_id', uid)

  return NextResponse.json({
    ...data,
    farms: farmLinks?.map((f: any) => f.farms) ?? [],
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { uid } = await params
  const supabase = createServerClient()

  // Verifica propriedade antes de qualquer alteração
  const { data: target } = await supabase
    .from('users')
    .select('id')
    .eq('id', uid)
    .eq('created_by', session.id)
    .single()

  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

  const body = await req.json()
  const { name, role, password, farm_ids } = body

  const updates: Record<string, unknown> = {}
  if (name) updates.name = name
  if (role && ['admin', 'operario'].includes(role)) updates.role = role
  if (password) {
    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
    }
    updates.password_hash = await bcrypt.hash(password, 10)
    updates.must_change_password = false
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('users').update(updates).eq('id', uid)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(farm_ids)) {
    // Busca TODAS as fazendas do admin para escopar corretamente o delete
    const { data: adminFarms } = await supabase
      .from('farms')
      .select('id')
      .eq('owner_id', session.id)
    const adminFarmIds = (adminFarms ?? []).map((f: { id: string }) => f.id)

    // Apenas fazendas da lista que pertencem a este admin
    const allowedFarmIds = farm_ids.filter((fid: string) => adminFarmIds.includes(fid))

    // Delete escopado: remove APENAS associações de fazendas deste admin
    // (preserva associações de outros admins intactas)
    if (adminFarmIds.length > 0) {
      await supabase.from('farm_users').delete().eq('user_id', uid).in('farm_id', adminFarmIds)
    }
    if (allowedFarmIds.length > 0) {
      await supabase.from('farm_users').insert(
        allowedFarmIds.map((fid: string) => ({ user_id: uid, farm_id: fid }))
      )
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  }

  const { uid } = await params
  if (uid === session.id) {
    return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verifica propriedade antes de excluir
  const { data: target } = await supabase
    .from('users')
    .select('id')
    .eq('id', uid)
    .eq('created_by', session.id)
    .single()

  if (!target) return NextResponse.json({ error: 'Usuário não encontrado.' }, { status: 404 })

  const { error } = await supabase.from('users').delete().eq('id', uid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
