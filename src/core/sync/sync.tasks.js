import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as Session from './sync.session';
import * as Master from './sync.masterdata';
import * as Pending from './sync.pending';
import { clientHasGeolocation } from '../utils/clientGeoHelper';
import { getClientById } from './sync.clients';
import { diffAndMerge, applyIncrementalDelta } from './sync.diff';

async function assertClientGeolocation(task) {
  const partnerId = Array.isArray(task.partner_id) ? task.partner_id[0] : task.partner_id;
  if (!partnerId) return;
  const client = await getClientById(partnerId);
  if (!clientHasGeolocation(client)) {
    const err = new Error('El cliente no tiene geolocalización registrada.');
    err.code = 'CLIENT_NO_GEOLOCATION';
    err.clientId = partnerId;
    throw err;
  }
}

export async function syncTasks(extraProjectId = null) {
  try {
    const currentUserId = OdooService.uid;
    const current_user = await Session.getCurrentUser();
    const current_user_id = current_user && current_user[0] && current_user[0].partner_id
      ? current_user[0].partner_id[0]
      : null;

    const latestProject = await Master.getMasterData('current_project');

    if (!latestProject) {
      await StorageService.setItem(STORAGE_KEYS.TASKS, []);
      return { subtasks: [] };
    }

    const projectId = latestProject.id;

    let projectDomainFilter;
    console.log(`📆📆📆📆📆 (ID: ${projectId}) junto con el nuevo: ${extraProjectId}`);
    if (extraProjectId && extraProjectId !== projectId) {
        const now = new Date();
        const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 25);
        const cutoffString = cutoffDate.toISOString().split('T')[0];

        console.log(`📆 Filtro Mixto: Proyecto Actual (${projectId}) O [Proyecto Viejo (${extraProjectId}) Y Deadline >= ${cutoffString}]`);

        projectDomainFilter = [
            '|',
            ['project_id', '=', projectId],
            '&',
                ['project_id', '=', extraProjectId],
                ['date_deadline', '>=', cutoffString]
        ];
    } else {
        projectDomainFilter = [['project_id', '=', projectId]];
    }

    const syncStartedAt = new Date(Date.now() - 10_000).toISOString();
    const lastSync = await StorageService.getItem(STORAGE_KEYS.LAST_SYNC_TASKS);
    const isIncremental = !!lastSync;

    const tasksDomain = isIncremental
      ? [
          '&',
          ...projectDomainFilter,
          '&',
          '|', ['active', '=', true], ['active', '=', false],
          '&',
          '|',
            ['user_ids', 'in', [currentUserId]],
            ['partner_id', '=', current_user_id],
          ['write_date', '>', lastSync]
        ]
      : [
          '&',
          ...projectDomainFilter,
          '&',
              ['active', '=', true],
              '|',
                  ['user_ids', 'in', [currentUserId]],
                  ['partner_id', '=', current_user_id]
      ];

    const tasks = await OdooService.searchRead(
      'project.task',
      tasksDomain,
      [
        'id', 'display_name', 'name', 'project_id', 'user_ids',
        'parent_id', 'child_ids', 'date_deadline', 'stage_id',
        'description', 'partner_id', 'priority_level', 'management_tags',
        'state', 'finish_date', 'survey_id', 'task_survey_ids', 'start_date',
        'write_date',
      ],
      1000
    );

    const previous = (await StorageService.getItem(STORAGE_KEYS.TASKS)) || [];
    const pending = (await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)) || [];
    const protectedIds = new Set(pending.filter(p => p.model === 'project.task').map(p => p.recordId));

    const { merged, stats } = isIncremental
      ? applyIncrementalDelta(previous, tasks, protectedIds)
      : diffAndMerge(previous, tasks, protectedIds);

    await StorageService.setItem(STORAGE_KEYS.TASKS, merged);
    await StorageService.setItem(STORAGE_KEYS.LAST_SYNC_TASKS, syncStartedAt);

    return { subtasks: merged, stats };
  } catch (error) {
    console.error('❌ Error sincronizando tareas:', error);
    throw error;
  }
}

export async function syncAllTasks(userId) {
  try {
    const current_user = await Session.getCurrentUser();
    const current_user_id = current_user && current_user[0] && current_user[0].partner_id
      ? current_user[0].partner_id[0]
      : null;

    try {
      await Pending.syncPendingChangesNonSurvey();
    } catch (e) {
    }

    const project = await Master.getMasterData('current_project');

    if (!project) {
      await StorageService.setItem(STORAGE_KEYS.TASKS, []);
      return [];
    }

    const projectId = project.id;

    const tasksDomain = [
      ['project_id', '=', projectId],
      ['active', '=', true],
      '|',
      ['user_ids', 'in', [userId]],
      ['partner_id', '=', current_user_id],
    ];

    const tasks = await OdooService.searchRead(
      'project.task',
      tasksDomain,
      [
        'id', 'display_name',
        'name', 'project_id', 'user_ids',
        'parent_id', 'child_ids', 'date_deadline', 'stage_id',
        'description', 'partner_id', 'priority_level', 'management_tags',
        'state', 'finish_date', 'survey_id', 'task_survey_ids', 'start_date',
        'write_date',
      ],
      1000
    );

    const previous = (await StorageService.getItem(STORAGE_KEYS.TASKS)) || [];
    const pending = (await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)) || [];
    const protectedIds = new Set(pending.filter(p => p.model === 'project.task').map(p => p.recordId));
    const { merged } = diffAndMerge(previous, tasks, protectedIds);

    await StorageService.setItem(STORAGE_KEYS.TASKS, merged);
    return merged;
  } catch (error) {
    console.error('❌ Error sincronizando tareas (syncAllTasks):', error);
    throw error;
  }
}

