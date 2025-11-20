import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware: rewrite non-API, non-file requests to /index.html (static Expo export)
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow API routes and static asset/file requests (contain a dot) to pass through
  if (pathname.startsWith('/api') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Rewrite everything else to the exported SPA entrypoint
  return NextResponse.rewrite(new URL('/index.html', request.url));
}

// Match all routes; filtering done inside middleware
export const config = {
  matcher: ['/((?!_next).*)'],
};
