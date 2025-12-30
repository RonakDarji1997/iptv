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

type RegisterScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Register'>;

export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<'email' | 'password' | 'confirm' | 'submit' | 'login'>('email');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    // Auto-focus email field on mount
    if (Platform.isTV) {
      setTimeout(() => emailRef.current?.focus(), 100);
    }
  }, []);

  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await authService.register(email, password);
      Alert.alert(
        'Success!',
        'Account created successfully',
        [{ text: 'OK', onPress: () => navigation.replace('Home' as any) }]
      );
    } catch (error: any) {
      Alert.alert(
        'Registration Failed',
        error.response?.data?.error || 'Could not create account'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = () => {
    navigation.navigate('Login');
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
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join StreamHub today</Text>

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
                  onSubmitEditing={() => {
                    setFocusedField('confirm');
                    confirmRef.current?.focus();
                  }}
                  returnKeyType="next"
                />
              </View>
            </Focusable>
          </View>

          {/* Confirm Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <Focusable
              onPress={() => {
                setFocusedField('confirm');
                confirmRef.current?.focus();
              }}
            >
              <View style={[
                styles.inputContainer,
                focusedField === 'confirm' && styles.inputContainerFocused
              ]}>
                <TextInput
                  ref={confirmRef}
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                  onFocus={() => setFocusedField('confirm')}
                  onSubmitEditing={handleRegister}
                  returnKeyType="go"
                />
              </View>
            </Focusable>
          </View>

          {/* Create Account Button */}
          <Focusable onPress={handleRegister}>
            <View style={[
              styles.button,
              styles.primaryButton,
              focusedField === 'submit' && styles.buttonFocused
            ]}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Create Account</Text>
              )}
            </View>
          </Focusable>

          {/* Login Link */}
          <View style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <Focusable onPress={handleLogin}>
              <View style={focusedField === 'login' ? styles.loginButtonFocused : undefined}>
                <Text style={styles.loginLink}>Sign In</Text>
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
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  loginText: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  loginLink: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
  loginButtonFocused: {
    transform: [{ scale: 1.1 }],
  },
});
