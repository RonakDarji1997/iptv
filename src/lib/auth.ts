'use server';

import bcrypt from 'bcryptjs';

export async function verifyPassword(password: string): Promise<boolean> {
  const passwordHash = process.env.NEXT_PUBLIC_APP_PASSWORD_HASH;
  
  if (!passwordHash) {
    return false;
  }
  
  try {
    const isValid = await bcrypt.compare(password, passwordHash);
    return isValid;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}
