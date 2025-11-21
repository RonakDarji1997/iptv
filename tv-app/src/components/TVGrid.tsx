import React, { useRef, useState, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  findNodeHandle,
  Platform,
} from 'react-native';

interface TVGridProps<T> {
  data: T[];
  // renderItem now receives the item index so the parent can provide a
  // "selected" / soft-focus state when focus leaves the grid.
  renderItem: (item: T, focused: boolean, index: number) => React.ReactElement;
  onItemSelect: (item: T) => void;
  numColumns?: number;
  itemWidth?: number;
  itemHeight?: number;
  horizontalSpacing?: number;
  verticalSpacing?: number;
  onEndReached?: () => void;
  // Called when an item receives focus; allows parent components to react
  // (e.g. to switch layout/visuals when the grid is focused).
  onItemFocus?: (index: number) => void;
  // Called when user presses LEFT from the grid (to navigate to categories)
  onNavigateLeft?: () => void;
  ListHeaderComponent?: React.ComponentType<any> | React.ReactElement | null;
  extraData?: any;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const TVGrid = forwardRef((props: TVGridProps<any>, ref: any) => {
  const {
    data,
    renderItem,
    onItemSelect,
    numColumns = 4,
    itemWidth = Math.floor(SCREEN_WIDTH * 0.13),
    itemHeight = Math.floor(SCREEN_HEIGHT * 0.38),
    horizontalSpacing = Math.floor(SCREEN_WIDTH * 0.01),
    verticalSpacing = Math.floor(SCREEN_HEIGHT * 0.025),
    onEndReached,
    onItemFocus,
    onNavigateLeft,
    ListHeaderComponent,
    extraData,
  } = props;
  const [focusedIndex, setFocusedIndex] = useState(0);
  // Use a FlatList reference - keep it untyped to simplify the imperative API
  const flatListRef = useRef<FlatList<any> | null>(null);
  const itemRefs = useRef<Map<number, any>>(new Map());

  const renderGridItem = useCallback(
    ({ item, index }: { item: any; index: number }) => {
      const isFocused = index === focusedIndex;

      return (
        <TouchableOpacity
          ref={(ref) => {
            if (ref) {
              itemRefs.current.set(index, ref);
            } else {
              itemRefs.current.delete(index);
            }
          }}
          style={[
            styles.gridItem,
            {
              width: itemWidth,
              height: itemHeight,
              marginHorizontal: horizontalSpacing / 2,
              marginVertical: verticalSpacing / 2,
            },
          ]}
          // Removed hasTVPreferredFocus to prevent sticky focus issues.
          // Focus is managed via imperative calls from parent when needed.
          onPress={() => {
            console.log('Grid item pressed:', item);
            onItemSelect(item);
          }}
          focusable={true}
          onFocus={() => {
            console.log('Grid item focused:', index);
            setFocusedIndex(index);
            if (typeof (onItemFocus as any) === 'function') {
              (onItemFocus as any)(index);
            }
          }}
          activeOpacity={0.8}
        >
          {renderItem(item, isFocused, index)}
        </TouchableOpacity>
      );
    },
    [focusedIndex, renderItem, onItemSelect, itemWidth, itemHeight, horizontalSpacing, verticalSpacing, onItemFocus, onNavigateLeft]
  );

  const getItemLayout = useCallback(
    (data: any, index: number) => {
      const totalItemHeight = itemHeight + verticalSpacing;
      return {
        length: totalItemHeight,
        offset: totalItemHeight * Math.floor(index / numColumns),
        index,
      };
    },
    [itemHeight, verticalSpacing, numColumns]
  );

  const keyExtractor = useCallback((item: any) => String(item.id), []);

  // Expose imperative focus APIs so parents can programmatically focus a
  // grid item even when native focus is elsewhere (floating cursor -> confirm)
  useImperativeHandle(ref, () => ({
    focusIndex: (index: number) => {
      const itemRef = itemRefs.current.get(index);
      if (itemRef && typeof itemRef.focus === 'function') {
        try { itemRef.focus(); } catch (e) { console.warn('focus failed', e); }
      } else if (flatListRef.current && typeof (flatListRef.current as any).scrollToIndex === 'function') {
        try { (flatListRef.current as any).scrollToIndex({ index, viewPosition: 0.5 }); } catch (e) { /* ignore */ }
      }
    },
    scrollToIndex: (index: number) => {
      if (flatListRef.current && typeof (flatListRef.current as any).scrollToIndex === 'function') {
        try { (flatListRef.current as any).scrollToIndex({ index, viewPosition: 0.5 }); } catch (e) { /* ignore */ }
      }
    }
  }));

  return (
    <View style={styles.container}>
      <FlatList
        // Changing `numColumns` on the fly is not supported by React Native's
        // FlatList (Invariant Violation). Force a remount when `numColumns`
        // changes by including it in the `key` prop — this creates a fresh
        // instance of the component whenever the layout column count changes.
        key={`tvgrid-${numColumns}`}
        ref={flatListRef}
        data={data}
        renderItem={renderGridItem}
        keyExtractor={keyExtractor}
        numColumns={numColumns}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={ListHeaderComponent}
        removeClippedSubviews={false}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={21}
        getItemLayout={getItemLayout}
        extraData={[focusedIndex, extraData]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: SCREEN_WIDTH * 0.02,
    paddingVertical: SCREEN_HEIGHT * 0.015,
  },
  gridItem: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
