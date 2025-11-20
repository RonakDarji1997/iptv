import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware: rewrite non-API, non-file requests to /index.html (static Expo export)
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Allow API routes to pass through
  if (pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  // In development, proxy to Expo dev server
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.rewrite(new URL(`http://localhost:8081${pathname}${search}`));
  }

  // Allow static asset/file requests (contain a dot) to pass through
  if (pathname.includes('.')) {
    return NextResponse.next();
  }

  // Rewrite everything else to the exported SPA entrypoint
  return NextResponse.rewrite(new URL('/index.html', request.url));
}

// Match all routes; filtering done inside middleware
export const config = {
  matcher: ['/((?!_next).*)'],
};
