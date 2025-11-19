'use client';

import { MediaPlayer, MediaOutlet } from '@vidstack/react';
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

interface VideoPlayerProps {
    src: string;
    title?: string;
    poster?: string;
    playlist?: any[];
    currentIndex?: number;
    onZap?: (index: number) => void;
}

export default function VideoPlayer({ src, title, poster, playlist, currentIndex = 0, onZap }: VideoPlayerProps) {
    const [showControls, setShowControls] = useState(false);

    const handleZap = (direction: 'prev' | 'next') => {
        if (!playlist || !onZap) return;

        let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        // Loop playlist
        if (newIndex >= playlist.length) newIndex = 0;
        if (newIndex < 0) newIndex = playlist.length - 1;

        onZap(newIndex);
    };

    return (
        <div
            className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl group"
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => setShowControls(false)}
        >
            <MediaPlayer
                title={title}
                src={src}
                poster={poster}
                aspectRatio="16/9"
                load="eager"
                autoplay
            >
                <MediaOutlet />
                <DefaultVideoLayout icons={defaultLayoutIcons} />
            </MediaPlayer>

            {/* Zapping Overlay */}
            {playlist && onZap && (
                <div className={`absolute inset-0 pointer-events-none flex items-center justify-between px-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleZap('prev'); }}
                        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-red-600"
                    >
                        <ChevronLeft size={24} />
                    </button>

                    <button
                        onClick={(e) => { e.stopPropagation(); handleZap('next'); }}
                        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition hover:bg-red-600"
                    >
                        <ChevronRight size={24} />
                    </button>
                </div>
            )}

            {/* Channel Info Overlay */}
            {playlist && (
                <div className={`absolute top-4 left-4 pointer-events-none transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="rounded-lg bg-black/60 px-4 py-2 backdrop-blur-md">
                        <h3 className="font-bold text-white">{title}</h3>
                        <p className="text-xs text-zinc-300">Channel {currentIndex + 1} of {playlist.length}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