export async function getAllVisibleTasks() {
  try {
    const localTasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    const project    = await Master.getMasterData('current_project');
    return {
      tasks:             localTasks,
      projectId:         project ? project.id : null,
      // ✅ FIX: exponer la fecha real de fin del proyecto (campo 'date' de Odoo)
      // Puede ser null si el proyecto no tiene fecha de fin configurada.
      projectFinishDate: project?.date || null,
    };
  } catch (error) {
    console.error(' Error obteniendo tareas visibles:', error);
    return { tasks: [], projectId: null, projectFinishDate: null };
  }
}
export async function purgeExtendedTasksWithIds(ids) {
  try {
    if (!ids || ids.length === 0) return;
    
    const { stored } = await _readCache();
    const idsSet = new Set(ids);
    
    stored.batches = stored.batches.map(b => ({
      ...b,
      tasks: b.tasks.filter(t => !idsSet.has(t.id))
    })).filter(b => b.tasks.length > 0);
    
    await StorageService.setItem(STORAGE_KEYS.EXTENDED_TASKS, stored);
    console.log(`[ExtTasks] ${ids.length} tareas purgadas de caché extendida`);
  } catch (error) {
    console.error('[ExtTasks] Error purgando tareas:', error);
  }
}

export async function replaceLocalTaskId(tempId, realId) {
  try {
    const tasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    const updatedTasks = tasks.map(t => (t.id === tempId ? { ...t, id: realId } : t));
    await StorageService.setItem(STORAGE_KEYS.TASKS, updatedTasks);

    const pending = await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES) || [];
    const updatedPending = pending.map(p => {
      if (p.model === 'project.task' && p.recordId === tempId) {
        return { ...p, recordId: realId };
      }
      return p;
    });
    await StorageService.setItem(STORAGE_KEYS.PENDING_CHANGES, updatedPending);

  } catch (error) {
    console.error('❌ Error reemplazando ID de tarea local:', error);
  }
}

export async function createTaskLocally(taskData = {}) {
  try {
    const tempId = -Math.floor(Math.random() * 1000000);
    const nowIso = new Date().toISOString();

    const task = {
      id: tempId,
      ...taskData,
      create_date: nowIso,
      write_date: nowIso,
    };

    const tasks = (await StorageService.getItem(STORAGE_KEYS.TASKS)) || [];
    tasks.push(task);
    await StorageService.setItem(STORAGE_KEYS.TASKS, tasks);

    await Pending.addPendingChange('project.task', tempId, {
      ...taskData,
      _is_creation: true,
    });

    return task;
  } catch (error) {
    console.error('❌ Error creando tarea localmente:', error);
    throw error;
  }
}

