import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

/**
 * Get encryption key from environment or generate one
 * In production, ENCRYPTION_KEY should be set in .env
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  
  if (!key) {
    // For development, use a consistent key (NOT for production!)
    console.warn('ENCRYPTION_KEY not set, using default development key');
    return crypto.scryptSync('dev-encryption-key-change-in-prod', 'salt', KEY_LENGTH);
  }
  
  // If key is hex string, convert to buffer
  if (key.length === KEY_LENGTH * 2) {
    return Buffer.from(key, 'hex');
  }
  
  // Otherwise derive key from string
  return crypto.scryptSync(key, 'salt', KEY_LENGTH);
}

/**
 * Encrypt sensitive data (tokens, passwords, bearer tokens)
 */
export function encrypt(text: string): string {
  if (!text) return '';
  
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Safe decrypt that returns original value if not encrypted (for backward compatibility)
 */
export function safeDecrypt(text: string): string {
  if (!text) return '';
  
  // Check if data looks encrypted (has colon separators)
  if (text.includes(':') && text.split(':').length === 3) {
    try {
      return decrypt(text);
    } catch (error) {
      // If decryption fails, return original (might be plain text)
      console.warn('Failed to decrypt, returning original value');
      return text;
    }
  }
  
  // Not encrypted, return as-is
  return text;
}

/**
 * Generate a random encryption key (for initial setup)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}
