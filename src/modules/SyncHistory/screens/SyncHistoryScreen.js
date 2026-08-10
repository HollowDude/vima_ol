import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl, Alert, ScrollView
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncLog from '../../../core/sync/sync.log';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import DashboardHeader from '../../../core/components/DashboardHeader';
import ScreenLayout from '../../../core/components/ScreenLayout';
import Card from '../../../core/components/Card';

const STATUS_COLORS = {
  success: '#10B981',
  partial: '#F59E0B',
  failed: '#EF4444',
  syncing: '#3B82F6',
};

const DIRECTION_COLORS = {
  pull: '#64c27b',
  push: '#3B82F6',
  both: '#8B5CF6',
};

const MODEL_LABELS = {
  'res.partner': 'Clientes',
  'project.task': 'Tareas',
  'crm.lead': 'Oportunidades',
  'mail.message': 'Comentarios',
  'survey.survey': 'Encuestas',
  'survey.user_input': 'Respuestas Encuestas',
  'survey.question': 'Preguntas',
  'survey.question.answer': 'Respuestas Preguntas',
  'project.task.survey.rel': 'Relación Encuestas',
  'ir.attachment': 'Adjuntos',
  'res.country': 'Países',
  'res.country.state': 'Estados',
  'res.municipality': 'Municipios',
  'client.type': 'Tipos de Cliente',
  'project.task.tags': 'Etiquetas',
  'crm.stage': 'Etapas CRM',
  'reason.wizard': 'Razones',
};

const PHASE_LABELS = {
  MASTER: 'Datos base',
  PENDING: 'Pendientes',
  CLIENTS: 'Clientes',
  TASKS: 'Tareas',
  LEADS: 'Oportunidades',
  COMMENTS: 'Comentarios',
  SURVEYS: 'Encuestas',
  ATTACHMENTS: 'Adjuntos',
};

const STATUS_FILTERS = [
  { value: 'all', icon: 'inbox', label: 'Todas' },
  { value: 'success', icon: 'check-circle', label: 'Éxito' },
  { value: 'failed', icon: 'x-circle', label: 'Fallidas' },
];

const DIRECTION_FILTERS = [
  { value: 'all', icon: 'repeat', label: 'Ambos' },
  { value: 'pull', icon: 'download', label: 'Pull' },
  { value: 'push', icon: 'upload', label: 'Push' },
];

function SyncLogRow({ entry }) {
  const [expanded, setExpanded] = useState(false);

  const formatDate = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const modelLabel = PHASE_LABELS[entry.model] || MODEL_LABELS[entry.model] || entry.model;
  const color = STATUS_COLORS[entry.state] || '#9CA3AF';
  const dirColor = DIRECTION_COLORS[entry.direction] || '#9CA3AF';

  return (
    <View style={styles.logItemContainer}>
      <TouchableOpacity
        style={styles.logItemHeader}
        onPress={() => entry.error_message && setExpanded(!expanded)}
        activeOpacity={entry.error_message ? 0.7 : 1}
      >
        <View style={[styles.logDot, { backgroundColor: color }]} />
        <View style={styles.logMeta}>
          <Text style={styles.logModel} numberOfLines={1}>{modelLabel}</Text>
          <Text style={styles.logDateTime}>
            {formatDate(entry.date)} • {formatTime(entry.date)}
            {entry.direction === 'push' && entry.res_id > 0 ? ` • #${entry.res_id}` : ''}
            {entry.attempts > 1 ? ` • (${entry.attempts} intentos)` : ''}
          </Text>
        </View>
        <View style={[styles.logDirBadge, { backgroundColor: dirColor + '20', borderColor: dirColor }]}>
          <Text style={[styles.logDirText, { color: dirColor }]}>
            {entry.direction === 'pull' ? 'PULL' : 'PUSH'}
          </Text>
        </View>
      </TouchableOpacity>
      {expanded && entry.error_message && (
        <View style={[styles.logError, { backgroundColor: '#FEF2F2', borderColor: '#EF4444' }]}>
          <Feather name="alert-circle" size={14} color="#EF4444" />
          <Text style={styles.logErrorText}>{entry.error_message}</Text>
        </View>
      )}
    </View>
  );
}

