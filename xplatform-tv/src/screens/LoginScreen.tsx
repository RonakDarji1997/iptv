import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/RootNavigator';
import { authService } from '../services/authService';
import { Focusable } from '../components/Focusable';
import axios from 'axios';
import { API_CONFIG } from '../config';

type LoginScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'submit' | 'register'>('email');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus email field on mount
    if (Platform.isTV) {
      setTimeout(() => emailRef.current?.focus(), 100);
    }
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter both email and password');
      return;
    }

    setLoading(true);

    try {
      await authService.login(email, password);
      
      // Check if user has any providers
      const token = authService.getToken();
      const response = await axios.get(`${API_CONFIG.baseURL}/sync/pull`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const providers = response.data.data?.providers || [];
      const hasActiveProvider = providers.some((p: any) => {
        const serverUrl = p.server_url || p.url;
        return serverUrl && serverUrl !== 'pending' && serverUrl.trim() !== '';
      });
      
      if (hasActiveProvider) {
        // User has provider, go to home
        navigation.replace('Home');
      } else {
        // No provider, show alert
        Alert.alert(
          'Welcome!',
          'Please add your IPTV provider in settings to start watching content.',
          [{ text: 'OK', onPress: () => navigation.replace('Home') }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Login Failed',
        error.response?.data?.error || 'Invalid email or password'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    navigation.navigate('Register');
  };

  const handleKeyDown = (field: 'email' | 'password' | 'submit' | 'register', direction: 'up' | 'down') => {
    if (direction === 'down') {
      switch (field) {
        case 'email':
          setFocusedField('password');
          setTimeout(() => passwordRef.current?.focus(), 100);
          break;
        case 'password':
          setFocusedField('submit');
          break;
        case 'submit':
          setFocusedField('register');
          break;
      }
    } else if (direction === 'up') {
      switch (field) {
        case 'password':
          setFocusedField('email');
          setTimeout(() => emailRef.current?.focus(), 100);
          break;
        case 'submit':
          setFocusedField('password');
          setTimeout(() => passwordRef.current?.focus(), 100);
          break;
        case 'register':
          setFocusedField('submit');
          break;
      }
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.appName}>STREAMHUB</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>Sign In</Text>
        <Text style={styles.subtitle}>Welcome back to StreamHub</Text>

        {/* Form */}
        <View style={styles.form}>
          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <Focusable
              onPress={() => {
                setFocusedField('email');
                emailRef.current?.focus();
              }}
            >
              <View style={[
                styles.inputContainer,
                focusedField === 'email' && styles.inputContainerFocused
              ]}>
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="john@example.com"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  onFocus={() => setFocusedField('email')}
                  onSubmitEditing={() => {
                    setFocusedField('password');
                    passwordRef.current?.focus();
                  }}
                  returnKeyType="next"
                />
              </View>
            </Focusable>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <Focusable
              onPress={() => {
                setFocusedField('password');
                passwordRef.current?.focus();
              }}
            >
              <View style={[
                styles.inputContainer,
                focusedField === 'password' && styles.inputContainerFocused
              ]}>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  onFocus={() => setFocusedField('password')}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
              </View>
            </Focusable>
          </View>

          {/* Sign In Button */}
          <Focusable onPress={handleLogin}>
            <View style={[
              styles.button,
              styles.primaryButton,
              focusedField === 'submit' && styles.buttonFocused
            ]}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Sign In</Text>
              )}
            </View>
          </Focusable>

          {/* Register Link */}
          <View style={styles.registerContainer}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <Focusable onPress={handleRegister}>
              <View style={focusedField === 'register' ? styles.registerButtonFocused : undefined}>
                <Text style={styles.registerLink}>Create Account</Text>
              </View>
            </Focusable>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  logoBox: {
    width: 50,
    height: 50,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  appName: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    letterSpacing: -0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 32,
  },
  form: {
    width: '100%',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#D1D5DB',
    marginBottom: 8,
  },
  inputContainer: {
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    justifyContent: 'center',
  },
  inputContainerFocused: {
    borderColor: '#3B82F6',
    borderWidth: 2,
  },
  input: {
    color: '#fff',
    fontSize: 16,
  },
  button: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  buttonFocused: {
    backgroundColor: '#2563EB',
    transform: [{ scale: 1.05 }],
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  registerText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  registerLink: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  registerButtonFocused: {
    transform: [{ scale: 1.1 }],
  },
});
