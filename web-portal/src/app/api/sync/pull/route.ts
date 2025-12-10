import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = 'http://api.iptv.ronika.co/api'

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

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Sync pull error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
