import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  TouchableOpacity,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
  TextInput,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Location from 'expo-location';
import SyncService from '../sync/sync.service'; 
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import SelectionModal from './SelectionModal'; 
import validators from '../utils/validators';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.9;

// Opciones estáticas para el tipo de compañía
const COMPANY_TYPE_OPTIONS = [
  { id: 'person', name: 'Persona Individual' },
  { id: 'company', name: 'Compañía / Empresa' },
];

// --- COMPONENTES AUXILIARES ---

const InputField = ({ label, value, onChangeText, placeholder, keyboardType = 'default' }) => (
  <View style={styles.editableField}>
    <Text style={styles.editableLabel}>{label}</Text>
    <TextInput
      style={styles.editableInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType={keyboardType}
    />
  </View>
);

const BooleanSwitchField = ({ label, value, onToggle }) => (
    <View style={styles.booleanField}>
        <Text style={styles.editableLabel}>{label}</Text>
        <Switch
            trackColor={{ false: "#E5E7EB", true: "#A7F3D0" }}
            thumbColor={value ? "#64c27b" : "#F3F4F6"}
            ios_backgroundColor="#E5E7EB"
            onValueChange={onToggle}
            value={!!value}
            style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
        />
    </View>
);

const SelectorField = ({ label, value, placeholder, onPress }) => (
  <View style={styles.editableField}>
    <Text style={styles.editableLabel}>{label}</Text>
    <TouchableOpacity style={styles.selectorButton} onPress={onPress}>
      <Text style={[styles.selectorText, !value && styles.placeholderText]}>
        {value ? value.name : placeholder}
      </Text>
      <Feather name="chevron-down" size={20} color="#9CA3AF" />
    </TouchableOpacity>
  </View>
);

const InfoRow = ({ icon, label, value, onPress, isLink }) => {
  let displayValue = value;
  if (Array.isArray(value)) displayValue = value[1] || '-';
  if (typeof value === 'boolean') displayValue = value ? 'Sí' : '';
  
  // Traducción visual rápida para company_type si es necesario
  if (label === 'Tipo de Entidad') {
      displayValue = value === 'company' ? 'Compañía' : 'Persona Individual';
  }
  
  if (!displayValue || displayValue === 'false' || displayValue === '-') return null;
  
  return (
    <TouchableOpacity style={styles.infoRow} onPress={onPress} disabled={!onPress} activeOpacity={0.7}>
      <View style={styles.iconContainer}>
        <Feather name={icon} size={18} color={onPress ? "#64c27b" : "#9CA3AF"} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, isLink && styles.infoValueLink]}>{displayValue}</Text>
      </View>
      {onPress && <Feather name="chevron-right" size={16} color="#D1D5DB" />}
    </TouchableOpacity>
  );
};

