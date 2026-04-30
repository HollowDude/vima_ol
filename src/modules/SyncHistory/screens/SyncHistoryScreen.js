import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert, Animated, ScrollView
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import SyncHistoryService from '../../../core/sync/sync.history';
import useNetwork from '../../../core/hooks/useNetwork';
import DashboardHeader from '../../../core/components/DashboardHeader';
import SlideMenu from '../../../core/components/SlideMenu';
import Card from '../../../core/components/Card';

const STATUS_COLORS = {
  success: '#10B981',
  partial: '#F59E0B',
  failed: '#EF4444',
  syncing: '#3B82F6',
};

const DIRECTION_COLORS = {
  pull: '#64c27b',   // Verde: descargas
  push: '#3B82F6',   // Azul: subidas
  both: '#8B5CF6',   // Púrpura: ambas
};

const MODEL_LABELS = {
  'res.partner': 'Clientes',
  'project.task': 'Tareas',
  'crm.lead': 'Oportunidades',
  'mail.message': 'Comentarios',
  'survey.survey': 'Encuestas',
  'survey.user_input': 'Respuestas',
  'ir.attachment': 'Adjuntos',
  'res.country': 'Países',
  'res.country.state': 'Estados',
  'res.municipality': 'Municipios',
  'client.type': 'Tipos de cliente',
  'project.task.tags': 'Etiquetas',
  'crm.stage': 'Etapas CRM',
};

// ──────────────────────────────────────────────────────────────────────────────
// Componentes pequeños
// ──────────────────────────────────────────────────────────────────────────────

