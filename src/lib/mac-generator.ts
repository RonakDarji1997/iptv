import crypto from 'crypto';

/**
 * Generate a MAG-style MAC address with prefix 00:1A:79
 * Format: 00:1A:79:XX:XX:XX where XX are random hex values
 */
export function generateMAC(): string {
  const prefix = '00:1A:79';
  const randomBytes = crypto.randomBytes(3);
  const suffix = Array.from(randomBytes)
    .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
  
  return `${prefix}:${suffix}`;
}

/**
 * Validate MAC address format
 */
export function isValidMAC(mac: string): boolean {
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
}

/**
 * Normalize MAC address to uppercase with colons
 */
export function normalizeMAC(mac: string): string {
  return mac.replace(/-/g, ':').toUpperCase();
}
