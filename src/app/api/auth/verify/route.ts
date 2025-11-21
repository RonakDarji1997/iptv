import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const passwordHash = process.env.NEXT_PUBLIC_APP_PASSWORD_HASH;
    
    if (!passwordHash) {
      console.error('Password hash not configured in environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const isValid = await bcrypt.compare(password, passwordHash);
    
    return NextResponse.json({ valid: isValid });
  } catch (error) {
    console.error('Password verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
