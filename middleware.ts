import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE } from '@/lib/auth'

// Rotas públicas que NÃO exigem autenticação
const PUBLIC_API_ROUTES = ['/api/auth/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Aplica apenas em rotas de API
  if (!pathname.startsWith('/api/')) return NextResponse.next()

  // Rotas públicas passam sem verificação
  if (PUBLIC_API_ROUTES.includes(pathname)) return NextResponse.next()

  // Verifica cookie JWT
  const token = req.cookies.get(COOKIE)?.value
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
  }

  const session = await verifyToken(token)
  if (!session) {
    return NextResponse.json({ error: 'Sessão inválida ou expirada.' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
