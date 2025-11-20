import { View, Text, FlatList, StyleSheet } from 'react-native';
import ContentCard from './ContentCard';

interface ContentRowProps {
  title: string;
  items: any[];
  onItemPress: (item: any) => void;
  contentType?: 'itv' | 'vod' | 'series';
  portalUrl?: string;
}

export default function ContentRow({
  title,
  items,
  onItemPress,
  contentType = 'vod',
  portalUrl,
}: ContentRowProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, index) => `${contentType}-${item.id}-${index}`}
        renderItem={({ item }) => (
          <ContentCard
            item={item}
            onPress={onItemPress}
            contentType={contentType}
            portalUrl={portalUrl}
            width={contentType === 'itv' ? 140 : 160}
            height={contentType === 'itv' ? 140 : 240}
          />
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 16,
  },
});
