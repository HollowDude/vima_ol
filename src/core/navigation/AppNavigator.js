import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import LoginScreen from '../../modules/Auth/screens/LoginScreen';
import HomeScreen from '../../modules/Home/screens/HomeScreen';
import TasksScreen from '../../modules/Tasks/screens/TasksScreen';
import ClientsScreen from '../../modules/Clients/screens/ClientsScreen';
import LeadsScreen from '../../modules/Leads/screens/LeadsScreen';
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

  useEffect(() => {
    if (!userData) return;
    const handleUser = async () => {
      try {
        const user = await SyncService.getCurrentUser();
        if (user?.[0]?.partner_id?.[1]) {
          setUsername(user[0].partner_id[1]);
        }
      } catch (e) {
        console.error('[AppNavigator] Error obteniendo usuario:', e);
      }
    };
    handleUser();
  }, [userData]);

  const checkAuth = async () => {
    try {
      const authData = await StorageService.getAuthData();
      if (authData?.uid && authData?.password) {
        OdooService.uid      = authData.uid;
        OdooService.password = authData.password;
        setUserData(authData);
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error('[AppNavigator] Check auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = (authData) => {
    setUserData(authData);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setUserData(null);
    setIsAuthenticated(false);
    setCurrentScreen('home');
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

  // Props comunes a todas las pantallas autenticadas
  const sharedProps = {
    userData,
    username,
    onLogout: handleLogout,
  };

  return (
    <SyncProvider>
      {currentScreen === 'tasks' && (
        <TasksScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'clients' && (
        <ClientsScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'leads' && (
        <LeadsScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
        />
      )}
      {currentScreen === 'home' && (
        <HomeScreen
          {...sharedProps}
          onNavigateToTasks={()   => setCurrentScreen('tasks')}
          onNavigateToClients={() => setCurrentScreen('clients')}
          onNavigateToLeads={()   => setCurrentScreen('leads')}
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