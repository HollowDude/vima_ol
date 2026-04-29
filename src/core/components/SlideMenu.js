import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal,
  Animated, Dimensions, TouchableWithoutFeedback, PanResponder,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSyncContext } from '../context/SyncContext';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from '../sync/sync.constants';
import useNetwork from '../hooks/useNetwork';

const { width }       = Dimensions.get('window');
const MENU_WIDTH      = Math.min(280, width * 0.58);
const OVERLAY_OPACITY = 0.5;

// ── Paleta de Colores de Estado ───────────────────────────────────────────────
const STATUS_COLORS = {
  online: '#64c27b',     // Verde: Conectado / Todo sincronizado
  syncing: '#e8a83e',    // Naranja: Sincronizando
  offline: '#504b4b',    // Gris oscuro: Sin conexión
  pending: '#d4874e',    // Naranja oscuro: Cambios pendientes
  gray: '#9CA3AF',       // Gris claro: Iconos / Texto neutro
};

// ── Mapeo modelo → sección legible ───────────────────────────────────────────
const MODEL_META = {
  'res.partner':        { label: 'Clientes',      icon: 'users'          },
  'project.task':       { label: 'Tareas',        icon: 'check-square'   },
  'crm.lead':           { label: 'Oportunidades', icon: 'briefcase'      },
  'mail.message':       { label: 'Comentarios',   icon: 'message-circle' },
  'ir.attachment':      { label: 'Adjuntos',      icon: 'paperclip'      },
  'survey.user_input':  { label: 'Encuestas',     icon: 'file-text'      },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeAgo(date) {
  if (!date) return 'Nunca';
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60)    return 'Hace un momento';
  if (s < 3600)  return `Hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `Hace ${Math.floor(s / 3600)} h`;
  return `Hace ${Math.floor(s / 86400)} días`;
}

function countByModel(pending = []) {
  const map = {};
  pending.forEach(p => {
    if (!p.model) return;
    map[p.model] = (map[p.model] || 0) + 1;
  });
  return map;
}

// ── Panel de estado ───────────────────────────────────────────────────────────
function SyncPanel({ isOnline, isSyncing, lastSync, pendingCount, statusLabel, activeColor, byModel }) {
  const entries = Object.entries(byModel);
  const hasPending = pendingCount > 0;

  return (
    <View style={styles.syncPanel}>
      {/* Fila: conexión + último sync */}
      <View style={styles.metaRow}>
        <Text style={styles.metaSep}></Text>
        <Feather name="clock" size={11} color={activeColor} />
        <Text style={styles.metaText}>Última Sync: {timeAgo(lastSync)}</Text>
      </View>

      {/* Fila: actividad en curso */}
      {isSyncing && (
        <View style={styles.metaRow}>
          <Feather name="refresh-cw" size={12} color={activeColor} />
          <Text style={[styles.metaText, { color: activeColor, fontWeight: '700' }]}>
            {statusLabel || 'Sincronizando...'}
          </Text>
        </View>
      )}

      {/* Bloque de pendientes */}
      <View style={styles.pendingBlock}>
        {/* Título principal */}
        <View style={styles.pendingTitleRow}>
          <Feather
            name={hasPending ? 'upload-cloud' : 'check-circle'}
            size={15}
            color={hasPending ? STATUS_COLORS.pending : STATUS_COLORS.online}
          />
          <Text style={[
            styles.pendingTitle,
            { color: hasPending ? STATUS_COLORS.pending : STATUS_COLORS.online },
          ]}>
            {hasPending
              ? `${pendingCount} cambio${pendingCount > 1 ? 's' : ''} pendiente${pendingCount > 1 ? 's' : ''}`
              : 'Todo sincronizado'}
          </Text>
        </View>

        {/* Desglose por sección */}
        {hasPending && entries.length > 0 && (
          <View style={styles.breakdown}>
            {entries.map(([model, count]) => {
              const meta = MODEL_META[model] || { label: model, icon: 'circle' };
              return (
                <View key={model} style={styles.breakdownRow}>
                  <Feather name={meta.icon} size={12} color={STATUS_COLORS.gray} />
                  <Text style={styles.breakdownLabel}>{meta.label}</Text>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{count}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SlideMenu({ visible, onClose, userData, username, onLogout, onNavigateToSyncHistory }) {
  const { isOnline } = useNetwork();
  const { pendingCount, lastSync, isSyncing, statusLabel, refreshPendingCount } = useSyncContext();
  const [byModel, setByModel] = useState({});

  const slideAnim = React.useRef(new Animated.Value(-MENU_WIDTH)).current;
  const panX      = React.useRef(new Animated.Value(0)).current;
  const combined  = Animated.add(slideAnim, panX);

  // Lógica derivada para el color (Single Source of Truth)
  const activeColor = useMemo(() => {
    if (isSyncing) return STATUS_COLORS.syncing;
    return isOnline ? STATUS_COLORS.online : STATUS_COLORS.offline;
  }, [isSyncing, isOnline]);

  const overlayOpacity = combined.interpolate({
    inputRange: [-MENU_WIDTH, 0], outputRange: [0, OVERLAY_OPACITY], extrapolate: 'clamp',
  });

  // Refrescar datos cada vez que se abre
  useEffect(() => {
    if (!visible) return;
    refreshPendingCount();
    StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)
      .then(p => setByModel(countByModel(p || [])))
      .catch(() => setByModel({}));
  }, [visible]);

  // Animación apertura / cierre
  useEffect(() => {
    if (visible) {
      panX.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true, damping: 20, mass: 1, stiffness: 120,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -MENU_WIDTH, duration: 220, useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Gesto de deslizar para cerrar
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant:   () => panX.setValue(0),
      onPanResponderMove:    (_, g) => panX.setValue(Math.max(-MENU_WIDTH, Math.min(0, g.dx))),
      onPanResponderRelease: (_, g) => {
        if (g.dx < -MENU_WIDTH / 3 || g.vx < -0.5) {
          Animated.parallel([
            Animated.timing(slideAnim, { toValue: -MENU_WIDTH, duration: 180, useNativeDriver: true }),
            Animated.timing(panX,      { toValue: 0,          duration: 180, useNativeDriver: true }),
          ]).start(() => onClose?.());
        } else {
          Animated.parallel([
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
            Animated.timing(panX,      { toValue: 0, duration: 150,         useNativeDriver: true }),
          ]).start();
        }
      },
      onPanResponderTerminate: () =>
        Animated.timing(panX, { toValue: 0, duration: 120, useNativeDriver: true }).start(),
    })
  ).current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </TouchableWithoutFeedback>

        <Animated.View style={[styles.menu, { transform: [{ translateX: combined }] }]}>

          {/* 1. HEADER */}
          <View style={[styles.menuHeader, { backgroundColor: activeColor }]}>
            <View style={styles.avatar}>
              <Feather name="user" size={32} color="#fff" />
            </View>
            <Text style={styles.userName}>{username || 'Usuario'}</Text>
            <Text style={styles.userEmail}>{userData?.username || ''}</Text>
          </View>

          {/* 2. CONTENIDO MEDIO */}
          <View style={styles.middleContent}>
            <SyncPanel 
              isOnline={isOnline} 
              isSyncing={isSyncing}
              lastSync={lastSync}
              pendingCount={pendingCount}
              statusLabel={statusLabel}
              activeColor={activeColor}
              byModel={byModel} 
            />
          </View>

          {/* 3. SECCIÓN INFERIOR */}
          <View style={styles.bottomSection}>
            <View style={styles.statusContainer}>
              <View style={[styles.dot, { backgroundColor: isOnline ? STATUS_COLORS.online : STATUS_COLORS.gray }]} />
              <Text style={styles.metaText}>
                {isOnline ? 'En línea' : 'Sin conexión'}
              </Text>
            </View>

            <View style={styles.dividerSmall} />

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => { onClose?.(); onNavigateToSyncHistory?.(); }}
              activeOpacity={0.7}
            >
              <Feather name="history" size={18} color="#3B82F6" />
              <Text style={styles.syncHistoryText}>Historial de sincronización</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={() => { onClose?.(); onLogout?.(); }}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={18} color="#bb2525" />
              <Text style={styles.logoutText}>Cerrar sesión</Text>
            </TouchableOpacity>
          </View>

          {/* 4. FOOTER */}
          <View style={styles.menuFooter}>
            <Text style={styles.footerText}>VIMA © 2026</Text>
            <Text style={styles.footerVersion}>Versión 1.2.0</Text>
          </View>

          {/* Handle deslizable */}
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

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:    { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' },

  menu: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
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
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  userName:  { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  userEmail: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  middleContent: {
    flex: 1, 
  },

  bottomSection: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 15,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    width: '100%',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#bb2525',
    marginLeft: 10,
  },
  syncHistoryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3B82F6',
    marginLeft: 10,
  },
  dividerSmall: {
    height: 1,
    width: '80%',
    backgroundColor: '#F3F4F6',
    marginBottom: 10,
  },

  syncPanel: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F9FAFB',
  },

  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  dot:      { width: 7, height: 7, borderRadius: 4 },
  metaSep:  { fontSize: 11, color: '#D1D5DB', marginHorizontal: 2 },
  metaText: { fontSize: 12, color: '#6B7280' },

  pendingBlock: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
  },
  pendingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pendingTitle: {
    fontSize: 13,
    fontWeight: '700',
  },

  breakdown: {
    marginTop: 10,
    gap: 8,
    paddingLeft: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
    paddingTop: 10,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  countBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },

  menuFooter: {
    padding: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E6E9EF',
  },
  footerText:    { fontSize: 12, color: '#6B7280', textAlign: 'center', marginBottom: 4 },
  footerVersion: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },

  handleContainer: {
    position: 'absolute',
    right: -20, top: '50%', marginTop: -28,
    width: 40, height: 56,
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 10,
  },
  handlePill: {
    width: 15, height: 56, borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6E9EF',
  },
  handleLine: { width: 10, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },
});