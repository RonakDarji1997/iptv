'use client';

import { useEffect, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { StalkerClient } from '@/lib/stalker-client';
import { useAuthStore } from '@/lib/store';

interface SeriesModalProps {
    series: any;
    isOpen: boolean;
    onClose: () => void;
    onEpisodeSelect: (url: string, title: string, item?: any) => void;
}

export function SeriesModal({ series, isOpen, onClose, onEpisodeSelect }: SeriesModalProps) {
    const [seasons, setSeasons] = useState<any[]>([]);
    const [selectedSeason, setSelectedSeason] = useState<any | null>(null);
    const [episodes, setEpisodes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState<'seasons' | 'episodes'>('seasons');
    const { macAddress, portalUrl } = useAuthStore();

    const loadSeasons = useCallback(async () => {
        if (!macAddress || !portalUrl || !series) return;
        
        setLoading(true);
        try {
            const client = new StalkerClient({ mac: macAddress, url: portalUrl });
            const seasonsData = await client.getSeriesSeasons(series.id);
            console.log('[SeriesModal] Loaded seasons:', seasonsData);
            setSeasons(seasonsData);
        } catch (error) {
            console.error('[SeriesModal] Failed to load seasons:', error);
        } finally {
            setLoading(false);
        }
    }, [macAddress, portalUrl, series]);

    useEffect(() => {
        if (isOpen && series) {
            loadSeasons();
        }
    }, [isOpen, series, loadSeasons]);

    const handleSeasonClick = async (season: any) => {
        if (!macAddress || !portalUrl) return;
        
        setSelectedSeason(season);
        setView('episodes');
        setLoading(true);
        try {
            const client = new StalkerClient({ mac: macAddress, url: portalUrl });
            const { data } = await client.getSeriesEpisodes(series.id, season.id, 1);
            console.log('[SeriesModal] Loaded episodes:', data);
            setEpisodes(data);
        } catch (error) {
            console.error('[SeriesModal] Failed to load episodes:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleEpisodeClick = async (episode: any) => {
        if (!macAddress || !portalUrl) return;
        
        setLoading(true);
        try {
            const client = new StalkerClient({ mac: macAddress, url: portalUrl });
            console.log('[SeriesModal] Getting file info for episode:', episode.id);
            
            // Get file info with movie_id, season_id, and episode_id
            const fileInfo = await client.getSeriesFileInfo(series.id, selectedSeason.id, episode.id);
            console.log('[SeriesModal] File info:', fileInfo);
            
            if (fileInfo && fileInfo.id) {
                // Construct the file path with file_ prefix
                const filePath = `/media/file_${fileInfo.id}.mpg`;
                console.log('[SeriesModal] Constructed file path:', filePath);
                
                // Get stream URL with series=1 parameter
                const url = await client.getStreamUrl(filePath, 'series');
                console.log('[SeriesModal] Stream URL:', url);
                
                const title = `${series.name} - ${selectedSeason.name || 'Season ' + selectedSeason.id} - ${episode.name}`;
                
                // Combine series and episode data for player display
                const episodeData = {
                    ...episode,
                    seriesName: series.name,
                    seasonName: selectedSeason.name || 'Season ' + selectedSeason.id,
                    description: episode.description || series.description
                };
                
                onEpisodeSelect(url, title, episodeData);
                onClose();
            } else {
                console.error('[SeriesModal] No file info found for episode');
            }
        } catch (error) {
            console.error('[SeriesModal] Failed to play episode:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        setView('seasons');
        setSelectedSeason(null);
        setEpisodes([]);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex items-start justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{series.name}</h2>
                        {view === 'episodes' && selectedSeason && (
                            <p className="text-zinc-400 mt-1">
                                {selectedSeason.season_name || selectedSeason.name || `Season ${selectedSeason.season_number}`}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white transition"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Navigation */}
                {view === 'episodes' && (
                    <div className="px-6 py-3 border-b border-zinc-800">
                        <button
                            onClick={handleBack}
                            className="text-sm text-zinc-400 hover:text-white transition"
                        >
                            ← Back to Seasons
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loading ? (
                        <div className="text-center py-12 text-zinc-400">Loading...</div>
                    ) : view === 'seasons' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                            {seasons.map((season) => (
                                <button
                                    key={season.id}
                                    onClick={() => handleSeasonClick(season)}
                                    className="bg-zinc-800 hover:bg-zinc-700 rounded-lg p-4 text-left transition"
                                >
                                    <div className="text-white font-semibold">
                                        {season.season_name || season.name || `Season ${season.season_number || season.id}`}
                                    </div>
                                    {season.series && (
                                        <div className="text-sm text-zinc-400 mt-1">
                                            {season.series.length} episodes
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {episodes.map((episode) => (
                                <button
                                    key={episode.id}
                                    onClick={() => handleEpisodeClick(episode)}
                                    className="w-full bg-zinc-800 hover:bg-zinc-700 rounded-lg p-4 text-left transition flex items-start gap-4"
                                >
                                    <div className="shrink-0 bg-zinc-700 rounded w-16 h-16 flex items-center justify-center text-white font-bold">
                                        {episode.series_number || episode.id}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-semibold">
                                            {episode.name}
                                        </div>
                                        {episode.series_name && (
                                            <div className="text-sm text-zinc-400 mt-1">
                                                {episode.series_name}
                                            </div>
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
