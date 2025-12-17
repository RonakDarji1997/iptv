/**
 * StreamHub Mobile App - Main Entry Point
 * Hybrid WebView + Native Video Player Architecture
 */

import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, Platform } from 'react-native';
import WebViewScreen from './src/screens/WebViewScreen';

export default function App() {
  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <SafeAreaView style={styles.container}>
        <WebViewScreen />
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
