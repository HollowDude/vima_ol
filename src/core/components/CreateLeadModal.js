import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, 
  Alert, Platform, Dimensions, Animated, PanResponder, Keyboard
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import SimpleDatePicker from './SimpleDatePicker';
import SyncService from '../sync/sync.service';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import SelectionModal from './SelectionModal'; 
import validators from '../utils/validators';
import { registerTranslation } from 'react-native-paper-dates';

registerTranslation('es', {
  save: 'Guardar',
  selectSingle: 'Seleccionar fecha',
  selectMultiple: 'Seleccionar fechas',
  selectRange: 'Seleccionar rango',
  notAccordingToDateFormat: (inputFormat) => `El formato debe ser ${inputFormat}`,
  mustBeHigherThan: (date) => `Debe ser posterior a ${date}`,
  mustBeLowerThan: (date) => `Debe ser anterior a ${date}`,
  mustBeBetween: (startDate, endDate) => `Debe estar entre ${startDate} - ${endDate}`,
  dateIsDisabled: 'Día no disponible',
  previous: 'Anterior',
  next: 'Siguiente',
  typeInDate: 'Escribir fecha',
  pickDateFromCalendar: 'Elegir del calendario',
  close: 'Cerrar',
});

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.9;

const InputRow = ({ label, val, setVal, placeholder, keyboard = 'default', multiline = false, error, required = false }) => (
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
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboard}
        multiline={multiline}
        blurOnSubmit={false}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
);

