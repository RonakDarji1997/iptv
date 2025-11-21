// Stalker Portal base URL for images
const PORTAL_BASE_URL = 'http://tv.stream4k.cc';

/**
 * Converts relative Stalker Portal image paths to absolute URLs
 * @param imagePath - Relative path like "/stalker_portal/screenshots/123/12345.jpg"
 * @returns Full URL like "http://tv.stream4k.cc/stalker_portal/screenshots/123/12345.jpg"
 */
export function getFullImageUrl(imagePath: string | undefined | null): string | undefined {
  if (!imagePath) return undefined;
  
  // If already absolute URL, return as is
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // If relative path, prepend base URL
  if (imagePath.startsWith('/')) {
    return `${PORTAL_BASE_URL}${imagePath}`;
  }
  
  // If no leading slash, add it
  return `${PORTAL_BASE_URL}/${imagePath}`;
}
