import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, Animated, PanResponder, Dimensions,
  TouchableOpacity, ScrollView, Alert, Platform, TextInput, ActivityIndicator
} from 'react-native';
import { Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';

import SyncService from '../sync/sync.service';
import SurveyModal from './SurveyModal';
import SurveyResponsesModal from './SurveyResponsesModal';
import StateSelectorModal from './StateSelectorModal';
import CommentsSection from './CommentsSection';
import AttachmentsModal from './AttachmentsModal';
import SimpleDateTimePicker from './SimpleDateTimePicker';
import useNetwork from '../hooks/useNetwork';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MODAL_HEIGHT = SCREEN_HEIGHT * 0.85;

const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

const parseOdooDate = (dateStr) => {
  if (!dateStr) return null;
  
  // Si la cadena ya tiene el formato ISO (incluye T), la pasamos directo
  if (dateStr.includes('T')) return new Date(dateStr);

  // Odoo suele enviar "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DD"
  let formatted = dateStr;
  
  if (dateStr.includes(' ')) {
    // Es un DateTime: reemplazamos espacio por T y aseguramos el UTC
    formatted = dateStr.replace(' ', 'T');
    if (!formatted.endsWith('Z')) formatted += 'Z';
  }
  // Si no tiene espacio, es un Date "YYYY-MM-DD" y JS lo parsea bien así
  
  const date = new Date(formatted);
  
  // Verificación de seguridad por si el string sigue siendo raro
  return isNaN(date.getTime()) ? null : date;
};

const formatForOdoo = (dateObj) => {
  if (!dateObj) return null;
  return dateObj.toISOString().replace('T', ' ').split('.')[0];
};

export default function TaskDetailModal({ visible, task, allTasks, isHistorical = false, onClose, onTaskUpdated, onNavigateToLeads }) {
  const { isOnline } = useNetwork();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const panY = useRef(new Animated.Value(0)).current;
  const keyboardScrollRef = useRef(null);
  const descriptionYOffset = useRef(0);
  
  const [reprogramming, setReprogramming] = useState(false);
  const [newDate, setNewDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [reason, setReason] = useState('');
  const [managementTags, setManagementTags] = useState([]);
  const [isUserOwnTask, setIsUserOwnTask] = useState(false);
  
  const [taskSurveys, setTaskSurveys] = useState([]);
  const [loadingSurveys, setLoadingSurveys] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState(null);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [showSurveyResponses, setShowSurveyResponses] = useState(false);
  const [surveyToView, setSurveyToView] = useState(null);

  const [showStateSelector, setShowStateSelector] = useState(false);
  const [pendingStateChange, setPendingStateChange] = useState(null);

  const [showAttachmentsModal, setShowAttachmentsModal] = useState(false);
  const [associatedLead, setAssociatedLead] = useState(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  
  const [attachmentsCount, setAttachmentsCount] = useState(0);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) panY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100) closeModal();
        else Animated.spring(panY, { toValue: 0, useNativeDriver: true, bounciness: 8 }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (task) {
      checkIfUserOwnTask();
      loadAssociatedLead();
      loadAttachmentsCount();
    }
  }, [task]);

  useEffect(() => {
    if (visible && task) {
      setReprogramming(false);
      setReason('');
      setEditingDescription(false);
      setDescriptionDraft(stripHtml(task.description || ''));
      loadTags();
      loadSurveys();
      
      if (task.date_deadline) {
        setNewDate(parseOdooDate(task.date_deadline));
      } else {
        setNewDate(new Date());
      }

      panY.setValue(0);
      Animated.spring(slideAnim, {
        toValue: SCREEN_HEIGHT - MODAL_HEIGHT,
        useNativeDriver: true,
        damping: 20, mass: 1, stiffness: 100,
      }).start();
    } else {
      Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }).start();
    }
  }, [visible, task]);

  const loadAssociatedLead = async () => {
    if (!task?.id) return;
    try {
      const lead = await SyncService.getLeadByTaskId(task.id);
      setAssociatedLead(lead);
    } catch { setAssociatedLead(null); }
  };

  const loadAttachmentsCount = async () => {
    if (!task?.id) return;
    try {
      setLoadingAttachments(true);
      const attachments = await SyncService.getTaskAttachments(task.id);
      setAttachmentsCount(attachments.length);
    } catch { setAttachmentsCount(0); }
    finally { setLoadingAttachments(false); }
  };

  const getReprogrammingRange = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let minDate = task.start_date
      ? parseOdooDate(task.start_date)
      : new Date(currentYear, currentMonth, 1);
    minDate.setHours(0, 0, 0, 0);
    
    const nowDate = new Date();
    nowDate.setHours(0, 0, 0, 0);
    if (nowDate > minDate) {
      minDate = nowDate;
    }

    let maxDate = task.finish_date
      ? parseOdooDate(task.finish_date)
      : new Date(currentYear, currentMonth + 1, 0);
    maxDate.setHours(23, 59, 59, 999);

    return { minDate, maxDate };
  };

  const loadSurveys = async () => {
    if (!task?.id) return;
    try {
      setLoadingSurveys(true);
      const surveys = await SyncService.getSurveysForTask(task.id);
      
      const enrichedSurveys = await Promise.all(surveys.map(async (s) => {
        const localProgress = await SyncService.getSurveyProgress(task.id, s.id, s.relation_id);
        let isCompleted = s.user_input?.state === 'done';
        if (localProgress?.state === 'done') isCompleted = true;

        return { ...s, isCompleted, localProgress };
      }));
      
      setTaskSurveys(enrichedSurveys);
    } catch (error) {
      console.error("Error cargando encuestas:", error);
    } finally { 
      setLoadingSurveys(false); 
    }
  };


