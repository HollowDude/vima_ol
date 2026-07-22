import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions,
  RefreshControl, Alert, Modal, FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Card from '../../../core/components/Card';
import DashboardHeader from '../../../core/components/DashboardHeader';
import TaskCard from '../../../core/components/TaskCard';
import TaskDetailModal from '../../../core/components/TaskDetailModal';
import CreateTaskModal from '../../../core/components/CreateTaskModal';
import ScreenLayout from '../../../core/components/ScreenLayout';
import SelectionModal from '../../../core/components/SelectionModal';
import useNetwork from '../../../core/hooks/useNetwork';
import useSyncActions from '../../../core/hooks/useSyncActions';
import SyncService from '../../../core/sync/sync.service';
import { usePrevious } from '../../../core/hooks/usePrevious';

// ─── Constants ────────────────────────────────────────────────────────────────
const HOURS             = Array.from({ length: 24 }, (_, i) => i);
const WORK_HOURS_START  = 7;  // 7 AM
const WORK_HOURS_END    = 19; // 7 PM
const BASE_HOUR_HEIGHT  = 80;
const MIN_ZOOM          = 0.5;
const MAX_ZOOM          = 2;
const DAY_WIDTH         = 120;
const INITIAL_PAST_DAYS   = 3;
const INITIAL_FUTURE_DAYS = 3;
const PAGE_SIZE           = 50;

const TASK_STATES = [
  { id: '01_in_progress',       label: 'En Proceso',     color: '#64c27b', icon: 'play'        },
  { id: '02_changes_requested', label: 'Cambios Solic.', color: '#F59E0B', icon: 'alert-circle' },
  { id: '03_approved',          label: 'Aprobado',       color: '#10B981', icon: 'check-circle' },
  { id: '04_waiting_normal',    label: 'En Espera',      color: '#9CA3AF', icon: 'clock'        },
  { id: '1_done',               label: 'Hecho',          color: '#22c55e', icon: 'check'        },
  { id: '1_canceled',           label: 'Cancelado',      color: '#EF4444', icon: 'x-circle'     },
];

