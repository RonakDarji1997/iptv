'use client';

import { Play, Info } from 'lucide-react';

const FEATURED = {
    title: 'Welcome to IPTV',
    description: 'Stream thousands of live channels, movies, and series from around the world.',
    backdrop: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=1920&q=80'
};

export default function Hero() {
    return (
        <div className="relative h-[70vh] w-full">
            {/* Background Image */}
            <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${FEATURED.backdrop})` }}
            >
                <div className="absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent" />
                <div className="absolute inset-0 bg-linear-to-r from-black via-black/40 to-transparent" />
            </div>

            {/* Content */}
            <div className="absolute bottom-0 left-0 z-10 w-full max-w-2xl p-12 pb-24">
                <h1 className="mb-4 text-6xl font-bold text-white drop-shadow-lg">
                    {FEATURED.title}
                </h1>
                <p className="mb-8 text-lg text-zinc-200 drop-shadow-md line-clamp-3">
                    {FEATURED.description}
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
