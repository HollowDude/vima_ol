import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import LeadCard from '../../../core/components/LeadCard';
import LeadDetailModal from '../../../core/components/LeadDetailModal';
import CreateLeadModal from '../../../core/components/CreateLeadModal';
import ToastContainer from '../../../core/components/ToastContainer';
import SlideMenu from '../../../core/components/SlideMenu';
import ExpandableFAB from '../../../core/components/ExpandableFab';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';
import { formatCurrency, getCurrencyCode } from '../../../core/utils/currencyhelper';

export default function LeadsScreen({ userData, username, onBack, onLogout }) {
  const { isOnline }            = useNetwork();
  const { syncAll, syncModule } = useSyncActions();

  const [leads, setLeads]                       = useState([]);
  const [stages, setStages]                     = useState([]);
  const [selectedStage, setSelectedStage]       = useState(null);
  const [selectedLead, setSelectedLead]         = useState(null);
  const [isCreateModalVisible, setCreateModal]  = useState(false);
  const [menuVisible, setMenuVisible]           = useState(false);
  const [refreshing, setRefreshing]             = useState(false);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (prevOnline === false && isOnline === true) {
      syncAll().then(() => loadData());
    }
  }, [isOnline, prevOnline]);

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

  const handleMoveToNextStage = async (lead) => {
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

  const getLeadsCountByStage = (id) =>
    leads.filter(l => (Array.isArray(l.stage_id) ? l.stage_id[0] : l.stage_id) === id).length;

  const getStageColor = (i) => {
    const p = (i + 1) / stages.length;
    return p < 0.33 ? '#EF4444' : p < 0.66 ? '#F59E0B' : '#10B981';
  };

  const filteredLeads = selectedStage
    ? leads.filter(l => (Array.isArray(l.stage_id) ? l.stage_id[0] : l.stage_id) === selectedStage)
    : leads;

  const revenueByСurrency = leads.reduce((acc, lead) => {
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

  // FAB: principal expande, menu abre sidebar, plus crea lead, arrow-left vuelve
  const fabActions = [
    { icon: 'more-vertical', onPress: () => {}                        },
    { icon: 'menu',          onPress: () => setMenuVisible(true)      },
    { icon: 'plus',          onPress: () => setCreateModal(true)      },
    { icon: 'arrow-left',    onPress: onBack                          },
  ];

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        <ToastContainer />

        <SlideMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          userData={userData}
          username={username}
          onLogout={onLogout}
        />

        <ExpandableFAB actions={fabActions} />

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
                  <Text style={styles.summaryText}>{leads.length} oportunidad{leads.length !== 1 ? 'es' : ''}</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryText}>{formatTotalRevenue()}</Text>
                </View>
              </View>
            </View>

            {/* Lista */}
            <View style={styles.leadsSection}>
              <View style={styles.leadsSectionHeader}>
                <Text style={styles.leadsSectionTitle}>
                  {selectedStage
                    ? `${stages.find(s => s.id === selectedStage)?.name || ''} (${filteredLeads.length})`
                    : `Todas (${leads.length})`}
                </Text>
                {selectedStage && (
                  <TouchableOpacity onPress={() => setSelectedStage(null)} style={styles.clearFilterButton}>
                    <Feather name="x" size={16} color="#6B7280" />
                    <Text style={styles.clearFilterText}>Limpiar</Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredLeads.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="briefcase" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyText}>
                    {selectedStage ? 'No hay oportunidades en esta etapa' : 'No hay oportunidades'}
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
        />
        <CreateLeadModal
          visible={isCreateModalVisible} userData={userData}
          onClose={() => setCreateModal(false)}
          onCreated={handleLeadCreated}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea:  { flex: 1, backgroundColor: '#f5f0ebff' },
  container: { flex: 1 },
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80, paddingBottom: 180 },
  mainCard:      { marginBottom: 16 },
  dashboard: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
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
  leadsSection: { padding: 16 },
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