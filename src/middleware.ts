import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Middleware: rewrite non-API, non-file requests to /index.html (static Expo export)
export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Handle CORS preflight for API routes
  if (request.method === 'OPTIONS' && pathname.startsWith('/api')) {
    console.log('🚦 Middleware: Handling OPTIONS for', pathname);
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // Allow API routes to pass through with CORS headers
  if (pathname.startsWith('/api')) {
    console.log('🚦 Middleware: Passing API request', pathname);
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return response;
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
