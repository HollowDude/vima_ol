import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

const PILL_HEIGHT = 44;
const PILL_WIDTH  = 78;

/**
 * ElasticLoadButton — Overscroll Indicator
 *
 * Indicador visual PURO: no es presionable.
 * Emerge desde fuera del borde lateral del calendario siguiendo la posición
 * vertical del dedo. La lógica del gesto (PanResponder) vive en TasksScreen.
 *
 * Props:
 *   direction         'left' | 'right'
 *   isActive          boolean           — Lado en overscroll activo
 *   pullDistanceAnim  Animated.Value    — Extensión del tirón (0..maxPull)
 *   touchY            number            — Y del toque dentro del calendarWrapper
 *   isReady           boolean           — Umbral alcanzado, disparará al soltar
 *   maxPull           number            — Extensión visual máxima
 */
export default function ElasticLoadButton({
  direction,
  isActive,
  pullDistanceAnim,
  touchY,
  isReady,
  maxPull,
}) {
  const isLeft = direction === 'left';

  // Deslizamiento: el pill parte oculto fuera del borde y entra al tirar
  const translateX = pullDistanceAnim.interpolate({
    inputRange:  [0, maxPull],
    outputRange: isLeft
      ? [-(PILL_WIDTH + 10), 8]  // emerge por la izquierda
      : [PILL_WIDTH + 10, -8],   // emerge por la derecha
    extrapolate: 'clamp',
  });

  // Opacidad: aparece suavemente al comenzar el tirón
  const opacity = pullDistanceAnim.interpolate({
    inputRange:  [0, 6, 18],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  // Escala: crece al acercarse al umbral
  const scale = pullDistanceAnim.interpolate({
    inputRange:  [0, maxPull * 0.55, maxPull],
    outputRange: [0.82, 1, 1.07],
    extrapolate: 'clamp',
  });

  if (!isActive) return null;

  const pillTop = Math.max(
    PILL_HEIGHT / 2,
    (touchY ?? 120) - PILL_HEIGHT / 2,
  );

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        isLeft ? styles.leftWrapper : styles.rightWrapper,
        { top: pillTop, opacity, transform: [{ translateX }, { scale }] },
      ]}
    >
      <View style={[styles.pill, isReady && styles.pillReady]}>
        <Feather
          name={isLeft ? 'chevrons-left' : 'chevrons-right'}
          size={14}
          color="#fff"
        />
        <Text style={styles.label} numberOfLines={1}>
          {isReady ? '¡Suelta!' : '7 días'}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    zIndex:   300,
    width:    PILL_WIDTH,
    height:   PILL_HEIGHT,
  },
  leftWrapper:  { left:  0 },
  rightWrapper: { right: 0 },
  pill: {
    flex:            1,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: '#64c27b',
    borderRadius:    PILL_HEIGHT / 2,
    gap:             5,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.22,
    shadowRadius:    7,
    elevation:       9,
  },
  pillReady: { backgroundColor: '#2e7d32' },
  label: {
    color:         '#fff',
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 0.2,
  },
});