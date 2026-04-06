import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSyncContext } from '../context/SyncContext';

const TOAST_CONFIG = {
  success: { bg: '#64c27b', icon: 'check-circle'   },
  error:   { bg: '#EF4444', icon: 'alert-circle'   },
  warning: { bg: '#F59E0B', icon: 'alert-triangle' },
  info:    { bg: '#3B82F6', icon: 'info'            },
  sync:    { bg: '#0B1B2A', icon: 'refresh-cw'      },
};

function ToastItem({ toast, onDismiss }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;
  const translateX = useRef(new Animated.Value(20)).current;
  const cfg = TOAST_CONFIG[toast.type] || TOAST_CONFIG.info;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(opacity,    { toValue: 1, useNativeDriver: true, friction: 8 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(opacity,    { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -10, duration: 180, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 16,  duration: 180, useNativeDriver: true }),
    ]).start(() => onDismiss(toast.id));
  };

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: cfg.bg, opacity, transform: [{ translateY }, { translateX }] },
      ]}
    >
      <Feather name={cfg.icon} size={16} color="#fff" style={styles.toastIcon} />
      <Text style={styles.toastText} numberOfLines={3}>{toast.message}</Text>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Feather name="x" size={14} color="rgba(255,255,255,0.75)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ToastContainer() {
  const { toasts, dismissToast } = useSyncContext();
  if (!toasts.length) return null;

  return (
    <View style={styles.container} pointerEvents="box-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 48,
    left: 80,   // deja espacio al FAB de la izquierda
    right: 12,
    zIndex: 9999,
    gap: 6,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 7,
  },
  toastIcon: { marginRight: 8, flexShrink: 0 },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 18,
  },
});