'use client';

import { useState, useEffect, useRef } from 'react';
import HoverCard from './HoverCard';
import DetailsModal from './DetailsModal';
import { SeriesModal } from './SeriesModal';
import { useAuthStore } from '@/lib/store';
import { StalkerClient } from '@/lib/stalker-client';

interface ContentRowProps {
    title: string;
    categoryId: string;
    items: any[];
    contentType?: 'itv' | 'vod' | 'series';
    onChannelSelect?: (url: string, name: string, item?: any) => void;
}

export default function ContentRow({ title, categoryId, items, contentType = 'itv', onChannelSelect }: ContentRowProps) {
    const endOfListRef = useRef<HTMLDivElement>(null);
    const [selectedItem, setSelectedItem] = useState<any>(null);
    const [selectedSeries, setSelectedSeries] = useState<any>(null);
    const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false);
    const [localItems, setLocalItems] = useState(items);
    const [isLoading, setIsLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalChannels, setTotalChannels] = useState(0);
    const [hasMorePages, setHasMorePages] = useState(true);
    const { macAddress, portalUrl, setChannels } = useAuthStore();

    const handleThumbnailClick = async (item: any) => {
        // For search results or mixed content, determine type from genres_str
        const seriesGenres = [
            'ENGLISH | SERIES', 'ENGLISH | ANIME', 'ENGLISH | DOCUMENTARY', 'ENGLISH | KOREAN SERIES',
            'ENGLISH | ARABIC SUB', 'ENGLISH | KIDS SERIES', 'ENGLISH | MUSIC ALBUMS',
            'HINDI | TV SERIALS', 'HINDI | WEB SERIES', 'HINDI | WEB SERIES (18+)',
            'HINDI | DUBB ANIME', 'HINDI | DUBB SERIES', 'HINDI | KOREAN DRAMA',
            'HINDI | KIDS COLLECTION', 'HINDI | MUSIC ALBUMS',
            'URDU | TV SERIALS', 'URDU | POLITICAL SHOWS', 'URDU | MUSIC ALBUMS',
            'GUJARATI | TV SERIALS', 'GUJARATI | WEB SERIES',
            'TURKISH | URDU DUB SERIES',
            'ADULT | SERIES',
            'SPORTS | EVENTS', 'SPORTS | CRICKET EVENTS'
        ];
        const isSeries = contentType === 'series' || (item.genres_str && seriesGenres.includes(item.genres_str));
        
        // For series, open the series modal instead of playing directly
        if (isSeries) {
            setSelectedSeries(item);
            setIsSeriesModalOpen(true);
            return;
        }
        
        if (macAddress && portalUrl) {
            try {
                const client = new StalkerClient({ mac: macAddress, url: portalUrl });
                
                // For VOD (movies), first get the file details to get the correct file ID
                if (contentType === 'vod') {
                    const fileInfo = await client.getMovieInfo(item.id);
                    
                    if (!fileInfo || !fileInfo.id) {
                        throw new Error('No file information found for this content');
                    }
                    
                    // Use the file ID to construct the cmd
                    const cmd = `/media/file_${fileInfo.id}.mpg`;
                    const url = await client.getStreamUrl(cmd, contentType);
                    
                    if (onChannelSelect) {
                        onChannelSelect(url, item.name, item);
                    }
                } else {
                    // For channels, use the cmd directly
                    const url = await client.getStreamUrl(item.cmd, contentType);
                    
                    if (onChannelSelect) {
                        onChannelSelect(url, item.name, item);
                    }
                }
                
            } catch (e) {
                alert(`❌ Failed to get stream URL: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
        }
    };

    const handleSeriesEpisodeSelect = (url: string, title: string, item?: any) => {
        if (onChannelSelect) {
            onChannelSelect(url, title, item);
        }
    };

    // Lazy load channels for this category
    useEffect(() => {
        if (localItems.length === 0 && categoryId && macAddress && portalUrl) {
            const loadItems = async () => {
                setIsLoading(true);
                try {
                    const client = new StalkerClient({ mac: macAddress, url: portalUrl });
                    let result;
                    
                    if (contentType === 'vod') {
                        result = await client.getMovies(categoryId, 1);
                    } else if (contentType === 'series') {
                        result = await client.getSeries(categoryId, 1);
                    } else {
                        result = await client.getChannels(categoryId, 1);
                    }
                    
                    if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                        
                        setLocalItems(result.data);
                        setTotalChannels(result.total);
                        setChannels(categoryId, result.data);
                        
                        // Check if there are more pages (assuming 14 items per page)
                        const totalPages = Math.ceil(result.total / 14);
                        setHasMorePages(totalPages > 1);
                        setCurrentPage(1);
                    }
                } catch (e) {
                    // Failed to fetch items
                } finally {
                    setIsLoading(false);
                }
            };
            loadItems();
        } else if (items.length > 0) {
            setLocalItems(items);
        }
    }, [categoryId, items, macAddress, portalUrl, setChannels, contentType]);

    // Load more pages when scrolling to end
    useEffect(() => {
        if (!endOfListRef.current || !hasMorePages || isLoading) return;

        const observer = new IntersectionObserver(
            async (entries) => {
                if (entries[0].isIntersecting && hasMorePages && !isLoading && macAddress && portalUrl) {
                    setIsLoading(true);
                    try {
                        const nextPage = currentPage + 1;
                        const client = new StalkerClient({ mac: macAddress, url: portalUrl });
                        let result;
                        
                        if (contentType === 'vod') {
                            result = await client.getMovies(categoryId, nextPage);
                        } else if (contentType === 'series') {
                            result = await client.getSeries(categoryId, nextPage);
                        } else {
                            result = await client.getChannels(categoryId, nextPage);
                        }
                        
                        if (result.data && Array.isArray(result.data) && result.data.length > 0) {
                            setLocalItems(prev => [...prev, ...result.data]);
                            setCurrentPage(nextPage);
                            
                            // Check if there are more pages after this one
                            const totalPages = Math.ceil(result.total / 14);
                            setHasMorePages(nextPage < totalPages);
                        } else {
                            setHasMorePages(false);
                        }
                    } catch (e) {
                        console.error(`Failed to fetch more items for category ${categoryId}:`, e);
                        setHasMorePages(false);
                    } finally {
                        setIsLoading(false);
                    }
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(endOfListRef.current);
        return () => observer.disconnect();
    }, [categoryId, currentPage, hasMorePages, isLoading, macAddress, portalUrl, contentType]);

    return (
        <div className="mb-12">
            <h2 className="mb-6 text-2xl font-semibold text-white">
                {title}
            </h2>

            {isLoading && localItems.length === 0 ? (
                <div className="flex items-center justify-center py-20">
                    <span className="text-zinc-400">Loading content...</span>
                </div>
            ) : (
                <>
                    {/* Grid Layout for Thumbnails */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-8">
                        {localItems.map((item) => (
                            <div
                                key={item.id}
                                className="relative aspect-2/3 cursor-pointer"
                                onClick={() => handleThumbnailClick(item)}
                            >
                                <HoverCard
                                    item={item}
                                    onInfo={setSelectedItem}
                                    contentType={contentType}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Trigger for lazy loading more pages */}
                    <div ref={endOfListRef} className="h-20" />
                    
                    {isLoading && localItems.length > 0 && (
                        <div className="flex items-center justify-center py-8">
                            <span className="text-zinc-500 text-sm">Loading more...</span>
                        </div>
                    )}
                </>
            )}

            <DetailsModal
                item={selectedItem}
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                onPlay={handleThumbnailClick}
            />

            <SeriesModal
                series={selectedSeries}
                isOpen={isSeriesModalOpen}
                onClose={() => {
                    setIsSeriesModalOpen(false);
                    setSelectedSeries(null);
                }}
                onEpisodeSelect={handleSeriesEpisodeSelect}
            />
        </div>
    );
}
