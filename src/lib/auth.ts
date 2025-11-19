'use server';

import bcrypt from 'bcryptjs';

export async function verifyPassword(password: string): Promise<boolean> {
  const passwordHash = process.env.NEXT_PUBLIC_APP_PASSWORD_HASH;
  
  console.log('[Server] Password length:', password?.length);
  console.log('[Server] Password hash from env:', passwordHash ? `Hash set (${passwordHash.substring(0, 10)}...)` : 'Hash is missing');
  
  if (!passwordHash) {
    console.error('[Server] Password hash not configured');
    return false;
  }
  
  try {
    console.log('[Server] Comparing password with hash...');
    const isValid = await bcrypt.compare(password, passwordHash);
    console.log('[Server] Bcrypt comparison result:', isValid);
    return isValid;
  } catch (error) {
    console.error('[Server] Password verification error:', error);
    return false;
  }
}
