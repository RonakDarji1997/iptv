export interface StalkerCredentials {
    mac: string;
    url: string;
}

export interface StalkerSession {
    token: string;
    expiresAt: number;
}

export class StalkerError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StalkerError';
    }
}

// Helper to format MAC address (e.g., 00:1A:79:...)
export function formatMacAddress(input: string): string {
    const cleaned = input.replace(/[^0-9A-Fa-f]/g, '');
    const pairs = cleaned.match(/.{1,2}/g);
    return pairs ? pairs.join(':').toUpperCase() : input;
}

// Mock authentication for now as Stalker Portals have strict CORS and specific handshake protocols
// In a real app, this would likely need a server-side proxy to handle the handshake
export async function authenticateStalker(credentials: StalkerCredentials): Promise<StalkerSession> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Basic validation
    if (!credentials.mac || !credentials.url) {
        throw new StalkerError('MAC Address and Portal URL are required.');
    }

    if (credentials.mac.length < 12) {
        throw new StalkerError('Invalid MAC Address format.');
    }

    // For development/demo purposes, we'll accept any "valid-looking" MAC
    // In production, this would hit the portal's handshake endpoint

    return {
        token: 'mock_stalker_token_' + Math.random().toString(36).substring(7),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
    };
}
