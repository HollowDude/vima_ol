import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, ScrollView, RefreshControl } from 'react-native';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import MenuItem from '../../../core/components/MenuItem';
import ScreenLayout from '../../../core/components/ScreenLayout';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import OdooService from '../../../core/api/odoo.service';
import StorageService from '../../../core/storage/storage.service';
import SyncService from '../../../core/sync/sync.service';
import { useSyncContext } from '../../../core/context/SyncContext';
import { usePrevious } from '../../../core/hooks/usePrevious';

export default function HomeScreen({
  userData, 
  onLogout, 
  username,
  onNavigateToTasks, 
  onNavigateToClients, 
  onNavigateToLeads,
  onNavigateToSyncHistory,
  onUnauthorized = () => {},
}) {
  const { isOnline } = useNetwork();
  
  const { syncAll }  = useSyncActions(onUnauthorized);
  const { lastSync } = useSyncContext();

  const [menuVisible, setMenuVisible]   = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [clientsCount, setClientsCount] = useState(0);
  const [leadsCount, setLeadsCount]     = useState(0);
  const [leadsStats, setLeadsStats]     = useState([]);
  const [tasksStats, setTasksStats]     = useState({ active: 0, done: 0 });
  const [isReady, setIsReady]           = useState(false);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => { 
    loadLocalData().finally(() => setIsReady(true)); 
  }, []);

  useEffect(() => {
    if (!isReady) return;
    if (prevOnline === false && isOnline === true) {
      syncAll().then(() => loadLocalData());
    }
  }, [isOnline, prevOnline, isReady, syncAll]);

  const loadLocalData = async () => {
    try {
      const [clients, leads, stats, result] = await Promise.all([
        SyncService.getLocalClients(),
        SyncService.getLocalLeads(),
        SyncService.getLeadsStatsByStage(),
        SyncService.getAllVisibleTasks(),
      ]);
      setClientsCount(clients.length);
      setLeadsCount(leads.length);
      setLeadsStats(stats.filter(s => s.count > 0));
      let active = 0, done = 0;
      result.tasks.forEach(t => {
        if (['01_in_progress', '02_changes_requested', '03_approved', '04_waiting_normal'].includes(t.state)) active++;
        else if (t.state === '1_done') done++;
      });
      setTasksStats({ active, done });
    } catch (e) { 
      console.error('[Home]', e); 
    }
  };

  const handleRefresh = async () => {
    if (!isOnline) { 
      Alert.alert('Sin conexión', 'Necesitas internet para sincronizar'); 
      return; 
    }
    try { 
      setRefreshing(true); 
      await syncAll(); 
      await loadLocalData(); 
    }
    finally { 
      setRefreshing(false); 
    }
  };

  const handleLogout = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', 
        style: 'destructive',
        onPress: onLogout,
      },
    ]);
  };

  const getTimeAgo = (d) => {
    if (!d) return 'Nunca';
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60)    return 'Hace un momento';
    if (s < 3600)  return `Hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `Hace ${Math.floor(s / 3600)} h`;
    return `Hace ${Math.floor(s / 86400)} días`;
  };

  const menuItems = [
    {
      icon: 'users', 
      title: 'Clientes', 
      subtitle: 'Gestiona tus clientes',
      stats: [{ value: clientsCount, label: 'Total' }],
      onPress: onNavigateToClients,
    },
    {
      icon: 'briefcase', 
      title: 'Oportunidades', 
      subtitle: 'Flujo de Oportunidades',
      stats: leadsStats.length > 0
        ? leadsStats.slice(0, 3).map(s => ({ value: s.count, label: s.stageName }))
        : [{ value: leadsCount, label: 'Total' }],
      onPress: onNavigateToLeads,
    },
    {
      icon: 'check-square', 
      title: 'Tareas', 
      subtitle: 'Visitas y Seguimientos',
      stats: [
        { value: tasksStats.active, label: 'Activas' },
        { value: tasksStats.done,   label: 'Hechas'  },
      ],
      onPress: onNavigateToTasks,
    },
  ];

  return (
    <ScreenLayout
      userData={userData}
      username={username}
      onLogout={handleLogout}
      menuVisible={menuVisible}
      setMenuVisible={setMenuVisible}
      onNavigateToSyncHistory={onNavigateToSyncHistory}
      onUnauthorized={onUnauthorized}
    >
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
          <DashboardHeader userName={username || 'Usuario'} isOnline={isOnline} />
          <View style={styles.menuContent}>
            {menuItems.map((item, i) => <MenuItem key={i} {...item} />)}
          </View>
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {isOnline ? 'Conectado' : 'Modo offline'} · Última sync: {getTimeAgo(lastSync)}
          </Text>
        </View>
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80, paddingBottom: 140 },
  mainCard:      { marginBottom: 16 },
  menuContent:   { padding: 16 },
  footer:        { alignItems: 'center', paddingVertical: 20 },
  footerText:    { fontSize: 12, color: '#9CA3AF' },
});