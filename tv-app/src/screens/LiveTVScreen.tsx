import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { TVGrid } from '../components/TVGrid';
import { FocusableCard } from '../components/FocusableCard';
import { ApiClient } from '../lib/api-client';
import { useAuthStore } from '../lib/store';
import { getFullImageUrl } from '../lib/image-utils';

interface LiveTVScreenProps {
  navigation?: any;
  onChannelSelect?: (channel: any) => void;
}

export function LiveTVScreen({ navigation, onChannelSelect }: LiveTVScreenProps) {
  const { macAddress, portalUrl } = useAuthStore();
  const [apiClient] = useState(() => new ApiClient({ mac: macAddress!, url: portalUrl! }));
  
  const [genres, setGenres] = useState<any[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('*');
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadGenres();
  }, []);

  useEffect(() => {
    if (selectedGenre) {
      loadChannels(1);
    }
  }, [selectedGenre]);

  const loadGenres = async () => {
    try {
      const result = await apiClient.getGenres();
      const allGenres = [{ id: '*', title: 'All Channels' }, ...result.genres];
      setGenres(allGenres);
    } catch (error) {
      console.error('Failed to load genres:', error);
    }
  };

  const loadChannels = async (pageNum: number) => {
    try {
      setLoading(true);
      const result = await apiClient.getChannels(selectedGenre, pageNum);
      
      if (pageNum === 1) {
        setChannels(result.channels.data);
      } else {
        setChannels(prev => [...prev, ...result.channels.data]);
      }
      
      setHasMore(result.channels.data.length > 0);
      setPage(pageNum);
    } catch (error) {
      console.error('Failed to load channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChannelSelect = (channel: any) => {
    if (onChannelSelect) {
      onChannelSelect(channel);
    } else if (navigation) {
      navigation.navigate('Player', {
        id: channel.id,
        title: channel.name,
        type: 'channel',
        cmd: channel.cmd,
      });
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadChannels(page + 1);
    }
  };

  if (loading && channels.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ff0000" />
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live TV</Text>
        <Text style={styles.subtitle}>
          {channels.length} channels available
        </Text>
      </View>

      <TVGrid
        data={channels}
        renderItem={(channel, focused, _index) => (
          <FocusableCard
            title={channel.name}
            imageUrl={getFullImageUrl(channel.logo)}
            subtitle={`#${channel.number}`}
            focused={focused}
          />
        )}
        onItemSelect={handleChannelSelect}
        onEndReached={handleLoadMore}
        numColumns={5}
        itemWidth={240}
        itemHeight={320}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    padding: 40,
    paddingBottom: 20,
  },
  title: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    color: '#999999',
    fontSize: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginTop: 20,
  },
});