const SectionTitle = ({ title, editable, isEditing, onToggleEdit, onCancel }) => (
  <View style={styles.sectionHeader}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {editable && (
      <View style={{flexDirection: 'row'}}>
          {isEditing && (
              <TouchableOpacity onPress={onCancel} style={[styles.editButton, {marginRight: 10}]}>
                  <Feather name="x" size={16} color="#EF4444" />
                  <Text style={[styles.editButtonText, {color: '#EF4444'}]}>Cancelar</Text>
              </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onToggleEdit} style={styles.editButton}>
          <Feather name={isEditing ? 'save' : 'edit-2'} size={16} color="#64c27b" />
          <Text style={styles.editButtonText}>{isEditing ? 'Guardar' : 'Editar'}</Text>
          </TouchableOpacity>
      </View>
    )}
  </View>
);

// --- COMPONENTE PRINCIPAL ---

export default function ClientDetailModal({ visible, client, onClose, onClientUpdated }) {
  const [displayClient, setDisplayClient] = useState(client);
  const [capturing, setCapturing] = useState(false);
  const [editing, setEditing] = useState(false);
  
  const [name, setName] = useState('');
  const [companyType, setCompanyType] = useState('person'); 
  const [contactPerson, setContactPerson] = useState('');
  const [vat, setVat] = useState('');
  const [classification, setClassification] = useState('');
  
  const [street, setStreet] = useState('');
  const [street2, setStreet2] = useState('');
  
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [mobile, setMobile] = useState('');
  const [errors, setErrors] = useState({ phone: '', mobile: '', email: '' });

  const [selectedMunicipality, setSelectedMunicipality] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [clientTypeIds, setClientTypeIds] = useState([]); 

  const [s_customerRoute, setSCustomerRoute] = useState('');
  const [s_socialReason, setSSocialReason] = useState('');
  const [s_agent, setSAgent] = useState('');
  const [s_shippingAddress, setSShippingAddress] = useState('');
  const [s_deliveryMethod, setSDeliveryMethod] = useState('');
  const [s_typeTransport, setSTypeTransport] = useState('');
  const [s_warehouseArea, setSWarehouseArea] = useState('');
  const [s_contract, setSContract] = useState(false);
  const [s_shippingAddressNumber, setSShippingAddressNumber] = useState('');

  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [dateLocalization, setDateLocalization] = useState('');

  const [masterMunicipalities, setMasterMunicipalities] = useState([]);
  const [masterStates, setMasterStates] = useState([]);
  const [masterCountries, setMasterCountries] = useState([]);
  const [masterClientTypes, setMasterClientTypes] = useState([]);

  const [modalType, setModalType] = useState(null); 
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const panY = useRef(new Animated.Value(0)).current;


  useEffect(() => {
    if (client) resetForm(client);
  }, [client]);

  useEffect(() => {
    if (visible) loadMasterData();
  }, [visible]);

  const loadMasterData = async () => {
    try {
      const muns = await SyncService.getMasterData('municipalities');
      const states = await SyncService.getMasterData('states');
      const countries = await SyncService.getMasterData('countries');
      const types = await SyncService.getMasterData('client_types');
      
      setMasterMunicipalities(muns);
      setMasterStates(states);
      setMasterCountries(countries);
      setMasterClientTypes(types);
    } catch (e) {
      console.error('Error cargando datos maestros:', e);
    }
  };

  const resetForm = (data) => {
    setDisplayClient(data);
    
    setName(data.name || '');
    setCompanyType(data.company_type || 'person'); // Inicializar company_type
    setContactPerson(data.contact_person || '');
    setVat(data.vat || '');
    setClassification(data.desc_primary_classification || '');
    setStreet(data.street || '');
    setStreet2(data.street2 || '');
    setEmail(data.email || '');
    setPhone(data.phone || '');
    setMobile(data.mobile || '');
    
    // Relacionales
    setSelectedMunicipality(Array.isArray(data.municipality) ? { id: data.municipality[0], name: data.municipality[1] } : null);
    setSelectedState(Array.isArray(data.state_id) ? { id: data.state_id[0], name: data.state_id[1] } : null);
    setSelectedCountry(Array.isArray(data.country_id) ? { id: data.country_id[0], name: data.country_id[1] } : null);
    setClientTypeIds(Array.isArray(data.client_type) ? data.client_type : []);
    
    // Otros
    setSCustomerRoute(Array.isArray(data.customer_route) ? data.customer_route[1] : data.customer_route || '');
    setSSocialReason(data.social_reason || '');
    setSAgent(Array.isArray(data.agent) ? data.agent[1] : data.agent || '');
    setSShippingAddress(data.shipping_address || '');
    setSDeliveryMethod(Array.isArray(data.delivery_method) ? data.delivery_method[1] : data.delivery_method || '');
    setSTypeTransport(Array.isArray(data.type_transport) ? data.type_transport[1] : data.type_transport || '');
    setSWarehouseArea(Array.isArray(data.warehouse_area) ? data.warehouse_area[1] : data.warehouse_area || '');
    setSContract(!!data.contract); 
    setSShippingAddressNumber(data.shipping_address_number || '');

    // Geolocalización
    setLatitude(data.partner_latitude || 0);
    setLongitude(data.partner_longitude || 0);
    setDateLocalization(data.date_localization || '');
    
    setEditing(false);
  };

  function handlePhoneChange(text) {
    const formatted = validators.formatPhoneForDisplay(text);
    setErrors(prev => ({ ...prev, phone: validators.isValidPhoneValue(formatted) ? '' : 'El teléfono debe tener 8 dígitos.' }));

    setPhone(formatted);
  }

  function handleMobileChange(text) {
    const formatted = validators.formatMobileForDisplay(text)
    setErrors(prev => ({ ...prev, mobile: validators.isValidMobileValue(formatted) ? '' : 'El móvil debe tener código de país y 8 dígitos (ej. +53 1234 5678).' }));
    
    setMobile(formatted);
  }

  function handleEmailChange(text) {
    setErrors(prev => ({ ...prev, email: validators.isValidEmailValue(text) ? '' : 'Email inválido (se requiere @).' }));
    
    
    setEmail(text);
  }

  const handleCancelEdit = () => {
    resetForm(displayClient);
    setEditing(false);
  };

  const handleSave = async () => {
    try {

      if (errors.phone || errors.mobile || errors.email) {
        Alert.alert('Errores en el formulario', [errors.phone, errors.mobile, errors.email].filter(Boolean).join('\n'));
        return;
      }

      const localUpdates = {
        name,
        company_type: companyType,
        contact_person: contactPerson,
        vat,
        desc_primary_classification: classification,
        street,
        street2,
        email: (email || '').trim(),
        phone: validators.normalizePhoneForPayload(phone),
        mobile: validators.normalizeMobileForPayload(mobile),
        municipality: selectedMunicipality ? [selectedMunicipality.id, selectedMunicipality.name] : false,
        state_id: selectedState ? [selectedState.id, selectedState.name] : false,
        country_id: selectedCountry ? [selectedCountry.id, selectedCountry.name] : false,
        client_type: clientTypeIds, 
        
        customer_route: s_customerRoute,
        social_reason: s_socialReason,
        agent: s_agent,
        shipping_address: s_shippingAddress,
        delivery_method: s_deliveryMethod,
        type_transport: s_typeTransport,
        warehouse_area: s_warehouseArea,
        contract: s_contract, 
        shipping_address_number: s_shippingAddressNumber,

        // Geo
        partner_latitude: latitude,
        partner_longitude: longitude,
        date_localization: dateLocalization,
      };
      
      const pendingUpdates = {
        ...localUpdates,
        client_type: [[6, 0, clientTypeIds]]
      };

      const updatedClient = await SyncService.updateClientLocally(displayClient.id, localUpdates);
      setDisplayClient(updatedClient);
      await SyncService.addPendingChange('res.partner', displayClient.id, pendingUpdates);

      Alert.alert('Guardado', 'Datos actualizados correctamente.');
      onClientUpdated(updatedClient);
      setEditing(false);
    } catch (error) {
      console.error('Error guardando:', error);
      Alert.alert('Error', 'No se pudo guardar la edición.');
    }
  };

  const handleCaptureLocation = async () => {
    try {
      setCapturing(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso denegado', 'Se necesita permiso de ubicación.');
        return;
      }
      
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      
      const now = new Date();
      const dateString = now.toISOString().split('T')[0];

      setLatitude(location.coords.latitude);
      setLongitude(location.coords.longitude);
      setDateLocalization(dateString);

      const updates = {
        partner_latitude: location.coords.latitude,
        partner_longitude: location.coords.longitude,
        date_localization: dateString,
      };
      
      const updatedClient = await SyncService.updateClientLocally(displayClient.id, updates);
      
      setDisplayClient(updatedClient);
      await SyncService.addPendingChange('res.partner', displayClient.id, updates);
      
      Alert.alert('Ubicación capturada', 'Coordenadas y fecha actualizadas.');
    } catch (e) {
      console.error('Error GPS:', e);
      Alert.alert('Error', 'Falló la captura de ubicación.');
    } finally {
      setCapturing(false);
    }
  };

  // --- ANIMACIONES Y UI ---

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          panY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) {
          handleClose();
        } else {
          Animated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 8,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      panY.setValue(0);
      Animated.spring(slideAnim, {
        toValue: SCREEN_HEIGHT - MODAL_HEIGHT,
        useNativeDriver: true,
        damping: 20,
        mass: 1,
        stiffness: 100,
      }).start();
    } else {
      handleCloseAnimation();
    }
  }, [visible]);

  const handleClose = () => {
    setEditing(false);
    handleCloseAnimation(() => onClose());
  };

  const handleCloseAnimation = (callback) => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(callback);
  };

  const handleOpenMaps = (lat, lon) => {
    if (!lat || !lon) {
      Alert.alert('Aviso', 'No hay coordenadas registradas.');
      return;
    }
    const scheme = Platform.select({ ios: 'maps:0,0?q=', android: 'geo:0,0?q=' });
    const latLng = `${lat},${lon}`;
    const url = Platform.select({
      ios: `${scheme}${latLng}`,
      android: `${scheme}${latLng}(${data.name})`
    });
    Linking.openURL(url);
  };

  const getClientTypeNames = (ids) => {
    if (!ids || ids.length === 0) return [];
    return masterClientTypes.filter(t => ids.includes(t.id));
  };

  const toggleClientType = (id) => {
    setClientTypeIds(prev => {
      if (prev.includes(id)) return prev.filter(item => item !== id);
      return [...prev, id];
    });
  };

  const renderClientTypeChips = () => {
    const selectedTypes = getClientTypeNames(clientTypeIds);
    if (!editing && selectedTypes.length === 0) return <Text style={styles.placeholderText}>-</Text>;

    return (
      <View style={styles.chipContainer}>
        {selectedTypes.map(type => (
          <View key={type.id} style={styles.chip}>
            <Text style={styles.chipText}>{type.name}</Text>
            {editing && (
              <TouchableOpacity onPress={() => toggleClientType(type.id)} style={styles.chipRemove}>
                <Feather name="x" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ))}
        {editing && (
          <TouchableOpacity style={styles.addChipButton} onPress={() => setModalType('client_type')}>
            <Feather name="plus" size={16} color="#64c27b" />
            <Text style={styles.addChipText}>Añadir</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // --------------------------------------------------------------------------------------
  // LÓGICA DE FILTRADO Y SELECCIÓN
  // --------------------------------------------------------------------------------------

  const getModalData = () => {
    if (modalType === 'country') return masterCountries;
    if (modalType === 'state') {
      if (selectedCountry) {
        return masterStates.filter(state => 
          Array.isArray(state.country_id) && state.country_id[0] === selectedCountry.id
        );
      }
      return masterStates;
    }
    if (modalType === 'municipality') {
      if (selectedState) {
        return masterMunicipalities.filter(mun => 
          Array.isArray(mun.province_id) && mun.province_id[0] === selectedState.id
        );
      }
      return masterMunicipalities; 
    }
    if (modalType === 'client_type') return masterClientTypes;
    
    if (modalType === 'company_type_option') return COMPANY_TYPE_OPTIONS;

    return [];
  };

  const handleSelection = (item) => {
    if (modalType === 'country') {
      if (selectedCountry && selectedCountry.id !== item.id) {
          setSelectedState(null);
          setSelectedMunicipality(null);
      }
      setSelectedCountry(item);
    } 
    else if (modalType === 'state') {
      if (selectedState && selectedState.id !== item.id) {
          setSelectedMunicipality(null); 
      }
      setSelectedState(item);
      if (!selectedCountry && Array.isArray(item.country_id)) {
        setSelectedCountry({ id: item.country_id[0], name: item.country_id[1] });
      }
    } 
    else if (modalType === 'municipality') {
      setSelectedMunicipality(item);
    } 
    else if (modalType === 'client_type') {
      toggleClientType(item.id);
    }
    else if (modalType === 'company_type_option') {
        setCompanyType(item.id);
    }
  };

  if (!visible && !displayClient) return null;
  const data = displayClient || client;
  if (!data) return null;

  const hasCoordinates = latitude && longitude && latitude !== 0;

  const avatarIcon = companyType === 'company' ? 'briefcase' : 'user';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />

        <Animated.View
          style={[
            styles.modalContainer,
            { transform: [{ translateY: slideAnim }, { translateY: panY }] },
          ]}
        >
          <View style={styles.dragHeader} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          <KeyboardAwareScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            enableOnAndroid={true}
            extraScrollHeight={100}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerContent}>
              <View style={styles.avatar}>
                {/* ICONO DINÁMICO */}
                <Feather name={avatarIcon} size={32} color="#64c27b" />
              </View>
              <Text style={styles.name}>{editing ? 'Editando Cliente' : (data.name || 'Sin nombre')}</Text>
              {!editing && (
                 <Text style={{fontSize: 12, color: '#9CA3AF', marginTop: 4, textTransform: 'uppercase'}}>
                    {data.company_type === 'company' ? 'Compañía' : 'Persona Individual'}
                 </Text>
              )}
            </View>

            <View style={styles.divider} />

            <SectionTitle 
              title="Información Comercial" 
              editable 
              isEditing={editing}
              onToggleEdit={() => editing ? handleSave() : setEditing(true)}
              onCancel={handleCancelEdit}
            />
            
            {editing ? (
              <>
                <InputField label="Nombre / Razón Social" value={name} onChangeText={setName} placeholder="Nombre del cliente" />
                
                <SelectorField 
                    label="Tipo de Entidad" 
                    value={companyType === 'company' ? {name: 'Compañía / Empresa'} : {name: 'Persona Individual'}} 
                    onPress={() => setModalType('company_type_option')}
                />

                <InputField label="Persona de Contacto" value={contactPerson} onChangeText={setContactPerson} placeholder="Nombre del contacto" />
                <InputField label="NIF / CIF" value={vat} onChangeText={setVat} placeholder="B-12345678" />
                <InputField label="Clasificación Primaria" value={classification} onChangeText={setClassification} placeholder="Ej. Tienda, Distribuidor..." />
                
                <View style={styles.editableField}>
                    <Text style={styles.editableLabel}>Tipo de Cliente</Text>
                    {renderClientTypeChips()}
                </View>
              </>
            ) : (
              <>
                <InfoRow icon="briefcase" label="Tipo de Entidad" value={data.company_type} />
                <InfoRow icon="user" label="Persona de Contacto" value={data.contact_person} />
                <InfoRow icon="briefcase" label="Tipo de Cliente" value={data.client_type && data.client_type.length ? '' : null} /> 
                {(!editing && data.client_type && data.client_type.length > 0) && (
                   <View style={{marginLeft: 56, marginBottom: 12}}>{renderClientTypeChips()}</View>
                )}
                <InfoRow icon="hash" label="NIF/CIF" value={data.vat} />
                <InfoRow icon="tag" label="Clasificación Primaria" value={data.desc_primary_classification} />
              </>
            )}

            <View style={styles.divider} />

            {/* SECCIÓN 2: DIRECCIÓN */}
            <SectionTitle title="Dirección" />
            
            {editing ? (
              <>
                <InputField label="Dirección 1" value={street} onChangeText={setStreet} placeholder="Calle, número..." />
                <InputField label="Dirección 2" value={street2} onChangeText={setStreet2} placeholder="Piso, puerta..." />
                
                <SelectorField label="País" value={selectedCountry} placeholder="Seleccionar País" onPress={() => setModalType('country')} />
                <SelectorField label="Provincia" value={selectedState} placeholder="Seleccionar Provincia" onPress={() => setModalType('state')} />
                <SelectorField label="Municipio" value={selectedMunicipality} placeholder="Seleccionar Municipio" onPress={() => setModalType('municipality')} />
              </>
            ) : (
              <>
                <InfoRow icon="map-pin" label="Dirección 1" value={data.street} />
                <InfoRow icon="map-pin" label="Dirección 2" value={data.street2} />
                <InfoRow icon="globe" label="País" value={data.country_id} />
                <InfoRow icon="map" label="Provincia" value={data.state_id} />
                <InfoRow icon="home" label="Municipio" value={data.municipality} />
              </>
            )}

            <View style={styles.divider} />

            {/* SECCIÓN 3: CONTACTO */}
            <SectionTitle title="Contacto" />
            
            {editing ? (
              <>
                 <InputField label="Email" value={email} onChangeText={handleEmailChange} placeholder="correo@ejemplo.com" keyboardType="email-address" autoCapitalize="none"/>
                 <InputField label="Teléfono Fijo" value={phone} onChangeText={handlePhoneChange} placeholder="1234 5678" keyboardType="phone-pad" />
                 <InputField label="Teléfono Móvil" value={mobile} onChangeText={handleMobileChange} placeholder="+53 1234 5678" keyboardType="phone-pad" />
              </>
            ) : (
              <>
                <InfoRow icon="mail" label="Email" value={data.email} onPress={() => data.email && Linking.openURL(`mailto:${data.email}`)} isLink />
                <InfoRow icon="phone" label="Teléfono" value={data.phone} onPress={() => data.phone && Linking.openURL(`tel:${data.phone}`)} isLink />
                <InfoRow icon="smartphone" label="Móvil" value={data.mobile} onPress={() => data.mobile && Linking.openURL(`tel:${data.mobile}`)} isLink />
              </>
            )}

            <View style={styles.divider} />
            
            {/* SECCIÓN 4: GEOLOCALIZACIÓN */}
            <SectionTitle title="Geolocalización" />
            
            <InfoRow 
                icon="calendar" 
                label="Fecha Localización" 
                value={dateLocalization}
            />

            <InfoRow 
                icon="map" 
                label="Coordenadas" 
                value={latitude && longitude ? `${Number(latitude).toFixed(7)}, ${Number(longitude).toFixed(7)}` : null}
                onPress={() => handleOpenMaps(latitude, longitude)}
                isLink
            />
            
            <TouchableOpacity style={styles.geoButton} onPress={handleCaptureLocation} disabled={capturing}>
                {capturing ? <ActivityIndicator color="#fff" /> : (
                    <>
                        <Feather name={editing && hasCoordinates ? "refresh-cw" : "target"} size={18} color="#fff" />
                        <Text style={styles.geoButtonText}>
                          {editing && hasCoordinates ? "Actualizar Ubicación GPS" : "Capturar Ubicación GPS"}
                        </Text>
                    </>
                )}
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* SECCIÓN 5: OTRA INFORMACIÓN */}
            <SectionTitle 
              title="Otra Información" 
              editable 
              isEditing={editing}
              onToggleEdit={() => editing ? handleSave() : setEditing(true)}
              onCancel={handleCancelEdit}
            />

            {editing ? (
                <>
                    <InputField label="Razón Social Cliente" value={s_socialReason} onChangeText={setSSocialReason} placeholder="Razón Social" />
                    <InputField label="Ruta Cliente (VWORLD)" value={s_customerRoute} onChangeText={setSCustomerRoute} placeholder="Ruta Cliente" />
                    <InputField label="Cod. Agente" value={s_agent} onChangeText={setSAgent} placeholder="Código de Agente" />
                    <InputField label="Nombre Dir. de Envío" value={s_shippingAddress} onChangeText={setSShippingAddress} placeholder="Nombre de dirección de envío" />
                    <InputField label="Num. Dir. de Envío" value={s_shippingAddressNumber} onChangeText={setSShippingAddressNumber} keyboardType="numeric" placeholder="Número de dirección de envío" />
                    <InputField label="Forma de Entrega (Incoterm)" value={s_deliveryMethod} onChangeText={setSDeliveryMethod} placeholder="Forma de entrega" />
                    <InputField label="Transporte Propio o VIMA" value={s_typeTransport} onChangeText={setSTypeTransport} placeholder="Tipo de transporte" />
                    <InputField label="Zona Almacén Cliente" value={s_warehouseArea} onChangeText={setSWarehouseArea} placeholder="Zona de almacén" />
                    
                    <BooleanSwitchField label="Cliente con Contrato" value={s_contract} onToggle={setSContract} />
                </>
            ) : (
                <>
                    <InfoRow icon="file-text" label="Razón Social Cliente" value={data.social_reason} />
                    <InfoRow icon="hash" label="Código Cliente" value={data.partner_code} />
                    <InfoRow icon="compass" label="Ruta Cliente (VWORLD)" value={data.customer_route} />
                    <InfoRow icon="user-check" label="Cod. Agente" value={data.agent} />
                    <InfoRow icon="tag" label="Cod. Clasificación Primaria" value={data.primary_classification} />
                    <InfoRow icon="send" label="Nombre Dir. de Envío" value={data.shipping_address} />
                    <InfoRow icon="hash" label="Num. Dir. de Envío" value={data.shipping_address_number} />
                    <InfoRow icon="truck" label="Forma de Entrega (Incoterm)" value={data.delivery_method} />
                    <InfoRow icon="truck" label="Tipo de Transporte" value={data.type_transport} />
                    <InfoRow icon="codesandbox" label="Zona Almacén Cliente" value={data.warehouse_area} />
                    <InfoRow icon="users" label="Cod. Cliente Padre" value={data.code_partner_parent} />
                    <InfoRow icon="users" label="Desc. Cliente Padre" value={data.desc_partner_parent} />
                    <InfoRow icon="file-text" label="Cliente con Contrato" value={data.contract} />
                </>
            )}

             <View style={{height: 100}}/> 
          </KeyboardAwareScrollView>
        </Animated.View>

        {/* Modal de Selección con datos filtrados */}
        {modalType && (
            <SelectionModal
                visible={!!modalType}
                title={
                    modalType === 'municipality' ? (selectedState ? `Municipios de ${selectedState.name}` : 'Seleccionar Municipio') :
                    modalType === 'state' ? (selectedCountry ? `Provincias de ${selectedCountry.name}` : 'Seleccionar Provincia') :
                    modalType === 'country' ? 'Seleccionar País' : 
                    modalType === 'company_type_option' ? 'Seleccionar Tipo de Entidad' : 'Seleccionar Tipos de Cliente'
                }
                data={getModalData()} 
                onSelect={handleSelection} 
                onClose={() => setModalType(null)}
                selectedIds={modalType === 'client_type' ? clientTypeIds : []}
                multiple={modalType === 'client_type'} 
            />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.4)' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  modalContainer: { height: MODAL_HEIGHT, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  
  dragHeader: { width: '100%', height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  handle: { width: 48, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3 },
  headerContent: { alignItems: 'center', marginBottom: 20 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  name: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 24 },

  // Scroll
  scrollContainer: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { padding: 24, paddingTop: 10 },
  
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  editButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 },
  editButtonText: { fontSize: 14, fontWeight: '600', color: '#64c27b', marginLeft: 4 },
  
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  iconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 2, fontWeight: '500', textTransform: 'uppercase' },
  infoValue: { fontSize: 15, color: '#1F2937', fontWeight: '500' },
  infoValueLink: { color: '#64c27b', fontWeight: '600' },

  editableField: { marginBottom: 16 },
  editableLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 6, fontWeight: '500', textTransform: 'uppercase' },
  editableInput: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: '#1F2937' },
  
  booleanField: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8 },

  selectorButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  selectorText: { fontSize: 15, color: '#1F2937' },
  placeholderText: { color: '#9CA3AF' },

  // Chips
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#64c27b', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16 },
  chipText: { color: '#fff', fontSize: 13, fontWeight: '500', marginRight: 4 },
  chipRemove: { marginLeft: 4, padding: 2 },
  addChipButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: '#64c27b', borderStyle: 'dashed' },
  addChipText: { color: '#64c27b', fontSize: 13, fontWeight: '500', marginLeft: 4 },

  // Geo
  geoButton: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: '#64c27b', paddingVertical: 12, borderRadius: 8, marginTop: 16 },
  geoButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
});