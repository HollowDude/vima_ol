import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSyncContext } from '../context/SyncContext';
import useNetwork from '../hooks/useNetwork';

/**
 * FAB expandible reutilizable.
 *
 * Props:
 *   actions:     Array de { icon, onPress }
 *                - actions[0] → botón principal (siempre visible)
 *                - actions[1..] → opciones que suben al expandir
 */
export default function ExpandableFAB({ actions = [] }) {
  const { isOnline }                = useNetwork();
  const { isSyncing, pendingCount } = useSyncContext();
  const [expanded, setExpanded]     = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const optionAnims = useRef(
    actions.slice(1).map(() => new Animated.Value(0))
  ).current;

  const getFabColor = () => {
    if (!isOnline) return '#504b4bff';
    if (isSyncing) return '#e8a83e';
    return '#64c27b';
  };

  // Pellizco: encoge y vuelve, sin rotación
  const squeeze = () => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.86, useNativeDriver: true, friction: 4, tension: 220 }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, friction: 5, tension: 180 }),
    ]).start();
  };

  const openOptions = (next) => {
    optionAnims.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: next ? 1 : 0,
        useNativeDriver: true,
        friction: 6,
        tension: 80,
        delay: next ? i * 40 : (optionAnims.length - 1 - i) * 30,
      }).start();
    });
  };

  const handleMainPress = () => {
    squeeze();

    if (actions.length <= 1) {
      // Sin secundarios: ejecutar directamente (ej. Home solo abre sidebar)
      actions[0]?.onPress?.();
      return;
    }

    const next = !expanded;
    setExpanded(next);

    openOptions(next);
  };

  const handleOptionPress = (onPress) => {
    setExpanded(false);
    openOptions(false);
    squeeze();
    setTimeout(onPress, 120);
  };

  const color            = getFabColor();
  const mainAction       = actions[0];
  const secondaryActions = actions.slice(1);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Opciones secundarias */}
      {secondaryActions.map((action, i) => {
        const anim       = optionAnims[i];
        const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -(60 * (i + 1))] });
        const opacity    = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.7, 1] });

        return (
          <Animated.View
            key={i}
            style={[styles.optionWrapper, { opacity, transform: [{ translateY }] }]}
            pointerEvents={expanded ? 'auto' : 'none'}
          >
            <TouchableOpacity
              style={[styles.optionButton, { backgroundColor: color }]}
              onPress={() => handleOptionPress(action.onPress)}
              activeOpacity={0.8}
            >
              <Feather name={action.icon} size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      {/* Botón principal — solo pellizco, sin rotación */}
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[styles.mainButton, { backgroundColor: color }]}
          onPress={handleMainPress}
          activeOpacity={0.85}
        >
          <Feather name={mainAction?.icon || 'menu'} size={26} color="#fff" />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    zIndex: 999,
    alignItems: 'center',
  },
  mainButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  optionWrapper: {
    position: 'absolute',
    bottom: 0,
    alignItems: 'center',
  },
  optionButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 6,
  },
});