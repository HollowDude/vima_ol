import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
  RefreshControl, Alert, Modal, FlatList, ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import TaskCard from '../../../core/components/TaskCard';
import TaskDetailModal from '../../../core/components/TaskDetailModal';
import CreateTaskModal from '../../../core/components/CreateTaskModal';
import ToastContainer from '../../../core/components/ToastContainer';
import SlideMenu from '../../../core/components/SlideMenu';
import ExpandableFAB from '../../../core/components/ExpandableFab';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';

// ─── Constantes ───────────────────────────────────────────────────────────────
const HOURS            = Array.from({ length: 24 }, (_, i) => i);
const BASE_HOUR_HEIGHT = 80;
const MIN_ZOOM         = 0.5;
const MAX_ZOOM         = 2;
const DAY_WIDTH        = 120;
const INITIAL_PAST_DAYS   = 3;
const INITIAL_FUTURE_DAYS = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Devuelve el último día del mes al que pertenece dateStr.
 * Ej: '2026-04-01' → Date(2026-04-30)
 */
const getEndOfMonthDate = (dateStr) => {
  const d = new Date(dateStr);
  // new Date(year, month+1, 0) = último día del mes
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

// ─── DayTasksModal ─────────────────────────────────────────────────────────────
function DayTasksModal({ visible, date, tasks, onClose, onSelectTask }) {
  if (!visible) return null;
  let dateObj = new Date();
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    dateObj = new Date(y, m - 1, d);
  }
  const dateStr = dateObj.toLocaleDateString('es-ES', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.dayModalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.dayModalContainer}>
          <View style={styles.dayModalHeader}>
            <Text style={styles.dayModalTitle}>{dateStr}</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={tasks}
            keyExtractor={item => item.id.toString()}
            renderItem={({ item }) => {
              const tDate = item.date_deadline
                ? new Date(
                    item.date_deadline.replace(' ', 'T') +
                    (item.date_deadline.includes('Z') ? '' : 'Z')
                  )
                : new Date();
              const timeStr = tDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
              const isDone  = item.state === '1_done';
              return (
                <TouchableOpacity
                  style={styles.dayTaskItem}
                  onPress={() => { onClose(); setTimeout(() => onSelectTask(item), 300); }}
                >
                  <View style={styles.dayTaskTime}>
                    <Feather name="clock" size={14} color="#6B7280" />
                    <Text style={styles.dayTaskTimeText}>{timeStr}</Text>
                  </View>
                  <Text style={[styles.dayTaskTitle, isDone && styles.dayTaskTitleDone]} numberOfLines={2}>
                    {item.display_name}
                  </Text>
                  {item.partner_id && (
                    <Text style={styles.dayTaskClient} numberOfLines={1}>
                      {Array.isArray(item.partner_id) ? item.partner_id[1] : ''}
                    </Text>
                  )}
                  {isDone && (
                    <Feather name="check-circle" size={16} color="#10B981" style={{ marginRight: 8 }} />
                  )}
                  <Feather name="chevron-right" size={16} color="#D1D5DB" />
                </TouchableOpacity>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.dayTaskSeparator} />}
            ListEmptyComponent={
              <View style={styles.emptyDayTasks}>
                <Feather name="calendar" size={32} color="#D1D5DB" />
                <Text style={styles.emptyDayTasksText}>Sin tareas este día</Text>
              </View>
            }
          />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── TasksScreen ───────────────────────────────────────────────────────────────
export default function TasksScreen({ userData, username, onBack, onLogout }) {
  const { isOnline }            = useNetwork();
  const { syncAll, syncModule } = useSyncActions();
  const scrollViewRef           = useRef(null);
  const scrollXRef              = useRef(0);

  // ── Estado general ──────────────────────────────────────────────────────────
  const [selectedTask, setSelectedTask]         = useState(null);
  const [isCreateModalVisible, setCreateModal]  = useState(false);
  const [menuVisible, setMenuVisible]           = useState(false);
  const [refreshing, setRefreshing]             = useState(false);
  const [dayModalVisible, setDayModalVisible]   = useState(false);
  const [selectedDayDate, setSelectedDayDate]   = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState([]);
  const [allTasks, setAllTasks]                 = useState([]);
  const [projectId, setProjectId]               = useState(null);
  const [zoomLevel, setZoomLevel]               = useState(1);

  // ── Días cargados ────────────────────────────────────────────────────────────
  const [pastDays,   setPastDays]   = useState(INITIAL_PAST_DAYS);
  const [futureDays, setFutureDays] = useState(INITIAL_FUTURE_DAYS);

  // ── Tareas extendidas (históricas / futuras fuera del proyecto actual) ────────
  const [extendedTasks, setExtendedTasks]   = useState([]);
  const [loadingExtended, setLoadingExtended] = useState(false);

  /**
   * Límites del proyecto actual:
   *   projectDateStart → primer día del proyecto (YYYY-MM-DD)
   *   projectDateEnd   → último día estimado del proyecto (fin de mes)
   */
  const [projectDateStart, setProjectDateStart] = useState(null);
  const [projectDateEnd,   setProjectDateEnd]   = useState(null);

  const prevOnline  = usePrevious(isOnline);
  const HOUR_HEIGHT = BASE_HOUR_HEIGHT * zoomLevel;

  // ── Vista unificada: tareas del proyecto + tareas extendidas (sin dupes) ────
  const allVisibleTasks = useMemo(() => {
    const localIds = new Set(allTasks.map(t => t.id));
    return [...allTasks, ...extendedTasks.filter(t => !localIds.has(t.id))];
  }, [allTasks, extendedTasks]);

  // ── Efectos ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadTasks();
    // Limpieza de cache expirado al montar
    SyncService.cleanExpiredExtendedTasks();
  }, []);

  useEffect(() => {
    if (prevOnline === false && isOnline === true) {
      syncModule('tasks').then(() => loadTasks());
    }
  }, [isOnline, prevOnline]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ x: INITIAL_PAST_DAYS * DAY_WIDTH, animated: false });
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  // ── Cargar datos locales ──────────────────────────────────────────────────────
  const loadTasks = async () => {
    try {
      const result = await SyncService.getAllVisibleTasks();
      setAllTasks(result.tasks);
      setProjectId(result.projectId);

      // Límites del proyecto actual
      const project = await SyncService.getMasterData('current_project');
      if (project?.date_start) {
        setProjectDateStart(project.date_start);
        setProjectDateEnd(getLocalDateString(getEndOfMonthDate(project.date_start)));
      }

      // Cargar tareas extendidas ya cacheadas (puede haber de sesiones anteriores aún vigentes)
      const cached = await SyncService.getExtendedTasks();
      setExtendedTasks(cached);
    } catch (e) {
      console.error('Error cargando tareas:', e);
    }
  };

  // ─── Fetch de tareas extendidas ──────────────────────────────────────────────
  /**
   * Intenta obtener tareas para [fromStr, toStr]:
   *  - Online  → fetch de Odoo + guarda en cache
   *  - Offline → usa cache existente si hay cobertura; si no, bloquea y avisa
   *
   * @returns {boolean} true si se puede proceder (extiende el calendario)
   *                    false si el usuario debe cancelar la acción
   */
  const fetchExtendedTasks = async (fromStr, toStr, direction) => {
    if (!isOnline) {
      // Comprobar si hay algo en cache que cubra (aunque sea parcialmente) el rango
      const cached = await SyncService.getExtendedTasks();
      const hasCoverage = cached.some(t => {
        if (!t.date_deadline) return false;
        const dStr = (t.date_deadline.split('T')[0] || t.date_deadline.split(' ')[0]);
        return dStr >= fromStr && dStr <= toStr;
      });

      if (hasCoverage) {
        // Usar lo que hay en cache
        setExtendedTasks(cached);
        return true;
      }

      Alert.alert(
        'Sin conexión',
        `Necesitas conexión a internet para cargar tareas ${direction === 'past' ? 'anteriores' : 'futuras'} a este periodo.\n\nConéctate e inténtalo de nuevo.`,
        [{ text: 'Entendido' }]
      );
      return false; // Bloquear la extensión del calendario
    }

    // ── Online: fetch desde Odoo ──────────────────────────────────────────────
    setLoadingExtended(true);
    try {
      const tasks = await SyncService.fetchAndCacheTasksForRange(fromStr, toStr);
      setExtendedTasks(prev => {
        const existing = new Set([...allTasks.map(t => t.id), ...prev.map(t => t.id)]);
        return [...prev, ...tasks.filter(t => !existing.has(t.id))];
      });
      return true;
    } catch (e) {
      console.error('[ExtTasks] Error en fetch extendido:', e);
      Alert.alert(
        'Error',
        'No se pudieron cargar las tareas del periodo solicitado. Inténtalo de nuevo.'
      );
      return false; // Bloquear la extensión del calendario
    } finally {
      setLoadingExtended(false);
    }
  };

  // ── Cargar días pasados ───────────────────────────────────────────────────────
  const handleLoadPastDays = async () => {
    const newPastDays = pastDays + 7;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // El rango de los 7 NUEVOS días que se añaden al calendario
    const newEarliestDate = new Date(today);
    newEarliestDate.setDate(today.getDate() - newPastDays);

    const prevEarliestMinus1 = new Date(today);
    prevEarliestMinus1.setDate(today.getDate() - pastDays - 1);

    const fromStr = getLocalDateString(newEarliestDate);
    const toStr   = getLocalDateString(prevEarliestMinus1);

    // ¿Estos nuevos días caen fuera del rango del proyecto actual?
    const needsExtended = projectDateStart && newEarliestDate < new Date(projectDateStart);

    if (needsExtended) {
      const canProceed = await fetchExtendedTasks(fromStr, toStr, 'past');
      if (!canProceed) return; // El usuario fue informado; no extender el calendario
    }

    // Extender el calendario y compensar el scroll para que no salte
    const compensation = 7 * DAY_WIDTH;
    setPastDays(newPastDays);
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        x:        scrollXRef.current + compensation,
        animated: false,
      });
    }, 80);
  };

  // ── Cargar días futuros ───────────────────────────────────────────────────────
  const handleLoadFutureDays = async () => {
    const newFutureDays = futureDays + 7;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // El rango de los 7 NUEVOS días que se añaden al calendario
    const prevLatestPlus1 = new Date(today);
    prevLatestPlus1.setDate(today.getDate() + futureDays + 1);

    const newLatestDate = new Date(today);
    newLatestDate.setDate(today.getDate() + newFutureDays);

    const fromStr = getLocalDateString(prevLatestPlus1);
    const toStr   = getLocalDateString(newLatestDate);

    // ¿Estos nuevos días caen fuera del rango del proyecto actual?
    const needsExtended = projectDateEnd && newLatestDate > new Date(projectDateEnd);

    if (needsExtended) {
      const canProceed = await fetchExtendedTasks(fromStr, toStr, 'future');
      if (!canProceed) return; // No extender el calendario
    }

    setFutureDays(newFutureDays);
  };

  // ── Generación de columnas ───────────────────────────────────────────────────
  const getDaysToShow = () => {
    const today = new Date();
    const days  = [];
    for (let i = pastDays; i > 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({ date: d, dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
        dayNumber: d.getDate(), dateString: getLocalDateString(d), isPast: true, isToday: false });
    }
    for (let i = 0; i <= futureDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push({ date: d, dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
        dayNumber: d.getDate(), dateString: getLocalDateString(d), isPast: false, isToday: i === 0 });
    }
    return days;
  };

  const days = getDaysToShow();

  // ── Scroll tracking ──────────────────────────────────────────────────────────
  const handleCalendarScroll = (e) => {
    scrollXRef.current = e.nativeEvent.contentOffset.x;
  };

  // ── Datos ────────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!isOnline) { Alert.alert('Sin conexión', 'Necesitas internet para sincronizar'); return; }
    try {
      setRefreshing(true);
      await syncAll();
      await loadTasks();
    } finally { setRefreshing(false); }
  };

  const handleTaskCreated = async () => { await loadTasks(); setCreateModal(false); };
  const handleTaskUpdated = async (opts = {}) => {
    await loadTasks();
    if (!opts?.keepModalOpen) setSelectedTask(null);
  };

  // ── Interacciones ─────────────────────────────────────────────────────────────
  const handleDayHeaderPress = (dayDateString) => {
    const dayTasks = allVisibleTasks.filter(task => {
      if (!task.date_deadline) return false;
      const d = new Date(task.date_deadline.replace(' ', 'T') + (task.date_deadline.includes('Z') ? '' : 'Z'));
      return getLocalDateString(d) === dayDateString;
    });
    setSelectedDayDate(dayDateString);
    setSelectedDayTasks(dayTasks);
    setDayModalVisible(true);
  };

  const handleSlotPress = (slotTasks, dayDateString) => {
    if (!slotTasks?.length) return;
    if (slotTasks.length > 1) {
      setSelectedDayDate(dayDateString);
      setSelectedDayTasks(slotTasks);
      setDayModalVisible(true);
    } else {
      setSelectedTask(slotTasks[0]);
    }
  };

  const getTasksForDayAndHour = (dayDateString, hour) =>
    allVisibleTasks.filter(task => {
      if (!task.date_deadline) return false;
      let s = task.date_deadline.replace(' ', 'T');
      if (!s.endsWith('Z')) s += 'Z';
      const d = new Date(s);
      return getLocalDateString(d) === dayDateString && d.getHours() === hour;
    });

  // ── Estadísticas (sobre todas las tareas visibles) ───────────────────────────
  const activeCount = allVisibleTasks.filter(t =>
    ['01_in_progress', '02_changes_requested', '03_approved', '04_waiting_normal'].includes(t.state)
  ).length;
  const doneCount = allVisibleTasks.filter(t => t.state === '1_done').length;

  const fabActions = [
    { icon: 'more-vertical', onPress: () => {}                   },
    { icon: 'menu',          onPress: () => setMenuVisible(true) },
    { icon: 'file-plus',     onPress: () => setCreateModal(true) },
    { icon: 'arrow-left',    onPress: onBack                     },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        <ToastContainer />
        <SlideMenu visible={menuVisible} onClose={() => setMenuVisible(false)}
          userData={userData} username={username} onLogout={onLogout} />
        <ExpandableFAB actions={fabActions} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh}
              tintColor="#64c27b" colors={['#64c27b']} />
          }
        >
          <Card style={styles.mainCard}>
            <DashboardHeader userName={username || 'Usuario'} isOnline={isOnline} />

            {/* Estadísticas */}
            <View style={styles.statsBar}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{activeCount}</Text>
                <Text style={styles.statLabel}>Activas</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{doneCount}</Text>
                <Text style={styles.statLabel}>Finalizadas</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{allVisibleTasks.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
            </View>

            {/* Zoom */}
            <View style={styles.zoomControls}>
              <TouchableOpacity style={styles.zoomButton}
                onPress={() => setZoomLevel(v => Math.max(MIN_ZOOM, +(v - 0.2).toFixed(1)))}>
                <Feather name="zoom-out" size={18} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
              <TouchableOpacity style={styles.zoomButton}
                onPress={() => setZoomLevel(v => Math.min(MAX_ZOOM, +(v + 0.2).toFixed(1)))}>
                <Feather name="zoom-in" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Banner de carga de tareas extendidas */}
            {loadingExtended && (
              <View style={styles.extLoadingBanner}>
                <ActivityIndicator size="small" color="#64c27b" />
                <Text style={styles.extLoadingText}>
                  Cargando tareas del periodo solicitado…
                </Text>
              </View>
            )}

            {/* Calendario */}
            <ScrollView
              horizontal
              ref={scrollViewRef}
              style={styles.calendarScroll}
              showsHorizontalScrollIndicator={false}
              onScroll={handleCalendarScroll}
              scrollEventThrottle={16}
              bounces={false}
              overScrollMode="never"
            >
              <View style={styles.calendar}>

                {/* ── Columna de horas ── */}
                <View style={styles.hoursColumn}>
                  {/* Botón: cargar días pasados */}
                  <TouchableOpacity
                    style={[styles.cornerButton, loadingExtended && styles.cornerButtonDisabled]}
                    onPress={loadingExtended ? undefined : handleLoadPastDays}
                    activeOpacity={loadingExtended ? 1 : 0.75}
                  >
                    {loadingExtended ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="chevrons-left" size={16} color="#fff" />
                        <Text style={styles.cornerLabel}>-7d</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {HOURS.map(hour => (
                    <View key={hour} style={[styles.hourCell, { height: HOUR_HEIGHT }]}>
                      <Text style={styles.hourText}>
                        {hour.toString().padStart(2, '0')}:00
                      </Text>
                    </View>
                  ))}
                </View>

                {/* ── Columnas de días ── */}
                {days.map((day, dayIndex) => (
                  <View key={dayIndex} style={[styles.dayColumn, { width: DAY_WIDTH }]}>
                    <TouchableOpacity
                      style={[
                        styles.headerCell,
                        day.isPast  && styles.headerPast,
                        day.isToday && styles.headerToday,
                        // Marcar visualmente los días fuera del proyecto actual
                        projectDateStart && day.dateString < projectDateStart && styles.headerOutOfProject,
                        projectDateEnd   && day.dateString > projectDateEnd   && styles.headerOutOfProject,
                      ]}
                      onPress={() => handleDayHeaderPress(day.dateString)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayName,   day.isToday && styles.dayNameToday]}>
                        {day.dayName}
                      </Text>
                      <Text style={[styles.dayNumber, day.isToday && styles.dayNumberToday]}>
                        {day.dayNumber}
                      </Text>
                      {/* Indicador sutil de que es zona extendida */}
                      {((projectDateStart && day.dateString < projectDateStart) ||
                        (projectDateEnd   && day.dateString > projectDateEnd)) && (
                        <View style={styles.extendedDot} />
                      )}
                    </TouchableOpacity>

                    {HOURS.map(hour => {
                      const slotTasks = getTasksForDayAndHour(day.dateString, hour);
                      return (
                        <TouchableOpacity
                          key={hour}
                          style={[
                            styles.timeSlot,
                            { height: HOUR_HEIGHT },
                            slotTasks.length > 0 && styles.timeSlotWithTasks,
                          ]}
                          activeOpacity={slotTasks.length > 0 ? 0.6 : 1}
                          onPress={() => handleSlotPress(slotTasks, day.dateString)}
                        >
                          {slotTasks.slice(0, 2).map((task, idx) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onPress={() => setSelectedTask(task)}
                              style={{
                                height: slotTasks.length === 1 ? HOUR_HEIGHT - 8 : HOUR_HEIGHT / 2 - 6,
                                marginBottom: idx < Math.min(slotTasks.length, 2) - 1 ? 3 : 0,
                                opacity: task.state === '1_done' ? 0.5 : 1,
                              }}
                              priorityLevel={task.priority_level}
                              isDone={task.state === '1_done'}
                            />
                          ))}
                          {slotTasks.length > 2 && (
                            <TouchableOpacity
                              style={styles.moreTasksBadge}
                              onPress={() => handleSlotPress(slotTasks, day.dateString)}
                            >
                              <Feather name="more-horizontal" size={12} color="#fff" />
                              <Text style={styles.moreTasksText}>+{slotTasks.length - 2}</Text>
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}

                {/* ── Columna "cargar futuro" ── */}
                <TouchableOpacity
                  style={[
                    styles.dayColumn,
                    styles.futureColumn,
                    { width: DAY_WIDTH },
                    loadingExtended && styles.cornerButtonDisabled,
                  ]}
                  onPress={loadingExtended ? undefined : handleLoadFutureDays}
                  activeOpacity={loadingExtended ? 1 : 0.75}
                >
                  <View style={styles.cornerButton}>
                    {loadingExtended ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Feather name="chevrons-right" size={16} color="#fff" />
                        <Text style={styles.cornerLabel}>+7d</Text>
                      </>
                    )}
                  </View>
                  <View style={styles.futureColumnBody} />
                </TouchableOpacity>

              </View>
            </ScrollView>

            {allVisibleTasks.length === 0 && !loadingExtended && (
              <View style={styles.emptyState}>
                <Feather name="calendar" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No tienes tareas programadas</Text>
                <Text style={styles.emptySubtext}>Toca el botón + para crear una nueva</Text>
              </View>
            )}
          </Card>
        </ScrollView>

        {/* Modales */}
        <DayTasksModal
          visible={dayModalVisible}
          date={selectedDayDate}
          tasks={selectedDayTasks}
          onClose={() => setDayModalVisible(false)}
          onSelectTask={setSelectedTask}
        />
        <TaskDetailModal
          visible={!!selectedTask}
          task={selectedTask}
          allTasks={allVisibleTasks}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={handleTaskUpdated}
        />
        <CreateTaskModal
          visible={isCreateModalVisible}
          userData={userData}
          projectId={projectId}
          onClose={() => setCreateModal(false)}
          onCreated={handleTaskCreated}
        />
      </View>
    </SafeAreaProvider>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea:      { flex: 1, backgroundColor: '#f5f0ebff' },
  container:     { flex: 1 },
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80, paddingBottom: 140 },
  mainCard:      { marginBottom: 16 },

  statsBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  statItem:  { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#64c27b' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2, textTransform: 'uppercase', fontWeight: '600' },

  zoomControls: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 8, gap: 12,
  },
  zoomButton: { padding: 8 },
  zoomText:   { fontSize: 13, fontWeight: '600', color: '#6B7280', minWidth: 50, textAlign: 'center' },

  // ── Banner carga extendida ──────────────────────────────────────────────────
  extLoadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F0FDF4',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#86EFAC',
  },
  extLoadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#15803D',
  },

  // ── Calendario ──────────────────────────────────────────────────────────────
  calendarScroll: { flex: 1 },
  calendar:       { flexDirection: 'row' },
  hoursColumn:    { width: 60 },

  cornerButton: {
    height:            60,
    backgroundColor:   '#64c27b',
    alignItems:        'center',
    justifyContent:    'center',
    gap:               2,
    borderBottomWidth: 2,
    borderBottomColor: '#4caf50',
  },
  cornerButtonDisabled: {
    opacity: 0.6,
  },
  cornerLabel: {
    color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.3,
  },

  futureColumn: { overflow: 'hidden' },
  futureColumnBody: {
    flex:            1,
    backgroundColor: 'rgba(100, 194, 123, 0.06)',
  },

  headerCell: {
    height: 60, justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: '#E6E9EF', backgroundColor: '#fcf8f4ff',
  },
  headerPast:         { backgroundColor: '#f0e6dd' },
  headerToday:        { backgroundColor: '#e8f5e9', borderBottomColor: '#64c27b' },
  // Días fuera del rango del proyecto actual → tono ligeramente distinto para orientar al usuario
  headerOutOfProject: { backgroundColor: '#f3f0ff', borderBottomColor: '#c4b5fd' },

  dayName:        { fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: '600' },
  dayNameToday:   { color: '#2e7d32' },
  dayNumber:      { fontSize: 18, color: '#0B1B2A', fontWeight: '700', marginTop: 2 },
  dayNumberToday: { color: '#2e7d32' },

  // Punto indicador de zona extendida
  extendedDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#8B5CF6',
    marginTop: 2,
  },

  hourCell: {
    justifyContent: 'center', paddingRight: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6E9EF',
  },
  hourText:  { fontSize: 12, color: '#9CA3AF', textAlign: 'right', fontWeight: '500' },
  dayColumn: { borderLeftWidth: 1, borderLeftColor: '#F3F4F6' },
  timeSlot:  { borderBottomWidth: 1, borderBottomColor: '#F3F4F6', padding: 2, backgroundColor: '#fff' },
  timeSlotWithTasks: { backgroundColor: '#F9FAFB' },
  moreTasksBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#64c27b',
    borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'center', marginTop: 4, gap: 4,
  },
  moreTasksText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  emptyState:   { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyText:    { fontSize: 16, fontWeight: '600', color: '#6B7280', marginTop: 16, textAlign: 'center' },
  emptySubtext: { fontSize: 13, color: '#9CA3AF', marginTop: 8, textAlign: 'center' },

  dayModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  dayModalContainer: {
    backgroundColor: '#fff', borderRadius: 16, maxHeight: '70%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  dayModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  dayModalTitle:     { fontSize: 16, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  dayTaskItem:       { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  dayTaskTime:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayTaskTimeText:   { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  dayTaskTitle:      { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  dayTaskTitleDone:  { textDecorationLine: 'line-through', color: '#9CA3AF' },
  dayTaskClient:     { fontSize: 12, color: '#9CA3AF', marginRight: 8 },
  dayTaskSeparator:  { height: 1, backgroundColor: '#F3F4F6' },
  emptyDayTasks:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyDayTasksText: { fontSize: 14, color: '#9CA3AF', marginTop: 12 },
});