import React, { useEffect, useState } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { initializeAuth } from './lib/store';
import { MainScreen } from './screens/MainScreen';

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initializeAuth();
      setIsReady(true);
    };
    init();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar hidden />
        <ActivityIndicator size="large" color="#00bcd4" />
      </View>
    );
  }

  return (
    <>
      <StatusBar hidden />
      <MainScreen navigation={null} />
    </>
  );
}
