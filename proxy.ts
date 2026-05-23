import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE } from '@/lib/auth'

// Rotas que não exigem sessão
const PUBLIC_PATHS = ['/login', '/api/auth/login']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rotas públicas passam direto
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const isApiRoute = pathname.startsWith('/api/')
  const token = req.cookies.get(COOKIE)?.value

  // Sem token
  if (!token) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const user = await verifyToken(token)

  // Token inválido ou expirado
  if (!user) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 })
    }
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete(COOKIE)
    return res
  }

  // Usuário com senha temporária: só pode acessar change-password e logout
  if (
    user.mustChangePassword &&
    !pathname.startsWith('/change-password') &&
    !pathname.startsWith('/api/auth/change-password') &&
    !pathname.startsWith('/api/auth/logout')
  ) {
    if (isApiRoute) {
      return NextResponse.json(
        { error: 'Senha temporária. Acesse /change-password para definir sua senha.' },
        { status: 403 }
      )
    }
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  // Rotas exclusivas de admin
  const adminOnlyPaths = ['/admin', '/farms/new', '/api/users']
  const isAdminOnly = adminOnlyPaths.some((p) => pathname.startsWith(p))
  if (isAdminOnly && user.role !== 'admin') {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
