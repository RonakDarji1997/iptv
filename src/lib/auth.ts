'use server';

import bcrypt from 'bcryptjs';

export async function verifyPassword(password: string): Promise<boolean> {
  const passwordHash = process.env.NEXT_PUBLIC_APP_PASSWORD_HASH;
  
  console.log('=== PASSWORD VERIFICATION DEBUG ===');
  console.log('Password received:', password);
  console.log('Password length:', password.length);
  console.log('Password hash from env:', passwordHash);
  console.log('Hash exists:', !!passwordHash);
  console.log('Hash length:', passwordHash?.length);
  
  if (!passwordHash) {
    console.log('ERROR: No password hash found in environment variables');
    console.log('Available env vars:', Object.keys(process.env).filter(k => k.includes('PASSWORD')));
    return false;
  }
  
  try {
    const isValid = await bcrypt.compare(password, passwordHash);
    console.log('Bcrypt comparison result:', isValid);
    return isValid;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}
