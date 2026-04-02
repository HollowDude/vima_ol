import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, 
  Alert
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncService from '../sync/sync.service';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import SelectionModal from './SelectionModal';
import SimpleDateTimePicker from './SimpleDateTimePicker';

const PRIORITY_OPTIONS = [
  { id: 'baja', name: 'Baja', color: '#64c27b', icon: 'chevron-down' },
  { id: 'media', name: 'Media', color: '#F59E0B', icon: 'minus' },
  { id: 'alta', name: 'Alta', color: '#EF4444', icon: 'alert-triangle' },
];

export default function CreateTaskModal({ 
  visible, 
  userData, 
  projectId, 
  partnerId, 
  hideClientSelector = false, 
  onClose, 
  onCreated, 
  projectFinishDate
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [selectedPriority, setSelectedPriority] = useState('media');
  const [managementTags, setManagementTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);

  useEffect(() => {
    if (visible) {
      resetForm();
      loadData();
    }
  }, [visible]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedDate(new Date());
    setSelectedPriority('media');
    setManagementTags([]);
    
    if (!partnerId) {
      setSelectedClient(null);
    }
  };

  const loadData = async () => {
    try {
      const [tags, localClients] = await Promise.all([
        SyncService.getManagementTags(),
        SyncService.getLocalClients()
      ]);
      
      setAvailableTags(tags);
      setClients(localClients);
      
      if (partnerId && localClients.length > 0) {
        const preselectedClient = localClients.find(c => c.id === partnerId);
        if (preselectedClient) {
          setSelectedClient(preselectedClient);
        }
      }
    } catch (e) {
      console.error('Error cargando datos iniciales:', e);
    }
  };

  const toggleTag = (tagId) => {
    setManagementTags(prev => {
      if (prev === tagId) return null;
      return tagId;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Error", "Debes escribir un título");
      return;
    }

    if (!hideClientSelector && !partnerId && !selectedClient) {
      Alert.alert("Error", "Debes seleccionar un cliente");
      return;
    }

    let finalProjectId = projectId;
    if (!finalProjectId) {
      const currentProject = await SyncService.getMasterData('current_project');
      finalProjectId = currentProject ? currentProject.id : null;
    }

    if (!finalProjectId) {
      Alert.alert("Error", "No se pudo obtener el proyecto actual");
      return;
    }

    if (projectFinishDate) {
      const finishDay = new Date(projectFinishDate);
      finishDay.setHours(23, 59, 59);
      
      if (selectedDate > finishDay) {
        Alert.alert(
          "Fuera de rango",
          `La fecha debe ser antes del ${finishDay.toLocaleDateString('es-ES')}`
        );
        return;
      }
    }

    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())} ${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}:${pad(selectedDate.getSeconds())}`;

    let finalPartnerId = partnerId; 
    
    if (!finalPartnerId && selectedClient) {
      finalPartnerId = selectedClient.id; 
    }
    
    if (!finalPartnerId) {
      const partner_id = await SyncService.getCurrentUser();
      finalPartnerId = partner_id[0].partner_id[0];
    }

    let userIdValue;
    if (typeof userData === 'object' && userData.uid !== undefined) {
      userIdValue = typeof userData.uid === 'number' ? userData.uid : parseInt(userData.uid);
    } else if (typeof userData === 'number') {
      userIdValue = userData;
    } else {
      console.error("❌ userData inválido:", userData);
      Alert.alert("Error", "No se pudo determinar el usuario actual");
      return;
    }

    if (isNaN(userIdValue) || userIdValue <= 0) {
      console.error("❌ userIdValue inválido:", userIdValue);
      Alert.alert("Error", "ID de usuario inválido");
      return;
    }

    const newTaskData = {
      name: title,
      display_name: title,
      description: description || '',
      project_id: finalProjectId,
      partner_id: finalPartnerId,
      user_ids: [[6, 0, [userIdValue]]],
      date_deadline: dateStr,
      priority_level: selectedPriority,
      management_tags: managementTags ? managementTags : false,
      state: '01_in_progress',
      parent_id: false,
    };

    try {
      const createdTask = await SyncService.createTaskLocally(newTaskData);
      Alert.alert("✓ Tarea creada", "Se ha programado correctamente");
      onCreated(createdTask.id);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar la tarea");
    }
  };

  const maxDate = projectFinishDate ? new Date(projectFinishDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nueva Tarea</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={24} color="#374151" />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView 
          style={styles.scrollContainer} 
          contentContainerStyle={styles.scrollContent}
          enableOnAndroid={true}
          extraScrollHeight={200} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          
          <View style={styles.field}>
            <Text style={styles.label}>
              Título <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ej: Reunión con cliente"
              placeholderTextColor="#9CA3AF"
              maxLength={100}
            />
          </View>

          {!hideClientSelector && !partnerId && (
            <View style={styles.field}>
              <Text style={styles.label}>
                Cliente <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity 
                style={styles.selectorButton} 
                onPress={() => setShowClientModal(true)}
              >
                <View style={styles.selectorContent}>
                  <Feather name="users" size={20} color="#64c27b" />
                  <Text style={[
                    styles.selectorText, 
                    !selectedClient && styles.placeholderText
                  ]}>
                    {selectedClient ? selectedClient.name : "Seleccionar cliente..."}
                  </Text>
                </View>
                <Feather name="chevron-down" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}

          {partnerId && selectedClient && (
            <View style={styles.field}>
              <Text style={styles.label}>Cliente</Text>
              <View style={styles.preselectedClient}>
                <Feather name="users" size={20} color="#64c27b" />
                <Text style={styles.preselectedClientText}>
                  {selectedClient.name}
                </Text>
                <View style={styles.preselectedBadge}>
                  <Text style={styles.preselectedBadgeText}>Preseleccionado</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>
              Fecha y Hora <Text style={styles.required}>*</Text>
            </Text>
            
            {projectFinishDate && (
              <View style={styles.rangeInfo}>
                <Feather name="info" size={14} color="#64c27b" />
                <Text style={styles.rangeInfoText}>
                  Debe ser antes del {new Date(projectFinishDate).toLocaleDateString('es-ES', { 
                    day: '2-digit', 
                    month: 'short',
                    year: 'numeric'
                  })}
                </Text>
              </View>
            )}

            <TouchableOpacity 
              style={styles.datePickerButton} 
              onPress={() => setShowDatePicker(true)}
            >
              <View style={styles.datePickerLeft}>
                <Feather name="calendar" size={20} color="#64c27b" />
                <View style={styles.datePickerTextContainer}>
                  <Text style={styles.datePickerDate}>
                    {selectedDate.toLocaleDateString('es-ES', { 
                      weekday: 'long',
                      day: '2-digit', 
                      month: 'long',
                      year: 'numeric'
                    })}
                  </Text>
                  <Text style={styles.datePickerTime}>
                    {selectedDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-down" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Prioridad</Text>
            <View style={styles.priorityContainer}>
              {PRIORITY_OPTIONS.map((priority) => {
                const isSelected = selectedPriority === priority.id;
                return (
                  <TouchableOpacity
                    key={priority.id}
                    style={[
                      styles.priorityChip,
                      isSelected && { backgroundColor: priority.color + '20', borderColor: priority.color }
                    ]}
                    onPress={() => setSelectedPriority(priority.id)}
                  >
                    <Feather 
                      name={priority.icon} 
                      size={16} 
                      color={isSelected ? priority.color : '#9CA3AF'} 
                    />
                    <Text style={[
                      styles.priorityChipText,
                      isSelected && { color: priority.color, fontWeight: '700' }
                    ]}>
                      {priority.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {availableTags.length > 0 && (
            <View style={styles.field}>
              <Text style={styles.label}>Etiquetas de gestión (opcional)</Text>
              <View style={styles.tagsContainer}>
                {availableTags.map((tag) => {
                  const isSelected = managementTags === tag.id;
                  return (
                    <TouchableOpacity
                      key={tag.id}
                      style={[
                        styles.tagChip,
                        isSelected && styles.tagChipSelected
                      ]}
                      onPress={() => toggleTag(tag.id)}
                    >
                      <Text style={[
                        styles.tagChipText,
                        isSelected && styles.tagChipTextSelected
                      ]}>
                        {tag.name}
                      </Text>
                      {isSelected && (
                        <Feather name="check" size={14} color="#fff" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Descripción (opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Agrega detalles..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              maxLength={1000}
            />
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.button, styles.buttonSecondary]} 
              onPress={onClose}
            >
              <Text style={styles.buttonSecondaryText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.buttonPrimary]} 
              onPress={handleSave}
            >
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.buttonPrimaryText}>Crear Tarea</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>

        {!hideClientSelector && !partnerId && (
          <SelectionModal
            visible={showClientModal}
            title="Seleccionar Cliente"
            data={clients}
            onSelect={(client) => {
              setSelectedClient(client);
              setShowClientModal(false);
            }}
            onClose={() => setShowClientModal(false)}
            selectedIds={selectedClient ? [selectedClient.id] : []}
          />
        )}

        <SimpleDateTimePicker
          visible={showDatePicker}
          onClose={() => setShowDatePicker(false)}
          selectedDate={selectedDate}
          onConfirm={setSelectedDate}
          minDate={startOfToday}
          maxDate={maxDate}
          mode="datetime"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F9FAFB' 
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: '#fff', 
    borderBottomWidth: 1, 
    borderBottomColor: '#E5E7EB',
    paddingTop: 60,
  },
  headerTitle: { 
    fontSize: 20, 
    fontWeight: '700', 
    color: '#111827' 
  },
  closeButton: {
    padding: 4,
  },

  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#EF4444',
  },

  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#111827',
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },

  preselectedClient: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86efac',
    gap: 12,
  },
  preselectedClientText: {
    flex: 1,
    fontSize: 15,
    color: '#15803d',
    fontWeight: '600',
  },
  preselectedBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  preselectedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
  },

  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  selectorText: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    flex: 1,
  },
  placeholderText: {
    color: '#9CA3AF',
    fontWeight: 'normal',
  },

  rangeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  rangeInfoText: {
    flex: 1,
    fontSize: 12,
    color: '#15803d',
    fontWeight: '500',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  datePickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  datePickerTextContainer: {
    marginLeft: 12,
  },
  datePickerDate: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  datePickerTime: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },

  priorityContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  priorityChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },

  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 6,
  },
  tagChipSelected: {
    backgroundColor: '#64c27b',
    borderColor: '#64c27b',
  },
  tagChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  tagChipTextSelected: {
    color: '#fff',
  },

  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  buttonPrimary: {
    backgroundColor: '#64c27b',
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  buttonSecondaryText: {
    color: '#374151',
    fontSize: 15,
    fontWeight: '600',
  },
});