export default function SyncHistoryScreen({ userData, username, onLogout, onNavigateToSyncHistory, onUnauthorized = () => {} }) {
  const { isOnline } = useNetwork();
  const { syncAll } = useSyncActions(onUnauthorized);
  const [logEntries, setLogEntries] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [menuVisible, setMenuVisible] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const logs = await SyncLog.getLocalSyncLogs();
      setLogEntries(logs);
    } catch (error) {
      console.error('Error cargando registro de sincronización:', error);
    }
  }, []);

  useEffect(() => {
    loadData();
    const unsub = SyncLog.onLogEntry(entry => {
      setLogEntries(prev => [entry, ...prev]);
    });
    return unsub;
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await syncAll();
    await loadData();
    setRefreshing(false);
  }, [loadData, syncAll]);

  const handleClear = () => {
    Alert.alert(
      'Limpiar',
      '¿Estás seguro de que quieres borrar todo el registro de operaciones?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await SyncLog.clearLocalSyncLogs();
            await loadData();
          },
        },
      ]
    );
  };

  const filteredLogs = logEntries.filter(e => {
    if (statusFilter !== 'all' && e.state !== statusFilter) return false;
    if (directionFilter !== 'all' && e.direction !== directionFilter) return false;
    return true;
  });

  const renderFilterButton = (filterValue, icon, label, currentFilter, setter) => (
    <TouchableOpacity
      key={filterValue}
      style={[styles.filterButton, currentFilter === filterValue && styles.filterButtonActive]}
      onPress={() => setter(filterValue)}
      activeOpacity={0.7}
    >
      <Feather
        name={icon}
        size={14}
        color={currentFilter === filterValue ? '#fff' : '#9CA3AF'}
      />
      <Text style={[styles.filterButtonText, currentFilter === filterValue && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const hasData = logEntries.length > 0;

  return (
    <ScreenLayout
      userData={userData}
      username={username}
      onLogout={onLogout}
      menuVisible={menuVisible}
      setMenuVisible={setMenuVisible}
      onNavigateToSyncHistory={onNavigateToSyncHistory}
      onUnauthorized={onUnauthorized}
    >
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
            <Text style={styles.title}>Registro de Sincronización</Text>

            <View style={styles.filterContainer}>
              {STATUS_FILTERS.map(f => renderFilterButton(f.value, f.icon, f.label, statusFilter, setStatusFilter))}
            </View>
            <View style={[styles.filterContainer, { marginTop: 6 }]}>
              {DIRECTION_FILTERS.map(f => renderFilterButton(f.value, f.icon, f.label, directionFilter, setDirectionFilter))}
            </View>

            {!hasData ? (
              <View style={styles.emptyState}>
                <Feather name="inbox" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No hay registros</Text>
                <Text style={styles.emptySubtext}>
                  Las operaciones de sincronización aparecerán aquí
                </Text>
              </View>
            ) : (
              <View style={styles.itemsList}>
                {filteredLogs.map((entry, idx) => (
                  <SyncLogRow key={`log-${idx}`} entry={entry} />
                ))}
              </View>
            )}
          </View>
        </Card>

        {hasData && (
          <View style={styles.bottomButtonContainer}>
            <TouchableOpacity
              style={styles.clearButton}
              onPress={handleClear}
              activeOpacity={0.7}
            >
              <Feather name="trash-2" size={16} color="#EF4444" />
              <Text style={styles.clearButtonText}>Limpiar registro</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B1B2A',
    marginBottom: 14,
  },
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
  itemsList: {
    gap: 10,
    marginTop: 16,
  },
  logItemContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  logItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  logDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logMeta: {
    flex: 1,
  },
  logModel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0B1B2A',
    marginBottom: 2,
  },
  logDateTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  logDirBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  logDirText: {
    fontSize: 11,
    fontWeight: '700',
  },
  logError: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  logErrorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    color: '#EF4444',
    lineHeight: 16,
  },
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