function DirectionBadge({ direction }) {
  const color = DIRECTION_COLORS[direction] || '#9CA3AF';
  const label = direction === 'pull' ? '⬇ PULL' : direction === 'push' ? '⬆ PUSH' : '↔ AMBOS';
  
  return (
    <View style={[styles.directionBadge, { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.directionBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || STATUS_COLORS.partial;
  const label = status === 'success' ? '✓ Éxito' 
              : status === 'partial' ? '⚠ Parcial'
              : status === 'failed' ? '✕ Fallido'
              : status;
  
  return (
    <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ModelDetailRow({ model, count, icon = 'circle' }) {
  const label = MODEL_LABELS[model] || model.split('.').pop();
  
  return (
    <View style={styles.modelDetailRow}>
      <Feather name={icon} size={12} color="#9CA3AF" />
      <Text style={styles.modelLabel}>{label}</Text>
      <View style={styles.countBadge}>
        <Text style={styles.countText}>{count}</Text>
      </View>
    </View>
  );
}

function CRUDStats({ stats }) {
  if (!stats || (stats.created === 0 && stats.updated === 0 && stats.deleted === 0 && stats.errors === 0)) {
    return null;
  }

  return (
    <View style={styles.crudStatsContainer}>
      {stats.created > 0 && (
        <View style={[styles.crudBadge, { backgroundColor: '#ECFDF5', borderColor: '#10B981' }]}>
          <Text style={[styles.crudText, { color: '#10B981' }]}>+{stats.created}</Text>
        </View>
      )}
      {stats.updated > 0 && (
        <View style={[styles.crudBadge, { backgroundColor: '#EEF2FF', borderColor: '#3B82F6' }]}>
          <Text style={[styles.crudText, { color: '#3B82F6' }]}>◻{stats.updated}</Text>
        </View>
      )}
      {stats.deleted > 0 && (
        <View style={[styles.crudBadge, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <Text style={[styles.crudText, { color: '#F59E0B' }]}>-{stats.deleted}</Text>
        </View>
      )}
      {stats.errors > 0 && (
        <View style={[styles.crudBadge, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}>
          <Text style={[styles.crudText, { color: '#EF4444' }]}>✕{stats.errors}</Text>
        </View>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Item expandible de Sync
// ──────────────────────────────────────────────────────────────────────────────

function SyncHistoryItem({ item }) {
  const [expanded, setExpanded] = useState(false);
  
  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <View style={styles.itemContainer}>
      {/* Header */}
      <TouchableOpacity
        style={styles.itemHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.itemHeaderLeft}>
          <View style={[styles.itemStatusDot, { backgroundColor: STATUS_COLORS[item.status] }]} />
          <View style={styles.itemMeta}>
            <Text style={styles.itemType} numberOfLines={1}>
              {item.type === 'syncAll' ? 'Sincronización Completa'
              : item.type === 'syncPending' ? 'Cambios Pendientes'
              : item.type}
            </Text>
            <Text style={styles.itemDateTime} numberOfLines={1}>
              {formatDate(item.timestamp)} • {formatTime(item.timestamp)}
            </Text>
          </View>
        </View>

        <View style={styles.itemHeaderRight}>
          <StatusBadge status={item.status} />
          <Feather 
            name={expanded ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color="#9CA3AF" 
            style={styles.expandIcon}
          />
        </View>
      </TouchableOpacity>

      {/* Detalles expandidos */}
      {expanded && (
        <View style={styles.itemDetails}>
          {/* Duración */}
          {item.duration !== undefined && (
            <View style={styles.detailRow}>
              <Feather name="clock" size={14} color="#64c27b" />
              <Text style={styles.detailLabel}>Duración:</Text>
              <Text style={styles.detailValue}>{formatDuration(item.duration)}</Text>
            </View>
          )}

          {/* Direction */}
          {item.direction && (
            <View style={styles.detailRow}>
              <Feather name="repeat" size={14} color="#3B82F6" />
              <Text style={styles.detailLabel}>Dirección:</Text>
              <DirectionBadge direction={item.direction} />
            </View>
          )}

          {/* PULL Details */}
          {item.pull && (
            <View style={styles.phaseSection}>
              <View style={styles.phaseHeader}>
                <Feather name="download" size={14} color="#64c27b" />
                <Text style={styles.phaseTitle}>PULL (Descargas)</Text>
                <View style={styles.phaseStats}>
                  <Text style={styles.phaseStatsText}>
                    {item.pull.totalRecords || 0} registros • {item.pull.totalModels || 0} modelos
                  </Text>
                </View>
              </View>

              {item.pull.models && Object.keys(item.pull.models).length > 0 ? (
                Object.entries(item.pull.models).map(([model, data]) => (
                  <View key={model} style={styles.modelBlock}>
                    <ModelDetailRow 
                      model={model} 
                      count={data.count || 0}
                      icon={model === 'res.partner' ? 'users' 
                          : model === 'project.task' ? 'check-square'
                          : model === 'crm.lead' ? 'briefcase'
                          : model === 'mail.message' ? 'message-circle'
                          : 'circle'}
                    />
                    {data.created > 0 || data.updated > 0 ? (
                      <CRUDStats stats={data} />
                    ) : (
                      <Text style={styles.noDataText}>Sin nuevos datos</Text>
                    )}
                  </View>
                ))
              ) : (
                <Text style={styles.noDataText}>No se descargaron datos</Text>
              )}

              {item.pull.errors && item.pull.errors.length > 0 && (
                <View style={styles.errorSection}>
                  <Text style={styles.errorLabel}>
                    ⚠ {item.pull.errors.length} error(es) en PULL
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* PUSH Details */}
          {item.push && (
            <View style={styles.phaseSection}>
              <View style={styles.phaseHeader}>
                <Feather name="upload" size={14} color="#3B82F6" />
                <Text style={styles.phaseTitle}>PUSH (Subidas)</Text>
                <View style={styles.phaseStats}>
                  <Text style={styles.phaseStatsText}>
                    {item.push.totalRecords || 0} registros • {item.push.totalModels || 0} modelos
                  </Text>
                </View>
              </View>

              {item.push.models && Object.keys(item.push.models).length > 0 ? (
                Object.entries(item.push.models).map(([model, data]) => (
                  <View key={model} style={styles.modelBlock}>
                    <ModelDetailRow 
                      model={model} 
                      count={(data.created || 0) + (data.updated || 0) + (data.deleted || 0)}
                      icon={model === 'res.partner' ? 'users' 
                          : model === 'project.task' ? 'check-square'
                          : model === 'crm.lead' ? 'briefcase'
                          : 'circle'}
                    />
                    <CRUDStats stats={data} />
                  </View>
                ))
              ) : (
                <Text style={styles.noDataText}>No se subieron datos</Text>
              )}

              {item.push.errors && item.push.errors.length > 0 && (
                <View style={styles.errorSection}>
                  <Text style={styles.errorLabel}>
                    ⚠ {item.push.errors.length} error(es) en PUSH
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Error general */}
          {item.error && (
            <View style={[styles.errorSection, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}>
              <Feather name="alert-circle" size={14} color="#EF4444" />
              <Text style={[styles.errorLabel, { color: '#EF4444' }]}>
                Error: {item.error}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Pantalla principal
// ──────────────────────────────────────────────────────────────────────────────

export default function SyncHistoryScreen({ userData, username, onBack, onLogout, onNavigateToSyncHistory }) {
  const { isOnline } = useNetwork();
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [menuVisible, setMenuVisible] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const data = await SyncHistoryService.getSyncHistory();
      setHistory(data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  }, [loadHistory]);

  const handleClearHistory = () => {
    Alert.alert(
      'Limpiar Historial',
      '¿Estás seguro de que quieres borrar todo el historial?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Borrar', 
          style: 'destructive', 
          onPress: async () => {
            await SyncHistoryService.clearSyncHistory();
            await loadHistory();
          }
        },
      ]
    );
  };

  const filteredHistory = history.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  const renderFilterButton = (filterValue, icon, label) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === filterValue && styles.filterButtonActive]}
      onPress={() => setFilter(filterValue)}
      activeOpacity={0.7}
    >
      <Feather 
        name={icon} 
        size={14} 
        color={filter === filterValue ? '#fff' : '#9CA3AF'} 
      />
      <Text style={[styles.filterButtonText, filter === filterValue && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <SlideMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        userData={userData}
        username={username}
        onLogout={onLogout}
        onNavigateToSyncHistory={() => {
          setMenuVisible(false);
          onNavigateToSyncHistory?.();
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#64c27b']}
            tintColor="#64c27b"
          />
        }
      >
        <Card style={styles.mainCard}>
          <DashboardHeader userName={username || 'Usuario'} isOnline={isOnline} />

          <View style={styles.cardContent}>
            {/* Título */}
            <View style={styles.titleSection}>
              <View style={styles.titleTop}>
                <TouchableOpacity 
                  onPress={onBack}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="arrow-left" size={24} color="#0B1B2A" />
                </TouchableOpacity>
                <Text style={styles.title}>Historial de Sincronización</Text>
                <TouchableOpacity 
                  onPress={() => setMenuVisible(true)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="menu" size={24} color="#0B1B2A" />
                </TouchableOpacity>
              </View>

              {/* Filtros */}
              <View style={styles.filterContainer}>
                {renderFilterButton('all', 'inbox', 'Todas')}
                {renderFilterButton('success', 'check-circle', 'Éxitos')}
                {renderFilterButton('partial', 'alert-circle', 'Parciales')}
                {renderFilterButton('failed', 'x-circle', 'Fallidas')}
              </View>
            </View>

            {/* Lista de items */}
            {filteredHistory.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="inbox" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No hay historial</Text>
                <Text style={styles.emptySubtext}>Las sincronizaciones aparecerán aquí</Text>
              </View>
            ) : (
              <View style={styles.itemsList}>
                {filteredHistory.map((item, idx) => (
                  <SyncHistoryItem key={item.id || idx} item={item} />
                ))}
              </View>
            )}
          </View>
        </Card>

        {/* Botón limpiar */}
        {history.length > 0 && (
          <View style={styles.bottomButtonContainer}>
            <TouchableOpacity 
              style={styles.clearButton} 
              onPress={handleClearHistory}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={16} color="#EF4444" />
              <Text style={styles.clearButtonText}>Limpiar historial</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f0ebff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 80,
    paddingBottom: 140,
  },
  mainCard: {
    marginBottom: 16,
  },
  cardContent: {
    padding: 16,
  },

  // Título
  titleSection: {
    marginBottom: 16,
  },
  titleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#0B1B2A',
    marginHorizontal: 12,
    textAlign: 'center',
  },

  // Filtros
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  filterButtonActive: {
    backgroundColor: '#64c27b',
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#fff',
  },

  // Items List
  itemsList: {
    gap: 10,
    marginTop: 16,
  },
  itemContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  itemHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  itemStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  itemMeta: {
    flex: 1,
  },
  itemType: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B1B2A',
    marginBottom: 2,
  },
  itemDateTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  itemHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  expandIcon: {
    marginLeft: 4,
  },

  // Badges
  directionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  directionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Detalles expandidos
  itemDetails: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 80,
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#0B1B2A',
  },

  // Fases (PULL/PUSH)
  phaseSection: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  phaseTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0B1B2A',
    flex: 1,
  },
  phaseStats: {
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  phaseStatsText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },

  // Modelos
  modelBlock: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 6,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  modelDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  modelLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  countBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },

  // CRUD Stats
  crudStatsContainer: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  crudBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  crudText: {
    fontSize: 11,
    fontWeight: '700',
  },
  noDataText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Errores
  errorSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  errorLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#D1D5DB',
    marginTop: 4,
  },

  // Botón inferior
  bottomButtonContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
});