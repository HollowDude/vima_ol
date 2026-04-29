import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import LoginScreen from '../../modules/Auth/screens/LoginScreen';
import HomeScreen from '../../modules/Home/screens/HomeScreen';
import TasksScreen from '../../modules/Tasks/screens/TasksScreen';
import ClientsScreen from '../../modules/Clients/screens/ClientsScreen';
import LeadsScreen from '../../modules/Leads/screens/LeadsScreen';
import SyncHistoryScreen from '../../modules/SyncHistory/screens/SyncHistoryScreen';
import StorageService from '../storage/storage.service';
import OdooService from '../api/odoo.service';
import SyncService from '../sync/sync.service';
import { SyncProvider } from '../context/SyncContext';

export default function AppNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading]             = useState(true);
  const [userData, setUserData]               = useState(null);
  const [currentScreen, setCurrentScreen]     = useState('home');
  const [username, setUsername]               = useState('');

  useEffect(() => {
    checkAuth();
  }, []);

  const loadCurrentUsername = async () => {
    try {
      const currentUser = await OdooService.searchRead(
        'res.users',
        [['id', '=', OdooService.uid]],
        ['name', 'login', 'partner_id'],
      );

      if (currentUser && currentUser.length > 0) {
        const userFullName = currentUser[0].name || currentUser[0].login || 'Usuario';
        console.log('[AppNavigator] Usuario cargado:', userFullName);
        setUsername(userFullName);
        return userFullName;
      }
    } catch (e) {
      console.error('[AppNavigator] Error obteniendo nombre del usuario:', e);
    }
    
    return null;
  };

  const checkAuth = async () => {
    try {
      const authData = await StorageService.getAuthData();
      if (authData?.uid && authData?.password) {
        OdooService.uid      = authData.uid;
        OdooService.password = authData.password;
        setUserData(authData);
        setIsAuthenticated(true);
        await loadCurrentUsername();
      }
    } catch (error) {
      console.error('[AppNavigator] Check auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = async (authData) => {
    setUserData(authData);
    setIsAuthenticated(true);
    await loadCurrentUsername();
  };

  const handleLogout = async (isUnauthorized = false) => {
    try {
      console.log('[AppNavigator] Iniciando logout...');
      setUsername('');
      await StorageService.clearAuthData();
      await SyncService.clearLocalData();
      OdooService.clearSession();
      setUserData(null);
      setIsAuthenticated(false);
      setCurrentScreen('home');
      console.log('[AppNavigator] Logout completado');
    } catch (error) {
      console.error('[AppNavigator] Error en logout:', error);
      setUsername('');
      setUserData(null);
      setIsAuthenticated(false);
      setCurrentScreen('home');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#64c27b" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  const sharedProps = {
    userData,
    username,
    onLogout: () => handleLogout(false),
    onNavigateToLeads: () => setCurrentScreen('leads'),
    onNavigateToTasks: () => setCurrentScreen('tasks'),
    onNavigateToSyncHistory: () => setCurrentScreen('syncHistory'),
  };

  return (
    <SyncProvider>
      {currentScreen === 'tasks' && (
        <TasksScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
          onUnauthorized={() => handleLogout(true)}
        />
      )}
      {currentScreen === 'clients' && (
        <ClientsScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
          onUnauthorized={() => handleLogout(true)}
        />
      )}
      {currentScreen === 'leads' && (
        <LeadsScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
          onUnauthorized={() => handleLogout(true)}
        />
      )}
      {currentScreen === 'syncHistory' && (
        <SyncHistoryScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'home' && (
        <HomeScreen
          {...sharedProps}
          onNavigateToTasks={() => setCurrentScreen('tasks')}
          onNavigateToClients={() => setCurrentScreen('clients')}
          onNavigateToLeads={() => setCurrentScreen('leads')}
          onNavigateToSyncHistory={() => setCurrentScreen('syncHistory')}
          onUnauthorized={() => handleLogout(true)}
        />
      )}
    </SyncProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f0ebff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});