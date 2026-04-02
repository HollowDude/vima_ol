import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  TouchableWithoutFeedback,
  PanResponder,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import useNetwork from '../hooks/useNetwork';

const { width, height } = Dimensions.get('window');
const MENU_WIDTH = Math.min(280, width * 0.58);
const OVERLAY_MAX_OPACITY = 0.5;

export default function SlideMenu({ visible, onClose, action, userData, username, onLogout }) {
  const { isOnline } = useNetwork();
  const slideAnim = React.useRef(new Animated.Value(-MENU_WIDTH)).current; // base position: -MENU_WIDTH (hidden) -> 0 (open)
  const panX = React.useRef(new Animated.Value(0)).current; // offset while dragging
  const combinedTranslate = Animated.add(slideAnim, panX); // value used for transform

  const getStatusColor = () => {
    if (!isOnline) return '#504b4bff'; 
    if (action) return '#e8c39e'; 
    return '#64c27b'; 
  };

  // Overlay opacity interpolada a partir de combinedTranslate
  const overlayOpacity = combinedTranslate.interpolate({
    inputRange: [-MENU_WIDTH, 0],
    outputRange: [0, OVERLAY_MAX_OPACITY],
    extrapolate: 'clamp',
  });

  // PanResponder SOLO para el handle (la pestaña)
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        // detener animaciones activas y resetear panX
        panX.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Solo permitir arrastrar hacia la izquierda (dx negativo) y acotar
        const clamped = Math.max(-MENU_WIDTH, Math.min(0, gestureState.dx));
        panX.setValue(clamped);
      },
      onPanResponderRelease: (_, gestureState) => {
        const finalDx = gestureState.dx;
        const vx = gestureState.vx;

        // Si se ha arrastrado suficientemente o la velocidad es hacia la izquierda, cerrar
        const shouldClose = finalDx < -MENU_WIDTH / 3 || vx < -0.5;

        if (shouldClose) {
          // Animar a cerrado (-MENU_WIDTH) y resetear panX a 0
          Animated.parallel([
            Animated.timing(slideAnim, {
              toValue: -MENU_WIDTH,
              duration: 180,
              useNativeDriver: true,
            }),
            Animated.timing(panX, {
              toValue: 0,
              duration: 180,
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (typeof onClose === 'function') onClose();
          });
        } else {
          // Volver a la posición abierta (0)
          Animated.parallel([
            Animated.spring(slideAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 65,
              friction: 11,
            }),
            Animated.timing(panX, {
              toValue: 0,
              duration: 150,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
      onPanResponderTerminate: () => {
        // cancelar: volver a abierto
        Animated.timing(panX, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  // Abrir / cerrar cuando cambia `visible`
  React.useEffect(() => {
    if (visible) {
      panX.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        mass: 1,
        stiffness: 120,
      }).start();
    } else {
      // si visible pasa a false desde padre, animar a cerrado
      Animated.timing(slideAnim, {
        toValue: -MENU_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim, panX]);

  const menuOptions = [
    /*{
      icon: 'user',
      label: 'Mi perfil',
      onPress: () => {
        onClose && onClose();
        // TODO: navegar a perfil
      },
    },
    {
      icon: 'settings',
      label: 'Configuración',
      onPress: () => {
        onClose && onClose();
        // TODO: navegar a configuración
      },
    },*/
    {
      icon: 'log-out',
      label: 'Cerrar sesión',
      color: '#bb2525',
      onPress: () => {
        onClose && onClose();
        onLogout && onLogout();
      },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Overlay con opacidad animada (toca fuera para cerrar) */}
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </TouchableWithoutFeedback>

        {/* Menú deslizable */}
        <Animated.View
          style={[
            styles.menu,
            {
              transform: [{ translateX: combinedTranslate }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.menuHeader} backgroundColor={getStatusColor()}>
            <View style={styles.avatar}>
              <Feather name="user" size={32} color="#fff" />
            </View>
            <Text style={styles.userName}>{username || 'Usuario'}</Text>
            <Text style={styles.userEmail}>{userData?.username || ''}</Text>
          </View>

          {/* Opciones */}
          <View style={styles.menuOptions}>
            {menuOptions.map((option, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.menuItem}
                onPress={option.onPress}
                activeOpacity={0.7}
              >
                <Feather name={option.icon} size={20} color={option.color || '#0B1B2A'} />
                <Text style={[styles.menuItemText, option.color && { color: option.color }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.menuFooter}>
            <Text style={styles.footerText}>VIMA © 2025</Text>
            <Text style={styles.footerVersion}>Versión 1.0.0</Text>
          </View>

          {/* Handle: pestaña centrada a la derecha - solo ella maneja el gesto */}
          <Animated.View
            {...panResponder.panHandlers}
            style={styles.handleContainer}
            pointerEvents="box-only"
          >
            <View style={styles.handlePill}>
              <View style={styles.handleLine} />
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  menu: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: MENU_WIDTH,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'visible',
  },
  menuHeader: {
    padding: 24,
    paddingTop: 45,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  menuOptions: {
    flex: 1,
    paddingTop: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0B1B2A',
    marginLeft: 16,
  },
  menuFooter: {
    padding: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6E9EF',
  },
  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  footerVersion: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
  },

  /* Handle (pestaña) - sobresale por la derecha */
  handleContainer: {
    position: 'absolute',
    right: -20, // sobresale del borde del menú
    top: '50%',
    marginTop: -28,
    width: 40,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    // sombra ligera para separarlo
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 10,
  },
  handlePill: {
    width: 15,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E6E9EF',
  },
  handleLine: {
    width: 10,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
});
