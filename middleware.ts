import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'

const PUBLIC = ['/login', '/api/auth/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const token = req.cookies.get('stockdan_session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const user = await verifyToken(token)

  if (!user) {
    const res = NextResponse.redirect(new URL('/login', req.url))
    res.cookies.delete('stockdan_session')
    return res
  }

  // Força redefinição de senha antes de qualquer outra rota
  if (
    user.mustChangePassword &&
    !pathname.startsWith('/change-password') &&
    !pathname.startsWith('/api/auth/change-password') &&
    !pathname.startsWith('/api/auth/logout')
  ) {
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  // Rotas exclusivas de admin
  const adminOnly = ['/admin', '/farms/new', '/api/users', '/api/farms']
  const isAdminOnly = adminOnly.some((p) => pathname.startsWith(p))
  if (isAdminOnly && user.role !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
