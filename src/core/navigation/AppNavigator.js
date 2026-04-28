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

  /**
   * Maneja el logout limpiando toda la sesión y datos locales
   * @param {boolean} isUnauthorized - Si es true, indica que fue por error de autorización
   */
  const handleLogout = async (isUnauthorized = false) => {
    try {
      console.log('[AppNavigator] Iniciando logout...');
      
      // 1. Limpiar almacenamiento
      await StorageService.clearAuthData();
      
      // 2. Limpiar datos de sincronización
      await SyncService.clearLocalData();
      
      // 3. Limpiar sesión de Odoo
      OdooService.clearSession();
      
      // 4. Reset de estado
      setUserData(null);
      setIsAuthenticated(false);
      setCurrentScreen('home');
      setUsername('');
      
      console.log('[AppNavigator] Logout completado');
      
      // Si fue por autorización inválida, el toast ya fue mostrado por el error handler
      // Si fue logout manual, el usuario verá la pantalla de login
      
    } catch (error) {
      console.error('[AppNavigator] Error en logout:', error);
      // Aún así hacer reset de estado aunque haya error
      setUserData(null);
      setIsAuthenticated(false);
      setCurrentScreen('home');
      setUsername('');
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

  // Props comunes a todas las pantallas autenticadas
  const sharedProps = {
    userData,
    username,
    onLogout: () => handleLogout(false), // Logout manual desde el menú
  };

  return (
    <SyncProvider>
      {currentScreen === 'tasks' && (
        <TasksScreen
          {...sharedProps}
          onBack={() => setCurrentScreen('home')}
          onUnauthorized={() => handleLogout(true)} // Logout por autorización inválida
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
      {currentScreen === 'home' && (
        <HomeScreen
          {...sharedProps}
          onNavigateToTasks={()   => setCurrentScreen('tasks')}
          onNavigateToClients={() => setCurrentScreen('clients')}
          onNavigateToLeads={()   => setCurrentScreen('leads')}
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