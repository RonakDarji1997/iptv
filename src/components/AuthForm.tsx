'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';
import { formatMacAddress } from '@/lib/stalker-api';
import { Tv, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

export default function AuthForm() {
    const [url, setUrl] = useState('http://tv.stream4k.cc/stalker_portal/');
    const [mac, setMac] = useState('00:1A:79:17:F4:F5');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const { setCredentials, setSession } = useAuthStore();

    const handleMacChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMac(formatMacAddress(e.target.value));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            // Initialize client
            const client = new StalkerClient({ url, mac });
            await client.handshake();

            // If handshake succeeds, we are good
            // In a real app, we might want to fetch profile here too
            setCredentials(mac, url);
            setSession('mock_token', Date.now() + 86400000);
        } catch (err: any) {
            setError(err.message || 'Failed to connect to portal');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen w-full items-center justify-center bg-[url('https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?q=80&w=2669&auto=format&fit=crop')] bg-cover bg-center">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

            <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-black/60 p-8 shadow-2xl backdrop-blur-xl">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-600/20 text-red-500">
                        <Tv size={32} />
                    </div>
                    <h1 className="text-3xl font-bold text-white">IPTV Player</h1>
                    <p className="mt-2 text-zinc-400">Enter your portal details to continue</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label htmlFor="url" className="text-sm font-medium text-zinc-300">
                            Portal URL
                        </label>
                        <input
                            id="url"
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="https://tv.stream4k.cc"
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-500 transition focus:border-red-500 focus:bg-white/10 focus:outline-none"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="mac" className="text-sm font-medium text-zinc-300">
                            MAC Address
                        </label>
                        <input
                            id="mac"
                            type="text"
                            value={mac}
                            onChange={handleMacChange}
                            placeholder="00:1A:79:..."
                            className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-zinc-500 transition focus:border-red-500 focus:bg-white/10 focus:outline-none"
                            required
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-4 text-sm text-red-400">
                            <AlertCircle size={16} />
                            <p>{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={clsx(
                            "flex w-full items-center justify-center rounded-lg bg-red-600 py-3.5 font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-black",
                            loading && "cursor-not-allowed opacity-70"
                        )}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                Connecting...
                            </>
                        ) : (
                            'Start Watching'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
