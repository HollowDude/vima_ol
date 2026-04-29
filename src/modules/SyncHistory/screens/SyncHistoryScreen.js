import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import SyncHistoryService from '../../../core/sync/sync.history';
import useNetwork from '../../../core/hooks/useNetwork';

const STATUS_COLORS = {
  success: '#10B981',
  partial: '#F59E0B',
  failed: '#EF4444',
};

const TYPE_ICONS = {
  syncAll: 'refresh-cw',
  syncPending: 'upload-cloud',
  manual: 'edit-3',
  survey: 'file-text',
  task: 'check-square',
  lead: 'briefcase',
  client: 'users',
};

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function getStatusLabel(status) {
  switch (status) {
    case 'success': return 'Éxito';
    case 'partial': return 'Parcial';
    case 'failed': return 'Fallido';
    default: return status;
  }
}

function getTypeLabel(type) {
  switch (type) {
    case 'syncAll': return 'Sincronización completa';
    case 'syncPending': return 'Cambios pendientes';
    case 'manual': return 'Sincronización manual';
    case 'survey': return 'Encuesta';
    case 'task': return 'Tarea';
    case 'lead': return 'Oportunidad';
    case 'client': return 'Cliente';
    default: return type;
  }
}

function SyncHistoryItem({ item }) {
  const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.partial;
  const iconName = TYPE_ICONS[item.type] || 'activity';
  
  return (
    <View style={styles.itemCard}>
      <View style={styles.itemHeader}>
        <View style={[styles.statusIndicator, { backgroundColor: statusColor }]} />
        <Feather name={iconName} size={18} color={statusColor} />
        <View style={styles.itemInfo}>
          <Text style={styles.itemType} numberOfLines={1}>
            {getTypeLabel(item.type)}
          </Text>
          <Text style={styles.itemDate} numberOfLines={1}>
            {formatDate(item.timestamp)} • {formatTime(item.timestamp)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {getStatusLabel(item.status)}
          </Text>
        </View>
      </View>
      
      {item.duration !== undefined && (
        <View style={styles.durationRow}>
          <Feather name="clock" size={12} color="#9CA3AF" />
          <Text style={styles.durationText}>Duración: {formatDuration(item.duration)}</Text>
        </View>
      )}
      
      {item.details && (
        <View style={styles.detailsRow}>
          {item.details.created > 0 && (
            <View style={styles.detailBadge}>
              <Text style={styles.detailText}>+{item.details.created}</Text>
            </View>
          )}
          {item.details.updated > 0 && (
            <View style={styles.detailBadge}>
              <Text style={styles.detailText}>◻{item.details.updated}</Text>
            </View>
          )}
          {item.details.deleted > 0 && (
            <View style={styles.detailBadge}>
              <Text style={styles.detailText}>-{item.details.deleted}</Text>
            </View>
          )}
          {item.details.failed > 0 && (
            <View style={[styles.detailBadge, styles.detailBadgeFailed]}>
              <Text style={[styles.detailText, styles.detailTextFailed]}>
                ✕{item.details.failed}
              </Text>
            </View>
          )}
        </View>
      )}
      
      {item.error && (
        <View style={styles.errorRow}>
          <Feather name="alert-circle" size={12} color="#EF4444" />
          <Text style={styles.errorText} numberOfLines={2}>{item.error}</Text>
        </View>
      )}
      
      {item.models && item.models.length > 0 && (
        <View style={styles.modelsRow}>
          {item.models.slice(0, 3).map((model, idx) => (
            <View key={idx} style={styles.modelChip}>
              <Text style={styles.modelText} numberOfLines={1}>
                {model.split('.')[1] || model}
              </Text>
            </View>
          ))}
          {item.models.length > 3 && (
            <Text style={styles.moreModelsText}>+{item.models.length - 3}</Text>
          )}
        </View>
      )}
    </View>
  );
}

function SyncHistoryScreenContent({ onBack, onLogout }) {
  const insets = useSafeAreaInsets();
  const { isOnline } = useNetwork();
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');

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

  const renderFilterButton = (filterValue, label) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === filterValue && styles.filterButtonActive]}
      onPress={() => setFilter(filterValue)}
      activeOpacity={0.7}
    >
      <Text style={[styles.filterButtonText, filter === filterValue && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.screenContainer, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={onBack} style={styles.backButton} activeOpacity={0.7}>
            <Feather name="arrow-left" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Historial de Sincronización</Text>
          <View style={styles.headerRight}>
            <View style={[styles.onlineIndicator, { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' }]} />
          </View>
        </View>
        
        <View style={styles.filterContainer}>
          {renderFilterButton('all', 'Todas')}
          {renderFilterButton('success', 'Éxitos')}
          {renderFilterButton('partial', 'Parciales')}
          {renderFilterButton('failed', 'Fallidas')}
        </View>
      </View>

      {/* Lista */}
      <FlatList
        data={filteredHistory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <SyncHistoryItem item={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            colors={['#64c27b']}
            tintColor="#64c27b"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="inbox" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No hay historial</Text>
            <Text style={styles.emptySubtext}>
              Las sincronizaciones aparecerán aquí
            </Text>
          </View>
        }
        scrollIndicatorInsets={{ right: 1 }}
      />

      {/* Botón limpiar */}
      <TouchableOpacity 
        style={styles.clearButton} 
        onPress={handleClearHistory}
        activeOpacity={0.7}
      >
        <Feather name="trash-2" size={16} color="#EF4444" />
        <Text style={styles.clearButtonText}>Limpiar historial</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function SyncHistoryScreen({ onBack, onLogout }) {
  return (
    <SafeAreaProvider>
      <SyncHistoryScreenContent onBack={onBack} onLogout={onLogout} />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: '#f5f0ebff',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 8,
  },
  headerRight: {
    padding: 4,
  },
  onlineIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  filterButtonActive: {
    backgroundColor: '#64c27b',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 12,
    paddingBottom: 20,
  },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 10,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 8,
  },
  itemType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  itemDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  durationText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  detailsRow: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  detailBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  detailBadgeFailed: {
    backgroundColor: '#FEF2F2',
  },
  detailText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
  },
  detailTextFailed: {
    color: '#EF4444',
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#EF4444',
  },
  modelsRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
    gap: 6,
  },
  modelChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: '50%',
  },
  modelText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  moreModelsText: {
    fontSize: 11,
    color: '#9CA3AF',
    alignSelf: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
});