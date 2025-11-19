'use client';

import { useAuthStore } from '@/lib/store';
import ContentRow from '@/components/ContentRow';
import { SearchBar } from '@/components/SearchBar';
import { StalkerClient } from '@/lib/stalker-client';
import LoginForm from '@/components/LoginForm';
import { useEffect, useState, useRef } from 'react';
import { verifyPassword } from '@/lib/auth';

export default function Home() {
  const { isAuthenticated, macAddress, portalUrl, categories, channels, setCredentials, setSession, setCategories } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [defaultStreamUrl, setDefaultStreamUrl] = useState<string | null>(null);
  const [defaultChannelName, setDefaultChannelName] = useState<string>('Loading...');
  const [currentItem, setCurrentItem] = useState<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'channels' | 'movies' | 'series'>('channels');
  const [movieCategories, setMovieCategories] = useState<Array<{ id: string; title: string }>>([]);
  const [seriesCategories, setSeriesCategories] = useState<Array<{ id: string; title: string }>>([]);
  
  // Selected category state for each tab
  const [selectedChannelCategory, setSelectedChannelCategory] = useState<string>('');
  const [selectedMovieCategory, setSelectedMovieCategory] = useState<string>('');
  const [selectedSeriesCategory, setSelectedSeriesCategory] = useState<string>('');
  
  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleChannelChange = (url: string, name: string, item?: any) => {
    setDefaultStreamUrl(url);
    setDefaultChannelName(name);
    setCurrentItem(item || null);
    // Reset and play new stream
    if (videoRef.current) {
      videoRef.current.src = url;
      setTimeout(() => {
        try {
          videoRef.current!.muted = true;
          videoRef.current!.play();
          videoRef.current!.muted = false;
        } catch (err) {
          console.log('Play failed:', err);
        }
      }, 200);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    // Only search if query is at least 2 characters
    if (query.trim().length < 2) {
      return;
    }
    
    if (!macAddress || !portalUrl) return;
    
    setIsSearching(true);
    try {
      const client = new StalkerClient({ mac: macAddress, url: portalUrl });
      const { data } = await client.searchContent(query, 1);
      console.log('[Search] Results:', data);
      
      // Show all results, no filtering by tab
      setSearchResults(data);
    } catch (error) {
      console.error('[Search] Failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogin = async (password: string) => {
    try {
      console.log('Verifying password...');
      const isValid = await verifyPassword(password);
      console.log('Password verification result:', isValid);
      
      if (isValid) {
        setIsLoggedIn(true);
        // Store in sessionStorage to persist across page reloads
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('iptv_logged_in', 'true');
        }
      } else {
        alert('Incorrect password');
      }
    } catch (error) {
      console.error('Password verification error:', error);
      alert('Authentication error occurred');
    }
  };

  // Check if already logged in from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loggedIn = sessionStorage.getItem('iptv_logged_in');
      if (loggedIn === 'true') {
        setIsLoggedIn(true);
      }
    }
  }, []);

  // Auto-authenticate with environment variables
  useEffect(() => {
    if (!isAuthenticated && isLoggedIn) {
      const autoAuth = async () => {
        try {
          const credentials = {
            mac: process.env.NEXT_PUBLIC_STALKER_MAC || '',
            url: process.env.NEXT_PUBLIC_STALKER_URL || ''
          };
          
          const client = new StalkerClient(credentials);
          await client.handshake();
          
          setCredentials(credentials.mac, credentials.url);
          setSession(
            process.env.NEXT_PUBLIC_STALKER_BEARER || '',
            Date.now() + 86400000
          );
        } catch (error) {
          console.error("Auto-authentication failed", error);
        }
      };
      autoAuth();
    }
  }, [isAuthenticated, isLoggedIn, setCredentials, setSession]);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch categories on load
  useEffect(() => {
    if (isAuthenticated && macAddress && portalUrl && isLoggedIn) {
      const fetchAllCategories = async () => {
        try {
          const client = new StalkerClient({ mac: macAddress, url: portalUrl });

          // 1. Fetch TV Categories
          const cats = await client.getCategories();
          
          if (!cats || !Array.isArray(cats)) {
             console.error("Invalid categories response", cats);
             return;
          }
          
          // Filter out censored and dvb categories
          const filteredCats = cats.filter((cat: { censored?: number; id: string }) => cat.censored !== 1 && cat.id !== 'dvb');
          setCategories(filteredCats);
          if (filteredCats.length > 0) {
            setSelectedChannelCategory(filteredCats[0].id);
          }

          // 2. Fetch VOD Categories (includes both movies and series)
          const allVodCats = await client.getMovieCategories();
          if (allVodCats && Array.isArray(allVodCats)) {
            // Don't filter out adult content - let user decide what to watch
            const safeVodCats = allVodCats;
            
            // Exact series genre strings to identify series categories
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
            
            const seriesCats = safeVodCats.filter((cat: { title: string }) => {
              return seriesGenres.includes(cat.title);
            });
            
            const movieCats = safeVodCats.filter((cat: { title: string }) => {
              return !seriesGenres.includes(cat.title);
            });
            
            // Set movie categories
            setMovieCategories(movieCats);
            if (movieCats.length > 0) {
              setSelectedMovieCategory(movieCats[0].id);
            }
            
            // Set series categories
            setSeriesCategories(seriesCats);
            if (seriesCats.length > 0) {
              setSelectedSeriesCategory(seriesCats[0].id);
            }
          }
        } catch (error) {
          console.error("Failed to fetch categories", error);
        }
      };
      fetchAllCategories();
    }
  }, [isAuthenticated, macAddress, portalUrl, isLoggedIn, setCategories]);

  // Don't auto-play anymore - only play when user clicks

  // Force play when stream URL is set (with muted+unmuted strategy for autoplay)
  useEffect(() => {
    if (defaultStreamUrl && videoRef.current) {
      const playVideo = async () => {
        try {
          // First try with muted (always allowed)
          videoRef.current!.muted = true;
          await videoRef.current!.play();
          // Then unmute after play starts
          videoRef.current!.muted = false;
        } catch (err) {
          console.log('Play failed:', err);
        }
      };
      // Try to play after source is loaded
      setTimeout(playVideo, 500);
    }
  }, [defaultStreamUrl]);

  if (!mounted) return null;

  if (!isLoggedIn) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <main className="transition-all duration-300">
        {/* Tab Navigation with Search */}
        <div className="sticky top-0 z-40 bg-black/95 backdrop-blur-sm border-b border-zinc-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-8">
                <button
                  onClick={() => {
                    setActiveTab('channels');
                    setDefaultStreamUrl(null);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'channels'
                      ? 'text-white border-b-2 border-red-500'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Channels
                </button>
                <button
                  onClick={() => {
                    setActiveTab('movies');
                    setDefaultStreamUrl(null);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'movies'
                      ? 'text-white border-b-2 border-red-500'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Movies
                </button>
                <button
                  onClick={() => {
                    setActiveTab('series');
                    setDefaultStreamUrl(null);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className={`px-4 py-3 font-semibold transition ${
                    activeTab === 'series'
                      ? 'text-white border-b-2 border-red-500'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Series
                </button>
              </div>

              {/* Search and Logout - Top Right */}
              <div className="flex items-center gap-4">
                {/* Search - Desktop only */}
                {(activeTab === 'movies' || activeTab === 'series') && (
                  <div className="hidden lg:flex items-center gap-2">
                    <div className="w-96">
                      <SearchBar onSearch={handleSearch} onQueryChange={handleSearch} />
                    </div>
                  </div>
                )}
                
                {/* Logout Button */}
                <button
                  onClick={() => {
                    setIsLoggedIn(false);
                    if (typeof window !== 'undefined') {
                      sessionStorage.removeItem('iptv_logged_in');
                    }
                  }}
                  className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition border border-zinc-700 rounded-lg hover:border-zinc-500"
                >
                  Logout
                </button>
              </div>
            </div>
            
            {/* Search - Below Tabs (Mobile/Tablet only) */}
            {(activeTab === 'movies' || activeTab === 'series') && (
              <div className="lg:hidden mt-3">
                <SearchBar 
                  onSearch={handleSearch} 
                  onQueryChange={handleSearch}
                />
              </div>
            )}
          </div>
        </div>

        {/* Category Dropdown Section */}
        {!searchQuery && (
          <div className="w-full bg-black/95 backdrop-blur-sm pt-4 pb-4 border-b border-zinc-800">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              {activeTab === 'channels' && categories.length > 0 && (
                <div className="mb-0">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Select Channel Category</label>
                  <select
                    value={selectedChannelCategory}
                    onChange={(e) => setSelectedChannelCategory(e.target.value)}
                    className="w-full max-w-md px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeTab === 'movies' && movieCategories.length > 0 && (
                <div className="mb-0">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Select Movie Category</label>
                  <select
                    value={selectedMovieCategory}
                    onChange={(e) => setSelectedMovieCategory(e.target.value)}
                    className="w-full max-w-md px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {movieCategories.map((category: { id: string; title: string }) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {activeTab === 'series' && seriesCategories.length > 0 && (
                <div className="mb-0">
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Select Series Category</label>
                  <select
                    value={selectedSeriesCategory}
                    onChange={(e) => setSelectedSeriesCategory(e.target.value)}
                    className="w-full max-w-md px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    {seriesCategories.map((category: { id: string; title: string }) => (
                      <option key={category.id} value={category.id}>
                        {category.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Player Section - Below Dropdown */}
        {defaultStreamUrl && (
          <div className="w-full bg-black/95 backdrop-blur-sm pt-4 pb-4 border-b border-zinc-800">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <div className="relative w-full h-80 overflow-hidden rounded-lg bg-zinc-900 shadow-2xl">
                <video
                  ref={videoRef}
                  key={defaultStreamUrl}
                  className="h-full w-full bg-black"
                  controls
                  controlsList="nodownload"
                >
                  <source src={defaultStreamUrl} type="application/x-mpegURL" />
                  Your browser does not support the video tag.
                </video>
              </div>
              <div className="mt-3">
                <p className="text-sm text-zinc-400 text-center">Now Playing: {defaultChannelName}</p>
                {currentItem?.description && (
                  <p className="mt-2 text-xs text-zinc-500 text-center max-w-3xl mx-auto">
                    {currentItem.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Content Sections */}
        <div className="relative z-20 bg-linear-to-t from-black via-black to-transparent pb-20 pt-12">
          {/* Search Results */}
          {searchQuery && (activeTab === 'movies' || activeTab === 'series') && (
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 mb-12">
              <h2 className="text-2xl font-bold text-white mb-6">
                Search Results for &quot;{searchQuery}&quot;
                {!isSearching && <span className="text-zinc-400 text-lg ml-2">({searchResults.length} found)</span>}
              </h2>
              {isSearching ? (
                <div className="text-center py-12 text-zinc-400">Searching...</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-zinc-400">No results found</div>
              ) : (
                <ContentRow
                  key={`search-${searchQuery}`}
                  categoryId="search"
                  title=""
                  items={searchResults}
                  contentType="vod"
                  onChannelSelect={handleChannelChange}
                />
              )}
            </div>
          )}

          {/* Channels Tab */}
          {activeTab === 'channels' && !searchQuery && selectedChannelCategory && (
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              {(
                <ContentRow
                  key={selectedChannelCategory}
                  categoryId={selectedChannelCategory}
                  title={categories.find(c => c.id === selectedChannelCategory)?.title || ''}
                  items={channels[selectedChannelCategory] || []}
                  contentType="itv"
                  onChannelSelect={handleChannelChange}
                />
              )}
            </div>
          )}

          {/* Movies Tab */}
          {activeTab === 'movies' && !searchQuery && selectedMovieCategory && (
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <ContentRow
                key={selectedMovieCategory}
                categoryId={selectedMovieCategory}
                title={movieCategories.find((c: { id: string; title: string }) => c.id === selectedMovieCategory)?.title || ''}
                items={[]}
                contentType="vod"
                onChannelSelect={handleChannelChange}
              />
            </div>
          )}

          {/* Series Tab */}
          {activeTab === 'series' && !searchQuery && selectedSeriesCategory && (
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
              <ContentRow
                key={selectedSeriesCategory}
                categoryId={selectedSeriesCategory}
                title={seriesCategories.find((c: { id: string; title: string }) => c.id === selectedSeriesCategory)?.title || ''}
                items={[]}
                contentType="series"
                onChannelSelect={handleChannelChange}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
