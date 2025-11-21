import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ChannelRowProps {
  name: string;
  number?: string | number;
  focused?: boolean;
  selected?: boolean;
  floating?: boolean;
  onPress?: () => void;
}

export function ChannelRow({ name, number, focused = false, selected = false, floating = false }: Omit<ChannelRowProps, 'onPress'>) {
  return (
    <View
      style={[
        styles.container,
        floating && styles.containerFloating,
        focused && styles.containerFocused,
        selected && styles.containerSelected
      ]}
    >
      <View style={styles.leftCol}>
        {number != null && <Text style={[styles.numberText, focused && styles.numberTextFocused, !focused && selected && styles.numberTextSelected, floating && styles.numberTextFloating]}>{String(number)}</Text>}
      </View>
      <View style={styles.mainCol}>
        <Text style={[styles.nameText, focused && styles.nameTextFocused, !focused && selected && styles.nameTextSelected, floating && styles.nameTextFloating]} numberOfLines={1}>{name}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 18,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  containerFloating: {
    backgroundColor: '#000000', // Black for floating cursor (navigation)
  },
  containerFocused: {
    backgroundColor: '#000000', // Black for focused (navigation)
  },
  containerSelected: {
    backgroundColor: '#546e7a', // Grey for selected (playing/active)
    borderColor: '#00bcd4', // Light blue border for active
    borderWidth: 2,
  },
  // ... existing styles ...
  leftCol: {
    width: 52,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  numberText: {
    color: '#90a4ae',
    fontWeight: '600',
    fontSize: 14,
  },
  numberTextFocused: {
    color: '#ffffff',
    fontWeight: '700',
  },
  numberTextFloating: {
    color: '#ffffff',
  },
  mainCol: {
    flex: 1,
  },
  nameText: {
    color: '#cfd8dc',
    fontSize: 16,
  },
  nameTextFocused: {
    color: '#ffffff',
    fontWeight: '700',
  },
  nameTextFloating: {
    color: '#ffffff',
  },
  numberTextSelected: {
    color: '#e0e0e0',
    fontWeight: '700',
  },
  nameTextSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
