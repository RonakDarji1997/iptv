import Constants from 'expo-constants';

/**
 * Generate a unique MAC address based on device identifier
 * Format: 00:1A:79:XX:XX:XX (MAG device style)
 */
export function generateDeviceMAC(): string {
  const prefix = '00:1A:79';
  
  // Get device-specific identifier
  const deviceId = Constants.sessionId || Constants.installationId || 'default-device';
  
  // Create a hash-like value from device ID
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    const char = deviceId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert hash to 3 bytes (6 hex characters)
  const byte1 = (Math.abs(hash) >> 16) & 0xFF;
  const byte2 = (Math.abs(hash) >> 8) & 0xFF;
  const byte3 = Math.abs(hash) & 0xFF;
  
  const suffix = [byte1, byte2, byte3]
    .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(':');
  
  return `${prefix}:${suffix}`;
}

/**
 * Generate a random MAC address
 * Format: 00:1A:79:XX:XX:XX (MAG device style)
 */
export function generateRandomMAC(): string {
  const prefix = '00:1A:79';
  const randomBytes = new Uint8Array(3);
  
  // Generate random bytes
  for (let i = 0; i < 3; i++) {
    randomBytes[i] = Math.floor(Math.random() * 256);
  }
  
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

/**
 * Format MAC address with colons
 */
export function formatMAC(mac: string): string {
  // Remove all non-hex characters
  const cleaned = mac.replace(/[^0-9A-Fa-f]/g, '');
  
  // Add colons every 2 characters
  const formatted = cleaned.match(/.{1,2}/g)?.join(':') || cleaned;
  
  return formatted.toUpperCase();
}
