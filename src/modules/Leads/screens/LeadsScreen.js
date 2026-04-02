import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import LeadCard from '../../../core/components/LeadCard';
import LeadDetailModal from '../../../core/components/LeadDetailModal';
import CreateLeadModal from '../../../core/components/CreateLeadModal';
import useNetwork from '../../../core/hooks/useNetwork';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';
import { formatCurrency, getCurrencyCode } from '../../../core/utils/currencyhelper';

export default function LeadsScreen({ userData, username, onBack }) {
  const { isOnline } = useNetwork();
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    let isActive = true;

    const handleReconnection = async () => {
      if (prevOnline === false && isOnline === true) {
        
        try {
          setActionStatus('Sincronizando...');
          await SyncService.syncAll();
          
          if (isActive) {
            await loadData();
          }
        } catch (error) {
        } finally {
          if (isActive) {
            setActionStatus(null);
          }
        }
      }
    };

    handleReconnection();
    return () => { isActive = false; };
  }, [isOnline, prevOnline]);

  const getStatusColor = () => {
    if (!isOnline) return '#504b4bff';
    if (actionStatus) return '#e8c39e';
    return '#64c27b';
  };

  const loadData = async () => {
    try {
      setActionStatus('Cargando...');
      
      const [localLeads, crmStages] = await Promise.all([
        SyncService.getLocalLeads(),
        SyncService.getCrmStages()
      ]);
      
      setLeads(localLeads);
      setStages(crmStages);
    } catch (error) {
      console.error('Error cargando datos:', error);
    } finally {
      setActionStatus(null);
    }
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Sin conexión', 'Necesitas conexión a internet para sincronizar');
      return;
    }

    try {
      setRefreshing(true);
      setActionStatus('Sincronizando...');
      
      await SyncService.syncAll();
      await loadData();
      
      setActionStatus(null);
    } catch (error) {
      console.error('❌ Error sincronizando:', error);
      Alert.alert('Error', 'No se pudo sincronizar. Intenta de nuevo.');
      setActionStatus(null);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStagePress = (stageId) => {
    setSelectedStage(selectedStage === stageId ? null : stageId);
  };

  const handleMoveToNextStage = async (lead) => {
    const currentStageId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
    const currentStageIndex = stages.findIndex(s => s.id === currentStageId);
    
    if (currentStageIndex >= 0 && currentStageIndex < stages.length - 1) {
      const nextStage = stages[currentStageIndex + 1];
      
      try {
        await SyncService.updateLeadLocally(lead.id, {
          stage_id: [nextStage.id, nextStage.name]
        });
        
        Alert.alert(
          '✓ Etapa actualizada', 
          `${lead.name} movido a: ${nextStage.name}${isOnline ? '' : '\n\nSe sincronizará cuando haya conexión'}`
        );
        
        await loadData();
        
        if (isOnline) {
          try {
            setActionStatus('Sincronizando cambio...');
            await SyncService.syncLeads();
            await loadData();
            setActionStatus(null);
          } catch (syncError) {
            console.warn('⚠️ Error sincronizando (cambio guardado localmente):', syncError);
            setActionStatus(null);
          }
        }
      } catch (error) {
        console.error('Error moviendo lead:', error);
        Alert.alert('Error', 'No se pudo cambiar la etapa');
      }
    }
  };

  const handleLeadCreated = async () => {
    await loadData();
    setCreateModalVisible(false);
    
    if (isOnline) {
      try {
        setActionStatus('Sincronizando nuevo lead...');
        await SyncService.syncLeads();
        await loadData();
        setActionStatus(null);
      } catch (error) {
        setActionStatus(null);
      }
    }
  };

  const handleLeadUpdated = async () => {
    await loadData();
  };

  const handleLeadDeleted = async (deletedLeadId) => {
    setSelectedLead(null);
    await loadData();
    
    if (isOnline) {
      try {
        setActionStatus('Sincronizando eliminación...');
        await SyncService.syncAll();
        await loadData();
        setActionStatus(null);
      } catch (error) {
        console.warn('⚠️ Error sincronizando eliminación (guardado localmente):', error);
        setActionStatus(null);
      }
    }
  };

  const getLeadsCountByStage = (stageId) => {
    return leads.filter(lead => {
      const leadStageId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
      return leadStageId === stageId;
    }).length;
  };

  const getStageColor = (index) => {
    const progress = (index + 1) / stages.length;
    if (progress < 0.33) return '#EF4444';
    if (progress < 0.66) return '#F59E0B';
    return '#10B981';
  };

  const filteredLeads = selectedStage 
    ? leads.filter(lead => {
        const leadStageId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
        return leadStageId === selectedStage;
      })
    : leads;

  // Agrupar revenue por moneda
  const revenueByСurrency = leads.reduce((acc, lead) => {
    const currency = getCurrencyCode(lead.company_currency);
    const revenue = lead.expected_revenue || 0;
    
    if (!acc[currency]) {
      acc[currency] = 0;
    }
    acc[currency] += revenue;
    
    return acc;
  }, {});

  // Formatear el total - mostrar la moneda principal o las 2 principales
  const formatTotalRevenue = () => {
    const currencies = Object.keys(revenueByСurrency);
    
    if (currencies.length === 0) {
      return formatCurrency(0, 'USD');
    }
    
    if (currencies.length === 1) {
      // Solo una moneda - mostrar total
      return formatCurrency(revenueByСurrency[currencies[0]], currencies[0]);
    }
    
    // Múltiples monedas - mostrar las 2 principales
    const sortedCurrencies = currencies
      .sort((a, b) => revenueByСurrency[b] - revenueByСurrency[a])
      .slice(0, 2);
    
    return sortedCurrencies
      .map(curr => formatCurrency(revenueByСurrency[curr], curr))
      .join(' + ');
  };

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.fabContainer}>
          <TouchableOpacity 
            style={[styles.fabAdd, {backgroundColor: getStatusColor()}]} 
            onPress={() => setCreateModalVisible(true)} 
            activeOpacity={0.8}
          >
            <Feather name="plus" size={24} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.fabBack, {backgroundColor: getStatusColor()}]} 
            onPress={onBack} 
            activeOpacity={0.8}
          >
            <Feather name="arrow-left" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#64c27b"
              colors={['#64c27b']}
            />
          }
        >
          <Card style={styles.mainCard}>
            <DashboardHeader
              userName={username || 'Usuario'}
              isOnline={isOnline}
              actionStatus={actionStatus}
            />

            {/* Dashboard de Pipeline */}
            <View style={styles.dashboard}>
              <Text style={styles.dashboardTitle}>Flujo de Oportunidades</Text>
              
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dashboardScroll}
              >
                {stages.map((stage, index) => {
                  const count = getLeadsCountByStage(stage.id);
                  const isActive = selectedStage === stage.id;
                  const stageColor = getStageColor(index);

                  return (
                    <TouchableOpacity
                      key={stage.id}
                      style={[
                        styles.stageCard,
                        isActive && styles.stageCardActive,
                        { borderTopColor: stageColor }
                      ]}
                      onPress={() => handleStagePress(stage.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.stageCardHeader}>
                        <View style={[styles.stageIndicator, { backgroundColor: stageColor }]} />
                        <Text style={styles.stageCardCount}>{count}</Text>
                      </View>
                      
                      <Text style={styles.stageCardName} numberOfLines={2}>
                        {stage.name}
                      </Text>
                      
                      {index < stages.length - 1 && (
                        <Feather 
                          name="arrow-right" 
                          size={12} 
                          color="#D1D5DB" 
                          style={styles.stageArrow}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Resumen total */}
              <View style={styles.dashboardSummary}>
                <View style={styles.summaryItem}>
                  <Feather name="briefcase" size={16} color="#64c27b" />
                  <Text style={styles.summaryText}>
                    {leads.length} oportunidad{leads.length !== 1 ? 'es' : ''}
                  </Text>
                </View>
                
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryText}>
                    {formatTotalRevenue()}
                  </Text>
                </View>
              </View>
            </View>

            {/* Lista de Leads */}
            <View style={styles.leadsSection}>
              <View style={styles.leadsSectionHeader}>
                <Text style={styles.leadsSectionTitle}>
                  {selectedStage 
                    ? `${stages.find(s => s.id === selectedStage)?.name || ''} (${filteredLeads.length})`
                    : `Todas las oportunidades (${leads.length})`
                  }
                </Text>
                
                {selectedStage && (
                  <TouchableOpacity 
                    onPress={() => setSelectedStage(null)}
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
                    {selectedStage ? 'No hay oportunidades en esta etapa' : 'No hay oportunidades'}
                  </Text>
                  {!isOnline && !selectedStage && (
                    <Text style={styles.emptySubtext}>
                      Conéctate para sincronizar
                    </Text>
                  )}
                </View>
              ) : (
                filteredLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stages={stages}
                    onPress={() => setSelectedLead(lead)}
                    onMoveToNextStage={() => handleMoveToNextStage(lead)}
                  />
                ))
              )}
            </View>
          </Card>
        </ScrollView>

        <LeadDetailModal
          visible={!!selectedLead}
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onLeadUpdated={handleLeadUpdated}
          onLeadDeleted={handleLeadDeleted} // 🔥 NUEVA PROP
        />

        <CreateLeadModal
          visible={isCreateModalVisible}
          userData={userData}
          onClose={() => setCreateModalVisible(false)}
          onCreated={handleLeadCreated}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f0ebff',
  },
  container: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    zIndex: 999,
    gap: 12,
  },
  fabBack: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#64c27b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  fabAdd: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#64c27b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 80,
    paddingBottom: 180,
  },
  mainCard: {
    marginBottom: 16,
  },

  dashboard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dashboardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  dashboardScroll: {
    paddingRight: 20,
  },
  stageCard: {
    width: 120,
    height: 100,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderTopWidth: 4,
    padding: 12,
    marginRight: 12,
    position: 'relative',
  },
  stageCardActive: {
    backgroundColor: '#f0fdf4',
    shadowColor: '#64c27b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  stageCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stageIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  stageCardCount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  stageCardName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 16,
  },
  stageArrow: {
    position: 'absolute',
    right: -6,
    top: '50%',
  },
  dashboardSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },

  leadsSection: {
    padding: 16,
  },
  leadsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  leadsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  clearFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#D1D5DB',
    marginTop: 8,
  },
});