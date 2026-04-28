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

  /**
   * Obtiene el nombre del usuario autenticado directamente de Odoo
   * Usa el campo 'name' del modelo res.users (NO partner_id)
   */
  const loadCurrentUsername = async () => {
    try {
      // Obtener el usuario actual desde Odoo usando el uid almacenado
      const currentUser = await OdooService.searchRead(
        'res.users',
        [['id', '=', OdooService.uid]],
        ['name', 'login', 'partner_id'], // Traer el campo 'name' del usuario
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
        
        // 🔥 IMPORTANTE: Cargar el nombre DESPUÉS de establecer la autenticación
        await loadCurrentUsername();
      }
    } catch (error) {
      console.error('[AppNavigator] Check auth error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSuccess = async (authData) => {
    // Establecer datos de autenticación
    setUserData(authData);
    setIsAuthenticated(true);
    
    // 🔥 CRÍTICO: Cargar el nombre INMEDIATAMENTE después del login
    // Esto asegura que se obtenga del usuario recién autenticado
    await loadCurrentUsername();
  };

  /**
   * Maneja el logout limpiando toda la sesión y datos locales
   * @param {boolean} isUnauthorized - Si es true, indica que fue por error de autorización
   */
  const handleLogout = async (isUnauthorized = false) => {
    try {
      console.log('[AppNavigator] Iniciando logout...');
      
      // 1. 🔥 PRIMERO: Limpiar username (antes de borrar auth data)
      setUsername('');
      
      // 2. Limpiar almacenamiento
      await StorageService.clearAuthData();
      
      // 3. Limpiar datos de sincronización
      await SyncService.clearLocalData();
      
      // 4. Limpiar sesión de Odoo
      OdooService.clearSession();
      
      // 5. Reset de estado
      setUserData(null);
      setIsAuthenticated(false);
      setCurrentScreen('home');
      
      console.log('[AppNavigator] Logout completado');
      
    } catch (error) {
      console.error('[AppNavigator] Error en logout:', error);
      // Aún así hacer reset de estado aunque haya error
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