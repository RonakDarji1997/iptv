import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
} from 'react-native';

interface HomeScreenProps {
  navigation: any;
}

export function HomeScreen({ navigation }: HomeScreenProps) {
  const menuItems = [
    {
      id: 'live',
      title: 'Live TV',
      icon: '📺',
      route: 'LiveTV',
      description: 'Watch live channels',
    },
    {
      id: 'movies',
      title: 'Movies',
      icon: '🎬',
      route: 'Movies',
      description: 'Browse movie collection',
    },
    {
      id: 'series',
      title: 'TV Series',
      icon: '📽️',
      route: 'Series',
      description: 'Explore TV shows',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.appTitle}>IPTV Player</Text>
        <Text style={styles.appSubtitle}>Your Entertainment Hub</Text>
      </View>

      {/* Menu Grid */}
      <View style={styles.menuGrid}>
        {menuItems.map((item, index) => (
          <Pressable
            key={item.id}
            style={styles.menuItem}
            onPress={() => navigation.navigate(item.route)}
            hasTVPreferredFocus={index === 0}
          >
            <View style={styles.menuIcon}>
              <Text style={styles.menuIconText}>{item.icon}</Text>
            </View>
            <Text style={styles.menuTitle}>{item.title}</Text>
            <Text style={styles.menuDescription}>{item.description}</Text>
          </Pressable>
        ))}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Navigate using your remote's D-pad • Press OK to select
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    padding: 60,
  },
  header: {
    marginBottom: 80,
  },
  appTitle: {
    color: '#ff0000',
    fontSize: 56,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  appSubtitle: {
    color: '#999999',
    fontSize: 24,
  },
  menuGrid: {
    flexDirection: 'row',
    gap: 40,
    marginBottom: 60,
  },
  menuItem: {
    width: 320,
    height: 380,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  menuIcon: {
    width: 120,
    height: 120,
    backgroundColor: '#2a2a2a',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  menuIconText: {
    fontSize: 60,
  },
  menuTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  menuDescription: {
    color: '#999999',
    fontSize: 18,
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
  },
  footerText: {
    color: '#666666',
    fontSize: 16,
    textAlign: 'center',
  },
});
