import React, {useEffect} from 'react';
import {StyleSheet, LogBox} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import {FocusProvider} from './src/context/FocusContext';

// Ignore specific warnings for TV development
LogBox.ignoreLogs([
  'new NativeEventEmitter',
  'EventEmitter.removeListener',
]);

function App(): React.JSX.Element {
  useEffect(() => {
    console.log('IPTV TV App Started');
  }, []);

  return (
    <SafeAreaProvider>
      <FocusProvider>
        <RootNavigator />
      </FocusProvider>
    </SafeAreaProvider>
  );
}

export default App;
