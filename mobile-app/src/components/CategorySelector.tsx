import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Category } from '../types';
import { COLORS, SPACING, FONT_SIZES, IS_TABLET } from '../constants';

interface CategorySelectorProps {
  categories: Category[];
  selectedCategory: string | null;
  onSelectCategory: (categoryId: string) => void;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  const renderItem = ({ item }: { item: Category }) => {
    const isSelected = item.id === selectedCategory;
    
    return (
      <TouchableOpacity
        style={[
          styles.categoryButton,
          isSelected && styles.categoryButtonSelected,
        ]}
        onPress={() => onSelectCategory(item.id)}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.categoryText,
            isSelected && styles.categoryTextSelected,
          ]}
        >
          {item.name}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={categories}
        renderItem={renderItem}
        keyExtractor={(item) => `${item.providerId || 'all'}_${item.id}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.backgroundLight,
    paddingVertical: SPACING.md,
  },
  list: {
    paddingHorizontal: SPACING.md,
  },
  categoryButton: {
    paddingHorizontal: IS_TABLET ? SPACING.lg : SPACING.md,
    paddingVertical: IS_TABLET ? SPACING.md : SPACING.sm,
    marginRight: SPACING.sm,
    borderRadius: IS_TABLET ? 24 : 20,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryText: {
    color: COLORS.textSecondary,
    fontSize: IS_TABLET ? FONT_SIZES.md : FONT_SIZES.sm,
    fontWeight: '600',
  },
  categoryTextSelected: {
    color: COLORS.text,
  },
});
