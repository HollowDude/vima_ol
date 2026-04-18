import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
  RefreshControl, Alert, Modal, FlatList, Animated, PanResponder,
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
import ElasticLoadButton from '../../../core/components/ElasticLoadButton';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';

// ─── Constantes del calendario ────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HOURS            = Array.from({ length: 24 }, (_, i) => i);
const BASE_HOUR_HEIGHT = 80;
const MIN_ZOOM         = 0.5;
const MAX_ZOOM         = 2;

/** Ancho fijo de cada columna-día (con 7+ días siempre aplica este valor). */
const DAY_WIDTH = 120;

/** Días iniciales renderizados en cada dirección desde hoy. */
const INITIAL_PAST_DAYS   = 3;
const INITIAL_FUTURE_DAYS = 3;

// ─── Constantes del overscroll indicator ─────────────────────────────────────
/**
 * Extensión visual máxima del pill en píxeles.
 * El usuario necesita arrastrar MAX_PULL / PULL_SCALE px reales para alcanzarla.
 */
const MAX_PULL    = 80;
/**
 * Distancia visual (0..MAX_PULL) a partir de la cual se dispara la carga
 * al soltar. Equivale a PULL_THRESHOLD / PULL_SCALE px de arrastre real.
 */
const PULL_THRESHOLD = 54;
/**
 * Factor de escala: px_reales_arrastrados × PULL_SCALE = distancia_visual.
 * Valor < 1 da sensación de resistencia elástica.
 */
