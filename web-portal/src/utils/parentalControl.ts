/**
 * Check if parental control is currently unlocked
 */
export function isParentalUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  
  const sessionToken = sessionStorage.getItem('parental_session');
  const expiresAt = sessionStorage.getItem('parental_expires');
  
  if (!sessionToken || !expiresAt) return false;
  
  const now = Date.now();
  const expires = parseInt(expiresAt);
  
  return now < expires;
}

/**
 * Clear parental control session
 */
export function clearParentalSession(): void {
  if (typeof window === 'undefined') return;
  
  sessionStorage.removeItem('parental_session');
  sessionStorage.removeItem('parental_expires');
}

/**
 * Check if category requires parental control
 */
export function isCensoredCategory(category: any): boolean {
  return category?.censored === 1 || category?.censored === true;
}
