import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, 
  Alert, Animated, ActivityIndicator
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncService from '../sync/sync.service';
import useNetwork from '../hooks/useNetwork';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import ContactPickerModal from './ContactPickerModal';
import ContactTypeBadge from './ContactTypeBadge';
import SimpleDateTimePicker from './SimpleDateTimePicker';

// Format date to Odoo format - usa toISOString como en el resto de la app
function formatLocalDate(dateObj) {
  return dateObj.toISOString().replace('T', ' ').split('.')[0];
}

// Parse fecha Odoo ("YYYY-MM-DD" o "YYYY-MM-DD HH:mm:ss") como fecha LOCAL, no UTC
function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(' ');
  const datePart = parts[0].split('-').map(Number);
  const timePart = parts[1] ? parts[1].split(':').map(Number) : [0, 0, 0];
  return new Date(datePart[0], datePart[1] - 1, datePart[2], timePart[0] || 0, timePart[1] || 0, timePart[2] || 0);
}

const PRIORITY_OPTIONS = [
  { id: 'baja', name: 'Baja', color: '#64c27b', icon: 'chevron-down' },
  { id: 'media', name: 'Media', color: '#F59E0B', icon: 'minus' },
  { id: 'alta', name: 'Alta', color: '#EF4444', icon: 'alert-triangle' },
];

function DescriptionHint({ visible }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: visible ? 0 : -8, duration: 250, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  return (
    <Animated.View style={[styles.descriptionHint, { opacity, transform: [{ translateY }] }]}>
      <Feather name="info" size={13} color="#EF4444" />
      <Text style={styles.descriptionHintText}>
        La descripción es obligatoria. Odoo no permite completar tareas sin ella.
      </Text>
    </Animated.View>
  );
}

