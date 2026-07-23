import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, 
  Alert, Animated
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncService from '../sync/sync.service';
import useNetwork from '../hooks/useNetwork';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import ContactPickerModal from './ContactPickerModal';
import ContactTypeBadge from './ContactTypeBadge';
import SimpleDateTimePicker from './SimpleDateTimePicker';

const FEATURE_MULTI_CONTACT_BACKEND_READY = false;

// Format date to Odoo format - usa toISOString como en el resto de la app
function formatLocalDate(dateObj) {
  return dateObj.toISOString().replace('T', ' ').split('.')[0];
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
  projectFinishDate
}) {
  const { isOnline } = useNetwork();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [selectedPriority, setSelectedPriority] = useState('media');
  const [managementTags, setManagementTags] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);

  // ✅ Contactos multi-tipo
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [showContactPicker, setShowContactPicker] = useState(false);

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
    if (!partnerId) {
      setSelectedContacts([]);
    } else {
      // Si hay partnerId pre-seleccionado, restaurarlo como contacto inicial
      const existingClient = clients.find(c => c.id === partnerId);
      if (existingClient && selectedContacts.length === 0) {
        setSelectedContacts([{ type: 'client', id: partnerId, raw: existingClient, name: existingClient.name }]);
      }
    }
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
      
      if (partnerId && ownClients.length > 0 && selectedContacts.length === 0) {
        const preselectedClient = ownClients.find(c => c.id === partnerId);
        if (preselectedClient) {
          setSelectedContacts([{ type: 'client', id: partnerId, raw: preselectedClient, name: preselectedClient.name }]);
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

    // Validar contactos
    const hasContacts = selectedContacts.length > 0 || !!partnerId;
    if (!hideClientSelector && !hasContacts) {
      Alert.alert("Error", "Debes seleccionar al menos un cliente u oportunidad");
      return;
    }

    // Validar que la fecha no sea anterior a la actual
    const now = new Date();
    now.setSeconds(0, 0);
    const selectedDateTime = new Date(selectedDate);
    selectedDateTime.setSeconds(0, 0);
    
    if (selectedDateTime < now) {
      Alert.alert(
        "Fecha inválida",
        "No puedes crear una tarea con fecha u hora anterior a la actual"
      );
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

    // Usar formato local sin conversión a UTC
    const dateStr = formatLocalDate(selectedDate);

    // ── Resolver contactos ─────────────────────────────────────────────
    // Separar clientes y leads de los contactos seleccionados
    const clientContacts = selectedContacts.filter(c => c.type === 'client');
    const leadContacts = selectedContacts.filter(c => c.type === 'lead');

    const resolvedPartnerIds = [];

    // Resolver clientes directos
    for (const contact of clientContacts) {
      resolvedPartnerIds.push(contact.id);
    }

    // Resolver leads → partners (online = crear, offline = avisar)
    const unresolvedLeads = [];
    for (const contact of leadContacts) {
      const result = await SyncService.resolveOrCreatePartnerForLead(contact.raw, { isOnline });
      if (result) {
        resolvedPartnerIds.push(result.id);
      } else {
        unresolvedLeads.push(contact);
      }
    }

    if (unresolvedLeads.length > 0) {
      const names = unresolvedLeads.map(l => l.name).join(', ');
      Alert.alert(
        'Sin conexión',
        `La${unresolvedLeads.length > 1 ? 's' : ''} oportunidad${unresolvedLeads.length > 1 ? 'es' : ''} ${names} no tiene contacto vinculado.\n\nNecesitas conexión para vincularla la primera vez.\n\nLa tarea se creará igual sin incluir esa${unresolvedLeads.length > 1 ? 's' : ''} oportunidad${unresolvedLeads.length > 1 ? 'es' : ''}.`
      );
    }

    // Determinar partner_id principal (primer contacto resuelto)
    let finalPartnerId = partnerId;
    let clientName = '';

    if (resolvedPartnerIds.length > 0) {
      finalPartnerId = resolvedPartnerIds[0];
      // Buscar nombre
      const firstContact = selectedContacts.find(c => c.id === resolvedPartnerIds[0] || 
        (c.type === 'lead' && clientContacts.length === 0 && leadContacts.length > 0));
      if (firstContact) clientName = firstContact.name;
    }

    if (!finalPartnerId && partnerId) {
      finalPartnerId = partnerId;
      const foundClient = clients.find(c => c.id === partnerId);
      clientName = foundClient?.name || '';
    }

    if (!finalPartnerId) {
      // Fallback: usuario logueado como último recurso
      const currentUserData = await SyncService.getCurrentUser();
      finalPartnerId = currentUserData[0].partner_id[0];
      clientName = '';
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
      partner_id: [finalPartnerId, clientName],
      user_ids: [[6, 0, [userIdValue]]],
      date_deadline: dateStr,
      priority_level: selectedPriority,
      management_tags: managementTags ? managementTags : false,
      state: '01_in_progress',
      parent_id: false,
    };

    // Agregar multi-contacto si el backend lo soporta
    if (FEATURE_MULTI_CONTACT_BACKEND_READY && resolvedPartnerIds.length > 0) {
      newTaskData.task_contact_ids = [[6, 0, resolvedPartnerIds]];
    }

    try {
      const createdTask = await SyncService.createTaskLocally(newTaskData);
      
      // Asociar leads a la tarea
      for (const contact of leadContacts) {
        try {
          await SyncService.associateTaskToLead(contact.id, createdTask.id);
        } catch (assocError) {
          console.warn('Error asociando lead a tarea:', assocError);
        }
      }
      
      // Si hay conexión, intentar sincronizar inmediatamente
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
              <Text style={styles.label}>Contactos <Text style={styles.required}>*</Text></Text>
              
              {selectedContacts.length === 0 && !partnerId ? (
                <TouchableOpacity
                  style={styles.selectorButton}
                  onPress={() => setShowContactPicker(true)}
                >
                  <View style={styles.selectorContent}>
                    <Feather name="users" size={20} color="#64c27b" />
                    <Text style={[styles.selectorText, styles.placeholderText]}>
                      Seleccionar cliente u oportunidad...
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.selectorButton}
                  onPress={() => setShowContactPicker(true)}
                >
                  <View style={styles.selectorContent}>
                    <Feather name="users" size={20} color="#64c27b" />
                    <Text style={styles.selectorText}>
                      {selectedContacts.length > 0
                        ? `${selectedContacts.length} contacto${selectedContacts.length !== 1 ? 's' : ''} seleccionado${selectedContacts.length !== 1 ? 's' : ''}`
                        : 'Seleccionar contactos...'}
                    </Text>
                  </View>
                  <Feather name="chevron-down" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
              
              {/* Chips de contactos seleccionados */}
              {selectedContacts.length > 0 && (
                <View style={styles.contactChipsContainer}>
                  {selectedContacts.map((contact) => (
                    <View key={`${contact.type}-${contact.id}`} style={styles.contactChip}>
                      <ContactTypeBadge type={contact.type} compact />
                      <Text style={styles.contactChipText} numberOfLines={1}>
                        {contact.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedContacts(prev => prev.filter(c => !(c.type === contact.type && c.id === contact.id)));
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Feather name="x" size={14} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.field}>
            <Text style={styles.label}>Fecha y Hora <Text style={styles.required}>*</Text></Text>
            
            {projectFinishDate && (
              <View style={styles.rangeInfo}>
                <Feather name="info" size={14} color="#64c27b" />
                <Text style={styles.rangeInfoText}>
                  Debe ser antes del {new Date(projectFinishDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
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
            <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleSave}>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.buttonPrimaryText}>Crear Tarea</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAwareScrollView>

        {!hideClientSelector && (
          <ContactPickerModal
            visible={showContactPicker}
            title="Seleccionar Contactos"
            clients={clients}
            leads={leads}
            selectedKeys={selectedContacts.map(c => `${c.type}-${c.id}`)}
            onConfirm={(selected) => {
              setSelectedContacts(selected);
              setShowContactPicker(false);
            }}
            onClose={() => setShowContactPicker(false)}
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
  contactChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  contactChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9fafb', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', gap: 6 },
  contactChipText: { fontSize: 13, color: '#374151', fontWeight: '500', maxWidth: 150 },
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
  buttonPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  buttonSecondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  buttonSecondaryText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});