const PULL_SCALE = 0.75;
/** Mínimo desplazamiento horizontal (px) para que el PanResponder capture. */
const PULL_MIN_DX = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
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
                  <Text
                    style={[styles.dayTaskTitle, isDone && styles.dayTaskTitleDone]}
                    numberOfLines={2}
                  >
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

  // ── Estado del calendario infinito ──────────────────────────────────────────
  const [pastDays,   setPastDays]   = useState(INITIAL_PAST_DAYS);
  const [futureDays, setFutureDays] = useState(INITIAL_FUTURE_DAYS);

  // ── Estado del overscroll indicator ─────────────────────────────────────────
  /** Si el PanResponder está activo ahora mismo */
  const [overscrollActive, setOverscrollActive] = useState(false);
  /** Dirección del overscroll activo */
  const [overscrollDir, setOverscrollDir]       = useState(null);
  /** Posición vertical del toque relativa al calendarWrapper */
  const [touchY, setTouchY]                     = useState(120);
  /** Si el tirón ha alcanzado el umbral de disparo */
  const [isReady, setIsReady]                   = useState(false);

  // ── Refs de scroll ──────────────────────────────────────────────────────────
  const scrollXRef    = useRef(0);
  const maxScrollXRef = useRef(0);

  // ── Refs del overscroll gesture ─────────────────────────────────────────────
  /** Animated.Value que maneja la extensión visual del indicador */
  const pullDistanceAnim = useRef(new Animated.Value(0)).current;
  /** Espejo ref de overscrollDir para acceso sin closure stale en PanResponder */
  const overscrollDirRef = useRef(null);
  /** dx inicial en el momento del grant (para suavizar el salto de inicio) */
  const initialDxRef     = useRef(0);

  // ── Refs de geometría del calendarWrapper ───────────────────────────────────
  const calendarWrapperRef       = useRef(null);
  const calendarScreenYRef       = useRef(0);
  const calendarScreenHeightRef  = useRef(400);

  const prevOnline = usePrevious(isOnline);
  const HOUR_HEIGHT = BASE_HOUR_HEIGHT * zoomLevel;

  // ── Efectos ─────────────────────────────────────────────────────────────────
  useEffect(() => { loadTasks(); }, []);

  useEffect(() => {
    if (prevOnline === false && isOnline === true) {
      syncModule('tasks').then(() => loadTasks());
    }
  }, [isOnline, prevOnline]);

  /** Posicionar el scroll inicial en "hoy" (índice INITIAL_PAST_DAYS) */
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        x:        INITIAL_PAST_DAYS * DAY_WIDTH,
        animated: false,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, []);

  // ── PanResponder — Overscroll Indicator ─────────────────────────────────────
  /**
   * El PanResponder vive en el View que envuelve el ScrollView horizontal.
   * Captura el gesto SÓLO cuando:
   *   a) El drag es dominantemente horizontal
   *   b) El scroll ya está en el límite izquierdo o derecho
   *   c) El usuario sigue intentando desplazarse en esa dirección
   *
   * Al capturar:
   *   - Activa el ElasticLoadButton visual correspondiente
   *   - pullDistanceAnim sigue el arrastre con resistencia elástica
   *   - Al soltar: si >= PULL_THRESHOLD → carga 7 días; si no → sólo retrocede
   *   - El pill siempre retrocede con spring al soltar
   */
  const calendarPanResponder = useRef(
    PanResponder.create({
      // No capturar en el touch inicial — sólo en movimiento
      onStartShouldSetPanResponder:        () => false,
      onStartShouldSetPanResponderCapture: () => false,

      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const { dx, dy } = gestureState;

        // Ignorar si el movimiento vertical domina (scroll exterior)
        if (Math.abs(dy) >= Math.abs(dx) * 0.9) return false;
        // Ignorar si no ha desplazado lo suficiente
        if (Math.abs(dx) < PULL_MIN_DX) return false;

        const atLeft  = scrollXRef.current <= 2;
        const atRight = maxScrollXRef.current > 10 &&
                        scrollXRef.current >= maxScrollXRef.current - 2;

        // Capturar si arrastra hacia afuera del límite
        return (dx > 0 && atLeft) || (dx < 0 && atRight);
      },

      onPanResponderGrant: (_, gestureState) => {
        // Guardar dx inicial para suavizar el salto de arranque
        initialDxRef.current = Math.abs(gestureState.dx);

        const dir = scrollXRef.current <= 2 ? 'left' : 'right';
        overscrollDirRef.current = dir;
        setOverscrollDir(dir);
        setOverscrollActive(true);
        pullDistanceAnim.setValue(0);
        setIsReady(false);
      },

      onPanResponderMove: (_, gestureState) => {
        // Distancia real menos el salto inicial → escalada elásticamente
        const raw    = Math.max(0, Math.abs(gestureState.dx) - initialDxRef.current);
        const damped = Math.min(raw * PULL_SCALE, MAX_PULL);
        pullDistanceAnim.setValue(damped);

        // Actualizar posición vertical del pill
        const localY   = gestureState.moveY - calendarScreenYRef.current;
        const clampedY = Math.max(22, Math.min(localY, calendarScreenHeightRef.current - 22));
        setTouchY(clampedY);

        // ¿Umbral alcanzado?
        setIsReady(damped >= PULL_THRESHOLD);
      },

      onPanResponderRelease: (_, gestureState) => {
        const raw     = Math.max(0, Math.abs(gestureState.dx) - initialDxRef.current);
        const damped  = Math.min(raw * PULL_SCALE, MAX_PULL);
        const trigger = damped >= PULL_THRESHOLD;

        if (trigger) {
          if (overscrollDirRef.current === 'left') {
            // Añadir 7 días al pasado y compensar el scroll para evitar salto
            const compensation = 7 * DAY_WIDTH;
            setPastDays(prev => prev + 7);
            setTimeout(() => {
              scrollViewRef.current?.scrollTo({
                x:        scrollXRef.current + compensation,
                animated: false,
              });
            }, 80);
          } else {
            // Añadir 7 días al futuro — el scroll no necesita compensación
            setFutureDays(prev => prev + 7);
          }
        }

        // Retroceder el indicador con spring elástico, luego desactivarlo
        Animated.spring(pullDistanceAnim, {
          toValue:         0,
          useNativeDriver: false,
          friction:        6,
          tension:         160,
        }).start(() => {
          setOverscrollActive(false);
          setOverscrollDir(null);
          overscrollDirRef.current = null;
          setIsReady(false);
        });
      },

      onPanResponderTerminate: () => {
        // Gestión cancelada externamente (ej. notificación del sistema)
        Animated.spring(pullDistanceAnim, {
          toValue:         0,
          useNativeDriver: false,
          friction:        8,
        }).start(() => {
          setOverscrollActive(false);
          setOverscrollDir(null);
          overscrollDirRef.current = null;
          setIsReady(false);
        });
      },

      // Permitir que el sistema cancele si es necesario
      onPanResponderTerminationRequest: () => true,
    })
  ).current;

  // ── Medir calendarWrapper en screen para posicionar el pill en Y ─────────────
  const handleCalendarLayout = () => {
    calendarWrapperRef.current?.measure((_x, _y, _w, h, _px, pageY) => {
      calendarScreenYRef.current      = pageY;
      calendarScreenHeightRef.current = h;
    });
  };

  // ── Generación de columnas ───────────────────────────────────────────────────
  const getDaysToShow = () => {
    const today = new Date();
    const days  = [];

    for (let i = pastDays; i > 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      days.push({
        date:       d,
        dayName:    d.toLocaleDateString('es-ES', { weekday: 'short' }),
        dayNumber:  d.getDate(),
        dateString: getLocalDateString(d),
        isPast:     true,
        isToday:    false,
      });
    }

    for (let i = 0; i <= futureDays; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push({
        date:       d,
        dayName:    d.toLocaleDateString('es-ES', { weekday: 'short' }),
        dayNumber:  d.getDate(),
        dateString: getLocalDateString(d),
        isPast:     false,
        isToday:    i === 0,
      });
    }

    return days;
  };

  const days = getDaysToShow();

  // ── Tracking del scroll horizontal ──────────────────────────────────────────
  const handleCalendarScroll = (e) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    scrollXRef.current    = contentOffset.x;
    maxScrollXRef.current = contentSize.width - layoutMeasurement.width;
  };

  // ── Datos ────────────────────────────────────────────────────────────────────
  const loadTasks = async () => {
    try {
      const result = await SyncService.getAllVisibleTasks();
      setAllTasks(result.tasks);
      setProjectId(result.projectId);
    } catch (e) { console.error('Error cargando tareas:', e); }
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Sin conexión', 'Necesitas internet para sincronizar');
      return;
    }
    try {
      setRefreshing(true);
      await syncAll();
      await loadTasks();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTaskCreated  = async () => { await loadTasks(); setCreateModal(false); };
  const handleTaskUpdated  = async (opts = {}) => {
    await loadTasks();
    if (!opts?.keepModalOpen) setSelectedTask(null);
  };

  // ── Interacciones del calendario ─────────────────────────────────────────────
  const handleDayHeaderPress = (dayDateString) => {
    const dayTasks = allTasks.filter(task => {
      if (!task.date_deadline) return false;
      const d = new Date(
        task.date_deadline.replace(' ', 'T') +
        (task.date_deadline.includes('Z') ? '' : 'Z')
      );
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
    allTasks.filter(task => {
      if (!task.date_deadline) return false;
      let s = task.date_deadline.replace(' ', 'T');
      if (!s.endsWith('Z')) s += 'Z';
      const d = new Date(s);
      return getLocalDateString(d) === dayDateString && d.getHours() === hour;
    });

  // ── Estadísticas ─────────────────────────────────────────────────────────────
  const activeCount = allTasks.filter(t =>
    ['01_in_progress', '02_changes_requested', '03_approved', '04_waiting_normal'].includes(t.state)
  ).length;
  const doneCount = allTasks.filter(t => t.state === '1_done').length;

  // ── FAB ──────────────────────────────────────────────────────────────────────
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

        <SlideMenu
          visible={menuVisible}
          onClose={() => setMenuVisible(false)}
          userData={userData}
          username={username}
          onLogout={onLogout}
        />

        <ExpandableFAB actions={fabActions} />

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#64c27b"
              colors={['#64c27b']}
            />
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
                <Text style={styles.statValue}>{allTasks.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
            </View>

            {/* Zoom */}
            <View style={styles.zoomControls}>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={() => setZoomLevel(v => Math.max(MIN_ZOOM, +(v - 0.2).toFixed(1)))}
              >
                <Feather name="zoom-out" size={18} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={() => setZoomLevel(v => Math.min(MAX_ZOOM, +(v + 0.2).toFixed(1)))}
              >
                <Feather name="zoom-in" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/*
              ── calendarWrapper ────────────────────────────────────────────────
              Contexto de posicionamiento para los ElasticLoadButton.
              overflow: 'visible' permite que el pill emerja desde fuera del borde.
              Los panHandlers capturan el gesto de overscroll horizontal.
            */}
            <View
              ref={calendarWrapperRef}
              onLayout={handleCalendarLayout}
              style={styles.calendarWrapper}
              {...calendarPanResponder.panHandlers}
            >
              {/* Indicador izquierdo — carga días pasados */}
              <ElasticLoadButton
                direction="left"
                isActive={overscrollActive && overscrollDir === 'left'}
                pullDistanceAnim={pullDistanceAnim}
                touchY={touchY}
                isReady={isReady}
                maxPull={MAX_PULL}
              />

              {/* Indicador derecho — carga días futuros */}
              <ElasticLoadButton
                direction="right"
                isActive={overscrollActive && overscrollDir === 'right'}
                pullDistanceAnim={pullDistanceAnim}
                touchY={touchY}
                isReady={isReady}
                maxPull={MAX_PULL}
              />

              {/* Scroll horizontal del calendario */}
              <ScrollView
                horizontal
                ref={scrollViewRef}
                style={styles.calendarScroll}
                showsHorizontalScrollIndicator={false}
                onScroll={handleCalendarScroll}
                scrollEventThrottle={16}
                // Desactivar el bounce nativo para no interferir con nuestro indicador
                bounces={false}
                overScrollMode="never"
              >
                <View style={styles.calendar}>
                  {/* Columna de horas */}
                  <View style={styles.hoursColumn}>
                    <View style={[styles.headerCell, styles.emptyHeader]} />
                    {HOURS.map(hour => (
                      <View key={hour} style={[styles.hourCell, { height: HOUR_HEIGHT }]}>
                        <Text style={styles.hourText}>
                          {hour.toString().padStart(2, '0')}:00
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Columnas de días */}
                  {days.map((day, dayIndex) => (
                    <View key={dayIndex} style={[styles.dayColumn, { width: DAY_WIDTH }]}>
                      <TouchableOpacity
                        style={[
                          styles.headerCell,
                          day.isPast  && styles.headerPast,
                          day.isToday && styles.headerToday,
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
                                  height:
                                    slotTasks.length === 1
                                      ? HOUR_HEIGHT - 8
                                      : HOUR_HEIGHT / 2 - 6,
                                  marginBottom:
                                    idx < Math.min(slotTasks.length, 2) - 1 ? 3 : 0,
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
                </View>
              </ScrollView>
            </View>

            {/* Estado vacío */}
            {allTasks.length === 0 && (
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
          allTasks={allTasks}
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
    flexDirection:     'row',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem:  { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#64c27b' },
  statLabel: {
    fontSize: 11, color: '#6B7280', marginTop: 2,
    textTransform: 'uppercase', fontWeight: '600',
  },

  zoomControls: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 8, gap: 12,
  },
  zoomButton: { padding: 8 },
  zoomText:   { fontSize: 13, fontWeight: '600', color: '#6B7280', minWidth: 50, textAlign: 'center' },

  calendarWrapper: {
    flex:     1,
    position: 'relative',
    overflow: 'visible',  // Permite que el pill emerja desde fuera del borde
  },
  calendarScroll: { flex: 1 },
  calendar:       { flexDirection: 'row' },
  hoursColumn:    { width: 60 },
  emptyHeader:    { backgroundColor: 'transparent' },

  headerCell: {
    height:            60,
    justifyContent:    'center',
    alignItems:        'center',
    borderBottomWidth: 2,
    borderBottomColor: '#E6E9EF',
    backgroundColor:   '#fcf8f4ff',
  },
  headerPast:      { backgroundColor: '#f0e6dd' },
  headerToday:     { backgroundColor: '#e8f5e9', borderBottomColor: '#64c27b' },
  dayName:         { fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: '600' },
  dayNameToday:    { color: '#2e7d32' },
  dayNumber:       { fontSize: 18, color: '#0B1B2A', fontWeight: '700', marginTop: 2 },
  dayNumberToday:  { color: '#2e7d32' },
  hourCell: {
    justifyContent:    'center',
    paddingRight:      8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E6E9EF',
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