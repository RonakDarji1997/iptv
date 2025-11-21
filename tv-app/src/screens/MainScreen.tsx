import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Dimensions,
  Platform,
  // TVEventHandler is imported dynamically below (avoid TypeScript export mismatch)
} from 'react-native';
import { FocusableCard } from '../components/FocusableCard';
import { TVGrid } from '../components/TVGrid';
import { ChannelRow } from '../components/ChannelRow';
import { ApiClient } from '../lib/api-client';
import { useAuthStore } from '../lib/store';
import { getFullImageUrl } from '../lib/image-utils';
import { PlayerScreen } from './PlayerScreen';

interface MainScreenProps {
  navigation: any;
}

type ContentType = 'live' | 'movies' | 'series';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function MainScreen({ navigation }: MainScreenProps) {
  const [playerContent, setPlayerContent] = useState<any>(null);
  const { macAddress, portalUrl } = useAuthStore();
  const [apiClient, setApiClient] = useState<ApiClient | null>(null);

  // Initialize API client when credentials are available
  useEffect(() => {
    if (macAddress && portalUrl) {
      setApiClient(new ApiClient({ mac: macAddress, url: portalUrl }));
    }
  }, [macAddress, portalUrl]);

  // Navigation state - start with 'live' as default
  const [selectedTab, setSelectedTab] = useState<ContentType>('live');
  // Hovered navigation tab (what the cursor is currently on in the left bar).
  // Moving up/down inside the nav should only change the hover (visual),
  // and a CENTER/press will *activate* the tab (change selectedTab).
  const [navHoverTab, setNavHoverTab] = useState<ContentType>('live');
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('*');
  
  // Content state
  const [content, setContent] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Which UI region currently holds focus (used for layout adjustments)
  // Start with focus on 'grid' so first channel gets focus immediately
  const [focusRegion, setFocusRegion] = useState<'nav' | 'categories' | 'grid' | 'header'>('grid');
  const navCollapsed = focusRegion !== 'nav';

  // When a live channel is "selected" we will show a preview (not autoplay).
  const [selectedPreview, setSelectedPreview] = useState<any | null>(null);
  // Index of the currently *focused* item in the grid (native focus).
  const [gridFocusedIndex, setGridFocusedIndex] = useState<number | null>(0);
  // Index of the hard-selected channel (shows teal dot) - DEPRECATED in favor of ID check
  // const [hardSelectedIndex, setHardSelectedIndex] = useState<number | null>(null);

  // Floating cursor index: when focus is outside the grid we still keep a
  // visible "floating" cursor that follows remote up/down. Pressing the
  // center/select button when floating will confirm and move native focus
  // into the grid at this index.
  const [gridFloatingIndex, setGridFloatingIndex] = useState<number | null>(0);
  // Floating cursor for category list (when focus is not actively inside
  // the categories column). This lets the user see where their cursor will
  // land if they press CENTER/SELECT while the categories column is targeted
  // but not natively focused.
  const [categoryFloatingIndex, setCategoryFloatingIndex] = useState<number | null>(0);
  const tvGridRef = useRef<any>(null);

  // TV remote event handling - listen for dpad events and implement a
  // "floating cursor" behavior. We use dynamic require for TVEventHandler
  // to avoid type compatibility issues with some TypeScript configs.
  useEffect(() => {
    if (!Platform.isTV) return;

    // Dynamic require so TypeScript doesn't complain in non-TV builds.
    // Some react-native builds (or platforms) may not export TVEventHandler;
    // guard against that so we don't call `new undefined()` which throws
    // "Cannot read property 'prototype' of undefined".
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require('react-native');
    const TVEventHandler = RN && (RN as any).TVEventHandler;
    if (!TVEventHandler) return; // no TV events available on this platform

    const handler = new TVEventHandler();

    const onTvEvent = (evt: any) => {
      if (!evt || !evt.eventType) return;
      const type = evt.eventType;
      console.log('[MainScreen] TV Event:', type, 'focusRegion:', focusRegion);

      // Right from the collapsed nav should move to categories
      if (type === 'right') {
        if (focusRegion === 'nav') {
          setFocusRegion('categories');
          // Set floating cursor to match the selected category initially (no dot shown)
          const selectedIndex = categories.findIndex(c => c.id === selectedCategory);
          setCategoryFloatingIndex(selectedIndex >= 0 ? selectedIndex : 0);
          return;
        }

        // If we're on categories and press right -> move to grid (floating)
        if (focusRegion === 'categories') {
          setFocusRegion('grid');
          // programmatically focus whatever floating index (category -> grid)
          // For categories we want to focus the first item in grid or keep
          // consistent mapping: if there's a floating index we try to use that
          // as the starting grid index (0 fallback).
          const idx = gridFloatingIndex ?? 0;
          if (tvGridRef.current && idx != null) {
            tvGridRef.current.focusIndex(idx);
          }
          return;
        }
      }

      if (type === 'left') {
        // Left from ANY region should move one level back
        // Grid -> Categories -> Nav
        if (focusRegion === 'grid') {
          console.log('[MainScreen] LEFT pressed in grid, moving to categories');
          setFocusRegion('categories');
          // Reset to selected category index when coming back from grid
          const selectedIndex = categories.findIndex(c => c.id === selectedCategory);
          setCategoryFloatingIndex(selectedIndex >= 0 ? selectedIndex : 0);
          // Prevent default navigation
          evt.stopPropagation?.();
          return;
        }
        
        if (focusRegion === 'categories') {
          console.log('[MainScreen] LEFT pressed in categories, moving to nav');
          setFocusRegion('nav');
          // when returning to the nav, show the currently selected tab
          setNavHoverTab(selectedTab);
          // Reset floating cursor to match selected category
          const selectedIndex = categories.findIndex(c => c.id === selectedCategory);
          setCategoryFloatingIndex(selectedIndex >= 0 ? selectedIndex : 0);
          evt.stopPropagation?.();
          return;
        }
      }

      // Floating up/down behavior is now handled by native focus events (onFocus)
      // to avoid conflicts between TVEventHandler and native focus engine.
      // We only handle region switching (Left/Right) and Selection here.

      // Pressing CENTER/select when we're not in grid should move focus
      // into the grid and programmatically focus the floating index.
      if (type === 'select' && focusRegion !== 'grid') {
        if (focusRegion === 'nav') {
          // activate the hovered nav item
          setSelectedTab(navHoverTab);
          setFocusRegion('categories');
          // reset/focus first category
          setCategoryFloatingIndex(0);
          return;
        }

        if (focusRegion === 'categories') {
          // Confirm the category under the floating cursor and open the grid
          const catIdx = categoryFloatingIndex ?? 0;
          const cat = categories[catIdx];
          if (cat) {
            setSelectedCategory(cat.id);
          }
          // move focus to grid and focus the first grid item
          setFocusRegion('grid');
          if (tvGridRef.current) {
            tvGridRef.current.focusIndex(0);
          }
          return;
        }

        // fallback: treat as grid confirm
        const idx = gridFloatingIndex ?? gridFocusedIndex ?? 0;
        if (tvGridRef.current && idx != null) {
          tvGridRef.current.focusIndex(idx);
          setFocusRegion('grid');
        }
      }
    };

    handler.enable(null, onTvEvent);

    return () => {
      try { handler.disable(); } catch (e) { /* ignore */ }
    };
  }, [focusRegion, gridFloatingIndex, gridFocusedIndex, content, categories, selectedCategory, selectedTab, navHoverTab]);

  useEffect(() => {
    console.log('[MainScreen] focusRegion=', focusRegion, 'selectedTab=', selectedTab, 'selectedCategory=', selectedCategory);
  }, [focusRegion, selectedTab, selectedCategory]);

  // Load categories when tab changes or API client is ready
  useEffect(() => {
    if (apiClient) {
      loadCategories();
    }
  }, [selectedTab, apiClient]);

  // TV event debugging was temporarily added but caused a render issue on reload.
  // Removed to restore stable behavior. If we want to re-add a safe logger:
  // - add it behind a robust Platform.isTV guard
  // - avoid requiring private paths directly
  // - or add an isolated debug screen instead of mixing into MainScreen

  // Load content when category changes
  useEffect(() => {
    if (selectedCategory && apiClient) {
      // Reset grid cursor immediately when category changes to ensure
      // we start at the top of the new list.
      setGridFloatingIndex(0);
      setGridFocusedIndex(0);
      loadContent(1);
    }
  }, [selectedCategory, apiClient]);

  // Auto-focus first channel when content loads
  useEffect(() => {
    if (content.length > 0 && tvGridRef.current && focusRegion === 'grid') {
      // Small delay to ensure grid is rendered
      setTimeout(() => {
        tvGridRef.current?.focusIndex(0);
      }, 100);
    }
  }, [content.length]);

  const loadCategories = async () => {
    if (!apiClient) {
      console.log('[MainScreen] No API client available yet');
      return;
    }
    
    try {
      console.log('[MainScreen] Loading categories for tab:', selectedTab);
      setLoading(true);
      
      if (selectedTab === 'live') {
        const result = await apiClient.getGenres();
        console.log('[MainScreen] Loaded live categories:', result.genres.length);
        setCategories(result.genres);
        setSelectedCategory(result.genres[0]?.id || '*');
        setCategoryFloatingIndex(0);
      } else if (selectedTab === 'movies') {
        const result = await apiClient.getMovieCategories();
        const filteredCategories = result.categories.filter((cat: any) => 
          cat.id !== '*' && cat.title?.toLowerCase() !== 'all'
        );
        console.log('[MainScreen] Loaded movie categories:', filteredCategories.length);
        setCategories(filteredCategories);
        setSelectedCategory(filteredCategories[0]?.id || '*');
        setCategoryFloatingIndex(0);
      } else if (selectedTab === 'series') {
        const result = await apiClient.getSeriesCategories();
        const filteredCategories = result.categories.filter((cat: any) => 
          cat.id !== '*' && cat.title?.toLowerCase() !== 'all'
        );
        console.log('[MainScreen] Loaded series categories:', filteredCategories.length);
        setCategories(filteredCategories);
        setSelectedCategory(filteredCategories[0]?.id || '*');
        setCategoryFloatingIndex(0);
      }
    } catch (error) {
      console.error('[MainScreen] Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadContent = async (pageNum: number) => {
    if (!apiClient) {
      console.log('[MainScreen] No API client for loading content');
      return;
    }
    
    try {
      console.log('[MainScreen] Loading content for:', selectedTab, 'category:', selectedCategory, 'page:', pageNum);
      setLoading(true);

      if (selectedTab === 'live') {
        const result = await apiClient.getChannels(selectedCategory, pageNum);
        if (pageNum === 1) {
          setContent(result.channels.data);
          // reset focused + floating indices for new lists
          setGridFocusedIndex(0);
          setGridFloatingIndex(0);
          // Select first channel by default so it's not just "hovered" (black) but "active" (grey)
          if (result.channels.data.length > 0) {
            setSelectedPreview(result.channels.data[0]);
          } else {
            setSelectedPreview(null);
          }
        } else {
          setContent(prev => [...prev, ...result.channels.data]);
        }
        setHasMore(result.channels.data.length > 0);
      } else if (selectedTab === 'movies') {
        const result = await apiClient.getMovies(selectedCategory, pageNum);
        // Filter out series - only show actual movies
        const filteredMovies = result.items.data.filter((item: any) => 
          item.is_series !== '1' && item.is_series !== 1
        );
        
        if (pageNum === 1) {
          setContent(filteredMovies);
          setGridFocusedIndex(0);
          setGridFloatingIndex(0);
        } else {
          setContent(prev => [...prev, ...filteredMovies]);
        }
        setHasMore(result.items.data.length > 0);
      } else if (selectedTab === 'series') {
        const result = await apiClient.getSeries(selectedCategory, pageNum);
        // Filter to only show series
        const filteredSeries = result.items.data.filter((item: any) => 
          item.is_series === '1' || item.is_series === 1
        );
        
        if (pageNum === 1) {
          setContent(filteredSeries);
          setGridFocusedIndex(0);
          setGridFloatingIndex(0);
        } else {
          setContent(prev => [...prev, ...filteredSeries]);
        }
        setHasMore(result.items.data.length > 0);
      }

      setPage(pageNum);
    } catch (error) {
      console.error('Failed to load content:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleContentSelect = async (item: any) => {
    if (!apiClient) return;

    // For live channels we only preview on CENTER press (don't play immediately).
    if (selectedTab === 'live') {
      // We no longer use hardSelectedIndex (index-based) because it causes
      // ghost selections when changing categories. We rely on selectedPreview.id
      // in renderItem instead.
      setSelectedPreview(item);
      return;
    }

    // For movies/series keep the existing behavior (open player)
    if (selectedTab === 'movies') {
      try {
        const movieInfo = await apiClient.getMovieInfo(item.id);
        setPlayerContent({
          id: item.id,
          title: item.name,
          type: 'movie',
          cmd: movieInfo.cmd,
        });
      } catch (error) {
        console.error('Failed to get movie info:', error);
      }
    } else if (selectedTab === 'series') {
      // TODO: Show series details screen
      console.log('Series selected:', item);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadContent(page + 1);
    }
  };

  const handleTabChange = (tab: ContentType) => {
    setSelectedTab(tab);
    setContent([]);
    setPage(1);
  };

  const getContentImageUrl = (item: any) => {
    if (selectedTab === 'live') {
      return getFullImageUrl(item.logo);
    }
    return getFullImageUrl(item.screenshot_uri || item.poster);
  };

  const getContentSubtitle = (item: any) => {
    if (selectedTab === 'live') {
      return `#${item.number}`;
    }
    return item.year || '';
  };

  // Show error if credentials are missing
  if (!macAddress || !portalUrl) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <Text style={{ color: '#ef4444', fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
          Missing Configuration
        </Text>
        <Text style={{ color: '#999', fontSize: 14 }}>
          Please configure MAC address and portal URL
        </Text>
      </View>
    );
  }

  // Show player if content is selected
  if (playerContent) {
    return (
      <PlayerScreen
        route={{
          params: playerContent,
        }}
        navigation={{
          goBack: () => setPlayerContent(null),
        }}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Main Navigation Sidebar */}
      <View style={[styles.mainSidebar, focusRegion !== 'nav' && styles.mainSidebarCompact]}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>tivi</Text>
          <Text style={[styles.logoText, { color: '#ffffff' }]}>mate</Text>
        </View>

        <View style={styles.mainNav}>
          <TouchableOpacity
            style={[styles.mainNavItem, navHoverTab === 'live' && styles.mainNavItemActive, navCollapsed && styles.mainNavItemCompact]}
            onPress={() => {
              console.log('[MainScreen] TV tab pressed (activate)');
              setSelectedTab('live');
              setFocusRegion('categories');
              // Let categories (loadCategories) handle selectedCategory
            }}
            hasTVPreferredFocus={focusRegion === 'nav' && navHoverTab === 'live'}
            onFocus={() => {
              console.log('[MainScreen] TV tab focused (hover)');
              setFocusRegion('nav');
              setNavHoverTab('live');
            }}
          >
            <Text style={[styles.mainNavIcon, navCollapsed && styles.mainNavIconCompact]}>📺</Text>
            {focusRegion === 'nav' ? (
              <Text style={[styles.mainNavText, selectedTab === 'live' && styles.mainNavTextActive]}>TV</Text>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainNavItem, navHoverTab === 'movies' && styles.mainNavItemActive, navCollapsed && styles.mainNavItemCompact]}
            onPress={() => {
              console.log('[MainScreen] Movies tab pressed (activate)');
              setSelectedTab('movies');
              setFocusRegion('categories');
            }}
            hasTVPreferredFocus={focusRegion === 'nav' && navHoverTab === 'movies'}
            onFocus={() => {
              setFocusRegion('nav');
              setNavHoverTab('movies');
              console.log('[MainScreen] Movies tab focused (hover)');
            }}
          >
            <Text style={[styles.mainNavIcon, navCollapsed && styles.mainNavIconCompact]}>🎬</Text>
            {focusRegion === 'nav' ? (
              <Text style={[styles.mainNavText, selectedTab === 'movies' && styles.mainNavTextActive]}>Movies</Text>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mainNavItem, navHoverTab === 'series' && styles.mainNavItemActive, navCollapsed && styles.mainNavItemCompact]}
            onPress={() => {
              console.log('[MainScreen] Shows tab pressed (activate)');
              setSelectedTab('series');
              setFocusRegion('categories');
            }}
            hasTVPreferredFocus={focusRegion === 'nav' && navHoverTab === 'series'}
            onFocus={() => {
              setFocusRegion('nav');
              setNavHoverTab('series');
              console.log('[MainScreen] Shows tab focused (hover)');
            }}
          >
            <Text style={[styles.mainNavIcon, navCollapsed && styles.mainNavIconCompact]}>📺</Text>
            {focusRegion === 'nav' ? (
              <Text style={[styles.mainNavText, selectedTab === 'series' && styles.mainNavTextActive]}>Shows</Text>
            ) : null}
          </TouchableOpacity>

        </View>
      </View>

      {/* Category Sidebar */}
      <View style={styles.categorySidebar}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryHeaderText}>
            {selectedTab === 'live' ? 'All playlists' : selectedTab === 'movies' ? 'Categories' : 'Series Categories'}
          </Text>
        </View>

        <ScrollView style={styles.categoryList} showsVerticalScrollIndicator={false}>
            {categories.map((category, index) => {
              const isSelected = selectedCategory === category.id;
              // Show focused style if this is the current cursor position in categories
              // (either actively focused or floating cursor)
              const isFocused = (focusRegion === 'categories' && categoryFloatingIndex === index) || 
                                (focusRegion !== 'categories' && categoryFloatingIndex === index);
              
              // If we are not in categories region, we might not want to show the "floating" cursor 
              // if it's just confusing. But user said "floating doesnt show" before.
              // However, usually if I am in Grid, I want to see the Selected Category (Black).
              // If I am in Categories, I want to see the Focused Category (Grey).
              // Let's refine:
              // - Active (Black): Always shows for the selected category.
              // - Focused (Grey): Shows when I am navigating in categories.
              
              const showFocused = focusRegion === 'categories' && categoryFloatingIndex === index;

              return (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.categoryItem,
                showFocused && styles.categoryItemFocused,
                isSelected && styles.categoryItemActive,
              ]}
                  // Make the categories receive initial preferred focus when the
                  // categories region is active — prefer the floating index (last position)
                  // or fallback to 0.
                  hasTVPreferredFocus={focusRegion === 'categories' && (categoryFloatingIndex === index)}
                focusable={true}
              onPress={() => {
                console.log('[MainScreen] Category pressed:', category.title || category.name);
                setSelectedCategory(category.id);
              }}
              onFocus={() => {
                console.log('[MainScreen] Category focused:', category.title || category.name);
                setFocusRegion('categories');
                setCategoryFloatingIndex(index);
              }}
            >
              <Text style={[
                styles.categoryText,
                isSelected && styles.categoryTextActive,
                showFocused && styles.categoryTextActive,
              ]}>
                {category.title || category.name}
              </Text>
            </TouchableOpacity>
              );
            })}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {/* Hidden left boundary - focusing this moves back to categories */}
        <TouchableOpacity
          style={{ position: 'absolute', left: 0, top: '50%', width: 1, height: 1, opacity: 0, zIndex: -1 }}
          focusable={true}
          onFocus={() => {
            console.log('[MainScreen] Left boundary focused, moving to categories');
            setFocusRegion('categories');
            const selectedIndex = categories.findIndex(c => c.id === selectedCategory);
            setCategoryFloatingIndex(selectedIndex >= 0 ? selectedIndex : 0);
          }}
        />
        <TouchableOpacity
          style={styles.contentHeader}
          focusable={true}
          onFocus={() => setFocusRegion('header')}
            onPress={() => {
            // When the header is pressed (center) act on the floating cursor
            // if grid isn't currently focused. This mirrors the remote
            // behavior you requested: center on floating selection -> open.
            const idx = gridFloatingIndex ?? gridFocusedIndex;
            if (idx != null && content[idx]) {
              handleContentSelect(content[idx]);
            }
          }}
        >
          <Text style={styles.contentTitle}>
            {categories.find(c => c.id === selectedCategory)?.title || 
             categories.find(c => c.id === selectedCategory)?.name || 
             'Content'}
          </Text>
          <Text style={styles.contentSubtitle}>
            {content.length} items
          </Text>
        </TouchableOpacity>
        {selectedPreview && (
          <View style={styles.previewContainer}>
            <View style={styles.previewInfo}>
              <Text style={styles.previewTitle}>{selectedPreview.name}</Text>
              <Text style={styles.previewSubtitle}>Channel #{selectedPreview.number}</Text>
            </View>
            <View style={styles.previewActions}>
              <TouchableOpacity
                onPress={() => setPlayerContent({ id: selectedPreview.id, title: selectedPreview.name, type: 'channel', cmd: selectedPreview.cmd })}
                style={styles.previewButton}
              >
                <Text style={styles.previewButtonText}>Play</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSelectedPreview(null)} style={[styles.previewButton, styles.previewClose, styles.previewButtonMargin]}>
                <Text style={[styles.previewButtonText, styles.previewCloseText]}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {loading && content.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#ff0000" />
          </View>
        ) : (
          <TVGrid
            ref={tvGridRef}
            data={content}
            onItemFocus={(index) => {
              setFocusRegion('grid');
              // track both the native focused index and floating cursor
              setGridFocusedIndex(index);
              setGridFloatingIndex(index);
            }}
            onNavigateLeft={() => {
              console.log('[MainScreen] onNavigateLeft callback from TVGrid');
              setFocusRegion('categories');
              const selectedIndex = categories.findIndex(c => c.id === selectedCategory);
              setCategoryFloatingIndex(selectedIndex >= 0 ? selectedIndex : 0);
            }}
            renderItem={(item: any, focused: boolean, index: number) => {
              // Show floating cursor at current grid floating index position
              const showFloating = index === gridFloatingIndex;
              // Use ID-based check for selection instead of index to avoid "ghost" selections
              // when changing categories.
              const isHardSelected = selectedPreview && selectedPreview.id === item.id;

              // If we're on the live tab show simplified channel rows (number + name)
              if (selectedTab === 'live') {
                return (
                  <ChannelRow
                    name={item.name}
                    number={item.number}
                    focused={focused}
                    selected={isHardSelected}
                    floating={showFloating && !isHardSelected}
                  />
                );
              }

              return (
                <FocusableCard
                  title={item.name}
                  imageUrl={getContentImageUrl(item)}
                  subtitle={getContentSubtitle(item)}
                  focused={focused}
                  selected={!showFloating && gridFocusedIndex === index}
                  floating={showFloating}
                />
              );
            }}
            onItemSelect={handleContentSelect}
            onEndReached={handleLoadMore}
            numColumns={selectedTab === 'live' ? 1 : 4}
            itemWidth={selectedTab === 'live' ? Math.floor(SCREEN_WIDTH * 0.56) : 240}
            itemHeight={selectedTab === 'live' ? 60 : 320}
            verticalSpacing={selectedTab === 'live' ? 4 : Math.floor(SCREEN_HEIGHT * 0.025)}
            extraData={[gridFloatingIndex, selectedPreview, selectedTab]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#263238',
  },
  // Main Sidebar (Left)
  mainSidebar: {
    width: SCREEN_WIDTH * 0.12,
    minWidth: 180,
    maxWidth: 250,
    backgroundColor: '#37474f',
    borderRightWidth: 0,
  },
  mainSidebarCompact: {
    width: SCREEN_WIDTH * 0.06,
    minWidth: 72,
    maxWidth: 120,
    backgroundColor: '#37474f',
    borderRightWidth: 0,
  },
  logo: {
    height: SCREEN_HEIGHT * 0.12,
    minHeight: 80,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: SCREEN_WIDTH * 0.015,
    backgroundColor: '#37474f',
  },
  logoText: {
    color: '#00bcd4',
    fontSize: SCREEN_WIDTH * 0.017,
    fontWeight: 'bold',
    letterSpacing: -1,
  },
  mainNav: {
    paddingTop: SCREEN_HEIGHT * 0.05,
    paddingHorizontal: SCREEN_WIDTH * 0.01,
  },
  mainNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SCREEN_HEIGHT * 0.022,
    paddingHorizontal: SCREEN_WIDTH * 0.01,
    marginBottom: SCREEN_HEIGHT * 0.01,
    borderRadius: 8,
  },
  mainNavItemActive: {
    backgroundColor: '#455a64',
  },
  mainNavItemCompact: {
    justifyContent: 'center',
    paddingHorizontal: SCREEN_WIDTH * 0.004,
  },
  mainNavIcon: {
    fontSize: SCREEN_WIDTH * 0.013,
    marginRight: SCREEN_WIDTH * 0.008,
    width: SCREEN_WIDTH * 0.017,
  },
  mainNavIconCompact: {
    marginRight: 0,
    width: '100%',
    textAlign: 'center',
  },
  mainNavText: {
    color: '#b0bec5',
    fontSize: SCREEN_WIDTH * 0.0095,
    fontWeight: '400',
  },
  mainNavTextActive: {
    color: '#ffffff',
    fontWeight: '500',
  },
  mainNavBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SCREEN_WIDTH * 0.01,
    paddingBottom: SCREEN_HEIGHT * 0.05,
  },
  // Category Sidebar (Second Level)
  categorySidebar: {
    width: SCREEN_WIDTH * 0.16,
    minWidth: 250,
    maxWidth: 350,
    backgroundColor: '#455a64',
    borderRightWidth: 0,
  },
  categoryHeader: {
    height: SCREEN_HEIGHT * 0.12,
    minHeight: 80,
    justifyContent: 'center',
    paddingHorizontal: SCREEN_WIDTH * 0.013,
    backgroundColor: '#455a64',
  },
  categoryHeaderText: {
    color: '#ffffff',
    fontSize: SCREEN_WIDTH * 0.011,
    fontWeight: '500',
  },
  categoryList: {
    flex: 1,
    paddingTop: SCREEN_HEIGHT * 0.01,
  },
  categoryItem: {
    paddingVertical: SCREEN_HEIGHT * 0.017,
    paddingHorizontal: SCREEN_WIDTH * 0.013,
    borderLeftWidth: 0,
    backgroundColor: 'transparent',
    borderRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryItemActive: {
    backgroundColor: '#546e7a', // Grey for active category
    borderColor: '#00bcd4', // Light blue border
  },
  categoryItemFocused: {
    backgroundColor: '#000000', // Black for focused (navigation)
  },
  categoryText: {
    color: '#cfd8dc',
    fontSize: SCREEN_WIDTH * 0.0085,
    fontWeight: '400',
  },
  categoryTextActive: {
    color: '#ffffff',
    fontWeight: '500',
  },
  // Content Area
  contentArea: {
    flex: 1,
    backgroundColor: '#263238',
  },
  contentHeader: {
    height: SCREEN_HEIGHT * 0.12,
    minHeight: 80,
    paddingHorizontal: SCREEN_WIDTH * 0.02,
    justifyContent: 'center',
    backgroundColor: '#263238',
  },
  contentTitle: {
    color: '#ffffff',
    fontSize: SCREEN_WIDTH * 0.015,
    fontWeight: 'bold',
  },
  contentSubtitle: {
    color: '#90a4ae',
    fontSize: SCREEN_WIDTH * 0.0085,
    marginTop: SCREEN_HEIGHT * 0.005,
  },
  previewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_WIDTH * 0.02,
    paddingVertical: SCREEN_HEIGHT * 0.015,
    backgroundColor: '#2f3a3d',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  previewInfo: {
    flex: 1,
  },
  previewTitle: {
    color: '#ffffff',
    fontSize: SCREEN_WIDTH * 0.014,
    fontWeight: '700',
  },
  previewSubtitle: {
    color: '#90a4ae',
    fontSize: SCREEN_WIDTH * 0.0095,
  },
  previewActions: {
    flexDirection: 'row',
  },
  previewButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#00bcd4',
    borderRadius: 6,
  },
  previewButtonMargin: { marginLeft: 8 },
  previewClose: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#9e9e9e',
  },
  previewButtonText: {
    color: '#012027',
    fontWeight: '700',
  },
  previewCloseText: {
    color: '#cfd8dc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#263238',
  },
});