export async function updateTaskLocally(taskId, updates = {}, opts = {}) {
  try {
    const tasks = (await StorageService.getItem(STORAGE_KEYS.TASKS)) || [];
    const existingTask = tasks.find(t => t.id === taskId);
    if (!opts.skipGeoCheck) {
      if (existingTask) {
        await assertClientGeolocation(existingTask);
      } else {
        const extended = await getExtendedTasks();
        const extTask = extended.find(t => t.id === taskId);
        if (extTask) await assertClientGeolocation(extTask);
      }
    }
    let found = false;
    const updatedTasks = tasks.map(t => {
      if (t.id !== taskId) return t;
      found = true;
      return { ...t, ...updates, write_date: new Date().toISOString() };
    });

    if (found) {
      await StorageService.setItem(STORAGE_KEYS.TASKS, updatedTasks);
      if (!opts.noPending) await Pending.addPendingChange('project.task', taskId, updates);
      return updatedTasks.find(t => t.id === taskId);
    }

    const updatedExtended = await updateExtendedTaskLocally(taskId, updates);
    if (updatedExtended) {
      if (!opts.noPending) await Pending.addPendingChange('project.task', taskId, updates);
      return updatedExtended;
    }

    throw new Error(`Tarea con id ${taskId} no encontrada localmente`);
  } catch (error) {
    console.error('❌ Error actualizando tarea localmente:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TAREAS EXTENDIDAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TTL de la caché de tareas extendidas.
 * • Desarrollo  → 1 minuto  (para poder probar la expiración rápidamente)
 * • Producción  → 24 horas
 */
export const EXTENDED_TASKS_TTL_MS = 24 * 60 * 60 * 1000;  // 24 * 60 * 60 * 1000 - 24 h   — producción

async function _readCache() {
  const stored  = (await StorageService.getItem(STORAGE_KEYS.EXTENDED_TASKS)) || { batches: [] };
  const pending = (await StorageService.getItem(STORAGE_KEYS.PENDING_CHANGES)) || [];
  const pendingTaskIds = new Set(
    pending.filter(p => p.model === 'project.task').map(p => p.recordId)
  );
  return { stored, pendingTaskIds };
}

function _filterExpiredBatches(batches, pendingTaskIds) {
  const now = new Date();
  return batches.filter(b => {
    if (new Date(b.expiresAt) > now) return true;
    return b.tasks.some(t => pendingTaskIds.has(t.id));
  });
}

export async function fetchAndCacheTasksForRange(fromDateStr, toDateStr) {
  const currentUserId = OdooService.uid;
  if (!currentUserId) throw new Error('Usuario no autenticado');

  const current_user = await Session.getCurrentUser();
  const current_user_partner_id = current_user?.[0]?.partner_id?.[0] ?? null;

  const { stored, pendingTaskIds } = await _readCache();
  stored.batches = _filterExpiredBatches(stored.batches, pendingTaskIds);

  const coveringBatch = stored.batches.find(b => b.fromDate <= fromDateStr && b.toDate >= toDateStr);
  if (coveringBatch) {
    console.log(`[ExtTasks] Cache hit: ${fromDateStr} → ${toDateStr}`);
    return coveringBatch.tasks;
  }

  console.log(`[ExtTasks] Fetching ${fromDateStr} → ${toDateStr} desde Odoo...`);

  const domain = [
    '&', ['date_deadline', '>=', `${fromDateStr} 00:00:00`],
    '&', ['date_deadline', '<=', `${toDateStr} 23:59:59`],
    '&', ['active', '=', true],
    '|', ['user_ids', 'in', [currentUserId]],
         ['partner_id', '=', current_user_partner_id],
  ];

  const tasks = await OdooService.searchRead('project.task', domain, [
    'id', 'display_name', 'name', 'project_id', 'user_ids', 'parent_id', 'child_ids',
    'date_deadline', 'stage_id', 'description', 'partner_id', 'priority_level',
    'management_tags', 'state', 'finish_date', 'survey_id', 'task_survey_ids', 'start_date',
  ], 1000);

  console.log(`[ExtTasks] ${tasks.length} tareas para ${fromDateStr} → ${toDateStr}`);

  const expiresAt = new Date(Date.now() + EXTENDED_TASKS_TTL_MS).toISOString();
  stored.batches.push({ fromDate: fromDateStr, toDate: toDateStr, tasks, expiresAt });
  await StorageService.setItem(STORAGE_KEYS.EXTENDED_TASKS, stored);
  return tasks;
}

export async function getExtendedTasks() {
  try {
    const { stored, pendingTaskIds } = await _readCache();
    const valid = _filterExpiredBatches(stored.batches, pendingTaskIds);
    if (valid.length !== stored.batches.length)
      await StorageService.setItem(STORAGE_KEYS.EXTENDED_TASKS, { batches: valid });
    const all = valid.flatMap(b => b.tasks);
    return Array.from(new Map(all.map(t => [t.id, t])).values());
  } catch { return []; }
}

export async function cleanExpiredExtendedTasks() {
  try {
    const { stored, pendingTaskIds } = await _readCache();
    const before = stored.batches.length;
    const valid  = _filterExpiredBatches(stored.batches, pendingTaskIds);
    await StorageService.setItem(STORAGE_KEYS.EXTENDED_TASKS, { batches: valid });
    console.log(`[ExtTasks] ${before - valid.length} batch(es) expirado(s) eliminado(s)`);
  } catch {}
}

export async function touchBatchForTask(taskId) {
  try {
    const { stored } = await _readCache();
    let touched = false;
    stored.batches = stored.batches.map(b => {
      if (!b.tasks.some(t => t.id === taskId)) return b;
      touched = true;
      const expiresAt = new Date(Math.max(
        new Date(b.expiresAt).getTime(),
        Date.now() + EXTENDED_TASKS_TTL_MS
      )).toISOString();
      return { ...b, expiresAt };
    });
    if (touched) await StorageService.setItem(STORAGE_KEYS.EXTENDED_TASKS, stored);
    return touched;
  } catch { return false; }
}

export async function updateExtendedTaskLocally(taskId, updates) {
  try {
    const { stored } = await _readCache();
    let updatedTask = null;
    stored.batches = stored.batches.map(b => {
      const idx = b.tasks.findIndex(t => t.id === taskId);
      if (idx === -1) return b;
      const newTask  = { ...b.tasks[idx], ...updates, write_date: new Date().toISOString() };
      updatedTask    = newTask;
      const newTasks = [...b.tasks];
      newTasks[idx]  = newTask;
      return { ...b, tasks: newTasks };
    });
    if (updatedTask) {
      await StorageService.setItem(STORAGE_KEYS.EXTENDED_TASKS, stored);
      await touchBatchForTask(taskId);
    }
    return updatedTask;
  } catch { return null; }
}