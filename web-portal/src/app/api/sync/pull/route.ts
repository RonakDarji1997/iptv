import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

function getAuthHeader(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  const auth = request.headers.get('authorization')
  if (auth) {
    headers['Authorization'] = auth
  }
  
  return headers
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/sync/pull`, {
      method: 'GET',
      headers: getAuthHeader(request),
    })

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return NextResponse.json(data, { status: response.status });
    } catch (err) {
      console.error('Upstream response was not JSON:', text);
      return NextResponse.json({ error: 'Upstream response was not JSON' }, { status: 500 });
    }
  } catch (error) {
    console.error('Sync pull error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
