import React from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback
} from 'react-native';
import { Feather } from '@expo/vector-icons';

const ESTADOS = [
  { id: '01_in_progress', name: 'En Proceso', color: '#64c27b', icon: 'play-circle' },
  { id: '02_changes_requested', name: 'Cambios Solicitados', color: '#F59E0B', icon: 'alert-circle' },
  { id: '03_approved', name: 'Aprobado', color: '#10B981', icon: 'check-circle' },
  { id: '1_done', name: 'Finalizado', color: '#22c55e', icon: 'check' },
  { id: '1_canceled', name: 'Cancelado', color: '#EF4444', icon: 'x-circle' },
  { id: '04_waiting_normal', name: 'En Espera', color: '#9CA3AF', icon: 'clock' },
];

export default function StateSelectorModal({
  visible,
  currentState,
  onClose,
  onSelectState,
  requiresDescription = false,
  onRequireDescription,
}) {
  const handleSelect = (estado) => {
    if (requiresDescription && onRequireDescription) {
      onSelectState(estado.id);
      onRequireDescription();
    } else {
      onSelectState(estado.id);
    }
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.card}>
              <Text style={styles.title}>Seleccionar Estado</Text>
              
              <View style={styles.optionsContainer}>
                {ESTADOS.map((estado) => {
                  const isSelected = estado.id === currentState;
                  return (
                    <TouchableOpacity
                      key={estado.id}
                      style={[
                        styles.option,
                        isSelected && styles.optionSelected,
                        isSelected && { borderColor: estado.color },
                      ]}
                      onPress={() => handleSelect(estado)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.iconContainer, { backgroundColor: estado.color + '20' }]}>
                        <Feather name={estado.icon} size={20} color={estado.color} />
                      </View>
                      <View style={styles.optionContent}>
                        <Text style={[styles.optionName, isSelected && { color: estado.color }]}>
                          {estado.name}
                        </Text>
                        {isSelected && (
                          <Text style={styles.currentBadge}>Actual</Text>
                        )}
                      </View>
                      {isSelected && (
                        <Feather name="check" size={20} color={estado.color} />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 20,
  },
  optionsContainer: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  optionSelected: {
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  currentBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64c27b',
    marginTop: 2,
  },
  cancelButton: {
    marginTop: 20,
    padding: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
});