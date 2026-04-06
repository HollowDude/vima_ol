import React from 'react';
import { StatusBar } from 'react-native';
import AppNavigator from './src/core/navigation/AppNavigator';
import { SyncProvider } from './src/core/context/SyncContext';

export default function App() {
  return (
    <SyncProvider>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f0ebff" />
      <AppNavigator />
    </SyncProvider>
  );
}