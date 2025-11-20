'use client';

import { useState, useRef } from 'react';
import { Plus, ThumbsUp, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '@/lib/store';

interface HoverCardProps {
    item: any;
    onInfo: (item: any) => void;
    contentType?: 'itv' | 'vod' | 'series';
}

export default function HoverCard({ item, onInfo, contentType = 'itv' }: HoverCardProps) {
    const { portalUrl } = useAuthStore();
    const [isHovered, setIsHovered] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setIsHovered(true);
        }, 400) as unknown as NodeJS.Timeout; // Delay before expanding
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsHovered(false);
    };

    // Construct full logo/poster URL
    const getImageUrl = () => {
        const baseUrl = portalUrl || 'http://tv.stream4k.cc/stalker_portal/';
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        
        // For channels (ITV), check for logo field
        if (contentType === 'itv') {
            if (item.logo) {
                // Logo can be a full URL or relative path
                if (item.logo.startsWith('http')) {
                    return item.logo;
                }
                // If relative path, construct full URL
                // Logos are typically at: /stalker_portal/misc/logos/320/{id}.png
                if (item.logo.startsWith('/')) {
                    return `${cleanBaseUrl}${item.logo}`;
                }
                return `${cleanBaseUrl}/misc/logos/320/${item.logo}`;
            }
            // Fallback to placeholder for channels without logo
            const displayText = `CH ${item.number || item.name}`;
            return `https://placehold.co/300x450/1f2937/ffffff?text=${encodeURIComponent(displayText)}`;
        }
        
        // For VOD (movies) and Series
        if (contentType === 'vod' || contentType === 'series') {
            // Try screenshot_uri, screenshot, poster, cover_big, etc.
            const imageUrl = item.screenshot_uri || item.screenshot || item.poster || item.cover_big || item.cover;
            if (imageUrl) {
                // If it's already a full URL, return it
                if (imageUrl.startsWith('http')) {
                    return imageUrl;
                }
                // If it's a relative path, prepend the portal base URL
                if (imageUrl.startsWith('/')) {
                    return `${cleanBaseUrl}${imageUrl}`;
                }
                return imageUrl;
            }
        }
        
        // Fallback to placeholder
        const displayText = item.name || 'Content';
        return `https://placehold.co/300x450/1f2937/ffffff?text=${encodeURIComponent(displayText)}`;
    };

    const imageUrl = getImageUrl();

    return (
        <div
            className="relative h-full w-full"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Base Card (Visible when not hovered) */}
            <div className={clsx(
                "relative w-full h-full overflow-hidden rounded-md bg-zinc-800 transition-opacity duration-300",
                isHovered ? "opacity-0" : "opacity-100"
            )}>
                <img
                    src={imageUrl}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-transparent p-2 flex items-end">
                    <span className="text-sm font-medium text-white truncate">{item.name}</span>
                </div>
            </div>

            {/* Expanded Card (Visible on hover) */}
            {isHovered && (
                <div className="absolute left-1/2 top-1/2 z-50 w-[150%] -translate-x-1/2 -translate-y-1/2 scale-110 transform overflow-hidden rounded-lg bg-zinc-900 shadow-2xl ring-1 ring-white/10 transition-all duration-300 animate-in fade-in zoom-in-95">
                    {/* Image/Video Area */}
                    <div className="relative w-full h-48 bg-zinc-800">
                        <img
                            src={imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/20" />
                    </div>

                    {/* Content Area */}
                    <div className="p-4 space-y-3">
                        {/* Actions */}
                        <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                                <button className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-500 bg-transparent text-white transition hover:border-white hover:bg-zinc-800">
                                    <Plus size={16} />
                                </button>
                                <button className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-500 bg-transparent text-white transition hover:border-white hover:bg-zinc-800">
                                    <ThumbsUp size={16} />
                                </button>
                            </div>
                            <button
                                onClick={() => onInfo(item)}
                                className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-500 bg-transparent text-white transition hover:border-white hover:bg-zinc-800"
                            >
                                <ChevronDown size={16} />
                            </button>
                        </div>

                        {/* Metadata */}
                        <div>
                            <h3 className="font-bold text-white line-clamp-2">{item.name}</h3>
                            
                            {/* For VOD/Series content */}
                            {(contentType === 'vod' || contentType === 'series') && (
                                <>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                                        {item.year && <span>{item.year}</span>}
                                        {item.time && <span>{item.time} min</span>}
                                        {item.hd === 1 || item.hd === '1' ? (
                                            <span className="border border-blue-500 text-blue-400 px-1 rounded">HD</span>
                                        ) : null}
                                        {item.high_quality === '1' || item.high_quality === 1 ? (
                                            <span className="border border-yellow-500 text-yellow-400 px-1 rounded">4K</span>
                                        ) : null}
                                    </div>
                                    
                                    {item.rating_imdb > 0 && (
                                        <div className="mt-1 flex items-center gap-1 text-xs">
                                            <span className="text-yellow-500">⭐</span>
                                            <span className="text-zinc-300">{item.rating_imdb}</span>
                                        </div>
                                    )}
                                    
                                    {item.description && (
                                        <p className="mt-2 text-xs text-zinc-400 line-clamp-3">
                                            {item.description}
                                        </p>
                                    )}
                                    
                                    {item.director && (
                                        <p className="mt-2 text-xs text-zinc-400">
                                            <span className="text-zinc-500">Director:</span> {item.director}
                                        </p>
                                    )}
                                    
                                    {item.actors && (
                                        <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                                            <span className="text-zinc-500">Cast:</span> {item.actors}
                                        </p>
                                    )}
                                    
                                    {item.country && (
                                        <p className="mt-1 text-xs text-zinc-400">
                                            <span className="text-zinc-500">Country:</span> {item.country}
                                        </p>
                                    )}
                                </>
                            )}
                            
                            {/* For ITV/Channels content */}
                            {contentType === 'itv' && (
                                <>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                                        <span className="text-green-500 font-semibold">CH #{item.number}</span>
                                        {item.hd === 1 || item.hd === '1' ? (
                                            <span className="border border-blue-500 text-blue-400 px-1 rounded">HD</span>
                                        ) : null}
                                        {item.archive === 1 || item.archive === '1' ? (
                                            <span className="border border-purple-500 text-purple-400 px-1 rounded">ARCHIVE</span>
                                        ) : null}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-300">
                                        {item.cur_playing ? (
                                            <span className="truncate">{item.cur_playing}</span>
                                        ) : (
                                            <span className="text-zinc-500">No guide available</span>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
