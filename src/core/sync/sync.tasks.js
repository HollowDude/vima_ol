import OdooService from '../api/odoo.service';
import StorageService from '../storage/storage.service';
import { STORAGE_KEYS } from './sync.constants';
import * as Session from './sync.session';
import * as Master from './sync.masterdata';
import * as Pending from './sync.pending';

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
      return { subtasks: [] }; // Retorno seguro
    }

    const projectId = latestProject.id;
    
    // --- LÓGICA DE DOMINIO DINÁMICO ---
    let projectDomainFilter;
    console.log(`📆📆📆📆📆 (ID: ${projectId}) junto con el nuevo: ${extraProjectId}`);
    if (extraProjectId && extraProjectId !== projectId) {
        // Calcula la fecha de corte el día 25 del mes actual
        const now = new Date();
        // Forzar el día 25 del mes/año actual
        const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 25);
        // Formato YYYY-MM-DD
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

    const tasksDomain = [
        '&',
        ...projectDomainFilter, // Expando el filtro del proyecto
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
      ],
      1000
    );

    await StorageService.setItem(STORAGE_KEYS.TASKS, tasks);

    return { subtasks: tasks };
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
        'state', 'finish_date', 'survey_id', 'task_survey_ids', 'start_date'
      ],
      1000
    );


    await StorageService.setItem(STORAGE_KEYS.TASKS, tasks);
    return tasks;
  } catch (error) {
    console.error('❌ Error sincronizando tareas (syncAllTasks):', error);
    throw error;
  }
}

export async function getAllVisibleTasks() {
  try {
    const localTasks = await StorageService.getItem(STORAGE_KEYS.TASKS) || [];
    const project = await Master.getMasterData('current_project');
    return {
      tasks: localTasks,
      projectId: project ? project.id : null,
    };
  } catch (error) {
    console.error(' Error obteniendo tareas visibles:', error);
    return { tasks: [], projectFinishDate: null, projectId: null };
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
    let found = false;
    const updatedTasks = tasks.map(t => {
      if (t.id === taskId) {
        found = true;
        return {
          ...t,
          ...updates,
          write_date: new Date().toISOString(),
        };
      }
      return t;
    });

    if (!found) {
      throw new Error(`Tarea con id ${taskId} no encontrada localmente`);
    }

    await StorageService.setItem(STORAGE_KEYS.TASKS, updatedTasks);

    if (!opts.noPending) {
      await Pending.addPendingChange('project.task', taskId, updates);
    }

    return updatedTasks.find(t => t.id === taskId);
  } catch (error) {
    console.error('❌ Error actualizando tarea localmente:', error);
    throw error;
  }
}