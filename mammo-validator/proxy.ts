import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from './lib/session';

/**
 * Network-boundary guard (Next 16 "proxy", Node.js runtime).
 *
 * Pages: unauthenticated visitors to /predict or /review get redirected to
 * /login; visitors to /admin must have the admin role. API routes return a
 * JSON 401/403 so the clients can react without a redirect. Static sample
 * media under /samples is only reachable by signed-in users (the pages that
 * embed these images are themselves protected).
 *
 * This is the first line of defence only — every protected route handler also
 * re-verifies the session against the `users` table (`lib/auth.ts`).
 */

function redirectToLogin(request: NextRequest, pathname: string): NextResponse {
  const next = encodeURIComponent(pathname + request.nextUrl.search);
  return NextResponse.redirect(
    new URL(`/login?next=${next}`, request.url)
  );
}

export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  const session = verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value
  );

  const isApi = pathname.startsWith('/api');
  const isSamples = pathname.startsWith('/samples');
  const isPublic = pathname === '/login' || pathname === '/api/auth/login';

  if (!session) {
    if (isPublic) return NextResponse.next();
    if (isApi || isSamples) {
      return NextResponse.json(
        { ok: false, message: 'Authentication required.' },
        { status: 401 }
      );
    }
    return redirectToLogin(request, pathname);
  }

  // Already signed in: home → review worklist, /login has nothing to do here.
  if (pathname === '/login') {
    return NextResponse.redirect(new URL('/review', request.url));
  }

  const isAdminArea =
    pathname === '/admin' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin');
  if (isAdminArea && session.role !== 'admin') {
    if (isApi) {
      return NextResponse.json(
        { ok: false, message: 'Administrator role required.' },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL('/review', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/predict/:path*',
    '/review/:path*',
    '/admin/:path*',
    '/samples/:path*',
    '/api/predict/:path*',
    '/api/cases/:path*',
    '/api/validation/:path*',
    '/api/auth/:path*',
    '/api/admin/:path*',
  ],
};