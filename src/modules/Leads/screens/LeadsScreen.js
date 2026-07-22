import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import LeadCard from '../../../core/components/LeadCard';
import LeadDetailModal from '../../../core/components/LeadDetailModal';
import TaskDetailModal from '../../../core/components/TaskDetailModal';
import CreateLeadModal from '../../../core/components/CreateLeadModal';
import ScreenLayout from '../../../core/components/ScreenLayout';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';
import { formatCurrency, getCurrencyCode } from '../../../core/utils/currencyhelper';
import OdooService from '../../../core/api/odoo.service';

export default function LeadsScreen({ userData, username, onBack, onLogout, onNavigateToTasks, onNavigateToSyncHistory }) {
  const { isOnline }            = useNetwork();
  const { syncAll, syncModule } = useSyncActions();

  const [leads, setLeads]                       = useState([]);
  const [filteredLeads, setFilteredLeads]       = useState([]);
  const [stages, setStages]                     = useState([]);
  const [selectedStage, setSelectedStage]       = useState(null);
  const [selectedLead, setSelectedLead]         = useState(null);
  const [selectedTask, setSelectedTask]       = useState(null);
  const [isCreateModalVisible, setCreateModal]  = useState(false);
  const [menuVisible, setMenuVisible]           = useState(false);
  const [refreshing, setRefreshing]             = useState(false);
  const [searchQuery, setSearchQuery]           = useState('');
  const [showOnlyOwn, setShowOnlyOwn]           = useState(true);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (prevOnline === false && isOnline === true) {
      syncAll().then(() => loadData());
    }
  }, [isOnline, prevOnline]);

  useEffect(() => { filterLeads(); }, [searchQuery, leads, showOnlyOwn, selectedStage]);

  const loadData = async () => {
    try {
      const [localLeads, crmStages] = await Promise.all([
        SyncService.getLocalLeads(),
        SyncService.getCrmStages(),
      ]);
      setLeads(localLeads);
      setStages(crmStages);
    } catch (e) { console.error('Error cargando datos:', e); }
  };

  const handleRefresh = async () => {
    if (!isOnline) { Alert.alert('Sin conexión', 'Necesitas internet para sincronizar'); return; }
    try { setRefreshing(true); await syncModule('leads'); await loadData(); }
    finally { setRefreshing(false); }
  };

  const filterLeads = () => {
    const currentUserId = OdooService.uid;

    let base = leads;

    // Filtro propio / todos
    if (showOnlyOwn) {
      base = base.filter(l => {
        const leadUserId = Array.isArray(l.user_id) ? l.user_id[0] : l.user_id;
        return leadUserId === currentUserId;
      });
    }

    // Filtro por etapa
    if (selectedStage) {
      base = base.filter(l => {
        const stageId = Array.isArray(l.stage_id) ? l.stage_id[0] : l.stage_id;
        return stageId === selectedStage;
      });
    }

    // Filtro de búsqueda
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      base = base.filter(l =>
        (l.name         || '').toLowerCase().includes(q) ||
        (l.partner_name || '').toLowerCase().includes(q) ||
        (l.contact_name || '').toLowerCase().includes(q) ||
        (l.email_from   || '').toLowerCase().includes(q) ||
        (l.phone        || '').includes(q) ||
        (l.mobile       || '').includes(q)
      );
    }

    setFilteredLeads(base);
  };

  const handleMoveToNextStage = async (lead) => {
    // Validar que el lead pertenece al usuario actual
    const leadUserId = Array.isArray(lead.user_id) ? lead.user_id[0] : lead.user_id;
    const currentUserId = OdooService.uid;
    
    if (leadUserId !== currentUserId) {
      Alert.alert(
        'No permitido',
        'Solo puedes modificar tus propias oportunidades'
      );
      return;
    }

    const currentId    = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
    const currentIndex = stages.findIndex(s => s.id === currentId);
    if (currentIndex < 0 || currentIndex >= stages.length - 1) return;
    const nextStage = stages[currentIndex + 1];
    try {
      await SyncService.updateLeadLocally(lead.id, { stage_id: [nextStage.id, nextStage.name] });
      Alert.alert('✓ Etapa actualizada',
        `${lead.name} → ${nextStage.name}${isOnline ? '' : '\n\nSe sincronizará al reconectar'}`);
      await loadData();
    } catch { Alert.alert('Error', 'No se pudo cambiar la etapa'); }
  };

  const handleLeadCreated = async () => { await loadData(); setCreateModal(false); };
  const handleLeadUpdated = async ()  => loadData();
  const handleLeadDeleted = async ()  => { setSelectedLead(null); await loadData(); };

  const getLeadsCountByStage = (id) => {
    const currentUserId = OdooService.uid;
    const baseLeads = showOnlyOwn
      ? leads.filter(l => {
          const leadUserId = Array.isArray(l.user_id) ? l.user_id[0] : l.user_id;
          return leadUserId === currentUserId;
        })
      : leads;
    
    return baseLeads.filter(l => (Array.isArray(l.stage_id) ? l.stage_id[0] : l.stage_id) === id).length;
  };

  const getStageColor = (i) => {
    const p = (i + 1) / stages.length;
    return p < 0.33 ? '#EF4444' : p < 0.66 ? '#F59E0B' : '#10B981';
  };

  const currentUserId = OdooService.uid;
  const baseLeadsForRevenue = showOnlyOwn
    ? leads.filter(l => {
        const uid = Array.isArray(l.user_id) ? l.user_id[0] : l.user_id;
        return uid === currentUserId;
      })
    : leads;

  const revenueByСurrency = baseLeadsForRevenue.reduce((acc, lead) => {
    const cur = getCurrencyCode(lead.company_currency);
    acc[cur] = (acc[cur] || 0) + (lead.expected_revenue || 0);
    return acc;
  }, {});

  const formatTotalRevenue = () => {
    const keys = Object.keys(revenueByСurrency);
    if (!keys.length) return formatCurrency(0, 'USD');
    if (keys.length === 1) return formatCurrency(revenueByСurrency[keys[0]], keys[0]);
    return keys.sort((a, b) => revenueByСurrency[b] - revenueByСurrency[a])
      .slice(0, 2).map(c => formatCurrency(revenueByСurrency[c], c)).join(' + ');
  };

  const ownCount = leads.filter(l => {
    const uid = Array.isArray(l.user_id) ? l.user_id[0] : l.user_id;
    return uid === currentUserId;
  }).length;

  const fabActions = [
    { icon: 'more-vertical', onPress: () => {}                        },
    { icon: 'menu',          onPress: () => setMenuVisible(true)      },
    { icon: 'plus',          onPress: () => setCreateModal(true)      },
    { icon: 'arrow-left',    onPress: onBack                          },
  ];

  return (
    <ScreenLayout
      userData={userData}
      username={username}
      onLogout={onLogout}
      menuVisible={menuVisible}
      setMenuVisible={setMenuVisible}
      fabActions={fabActions}
      onNavigateToSyncHistory={onNavigateToSyncHistory}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
            tintColor="#64c27b" colors={['#64c27b']} />
        }
      >
        <Card style={styles.mainCard}>
          <DashboardHeader userName={username || 'Usuario'} isOnline={isOnline} />

          {/* Toggle Mis oportunidades / Todas */}
          <View style={styles.toggleSection}>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, showOnlyOwn && styles.toggleBtnActive]}
                onPress={() => setShowOnlyOwn(true)}
                activeOpacity={0.8}
              >
                <Feather name="user-check" size={13} color={showOnlyOwn ? '#fff' : '#9CA3AF'} />
                <Text style={[styles.toggleBtnTxt, showOnlyOwn && styles.toggleBtnTxtActive]}>
                  Mis oportunidades ({ownCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toggleBtn, !showOnlyOwn && styles.toggleBtnActive]}
                onPress={() => setShowOnlyOwn(false)}
                activeOpacity={0.8}
              >
                <Feather name="briefcase" size={13} color={!showOnlyOwn ? '#fff' : '#9CA3AF'} />
                <Text style={[styles.toggleBtnTxt, !showOnlyOwn && styles.toggleBtnTxtActive]}>
                  Todas ({leads.length})
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Pipeline */}
          <View style={styles.dashboard}>
            <Text style={styles.dashboardTitle}>Flujo de Oportunidades</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dashboardScroll}>
              {stages.map((stage, i) => {
                const count    = getLeadsCountByStage(stage.id);
                const isActive = selectedStage === stage.id;
                const color    = getStageColor(i);
                return (
                  <TouchableOpacity
                    key={stage.id}
                    style={[styles.stageCard, isActive && styles.stageCardActive, { borderTopColor: color }]}
                    onPress={() => setSelectedStage(prev => prev === stage.id ? null : stage.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.stageCardHeader}>
                      <View style={[styles.stageIndicator, { backgroundColor: color }]} />
                      <Text style={styles.stageCardCount}>{count}</Text>
                    </View>
                    <Text style={styles.stageCardName} numberOfLines={2}>{stage.name}</Text>
                    {i < stages.length - 1 && <Feather name="arrow-right" size={12} color="#D1D5DB" style={styles.stageArrow} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.dashboardSummary}>
              <View style={styles.summaryItem}>
                <Feather name="briefcase" size={16} color="#64c27b" />
                <Text style={styles.summaryText}>
                  {baseLeadsForRevenue.length} oportunidad{baseLeadsForRevenue.length !== 1 ? 'es' : ''}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryText}>{formatTotalRevenue()}</Text>
              </View>
            </View>
          </View>

          {/* Buscador */}
          <View style={styles.searchSection}>
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar oportunidad..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Lista */}
          <View style={styles.leadsSection}>
            <View style={styles.leadsSectionHeader}>
              <Text style={styles.leadsSectionTitle}>
                {selectedStage
                  ? `${stages.find(s => s.id === selectedStage)?.name || ''} (${filteredLeads.length})`
                  : searchQuery
                    ? `Resultados (${filteredLeads.length})`
                    : `${showOnlyOwn ? 'Mis oportunidades' : 'Todas'} (${filteredLeads.length})`}
              </Text>
              {(selectedStage || searchQuery) && (
                <TouchableOpacity 
                  onPress={() => { setSelectedStage(null); setSearchQuery(''); }} 
                  style={styles.clearFilterButton}
                >
                  <Feather name="x" size={16} color="#6B7280" />
                  <Text style={styles.clearFilterText}>Limpiar</Text>
                </TouchableOpacity>
              )}
            </View>

            {filteredLeads.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="briefcase" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>
                  {searchQuery
                    ? 'No se encontraron oportunidades'
                    : selectedStage
                      ? 'No hay oportunidades en esta etapa'
                      : 'No hay oportunidades'}
                </Text>
              </View>
            ) : (
              filteredLeads.map(lead => (
                <LeadCard
                  key={lead.id} lead={lead} stages={stages}
                  onPress={() => setSelectedLead(lead)}
                  onMoveToNextStage={() => handleMoveToNextStage(lead)}
                />
              ))
            )}
          </View>
        </Card>
      </ScrollView>

      <LeadDetailModal
        visible={!!selectedLead} lead={selectedLead}
        onClose={() => setSelectedLead(null)}
        onLeadUpdated={handleLeadUpdated}
        onLeadDeleted={handleLeadDeleted}
        onViewTask={(task) => setSelectedTask(task)}
      />
      <TaskDetailModal
        visible={!!selectedTask}
        task={selectedTask}
        allTasks={[]}
        onClose={() => setSelectedTask(null)}
        onNavigateToLeads={onNavigateToTasks}
      />
      <CreateLeadModal
        visible={isCreateModalVisible} userData={userData}
        onClose={() => setCreateModal(false)}
        onCreated={handleLeadCreated}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80, paddingBottom: 180 },
  mainCard:      { marginBottom: 16 },
  
  toggleSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: '#64c27b',
    shadowColor: '#64c27b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleBtnTxt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  toggleBtnTxtActive: {
    color: '#fff',
  },

  dashboard: { padding: 16, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  dashboardTitle:  { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  dashboardScroll: { paddingRight: 20 },
  stageCard: {
    width: 120, height: 100, backgroundColor: '#F9FAFB',
    borderRadius: 12, borderTopWidth: 4, padding: 12, marginRight: 12, position: 'relative',
  },
  stageCardActive: {
    backgroundColor: '#f0fdf4',
    shadowColor: '#64c27b', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  stageCardHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  stageIndicator:   { width: 8, height: 8, borderRadius: 4 },
  stageCardCount:   { fontSize: 24, fontWeight: '700', color: '#111827' },
  stageCardName:    { fontSize: 12, fontWeight: '600', color: '#6B7280', lineHeight: 16 },
  stageArrow:       { position: 'absolute', right: -6, top: '50%' },
  dashboardSummary: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  summaryItem:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryText:  { fontSize: 14, fontWeight: '600', color: '#374151' },

  searchSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchIcon:   { marginRight: 8 },
  searchInput:  { flex: 1, fontSize: 15, color: '#0B1B2A' },

  leadsSection: { padding: 16, paddingTop: 0 },
  leadsSectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  leadsSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  clearFilterButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F3F4F6', borderRadius: 16,
  },
  clearFilterText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText:  { fontSize: 16, fontWeight: '600', color: '#9CA3AF', marginTop: 16 },
});