export default function CreateTaskModal({ 
  visible, 
  userData, 
  projectId, 
  partnerId, 
  hideClientSelector = false, 
  onClose, 
  onCreated, 
  projectFinishDate,
  leadId,
}) {
  const { isOnline } = useNetwork();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [selectedPriority, setSelectedPriority] = useState('media');
  const [managementTags, setManagementTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  // Contacto único (cliente O lead)
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const descriptionShake = useRef(new Animated.Value(0)).current;

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
    setSelectedContact(null);
  };

  const loadData = async () => {
    try {
      const [tags, ownClients, ownLeads] = await Promise.all([
        SyncService.getManagementTags(),
        SyncService.getOwnClients(),
        SyncService.getOwnLeads(),
      ]);
      
      setAvailableTags(tags);
      setClients(ownClients);
      setLeads(ownLeads);

      if (partnerId && ownClients.length > 0 && !selectedContact) {
        const preselected = ownClients.find(c => c.id === partnerId);
        if (preselected) {
          setSelectedContact({ type: 'client', id: partnerId, raw: preselected, name: preselected.name });
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
    setSaving(true);

    try {
      if (!title.trim()) {
        Alert.alert("Error", "Debes escribir un título");
        return;
      }

      if (!hideClientSelector && !selectedContact && !partnerId) {
        Alert.alert("Error", "Debes seleccionar un cliente u oportunidad");
        return;
      }

      const now = new Date();
      now.setSeconds(0, 0);
      const selectedDateTime = new Date(selectedDate);
      selectedDateTime.setSeconds(0, 0);

      if (selectedDateTime < now) {
        Alert.alert("Fecha inválida", "No puedes crear una tarea con fecha u hora anterior a la actual");
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
        const finishDay = parseLocalDate(projectFinishDate);
        finishDay.setHours(23, 59, 59);
        if (selectedDate > finishDay) {
          Alert.alert("Fuera de rango", `La fecha debe ser antes del ${finishDay.toLocaleDateString('es-ES')}`);
          return;
        }
      }

      const dateStr = formatLocalDate(selectedDate);

      let finalPartnerId = false;
      let clientName = '';
      let selectedLeadId = null;

      if (selectedContact) {
        if (selectedContact.type === 'client') {
          finalPartnerId = selectedContact.id;
          clientName = selectedContact.name;
        } else if (selectedContact.type === 'lead') {
          const partner = await SyncService.resolveOrCreatePartnerForLead(selectedContact.raw, { isOnline });
          if (!partner) {
            Alert.alert('Sin conexión', `La oportunidad "${selectedContact.name}" no tiene un contacto vinculado.\n\nNecesitas conexión para vincularla.`);
            return;
          }
          finalPartnerId = partner.id;
          clientName = partner.name || selectedContact.name;
          selectedLeadId = selectedContact.id;
        }
      } else if (partnerId) {
        finalPartnerId = partnerId;
        const found = clients.find(c => c.id === partnerId);
        clientName = found?.name || '';
      } else if (leadId) {
        const leadData = leads.find(l => l.id === leadId);
        if (leadData) {
          const partner = await SyncService.resolveOrCreatePartnerForLead(leadData, { isOnline });
          if (partner) {
            finalPartnerId = partner.id;
            clientName = partner.name || leadData.name;
          } else {
            Alert.alert(
              'Sin conexión',
              `La oportunidad "${leadData.name}" no tiene un contacto vinculado.\n\nNecesitas conexión para vincularla.`
            );
            return;
          }
        }
      }

      if (!finalPartnerId && !hideClientSelector) {
        Alert.alert("Error", "Debes seleccionar un cliente u oportunidad");
        return;
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
        description: description.trim(),
        project_id: finalProjectId,
        partner_id: finalPartnerId ? [finalPartnerId, clientName] : false,
        user_ids: [[6, 0, [userIdValue]]],
        date_deadline: dateStr,
        priority_level: selectedPriority,
        management_tags: managementTags ? managementTags : false,
        state: '01_in_progress',
        parent_id: false,
      };

      const createdTask = await SyncService.createTaskLocally(newTaskData);

      const assocPromises = [];
      if (selectedLeadId) {
        assocPromises.push(
          SyncService.associateTaskToLead(selectedLeadId, createdTask.id)
            .catch(e => console.warn('Error asociando lead a tarea:', e))
        );
      }
      if (leadId && leadId !== selectedLeadId) {
        assocPromises.push(
          SyncService.associateTaskToLead(leadId, createdTask.id)
            .catch(e => console.warn('Error asociando lead (prop) a tarea:', e))
        );
      }
      await Promise.all(assocPromises);

      if (isOnline) {
        try {
          await SyncService.syncPendingChanges();
          Alert.alert("✓ Tarea creada y sincronizada", "Se ha subido al servidor");
        } catch (syncError) {
          Alert.alert("✓ Tarea creada", "Se sincronizará cuando haya conexión");
        }
      } else {
        Alert.alert("✓ Tarea creada", "Se subirá cuando haya conexión");
      }

      onCreated(createdTask.id);
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar la tarea");
    } finally {
      setSaving(false);
    }
  };

  const maxDate = projectFinishDate ? parseLocalDate(projectFinishDate) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
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
            <Text style={styles.label}>Título <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Ej: Reunión con cliente"
              placeholderTextColor="#9CA3AF"
              maxLength={100}
            />
          </View>

          {!hideClientSelector && (
            <View style={styles.field}>
              <Text style={styles.label}>Contacto <Text style={styles.required}>*</Text></Text>

              {selectedContact ? (
                <TouchableOpacity
                  style={styles.contactCard}
                  onPress={() => setShowContactPicker(true)}
                  activeOpacity={0.7}
                >
                  <View style={styles.contactCardLeft}>
                    <ContactTypeBadge type={selectedContact.type} compact />
                    <Text style={styles.contactCardName} numberOfLines={1}>
                      {selectedContact.name}
                    </Text>
                  </View>
                  <View style={styles.contactCardRight}>
                    {selectedContact.type === 'lead' && (
                      <Text style={styles.contactCardHint}>Se completará automáticamente</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => setSelectedContact(null)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="x" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.selectorButton}
                  onPress={() => setShowContactPicker(true)}
                >
                  <View style={styles.selectorContent}>
                    <Feather name="user-plus" size={20} color="#64c27b" />
                    <Text style={[styles.selectorText, styles.placeholderText]}>
                      Seleccionar cliente u oportunidad...
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}

              <View style={styles.contactHelpRow}>
                <Feather name="info" size={12} color="#9CA3AF" />
                <Text style={styles.contactHelpText}>
                  Si eliges una oportunidad, el contacto de la tarea se completará automáticamente.
                </Text>
              </View>
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Fecha y Hora <Text style={styles.required}>*</Text></Text>
            
            {projectFinishDate && (
              <View style={styles.rangeInfo}>
                <Feather name="info" size={14} color="#64c27b" />
                <Text style={styles.rangeInfoText}>
                  Debe ser antes del {parseLocalDate(projectFinishDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
              <View style={styles.datePickerLeft}>
                <Feather name="calendar" size={20} color="#64c27b" />
                <View style={styles.datePickerTextContainer}>
                  <Text style={styles.datePickerDate}>
                    {selectedDate.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
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
                    style={[styles.priorityChip, isSelected && { backgroundColor: priority.color + '20', borderColor: priority.color }]}
                    onPress={() => setSelectedPriority(priority.id)}
                  >
                    <Feather name={priority.icon} size={16} color={isSelected ? priority.color : '#9CA3AF'} />
                    <Text style={[styles.priorityChipText, isSelected && { color: priority.color, fontWeight: '700' }]}>
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
                      style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                      onPress={() => toggleTag(tag.id)}
                    >
                      <Text style={[styles.tagChipText, isSelected && styles.tagChipTextSelected]}>
                        {tag.name}
                      </Text>
                      {isSelected && <Feather name="check" size={14} color="#fff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.field}>
            <View style={styles.descriptionLabelRow}>
              <Text style={styles.label}>Descripción</Text>
            </View>
            <Animated.View style={{ transform: [{ translateX: descriptionShake }] }}>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe el objetivo de esta tarea, qué debe hacerse y cualquier detalle relevante..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={2000}
              />
            </Animated.View>
            <View style={styles.descriptionFooter}>
              <Text style={[styles.descriptionCharCount, description.length > 1800 && styles.descriptionCharCountWarn]}>
                {description.length}/2000
              </Text>
              {description.trim().length === 0 && (
                <Text style={styles.descriptionFooterNote}>
                  Necesaria para poder completar la tarea en Odoo
                </Text>
              )}
            </View>
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onClose}>
              <Text style={styles.buttonSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
              activeOpacity={saving ? 1 : 0.7}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="check" size={18} color="#fff" />
              )}
              <Text style={styles.buttonPrimaryText}>{saving ? 'Guardando...' : 'Crear Tarea'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>

        {!hideClientSelector && (
          <ContactPickerModal
            visible={showContactPicker}
            title="Seleccionar Contacto"
            clients={clients}
            leads={leads}
            onSelect={(contact) => {
              setSelectedContact(contact);
              setShowContactPicker(false);
            }}
            onClose={() => setShowContactPicker(false)}
            isOnline={isOnline}
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
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingTop: 60 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  closeButton: { padding: 4 },
  field: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required: { color: '#EF4444' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 15, color: '#111827' },
  textArea: { height: 120, paddingTop: 12 },
  descriptionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  descriptionHint: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 8, padding: 10, marginBottom: 8, gap: 6 },
  descriptionHintText: { flex: 1, fontSize: 12, color: '#DC2626', lineHeight: 17 },
  descriptionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingHorizontal: 2 },
  descriptionCharCount: { fontSize: 11, color: '#9CA3AF' },
  descriptionCharCountWarn: { color: '#F59E0B', fontWeight: '600' },
  descriptionFooterNote: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic', marginLeft: 15, marginRight: 12 },

  selectorButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB' },
  selectorContent: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  selectorText: { fontSize: 15, color: '#111827', fontWeight: '500', flex: 1 },
  placeholderText: { color: '#9CA3AF', fontWeight: 'normal' },
  contactCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', padding: 14, borderRadius: 8,
    borderWidth: 1, borderColor: '#64c27b',
  },
  contactCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  contactCardName: { fontSize: 15, fontWeight: '600', color: '#111827', flexShrink: 1 },
  contactCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactCardHint: { fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' },
  contactHelpRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  contactHelpText: { fontSize: 12, color: '#9CA3AF', flex: 1 },
  rangeInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 8, marginBottom: 12, gap: 8 },
  rangeInfoText: { flex: 1, fontSize: 12, color: '#15803d', fontWeight: '500' },
  datePickerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB' },
  datePickerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  datePickerTextContainer: { marginLeft: 12 },
  datePickerDate: { fontSize: 15, color: '#111827', fontWeight: '500', textTransform: 'capitalize' },
  datePickerTime: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  priorityContainer: { flexDirection: 'row', gap: 12 },
  priorityChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#fff', borderWidth: 2, borderColor: '#E5E7EB', gap: 8 },
  priorityChipText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', gap: 6 },
  tagChipSelected: { backgroundColor: '#64c27b', borderColor: '#64c27b' },
  tagChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tagChipTextSelected: { color: '#fff' },
  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 10 },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 8, gap: 8 },
  buttonPrimary: { backgroundColor: '#64c27b' },
  buttonDisabled: { backgroundColor: '#D1D5DB' },
  buttonPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  buttonSecondaryText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});