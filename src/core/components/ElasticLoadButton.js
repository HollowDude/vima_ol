import React from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';

const SIZE = 36;

/**
 * ElasticLoadButton — Overscroll Indicator
 *
 * Props:
 *   direction         'left' | 'right'
 *   isActive          boolean
 *   pullDistanceAnim  Animated.Value  (0..maxPull)
 *   touchYAnim        Animated.Value  — Y relativa al calendarWrapper (sin setState)
 *   isReady           boolean
 *   maxPull           number
 */
export default function ElasticLoadButton({
  direction,
  isActive,
  pullDistanceAnim,
  touchYAnim,
  isReady,
  maxPull,
}) {
  const isLeft = direction === 'left';

  // Entrada horizontal desde el borde
  const translateX = pullDistanceAnim.interpolate({
    inputRange:  [0, maxPull],
    outputRange: isLeft ? [-(SIZE + 4), 6] : [SIZE + 4, -6],
    extrapolate: 'clamp',
  });

  // Opacidad
  const opacity = pullDistanceAnim.interpolate({
    inputRange:  [0, 14],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // Posición vertical: mapeo lineal touchYAnim → touchYAnim - SIZE/2
  // (centra el icono en la posición del dedo, sin setState)
  const translateY = touchYAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-(SIZE / 2), 1 - SIZE / 2],
    extrapolate: 'extend',
  });

  if (!isActive) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        isLeft ? styles.left : styles.right,
        { opacity, transform: [{ translateX }, { translateY }] },
      ]}
    >
      <Feather
        name={isLeft ? 'chevron-left' : 'chevron-right'}
        size={24}
        color={isReady ? '#2e7d32' : 'rgba(80,80,80,0.4)'}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position:       'absolute',
    top:            0,   // translateY lo mueve — no hay top dinámico
    zIndex:         300,
    width:          SIZE,
    height:         SIZE,
    alignItems:     'center',
    justifyContent: 'center',
  },
  left:  { left: 0 },
  right: { right: 0 },
});