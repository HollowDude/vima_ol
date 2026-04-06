import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSyncContext } from '../context/SyncContext';

export default function DashboardHeader({ userName, isOnline }) {
  const { statusLabel, isSyncing, pendingCount } = useSyncContext();
  const spinAnim = useRef(new Animated.Value(0)).current;
  const loopRef  = useRef(null);

  // Spinner mientras sincroniza
  useEffect(() => {
    if (isSyncing) {
      loopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        })
      );
      loopRef.current.start();
    } else {
      loopRef.current?.stop();
      spinAnim.setValue(0);
    }
    return () => loopRef.current?.stop();
  }, [isSyncing]);

  const spin = spinAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getBg = () => {
    if (!isOnline) return '#504b4bff';
    if (isSyncing) return '#e8a83e';
    return '#64c27b';
  };

  const getStatusText = () => {
    if (!isOnline) return 'Sin conexión';
    if (statusLabel) return statusLabel;
    if (pendingCount > 0) return `${pendingCount} cambio${pendingCount > 1 ? 's' : ''} por subir`;
    return 'En línea';
  };

  const getIcon = () => {
    if (!isOnline)        return 'wifi-off';
    if (isSyncing)        return 'refresh-cw';
    if (pendingCount > 0) return 'upload-cloud';
    return 'wifi';
  };

  return (
    <View style={[styles.header, { backgroundColor: getBg() }]}>
      <View style={styles.leftSection}>
        {isSyncing ? (
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Feather name="refresh-cw" size={18} color="#fff" />
          </Animated.View>
        ) : (
          <Feather name={getIcon()} size={18} color="#fff" />
        )}
        <Text style={styles.statusText} numberOfLines={1}>
          {getStatusText()}
        </Text>
      </View>

      <View style={styles.rightSection}>
        <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
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
    gap: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 10,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    maxWidth: 120,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});