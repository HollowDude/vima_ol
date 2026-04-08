import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  useColorScheme,
  StatusBar,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import ClientsScreen from './screens/ClientsScreen';
import StorageService from './services/storage.service';
import { SafeAreaProvider } from 'react-native-safe-area-context';

let LOGO;
try { LOGO = require('./assets/logo.png'); } catch (e) { LOGO = null; }
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function useThemeColors(scheme) {
  const light = {
    background: '#f5f0ebff',
    surface: '#FFFFFF',
    text: '#0B1B2A',
    muted: '#6B7280',
  };
  return scheme === 'dark' ? light : light;
}

export default function App() {
  const scheme = useColorScheme() || 'light';
  const colors = useThemeColors(scheme);

  const [showClients, setShowClients] = useState(false);
  const [splashLoading, setSplashLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const start = Date.now();
      try {
        await StorageService.getClients();
      } catch (err) {
        console.warn('[App] preload clients failed', err);
      }
      const elapsed = Date.now() - start;
      const minDelay = 1500; 
      const wait = Math.max(0, minDelay - elapsed);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      if (mounted) {
        setSplashLoading(false);
        setShowClients(true); 
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (!showClients) {
    return (
      <SafeAreaProvider style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
        <View style={[styles.container]}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.logoWrap}>
              {LOGO ? (
                <Image source={LOGO} style={styles.logo} resizeMode="contain" accessible accessibilityLabel="Logo de Vima" />
              ) : (
                <View style={styles.logoFallback}><Text style={{ fontWeight: '700', fontSize: 18 }}>Vima</Text></View>
              )}
              <Text style={[styles.title, { color: colors.text }]}>GeoVima</Text>
              <Text style={[styles.subtitle, { color: colors.muted }]}>Gestión de ubicaciones de clientes</Text>
            </View>

            <View style={styles.actions}>
              {/* Spinner dentro de un circulito para indicar carga */}
              <View style={[styles.loadingCircle, { backgroundColor: '#64c27b' }]}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            </View>

            <View style={styles.footer}><Text style={[styles.footerText, { color: colors.muted }]}>Versión 1.0 — Offline</Text></View>
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider style={{ flex: 1 }}>
      <ClientsScreen showCloseButton={false} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  card: {
    width: '100%', maxWidth: 720, borderRadius: 14, padding: 24, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  logoWrap: { alignItems: 'center', marginBottom: 18 },
  logo: { width: Math.min(160, SCREEN_WIDTH * 0.35), height: Math.min(80, SCREEN_WIDTH * 0.18), marginBottom: 12 },
  logoFallback: { width: Math.min(160, SCREEN_WIDTH * 0.35), height: Math.min(80, SCREEN_WIDTH * 0.18), alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  actions: { marginTop: 6, alignItems: 'center' },
  loadingCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginVertical: 12 },
  footer: { marginTop: 14, alignItems: 'center' },
  footerText: { fontSize: 12 },
});
