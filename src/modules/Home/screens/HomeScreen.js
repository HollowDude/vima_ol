import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, RefreshControl,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import MenuItem from '../../../core/components/MenuItem';
import SlideMenu from '../../../core/components/SlideMenu';
import useNetwork from '../../../core/hooks/useNetwork';
import OdooService from '../../../core/api/odoo.service';
import StorageService from '../../../core/storage/storage.service';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';

export default function HomeScreen({ userData, onLogout, username, onNavigateToTasks, onNavigateToClients, onNavigateToLeads }) {
  const { isOnline } = useNetwork();
  const [actionStatus, setActionStatus] = useState(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  
  const [clientsCount, setClientsCount] = useState(0);
  const [leadsCount, setLeadsCount] = useState(0);
  const [leadsStats, setLeadsStats] = useState([]);
  const [tasksStats, setTasksStats] = useState({
    active: 0,
    done: 0,
  });

  const [isReady, setIsReady] = useState(false);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => {
    const initData = async () => {
      try {
        setActionStatus('Cargando...');
        await loadLocalData();
      } catch (err) {
        console.log('[Init] Error:', err);
      } finally {
        setActionStatus(null);
        setIsReady(true); 
      }
    };

    initData();
  }, []); 

  useEffect(() => {
    if (!isReady) return;

    const isReconnection = !prevOnline && isOnline;

    if (isReconnection) {
      
      const runSync = async () => {
        try {
          setActionStatus('Sincronizando...');
          await syncData();
        } catch (error) {
        } finally {
          setActionStatus(null);
        }
      };

      runSync();
    }
  }, [isOnline, prevOnline, isReady]);

  const getStatusColor = () => {
    if (!isOnline) return '#504b4bff'; 
    if (actionStatus) return '#e8c39e'; 
    return '#64c27b'; 
  };

  const calculateTaskStats = (tasks) => {
    let active = 0;
    let done = 0;

    tasks.forEach(task => {
      const state = task.state;
      if (['01_in_progress', '02_changes_requested', '03_approved', '04_waiting_normal'].includes(state)) {
        active++;
      } else if (state === '1_done') {
        done++;
      }
    });

    setTasksStats({ active, done });
  };

  const loadLocalData = async () => {
    try {
      const clients = await SyncService.getLocalClients();
      setClientsCount(clients.length);
      
      const leads = await SyncService.getLocalLeads();
      setLeadsCount(leads.length);
      
      const stats = await SyncService.getLeadsStatsByStage();
      setLeadsStats(stats.filter(s => s.count > 0)); 
      
      const result = await SyncService.getAllVisibleTasks(userData.uid);
      calculateTaskStats(result.tasks);

      const lastSyncDate = await SyncService.getLastSyncDate();
      setLastSync(lastSyncDate);
    } catch (error) {
      console.error('[Home] Error loading local data:', error);
      setActionStatus(null);
    } finally {
      setActionStatus(null);
    }
  };

  const syncData = async () => {
    try {
      const result = await SyncService.syncAll();
      
      setClientsCount(result.clients.length);
      setLeadsCount(result.leads ? result.leads.length : 0);
      
      const stats = await SyncService.getLeadsStatsByStage();
      setLeadsStats(stats.filter(s => s.count > 0));
      
      const tasksResult = await SyncService.getAllVisibleTasks();
      calculateTaskStats(tasksResult.tasks);
      
      const lastSyncDate = await SyncService.getLastSyncDate();
      setLastSync(lastSyncDate);
    } catch (error) {
      console.error('[Home] Error syncing:', error);
      Alert.alert('Error', 'No se pudo sincronizar. Intenta de nuevo.');
    } 
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Sin conexión', 'Necesitas conexión a internet para sincronizar');
      return;
    }

    try {
      setActionStatus('Sincronizando...');
      setRefreshing(true);
      await syncData();
    } catch (error) {
      console.error('[Home] Error refreshing:', error);
      Alert.alert('Error', 'No se pudo sincronizar. Intenta de nuevo.');
    } finally {
      setRefreshing(false);
      setActionStatus(null);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro de que deseas salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            try {
              await StorageService.clearAuthData();
              await SyncService.clearLocalData();
              OdooService.clearSession();
              if (onLogout) onLogout();
            } catch (error) {
              console.error('[Logout] Error:', error);
            }
          },
        },
      ]
    );
  };

  const getTimeAgo = (date) => {
    if (!date) return 'Nunca';
    
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return 'Hace un momento';
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
    return `Hace ${Math.floor(diff / 86400)} días`;
  };

  const menuItems = [
    {
      icon: 'users',
      title: 'Clientes',
      subtitle: 'Gestiona tus clientes',
      stats: [
        { value: clientsCount, label: 'Total' },
      ],
      onPress: onNavigateToClients,
    },
    {
      icon: 'briefcase',
      title: 'Oportunidades',
      subtitle: 'Flujo de Oportunidades',
      stats: leadsStats.length > 0 
        ? leadsStats.slice(0, 3).map(s => ({ 
            value: s.count, 
            label: s.stageName 
          }))
        : [{ value: leadsCount, label: 'Total' }],
      onPress: onNavigateToLeads,
    },
    {
      icon: 'check-square',
      title: 'Tareas',
      subtitle: 'Visitas y Seguimientos',
      stats: [
        { value: tasksStats.active, label: 'Activas' },
        { value: tasksStats.done, label: 'Hechas' },
      ],
      onPress: onNavigateToTasks,
    },
  ];

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity 
          style={[styles.menuButton, {backgroundColor:getStatusColor()}]} 
          onPress={() => setMenuVisible(true)} 
          activeOpacity={0.8}
        >
          <Feather name="menu" size={24} color="#fff" />
        </TouchableOpacity>

        <SlideMenu 
          visible={menuVisible} 
          onClose={() => setMenuVisible(false)} 
          userData={userData}
          username={username} 
          action={actionStatus}
          onLogout={handleLogout} 
        />

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
            
            <View style={styles.menuContent}>
              {menuItems.map((item, index) => (
                <MenuItem key={index} {...item} />
              ))}
            </View>
          </Card>

          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
              <Text style={styles.footerText}>
                {isOnline ? 'Conectado' : 'Modo offline'}
              </Text>
            </View>
            <Text style={styles.footerSubtext}>
              Última sincronización: {getTimeAgo(lastSync)}
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#f5f0ebff' 
  },
  container: { 
    flex: 1 
  },
  menuButton: { 
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
    elevation: 5 
  },
  scrollView: { 
    flex: 1 
  },
  scrollContent: { 
    padding: 16, 
    paddingTop: 80,
    paddingBottom: 120,
  },
  mainCard: { 
    marginBottom: 16 
  },
  menuContent: { 
    padding: 16 
  },
  footer: { 
    alignItems: 'center', 
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  footerText: { 
    fontSize: 13, 
    fontWeight: '600', 
    color: '#6B7280',
  },
  footerSubtext: { 
    fontSize: 12, 
    color: '#9CA3AF' 
  },
});