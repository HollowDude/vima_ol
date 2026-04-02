import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function DashboardHeader({ 
  userName, 
  isOnline, 
  actionStatus = null 
}) {
  const getStatusColor = () => {
    if (!isOnline) return '#504b4bff';
    if (actionStatus) return '#e8c39e'; 
    return '#64c27b'; // Verde online
  };

  const getStatusText = () => {
    if (!isOnline) return 'Sin conexión';
    if (actionStatus) return actionStatus;
    return 'En línea';
  };

  return (
    <View style={[styles.header, { backgroundColor: getStatusColor() }]}>
      {/* Lado izquierdo: Estado/Acción */}
      <View style={styles.leftSection}>
        {actionStatus ? (
          <>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </>
        ) : (
          <>
            <Feather 
              name={isOnline ? 'wifi' : 'wifi-off'} 
              size={18} 
              color="#fff" 
            />
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </>
        )}
      </View>

      {/* Lado derecho: Usuario */}
      <View style={styles.rightSection}>
        <Text style={styles.userName} numberOfLines={1}>
          {userName}
        </Text>
        <View style={styles.avatar}>
          <Feather name="user" size={20} color="#fff" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    width: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 8,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginRight: 10,
    maxWidth: 120,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});