const SelectorRow = ({ label, valueText, placeholder, onPress, required = false }) => (
    <View style={styles.editableField}>
      <Text style={styles.editableLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TouchableOpacity 
          style={styles.selectorButton} 
          onPress={() => { Keyboard.dismiss(); onPress(); }}
          activeOpacity={0.7}
      >
        <Text style={[styles.selectorText, !valueText && styles.placeholderText]}>
          {valueText || placeholder}
        </Text>
        <Feather name="chevron-down" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
);

export default function CreateLeadModal({ visible, userData, onClose, onCreated }) {
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const panY = useRef(new Animated.Value(0)).current;

  const [name, setName] = useState('');
  const [expectedRevenue, setExpectedRevenue] = useState('');
  const [probability, setProbability] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [description, setDescription] = useState('');

  const [partnerName, setPartnerName] = useState('');
  const [contactName, setContactName] = useState(''); 
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  
  const [clientTypeIds, setClientTypeIds] = useState([]);
  
  const [street, setStreet] = useState('');
  const [street2, setStreet2] = useState('');
  const [selectedState, setSelectedState] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);

  const [errors, setErrors] = useState({ 
    name: '', 
    email: '', 
    phone: '', 
    probability: '', 
    expectedRevenue: '',
    selectedDate: ''
  });

  const [modalType, setModalType] = useState(null);
  const [masterCountries, setMasterCountries] = useState([]);
  const [masterStates, setMasterStates] = useState([]);
  const [masterClientTypes, setMasterClientTypes] = useState([]);

  useEffect(() => {
    if (visible) {
      resetForm();
      loadMasterData();
      panY.setValue(0);
      Animated.spring(slideAnim, { toValue: SCREEN_HEIGHT - MODAL_HEIGHT, useNativeDriver: true }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible]);

  const loadMasterData = async () => {
    try {
      const [countries, states, clientTypes] = await Promise.all([
        SyncService.getMasterData('countries'),
        SyncService.getMasterData('states'),
        SyncService.getMasterData('client_types'),
      ]);
      setMasterCountries(countries || []);
      setMasterStates(states || []);
      setMasterClientTypes(clientTypes || []);
    } catch (e) { console.error('Error cargando maestros:', e); }
  };

  const resetForm = () => {
    setName('');
    setExpectedRevenue('');
    setProbability('');
    setDatePickerVisible(false);
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    setSelectedDate(tomorrow);
    
    setDescription('');
    setPartnerName('');
    setContactName('');
    setEmail('');
    setPhone('');
    setClientTypeIds([]);
    setStreet('');
    setStreet2('');
    setSelectedState(null);
    setSelectedCountry(null);
    setErrors({ name: '', email: '', phone: '', probability: '', expectedRevenue: '', selectedDate: '' });
  };

  const closeModal = () => {
    Keyboard.dismiss();
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start(onClose);
  };

  const handleEmailChange = (text) => {
    setEmail(text);
    if (text && !validators.isValidEmailValue(text)) {
      setErrors(prev => ({ ...prev, email: 'Email inválido (ej. usuario@dominio.com)' }));
    } else {
      setErrors(prev => ({ ...prev, email: '' }));
    }
  };

  const handlePhoneChange = (text) => {
    const formatted = validators.formatMobileForDisplay(text);
    setPhone(formatted);
    if (formatted && !validators.isValidMobileValue(formatted) && !validators.isValidPhoneValue(formatted)) {
      setErrors(prev => ({ ...prev, phone: 'Formato inválido (+CC 1234 5678 o 1234 5678)' }));
    } else {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  const handleRevenueChange = (text) => {
    const normalized = (text || '').toString().replace(',', '.').replace(/[^0-9.]/g, '');
    setExpectedRevenue(normalized);
    if (normalized && !validators.isPositiveNumber(normalized)) {
      setErrors(prev => ({ ...prev, expectedRevenue: 'La ganancia debe ser un número positivo.' }));
    } else {
      setErrors(prev => ({ ...prev, expectedRevenue: '' }));
    }
  };

  const handleProbabilityChange = (text) => {
    const normalized = (text || '').toString().replace(',', '.').replace(/[^0-9.]/g, '');
    setProbability(normalized);
    const val = parseFloat(normalized);
    if (normalized !== '' && (isNaN(val) || !validators.isValidPercentage(val))) {
      setErrors(prev => ({ ...prev, probability: 'El porcentaje debe estar entre 0 y 100.' }));
    } else {
      setErrors(prev => ({ ...prev, probability: '' }));
    }
  };

  const handleDateChange = (params) => {
    setDatePickerVisible(false);
    
    if (params.date) {
      const selectedDate = params.date;
      setSelectedDate(selectedDate);
      
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      
      if (selectedDate < startOfToday) {
        setErrors(prev => ({ ...prev, selectedDate: 'La fecha debe ser futura (mínimo mañana).' }));
      } else {
        setErrors(prev => ({ ...prev, selectedDate: '' }));
      }
    }
  };

  const handleSave = async () => {
    let hasErrors = false;
    const newErrors = { ...errors };

    if (!name.trim()) {
      newErrors.name = 'El nombre de la oportunidad es obligatorio.';
      hasErrors = true;
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    if (selectedDate < startOfToday) {
      newErrors.selectedDate = 'La fecha debe ser futura (mínimo mañana).';
      hasErrors = true;
    }

    if (errors.email || errors.phone || errors.probability || errors.expectedRevenue) {
      hasErrors = true;
    }

    if (hasErrors) {
      setErrors(newErrors);
      Alert.alert('Datos inválidos', 'Por favor corrige los errores marcados en rojo.');
      return;
    }

    const normalizedPhone = validators.normalizeMobileForPayload(phone);
    const cleanedDescription = validators.cleanHtmlAndNormalize(description);

    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${selectedDate.getFullYear()}-${pad(selectedDate.getMonth() + 1)}-${pad(selectedDate.getDate())}`;

    const firstStage = await SyncService.getCrmStages().then(s => s[0]?.id || 1);

    const newLeadData = {
      name: name.trim(),
      user_id: userData.uid,
      expected_revenue: parseFloat(expectedRevenue) || 0,
      probability: parseFloat(probability) || 0,
      date_deadline: dateStr,
      description: cleanedDescription,
      stage_id: firstStage,
      partner_name: partnerName.trim(),
      contact_name: contactName.trim(),
      email_from: email.trim(),
      phone: normalizedPhone,
      mobile: normalizedPhone,
      street: street.trim(),
      street2: street2.trim(),
      country_id: selectedCountry ? selectedCountry.id : false,
      state_id: selectedState ? selectedState.id : false,
      client_type: [[6, 0, clientTypeIds]],
      active: true,
    };

    try {
      await SyncService.createLeadLocally(newLeadData);
      Alert.alert("✓ Oportunidad creada", "Se ha guardado localmente.");
      closeModal();
      onCreated();
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'No se pudo crear la oportunidad.');
    }
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
    if (modalType === 'state') return selectedCountry ? masterStates.filter(s => s.country_id[0] === selectedCountry.id) : masterStates;
    if (modalType === 'client_type') return masterClientTypes;
    return [];
  };

  const handleSelection = (item) => {
    if (modalType === 'country') {
      if (selectedCountry?.id !== item.id) setSelectedState(null);
      setSelectedCountry(item);
    } else if (modalType === 'state') {
      setSelectedState(item);
      if (!selectedCountry && item.country_id) setSelectedCountry({ id: item.country_id[0], name: item.country_id[1] });
    }  else if (modalType === 'client_type') {
      setClientTypeIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]);
    }
  };

  const getClientTypeNames = () => {
    const names = masterClientTypes.filter(t => clientTypeIds.includes(t.id)).map(t => t.name);
    if (names.length === 0) return '';
    return names.join(', ');
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  minDate.setHours(0, 0, 0, 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />

        <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }, { translateY: panY }] }]}>
            <View style={{flex: 1}}>
                <View style={styles.dragHeader} {...panResponder.panHandlers}>
                    <View style={styles.handle} />
                </View>
                
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Nueva Oportunidad</Text>
                </View>

                <KeyboardAwareScrollView 
                    style={styles.scrollContainer} 
                    contentContainerStyle={styles.scrollContent} 
                    enableOnAndroid={true}
                    extraScrollHeight={100}
                    keyboardShouldPersistTaps="handled" 
                >
                    
                    <InputRow 
                      label="Nombre de Oportunidad" 
                      val={name} 
                      setVal={setName} 
                      placeholder="Ej: Venta de Maquinaria" 
                      required
                      error={errors.name}
                    />

                    <View style={{flexDirection:'row', gap: 12}}>
                      <View style={{flex:1}}>
                        <InputRow 
                          label="Ingresos Esperados" 
                          val={expectedRevenue} 
                          setVal={handleRevenueChange} 
                          placeholder="0.00" 
                          keyboard="numeric" 
                          error={errors.expectedRevenue}
                        />
                      </View>
                      <View style={{width: 100}}>
                        <InputRow 
                          label="Probabilidad" 
                          val={probability} 
                          setVal={handleProbabilityChange} 
                          placeholder="0%" 
                          keyboard="numeric" 
                          error={errors.probability}
                        />
                      </View>
                    </View>

                    <View style={styles.editableField}>
                      <Text style={styles.editableLabel}>
                        Cierre Previsto <Text style={styles.required}>*</Text>
                      </Text>
                      <TouchableOpacity 
                        style={[
                          styles.selectorButton,
                          errors.selectedDate && { borderColor: '#EF4444', borderWidth: 1 }
                        ]} 
                        onPress={() => {
                          Keyboard.dismiss();
                          setDatePickerVisible(true);
                        }}
                      >
                          <Text style={styles.selectorText}>
                            {selectedDate.toLocaleDateString('es-ES', { dateStyle: 'long' })}
                          </Text>
                          <Feather name="calendar" size={20} color="#64c27b" />
                      </TouchableOpacity>
                      {errors.selectedDate ? <Text style={styles.errorText}>{errors.selectedDate}</Text> : null}
                      <SimpleDatePicker
                        visible={datePickerVisible}
                        onClose={() => setDatePickerVisible(false)}
                        selectedDate={selectedDate}
                        onConfirm={(date) => {
                          setSelectedDate(date);
                          // ... validación ...
                        }}
                        minDate={minDate}
                      />
                    </View>

                    <View style={styles.divider} />
                    <Text style={styles.sectionTitle}>Contacto</Text>

                    <InputRow label="Nombre del Cliente (Empresa)" val={partnerName} setVal={setPartnerName} placeholder="Nombre de la compañía" />
                    <InputRow label="Nombre del Contacto" val={contactName} setVal={setContactName} placeholder="Persona de contacto" />
                    <SelectorRow label="Tipo de Cliente" valueText={getClientTypeNames()} placeholder="Seleccionar tipos..." onPress={() => setModalType('client_type')} />
                    
                    <InputRow 
                        label="Email" 
                        val={email} 
                        setVal={handleEmailChange} 
                        placeholder="cliente@email.com" 
                        keyboard="email-address" 
                        error={errors.email}
                    />
                    <InputRow 
                        label="Teléfono / Celular" 
                        val={phone} 
                        setVal={handlePhoneChange} 
                        placeholder="+53 1234 5678" 
                        keyboard="phone-pad" 
                        error={errors.phone}
                    />

                    <View style={styles.divider} />
                    <Text style={styles.sectionTitle}>Dirección</Text>

                    <InputRow label="Calle y Número" val={street} setVal={setStreet} placeholder="Av. Principal #123" />
                    <InputRow label="Apartamento / Calle 2" val={street2} setVal={setStreet2} placeholder="Apto #20, Edif#10" />
                    <SelectorRow label="País" valueText={selectedCountry?.name} placeholder="País" onPress={() => setModalType('country')} />
                    <SelectorRow label="Provincia / Estado" valueText={selectedState?.name} placeholder="Provincia" onPress={() => setModalType('state')} />

                    <View style={styles.divider} />
                    <InputRow label="Notas / Descripción" val={description} setVal={setDescription} placeholder="Detalles adicionales..." multiline />

                    <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                      <Text style={styles.saveButtonText}>Guardar Oportunidad</Text>
                    </TouchableOpacity>

                    <View style={{height: 40}} />

                </KeyboardAwareScrollView>
            </View>

          {modalType && (
            <SelectionModal
              visible={!!modalType}
              title={modalType === 'client_type' ? 'Tipos de Cliente' : 'Seleccionar ' + modalType}
              data={getModalData()}
              onSelect={handleSelection}
              onClose={() => setModalType(null)}
              selectedIds={modalType === 'client_type' ? clientTypeIds : []}
              multiple={modalType === 'client_type'}
            />
          )}
        </Animated.View>
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
  
  header: { alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderColor: '#F3F4F6' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  
  scrollContainer: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 60 },
  
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 12, marginTop: 8, textTransform: 'uppercase' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },
  
  editableField: { marginBottom: 16 },
  editableLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 6, fontWeight: '500', textTransform: 'uppercase' },
  editableInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: '#1F2937' },
  errorText: { color: '#EF4444', fontSize: 11, marginTop: 4, marginLeft: 2 },
  required: { color: '#EF4444' },
  
  selectorButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  selectorText: { fontSize: 15, color: '#1F2937' },
  placeholderText: { color: '#9CA3AF' },
  
  saveButton: { backgroundColor: '#64c27b', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});