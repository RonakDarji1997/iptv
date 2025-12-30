import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  Image,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {Focusable} from '../components/Focusable';
import {contentService, LiveChannel} from '../services/contentService';
import {useGridNavigation} from '../hooks/useTVRemote';

const LiveTVScreen = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      setLoading(true);
      const liveChannels = await contentService.getLiveChannels();
      setChannels(liveChannels);
    } catch (error) {
      console.error('Error loading live channels:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChannelPress = async (channel: LiveChannel) => {
    console.log('Channel pressed:', channel.name);
    if (channel.stream_id) {
      const streamUrl = await contentService.getStreamUrl(
        channel.stream_id,
        'live',
      );
      if (streamUrl) {
        navigation.navigate('Player' as never, {
          streamUrl,
          title: channel.name,
          type: 'live',
        } as never);
      }
    }
  };

  useGridNavigation({
    itemCount: channels.length,
    columns: 4,
    currentIndex: selectedIndex,
    onIndexChange: setSelectedIndex,
    onSelect: index => handleChannelPress(channels[index]),
    enabled: !loading && channels.length > 0,
  });

  const renderChannel = ({item, index}: {item: LiveChannel; index: number}) => {
    const isFocused = index === selectedIndex;

    return (
      <Focusable
        onPress={() => handleChannelPress(item)}
        style={[styles.channelCard, isFocused && styles.channelCardFocused]}>
        <View style={styles.channelContent}>
          {item.stream_icon ? (
            <Image
              source={{uri: item.stream_icon}}
              style={styles.channelIcon}
              resizeMode="contain"
            />
          ) : (
            <View style={styles.channelIconPlaceholder}>
              <Text style={styles.channelNumber}>{item.num}</Text>
            </View>
          )}
          <Text style={styles.channelName} numberOfLines={2}>
            {item.name}
          </Text>
        </View>
      </Focusable>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Loading channels...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Live TV</Text>
        <Text style={styles.subtitle}>{channels.length} channels available</Text>
      </View>

      <FlatList
        data={channels}
        keyExtractor={item => item.id}
        renderItem={renderChannel}
        numColumns={4}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        columnWrapperStyle={styles.row}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
  header: {
    paddingHorizontal: 48,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
  },
  subtitle: {
    color: '#999',
    fontSize: 18,
    marginTop: 8,
  },
  contentContainer: {
    paddingTop: 32,
    paddingHorizontal: 48,
    paddingBottom: 48,
  },
  row: {
    justifyContent: 'flex-start',
    marginBottom: 24,
  },
  channelCard: {
    width: 220,
    height: 160,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginRight: 24,
    overflow: 'hidden',
  },
  channelCardFocused: {
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#2a2a2a',
  },
  channelContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  channelIcon: {
    width: 80,
    height: 80,
    marginBottom: 12,
  },
  channelIconPlaceholder: {
    width: 80,
    height: 80,
    backgroundColor: '#333',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  channelNumber: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  channelName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default LiveTVScreen;
