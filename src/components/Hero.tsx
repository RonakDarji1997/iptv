'use client';

import { Play, Info } from 'lucide-react';
import { MOCK_FEATURED } from '@/lib/mock-data';

export default function Hero() {
    return (
        <div className="relative h-[70vh] w-full">
            {/* Background Image */}
            <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${MOCK_FEATURED.backdrop})` }}
            >
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent" />
            </div>

            {/* Content */}
            <div className="absolute bottom-0 left-0 z-10 w-full max-w-2xl p-12 pb-24">
                <h1 className="mb-4 text-6xl font-bold text-white drop-shadow-lg">
                    {MOCK_FEATURED.title}
                </h1>
                <p className="mb-8 text-lg text-zinc-200 drop-shadow-md line-clamp-3">
                    {MOCK_FEATURED.description}
                </p>

                <div className="flex gap-4">
                    <button className="flex items-center gap-2 rounded-lg bg-white px-8 py-3 font-bold text-black transition hover:bg-zinc-200">
                        <Play size={24} fill="currentColor" />
                        Play
                    </button>
                    <button className="flex items-center gap-2 rounded-lg bg-zinc-500/50 px-8 py-3 font-bold text-white backdrop-blur-sm transition hover:bg-zinc-500/70">
                        <Info size={24} />
                        More Info
                    </button>
                </div>
            </div>
        </div>
    );
}
