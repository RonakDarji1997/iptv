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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    const response = await fetch(`${BACKEND_URL}/sync/providers`, {
      method: 'POST',
      headers: getAuthHeader(request),
      body: JSON.stringify(body),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Provider sync error:', error)
    return NextResponse.json({ error: 'Provider sync failed' }, { status: 500 })
  }
}
