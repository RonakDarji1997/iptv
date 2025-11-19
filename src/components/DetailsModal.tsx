'use client';

import { X, Play, Plus, ThumbsUp, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

interface DetailsModalProps {
    item: any;
    isOpen: boolean;
    onClose: () => void;
    onPlay: (item: any) => void;
}

export default function DetailsModal({ item, isOpen, onClose, onPlay }: DetailsModalProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [muted, setMuted] = useState(true);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            document.body.style.overflow = 'hidden';
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300);
            document.body.style.overflow = 'unset';
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!isVisible && !isOpen) return null;

    return (
        <div className={clsx(
            "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-black/60 backdrop-blur-sm transition-opacity duration-300",
            isOpen ? "opacity-100" : "opacity-0"
        )}
            onClick={onClose}
        >
            <div
                className={clsx(
                    "relative w-full max-w-4xl rounded-xl bg-[#181818] shadow-2xl transition-transform duration-300",
                    isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-10"
                )}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[#181818] text-white transition hover:bg-[#2a2a2a]"
                >
                    <X size={24} />
                </button>

                {/* Hero Section */}
                <div className="relative aspect-video w-full overflow-hidden rounded-t-xl">
                    <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent z-10" />
                    <img
                        src={item.logo || item.cmd || 'https://via.placeholder.com/800x450'}
                        alt={item.name}
                        className="h-full w-full object-cover"
                    />

                    <div className="absolute bottom-0 left-0 z-20 w-full p-12">
                        <h2 className="mb-6 text-5xl font-bold text-white drop-shadow-lg">{item.name}</h2>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => onPlay(item)}
                                className="flex items-center gap-2 rounded bg-white px-8 py-2 font-bold text-black transition hover:bg-zinc-200"
                            >
                                <Play size={24} fill="currentColor" />
                                Play
                            </button>
                            <button className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-500 text-zinc-300 transition hover:border-white hover:text-white">
                                <Plus size={20} />
                            </button>
                            <button className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-500 text-zinc-300 transition hover:border-white hover:text-white">
                                <ThumbsUp size={20} />
                            </button>

                            <div className="flex-grow" />

                            <button
                                onClick={() => setMuted(!muted)}
                                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-zinc-500/50 bg-black/20 text-zinc-300 backdrop-blur-sm transition hover:border-white hover:text-white"
                            >
                                {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Details Section */}
                <div className="grid grid-cols-3 gap-8 p-12">
                    <div className="col-span-2 space-y-6">
                        <div className="flex items-center gap-4 text-white">
                            <span className="font-bold text-green-500">98% Match</span>
                            <span>2024</span>
                            <span className="border border-zinc-600 px-1 text-xs">HD</span>
                            <span>5.1</span>
                        </div>

                        <p className="text-lg text-white">
                            {item.description || "Experience the ultimate entertainment with this channel. Watch live streams, movies, and shows directly from your IPTV provider. High quality streaming available."}
                        </p>

                        <hr className="border-zinc-700" />

                        <h3 className="text-xl font-bold text-white">Episodes</h3>
                        <div className="space-y-4">
                            {[1, 2, 3].map((ep) => (
                                <div key={ep} className="flex cursor-pointer items-center gap-4 rounded-lg p-4 transition hover:bg-[#2a2a2a]">
                                    <div className="text-xl font-bold text-zinc-500">{ep}</div>
                                    <div className="relative h-20 w-36 overflow-hidden rounded bg-zinc-800">
                                        <img src={`https://via.placeholder.com/144x80?text=Ep${ep}`} alt="" className="h-full w-full object-cover" />
                                    </div>
                                    <div className="flex-grow">
                                        <h4 className="font-bold text-white">Episode {ep}</h4>
                                        <p className="text-sm text-zinc-400">Lorem ipsum dolor sit amet...</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6 text-sm text-white">
                        <div>
                            <span className="text-zinc-500">Cast:</span>
                            <span className="ml-2 hover:underline cursor-pointer">Actor One, Actor Two, Actor Three</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">Genres:</span>
                            <span className="ml-2 hover:underline cursor-pointer">Action, Drama, Thriller</span>
                        </div>
                        <div>
                            <span className="text-zinc-500">This show is:</span>
                            <span className="ml-2 hover:underline cursor-pointer">Exciting, Suspenseful</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
