import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import LoginScreen from '../../modules/Auth/screens/LoginScreen';
import HomeScreen from '../../modules/Home/screens/HomeScreen';
import TasksScreen from '../../modules/Tasks/screens/TasksScreen';
import ClientsScreen from '../../modules/Clients/screens/ClientsScreen';
import LeadsScreen from '../../modules/Leads/screens/LeadsScreen'; 
import StorageService from '../storage/storage.service';
import OdooService from '../api/odoo.service';
import syncService from '../sync/sync.service';


export default function AppNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [currentScreen, setCurrentScreen] = useState('home');
  const [username, setUsername] = useState();

  useEffect(() => {
    checkAuth();
    const handleUser = async () =>{
        const user = await syncService.getCurrentUser()
        setUsername(user[0].partner_id[1])
      }
  
      handleUser();
  }, [userData]);

  const checkAuth = async () => {
    try {
      const authData = await StorageService.getAuthData();
      
      if (authData && authData.uid && authData.password) {
        OdooService.uid = authData.uid;
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

  if (isAuthenticated) {
    if (currentScreen === 'tasks') {
      return (
        <TasksScreen
          userData={userData}
          username={username}
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    if (currentScreen === 'clients') {
      return (
        <ClientsScreen
          userData={userData}
          username={username}
          onBack={() => setCurrentScreen('home')}
        />
      );
    }

    if (currentScreen === 'leads') {
      return (
        <LeadsScreen
          userData={userData}
          username={username}
          onBack={() => setCurrentScreen('home')}
        />
      );
    }
    
    return (
      <HomeScreen
        userData={userData}
        username={username}
        onLogout={handleLogout}
        onNavigateToTasks={() => setCurrentScreen('tasks')}
        onNavigateToClients={() => setCurrentScreen('clients')}
        onNavigateToLeads={() => setCurrentScreen('leads')} 
      />
    );
  }

  return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#f5f0ebff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});