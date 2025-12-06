import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Movie, Series } from '../types';
import { COLORS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';
import { MovieCard } from './MovieCard';

interface CategoryRowProps {
  title: string;
  items: (Movie | Series)[];
  onItemPress: (item: Movie | Series) => void;
  onViewAll?: () => void;
  showViewAll?: boolean;
}

export const CategoryRow: React.FC<CategoryRowProps> = ({
  title,
  items,
  onItemPress,
  onViewAll,
  showViewAll = true,
}) => {
  const renderItem = ({ item }: { item: Movie | Series }) => (
    <MovieCard
      movie={item as Movie}
      onPress={() => onItemPress(item)}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {showViewAll && onViewAll && items.length > 0 && (
          <TouchableOpacity onPress={onViewAll} activeOpacity={0.7}>
            <Text style={styles.viewAll}>View All →</Text>
          </TouchableOpacity>
        )}
      </View>
      
      {items.length > 0 ? (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.list}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No content available</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: SPACING.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  title: {
    color: COLORS.text,
    fontSize: IS_TABLET ? FONT_SIZES.xl : FONT_SIZES.lg,
    fontWeight: 'bold',
  },
  viewAll: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZES.md,
    fontWeight: '500',
  },
  list: {
    paddingHorizontal: SPACING.md,
  },
  emptyContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.md,
  },
});