const handleOpenSurveyInWeb = async (surveyUrl) => {
  if (!surveyUrl) {
    Alert.alert('Error', 'No se pudo obtener la URL de la encuesta');
    return;
  }

  console.log('🔗 Abriendo URL:', surveyUrl);

  try {
    const canOpen = await Linking.canOpenURL(surveyUrl);
    if (canOpen) {
      await Linking.openURL(surveyUrl);
    } else {
      Alert.alert('Error', 'No se puede abrir la URL en el navegador');
    }
  } catch (error) {
    console.error('❌❌❌ Error abriendo URL:', error);
    Alert.alert('Error', 'No se pudo abrir la encuesta: ' + error.message);
  }
};


  const loadTags = async () => {
    try {
      const tags = await SyncService.getManagementTags();
      setManagementTags(tags);
    } catch (e) { console.error('Error cargando tags:', e); }
  };

  const checkIfUserOwnTask = async () => {
    try {
      const currentUser = await SyncService.getCurrentUser();
      const currentUserPartnerId = currentUser?.[0]?.partner_id?.[0] ?? null;
      const taskPartnerId = Array.isArray(task.partner_id) ? task.partner_id[0] : task.partner_id;
      setIsUserOwnTask(taskPartnerId === currentUserPartnerId);
    } catch { setIsUserOwnTask(false); }
  };

  const closeModal = () => {
    Animated.timing(slideAnim, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true })
      .start(() => onClose());
  };

  if (!task) return null;

  const totalSurveys = taskSurveys.length;
  const completedSurveys = taskSurveys.filter(s => s.isCompleted).length;
  const hasSurveys = totalSurveys > 0;
  const allSurveysDone = hasSurveys && totalSurveys === completedSurveys;

  const cleanDescription = stripHtml(task.description);
  const taskHasDescription = cleanDescription.trim().length > 0;

  const handleStartEditDescription = () => {
    if (isHistorical) return;
    setDescriptionDraft(cleanDescription);
    setEditingDescription(true);
    setTimeout(() => {
      keyboardScrollRef.current?.scrollTo({
        y: Math.max(0, descriptionYOffset.current - 100), animated: true,
      });
    }, 150);
  };

  const handleCancelEditDescription = () => {
    setDescriptionDraft(cleanDescription);
    setEditingDescription(false);
};

  const handleSaveDescription = async () => {
    try {
      setSavingDescription(true);
      await SyncService.updateTaskLocally(task.id, { description: descriptionDraft.trim() });
      task.description = descriptionDraft.trim();
      if (isOnline) {
        try { await SyncService.syncPendingChanges(); } catch (_) {}
      }
      setEditingDescription(false);
      if (onTaskUpdated) onTaskUpdated({ keepModalOpen: true });
    } catch (e) {
      Alert.alert("Error", "No se pudo guardar la descripción");
    } finally { setSavingDescription(false); }
  };

  const handleOpenSurvey = (survey) => {
    if (isHistorical) return;
    
    if (survey.isCompleted) {
      setSurveyToView({ surveyId: survey.id, relationId: survey.relation_id, title: survey.title });
      setShowSurveyResponses(true);
    } else {
      setSelectedSurvey({ surveyId: survey.id, relationId: survey.relation_id });
      setShowSurveyModal(true);
    }
  };

  const handleCompleteTask = async () => {
    try {
      await SyncService.updateTaskLocally(task.id, { state: '1_done' });
      if (isOnline) {
        setSyncing(true);
        try {
          await SyncService.syncPendingChanges();
          Alert.alert('✓ Tarea completada', 'La tarea se ha marcado como finalizada y sincronizado con el servidor.');
        } catch {
          Alert.alert('✓ Tarea completada (offline)', 'La tarea se ha marcado como finalizada.\n\nSe sincronizará cuando recuperes la conexión.');
        } finally { setSyncing(false); }
      } else {
        Alert.alert('✓ Tarea completada (offline)', 'La tarea se ha marcado como finalizada.\n\nSe sincronizará automáticamente cuando recuperes la conexión.');
      }
      if (onTaskUpdated) onTaskUpdated();
      closeModal();
    } catch { Alert.alert('Error', 'No se pudo completar la tarea.'); }
  };

  const promptAddDescriptionThenComplete = () => {
    Alert.alert(
      "Descripción requerida",
      "Odoo no permite completar tareas sin descripción.\n\n¿Quieres añadir una ahora para poder completarla?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Añadir descripción", style: "default", onPress: handleStartEditDescription },
      ]
    );
  };

  const handleTaskAction = () => {
    if (isHistorical) return;
    if (task.state === '1_done') { Alert.alert('Información', 'Esta tarea ya ha sido completada.'); return; }
    if (hasSurveys && !allSurveysDone) {
      Alert.alert("Encuestas pendientes", `Debes completar las ${totalSurveys - completedSurveys} encuestas restantes antes de finalizar la tarea.`, [{ text: "Entendido", style: "cancel" }]);
      return;
    }
    if (!taskHasDescription) { promptAddDescriptionThenComplete(); return; }
    if (isUserOwnTask) { showStateChangeOptions(); return; }
    Alert.alert(
      'Completar Tarea',
      hasSurveys ? 'Todas las encuestas están completas. ¿Marcar esta tarea como finalizada?' : '¿Deseas marcar esta tarea como finalizada?',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Completar', style: 'default', onPress: handleCompleteTask }]
    );
  };

  const getStatusInfo = () => {
    const s = task.state;
    if (s === '01_in_progress')      return { label: 'En Proceso',      color: '#64c27b', icon: 'play' };
    if (s === '02_changes_requested') return { label: 'Cambios Solic.',  color: '#F59E0B', icon: 'alert-circle' };
    if (s === '03_approved')          return { label: 'Aprobado',        color: '#10B981', icon: 'check-circle' };
    if (s === '1_done')               return { label: 'Hecho',           color: '#22c55e', icon: 'check' };
    if (s === '1_canceled')           return { label: 'Cancelado',       color: '#EF4444', icon: 'x-circle' };
    if (s === '04_waiting_normal')    return { label: 'En Espera',       color: '#9CA3AF', icon: 'clock' };
    return { label: 'Desconocido', color: '#9CA3AF', icon: 'help-circle' };
  };

  const getPriorityInfo = () => {
    const p = task.priority_level || 'baja';
    if (p === 'alta')  return { label: 'Prioridad Alta',  color: '#EF4444', icon: 'alert-triangle' };
    if (p === 'media') return { label: 'Prioridad Media', color: '#F59E0B', icon: 'minus' };
    return { label: 'Prioridad Baja', color: '#64c27b', icon: 'chevron-down' };
  };

  const getTagNames = () => {
    if (!Array.isArray(task.management_tags) || task.management_tags.length === 0) return [];
    return managementTags.filter(tag => task.management_tags.includes(tag.id));
  };

  const handleReprogram = async () => {
    if (!reason.trim()) { Alert.alert("Razón requerida", "Debes proporcionar una razón para la reprogramación"); return; }
    await processReschedule();
  };

  const processReschedule = async () => {
    const { minDate, maxDate } = getReprogrammingRange();
    const selectedTime = newDate.getTime();
    if (selectedTime < minDate.getTime()) { Alert.alert("Fecha inválida", `No puedes reprogramar antes del ${minDate.toLocaleDateString('es-ES')}.`); return; }
    if (selectedTime > maxDate.getTime()) { Alert.alert("Fecha inválida", `No puedes reprogramar después del ${maxDate.toLocaleDateString('es-ES')}.`); return; }
    
    const now = new Date();
    const isToday = newDate.toDateString() === now.toDateString();
    if (isToday) {
      const selectedHour = newDate.getHours();
      const currentHour = now.getHours();
      const selectedMinute = newDate.getMinutes();
      const currentMinute = now.getMinutes();
      
      if (selectedHour < currentHour || (selectedHour === currentHour && selectedMinute < currentMinute)) {
        Alert.alert("Hora inválida", "Si seleccionas el día de hoy, la hora no puede ser anterior a la hora actual."); 
        return;
      }
    }
    
    const utcDateStr = formatForOdoo(newDate);
    try {
      await SyncService.updateTaskLocally(task.id, { date_deadline: utcDateStr });
      await SyncService.createReasonWizard('reason.wizard', { task_id: task.id, new_date: utcDateStr, old_date: task.date_deadline, reason });
      if (isOnline) {
        setSyncing(true);
        try {
          await SyncService.syncPendingChanges();
          Alert.alert("✓ Reprogramada", "La tarea se ha actualizado y sincronizado con el servidor.");
        } catch (_) {
          Alert.alert("✓ Reprogramada (offline)", "La tarea se actualizará cuando recuperes la conexión.");
        } finally { setSyncing(false); }
      } else {
        Alert.alert("✓ Reprogramada (offline)", "La tarea se actualizará cuando recuperes la conexión.");
      }
      setReprogramming(false);
      setReason('');
      if (onTaskUpdated) onTaskUpdated();
    } catch { Alert.alert("Error", "No se pudo reprogramar"); }
  };

  const showStateChangeOptions = () => {
    setShowStateSelector(true);
  };

  const handleStateChange = async (newState) => {
    if (newState === task.state) return;
    
    if (newState === '1_done' && !taskHasDescription) {
      promptAddDescriptionThenComplete();
      return;
    }
    
    try {
      await SyncService.updateTaskLocally(task.id, { state: newState });
      if (isOnline) {
        setSyncing(true);
        try {
          await SyncService.syncPendingChanges();
          Alert.alert('✓ Estado actualizado', 'El cambio se ha sincronizado con el servidor.');
        } catch (_) {
          Alert.alert('✓ Estado actualizado (offline)', 'El cambio se sincronizará cuando recuperes la conexión.');
        } finally { setSyncing(false); }
      } else {
        Alert.alert('✓ Estado actualizado (offline)', 'El cambio se sincronizará cuando recuperes la conexión.');
      }
      if (onTaskUpdated) onTaskUpdated();
    } catch { Alert.alert('Error', 'No se pudo actualizar el estado de la tarea.'); }
  };

  const handleSurveyComplete = async () => {
    setShowSurveyModal(false);
    await loadSurveys();
  };

  const statusInfo   = getStatusInfo();
  const priorityInfo = getPriorityInfo();
  const taskTags     = getTagNames();
  const { minDate, maxDate } = getReprogrammingRange();
  const completeButtonBlocked = !taskHasDescription && task.state !== '1_done';

  const displayDeadline = task.date_deadline
    ? parseOdooDate(task.date_deadline).toLocaleString('es-ES', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : 'Sin asignar';

  const displayMaxDate = maxDate instanceof Date && !isNaN(maxDate)
    ? maxDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Fecha no disponible';

  const InfoRow = ({ icon, label, value, colorOverride }) => {
    if (!value || value === '-') return null;
    return (
      <View style={styles.infoRow}>
        <View style={[styles.iconContainer, colorOverride && { backgroundColor: colorOverride + '20' }]}>
          <Feather name={icon} size={18} color={colorOverride || "#64c27b"} />
        </View>
        <View style={styles.infoContent}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={[styles.infoValue, colorOverride && { color: colorOverride }]}>{value}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeModal}>
      <View style={styles.overlay}>
        {showSurveyModal && selectedSurvey && (
          <SurveyModal
            visible={showSurveyModal}
            taskId={task.id}
            surveyId={selectedSurvey.surveyId}
            relationId={selectedSurvey.relationId}
            onClose={() => setShowSurveyModal(false)}
            onComplete={handleSurveyComplete}
          />
        )}
        {showSurveyResponses && surveyToView && (
          <SurveyResponsesModal
            visible={showSurveyResponses}
            survey={{ id: surveyToView.surveyId, title: surveyToView.title }}
            taskId={task.id}
            taskState={task.state}
            relationId={surveyToView.relationId}
            onClose={() => setShowSurveyResponses(false)}
            onEditSurvey={() => {
              setShowSurveyResponses(false);
              setSelectedSurvey({ surveyId: surveyToView.surveyId, relationId: surveyToView.relationId });
              setShowSurveyModal(true);
            }}
          />
        )}
        <StateSelectorModal
          visible={showStateSelector}
          currentState={task.state}
          onClose={() => setShowStateSelector(false)}
          onSelectState={handleStateChange}
          requiresDescription={!taskHasDescription}
          onRequireDescription={promptAddDescriptionThenComplete}
        />
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeModal} />

        <Animated.View
          style={[styles.modalContainer, { transform: [{ translateY: slideAnim }, { translateY: panY }] }]}
        >
          <View style={styles.dragHeader} {...panResponder.panHandlers}>
            <View style={styles.handle} />
          </View>

          <KeyboardAwareScrollView
            innerRef={ref => { keyboardScrollRef.current = ref; }}
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            enableOnAndroid={true}
            extraScrollHeight={150}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Badges de estado y prioridad ── */}
            <View style={styles.headerRow}>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.color }]}>
                <Feather name={statusInfo.icon} size={14} color="#fff" />
                <Text style={styles.statusText}>{statusInfo.label}</Text>
              </View>
              <View style={[styles.priorityBadge, { borderColor: priorityInfo.color }]}>
                <Feather name={priorityInfo.icon} size={14} color={priorityInfo.color} />
                <Text style={[styles.priorityText, { color: priorityInfo.color }]}>{priorityInfo.label}</Text>
              </View>
            </View>

            {/* ── Banner de tarea histórica ── */}
            {isHistorical && (
              <View style={styles.historicalBanner}>
                <Feather name="archive" size={18} color="#92400E" style={{ marginTop: 1 }} />
                <View style={styles.historicalBannerText}>
                  <Text style={styles.historicalBannerTitle}>Tarea de un periodo anterior</Text>
                  <Text style={styles.historicalBannerSubtitle}>
                    Solo puedes consultarla. Para completarla, gestionar encuestas o reprogramarla necesitas conexión para que se cargue en el periodo activo.
                  </Text>
                </View>
              </View>
            )}

            {/* ── Título + clip adjuntos ── */}
            <View style={styles.titleRow}>
              <Text style={styles.title}>{task.display_name || task.name}</Text>
              <TouchableOpacity
                style={styles.attachmentsIconButton}
                onPress={() => setShowAttachmentsModal(true)}
                activeOpacity={0.7}
              >
                <Feather name="paperclip" size={22} color="#64c27b" />
                {attachmentsCount > 0 && (
                  <View style={styles.attachmentsBadge}>
                    <Text style={styles.attachmentsBadgeText}>{attachmentsCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {associatedLead && (
              <TouchableOpacity 
                style={styles.leadTag} 
                onPress={() => onNavigateToLeads ? onNavigateToLeads() : setShowLeadModal(true)} 
                activeOpacity={0.7}
              >
                <View style={styles.leadTagLeft}>
                  <Feather name="briefcase" size={14} color="#3B82F6" />
                  <Text style={styles.leadTagText}>Oportunidad: {associatedLead.name}</Text>
                </View>
                <Feather name={onNavigateToLeads ? "chevron-right" : "external-link"} size={14} color="#3B82F6" />
              </TouchableOpacity>
            )}

            {taskTags.length > 0 && (
              <View style={styles.tagsContainer}>
                {taskTags.map((tag) => (
                  <View key={tag.id} style={styles.tagChip}>
                    <Feather name="tag" size={12} color="#64c27b" />
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Aviso de descripción faltante (solo si no es histórica) ── */}
            {!isHistorical && !taskHasDescription && task.state !== '1_done' && (
              <TouchableOpacity style={styles.missingDescriptionBanner} onPress={handleStartEditDescription} activeOpacity={0.8}>
                <View style={styles.missingDescriptionLeft}>
                  <Feather name="alert-triangle" size={16} color="#B45309" />
                  <View style={styles.missingDescriptionTextBlock}>
                    <Text style={styles.missingDescriptionTitle}>Descripción requerida</Text>
                    <Text style={styles.missingDescriptionSubtitle}>Odoo no permitirá completar esta tarea hasta que tenga descripción.</Text>
                  </View>
                </View>
                <View style={styles.missingDescriptionAction}>
                  <Feather name="edit-3" size={14} color="#92400E" />
                  <Text style={styles.missingDescriptionActionText}>Añadir</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* ── Encuestas ── */}
            {loadingSurveys ? (
              <ActivityIndicator style={{ marginVertical: 20 }} size="small" color="#64c27b" />
            ) : hasSurveys && (
              <View style={styles.surveysSection}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>ENCUESTAS ASIGNADAS</Text>
                  <View style={[styles.counterBadge, allSurveysDone ? styles.counterBadgeDone : styles.counterBadgePending]}>
                    <Text style={[styles.counterText, allSurveysDone ? styles.counterTextDone : styles.counterTextPending]}>
                      {completedSurveys}/{totalSurveys} Completadas
                    </Text>
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.surveyListContent}>
                  {taskSurveys.map((survey, index) => (
                    <View
                      key={survey.relation_id || `${survey.id}-${index}`}
                      style={styles.surveyCardWrapper}
                    >
                      <TouchableOpacity
                        style={[
                          styles.surveyCard,
                          survey.isCompleted ? styles.surveyCardDone : styles.surveyCardPending,
                          isHistorical && styles.surveyCardDisabled,
                        ]}
                        onPress={isHistorical ? undefined : () => handleOpenSurvey(survey)}
                        activeOpacity={isHistorical ? 1 : 0.7}
                      >
                        <View style={styles.surveyCardTop}>
                          <Feather
                            name={isHistorical ? 'lock' : (survey.isCompleted ? 'check-circle' : 'clipboard')}
                            size={24}
                            color={isHistorical ? '#9CA3AF' : (survey.isCompleted ? '#10B981' : '#F59E0B')}
                          />
                          {survey.isCompleted && !isHistorical && (
                            <View style={styles.editBadge}>
                              <Feather name="eye" size={10} color="#15803d" />
                              <Text style={styles.editBadgeText}>Ver Respuestas</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.surveyTitle} numberOfLines={2}>{survey.title}</Text>
                        <Text style={[styles.surveyStatusText, isHistorical && { color: '#9CA3AF' }]}>
                          {isHistorical ? 'No disponible' : (survey.isCompleted ? 'Completada' : 'Pendiente')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.divider} />

            {/* ── Datos de la tarea ── */}
            <Text style={styles.sectionTitle}>Datos de la Tarea</Text>
            <InfoRow icon="user"     label="Cliente"  value={Array.isArray(task.partner_id) ? task.partner_id[1] : '-'} />
            <InfoRow icon="briefcase" label="Proyecto" value={Array.isArray(task.project_id) ? task.project_id[1] : '-'} />

            <View style={styles.divider} />

            {/* ── Planificación ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Planificación</Text>
              {!reprogramming && task.state !== '1_done' && !isHistorical && (
                <TouchableOpacity style={styles.reprogramButton} onPress={() => setReprogramming(true)}>
                  <Feather name="edit-2" size={16} color="#64c27b" />
                  <Text style={styles.reprogramButtonText}>Reprogramar</Text>
                </TouchableOpacity>
              )}
            </View>

            {reprogramming ? (
              <View style={styles.reprogramContainer}>
                <Text style={styles.reprogramTitle}>Selecciona nueva fecha y hora</Text>
                <View style={styles.rangeInfoContainer}>
                  <Feather name="info" size={14} color="#6B7280" />
                  <Text style={styles.rangeInfoText}>
                    Rango permitido: {minDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} al {maxDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                  </Text>
                </View>
                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowPicker(true)}>
                  <View style={styles.datePickerLeft}>
                    <Feather name="calendar" size={20} color="#64c27b" />
                    <View style={styles.datePickerTextContainer}>
                      <Text style={styles.datePickerDate}>
                        {newDate.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                      </Text>
                      <Text style={styles.datePickerTime}>
                        {newDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                  <Feather name="chevron-down" size={20} color="#9CA3AF" />
                </TouchableOpacity>
                <SimpleDateTimePicker
                  visible={showPicker}
                  onClose={() => setShowPicker(false)}
                  selectedDate={newDate}
                  onConfirm={setNewDate}
                  minDate={minDate}
                  maxDate={maxDate}
                  mode="datetime"
                />
                <View style={styles.reasonField}>
                  <Text style={styles.reasonLabel}>Razón de la reprogramación <Text style={styles.required}>*</Text></Text>
                  <TextInput
                    style={styles.reasonInput}
                    value={reason}
                    onChangeText={setReason}
                    placeholder="Explica por qué reprogramas esta tarea..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    maxLength={500}
                  />
                </View>
                <View style={styles.reprogramActions}>
                  <TouchableOpacity style={[styles.actionButton, styles.actionButtonCancel]} onPress={() => setReprogramming(false)}>
                    <Text style={styles.actionButtonCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.actionButtonConfirm]} onPress={handleReprogram}>
                    <Feather name="check" size={16} color="#fff" />
                    <Text style={styles.actionButtonConfirmText}>Confirmar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <InfoRow icon="calendar" label="Fecha de Ejecución" value={displayDeadline} />
                <InfoRow
                  icon="flag"
                  label="Fin del Periodo"
                  value={maxDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                  colorOverride="#F59E0B"
                />
              </>
            )}

            {/* ── Descripción ── */}
            <View style={styles.divider} />
            <View
              style={styles.sectionHeader}
              onLayout={(e) => { descriptionYOffset.current = e.nativeEvent.layout.y; }}
            >
              <View style={styles.descriptionTitleRow}>
                <Text style={styles.sectionTitle}>Descripción</Text>
                {!taskHasDescription && !isHistorical && (
                  <View style={styles.descriptionMissingBadge}>
                    <Feather name="alert-circle" size={11} color="#EF4444" />
                    <Text style={styles.descriptionMissingBadgeText}>Falta</Text>
                  </View>
                )}
              </View>

              {/* Botón editar descripción — oculto en históricas */}
              {task.state !== '1_done' && !editingDescription && !isHistorical && (
                <TouchableOpacity style={styles.editDescriptionButton} onPress={handleStartEditDescription}>
                  <Feather name="edit-3" size={15} color="#64c27b" />
                  <Text style={styles.editDescriptionButtonText}>{taskHasDescription ? 'Editar' : 'Añadir'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {editingDescription ? (
              <View style={styles.descriptionEditorContainer}>
                <TextInput
                  style={styles.descriptionEditor}
                  value={descriptionDraft}
                  onChangeText={setDescriptionDraft}
                  placeholder="Describe el objetivo de esta tarea..."
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  autoFocus
                  maxLength={2000}
                />
                <View style={styles.descriptionEditorFooter}>
                  <Text style={styles.descriptionCharCount}>{descriptionDraft.length}/2000</Text>
                  <View style={styles.descriptionEditorActions}>
                    <TouchableOpacity style={[styles.descEditorBtn, styles.descEditorBtnCancel]} onPress={handleCancelEditDescription} disabled={savingDescription}>
                      <Text style={styles.descEditorBtnCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.descEditorBtn, styles.descEditorBtnSave, !descriptionDraft.trim() && styles.descEditorBtnDisabled]}
                      onPress={handleSaveDescription}
                      disabled={savingDescription || !descriptionDraft.trim()}
                    >
                      {savingDescription ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Feather name="check" size={15} color="#fff" />
                          <Text style={styles.descEditorBtnSaveText}>Guardar</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
                {!descriptionDraft.trim() && (
                  <View style={styles.descriptionEditorWarning}>
                    <Feather name="info" size={13} color="#B45309" />
                    <Text style={styles.descriptionEditorWarningText}>La descripción es obligatoria para poder completar la tarea en Odoo.</Text>
                  </View>
                )}
              </View>
            ) : taskHasDescription ? (
              <View style={styles.descriptionBox}>
                <Text style={styles.descriptionText}>{cleanDescription}</Text>
              </View>
            ) : !isHistorical ? (
              <TouchableOpacity style={styles.descriptionEmptyBox} onPress={handleStartEditDescription} activeOpacity={0.7}>
                <Feather name="file-text" size={20} color="#D1D5DB" />
                <Text style={styles.descriptionEmptyText}>Sin descripción</Text>
                <Text style={styles.descriptionEmptySubtext}>Toca para añadirla (necesaria para completar la tarea)</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.descriptionEmptyBox}>
                <Feather name="file-text" size={20} color="#D1D5DB" />
                <Text style={styles.descriptionEmptyText}>Sin descripción</Text>
              </View>
            )}

            {/* ── Botón principal de acción ── */}
            {task.state !== '1_done' && (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={[
                    styles.completeTaskButton,
                    isHistorical                                        && styles.completeTaskButtonHistorical,
                    !isHistorical && completeButtonBlocked              && styles.completeTaskButtonBlocked,
                    !isHistorical && !completeButtonBlocked && hasSurveys && allSurveysDone  && styles.completeTaskButtonReady,
                    !isHistorical && !completeButtonBlocked && !hasSurveys && !isUserOwnTask && styles.completeTaskButtonReady,
                    !isHistorical && !completeButtonBlocked && hasSurveys && !allSurveysDone && styles.completeTaskButtonWarning,
                    !isHistorical && !completeButtonBlocked && !hasSurveys && isUserOwnTask  && styles.completeTaskButtonOwn,
                  ]}
                  onPress={isHistorical ? undefined : handleTaskAction}
                  activeOpacity={isHistorical ? 1 : 0.85}
                >
                  <Feather
                    name={
                      isHistorical                          ? 'lock'          :
                      completeButtonBlocked                 ? 'alert-circle'  :
                      hasSurveys && !allSurveysDone         ? 'alert-circle'  :
                      !hasSurveys && isUserOwnTask          ? 'edit'          :
                      'check-circle'
                    }
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.completeTaskButtonText}>
                    {isHistorical
                      ? 'No disponible en periodos anteriores'
                      : completeButtonBlocked
                      ? 'Añadir descripción para completar'
                      : hasSurveys && !allSurveysDone
                      ? `Pendientes: ${totalSurveys - completedSurveys} encuestas`
                      : !hasSurveys && isUserOwnTask
                      ? 'Cambiar Estado'
                      : 'Completar Tarea'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.divider} />
            <View style={styles.commentsSection}>
              <CommentsSection taskId={task.id} visible={visible} />
            </View>

            <AttachmentsModal
              visible={showAttachmentsModal}
              taskId={task.id}
              onClose={() => setShowAttachmentsModal(false)}
            />

            <View style={{ height: 60 }} />
          </KeyboardAwareScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay:  { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  modalContainer: {
    height: MODAL_HEIGHT, backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5, paddingBottom: 30,
  },
  dragHeader: {
    width: '100%', height: 40, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  handle: { width: 48, height: 5, backgroundColor: '#E5E7EB', borderRadius: 3 },
  scrollContainer: { flex: 1 },
  scrollContent:   { padding: 24, paddingBottom: 40 },

  headerRow:    { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, gap: 6 },
  statusText:   { fontSize: 12, fontWeight: '700', color: '#fff' },
  priorityBadge:{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, borderWidth: 1.5, backgroundColor: '#fff', gap: 6 },
  priorityText: { fontSize: 12, fontWeight: '700' },

  // ── Banner histórico ────────────────────────────────────────────────────────
  historicalBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  historicalBannerText: { flex: 1 },
  historicalBannerTitle: {
    fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 4,
  },
  historicalBannerSubtitle: {
    fontSize: 12, color: '#B45309', lineHeight: 17,
  },

  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  title:    { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8, lineHeight: 28, flex: 1 },

  attachmentsIconButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  attachmentsBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: '#fff',
  },
  attachmentsBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  leadTag: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, marginBottom: 12, borderWidth: 1, borderColor: '#BFDBFE',
  },
  leadTagLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  leadTagText: { fontSize: 13, fontWeight: '600', color: '#3B82F6', flex: 1 },

  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f0fdf4', paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 12, gap: 4, borderWidth: 1, borderColor: '#86efac',
  },
  tagText: { fontSize: 12, fontWeight: '600', color: '#15803d' },

  missingDescriptionBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D',
    borderRadius: 10, padding: 12, marginBottom: 16,
  },
  missingDescriptionLeft:     { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 10 },
  missingDescriptionTextBlock:{ flex: 1 },
  missingDescriptionTitle:    { fontSize: 13, fontWeight: '700', color: '#92400E', marginBottom: 2 },
  missingDescriptionSubtitle: { fontSize: 12, color: '#B45309', lineHeight: 17 },
  missingDescriptionAction:   {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, gap: 4, marginLeft: 10,
  },
  missingDescriptionActionText: { fontSize: 12, fontWeight: '700', color: '#92400E' },

  divider:       { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle:  { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },

  surveysSection:     { marginTop: 10 },
  counterBadge:       { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  counterBadgePending:{ backgroundColor: '#FEF3C7' },
  counterBadgeDone:   { backgroundColor: '#D1FAE5' },
  counterText:        { fontSize: 11, fontWeight: '700' },
  counterTextPending: { color: '#B45309' },
  counterTextDone:    { color: '#047857' },
  surveyListContent:  { paddingRight: 20 },
  surveyCard: {
    width: 140, height: 110, borderRadius: 12, padding: 12,
    borderWidth: 1, justifyContent: 'space-between',
    backgroundColor: '#fff', marginRight: 12,
  },
  surveyCardPending:  { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  surveyCardDone:     { borderColor: '#6EE7B7', backgroundColor: '#ECFDF5' },
  surveyCardDisabled: { opacity: 0.45 },
  surveyCardTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  surveyTitle:        { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 8 },
  surveyStatusText:   { fontSize: 10, fontWeight: '500', color: '#6B7280', marginTop: 4 },
  editBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    paddingHorizontal: 1, paddingVertical: 0, borderRadius: 4,
  },
  editBadgeText: { fontSize: 9, color: '#15803d', marginLeft: 2, fontWeight: 'bold' },

  infoRow:     { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  iconContainer: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0fdf4',
    alignItems: 'center', justifyContent: 'center', marginRight: 16,
  },
  infoContent: { flex: 1 },
  infoLabel:   { fontSize: 11, color: '#9CA3AF', marginBottom: 2, fontWeight: '600', textTransform: 'uppercase' },
  infoValue:   { fontSize: 15, color: '#1F2937', fontWeight: '500', lineHeight: 20 },

  reprogramButton:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#f0fdf4', borderRadius: 6 },
  reprogramButtonText: { fontSize: 13, fontWeight: '600', color: '#64c27b' },

  reprogramContainer:   { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  reprogramTitle:       { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 12 },
  rangeInfoContainer:   { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6 },
  rangeInfoText:        { fontSize: 12, color: '#6B7280', fontStyle: 'italic' },
  datePickerButton:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 14, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', marginBottom: 16 },
  datePickerLeft:       { flexDirection: 'row', alignItems: 'center', flex: 1 },
  datePickerTextContainer: { marginLeft: 12 },
  datePickerDate:       { fontSize: 15, color: '#111827', fontWeight: '500', textTransform: 'capitalize' },
  datePickerTime:       { fontSize: 13, color: '#6B7280', marginTop: 2 },
  reasonField:          { marginTop: 0 },
  reasonLabel:          { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  required:             { color: '#EF4444' },
  reasonInput:          { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 14, color: '#111827', height: 80 },
  reprogramActions:     { flexDirection: 'row', gap: 12, marginTop: 16 },
  actionButton:         { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, gap: 6 },
  actionButtonCancel:   { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  actionButtonCancelText:  { fontSize: 14, fontWeight: '600', color: '#374151' },
  actionButtonConfirm:     { backgroundColor: '#64c27b' },
  actionButtonConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  descriptionTitleRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  descriptionMissingBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 3 },
  descriptionMissingBadgeText: { fontSize: 10, fontWeight: '700', color: '#EF4444' },
  editDescriptionButton:   { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#f0fdf4', borderRadius: 6 },
  editDescriptionButtonText:{ fontSize: 13, fontWeight: '600', color: '#64c27b' },

  descriptionBox:          { backgroundColor: '#F9FAFB', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  descriptionText:         { fontSize: 14, color: '#374151', lineHeight: 20 },
  descriptionEmptyBox:     { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', padding: 24, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', gap: 6 },
  descriptionEmptyText:    { fontSize: 14, fontWeight: '600', color: '#9CA3AF' },
  descriptionEmptySubtext: { fontSize: 12, color: '#D1D5DB', textAlign: 'center' },

  descriptionEditorContainer: { backgroundColor: '#F9FAFB', borderRadius: 8, borderWidth: 1.5, borderColor: '#64c27b', overflow: 'hidden' },
  descriptionEditor:           { padding: 14, fontSize: 14, color: '#111827', minHeight: 120, textAlignVertical: 'top', backgroundColor: '#fff' },
  descriptionEditorFooter:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F9FAFB', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  descriptionCharCount:        { fontSize: 11, color: '#9CA3AF' },
  descriptionEditorActions:    { flexDirection: 'row', gap: 8 },
  descEditorBtn:               { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6, gap: 5 },
  descEditorBtnCancel:         { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  descEditorBtnCancelText:     { fontSize: 13, fontWeight: '600', color: '#374151' },
  descEditorBtnSave:           { backgroundColor: '#64c27b' },
  descEditorBtnDisabled:       { backgroundColor: '#D1D5DB' },
  descEditorBtnSaveText:       { fontSize: 13, fontWeight: '700', color: '#fff' },
  descriptionEditorWarning:    { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFBEB', padding: 10, gap: 6 },
  descriptionEditorWarningText:{ flex: 1, fontSize: 12, color: '#B45309', lineHeight: 17 },

  completeTaskButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#10B981', paddingVertical: 16, paddingHorizontal: 20,
    borderRadius: 12, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  completeTaskButtonHistorical: { backgroundColor: '#9CA3AF' },
  completeTaskButtonBlocked:    { backgroundColor: '#F59E0B' },
  completeTaskButtonWarning:    { backgroundColor: '#F59E0B' },
  completeTaskButtonReady:      { backgroundColor: '#10B981' },
  completeTaskButtonOwn:        { backgroundColor: '#3B82F6' },
  completeTaskButtonText:       { fontSize: 16, fontWeight: '700', color: '#fff' },

  commentsSection: { minHeight: 300, maxHeight: 500 },
  surveyWebButtonDisabled: {
    backgroundColor: '#F3F4F6',
    opacity: 0.5,
  },
  surveyCardWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  surveyWebButton: {
    position: 'absolute',
    top: 28,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
});