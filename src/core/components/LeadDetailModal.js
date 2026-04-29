import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Animated, PanResponder, Dimensions,
  TouchableOpacity, TextInput, Alert, Platform, Keyboard
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SyncService from '../sync/sync.service';
import CreateTaskModal from './CreateTaskModal';
import SelectionModal from './SelectionModal';
import SimpleDatePicker from './SimpleDatePicker'; // <--- IMPORTADO
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import validators from '../utils/validators';
import { formatCurrency } from '../utils/currencyhelper';
import OdooService from '../api/odoo.service';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.9;

const InputField = ({ label, val, setVal, kbd = 'default', placeholder, multiline = false, error, required = false }) => (
    <View style={styles.editableField}>
      <Text style={styles.editableLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput 
        style={[
            styles.editableInput, 
            multiline && { height: 80, textAlignVertical: 'top' },
            error && { borderColor: '#EF4444', borderWidth: 1 }
        ]}
        value={val} 
        onChangeText={setVal} 
        keyboardType={kbd} 
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
);

const SelectorField = ({ label, value, placeholder, onPress }) => (
  <View style={styles.editableField}>
    <Text style={styles.editableLabel}>{label}</Text>
    <TouchableOpacity 
        style={styles.selectorButton} 
        onPress={() => { Keyboard.dismiss(); onPress(); }}
        activeOpacity={0.7}
    >
      <Text style={[styles.selectorText, !value && styles.placeholderText]}>
        {value || placeholder}
      </Text>
      <Feather name={value ? "calendar" : "chevron-down"} size={20} color="#9CA3AF" />
    </TouchableOpacity>
  </View>
);

export default function LeadDetailModal({ visible, lead, onClose, onLeadUpdated, onLeadDeleted, onViewTask }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const panY = useRef(new Animated.Value(0)).current;

  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('info'); 
  const [leadTasks, setLeadTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [isCreateTaskVisible, setCreateTaskVisible] = useState(false);

  // Form States
  const [formName, setFormName] = useState('');
  const [formRevenue, setFormRevenue] = useState('');
  const [formProb, setFormProb] = useState('');
  const [formDateDeadline, setFormDateDeadline] = useState(null); // <--- NUEVO ESTADO FECHA
  const [formPartnerName, setFormPartnerName] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStreet, setFormStreet] = useState('');
  const [formStreet2, setFormStreet2] = useState('');
  const [formState, setFormState] = useState(null);
  const [formCountry, setFormCountry] = useState(null);
  const [formClientTypes, setFormClientTypes] = useState([]);
  const [formDesc, setFormDesc] = useState('');

  const [errors, setErrors] = useState({ 
    formName: '', 
    email: '', 
    phone: '', 
    probability: '', 
    expectedRevenue: '' 
  });

  const [modalType, setModalType] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false); // <--- VISIBILIDAD DATE PICKER
  
  const [masterCountries, setMasterCountries] = useState([]);
  const [masterStates, setMasterStates] = useState([]);
  const [masterTypes, setMasterTypes] = useState([]);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    if (visible && lead) {
      resetForm(lead);
      loadTasks();
      loadMasters();
      panY.setValue(0);
      Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT - MODAL_HEIGHT, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, lead]);

  useEffect(() => {
    if (lead) {
      const leadUserId = Array.isArray(lead.user_id) ? lead.user_id[0] : lead.user_id;
      const currentUserId = OdooService.uid;
      setCanEdit(leadUserId === currentUserId);
    }
  }, [lead]);

  const loadMasters = async () => {
    try {
      const [countries, states, types] = await Promise.all([
        SyncService.getMasterData('countries'),
        SyncService.getMasterData('states'),
        SyncService.getMasterData('client_types'),
      ]);
      setMasterCountries(countries || []);
      setMasterStates(states || []);
      setMasterTypes(types || []);
    } catch (e) { console.error("Error loading masters", e); }
  };

  const resetForm = (data) => {
    setEditing(false);
    setErrors({ formName: '', email: '', phone: '', probability: '', expectedRevenue: '' });

    setFormName(data.name || '');
    setFormRevenue(data.expected_revenue ? String(data.expected_revenue) : '');
    setFormProb(data.probability ? String(data.probability) : '');
    
    // Parse fecha cierre (formato backend suele ser YYYY-MM-DD)
    if (data.date_deadline) {
        // Aseguramos que se interprete en hora local evitando desfases de timezone
        const [y, m, d] = data.date_deadline.split('-');
        setFormDateDeadline(new Date(y, m - 1, d));
    } else {
        setFormDateDeadline(null);
    }
    
    const defaultPartnerName = data.partner_name || (Array.isArray(data.partner_id) ? data.partner_id[1] : '') || '';
    setFormPartnerName(defaultPartnerName);

    setFormContactName(data.contact_name || '');
    setFormEmail(data.email_from || '');
    setFormPhone(data.phone || data.mobile || '');
    setFormStreet(data.street || '');
    setFormStreet2(data.street2 || '');
    setFormDesc(data.description || '');

    setFormCountry(Array.isArray(data.country_id) ? { id: data.country_id[0], name: data.country_id[1] } : null);
    setFormState(Array.isArray(data.state_id) ? { id: data.state_id[0], name: data.state_id[1] } : null);
    setFormClientTypes(data.client_type || []);
  };

  const loadTasks = async () => {
    setLoadingTasks(true);
    const tasks = await SyncService.getLeadTasks(lead.id);
    setLeadTasks(tasks);
    setLoadingTasks(false);
  };

  const handleEmailChange = (text) => {
    setFormEmail(text);
    if (text && !validators.isValidEmailValue(text)) {
      setErrors(prev => ({ ...prev, email: 'Email inválido (ej. usuario@dominio.com)' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const handlePhoneChange = (text) => {
    const formatted = validators.formatMobileForDisplay(text);
    setFormPhone(formatted);
    if (formatted && !validators.isValidMobileValue(formatted) && !validators.isValidPhoneValue(formatted)) {
      setErrors(prev => ({ ...prev, phone: 'Formato inválido (+CC 1234 5678 o 1234 5678)' }));
    } else {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  const handleFormRevenueChange = (text) => {
    const normalized = (text || '').toString().replace(',', '.').replace(/[^0-9.]/g, '');
    setFormRevenue(normalized);
    if (normalized && !validators.isPositiveNumber(normalized)) {
      setErrors(prev => ({ ...prev, expectedRevenue: 'La ganancia debe ser un número positivo.' }));
    } else {
      setErrors(prev => ({ ...prev, expectedRevenue: '' }));
    }
  };

  const handleFormProbChange = (text) => {
    const normalized = (text || '').toString().replace(',', '.').replace(/[^0-9.]/g, '');
    setFormProb(normalized);
    const val = parseFloat(normalized);
    if (normalized !== '' && (isNaN(val) || !validators.isValidPercentage(val))) {
      setErrors(prev => ({ ...prev, probability: 'El porcentaje debe estar entre 0 y 100.' }));
    } else {
      setErrors(prev => ({ ...prev, probability: '' }));
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setErrors(prev => ({ ...prev, formName: 'El nombre es obligatorio.' }));
      Alert.alert('Datos inválidos', 'El nombre de la oportunidad es obligatorio.');
      return;
    }

    if (errors.email || errors.phone || errors.probability || errors.expectedRevenue) {
      Alert.alert('Datos inválidos', 'Por favor corrige los errores en rojo antes de guardar.');
      return;
    }

    const normalizedPhone = validators.normalizeMobileForPayload(formPhone);
    const cleanedDescription = validators.cleanHtmlAndNormalize(formDesc);

    // Formatear fecha para el backend YYYY-MM-DD
    let formattedDateDeadline = false;
    if (formDateDeadline) {
        const y = formDateDeadline.getFullYear();
        const m = String(formDateDeadline.getMonth() + 1).padStart(2, '0');
        const d = String(formDateDeadline.getDate()).padStart(2, '0');
        formattedDateDeadline = `${y}-${m}-${d}`;
    }

    const updates = {
      name: formName.trim(),
      expected_revenue: formRevenue ? parseFloat(formRevenue) : 0,
      probability: formProb ? parseFloat(formProb) : 0,
      date_deadline: formattedDateDeadline, // <--- INCLUIR FECHA EN UPDATE
      partner_name: formPartnerName.trim(),
      contact_name: formContactName.trim(),
      email_from: formEmail.trim(),
      phone: normalizedPhone,
      mobile: normalizedPhone,
      description: cleanedDescription,
      country_id: formCountry ? formCountry.id : false,
      state_id: formState ? formState.id : false,
      street: formStreet.trim(),
      street2: formStreet2.trim(),
      client_type: [[6, 0, formClientTypes]]
    };

    try {
      await SyncService.updateLeadLocally(lead.id, updates);
      
      if (onLeadUpdated) onLeadUpdated(updates);
      Alert.alert('Guardado', 'Los cambios se han guardado localmente.');
      setEditing(false);
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No fue posible guardar los cambios.');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      '⚠️ Eliminar Oportunidad',
      `¿Estás seguro de eliminar "${lead.name}"?\n\n${leadTasks.length > 0 ? `⚠️ También se eliminarán ${leadTasks.length} tarea(s) asociada(s).` : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const result = await SyncService.deleteLeadLocally(lead.id);
              
              Alert.alert(
                '✓ Eliminado',
                `Oportunidad eliminada.${result.deletedTasksCount > 0 ? `\n${result.deletedTasksCount} tarea(s) eliminada(s).` : ''}\n\nSe sincronizará cuando haya conexión.`
              );
              
              if (onLeadDeleted) onLeadDeleted(lead.id);
              closeModal();
            } catch (error) {
              console.error('Error eliminando lead:', error);
              Alert.alert('Error', 'No se pudo eliminar la oportunidad.');
            }
          }
        }
      ]
    );
  };

  const closeModal = () => {
    setEditing(false);
    Keyboard.dismiss();
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start(onClose);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) panY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) closeModal();
        else Animated.spring(panY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const getModalData = () => {
    if (modalType === 'country') return masterCountries;
    if (modalType === 'state') return formCountry ? masterStates.filter(s => s.country_id[0] === formCountry.id) : masterStates;
    if (modalType === 'client_type') return masterTypes;
    return [];
  };

  const handleSelection = (item) => {
    if (modalType === 'country') { 
        if(formCountry?.id !== item.id) { setFormState(null); }
        setFormCountry(item); 
    }
    else if (modalType === 'state') { 
        setFormState(item); 
        if(!formCountry && item.country_id) setFormCountry({id: item.country_id[0], name: item.country_id[1]});
    }
    else if (modalType === 'client_type') {
      setFormClientTypes(prev => {
        const current = prev || [];
        return current.includes(item.id) 
            ? current.filter(i => i !== item.id) 
            : [...current, item.id];
      });
    }
  };

  const getClientTypeNames = () => {
    if (!masterTypes || !formClientTypes) return '';
    const names = masterTypes.filter(t => formClientTypes.includes(t.id)).map(t => t.name);
    return names.join(', ');
  };

  const renderClientTypeChips = (ids) => {
    if (!masterTypes || !ids) return null; 
    const names = masterTypes.filter(t => ids.includes(t.id)).map(t => t.name);
    if (names.length === 0) return <Text style={{color: '#9CA3AF', fontStyle: 'italic'}}>Ninguno</Text>;
    
    return (
      <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4}}>
        {names.map((n, i) => (
          <View key={i} style={styles.chip}>
             <Text style={styles.chipText}>{n}</Text>
          </View>
        ))}
      </View>
    );
  };

  const InfoRow = ({ icon, label, value }) => {
    if (!value || value === 'false') return null;
    return (
      <View style={styles.infoRow}>
        <View style={styles.iconContainer}><Feather name={icon} size={18} color="#9CA3AF" /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={styles.infoValue}>{value}</Text>
        </View>
      </View>
    );
  };

  const handleTaskPress = (task) => {
    if (onViewTask) {
      onViewTask(task);
    } else {
      Alert.alert(
        task.display_name || task.name,
        `Estado: ${task.state || 'Sin estado'}\nFecha: ${task.date_deadline || 'Sin fecha'}`,
        [{ text: 'OK' }]
      );
    }
  };

  if (!lead) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />
        
        <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }, { translateY: panY }] }]}>
            <View style={{flex: 1}}>
                <View style={styles.dragHeader} {...panResponder.panHandlers}>
                    <View style={styles.handle} />
                </View>

                <View style={styles.actionsHeader}>
                    {editing ? (
                        <View style={{flexDirection: 'row'}}>
                            <TouchableOpacity onPress={() => { setEditing(false); resetForm(lead); }} style={[styles.editButton, {marginRight: 15}]}>
                                <Text style={[styles.editButtonText, {color: '#EF4444'}]}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSave} style={styles.editButton}>
                                <Text style={styles.editButtonText}>Guardar</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <View style={{flexDirection: 'row', gap: 12}}>
                            {/**<TouchableOpacity onPress={handleDelete} style={styles.editButton}>
                                <Feather name="trash-2" size={16} color="#EF4444" />
                                <Text style={styles.delButtonText}>Eliminar</Text>
                            </TouchableOpacity>**/}
                            
                            {!editing && canEdit && (
                              <TouchableOpacity onPress={() => setEditing(true)} style={styles.editButton}>
                                <Feather name="edit-2" size={16} color="#64c27b" />
                                <Text style={styles.editButtonText}>Editar</Text>
                              </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>

                <View style={styles.tabs}>
                    <TouchableOpacity onPress={() => setActiveTab('info')} style={[styles.tab, activeTab === 'info' && styles.activeTab]}>
                    <Text style={[styles.tabText, activeTab === 'info' && styles.activeTabText]}>Información</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setActiveTab('tasks')} style={[styles.tab, activeTab === 'tasks' && styles.activeTab]}>
                    <Text style={[styles.tabText, activeTab === 'tasks' && styles.activeTabText]}>Tareas ({leadTasks.length})</Text>
                    </TouchableOpacity>
                </View>

                <KeyboardAwareScrollView 
                    style={styles.scrollContainer} 
                    contentContainerStyle={{padding: 24, paddingBottom: 60}}
                    enableOnAndroid={true}
                    extraScrollHeight={100}
                    keyboardShouldPersistTaps="handled" 
                >
                    {activeTab === 'info' ? (
                    <>
                        {!editing && (
                            <View style={{alignItems: 'center', marginBottom: 24}}>
                                <View style={styles.avatar}>
                                    <Feather name="trending-up" size={32} color="#64c27b" />
                                </View>
                                <Text style={styles.name}>{lead.name}</Text>
                                <Text style={{color: '#64c27b', fontWeight: '700', marginTop: 4}}>
                                    {formatCurrency(lead.expected_revenue, lead.company_currency)} <Text style={{color: '#9CA3AF', fontWeight: '400'}}>({lead.probability}%)</Text>
                                </Text>
                            </View>
                        )}

                        {editing ? (
                        <>
                            <Text style={styles.sectionTitle}>Básicos</Text>
                            <InputField 
                              label="Nombre Oportunidad" 
                              val={formName} 
                              setVal={setFormName} 
                              placeholder="Ej. Venta Equipos" 
                              required
                              error={errors.formName}
                            />
                            
                            <SelectorField 
                                label="Fecha Cierre Estimada" 
                                value={formDateDeadline ? formDateDeadline.toLocaleDateString('es-ES', { dateStyle: 'long' }) : ''} 
                                onPress={() => setShowDatePicker(true)} 
                                placeholder="Seleccionar Fecha" 
                            />

                            <View style={{ flexDirection: 'row', gap: 12 }}>
                              <View style={{ flex: 1 }}>
                                <InputField 
                                  label="Ingresos Esperados" 
                                  val={formRevenue} 
                                  setVal={handleFormRevenueChange} 
                                  kbd="numeric" 
                                  placeholder="0.00" 
                                  error={errors.expectedRevenue}
                                />
                              </View>
                              <View style={{ width: 100 }}>
                                <InputField 
                                  label="Probabilidad" 
                                  val={formProb} 
                                  setVal={handleFormProbChange} 
                                  kbd="numeric" 
                                  placeholder="0-100" 
                                  error={errors.probability}
                                />
                              </View>
                            </View>
                            
                            <Text style={styles.sectionTitle}>Contacto</Text>
                            <InputField label="Empresa / Cliente" val={formPartnerName} setVal={setFormPartnerName} placeholder="Nombre Empresa"/>
                            <InputField label="Nombre del Contacto" val={formContactName} setVal={setFormContactName} placeholder="Persona de contacto"/>
                            
                            <SelectorField 
                                label="Tipos de Cliente" 
                                value={getClientTypeNames()} 
                                onPress={() => setModalType("client_type")} 
                                placeholder="Seleccionar tipos" 
                            />
                            
                            <InputField 
                                label="Email" 
                                val={formEmail} 
                                setVal={handleEmailChange} 
                                kbd="email-address" 
                                placeholder="email@ejemplo.com"
                                error={errors.email}
                            />
                            <InputField 
                                label="Teléfono / Celular" 
                                val={formPhone} 
                                setVal={handlePhoneChange} 
                                kbd="phone-pad" 
                                placeholder="+53 ..."
                                error={errors.phone}
                            />
                            
                            <Text style={styles.sectionTitle}>Dirección</Text>
                            <InputField label="Calle" val={formStreet} setVal={setFormStreet} placeholder="Calle Principal"/>
                            <InputField label="Apto / calle2" val={formStreet2} setVal={setFormStreet2} placeholder="Apto, Unidad..."/>
                            <SelectorField label="País" value={formCountry?.name} onPress={() => setModalType("country")} placeholder="Seleccionar País"/>
                            <SelectorField label="Provincia" value={formState?.name} onPress={() => setModalType("state")} placeholder="Seleccionar Provincia"/>

                            <Text style={styles.sectionTitle}>Notas</Text>
                            <InputField label="" val={formDesc} setVal={setFormDesc} placeholder="Descripción de la oportunidad..." multiline />
                        </>
                        ) : (
                        <>
                            <View style={styles.divider} />
                            <Text style={styles.sectionTitle}>Detalles</Text>
                            <InfoRow icon="calendar" label="Cierre Estimado" value={lead.date_deadline || 'No definida'} />
                            <InfoRow icon="briefcase" label="Empresa" value={lead.partner_name || lead.partner_id?.[1]} />
                            <InfoRow icon="user" label="Contacto" value={lead.contact_name} />
                            <InfoRow icon="mail" label="Email" value={lead.email_from} />
                            <InfoRow icon="smartphone" label="Teléfono" value={lead.phone || lead.mobile} />
                            
                            <View style={styles.infoRow}>
                                <View style={styles.iconContainer}><Feather name="tag" size={18} color="#9CA3AF" /></View>
                                <View style={{flex:1}}>
                                    <Text style={styles.infoLabel}>Tipos de Cliente</Text>
                                    {renderClientTypeChips(lead.client_type || [])}
                                </View>
                            </View>

                            <View style={styles.divider} />
                            <Text style={styles.sectionTitle}>Ubicación</Text>
                            <InfoRow icon="map-pin" label="Dirección" value={[lead.street, lead.street2].filter(Boolean).join(', ')} />
                            <InfoRow icon="globe" label="Región" value={[
                                Array.isArray(lead.state_id) ? lead.state_id[1] : null,
                                Array.isArray(lead.country_id) ? lead.country_id[1] : null
                            ].filter(Boolean).join(', ')} 
                            />

                            {lead.description && (
                                <View style={{marginTop: 16, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8}}>
                                    <Text style={{color: '#374151', fontStyle: 'italic'}}>{validators.cleanHtmlAndNormalize(lead.description)}</Text>
                                </View>
                            )}
                        </>
                        )}
                    </>
                    ) : (
                    <View>
                        {!canEdit && (
                          <View style={styles.readOnlyBanner}>
                            <Feather name="lock" size={14} color="#9CA3AF" />
                            <Text style={styles.readOnlyText}>Vista de solo lectura</Text>
                          </View>
                        )}
                        {canEdit && (
                          <TouchableOpacity style={styles.addTaskBtn} onPress={() => setCreateTaskVisible(true)}>
                              <Feather name="plus" size={18} color="#fff" />
                              <Text style={{color: '#fff', fontWeight: 'bold'}}>Nueva Tarea</Text>
                          </TouchableOpacity>
                        )}
                        {leadTasks.map(t => (
                            <TouchableOpacity 
                              key={t.id} 
                              style={styles.taskCard} 
                              onPress={() => handleTaskPress(t)}
                            >
                                <View>
                                    <Text style={styles.taskTitle}>{t.name}</Text>
                                    <Text style={styles.taskSub}>{t.date_deadline || 'Sin fecha límite'}</Text>
                                </View>
                                <Feather name="chevron-right" size={20} color="#D1D5DB"/>
                            </TouchableOpacity>
                        ))}
                        {leadTasks.length === 0 && <Text style={{textAlign:'center', color:'#999', marginTop: 20}}>No hay tareas registradas.</Text>}
                    </View>
                    )}
                </KeyboardAwareScrollView>
            </View>
        </Animated.View>

        {/* --- MODAL PARA SELECTORES (PAIS, ESTADO, TIPO) --- */}
        {modalType && (
            <SelectionModal
              visible={!!modalType}
              title={modalType === 'client_type' ? 'Tipos de Cliente' : 'Seleccionar ' + modalType}
              data={getModalData()}
              onSelect={handleSelection}
              onClose={() => setModalType(null)}
              selectedIds={modalType === 'client_type' ? formClientTypes : []}
              multiple={modalType === 'client_type'}
            />
          )}

        {/* --- DATE PICKER PARA FECHA DE CIERRE --- */}
        <SimpleDatePicker 
            visible={showDatePicker}
            onClose={() => setShowDatePicker(false)}
            selectedDate={formDateDeadline || new Date()}
            onConfirm={(date) => {
                setFormDateDeadline(date);
                setShowDatePicker(false);
            }}
            // minDate={new Date()} // Descomentar si no se permiten fechas pasadas
        />

        <CreateTaskModal 
          visible={isCreateTaskVisible} 
          userData={{ uid: lead.user_id }}
          partnerId={lead.partner_id ? (Array.isArray(lead.partner_id) ? lead.partner_id[0] : lead.partner_id) : null}
          hideClientSelector={true}
          onClose={() => setCreateTaskVisible(false)}
          onCreated={async (tid) => {
            await SyncService.associateTaskToLead(lead.id, tid);
            loadTasks();
            setCreateTaskVisible(false);
          }}
        />
      </View>
    </Modal>
  );
}


const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  modalContainer: { height: MODAL_HEIGHT, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  
  dragHeader: { width: '100%', height: 30, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  handle: { width: 48, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3 },
  actionsHeader: { paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', justifyContent: 'flex-end', borderBottomWidth: 1, borderColor: '#f3f4f6' },
  
  scrollContainer: { flex: 1, backgroundColor: '#fff' },
  
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  name: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#F3F4F6' },
  tab: { flex: 1, paddingVertical: 16, alignItems: 'center' },
  activeTab: { borderBottomWidth: 2, borderColor: '#64c27b' },
  tabText: { color: '#9CA3AF', fontWeight: '600', fontSize: 14 },
  activeTabText: { color: '#64c27b' },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 12, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  infoLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 2, fontWeight: '500', textTransform: 'uppercase' },
  infoValue: { fontSize: 15, color: '#1F2937', fontWeight: '500' },

  editableField: { marginBottom: 16 },
  editableLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 6, fontWeight: '500', textTransform: 'uppercase' },
  editableInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: '#1F2937' },
  errorText: { color: '#EF4444', fontSize: 11, marginTop: 4, marginLeft: 2 },
  
  selectorButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  selectorText: { fontSize: 15, color: '#1F2937' },
  placeholderText: { color: '#9CA3AF' },

  editButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  editButtonText: { fontSize: 14, fontWeight: '600', color: '#64c27b', marginLeft: 4 },
  delButtonText: { fontSize: 14, fontWeight: '600', color: '#EF4444', marginLeft: 4 },

  chip: { backgroundColor: '#64c27b', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16 },
  chipText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  addTaskBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#64c27b', padding: 12, borderRadius: 8, marginBottom: 16, gap: 8 },
  taskCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: '#F3F4F6', borderRadius: 12, marginBottom: 12, backgroundColor: '#fff' },
  taskTitle: { fontWeight: '600', fontSize: 15, color: '#1F2937', marginBottom: 4 },
  taskSub: { color: '#9CA3AF', fontSize: 13 },
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  readOnlyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
});