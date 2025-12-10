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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  const { providerId } = await params
  
  try {
    const response = await fetch(`${BACKEND_URL}/sync/full-sync/${providerId}`, {
      method: 'POST',
      headers: getAuthHeader(request),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Full sync error:', error)
    return NextResponse.json({ error: 'Full sync failed' }, { status: 500 })
  }
}
