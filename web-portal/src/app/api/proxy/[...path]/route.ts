import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = 'http://api.iptv.ronika.co/api'

function getCleanHeaders(request: NextRequest) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  const auth = request.headers.get('authorization')
  if (auth) {
    headers['Authorization'] = auth
  }
  
  return headers
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const searchParams = request.nextUrl.searchParams.toString()
  const url = `${BACKEND_URL}/${path}${searchParams ? `?${searchParams}` : ''}`
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: getCleanHeaders(request),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Proxy GET error:', error)
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const url = `${BACKEND_URL}/${path}`
  
  try {
    const body = await request.json()
    
    const response = await fetch(url, {
      method: 'POST',
      headers: getCleanHeaders(request),
      body: JSON.stringify(body),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Proxy POST error:', error)
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const url = `${BACKEND_URL}/${path}`
  
  try {
    const body = await request.json()
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: getCleanHeaders(request),
      body: JSON.stringify(body),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Proxy PUT error:', error)
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const path = params.path.join('/')
  const url = `${BACKEND_URL}/${path}`
  
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: getCleanHeaders(request),
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Proxy DELETE error:', error)
    return NextResponse.json({ error: 'Proxy request failed' }, { status: 500 })
  }
}
