import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { formatCurrency } from '../utils/currencyhelper';

export default function LeadCard({ lead, stages = [], onPress, onMoveToNextStage, style }) {
  const revenue = lead.expected_revenue || 0;
  const formattedRevenue = formatCurrency(revenue, lead.company_currency);

  const deadline = lead.date_deadline 
    ? new Date(lead.date_deadline).toLocaleDateString('es-ES', { 
        day: '2-digit', 
        month: 'short' 
      })
    : null;

  // Obtener stage actual y siguiente
  const currentStageId = Array.isArray(lead.stage_id) ? lead.stage_id[0] : lead.stage_id;
  const currentStageIndex = stages.findIndex(s => s.id === currentStageId);
  const currentStage = stages[currentStageIndex];
  const nextStage = currentStageIndex >= 0 && currentStageIndex < stages.length - 1 
    ? stages[currentStageIndex + 1] 
    : null;
  
  const partnerName = Array.isArray(lead.partner_id) ? lead.partner_id[1] : 'Sin contacto';

  const getStageColor = () => {
    if (!currentStage || currentStageIndex < 0) return '#9CA3AF';
    const progress = (currentStageIndex + 1) / stages.length;
    
    if (progress < 0.33) return '#EF4444'; // Rojo - Inicio
    if (progress < 0.66) return '#F59E0B'; // Naranja - Medio
    return '#10B981'; // Verde - Avanzado
  };

  const stageColor = getStageColor();
  const progress = currentStageIndex >= 0 ? ((currentStageIndex + 1) / stages.length) * 100 : 0;

  return (
    <View style={[styles.wrapper, style]}>
      <TouchableOpacity 
        style={[styles.container, { borderLeftColor: stageColor }]} 
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {lead.name || 'Sin nombre'}
            </Text>
            <Text style={styles.revenue}>{formattedRevenue}</Text>
          </View>

          {/* Badge de Stage con progreso */}
          <View style={[styles.stageBadge, { backgroundColor: stageColor }]}>
            <View style={styles.stageProgress}>
              <View 
                style={[styles.stageProgressFill, { width: `${progress}%` }]} 
              />
            </View>
            <Text style={styles.stageText}>
              {currentStage?.name || 'Sin etapa'}
            </Text>
          </View>
        </View>

        <View style={styles.infoContainer}>
          <View style={styles.infoRow}>
            <Feather name="user" size={12} color="#9CA3AF" />
            <Text style={styles.infoText} numberOfLines={1}>
              {partnerName}
            </Text>
          </View>

          {deadline && (
            <View style={styles.infoRow}>
              <Feather name="calendar" size={12} color="#9CA3AF" />
              <Text style={styles.infoText}>{deadline}</Text>
            </View>
          )}
        </View>

        {/*Botón de siguiente etapa */}
        {nextStage && onMoveToNextStage && (
          <TouchableOpacity
            style={styles.nextStageButtonIntegrated}
            onPress={(e) => {
              e.stopPropagation(); // Evitar que se active el onPress de la card
              onMoveToNextStage();
            }}
            activeOpacity={0.7}
          >
            <View style={styles.nextStageContent}>
              <Text style={styles.nextStageLabel}>Avanzar a:</Text>
              <Text style={styles.nextStageName} numberOfLines={1}>
                {nextStage.name}
              </Text>
            </View>
            <View style={styles.nextStageArrow}>
              <Feather name="arrow-right" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginRight: 8,
  },
  revenue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10B981',
  },
  stageBadge: {
    borderRadius: 8,
    padding: 8,
    overflow: 'hidden',
  },
  stageProgress: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 6,
    overflow: 'hidden',
  },
  stageProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  stageText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoContainer: {
    gap: 6,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
  },
  
  nextStageButtonIntegrated: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  nextStageContent: {
    flex: 1,
    marginRight: 8,
  },
  nextStageLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  nextStageName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  nextStageArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#64c27b',
    alignItems: 'center',
    justifyContent: 'center',
  },
});