'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';

export default function WatchPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [channelName, setChannelName] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [error, setError] = useState<string>('');
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        const streamUrl = searchParams.get('url');
        const name = searchParams.get('name');

        if (!streamUrl) {
            return;
        }

        setChannelName(name || 'Unknown Channel');

        if (!videoRef.current) return;

        // Set source and try to play
        videoRef.current.src = streamUrl;
        videoRef.current.load();
        
        videoRef.current.play().catch(() => {
            console.log('⚠️ Autoplay blocked by browser');
        });

        const handleError = () => {
            setError('Failed to load stream');
        };

        videoRef.current.addEventListener('error', handleError);

        return () => {
            videoRef.current?.removeEventListener('error', handleError);
        };
    }, [searchParams]);

    const handlePlayPause = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause();
            } else {
                videoRef.current.play().catch(err => {
                    console.error('Play error:', err);
                });
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleMuteToggle = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    const handleFullscreen = () => {
        if (videoRef.current?.requestFullscreen) {
            videoRef.current.requestFullscreen().catch(err => {
                console.error('Fullscreen error:', err);
            });
        }
    };

    const progressPercent = duration ? (currentTime / duration) * 100 : 0;

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Header */}
            <div className="flex items-center justify-between bg-black/80 backdrop-blur-sm px-6 py-4 z-50">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 hover:text-red-500 transition"
                >
                    <ArrowLeft size={24} />
                    <span>{channelName}</span>
                </button>
                <span className="text-sm text-zinc-400">Live</span>
            </div>

            {/* Video Player Container */}
            <div className="flex items-center justify-center w-full h-[calc(100vh-80px)] bg-black relative group">
                {error ? (
                    <div className="text-center space-y-4">
                        <div className="text-red-500 text-lg">{error}</div>
                        <button
                            onClick={() => router.back()}
                            className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition"
                        >
                            Go Back
                        </button>
                    </div>
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain"
                            onPlay={() => setIsPlaying(true)}
                            onPause={() => setIsPlaying(false)}
                            onTimeUpdate={() => {
                                if (videoRef.current) {
                                    setCurrentTime(videoRef.current.currentTime);
                                }
                            }}
                            onLoadedMetadata={() => {
                                if (videoRef.current) {
                                    setDuration(videoRef.current.duration);
                                }
                            }}
                            onError={() => {
                                setError('Failed to load stream');
                            }}
                            crossOrigin="anonymous"
                        />

                        {/* Custom Controls */}
                        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black via-black/50 to-transparent p-6 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            {/* Progress Bar */}
                            <div className="mb-4">
                                <input
                                    type="range"
                                    min="0"
                                    max={duration || 0}
                                    value={currentTime}
                                    onChange={(e) => {
                                        if (videoRef.current) {
                                            videoRef.current.currentTime = parseFloat(e.target.value);
                                        }
                                    }}
                                    className="w-full h-1 bg-zinc-600 rounded-full cursor-pointer appearance-none"
                                    style={{
                                        background: `linear-gradient(to right, rgb(220, 38, 38) 0%, rgb(220, 38, 38) ${progressPercent}%, rgb(39, 39, 42) ${progressPercent}%, rgb(39, 39, 42) 100%)`,
                                    }}
                                />
                            </div>

                            {/* Control Buttons */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <button
                                        onClick={handlePlayPause}
                                        className="flex items-center justify-center w-10 h-10 bg-red-600 hover:bg-red-700 rounded-full transition"
                                    >
                                        {isPlaying ? (
                                            <Pause size={20} fill="currentColor" />
                                        ) : (
                                            <Play size={20} fill="currentColor" />
                                        )}
                                    </button>

                                    <button
                                        onClick={handleMuteToggle}
                                        className="text-white hover:text-red-500 transition"
                                    >
                                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                                    </button>

                                    <span className="text-sm text-zinc-300">
                                        {Math.floor(currentTime)}s / Live
                                    </span>
                                </div>

                                <button
                                    onClick={handleFullscreen}
                                    className="text-white hover:text-red-500 transition"
                                >
                                    <Maximize size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Center Play Button (when paused) */}
                        {!isPlaying && (
                            <button
                                onClick={handlePlayPause}
                                className="absolute flex items-center justify-center w-20 h-20 bg-red-600 hover:bg-red-700 rounded-full transition opacity-0 group-hover:opacity-100"
                            >
                                <Play size={48} fill="currentColor" />
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Info Panel */}
            {!error && (
                <div className="bg-zinc-900 px-6 py-4">
                    <h1 className="text-2xl font-bold">{channelName}</h1>
                    <p className="text-zinc-400 mt-2">Now playing live stream</p>
                </div>
            )}
        </div>
    );
}
