import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import ClientCard from '../../../core/components/ClientCard';
import ClientDetailModal from '../../../core/components/ClientDetailModal';
import useNetwork from '../../../core/hooks/useNetwork';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';

export default function ClientsScreen({ userData, username, onBack }) {
  const { isOnline } = useNetwork();
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionStatus, setActionStatus] = useState(null);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
      let isActive = true; 
  
      const handleReconnection = async () => {
        if (prevOnline === false && isOnline === true) {
          
          try {
            setActionStatus('Sincronizando...');
            
            await SyncService.syncAll(); 
            
            if (isActive) {
              await loadClients();
            }
            
          } catch (error) {
          } finally {
            if (isActive) {
              setActionStatus(null);
            }
          }
        }
      };
  
      handleReconnection();
  
      return () => { isActive = false; };
    }, [isOnline, prevOnline]); 

  useEffect(() => {
    filterClients();
  }, [searchQuery, clients]);

  const getStatusColor = () => {
    if (!isOnline) return '#504b4bff'; 
    if (actionStatus) return '#e8c39e'; 
    return '#64c27b'; 
  };

  const loadClients = async () => {
    try {
      setActionStatus('Cargando...')
      const localClients = await SyncService.getLocalClients();
      setClients(localClients);
      setFilteredClients(localClients);
    } catch (error) {
      console.error('❌ Error cargando clientes:', error);
      setActionStatus(null)
    }
    setActionStatus(null)
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Sin conexión', 'Necesitas conexión a internet para sincronizar');
      return;
    }

    try {
      setRefreshing(true);
      setActionStatus('Sincronizando...');
      
      const syncedClients = await SyncService.syncClients();
      setClients(syncedClients);
      setFilteredClients(syncedClients);
      
      setActionStatus(null);
    } catch (error) {
      console.error('❌ Error sincronizando:', error);
      Alert.alert('Error', 'No se pudo sincronizar. Intenta de nuevo.');
      setActionStatus(null);
    } finally {
      setRefreshing(false);
    }
  };

  const filterClients = () => {
    if (!searchQuery.trim()) {
      setFilteredClients(clients);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = clients.filter(client => {
      const name = (client.name || '').toLowerCase().includes(query);
      const email = (client.email || '').toLowerCase().includes(query);
      const phone = client.phone || '';
      const mobile = client.mobile || '';
      
      return name || 
             email || 
             phone.includes(query) || 
             mobile.includes(query);
    });
    
    setFilteredClients(filtered);
  };

  const handleClientUpdated = (updatedClient) => {
    // Actualizar la lista local de clientes
    const updatedList = clients.map(c => 
      c.id === updatedClient.id ? updatedClient : c
    );
    setClients(updatedList);
    
    // Actualizar filtrados también
    const updatedFiltered = filteredClients.map(c => 
      c.id === updatedClient.id ? updatedClient : c
    );
    setFilteredClients(updatedFiltered);
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity style={[styles.backButton, {backgroundColor: getStatusColor()}]} onPress={onBack} activeOpacity={0.8}>
          <Feather name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#64c27b"
              colors={['#64c27b']}
            />
          }
        >
          <Card style={styles.mainCard}>
            <DashboardHeader
              userName={username || 'Usuario'}
              isOnline={isOnline}
              actionStatus={actionStatus}
            />

            <View style={styles.content}>
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
                {filteredClients.length} {filteredClients.length === 1 ? 'cliente' : 'clientes'}
                {searchQuery && ` encontrado${filteredClients.length === 1 ? '' : 's'}`}
              </Text>

              {/* Lista de clientes */}
              {filteredClients.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="users" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyText}>
                    {searchQuery ? 'No se encontraron clientes' : 'No hay clientes'}
                  </Text>
                  {!isOnline && !searchQuery && (
                    <Text style={styles.emptySubtext}>
                      Conéctate para sincronizar
                    </Text>
                  )}
                </View>
              ) : (
                filteredClients.map((client) => (
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
          onClose={() => setSelectedClient(null)}
          onClientUpdated={handleClientUpdated}
        />
      </View>
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
  backButton: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#64c27b',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 80,
  },
  mainCard: {
    marginBottom: 16,
  },
  content: {
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0B1B2A',
  },
  counter: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#D1D5DB',
    marginTop: 8,
  },
});