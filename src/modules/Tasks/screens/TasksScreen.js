import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, 
  RefreshControl, Alert, Modal, FlatList, Animated
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import ViewSelector from '../../../core/components/ViewSelector';
import TaskCard from '../../../core/components/TaskCard';
import TaskDetailModal from '../../../core/components/TaskDetailModal';
import CreateTaskModal from '../../../core/components/CreateTaskModal';
import useNetwork from '../../../core/hooks/useNetwork';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HOURS = Array.from({ length: 24 }, (_, i) => i); 

const BASE_HOUR_HEIGHT = 80;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;

const getLocalDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function DayTasksModal({ visible, date, tasks, onClose, onSelectTask }) {
  if (!visible) return null;

  let dateObj = new Date();
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    dateObj = new Date(y, m - 1, d);
  }

  const dateStr = dateObj.toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: '2-digit', 
    month: 'long'
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.dayModalOverlay} 
        activeOpacity={1} 
        onPress={onClose}
      >
        <View style={styles.dayModalContainer}>
          <View style={styles.dayModalHeader}>
            <Text style={styles.dayModalTitle}>{dateStr}</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => {
              const taskDate = item.date_deadline 
                ? new Date(item.date_deadline.replace(' ', 'T') + (item.date_deadline.includes('Z') ? '' : 'Z'))
                : new Date();
              
              const timeStr = taskDate.toLocaleTimeString('es-ES', { 
                hour: '2-digit', 
                minute: '2-digit' 
              });

              const isDone = item.state === '1_done';

              return (
                <TouchableOpacity
                  style={styles.dayTaskItem}
                  onPress={() => {
                    onClose();
                    setTimeout(() => onSelectTask(item), 300);
                  }}
                >
                  <View style={styles.dayTaskTime}>
                    <Feather name="clock" size={14} color="#6B7280" />
                    <Text style={styles.dayTaskTimeText}>{timeStr}</Text>
                  </View>
                  
                  <Text style={[
                    styles.dayTaskTitle, 
                    isDone && styles.dayTaskTitleDone
                  ]} numberOfLines={2}>
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

export default function TasksScreen({ userData, username, onBack }) {
  const { isOnline } = useNetwork();
  const scrollViewRef = useRef(null); 
  
  const [selectedView, setSelectedView] = useState(3);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionStatus, setActionStatus] = useState(null);

  const [pastDaysView, setPastDaysView] = useState(null);

  const [fabExpanded, setFabExpanded] = useState(false);
  const fabScale = useState(new Animated.Value(1))[0];
  
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [selectedDayDate, setSelectedDayDate] = useState(null);
  const [selectedDayTasks, setSelectedDayTasks] = useState([]);

  const [allTasks, setAllTasks] = useState([]);
  const [projectFinishDate, setProjectFinishDate] = useState(null);
  const [projectId, setProjectId] = useState(null);

  const [zoomLevel, setZoomLevel] = useState(1);

  const prevOnline = usePrevious(isOnline);

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    let isActive = true; 

    const handleReconnection = async () => {
      if (prevOnline === false && isOnline === true) {
        try {
          setActionStatus('Sincronizando...');
          await SyncService.syncAllTasks(userData.uid);
          await SyncService.syncSurveys();
          if (isActive) await loadTasks();
        } catch (error) {
          console.error('❌ Error en auto-sincronización:', error);
        } finally {
          setActionStatus(null);
        }
      }
    };
    handleReconnection();
    return () => { isActive = false; };
  }, [isOnline, prevOnline]); 

  const getDaysToShow = () => {
    const today = new Date();
    const days = [];
    
    if (pastDaysView) {
      for (let i = pastDaysView; i > 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i); 
        days.push({
          date: date,
          dayName: date.toLocaleDateString('es-ES', { weekday: 'short' }),
          dayNumber: date.getDate(),
          dateString: getLocalDateString(date), 
          isPast: true 
        });
      }
    }

    for (let i = 0; i < selectedView; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push({
        date: date,
        dayName: date.toLocaleDateString('es-ES', { weekday: 'short' }),
        dayNumber: date.getDate(),
        dateString: getLocalDateString(date), 
        isPast: false,
        isToday: i === 0
      });
    }
    return days;
  };

  const days = getDaysToShow();
  
  const totalDays = days.length;
  let dayWidth = 140; 

  if (totalDays === 1) {
    dayWidth = SCREEN_WIDTH - 80; 
  } else if (totalDays <= 3) {
    dayWidth = (SCREEN_WIDTH - 60) / totalDays; 
  } else {
    dayWidth = 120; 
  }

  const HOUR_HEIGHT = BASE_HOUR_HEIGHT * zoomLevel;

  useEffect(() => {
    if (pastDaysView && scrollViewRef.current) {
      const xOffset = pastDaysView * dayWidth;
      
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: xOffset, animated: true });
      }, 100);
    } else if (!pastDaysView && scrollViewRef.current) {
      scrollViewRef.current?.scrollTo({ x: 0, animated: true });
    }
  }, [pastDaysView, dayWidth, selectedView]);

  const getStatusColor = () => {
    if (!isOnline) return '#504b4bff'; 
    if (actionStatus) return '#e8c39e'; 
    return '#64c27b'; 
  };

  const togglePastView = (daysCount) => {
    if (pastDaysView === daysCount) {
      setPastDaysView(null); 
    } else {
      setPastDaysView(daysCount); 
    }
  };

  const loadTasks = async () => {
    try {
      setActionStatus('Cargando...')
      const result = await SyncService.getAllVisibleTasks();
      setAllTasks(result.tasks);
      setProjectId(result.projectId);
    } catch (e) {
      console.error("Error cargando tareas:", e);
    } finally {
      setActionStatus(null)
    }
  };

  const handleRefresh = async () => {
    if (!isOnline) {
      Alert.alert('Sin conexión', 'Necesitas conexión a internet para sincronizar');
      return;
    }
    try {
      setRefreshing(true);
      setActionStatus('Sincronizando...');
      await SyncService.syncAll();
      await loadTasks();
    } catch (error) {
      console.error('❌ Error sincronizando:', error);
      Alert.alert('Error', 'No se pudo sincronizar.');
    } finally {
      setRefreshing(false);
      setActionStatus(null);
    }
  };

  const handleTaskCreated = async () => {
    await loadTasks();
    setCreateModalVisible(false);
  };

  const handleTaskUpdated = async () => {
    await loadTasks();
    setSelectedTask(null);
  };

  const handleDayHeaderPress = (dayDateString) => {
    const tasksOfDay = allTasks.filter(task => {
      if (!task.date_deadline) return false;
      const tDate = new Date(task.date_deadline.replace(' ', 'T') + (task.date_deadline.includes('Z') ? '' : 'Z'));
      return getLocalDateString(tDate) === dayDateString;
    });

    setSelectedDayDate(dayDateString);
    setSelectedDayTasks(tasksOfDay);
    setDayModalVisible(true);
  };

  const handleSlotPress = (slotTasks, dayDateString) => {
    if (!slotTasks || slotTasks.length === 0) return;
    if (slotTasks.length > 1) {
      setSelectedDayDate(dayDateString);
      setSelectedDayTasks(slotTasks);
      setDayModalVisible(true);
    } else {
      setSelectedTask(slotTasks[0]);
    }
  };

  const toggleFab = () => {
    const newExpanded = !fabExpanded;
    setFabExpanded(newExpanded);
    Animated.spring(fabScale, {
      toValue: newExpanded ? 1.1 : 1,
      useNativeDriver: true,
      friction: 3,
    }).start();
  };

  const getTasksForDayAndHour = (dayDateString, hour) => {
    return allTasks.filter(task => {
      if (!task.date_deadline) return false;
      
      let taskDateStr = task.date_deadline.replace(' ', 'T');
      if (!taskDateStr.endsWith('Z')) taskDateStr += 'Z';
      
      const taskDate = new Date(taskDateStr);
      
      const taskDayString = getLocalDateString(taskDate);
      const taskHour = taskDate.getHours();
      
      return taskDayString === dayDateString && taskHour === hour;
    });
  };

  const activeCount = allTasks.filter(t => 
    ['01_in_progress', '02_changes_requested', '03_approved', '04_waiting_normal'].includes(t.state)
  ).length;
  
  const doneCount = allTasks.filter(t => t.state === '1_done').length;

  return (
    <SafeAreaProvider style={styles.safeArea}>
      <View style={styles.container}>
        
        {/* FAB */}
        <Animated.View style={[styles.fabContainer, { transform: [{ scale: fabScale }] }]}>
          <TouchableOpacity 
            style={[styles.fabMain, {backgroundColor: getStatusColor()}]} 
            onPress={toggleFab}
            activeOpacity={0.8}
          >
            <Animated.View style={{
              transform: [{
                rotate: fabScale.interpolate({
                  inputRange: [1, 1.1],
                  outputRange: ['0deg', '45deg']
                })
              }]
            }}>
              <Feather name="plus" size={28} color="#fff" />
            </Animated.View>
          </TouchableOpacity>

          {fabExpanded && (
            <>
              <TouchableOpacity 
                style={[styles.fabOption, styles.fabBack, {backgroundColor: getStatusColor()}]}
                onPress={() => {
                  setFabExpanded(false);
                  onBack();
                }}
                activeOpacity={0.8}
              >
                <Feather name="arrow-left" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.fabOption, styles.fabAdd, {backgroundColor: getStatusColor()}]}
                onPress={() => {
                  setFabExpanded(false);
                  setCreateModalVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Feather name="file-plus" size={20} color="#fff" />
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

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
            <DashboardHeader 
              userName={username || 'Usuario'} 
              isOnline={isOnline} 
              actionStatus={actionStatus} 
            />

            {/* Stats */}
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

            {/* Controles de Vista */}
            <View style={styles.viewSelectorContainer}>
              <View style={styles.pastControlsContainer}>
                <Text style={styles.pastLabel}>Historial:</Text>
                <View style={styles.pastButtonsRow}>
                  <TouchableOpacity 
                    style={[
                      styles.pastButton, 
                      pastDaysView === 3 && styles.pastButtonActive
                    ]}
                    onPress={() => togglePastView(3)}
                  >
                    <Feather 
                      name="rewind" 
                      size={14} 
                      color={pastDaysView === 3 ? "#fff" : "#6B7280"} 
                    />
                    <Text style={[
                      styles.pastButtonText,
                      pastDaysView === 3 && styles.pastButtonTextActive
                    ]}>-3 Días</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[
                      styles.pastButton, 
                      pastDaysView === 7 && styles.pastButtonActive
                    ]}
                    onPress={() => togglePastView(7)}
                  >
                    <Feather 
                      name="rewind" 
                      size={14} 
                      color={pastDaysView === 7 ? "#fff" : "#6B7280"} 
                    />
                    <Text style={[
                      styles.pastButtonText,
                      pastDaysView === 7 && styles.pastButtonTextActive
                    ]}>- 1 Semana</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <ViewSelector selectedView={selectedView} onViewChange={setSelectedView} />
            </View>

            {/* Zoom */}
            <View style={styles.zoomControls}>
              <TouchableOpacity 
                style={styles.zoomButton}
                onPress={() => setZoomLevel(Math.max(MIN_ZOOM, zoomLevel - 0.2))}
              >
                <Feather name="zoom-out" size={18} color="#6B7280" />
              </TouchableOpacity>
              <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
              <TouchableOpacity 
                style={styles.zoomButton}
                onPress={() => setZoomLevel(Math.min(MAX_ZOOM, zoomLevel + 0.2))}
              >
                <Feather name="zoom-in" size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* CALENDARIO */}
            <ScrollView 
              horizontal 
              ref={scrollViewRef} 
              style={styles.calendarScroll} 
              showsHorizontalScrollIndicator={false}
            >
              <View style={styles.calendar}>
                {/* Columna de Horas */}
                <View style={styles.hoursColumn}>
                  <View style={[styles.headerCell, styles.emptyHeader]} />
                  {HOURS.map((hour) => (
                    <View key={hour} style={[styles.hourCell, { height: HOUR_HEIGHT }]}>
                      <Text style={styles.hourText}>
                        {hour.toString().padStart(2, '0')}:00
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Columnas de Días */}
                {days.map((day, dayIndex) => (
                  <View key={dayIndex} style={[styles.dayColumn, { width: dayWidth }]}>
                    <TouchableOpacity 
                      style={[
                        styles.headerCell, 
                        day.isPast && { backgroundColor: '#f0e6dd' },
                        day.isToday && { backgroundColor: '#e8f5e9', borderBottomColor: '#64c27b' }
                      ]}
                      onPress={() => handleDayHeaderPress(day.dateString)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dayName, day.isToday && { color: '#2e7d32' }]}>{day.dayName}</Text>
                      <Text style={[styles.dayNumber, day.isToday && { color: '#2e7d32' }]}>{day.dayNumber}</Text>
                    </TouchableOpacity>

                    {HOURS.map((hour) => {
                      const slotTasks = getTasksForDayAndHour(day.dateString, hour);
                      
                      return (
                        <TouchableOpacity
                          key={hour}
                          style={[
                            styles.timeSlot,
                            { height: HOUR_HEIGHT },
                            slotTasks.length > 0 && styles.timeSlotWithTasks
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
                                height: slotTasks.length === 1 
                                  ? HOUR_HEIGHT - 8 
                                  : (HOUR_HEIGHT / 2) - 6,
                                marginBottom: idx < slotTasks.slice(0, 2).length - 1 ? 3 : 0,
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

            {allTasks.length === 0 && (
              <View style={styles.emptyState}>
                <Feather name="calendar" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>No tienes tareas programadas</Text>
                <Text style={styles.emptySubtext}>
                  Toca el botón inferior para crear una nueva
                </Text>
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
          projectFinishDate={projectFinishDate}
          projectId={projectId}
          onClose={() => setCreateModalVisible(false)}
          onCreated={handleTaskCreated}
        />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f0ebff' },
  container: { flex: 1 },
  
  fabContainer: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    zIndex: 999,
  },
  fabMain: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#64c27b',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  fabOption: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 6,
  },
  fabBack: {
    backgroundColor: '#6B7280',
    bottom: 70,
    left: 4,
  },
  fabAdd: {
    backgroundColor: '#64c27b',
    bottom: 130,
    left: 4,
  },

  pastControlsContainer: {
    paddingBottom: 8,
    gap: 8,
  },
  pastLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  pastButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pastButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  pastButtonActive: {
    backgroundColor: '#64c27b', 
    borderColor: '#64c27b',
  },
  pastButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  pastButtonTextActive: {
    color: '#fff',
  },

  // Popup día
  dayModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  dayModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  dayModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dayModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'capitalize',
  },
  dayTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  dayTaskTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayTaskTimeText: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  dayTaskTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  dayTaskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  dayTaskClient: {
    fontSize: 12,
    color: '#9CA3AF',
    marginRight: 8,
  },
  dayTaskSeparator: {
    height: 1,
    backgroundColor: '#F3F4F6',
  },
  emptyDayTasks: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyDayTasksText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 12,
  },

  scrollView: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80, paddingBottom: 140 },
  mainCard: { marginBottom: 16 },
  
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: '#64c27b' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 2, textTransform: 'uppercase', fontWeight: '600' },

  viewSelectorContainer: { paddingHorizontal: 16, paddingVertical: 12 },

  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  zoomButton: { padding: 8 },
  zoomText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 50,
    textAlign: 'center',
  },
  
  calendarScroll: { flex: 1 },
  calendar: { flexDirection: 'row' },
  
  hoursColumn: { width: 60 },
  emptyHeader: { backgroundColor: 'transparent' },
  headerCell: { 
    height: 60, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderBottomWidth: 2, 
    borderBottomColor: '#E6E9EF', 
    backgroundColor: '#fcf8f4ff' 
  },
  dayName: { fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: '600' },
  dayNumber: { fontSize: 18, color: '#0B1B2A', fontWeight: '700', marginTop: 2 },
  hourCell: { justifyContent: 'center', paddingRight: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E6E9EF' },
  hourText: { fontSize: 12, color: '#9CA3AF', textAlign: 'right', fontWeight: '500' },
  
  dayColumn: { borderLeftWidth: 1, borderLeftColor: '#F3F4F6' },
  timeSlot: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6', padding: 2, backgroundColor: '#fff' },
  timeSlotWithTasks: { backgroundColor: '#F9FAFB' },
  
  moreTasksBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#64c27b',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'center',
    marginTop: 4,
    gap: 4,
  },
  moreTasksText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
});