const PRIORITY_OPTS = [
  { id: 'alta',  label: 'Alta',  color: '#EF4444', icon: 'alert-triangle' },
  { id: 'media', label: 'Media', color: '#F59E0B', icon: 'minus'          },
  { id: 'baja',  label: 'Baja',  color: '#64c27b', icon: 'chevron-down'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getLocalDateString = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getEndOfMonthDate = (dateStr) => {
  const d = new Date(dateStr);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

const formatDateStr = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
};

const parseDeadline = (dateStr) => {
  if (!dateStr) return null;
  let s = dateStr.replace(' ', 'T');
  if (!s.endsWith('Z')) s += 'Z';
  return new Date(s);
};

// ─── TaskListItem ─────────────────────────────────────────────────────────────
function TaskListItem({ task, tags, currentUserId, isHistorical, onPress }) {
  const stateInfo  = TASK_STATES.find(s => s.id === task.state) || TASK_STATES[0];
  const pColors    = { alta: '#EF4444', media: '#F59E0B', baja: '#64c27b' };
  const pColor     = pColors[task.priority_level] || '#D1D5DB';
  const clientName = Array.isArray(task.partner_id) ? task.partner_id[1] : null;
  const userIds    = Array.isArray(task.user_ids) ? task.user_ids : [];
  const isMine     = userIds.includes(Number(currentUserId));
  const userLabel  = userIds.length === 0
    ? null
    : userIds.length === 1 && isMine ? 'Yo'
    : isMine                          ? `Yo +${userIds.length - 1}`
    :                                   `${userIds.length} asig.`;

  const deadline   = parseDeadline(task.date_deadline);
  const isOverdue  = deadline && deadline < new Date()
    && task.state !== '1_done'
    && task.state !== '1_canceled';
  const deadlineStr = deadline
    ? deadline.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  const taskTags  = tags.filter(t =>
    Array.isArray(task.management_tags) && task.management_tags.includes(t.id),
  );
  const isDone = task.state === '1_done';

  return (
    <TouchableOpacity
      style={[styles.listItem, isDone && styles.listItemDone]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.listItemStripe, { backgroundColor: pColor }]} />
      <View style={styles.listItemBody}>
        <View style={styles.listItemTitleRow}>
          <Text
            style={[styles.listItemTitle, isDone && styles.listItemTitleDone]}
            numberOfLines={2}
          >
            {task.display_name || task.name}
          </Text>
          {isHistorical && (
            <View style={styles.listHistBadge}>
              <Feather name="archive" size={9} color="#92400E" />
            </View>
          )}
        </View>
        <View style={styles.listItemMeta}>
          {clientName && (
            <View style={styles.listMetaChip}>
              <Feather name="user" size={11} color="#9CA3AF" />
              <Text style={styles.listMetaText} numberOfLines={1}>{clientName}</Text>
            </View>
          )}
          {userLabel && (
            <View style={styles.listMetaChip}>
              <Feather name="users" size={11} color="#9CA3AF" />
              <Text style={styles.listMetaText}>{userLabel}</Text>
            </View>
          )}
          {deadlineStr && (
            <View style={styles.listMetaChip}>
              <Feather
                name="clock"
                size={11}
                color={isOverdue ? '#EF4444' : '#9CA3AF'}
              />
              <Text style={[styles.listMetaText, isOverdue && styles.listMetaOverdue]}>
                {deadlineStr}
              </Text>
            </View>
          )}
        </View>
        {taskTags.length > 0 && (
          <View style={styles.listTagsRow}>
            {taskTags.slice(0, 3).map(tag => (
              <View key={tag.id} style={styles.listTag}>
                <Text style={styles.listTagText}>{tag.name}</Text>
              </View>
            ))}
            {taskTags.length > 3 && (
              <Text style={styles.listTagMore}>+{taskTags.length - 3}</Text>
            )}
          </View>
        )}
      </View>
      <View style={[styles.listItemStateIcon, { backgroundColor: stateInfo.color + '18' }]}>
        <Feather name={stateInfo.icon} size={14} color={stateInfo.color} />
      </View>
    </TouchableOpacity>
  );
}

// ─── StateGroupHeader ─────────────────────────────────────────────────────────
function StateGroupHeader({ stateInfo, count, collapsed, onToggle }) {
  return (
    <TouchableOpacity
      style={[styles.groupHeader, { borderLeftColor: stateInfo.color }]}
      onPress={onToggle}
      activeOpacity={0.7}
    >
      <View style={styles.groupHeaderLeft}>
        <View style={[styles.groupDot, { backgroundColor: stateInfo.color }]} />
        <Text style={styles.groupHeaderLabel}>{stateInfo.label}</Text>
        <View style={[styles.groupCountBadge, { backgroundColor: stateInfo.color + '20' }]}>
          <Text style={[styles.groupCountText, { color: stateInfo.color }]}>{count}</Text>
        </View>
      </View>
      <Feather
        name={collapsed ? 'chevron-right' : 'chevron-down'}
        size={17}
        color="#9CA3AF"
      />
    </TouchableOpacity>
  );
}

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
                    (item.date_deadline.includes('Z') ? '' : 'Z'),
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
export default function TasksScreen({ userData, username, onBack, onLogout, onNavigateToLeads, onNavigateToSyncHistory }) {
  const { isOnline }            = useNetwork();
  const { syncAll, syncModule } = useSyncActions();
  const scrollViewRef           = useRef(null);
  const scrollXRef              = useRef(0);

  // ── State general ────────────────────────────────────────────────────────────
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
  const [managementTags, setManagementTags]     = useState([]);

  // ── View mode ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState('calendar');

  // ── List view filters ────────────────────────────────────────────────────────
  const [listStateFilter,   setListStateFilter]   = useState(null);
  const [listCollapsed,     setListCollapsed]      = useState({});
  const [listSearch,        setListSearch]         = useState('');
  const [listSearchVisible, setListSearchVisible]  = useState(false);
  const [listPriorityFilter,setListPriorityFilter] = useState(null);
  const [listTagFilter,     setListTagFilter]      = useState(null);
  const [listVisibleCount,  setListVisibleCount]   = useState(PAGE_SIZE);

  // ── Client filter ─────────────────────────────────────────────────────────────
  const [clientFilter,          setClientFilter]          = useState(null);
  const [ownClients,            setOwnClients]            = useState([]);
  const [showClientFilterModal, setShowClientFilterModal] = useState(false);

  // ── Calendar: days / extended tasks ─────────────────────────────────────────
  const [pastDays,   setPastDays]   = useState(INITIAL_PAST_DAYS);
  const [futureDays, setFutureDays] = useState(INITIAL_FUTURE_DAYS);
  const [extendedTasks,    setExtendedTasks]    = useState([]);
  const [loadingExtended,  setLoadingExtended]  = useState(false);
  const [visibleMonth,     setVisibleMonth]     = useState('');
  const [projectDateStart, setProjectDateStart] = useState(null);
  const [projectDateEnd,   setProjectDateEnd]   = useState(null);
  const [showAllHours,     setShowAllHours]     = useState(false);

  const prevOnline  = usePrevious(isOnline);
  const HOUR_HEIGHT = BASE_HOUR_HEIGHT * zoomLevel;

  // ── Derived: unified tasks ────────────────────────────────────────────────────
  const allVisibleTasks = useMemo(() => {
    const localIds = new Set(allTasks.map(t => t.id));
    return [...allTasks, ...extendedTasks.filter(t => !localIds.has(t.id))];
  }, [allTasks, extendedTasks]);

  const extendedTaskIds = useMemo(() => {
    const projectTaskIds = new Set(allTasks.map(t => t.id));
    return new Set(
      extendedTasks.filter(t => !projectTaskIds.has(t.id)).map(t => t.id),
    );
  }, [allTasks, extendedTasks]);

  const cachedDatesSet = useMemo(() => {
    const set = new Set();
    extendedTasks.forEach(t => {
      const d = parseDeadline(t.date_deadline);
      if (d) set.add(getLocalDateString(d));
    });
    return set;
  }, [extendedTasks]);

  // ── Horarios a mostrar (filtrados o completos) ──────────────────────────────
  const hoursToShow = useMemo(() => {
    if (showAllHours) {
      return HOURS;
    }
    return HOURS.filter(h => h >= WORK_HOURS_START && h <= WORK_HOURS_END);
  }, [showAllHours]);

  // ── Client-filtered tasks (applied to both calendar and list) ─────────────────
  const clientFilteredTasks = useMemo(() => {
    if (!clientFilter) return allVisibleTasks;
    return allVisibleTasks.filter(task => {
      const taskPartnerId = Array.isArray(task.partner_id)
        ? task.partner_id[0]
        : task.partner_id;
      return taskPartnerId === clientFilter.id;
    });
  }, [allVisibleTasks, clientFilter]);

  // ── List view derived ─────────────────────────────────────────────────────────
  const listFilteredTasks = useMemo(() => {
    let result = [...clientFilteredTasks];
    if (listStateFilter) {
      result = result.filter(t => t.state === listStateFilter);
    }
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      result = result.filter(t =>
        (t.display_name || t.name || '').toLowerCase().includes(q) ||
        (Array.isArray(t.partner_id) ? t.partner_id[1] : '').toLowerCase().includes(q),
      );
    }
    if (listPriorityFilter) {
      result = result.filter(t => t.priority_level === listPriorityFilter);
    }
    if (listTagFilter) {
      result = result.filter(t =>
        Array.isArray(t.management_tags) && t.management_tags.includes(listTagFilter),
      );
    }
    return result;
  }, [clientFilteredTasks, listStateFilter, listSearch, listPriorityFilter, listTagFilter]);

  const listGroupedTasks = useMemo(() => {
    if (listStateFilter) return null;
    return TASK_STATES
      .map(state => ({
        state,
        tasks: listFilteredTasks.filter(t => t.state === state.id),
      }))
      .filter(g => g.tasks.length > 0);
  }, [listFilteredTasks, listStateFilter]);

  // ── Effects ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadTasks();
    SyncService.cleanExpiredExtendedTasks();
    setVisibleMonth(new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }));
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

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadTasks = async () => {
    try {
      const [result, tags, clients] = await Promise.all([
        SyncService.getAllVisibleTasks(),
        SyncService.getManagementTags(),
        SyncService.getOwnClients(),
      ]);

      setAllTasks(result.tasks);
      setProjectId(result.projectId);
      setManagementTags(tags || []);
      setOwnClients(clients || []);

      if (result.projectFinishDate) {
        setProjectDateEnd(result.projectFinishDate);
      }

      const taskDates = result.tasks
        .filter(t => t.date_deadline)
        .map(t => parseDeadline(t.date_deadline));

      if (taskDates.length > 0) {
        const minTs = Math.min(...taskDates.map(d => d.getTime()));
        setProjectDateStart(getLocalDateString(new Date(minTs)));
        if (!result.projectFinishDate) {
          const maxTs = Math.max(...taskDates.map(d => d.getTime()));
          setProjectDateEnd(getLocalDateString(new Date(maxTs)));
        }
      } else {
        const project = await SyncService.getMasterData('current_project');
        if (project?.date_start) {
          setProjectDateStart(project.date_start);
          if (!result.projectFinishDate) {
            setProjectDateEnd(getLocalDateString(getEndOfMonthDate(project.date_start)));
          }
        }
      }

      const cached = await SyncService.getExtendedTasks();
      setExtendedTasks(cached);
    } catch (e) {
      console.error('Error cargando tareas:', e);
    }
  };

  // ── Extended task fetch ───────────────────────────────────────────────────────
  const fetchExtendedTasks = async (fromStr, toStr, direction) => {
    if (!isOnline) {
      const cached = await SyncService.getExtendedTasks();
      if (cached.length > 0) {
        const allBoundTasks = [...allTasks, ...cached];
        const accessibleDates = allBoundTasks
          .filter(t => t.date_deadline)
          .map(t => getLocalDateString(parseDeadline(t.date_deadline)))
          .sort();
        const minAccessible = accessibleDates[0];
        const maxAccessible = accessibleDates[accessibleDates.length - 1];
        if (direction === 'past' && toStr < minAccessible) {
          Alert.alert('Límite offline', `Sin conexión puedes retroceder hasta el ${formatDateStr(minAccessible)}.`, [{ text: 'Entendido' }]);
          return false;
        }
        if (direction === 'future' && fromStr > maxAccessible) {
          Alert.alert('Límite offline', `Sin conexión puedes avanzar hasta el ${formatDateStr(maxAccessible)}.`, [{ text: 'Entendido' }]);
          return false;
        }
        setExtendedTasks(cached);
        return true;
      }
      Alert.alert('Sin conexión', `Necesitas conexión para cargar tareas ${direction === 'past' ? 'anteriores' : 'futuras'} al proyecto actual.`, [{ text: 'Entendido' }]);
      return false;
    }
    setLoadingExtended(true);
    try {
      const tasks = await SyncService.fetchAndCacheTasksForRange(fromStr, toStr);
      setExtendedTasks(prev => {
        const existing = new Set([...allTasks.map(t => t.id), ...prev.map(t => t.id)]);
        return [...prev, ...tasks.filter(t => !existing.has(t.id))];
      });
      return true;
    } catch (e) {
      Alert.alert('Error', 'No se pudieron cargar las tareas del periodo solicitado.');
      return false;
    } finally {
      setLoadingExtended(false);
    }
  };

  const parseLocalDate = (dateStr) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const handleLoadPastDays = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newPastDays     = pastDays + 7;
    const newEarliestDate = new Date(today);
    newEarliestDate.setDate(today.getDate() - newPastDays);
    const projectStartDate = parseLocalDate(projectDateStart);
    const needsExtended    = projectStartDate && newEarliestDate < projectStartDate;

    if (!needsExtended) {
      const compensation = 7 * DAY_WIDTH;
      setPastDays(newPastDays);
      setTimeout(() => { scrollViewRef.current?.scrollTo({ x: scrollXRef.current + compensation, animated: false }); }, 80);
      return;
    }
    if (!isOnline) {
      const daysFromStart = projectStartDate ? Math.ceil((today - projectStartDate) / 86400000) : 0;
      if (pastDays < daysFromStart) {
        const compensation = (daysFromStart - pastDays) * DAY_WIDTH;
        setPastDays(daysFromStart);
        setTimeout(() => { scrollViewRef.current?.scrollTo({ x: scrollXRef.current + compensation, animated: false }); }, 80);
        return;
      }
      const cached = await SyncService.getExtendedTasks();
      if (cached.length > 0) {
        const dates = [...allTasks, ...cached].filter(t => t.date_deadline)
          .map(t => getLocalDateString(parseDeadline(t.date_deadline))).sort();
        const minCachedDate    = dates[0];
        const currentStartDate = getLocalDateString(new Date(today.getTime() - pastDays * 86400000));
        if (currentStartDate > minCachedDate) {
          const compensation = 7 * DAY_WIDTH;
          setPastDays(newPastDays);
          setExtendedTasks(cached);
          setTimeout(() => { scrollViewRef.current?.scrollTo({ x: scrollXRef.current + compensation, animated: false }); }, 80);
          return;
        }
        Alert.alert('Límite offline', `Sin conexión puedes retroceder hasta el ${formatDateStr(minCachedDate)}.`, [{ text: 'Entendido' }]);
        return;
      }
      Alert.alert('Sin conexión', 'Necesitas conexión para cargar tareas de periodos anteriores.', [{ text: 'Entendido' }]);
      return;
    }
    const dayBeforeProjectStart = projectStartDate
      ? new Date(projectStartDate.getTime() - 86400000)
      : new Date(today.getTime() - (pastDays + 1) * 86400000);
    const prevEarliestMinus1 = new Date(today);
    prevEarliestMinus1.setDate(today.getDate() - pastDays - 1);
    const fetchToDate = prevEarliestMinus1 < dayBeforeProjectStart ? prevEarliestMinus1 : dayBeforeProjectStart;
    const fromStr = getLocalDateString(newEarliestDate);
    const toStr   = getLocalDateString(fetchToDate);
    if (fromStr <= toStr) {
      const canProceed = await fetchExtendedTasks(fromStr, toStr, 'past');
      if (!canProceed) return;
    }
    const compensation = 7 * DAY_WIDTH;
    setPastDays(newPastDays);
    setTimeout(() => { scrollViewRef.current?.scrollTo({ x: scrollXRef.current + compensation, animated: false }); }, 80);
  };

  const handleLoadFutureDays = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newFutureDays = futureDays + 7;
    const newLatestDate = new Date(today);
    newLatestDate.setDate(today.getDate() + newFutureDays);
    const projectEndDate = parseLocalDate(projectDateEnd);
    const needsExtended  = projectEndDate && newLatestDate > projectEndDate;

    if (!needsExtended) { setFutureDays(newFutureDays); return; }
    if (!isOnline) {
      const daysToEnd = projectEndDate ? Math.ceil((projectEndDate - today) / 86400000) : 0;
      if (futureDays < daysToEnd) { setFutureDays(daysToEnd); return; }
      const cached = await SyncService.getExtendedTasks();
      if (cached.length > 0) {
        const dates = [...allTasks, ...cached].filter(t => t.date_deadline)
          .map(t => getLocalDateString(parseDeadline(t.date_deadline))).sort();
        const maxCachedDate  = dates[dates.length - 1];
        const currentEndDate = getLocalDateString(new Date(today.getTime() + futureDays * 86400000));
        if (currentEndDate < maxCachedDate) { setFutureDays(newFutureDays); setExtendedTasks(cached); return; }
        Alert.alert('Límite offline', `Sin conexión puedes avanzar hasta el ${formatDateStr(maxCachedDate)}.`, [{ text: 'Entendido' }]);
        return;
      }
      Alert.alert('Sin conexión', 'Necesitas conexión para cargar tareas de periodos posteriores.', [{ text: 'Entendido' }]);
      return;
    }
    const dayAfterProjectEnd = projectEndDate
      ? new Date(projectEndDate.getTime() + 86400000)
      : new Date(today.getTime() + (futureDays + 1) * 86400000);
    const prevLatestPlus1 = new Date(today);
    prevLatestPlus1.setDate(today.getDate() + futureDays + 1);
    const fetchFromDate = prevLatestPlus1 > dayAfterProjectEnd ? prevLatestPlus1 : dayAfterProjectEnd;
    const fromStr = getLocalDateString(fetchFromDate);
    const toStr   = getLocalDateString(newLatestDate);
    if (fromStr <= toStr) {
      const canProceed = await fetchExtendedTasks(fromStr, toStr, 'future');
      if (!canProceed) return;
    }
    setFutureDays(newFutureDays);
  };

  // ── Calendar helpers ──────────────────────────────────────────────────────────
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

  const handleCalendarScroll = (e) => {
    const x = e.nativeEvent.contentOffset.x;
    scrollXRef.current = x;
    const screenWidth   = Dimensions.get('window').width;
    const centerOffset  = x + (screenWidth - 60) / 2;
    const centerDayIdx  = Math.round(centerOffset / DAY_WIDTH);
    const clampedIdx    = Math.max(0, Math.min(centerDayIdx, days.length - 1));
    const centerDay     = days[clampedIdx];
    if (centerDay) {
      const label = centerDay.date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      setVisibleMonth(prev => (prev !== label ? label : prev));
    }
  };

  // Uses clientFilteredTasks so the calendar respects the client filter
  const getTasksForDayAndHour = (dayDateString, hour) =>
    clientFilteredTasks.filter(task => {
      const d = parseDeadline(task.date_deadline);
      return d && getLocalDateString(d) === dayDateString && d.getHours() === hour;
    });

  // ── Data actions ──────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (!isOnline) { Alert.alert('Sin conexión', 'Necesitas internet para sincronizar'); return; }
    try { setRefreshing(true); await syncAll(); await loadTasks(); }
    finally { setRefreshing(false); }
  };

  const handleTaskCreated = async () => { await loadTasks(); setCreateModal(false); };
  const handleTaskUpdated = async (opts = {}) => {
    await loadTasks();
    if (!opts?.keepModalOpen) setSelectedTask(null);
  };

  const handleDayHeaderPress = (dayDateString) => {
    const dayTasks = clientFilteredTasks.filter(task => {
      const d = parseDeadline(task.date_deadline);
      return d && getLocalDateString(d) === dayDateString;
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

  // ── Stats (use clientFilteredTasks so numbers reflect the filter) ─────────────
  const activeCount = clientFilteredTasks.filter(t =>
    ['01_in_progress', '02_changes_requested', '03_approved', '04_waiting_normal'].includes(t.state),
  ).length;
  const doneCount = clientFilteredTasks.filter(t => t.state === '1_done').length;

  // ── List view helpers ─────────────────────────────────────────────────────────
  const getStateCount = (stateId) => clientFilteredTasks.filter(t => t.state === stateId).length;

  const toggleGroup = (stateId) => {
    setListCollapsed(prev => ({ ...prev, [stateId]: !prev[stateId] }));
  };

  const clearAllListFilters = () => {
    setListStateFilter(null);
    setListSearch('');
    setListSearchVisible(false);
    setListPriorityFilter(null);
    setListTagFilter(null);
    setListVisibleCount(PAGE_SIZE);
  };

  const hasActiveListFilters = !!(listStateFilter || listSearch.trim() || listPriorityFilter || listTagFilter);

  // ── renderActionBar ────────────────────────────────────────────────────────────
  const renderActionBar = () => (
    <View style={styles.actionBar}>
      {/* View toggle */}
      <View style={styles.viewToggleGroup}>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'calendar' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('calendar')}
          activeOpacity={0.8}
        >
          <Feather name="calendar" size={14} color={viewMode === 'calendar' ? '#fff' : '#9CA3AF'} />
          <Text style={[styles.viewToggleBtnTxt, viewMode === 'calendar' && styles.viewToggleBtnTxtActive]}>
            Calendario
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewToggleBtn, viewMode === 'list' && styles.viewToggleBtnActive]}
          onPress={() => setViewMode('list')}
          activeOpacity={0.8}
        >
          <Feather name="list" size={14} color={viewMode === 'list' ? '#fff' : '#9CA3AF'} />
          <Text style={[styles.viewToggleBtnTxt, viewMode === 'list' && styles.viewToggleBtnTxtActive]}>
            Lista
          </Text>
        </TouchableOpacity>
      </View>

      {/* Client filter button */}
      <TouchableOpacity
        style={[styles.clientFilterBtn, clientFilter && styles.clientFilterBtnActive]}
        onPress={() => setShowClientFilterModal(true)}
        activeOpacity={0.8}
      >
        <Feather name="user" size={13} color={clientFilter ? '#fff' : '#6B7280'} />
        <Text
          style={[styles.clientFilterBtnTxt, clientFilter && styles.clientFilterBtnTxtActive]}
          numberOfLines={1}
        >
          {clientFilter ? clientFilter.name : 'Cliente'}
        </Text>
        {clientFilter && (
          <TouchableOpacity
            onPress={() => setClientFilter(null)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={12} color="#fff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );

  // ── Render: List View ─────────────────────────────────────────────────────────
  const renderListView = () => {
    const total         = listFilteredTasks.length;
    const flatVisible   = listStateFilter ? listFilteredTasks.slice(0, listVisibleCount) : null;
    const hasMoreFlat   = listStateFilter && listFilteredTasks.length > listVisibleCount;
    const showingFrom   = 1;
    const showingTo     = flatVisible ? flatVisible.length : total;

    return (
      <View style={styles.listViewContainer}>
        {/* ── 1. State cards strip ─────────────────────────────────────── */}
        <View style={styles.listStateSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listStateScroll}
          >
            {TASK_STATES.map(state => {
              const count    = getStateCount(state.id);
              if (count === 0) return null;
              const isActive = listStateFilter === state.id;
              return (
                <TouchableOpacity
                  key={state.id}
                  style={[
                    styles.listStateCard,
                    isActive && styles.listStateCardActive,
                    { borderTopColor: state.color },
                  ]}
                  onPress={() => {
                    setListStateFilter(prev => prev === state.id ? null : state.id);
                    setListVisibleCount(PAGE_SIZE);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.listStateCardTop}>
                    <View style={[styles.listStateIndicator, { backgroundColor: state.color }]} />
                    <Text style={[styles.listStateCardCount, { color: state.color }]}>{count}</Text>
                  </View>
                  <Text style={styles.listStateCardName} numberOfLines={2}>{state.label}</Text>
                  {isActive && (
                    <View style={[styles.listStateArrow, { borderTopColor: state.color }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.listStateSummaryRow}>
            <Text style={styles.listStateSummaryText}>
              {clientFilteredTasks.length} tarea{clientFilteredTasks.length !== 1 ? 's' : ''}
              {clientFilter ? ` de ${clientFilter.name}` : ' en total'}
            </Text>
            {hasActiveListFilters && (
              <TouchableOpacity style={styles.listClearAllBtn} onPress={clearAllListFilters}>
                <Feather name="x" size={12} color="#EF4444" />
                <Text style={styles.listClearAllTxt}>Limpiar filtros</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* ── 2. Filter bar ────────────────────────────────────────────── */}
        <View style={styles.listFilterBar}>
          <TouchableOpacity
            style={[styles.listFilterChip, listSearchVisible && styles.listFilterChipActive]}
            onPress={() => {
              setListSearchVisible(v => !v);
              if (listSearchVisible) setListSearch('');
            }}
          >
            <Feather name="search" size={13} color={listSearchVisible ? '#fff' : '#6B7280'} />
            <Text style={[styles.listFilterChipTxt, listSearchVisible && styles.listFilterChipTxtActive]}>
              {listSearch ? `"${listSearch.slice(0, 10)}${listSearch.length > 10 ? '…' : ''}"` : 'Buscar'}
            </Text>
          </TouchableOpacity>

          {PRIORITY_OPTS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.listFilterChip,
                listPriorityFilter === p.id && { backgroundColor: p.color, borderColor: p.color },
              ]}
              onPress={() => setListPriorityFilter(prev => prev === p.id ? null : p.id)}
            >
              <Feather
                name={p.icon}
                size={13}
                color={listPriorityFilter === p.id ? '#fff' : p.color}
              />
              {listPriorityFilter === p.id && (
                <Text style={[styles.listFilterChipTxt, styles.listFilterChipTxtActive]}>
                  {p.label}
                </Text>
              )}
            </TouchableOpacity>
          ))}

          {managementTags.length > 0 && (
            <TouchableOpacity
              style={[styles.listFilterChip, listTagFilter != null && styles.listFilterChipActive]}
              onPress={() => {
                const tagIds     = managementTags.map(t => t.id);
                const currentIdx = tagIds.indexOf(listTagFilter);
                const nextTag    = currentIdx === -1
                  ? tagIds[0]
                  : currentIdx === tagIds.length - 1 ? null : tagIds[currentIdx + 1];
                setListTagFilter(nextTag);
              }}
            >
              <Feather name="tag" size={13} color={listTagFilter != null ? '#fff' : '#6B7280'} />
              <Text style={[styles.listFilterChipTxt, listTagFilter != null && styles.listFilterChipTxtActive]}>
                {listTagFilter != null
                  ? managementTags.find(t => t.id === listTagFilter)?.name ?? 'Etiqueta'
                  : 'Etiqueta'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 3. Search bar (expanded) ──────────────────────────────────── */}
        {listSearchVisible && (
          <View style={styles.listSearchBar}>
            <Feather name="search" size={16} color="#9CA3AF" />
            <TextInput
              style={styles.listSearchInput}
              value={listSearch}
              onChangeText={setListSearch}
              placeholder="Buscar por título o cliente..."
              placeholderTextColor="#9CA3AF"
              autoFocus
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {listSearch.length > 0 && (
              <TouchableOpacity onPress={() => setListSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x-circle" size={16} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ── 4. Pagination / counter header ───────────────────────────── */}
        <View style={styles.listPagHeader}>
          {listStateFilter ? (
            <>
              <View style={styles.listActiveStatePill}>
                <View style={[styles.listActiveStateDot, {
                  backgroundColor: TASK_STATES.find(s => s.id === listStateFilter)?.color,
                }]} />
                <Text style={styles.listActiveStateTxt}>
                  {TASK_STATES.find(s => s.id === listStateFilter)?.label}
                </Text>
                <TouchableOpacity
                  onPress={() => { setListStateFilter(null); setListVisibleCount(PAGE_SIZE); }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Feather name="x" size={13} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <Text style={styles.listPagCount}>
                {showingFrom}–{showingTo} / {total}
              </Text>
            </>
          ) : (
            <Text style={styles.listPagCount}>
              {total} resultado{total !== 1 ? 's' : ''}
              {hasActiveListFilters ? ' (filtrado)' : ''}
            </Text>
          )}
        </View>

        {/* ── 5. Task content ──────────────────────────────────────────── */}
        {total === 0 ? (
          <View style={styles.listEmptyState}>
            <Feather name="inbox" size={40} color="#D1D5DB" />
            <Text style={styles.listEmptyTitle}>Sin resultados</Text>
            <Text style={styles.listEmptySubtitle}>
              {clientFilter
                ? `No hay tareas para ${clientFilter.name}${hasActiveListFilters ? ' con estos filtros.' : '.'}`
                : hasActiveListFilters
                ? 'Prueba cambiando o eliminando los filtros activos.'
                : 'No hay tareas disponibles para el proyecto actual.'}
            </Text>
          </View>
        ) : listStateFilter ? (
          <View>
            {flatVisible.map((task) => (
              <TaskListItem
                key={task.id}
                task={task}
                tags={managementTags}
                currentUserId={userData?.uid}
                isHistorical={extendedTaskIds.has(task.id)}
                onPress={() => setSelectedTask(task)}
              />
            ))}
            {hasMoreFlat && (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => setListVisibleCount(v => v + PAGE_SIZE)}
              >
                <Text style={styles.loadMoreBtnTxt}>
                  Cargar {Math.min(PAGE_SIZE, listFilteredTasks.length - listVisibleCount)} más
                </Text>
                <Text style={styles.loadMoreBtnCount}>
                  {listFilteredTasks.length - listVisibleCount} restantes
                </Text>
                <Feather name="chevron-down" size={16} color="#64c27b" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          listGroupedTasks.map(({ state, tasks: groupTasks }) => {
            const isCollapsed     = !!listCollapsed[state.id];
            const visibleInGroup  = isCollapsed ? [] : groupTasks.slice(0, PAGE_SIZE);
            const hasMoreInGroup  = !isCollapsed && groupTasks.length > PAGE_SIZE;

            return (
              <View key={state.id} style={styles.stateGroup}>
                <StateGroupHeader
                  stateInfo={state}
                  count={groupTasks.length}
                  collapsed={isCollapsed}
                  onToggle={() => toggleGroup(state.id)}
                />
                {!isCollapsed && (
                  <View>
                    {visibleInGroup.map(task => (
                      <TaskListItem
                        key={task.id}
                        task={task}
                        tags={managementTags}
                        currentUserId={userData?.uid}
                        isHistorical={extendedTaskIds.has(task.id)}
                        onPress={() => setSelectedTask(task)}
                      />
                    ))}
                    {hasMoreInGroup && (
                      <TouchableOpacity
                        style={styles.groupLoadMoreBtn}
                        onPress={() => {
                          setListStateFilter(state.id);
                          setListVisibleCount(PAGE_SIZE * 2);
                        }}
                      >
                        <Feather name="list" size={14} color="#64c27b" />
                        <Text style={styles.groupLoadMoreTxt}>
                          Ver los {groupTasks.length} en "{state.label}"
                        </Text>
                        <Feather name="arrow-right" size={14} color="#64c27b" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </View>
    );
  };

  // ── FAB actions ───────────────────────────────────────────────────────────────
  const fabActions = [
    { icon: 'more-vertical', onPress: () => {}                   },
    { icon: 'menu',          onPress: () => setMenuVisible(true) },
    { icon: 'file-plus',     onPress: () => setCreateModal(true) },
    { icon: 'arrow-left',    onPress: onBack                     },
  ];

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <ScreenLayout
      userData={userData}
      username={username}
      onLogout={onLogout}
      menuVisible={menuVisible}
      setMenuVisible={setMenuVisible}
      fabActions={fabActions}
      onNavigateToSyncHistory={onNavigateToSyncHistory}
    >
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

            {/* ── Stats bar ── */}
            <View style={styles.statsBar}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{activeCount}</Text>
                <Text style={styles.statLabel}>Activas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{doneCount}</Text>
                <Text style={styles.statLabel}>Finalizadas</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{clientFilteredTasks.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
            </View>

            {/* ── ActionBar: view toggle + client filter ── */}
            {renderActionBar()}

            {/* ── Calendar view ── */}
            {viewMode === 'calendar' && (
              <>
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

                {visibleMonth !== '' && (
                  <View style={styles.monthIndicator}>
                    <Feather name="calendar" size={13} color="#64c27b" />
                    <Text style={styles.monthIndicatorText}>{visibleMonth}</Text>
                    {clientFilter && (
                      <View style={styles.calendarClientBadge}>
                        <Feather name="user" size={11} color="#fff" />
                        <Text style={styles.calendarClientBadgeText} numberOfLines={1}>
                          {clientFilter.name}
                        </Text>
                      </View>
                    )}
                    {/* ── NUEVO: Botón para toggle de horarios completos ── */}
                    <TouchableOpacity
                      style={styles.hoursToggleBtn}
                      onPress={() => setShowAllHours(prev => !prev)}
                      activeOpacity={0.7}
                    >
                      <Feather 
                        name={showAllHours ? "eye-off" : "eye"} 
                        size={12} 
                        color="#6B7280" 
                      />
                      <Text style={styles.hoursToggleBtnText}>
                        {showAllHours ? '7am-7pm' : '24h'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

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
                    {/* Hours column */}
                    <View style={styles.hoursColumn}>
                      <TouchableOpacity
                        style={[styles.cornerButton, loadingExtended && styles.cornerButtonDisabled]}
                        onPress={loadingExtended ? undefined : handleLoadPastDays}
                        activeOpacity={loadingExtended ? 1 : 0.75}
                      >
                        {loadingExtended ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Feather name="skip-back" size={18} color="#fff" />
                        )}
                      </TouchableOpacity>
                      {hoursToShow.map(hour => (
                        <View key={hour} style={[styles.hourCell, { height: HOUR_HEIGHT }]}>
                          <Text style={styles.hourText}>
                            {hour.toString().padStart(2, '0')}:00
                          </Text>
                        </View>
                      ))}
                    </View>

                    {/* Day columns */}
                    {days.map((day, dayIndex) => {
                      const isCached = cachedDatesSet.has(day.dateString);
                      const isFuture = !day.isPast && !day.isToday;
                      return (
                        <View key={dayIndex} style={[styles.dayColumn, { width: DAY_WIDTH }]}>
                          <TouchableOpacity
                            style={[
                              styles.headerCell,
                              day.isPast  && styles.headerPast,
                              isFuture    && styles.headerFuture,
                              day.isToday && styles.headerToday,
                              (projectDateStart && day.dateString < projectDateStart) ||
                              (projectDateEnd   && day.dateString > projectDateEnd)
                                ? styles.headerOutOfProject
                                : null,
                            ]}
                            onPress={() => handleDayHeaderPress(day.dateString)}
                            activeOpacity={0.7}
                          >
                            <Text style={[
                              styles.dayName,
                              day.isPast  && styles.dayNamePast,
                              isFuture    && styles.dayNameFuture,
                              day.isToday && styles.dayNameToday,
                            ]}>
                              {day.dayName}
                            </Text>
                            {day.isToday ? (
                              <View style={styles.todayCircle}>
                                <Text style={styles.todayCircleText}>{day.dayNumber}</Text>
                              </View>
                            ) : (
                              <Text style={[
                                styles.dayNumber,
                                day.isPast && styles.dayNumberPast,
                                isFuture   && styles.dayNumberFuture,
                              ]}>
                                {day.dayNumber}
                              </Text>
                            )}
                            <View style={styles.dayMarkerRow}>
                              {isCached && (
                                <View style={[styles.dayMarker, styles.dayMarkerCached]}>
                                  <Feather name="cloud" size={8} color="#7C3AED" />
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>

                          {hoursToShow.map(hour => {
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
                      );
                    })}

                    {/* Future nav column */}
                    <TouchableOpacity
                      style={[styles.futureNavColumn, loadingExtended && styles.cornerButtonDisabled]}
                      onPress={loadingExtended ? undefined : handleLoadFutureDays}
                      activeOpacity={loadingExtended ? 1 : 0.75}
                    >
                      <View style={styles.cornerButton}>
                        {loadingExtended ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Feather name="skip-forward" size={18} color="#fff" />
                        )}
                      </View>
                      <View style={styles.futureColumnBody} />
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                {clientFilteredTasks.length === 0 && !loadingExtended && (
                  <View style={styles.emptyState}>
                    <Feather name="calendar" size={48} color="#D1D5DB" />
                    <Text style={styles.emptyText}>
                      {clientFilter
                        ? `No hay tareas para ${clientFilter.name}`
                        : 'No tienes tareas programadas'}
                    </Text>
                    <Text style={styles.emptySubtext}>
                      {clientFilter
                        ? 'Prueba quitando el filtro de cliente'
                        : 'Toca el botón + para crear una nueva'}
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* ── List view ── */}
            {viewMode === 'list' && renderListView()}
          </Card>
        </ScrollView>

        {/* Client filter modal */}
        <SelectionModal
          visible={showClientFilterModal}
          title="Filtrar por Cliente"
          data={ownClients}
          onSelect={(client) => {
            setClientFilter(client);
            setShowClientFilterModal(false);
          }}
          onClose={() => setShowClientFilterModal(false)}
          selectedIds={clientFilter ? [clientFilter.id] : []}
        />

        {/* Modals */}
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
          isHistorical={selectedTask ? extendedTaskIds.has(selectedTask.id) : false}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={handleTaskUpdated}
          onNavigateToLeads={onNavigateToLeads}
        />
        <CreateTaskModal
          visible={isCreateModalVisible}
          userData={userData}
          projectId={projectId}
          onClose={() => setCreateModal(false)}
          onCreated={handleTaskCreated}
        />
    </ScreenLayout>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollView:    { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 80, paddingBottom: 140 },
  mainCard:      { marginBottom: 16 },

  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  statItem:    { flex: 1, alignItems: 'center' },
  statValue:   { fontSize: 24, fontWeight: '700', color: '#64c27b' },
  statLabel:   { fontSize: 11, color: '#6B7280', marginTop: 2, textTransform: 'uppercase', fontWeight: '600' },
  statDivider: { width: 1, height: 32, backgroundColor: '#E5E7EB' },

  // ── ActionBar ────────────────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 8,
  },
  viewToggleGroup: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 3,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  viewToggleBtnActive: {
    backgroundColor: '#64c27b',
    shadowColor: '#64c27b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  viewToggleBtnTxt:       { fontSize: 13, fontWeight: '600', color: '#9CA3AF' },
  viewToggleBtnTxtActive: { color: '#fff' },

  // ── Client filter button ──────────────────────────────────────────────────────
  clientFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxWidth: 140,
    flex: 1,
  },
  clientFilterBtnActive: {
    backgroundColor: '#64c27b',
    borderColor: '#64c27b',
  },
  clientFilterBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    flex: 1,
  },
  clientFilterBtnTxtActive: { color: '#fff' },

  // ── Calendar month indicator badge ────────────────────────────────────────────
  calendarClientBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#64c27b',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 8,
    maxWidth: 120,
  },
  calendarClientBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },

  // ── NUEVO: Botón toggle de horarios completos ─────────────────────────────────
  hoursToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hoursToggleBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },

  // ── Calendar ──────────────────────────────────────────────────────────────────
  zoomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  zoomButton: { padding: 8 },
  zoomText:   { fontSize: 13, fontWeight: '600', color: '#6B7280', minWidth: 50, textAlign: 'center' },
  monthIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  monthIndicatorText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    textTransform: 'capitalize',
  },
  calendarScroll: { flex: 1 },
  calendar:       { flexDirection: 'row' },
  hoursColumn:    { width: 60 },
  cornerButton: {
    height: 72, width: 60,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 3, borderBottomColor: '#22C55E',
  },
  cornerButtonDisabled: { opacity: 0.5 },
  futureNavColumn: { width: 60, overflow: 'hidden' },
  futureColumnBody: { flex: 1, backgroundColor: 'rgba(59, 130, 246, 0.04)' },
  headerCell: {
    height: 72, justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: '#E6E9EF', backgroundColor: '#fcf8f4ff',
    paddingVertical: 4,
  },
  headerPast:         { backgroundColor: '#F3F4F6' },
  headerFuture:       { backgroundColor: '#EFF6FF' },
  headerToday:        { backgroundColor: '#DCFCE7', borderBottomColor: '#22C55E', borderBottomWidth: 3 },
  headerOutOfProject: { backgroundColor: '#F3F0FF', borderBottomColor: '#C4B5FD' },
  dayName:        { fontSize: 10, textTransform: 'uppercase', fontWeight: '700', letterSpacing: 0.4 },
  dayNamePast:    { color: '#9CA3AF' },
  dayNameFuture:  { color: '#60A5FA' },
  dayNameToday:   { color: '#15803D', fontSize: 11 },
  dayNumber:        { fontSize: 18, fontWeight: '700', marginTop: 1 },
  dayNumberPast:    { color: '#9CA3AF' },
  dayNumberFuture:  { color: '#3B82F6' },
  todayCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', marginTop: 2,
    shadowColor: '#22C55E', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5, shadowRadius: 4, elevation: 4,
  },
  todayCircleText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  dayMarkerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 3, marginTop: 3, height: 14,
  },
  dayMarker:       { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  dayMarkerCached: { backgroundColor: '#EDE9FE' },
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

  // ── Day modal ────────────────────────────────────────────────────────────────
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
  dayModalTitle:    { fontSize: 16, fontWeight: '700', color: '#111827', textTransform: 'capitalize' },
  dayTaskItem:      { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  dayTaskTime:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayTaskTimeText:  { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  dayTaskTitle:     { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827' },
  dayTaskTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  dayTaskClient:    { fontSize: 12, color: '#9CA3AF', marginRight: 8 },
  dayTaskSeparator: { height: 1, backgroundColor: '#F3F4F6' },
  emptyDayTasks:    { alignItems: 'center', justifyContent: 'center', paddingVertical: 40 },
  emptyDayTasksText:{ fontSize: 14, color: '#9CA3AF', marginTop: 12 },

  // ── List View ────────────────────────────────────────────────────────────────
  listViewContainer: {},
  listStateSection: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 10,
  },
  listStateScroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 10,
  },
  listStateCard: {
    width: 100,
    minHeight: 82,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderTopWidth: 3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'relative',
  },
  listStateCardActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  listStateCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  listStateIndicator: { width: 7, height: 7, borderRadius: 4 },
  listStateCardCount: { fontSize: 22, fontWeight: '800' },
  listStateCardName:  { fontSize: 11, fontWeight: '600', color: '#6B7280', lineHeight: 15 },
  listStateArrow: {
    position: 'absolute',
    bottom: -10,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  listStateSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  listStateSummaryText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  listClearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  listClearAllTxt: { fontSize: 11, fontWeight: '600', color: '#EF4444' },

  listFilterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  listFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listFilterChipActive:    { backgroundColor: '#64c27b', borderColor: '#64c27b' },
  listFilterChipTxt:       { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  listFilterChipTxtActive: { color: '#fff' },

  listSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 4,
    marginTop: 2,
    backgroundColor: '#F9FAFB',
    borderWidth: 1.5,
    borderColor: '#64c27b',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  listSearchInput: { flex: 1, fontSize: 14, color: '#111827' },

  listPagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  listActiveStatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  listActiveStateDot: { width: 8, height: 8, borderRadius: 4 },
  listActiveStateTxt: { fontSize: 12, fontWeight: '600', color: '#374151' },
  listPagCount:       { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },

  listItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    minHeight: 72,
  },
  listItemDone:   { opacity: 0.65 },
  listItemStripe: { width: 3, borderRadius: 0 },
  listItemBody: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
  },
  listItemTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  listItemTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 },
  listItemTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  listHistBadge: { backgroundColor: '#FEF3C7', borderRadius: 4, padding: 3, marginTop: 2 },
  listItemMeta:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  listMetaChip:  { flexDirection: 'row', alignItems: 'center', gap: 3 },
  listMetaText:  { fontSize: 11, color: '#9CA3AF', maxWidth: 110 },
  listMetaOverdue: { color: '#EF4444', fontWeight: '600' },
  listTagsRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  listTag: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  listTagText: { fontSize: 10, fontWeight: '600', color: '#15803d' },
  listTagMore: { fontSize: 10, color: '#9CA3AF', alignSelf: 'center', marginLeft: 2 },
  listItemStateIcon: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: '#F3F4F6',
  },

  stateGroup: { marginBottom: 2 },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: '#FAFAFA',
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  groupHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupDot:        { width: 8, height: 8, borderRadius: 4 },
  groupHeaderLabel: {
    fontSize: 13, fontWeight: '700', color: '#374151',
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  groupCountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  groupCountText:  { fontSize: 12, fontWeight: '700' },

  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  loadMoreBtnTxt:   { fontSize: 14, fontWeight: '600', color: '#64c27b' },
  loadMoreBtnCount: { fontSize: 12, color: '#9CA3AF' },

  groupLoadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderTopColor: '#BBF7D0',
  },
  groupLoadMoreTxt: { fontSize: 13, fontWeight: '600', color: '#15803d' },

  listEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  listEmptyTitle:    { fontSize: 16, fontWeight: '700', color: '#6B7280', marginTop: 16 },
  listEmptySubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 6, textAlign: 'center', lineHeight: 19 },
});