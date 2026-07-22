import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, TextInput, Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import ClientCard from '../../../core/components/ClientCard';
import ClientDetailModal from '../../../core/components/ClientDetailModal';
import ScreenLayout from '../../../core/components/ScreenLayout';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import SyncService from '../../../core/sync/sync.service';
import { useSyncContext } from '../../../core/context/SyncContext';
import { usePrevious } from '../../../core/hooks/usePrevious';
import OdooService from '../../../core/api/odoo.service';

export default function ClientsScreen({ userData, username, onBack, onLogout, onNavigateToSyncHistory }) {
  const { isOnline }            = useNetwork();
  const { syncAll, syncModule } = useSyncActions();
  const { refreshPendingCount } = useSyncContext();

  const [clients, setClients]                   = useState([]);
  const [filteredClients, setFilteredClients]   = useState([]);
  const [selectedClient, setSelectedClient]     = useState(null);
  const [refreshing, setRefreshing]             = useState(false);
  const [searchQuery, setSearchQuery]           = useState('');
  const [loading, setLoading]                   = useState(false);
  const [menuVisible, setMenuVisible]           = useState(false);
  // true = sólo mis clientes, false = todos
  const [showOnlyOwn, setShowOnlyOwn]           = useState(true);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => { loadClients(); }, []);

  useEffect(() => {
    if (prevOnline === false && isOnline === true) {
      syncAll().then(() => loadClients());
    }
  }, [isOnline, prevOnline]);

  useEffect(() => { filterClients(); }, [searchQuery, clients, showOnlyOwn]);

  const loadClients = async () => {
    try {
      setLoading(true);
      const local = await SyncService.getLocalClients();
      setClients(local);
    } catch (e) {
      console.error('❌ Error cargando clientes:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!isOnline) { Alert.alert('Sin conexión', 'Necesitas internet para sincronizar'); return; }
    try {
      setRefreshing(true);
      await syncModule('clients');
      await loadClients();
    } finally {
      setRefreshing(false);
    }
  };

  const filterClients = () => {
    const currentUserId = OdooService.uid;

    let base = clients;

    // Filtro propio / todos
    if (showOnlyOwn) {
      base = base.filter(c => {
        const clientUserId = Array.isArray(c.user_id) ? c.user_id[0] : c.user_id;
        return clientUserId === currentUserId;
      });
    }

    // Filtro de búsqueda
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(c =>
        (c.name   || '').toLowerCase().includes(q) ||
        (c.email  || '').toLowerCase().includes(q) ||
        (c.phone  || '').includes(q) ||
        (c.mobile || '').includes(q)
      );
    }

    setFilteredClients(base);
  };

  const handleCloseClientModal = async () => {
    setSelectedClient(null);
    await refreshPendingCount();
  };

  const handleClientUpdated = (updated) => {
    const upd = list => list.map(c => c.id === updated.id ? updated : c);
    setClients(upd);
  };

  const fabActions = [
    { icon: 'more-vertical', onPress: () => {}                   },
    { icon: 'menu',          onPress: () => setMenuVisible(true) },
    { icon: 'arrow-left',    onPress: onBack                     },
  ];

  const ownCount = clients.filter(c => {
    const uid = Array.isArray(c.user_id) ? c.user_id[0] : c.user_id;
    return uid === OdooService.uid;
  }).length;

  return (
    <ScreenLayout
      userData={userData}
      username={username}
      onLogout={onLogout}
      menuVisible={menuVisible}
      setMenuVisible={setMenuVisible}
      fabActions={fabActions}
      onNavigateToSyncHistory={onNavigateToSyncHistory}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            tintColor="#64c27b" colors={['#64c27b']} />
        }
      >
        <Card style={styles.mainCard}>
          <DashboardHeader userName={username || 'Usuario'} isOnline={isOnline} />

          <View style={styles.content}>

            {/* ── Toggle Mis clientes / Todos ── */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, showOnlyOwn && styles.toggleBtnActive]}
                onPress={() => setShowOnlyOwn(true)}
                activeOpacity={0.8}
              >
                <Feather name="user-check" size={13} color={showOnlyOwn ? '#fff' : '#9CA3AF'} />
                <Text style={[styles.toggleBtnTxt, showOnlyOwn && styles.toggleBtnTxtActive]}>
                  Mis clientes ({ownCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, !showOnlyOwn && styles.toggleBtnActive]}
                onPress={() => setShowOnlyOwn(false)}
                activeOpacity={0.8}
              >
                <Feather name="users" size={13} color={!showOnlyOwn ? '#fff' : '#9CA3AF'} />
                <Text style={[styles.toggleBtnTxt, !showOnlyOwn && styles.toggleBtnTxtActive]}>
                  Todos ({clients.length})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Buscador */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar cliente..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>

            {/* Contador */}
            <Text style={styles.counter}>
              {loading
                ? 'Cargando...'
                : `${filteredClients.length} ${filteredClients.length === 1 ? 'cliente' : 'clientes'}` +
                  (searchQuery ? ` encontrado${filteredClients.length === 1 ? '' : 's'}` : '')
              }
            </Text>

            {/* Lista */}
            {filteredClients.length === 0 && !loading ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>
                  {searchQuery ? 'No se encontraron clientes' : 'No hay clientes'}
                </Text>
                {!isOnline && !searchQuery && (
                  <Text style={styles.emptySubtext}>Conéctate para sincronizar</Text>
                )}
              </View>
            ) : (
              filteredClients.map(client => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onPress={() => setSelectedClient(client)}
                />
              ))
            )}
          </View>
        </Card>
      </ScrollView>

      <ClientDetailModal
        visible={!!selectedClient}
        client={selectedClient}
        onClose={handleCloseClientModal}
        onClientUpdated={handleClientUpdated}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80 },
  mainCard:      { marginBottom: 16 },
  content:       { padding: 16 },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 3,
    marginBottom: 14,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#64c27b',
    shadowColor: '#64c27b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  toggleBtnTxtActive: {
    color: '#fff',
  },

  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16,
  },
  searchIcon:   { marginRight: 8 },
  searchInput:  { flex: 1, fontSize: 15, color: '#0B1B2A' },
  counter:      { fontSize: 13, fontWeight: '600', color: '#6B7280', marginBottom: 12 },
  emptyState:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText:    { fontSize: 16, fontWeight: '600', color: '#9CA3AF', marginTop: 16 },
  emptySubtext: { fontSize: 13, color: '#D1D5DB', marginTop: 8 },
});