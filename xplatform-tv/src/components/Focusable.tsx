import React, {useRef, useEffect} from 'react';
import {
  TouchableOpacity,
  Animated,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
  Platform,
} from 'react-native';
import {useFocus} from '../context/FocusContext';
import {APP_CONFIG} from '../config';

interface FocusableProps {
  id?: string;
  onPress?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  focusedStyle?: StyleProp<ViewStyle>;
  hasTVPreferredFocus?: boolean;
  scaleOnFocus?: boolean;
  scaleValue?: number;
  disabled?: boolean;
}

export const Focusable: React.FC<FocusableProps> = ({
  id,
  onPress,
  onFocus,
  onBlur,
  children,
  style,
  focusedStyle,
  hasTVPreferredFocus = false,
  scaleOnFocus = true,
  scaleValue = APP_CONFIG.focusScale,
  disabled = false,
}) => {
  const scale = useRef(new Animated.Value(1)).current;
  const {focusedElement, setFocusedElement, isTVPlatform} = useFocus();
  const isFocused = id ? focusedElement === id : false;

  useEffect(() => {
    if (!scaleOnFocus || !isTVPlatform) return;

    Animated.spring(scale, {
      toValue: isFocused ? scaleValue : 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [isFocused, scale, scaleOnFocus, scaleValue, isTVPlatform]);

  const handleFocus = () => {
    if (id) {
      setFocusedElement(id);
    }
    onFocus?.();
  };

  const handleBlur = () => {
    onBlur?.();
  };

  const combinedStyle = [
    style,
    isFocused && focusedStyle,
    scaleOnFocus && {transform: [{scale}]},
  ];

  return (
    <TouchableOpacity
      accessible={true}
      accessibilityRole="button"
      focusable={true}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={combinedStyle}
      activeOpacity={0.9}>
      {children}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  defaultFocusedStyle: {
    borderWidth: 3,
    borderColor: '#fff',
  },
});
