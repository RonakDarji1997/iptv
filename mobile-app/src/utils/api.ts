import CryptoJS from 'crypto-js';

/**
 * Generate MD5 hash
 */
export function md5(input: string): string {
  return CryptoJS.MD5(input).toString();
}

/**
 * Build Stalker portal URL with parameters
 */
export function buildStalkerUrl(
  baseUrl: string,
  params: Record<string, any>
): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });
  return url.toString();
}

/**
 * Parse M3U8 URL from response
 */
export function parseM3U8Url(url: string): string {
  // Some URLs might be base64 encoded or need parsing
  try {
    if (url.startsWith('http')) {
      return url;
    }
    // Add parsing logic if needed
    return url;
  } catch {
    return url;
  }
}

/**
 * Handle API errors and return user-friendly messages
 */
export function handleApiError(error: any): string {
  if (error.response) {
    // Server responded with error status
    const status = error.response.status;
    const message = error.response.data?.message || error.response.data?.error;
    
    if (status === 401) {
      return 'Authentication failed. Please login again.';
    } else if (status === 403) {
      return 'Access denied. You do not have permission.';
    } else if (status === 404) {
      return 'Resource not found.';
    } else if (status === 429) {
      return 'Too many requests. Please try again later.';
    } else if (status >= 500) {
      return 'Server error. Please try again later.';
    }
    
    return message || 'An error occurred. Please try again.';
  } else if (error.request) {
    // Request made but no response
    return 'Network error. Please check your connection.';
  } else {
    // Error in request setup
    return error.message || 'An unexpected error occurred.';
  }
}

/**
 * Retry async function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
      }
    }
  }
  
  throw lastError;
}

/**
 * Check if string is JSON
 */
export function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}
