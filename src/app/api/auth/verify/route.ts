import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  console.log('🔐 Auth verification request received');
  try {
    const body = await request.json();
    const { password } = body;
    
    console.log('📝 Password received length:', password?.length);

    if (!password) {
      console.log('❌ No password provided');
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    // Try both standard env var and NEXT_PUBLIC_ prefixed var
    const passwordHash = process.env.APP_PASSWORD_HASH || process.env.NEXT_PUBLIC_APP_PASSWORD_HASH;
    
    if (!passwordHash) {
      console.error('❌ Password hash not configured in environment variables');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    const isValid = await bcrypt.compare(password, passwordHash);
    console.log('✅ Password verification result:', isValid);
    
    return NextResponse.json({ valid: isValid });
  } catch (error) {
    console.error('❌ Password verification error:', error);
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}
