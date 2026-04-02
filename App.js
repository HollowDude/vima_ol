import React from 'react';
import { StatusBar } from 'react-native';
import AppNavigator from './src/core/navigation/AppNavigator';

export default function App() {
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#f5f0ebff" />
      <AppNavigator />
    </>
  );
}