import {useEffect, useRef, useCallback} from 'react';
import {
  TVEventHandler,
  HWEvent,
  useTVEventHandler,
  Platform,
} from 'react-native';

export type TVEventType =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'select'
  | 'playPause'
  | 'menu'
  | 'back';

interface UseTVRemoteOptions {
  onUp?: () => void;
  onDown?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onSelect?: () => void;
  onPlayPause?: () => void;
  onMenu?: () => void;
  onBack?: () => void;
  enabled?: boolean;
}

export const useTVRemote = (options: UseTVRemoteOptions) => {
  const {
    onUp,
    onDown,
    onLeft,
    onRight,
    onSelect,
    onPlayPause,
    onMenu,
    onBack,
    enabled = true,
  } = options;

  const handleTVEvent = useCallback(
    (evt: HWEvent) => {
      if (!enabled) return;

      const {eventType} = evt;

      switch (eventType) {
        case 'up':
          onUp?.();
          break;
        case 'down':
          onDown?.();
          break;
        case 'left':
          onLeft?.();
          break;
        case 'right':
          onRight?.();
          break;
        case 'select':
          onSelect?.();
          break;
        case 'playPause':
          onPlayPause?.();
          break;
        case 'menu':
          onMenu?.();
          break;
        case 'back':
          onBack?.();
          break;
      }
    },
    [
      enabled,
      onUp,
      onDown,
      onLeft,
      onRight,
      onSelect,
      onPlayPause,
      onMenu,
      onBack,
    ],
  );

  useTVEventHandler(handleTVEvent);
};

// Custom hook for grid navigation
interface UseGridNavigationOptions {
  itemCount: number;
  columns: number;
  currentIndex: number;
  onIndexChange: (index: number) => void;
  onSelect?: (index: number) => void;
  enabled?: boolean;
}

export const useGridNavigation = ({
  itemCount,
  columns,
  currentIndex,
  onIndexChange,
  onSelect,
  enabled = true,
}: UseGridNavigationOptions) => {
  const rows = Math.ceil(itemCount / columns);

  const handleUp = useCallback(() => {
    if (currentIndex >= columns) {
      onIndexChange(currentIndex - columns);
    }
  }, [currentIndex, columns, onIndexChange]);

  const handleDown = useCallback(() => {
    const newIndex = currentIndex + columns;
    if (newIndex < itemCount) {
      onIndexChange(newIndex);
    }
  }, [currentIndex, columns, itemCount, onIndexChange]);

  const handleLeft = useCallback(() => {
    if (currentIndex % columns !== 0) {
      onIndexChange(currentIndex - 1);
    }
  }, [currentIndex, columns, onIndexChange]);

  const handleRight = useCallback(() => {
    const newIndex = currentIndex + 1;
    if (newIndex < itemCount && newIndex % columns !== 0) {
      onIndexChange(newIndex);
    } else if (newIndex % columns === 0 && newIndex < itemCount) {
      // Don't move to next column
      return;
    }
  }, [currentIndex, columns, itemCount, onIndexChange]);

  const handleSelect = useCallback(() => {
    onSelect?.(currentIndex);
  }, [currentIndex, onSelect]);

  useTVRemote({
    onUp: handleUp,
    onDown: handleDown,
    onLeft: handleLeft,
    onRight: handleRight,
    onSelect: handleSelect,
    enabled,
  });

  return {
    currentRow: Math.floor(currentIndex / columns),
    currentColumn: currentIndex % columns,
    rows,
    columns,
  };
};
