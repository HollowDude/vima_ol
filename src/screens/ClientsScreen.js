import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  TextInput,
  useColorScheme,
  StatusBar,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  Platform,
  BackHandler,
  useWindowDimensions,
} from 'react-native';
import StorageService from '../services/storage.service';
import ClientDetailScreen from './ClientDetailScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Feather } from '@expo/vector-icons';
import {MaterialIcons} from '@expo/vector-icons';
import ImportService from '../features/import/import.service';
import ExportService from '../features/export/export.service';


const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
  };
  return scheme === 'dark' ? light : light;
}

export default function ClientsScreen({ onClose }) {
  const scheme = useColorScheme() || 'light';
  const colors = useThemeColors(scheme);

  const { height, width } = useWindowDimensions();
  const CARD_HEIGHT = Math.min(820, Math.round(height * 0.85));

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  const [selectedClient, setSelectedClient] = useState(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const [exporting, setExporting] = useState(false);

  const [filterMode, setFilterMode] = useState('all');
  const [query, setQuery] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);

  const [importing, setImporting] = useState(false);

  const filterBtnRef = useRef(null);
  const uploadBtnRef = useRef(null);

  const [filterBtnLayout, setFilterBtnLayout] = useState(null);
  const [uploadBtnLayout, setUploadBtnLayout] = useState(null);

  useEffect(() => {
  if (Platform.OS === 'android') {
    const onBackPress = () => {
      return true;
    };
    BackHandler.addEventListener('hardwareBackPress', onBackPress);
  }
  }, []);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const all = await StorageService.getClients();
      setClients(all || []);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudieron cargar los clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  function openDetail(client) {
    setSelectedClient(client);
    setDetailVisible(true);
  }
  function onDetailClose() {
    setDetailVisible(false);
    setSelectedClient(null);
  }

  async function doExport(onlyWithLocation = false) {
  try {
    setExporting(true);
    
    // Llamar al servicio
    const result = await ExportService.exportClients({ onlyWithLocation });

    // Si el usuario canceló en Android (dio atrás en el selector de carpetas)
    if (result.cancelled) {
      // No hacemos nada o mostramos un toast discreto
      return;
    }

    // Mensaje de éxito
    // En Android (saved=true), confirmamos que se guardó.
    // En iOS (saved=false/undefined), confirmamos que se generó/compartió.
    if (Platform.OS === 'android') {
        Alert.alert('Exportación Exitosa', `Archivo guardado correctamente:\n${result.filename}`);
    } else {
        // En iOS el share sheet ya da feedback visual, pero puedes dejar este alert si gustas
        Alert.alert('Exportación', `Archivo generado: ${result.filename}`);
    }

  } catch (err) {
    console.error('[ClientsScreen] Export error', err);
    Alert.alert('Error', err?.message || 'La exportación falló.');
  } finally {
    setExporting(false);
    closeAnyModal();
  }
}



  async function onClientUpdated(updated) {
    await loadClients();
    const fresh = await StorageService.getClients();
    const found = fresh.find(c => c.codigo === (updated?.codigo || selectedClient?.codigo));
    setSelectedClient(found || updated || null);
  }

  async function openFilterModal() {
    try {
      if (filterBtnRef.current && filterBtnRef.current.measureInWindow) {
        filterBtnRef.current.measureInWindow((x, y, w, h) => {
          setFilterBtnLayout({ x, y, width: w, height: h });
          setFilterModalVisible(true);
          setUploadModalVisible(false);
        });
      } else {
        setFilterBtnLayout(null);
        setFilterModalVisible(true);
        setUploadModalVisible(false);
      }
    } catch (err) {
      console.warn('measureInWindow failed for filter button', err);
      setFilterBtnLayout(null);
      setFilterModalVisible(true);
      setUploadModalVisible(false);
    }
  }

  async function openUploadModal() {
    try {
      if (uploadBtnRef.current && uploadBtnRef.current.measureInWindow) {
        uploadBtnRef.current.measureInWindow((x, y, w, h) => {
          setUploadBtnLayout({ x, y, width: w, height: h });
          setUploadModalVisible(true);
          setFilterModalVisible(false);
        });
      } else {
        setUploadBtnLayout(null);
        setUploadModalVisible(true);
        setFilterModalVisible(false);
      }
    } catch (err) {
      console.warn('measureInWindow failed for upload button', err);
      setUploadBtnLayout(null);
      setUploadModalVisible(true);
      setFilterModalVisible(false);
    }
  }

  function closeAnyModal() {
    setFilterModalVisible(false);
    setUploadModalVisible(false);
  }

  function selectFilter(mode) {
    setFilterMode(mode);
    closeAnyModal();
  }
  function clearFilter() {
    setFilterMode('all');
    closeAnyModal();
  }

  async function handleImportCSV() {
    try {
      setImporting(true);
      const result = await ImportService.pickAndImportCSV();
      await loadClients();

      if (result && typeof result.added === 'number') {
        if (result.added > 0) {
          Alert.alert('Clientes importados', `${result.added} clientes añadidos.`);
        } else if (result.added != -1) {
          Alert.alert('Importación', 'No se agregaron clientes nuevos (posibles duplicados).');
        }
      } else {
        Alert.alert('Importación', 'Importación finalizada.');
      }
    } catch (err) {
      console.error('[ClientsScreen] Import error', err);
      Alert.alert('Error', err?.message || 'La importación falló. Revisa el archivo.');
    } finally {
      setImporting(false);
      closeAnyModal();
    }
  }

  function renderItem({ item }) {
    const hasCoords = item.lat !== null && item.lng !== null;
    return (
      <TouchableOpacity
        style={[styles.clientRow, { backgroundColor: colors.cardBg, borderColor: colors.border }]}
        onPress={() => openDetail(item)}
        activeOpacity={0.8}
      >
        <View style={styles.clientTextWrap}>
          <Text style={[styles.clientName, { color: colors.text }]} numberOfLines={1}>
            {item.nombre}
          </Text>
          <Text style={[styles.clientAddress, { color: colors.muted }]} numberOfLines={1}>
            {item.direccion || item.direccion_corta || '—'}
          </Text>
        </View>

        <View style={styles.clientStatusWrap}>
          <MaterialIcons
            name="place"
            size={18}
            color={hasCoords ? colors.success : colors.muted}
            style={{ marginRight: 6 }}
          />
          <View style={[styles.pill, { backgroundColor: hasCoords ? '#E6FFEF' : '#F3F4F6' }]}>
            <Text style={[styles.pillText, { color: hasCoords ? colors.success : colors.muted }]}>
              {hasCoords ? 'Ubicado' : 'Sin ubicar'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  const filtered = clients.filter(c => {
    if (filterMode === 'with') {
      if (c.lat === null || c.lng === null) return false;
    } else if (filterMode === 'without') {
      if (c.lat !== null && c.lng !== null) return false;
    }
    if (!query) return true;
    return (c.nombre || '').toLowerCase().includes(query.toLowerCase());
  });

  // Calcula la posición top/left del menú en base a layout absoluto (en window coords)
  const calcMenuPosition = (btnLayout, menuWidth = 220, menuHeight = 140) => {
    // si no hay layout, fallback centrado
    if (!btnLayout) {
      const left = Math.round((width - menuWidth) / 2);
      const top = Math.round(height * 0.25);
      return { left, top };
    }
    // dejar margen de 8px
    const margin = 8;
    let left = Math.round(btnLayout.x);
    // prefer alinear al borde derecho del botón si no cabe
    if (left + menuWidth + margin > width) {
      left = Math.max(margin, width - menuWidth - margin);
    }
    // top justo debajo del botón
    let top = Math.round(btnLayout.y + btnLayout.height + 8);
    // si no cabe abajo, mostrar arriba del botón
    if (top + menuHeight + margin > height) {
      top = Math.max(margin, btnLayout.y - menuHeight - 8);
    }
    return { left, top };
  };

  return (
    <SafeAreaProvider style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      <View style={styles.outerContainer}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.cardBg, borderColor: colors.border, width: Math.min(720, width - 32), height: CARD_HEIGHT },
          ]}
        >
          {/* Franja superior */}
          <View style={[styles.stripe, { backgroundColor: colors.stripe }]}>
            <View>
              <Text style={styles.appName}>GeoVima</Text>
              <Text style={styles.appSlogan}>Gestión de ubicación de Clientes</Text>
            </View>
          </View>

          {/* Search + acciones */}
          <View style={styles.searchRow}>
            <View style={[styles.searchBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Feather name="search" size={16} color={colors.muted} style={{ marginRight: 8 }} />
              <TextInput
                placeholder="Buscar clientes..."
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={setQuery}
                style={[styles.searchInput, { color: colors.text }]}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
                  <Feather name="x" size={14} color={colors.muted} />
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.actionIcons}>
              <TouchableOpacity
                ref={filterBtnRef}
                onPress={openFilterModal}
                style={styles.iconButton}
                accessibilityLabel="Filtrar"
                disabled={importing}
              >
                <Feather name="filter" size={18} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                ref={uploadBtnRef}
                onPress={openUploadModal}
                style={styles.iconButton}
                accessibilityLabel="Subir / Exportar"
                disabled={importing}
              >
                <Feather name="upload" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Indicator de import en esquina superior derecha de la card */}
          {(importing || exporting) && (
            <View style={styles.importingBadge}>
              <ActivityIndicator size="small" color="#64c27b" />
              <Text style={styles.importingText}>{importing ? 'Importando' : 'Exportando'}</Text>
            </View>
          )}

          {/* Upload modal (flotante, posicionado por measureInWindow) */}
          <Modal visible={uploadModalVisible} transparent animationType="fade" onRequestClose={closeAnyModal}>
            <TouchableWithoutFeedback onPress={closeAnyModal}>
              <View style={styles.modalBackdrop}>
                <TouchableWithoutFeedback>
                  <View
                    style={[
                      styles.modalContent,
                      {
                        width: 220,
                        ...calcMenuPosition(uploadBtnLayout, 220, 110),
                      },
                    ]}
                  >
                    <TouchableOpacity style={styles.uploadOption} onPress={handleImportCSV} disabled={importing}>
                      <MaterialIcons name="file-upload" size={18} color={colors.primary} />
                      <Text style={styles.uploadOptionText}>Importar CSV</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.uploadOption} onPress={() => doExport(false) }>
                      <MaterialIcons name="file-download" size={18} color={colors.primary} />
                      <Text style={styles.uploadOptionText}>Exportar CSV(Todos)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.uploadOption} onPress={() => doExport(true)}>
                      <MaterialIcons name="file-download" size={18} color={colors.primary} />
                      <Text style={styles.uploadOptionText}>Exportar CSV(Ubicados)</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          {/* Filter modal (flotante) */}
          <Modal visible={filterModalVisible} transparent animationType="fade" onRequestClose={closeAnyModal}>
            <TouchableWithoutFeedback onPress={closeAnyModal}>
              <View style={styles.modalBackdrop}>
                <TouchableWithoutFeedback>
                  <View
                    style={[
                      styles.modalContent,
                      {
                        width: 200,
                        ...calcMenuPosition(filterBtnLayout, 200, 150),
                      },
                    ]}
                  >
                    <TouchableOpacity style={styles.filterOption} onPress={() => selectFilter('with')}>
                      <Feather name={filterMode === 'with' ? 'check-circle' : 'circle'} size={16} color={filterMode === 'with' ? colors.primary : colors.muted} />
                      <Text style={styles.filterOptionText}>Con ubicación</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.filterOption} onPress={() => selectFilter('without')}>
                      <Feather name={filterMode === 'without' ? 'check-circle' : 'circle'} size={16} color={filterMode === 'without' ? colors.primary : colors.muted} />
                      <Text style={styles.filterOptionText}>Sin ubicación</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.filterOption} onPress={clearFilter}>
                      <Feather name={filterMode === 'all' ? 'check-circle' : 'circle'} size={16} color={filterMode === 'all' ? colors.primary : colors.muted} />
                      <Text style={styles.filterOptionText}>Mostrar todos</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            </TouchableWithoutFeedback>
          </Modal>

          {/* Lista: scroll interno */}
          <View style={styles.listWrap}>
            {loading ? (
              <ActivityIndicator size="large" />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => String(item.codigo)}
                renderItem={renderItem}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 16 }}
                ListEmptyComponent={<Text style={{ color: colors.muted, marginTop: 20 }}>No hay clientes</Text>}
              />
            )}
          </View>
        </View>
      </View>

      {/* Modal detalle cliente */}
      <Modal visible={detailVisible} animationType="slide" onRequestClose={onDetailClose}>
        {selectedClient ? (
          <ClientDetailScreen client={selectedClient} onClose={onDetailClose} onUpdated={onClientUpdated} />
        ) : (
          <SafeAreaProvider style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text>No hay cliente seleccionado</Text>
            <TouchableOpacity onPress={onDetailClose}><Text>Volver</Text></TouchableOpacity>
          </SafeAreaProvider>
        )}
      </Modal>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  outerContainer: { flex: 1, padding: 16, alignItems: 'center', justifyContent: 'center' },

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

  stripe: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  appName: { color: '#fff', fontWeight: '700', fontSize: 18 },
  appSlogan: { color: '#e7f0ff', fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 6 },

  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchBox: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, height: '100%' },
  clearBtn: { paddingHorizontal: 8 },

  actionIcons: {
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  importingBadge: {
    position: 'absolute',
    right: 12,
    top: 10,
    backgroundColor: '#f5f0ebff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1500,
  },
  importingText: {
    color: '#64c27b',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '600',
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modalContent: {
    position: 'absolute',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },

  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  uploadOptionText: { marginLeft: 10 },

  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  filterOptionText: { marginLeft: 10 },

  listWrap: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    minHeight: 120,
  },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  clientTextWrap: { flex: 1, paddingRight: 8 },
  clientName: { fontSize: 16, fontWeight: '600' },
  clientAddress: { fontSize: 13, marginTop: 4 },

  clientStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
