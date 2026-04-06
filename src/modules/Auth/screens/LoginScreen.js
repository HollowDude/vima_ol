import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Card from '../../../core/components/Card';
import Input from '../../../core/components/Input';
import Button from '../../../core/components/Button';
import OdooService from '../../../core/api/odoo.service';
import StorageService from '../../../core/storage/storage.service';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

export default function LoginScreen({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!username.trim()) newErrors.username = 'El usuario es requerido';
    if (!password) newErrors.password = 'La contraseña es requerida';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    try {
      setLoading(true);
      setErrors({});

      const authData = await OdooService.authenticate(username, password);
      
      await StorageService.saveAuthData({
        uid: authData.uid,
        password: password, 
        username: authData.username,
        name: authData.name,
        loginAt: new Date().toISOString(),
      });

      if (onLoginSuccess) {
        onLoginSuccess(authData);
      }
    } catch (error) {
      console.error('[Login] Error:', error);
      Alert.alert(
        'Error de autenticación',
        error.message || 'No se pudo iniciar sesión. Verifica tus credenciales.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          enableOnAndroid={true}
          extraScrollHeight={Platform.OS === 'ios' ? 2 : 50}
          keyboardOpeningTime={0}
        >
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Image 
                source={require('../../../../assets/logo.png')} 
                style={styles.logoImage} 
                resizeMode="contain" 
              />
            </View>
          </View>

          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Bienvenido</Text>
            </View>

            <View style={styles.cardContent}>
              <Input
                label="Usuario"
                value={username}
                onChangeText={setUsername}
                placeholder="Ingresa tu usuario"
                autoCapitalize="none"
                autoCorrect={false}
                error={errors.username}
              />

              <Input
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder="Ingresa tu contraseña"
                secureTextEntry
                error={errors.password}
              />

              <Button
                title="Iniciar sesión"
                onPress={handleLogin}
                loading={loading}
                style={styles.loginButton}
              />
            </View>
          </Card>

          <Text style={styles.footer}>
            Versión 1.2.0 • VIMA © 2026
          </Text>
        </KeyboardAwareScrollView>
      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f0ebff',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  logoCircle: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden', 
  },
  logoImage: {
    width: '100%', 
    height: '100%', 
  },
  logoText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  card: {
    width: '100%',
    maxWidth: 400,
  },
  cardHeader: {
    backgroundColor: '#64c27b',
    padding: 20,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
  },
  cardContent: {
    padding: 20,
  },
  loginButton: {
    marginTop: 8,
  },
  footer: {
    marginTop: 24,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});