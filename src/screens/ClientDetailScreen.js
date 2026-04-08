import React, { useState, useEffect } from 'react'; 
import {
  View,
  Text,
  Dimensions,
  useWindowDimensions,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  useColorScheme,
  Linking,
  TextInput, 
  Keyboard,  
} from 'react-native';
import StorageService from '../services/storage.service';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';

let Location = null;
try {
  Location = require('expo-location');
} catch (e) {
  Location = null;
}

function useThemeColors(scheme) {
  const light = {
    background: '#f5f0ebff',
    cardBg: '#ffffff',
    stripe: '#64c27b',
    primary: '#e8c39e',
    text: '#0B1B2A',
    muted: '#6B7280',
    border: '#E6E9EF',
    danger: '#bb2525',
    inputBg: '#f3f4f6',
    success: '#16A34A',
    menuBg: '#ffffff',
    inputBorder: '#d1d5db',
  };

  const dark = {
    background: '#0B1020',
    cardBg: '#ffffff',
    surface: '#0F1724',
    primary: '#3B82F6',
    text: '#E6EEF8',
    muted: '#9CA3AF',
    border: '#1F2937',
    danger: '#F87171',
    stripe: '#64c27b',
    inputBg: '#1F2937',
    inputBorder: '#374151',
  };

  return scheme === 'dark' ? { ...light, ...dark } : light;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ClientDetailScreen({ client, onClose, onUpdated }) {
  const scheme = useColorScheme() || 'light';
  const colors = useThemeColors(scheme);
  const { height, width } = useWindowDimensions();
  const CARD_HEIGHT = Math.min(820, Math.round(height * 0.85));

  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState(client.direccion || '');
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    setAddress(client.direccion || '');
  }, [client]);

  async function handleSaveAddress() {
    if (savingAddress) return;
    
    if (address === client.direccion) return;

    try {
      setSavingAddress(true);
      Keyboard.dismiss(); 

      const updated = await StorageService.updateClient(client.codigo, { direccion: address });
      
      Alert.alert('Éxito', 'Dirección actualizada correctamente.');
      
      if (typeof onUpdated === 'function') onUpdated(updated);
    } catch (err) {
      console.error('Error updating address', err);
      Alert.alert('Error', 'No se pudo actualizar la dirección: ' + (err.message || err));
    } finally {
      setSavingAddress(false);
    }
  }
  // ---------------------------------

  async function handleCaptureLocation() {
    try {
      setSaving(true);

      if (Location) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso denegado', 'Necesitamos permiso para acceder a la ubicación del dispositivo.');
          setSaving(false);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
        if (!pos || !pos.coords) throw new Error('No se pudieron obtener coordenadas.');
        const { latitude, longitude } = pos.coords;
        const utc = new Date().toISOString();

        const updated = await StorageService.updateClient(client.codigo, { lat: latitude, lng: longitude, registradoEn: utc });
        Alert.alert('Ubicación guardada', `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}\nRegistro UTC: ${utc}`);
        if (typeof onUpdated === 'function') onUpdated(updated);
        setSaving(false);
        return;
      }

      if (navigator && typeof navigator.geolocation !== 'undefined') {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              const { latitude, longitude } = pos.coords;
              const utc = new Date().toISOString();
              const updated = await StorageService.updateClient(client.codigo, { lat: latitude, lng: longitude, registradoEn: utc });
              Alert.alert('Ubicación guardada', `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}\nRegistro UTC: ${utc}`);
              if (typeof onUpdated === 'function') onUpdated(updated);
            } catch (err) {
              console.error(err);
              Alert.alert('Error', 'No se pudo guardar la ubicación: ' + (err.message || err));
            } finally {
              setSaving(false);
            }
          },
          (err) => {
            console.error('geo error', err);
            Alert.alert('Error', 'No se pudo obtener la ubicación: ' + (err.message || err.code));
            setSaving(false);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 },
        );
        return;
      }

      throw new Error('No hay un método de geolocalización disponible.');
    } catch (err) {
      console.error('[ClientDetail] capture error', err);
      Alert.alert('Error', err.message || 'No se pudo obtener la ubicación.');
      setSaving(false);
    }
  }

  async function handleOpenMap() {
    if (client.lat === null || client.lng === null) {
      Alert.alert('Error', 'No hay coordenadas para mostrar en el mapa.');
      return;
    }
    
    const url = `https://www.google.com/maps/search/?api=1&query=${client.lat},${client.lng}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening map', error);
      Alert.alert('Error', 'Ocurrió un error al intentar abrir el mapa.');
    }
  }

  const renderValue = (val) => (val === null || typeof val === 'undefined' || val === '' ? 'por definir' : String(val));
  const hasLocation = client.registradoEn !== null && client.lat !== null && client.lng !== null;

  return (
    <SafeAreaProvider style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <View style={styles.outerContainer}>
        <View
          style={[
            styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border, width: Math.min(720, width - 32), height: CARD_HEIGHT },
          ]}
        >
          {/* --- HEADER --- */}
          <View style={[styles.header, {backgroundColor: colors.stripe }]}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <Feather name="arrow-left" size={24} color='#fff' />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: '#fff' }]}>Ficha de cliente</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* --- CONTENT --- */}
          <View style={styles.content}>
            <View style={[styles.cardinn, { backgroundColor: '#fcf8f4ff' }]}>
              <Row label="Código cliente" value={renderValue(client.codigo)} colors={colors} />
              <Row label="Nombre cliente" value={renderValue(client.nombre)} colors={colors} />
              
              {/* --- ZONA EDITABLE DE DIRECCIÓN --- */}
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: colors.muted }]}>Dirección</Text>
                <View style={styles.inputRowContainer}>
                    <TextInput
                        style={[
                            styles.input, 
                            { 
                                backgroundColor: colors.cardBg, 
                                color: colors.text,
                                borderColor: colors.inputBorder || '#ccc' 
                            }
                        ]}
                        value={address}
                        onChangeText={setAddress}
                        placeholder="Ingresar dirección"
                        placeholderTextColor={colors.muted}
                        multiline
                    />
                    {/* Botón de guardar solo visible si el texto cambió o si queremos tenerlo siempre disponible */}
                    <TouchableOpacity 
                        style={[styles.saveBtn, { backgroundColor: colors.stripe }]}
                        onPress={handleSaveAddress}
                        disabled={savingAddress}
                    >
                        {savingAddress ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Feather name="save" size={20} color="#fff" />
                        )}
                    </TouchableOpacity>
                </View>
              </View>
              {/* ---------------------------------- */}

              <Row label="Vendedor" value={renderValue(client.vendedor)} colors={colors} />
              <Row label="Latitud" value={client.lat !== null ? String(client.lat) : 'por definir'} colors={colors} />
              <Row label="Longitud" value={client.lng !== null ? String(client.lng) : 'por definir'} colors={colors} />
              <Row label="Registrado en (UTC)" value={client.registradoEn ? client.registradoEn : 'por definir'} colors={colors} />
            </View>

            <View style={{ marginTop: 18, alignItems: 'center' }}>
              <MaterialIcons
                  name="place"
                  size={18}
                  color={hasLocation ? colors.success : colors.muted}
              />
              <TouchableOpacity
                onPress={handleCaptureLocation}
                style={[styles.pill, { backgroundColor: hasLocation ? '#E6FFEF' : '#F3F4F6' }]}
                disabled={saving}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={colors.muted} />
                ) : (
                  <Text style={[styles.pillText, { color: hasLocation ? colors.success : colors.muted }]}>
                    {hasLocation ? 'Actualizar ubicación' : 'Capturar ubicación actual'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* --- FOOTER --- */}
          <TouchableOpacity
            style={[
              styles.footer,
              { 
                backgroundColor: hasLocation 
                  ? colors.stripe 
                  : colors.inputBg 
              }
            ]}
            onPress={handleOpenMap} 
            disabled={!hasLocation} 
            accessibilityRole="button"
          >
            <MaterialIcons 
              name="map" 
              size={20} 
              color={hasLocation ? '#fff' : colors.muted} 
            />
            <Text style={[
              styles.footerText, 
              { 
                color: hasLocation ? '#fff' : colors.muted 
              }
            ]}>
              {hasLocation ? 'Ver en Google Maps' : 'Ubicación no registrada'}
            </Text>
          </TouchableOpacity>

        </View>
      </View>
    </SafeAreaProvider>
  );
}

function Row({ label, value, colors }) {
  return (
    <View style={[styles.row]}>
      <Text style={[styles.rowLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },
  safeArea: { flex: 1 },
  header: { width: '100%', paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center'},
  backButton: { padding: 8, marginRight: 6 },
  headerTitle: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 16 },
  content: { flex: 1, padding: 12 },
  row: { marginBottom: 12 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 4,
  },
  pillText: {
    fontSize: 15,
    fontWeight: '600',
  },
  rowLabel: { fontSize: 13, marginBottom: 3 },
  rowValue: { fontSize: 15, fontWeight: '600' },
  
  inputRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 40, 
  },
  saveBtn: {
    marginLeft: 8,
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
      width: '100%',
      maxWidth: 720,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth,
      backgroundColor: '#fff',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },
        android: { elevation: 3 },
      }),
    },
    cardinn: {
      width: '100%',
      maxWidth: 720,
      borderRadius: 12,
      overflow: 'hidden',
      padding: 10, 
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },
        android: { elevation: 3 },
      }),
    },
  footer: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center', 
  },
  footerText: {
    marginLeft: 8,
    fontWeight: '700',
    fontSize: 15,
  },
});