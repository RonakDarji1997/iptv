import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useAuthStore } from '../lib/store';
import { ApiClient } from '../lib/api-client';

interface Channel {
  id: string;
  name: string;
  number: string;
  logo: string;
  cmd: string;
}

interface Genre {
  id: string;
  title: string;
}

export default function LiveScreen({ onChannelSelect }: { onChannelSelect: (channel: Channel) => void }) {
  const { portalUrl, macAddress } = useAuthStore();
  const [genres, setGenres] = useState<Genre[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('*');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadGenres();
  }, []);

  useEffect(() => {
    if (selectedGenre) {
      loadChannels(selectedGenre);
    }
  }, [selectedGenre]);

  const loadGenres = async () => {
    if (!portalUrl || !macAddress) return;

    try {
      const client = new ApiClient({ url: portalUrl, mac: macAddress });
      const { genres: genreList } = await client.getGenres();
      setGenres(genreList);
    } catch (err) {
      console.error('Load genres error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load genres');
    }
  };

  const loadChannels = async (genre: string) => {
    if (!portalUrl || !macAddress) return;

    setLoading(true);
    setError('');

    try {
      const client = new ApiClient({ url: portalUrl, mac: macAddress });
      const { channels: result } = await client.getChannels(genre, 1);
      setChannels(result.data);
    } catch (err) {
      console.error('Load channels error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  const renderGenreItem = ({ item }: { item: Genre }) => (
    <TouchableOpacity
      style={[
        styles.genreItem,
        item.id === selectedGenre && styles.genreItemSelected,
      ]}
      onPress={() => setSelectedGenre(item.id)}
    >
      <Text
        style={[
          styles.genreText,
          item.id === selectedGenre && styles.genreTextSelected,
        ]}
      >
        {item.title}
      </Text>
    </TouchableOpacity>
  );

  const renderChannelItem = ({ item, index }: { item: Channel; index: number }) => (
    <TouchableOpacity
      style={styles.channelItem}
      onPress={() => onChannelSelect(item)}
    >
      <Text style={styles.channelNumber}>{index + 1}</Text>
      <View style={styles.channelLogo}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.logoImage} />
        ) : (
          <Text style={styles.logoText}>TV</Text>
        )}
      </View>
      <View style={styles.channelInfo}>
        <Text style={styles.channelName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.programText}>Program info loading...</Text>
      </View>
      <View style={styles.programTimeSlot}>
        <Text style={styles.programText}>--:-- - --:--</Text>
      </View>
    </TouchableOpacity>
  );

  if (loading && channels.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00a8e8" />
        <Text style={styles.loadingText}>Loading channels...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Genre Filter */}
      <View style={styles.genreContainer}>
        <FlatList
          data={genres}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.id}
          renderItem={renderGenreItem}
          contentContainerStyle={styles.genreList}
        />
      </View>

      {/* Channel List */}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={(item) => item.id}
          renderItem={renderChannelItem}
          contentContainerStyle={styles.channelList}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f0f',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
  },
  genreContainer: {
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  genreList: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  genreItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 4,
    backgroundColor: '#2a2a2a',
  },
  genreItemSelected: {
    backgroundColor: '#00a8e8',
  },
  genreText: {
    color: '#ccc',
    fontSize: 14,
  },
  genreTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  channelList: {
    padding: 8,
  },
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 2,
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
  },
  channelNumber: {
    color: '#888',
    fontSize: 14,
    width: 40,
    textAlign: 'center',
  },
  channelLogo: {
    width: 48,
    height: 32,
    backgroundColor: '#333',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  logoImage: {
    width: 48,
    height: 32,
    borderRadius: 4,
  },
  logoText: {
    color: '#888',
    fontSize: 10,
    fontWeight: 'bold',
  },
  channelInfo: {
    flex: 1,
  },
  channelName: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 4,
  },
  programText: {
    color: '#888',
    fontSize: 12,
  },
  programTimeSlot: {
    paddingHorizontal: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 16,
    textAlign: 'center',
  },
});
